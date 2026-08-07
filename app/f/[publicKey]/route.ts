import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { checkRateLimit } from "@/lib/ratelimit";
import { verifyTurnstile } from "@/lib/turnstile";
import { corsHeaders, originAllowed, toOrigin } from "@/lib/ingest/cors";
import {
  BodyParseError,
  buildSubjectPreview,
  detectMode,
  extractSubmitterEmail,
  parseBody,
  TURNSTILE_FIELD,
  type IngestMode,
} from "@/lib/ingest/parse";
import { buildDedupeKey, evaluateSpam, sanitizeFields } from "@/lib/ingest/spam";
import {
  storeFiles,
  validateFiles,
  type UploadOutcome,
} from "@/lib/ingest/uploads";
import { enqueueSubmissionJobs } from "@/lib/delivery/enqueue";
import { kickDelivery } from "@/lib/delivery/kick";

/**
 * The ingest endpoint: POST /f/{publicKey}
 *
 * Durability contract — nothing that can fail slowly (SMTP, webhooks) happens
 * before the response. The only work on the critical path is one indexed read,
 * the spam checks, and a single transaction that writes the submission
 * together with its delivery jobs. That commit IS the acknowledgement; if the
 * caller gets a success response, the submission is on disk.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Guards the body read itself. Per-form limits are applied after the lookup.
const ABSOLUTE_MAX_BODY_BYTES = 4_500_000; // Vercel's serverless request cap

const RATE_LIMIT_PER_IP = { limit: 10, windowSeconds: 60 };
const RATE_LIMIT_PER_FORM = { limit: 300, windowSeconds: 60 };

type FailureReason =
  | "not_found"
  | "form_paused"
  | "origin_rejected"
  | "rate_limited"
  | "payload_too_large"
  | "bad_request"
  | "captcha_failed"
  | "server_error";

const STATUS_FOR: Record<FailureReason, number> = {
  not_found: 404,
  form_paused: 404,
  origin_rejected: 403,
  rate_limited: 429,
  payload_too_large: 413,
  bad_request: 400,
  captcha_failed: 403,
  server_error: 500,
};

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function appendQuery(url: string, params: Record<string, string>): string {
  try {
    const target = new URL(url);
    for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
    return target.toString();
  } catch {
    return url;
  }
}

function successResponse(
  mode: IngestMode,
  submissionId: string,
  redirectUrl: string | null,
  headers: Headers,
): Response {
  if (mode === "browser" && redirectUrl) {
    const location = appendQuery(redirectUrl, { fh: "ok" });
    return new Response(null, {
      status: 303,
      headers: { ...Object.fromEntries(headers), Location: location },
    });
  }
  if (mode === "browser") {
    // No redirect configured — return a minimal readable page rather than JSON.
    return new Response(
      "<!doctype html><meta charset=utf-8><title>Thanks</title><p>Thanks — your message has been received.</p>",
      { status: 200, headers: { ...Object.fromEntries(headers), "Content-Type": "text/html; charset=utf-8" } },
    );
  }
  return Response.json(
    { ok: true, id: submissionId },
    { status: 200, headers },
  );
}

function failureResponse(
  mode: IngestMode,
  reason: FailureReason,
  message: string,
  redirectErrorUrl: string | null,
  headers: Headers,
  extraHeaders?: Record<string, string>,
): Response {
  const merged = { ...Object.fromEntries(headers), ...extraHeaders };
  if (mode === "browser" && redirectErrorUrl) {
    const location = appendQuery(redirectErrorUrl, { fh: "err", reason });
    return new Response(null, {
      status: 303,
      headers: { ...merged, Location: location },
    });
  }
  return Response.json(
    { ok: false, error: reason, message },
    { status: STATUS_FOR[reason], headers: merged },
  );
}

async function loadForm(publicKey: string) {
  return prisma.form.findUnique({
    where: { publicKey },
    include: {
      site: { select: { id: true, domains: true, status: true } },
      agency: { select: { id: true, status: true } },
      recipients: { where: { enabled: true } },
    },
  });
}

/**
 * Webhooks that apply to this form: the ones targeting it directly, plus the
 * agency-wide ones (formId null). Deliberately NOT part of loadForm — it only
 * runs for submissions that are actually going to be delivered, so spam and
 * rejected requests never pay for it.
 */
async function loadWebhooks(agencyId: string, formId: string) {
  return prisma.webhookEndpoint.findMany({
    where: {
      agencyId,
      enabled: true,
      OR: [{ formId }, { formId: null }],
    },
    select: { id: true, url: true },
  });
}

export async function OPTIONS(
  request: Request,
  ctx: RouteContext<"/f/[publicKey]">,
) {
  const { publicKey } = await ctx.params;
  const origin = toOrigin(request.headers.get("origin"));
  const form = await loadForm(publicKey);

  // Unknown form, or an origin the site hasn't registered: no CORS headers,
  // so the browser blocks the real request.
  if (!form || !origin || !originAllowed(origin, form.site.domains)) {
    return new Response(null, { status: 204 });
  }
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/f/[publicKey]">,
) {
  const { publicKey } = await ctx.params;
  const mode = detectMode(request);
  const origin = toOrigin(request.headers.get("origin"));
  // No CORS headers until we know the origin is registered on this site.
  let headers = new Headers();

  try {
    // 1. Reject oversized bodies before reading a single byte of them.
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > ABSOLUTE_MAX_BODY_BYTES) {
      return failureResponse(mode, "payload_too_large", "Request body too large", null, headers);
    }

    // 2. One indexed lookup.
    const form = await loadForm(publicKey);
    if (!form) {
      return failureResponse(mode, "not_found", "Unknown form", null, headers);
    }
    if (
      form.status !== "ACTIVE" ||
      form.site.status !== "ACTIVE" ||
      form.agency.status !== "ACTIVE"
    ) {
      return failureResponse(mode, "form_paused", "This form is not accepting submissions", form.redirectErrorUrl, headers);
    }

    if (origin && originAllowed(origin, form.site.domains)) {
      headers = corsHeaders(origin);
    }

    // 3. Origin / Referer validation.
    if (form.requireOriginMatch) {
      if (mode === "json") {
        // A browser always sends Origin on a cross-origin fetch, so a missing
        // one here is not a legitimate case.
        if (!origin || !originAllowed(origin, form.site.domains)) {
          return failureResponse(mode, "origin_rejected", "Origin not allowed for this form", form.redirectErrorUrl, headers);
        }
      } else {
        // Native form POST: Referer is advisory. A missing header is common
        // (privacy settings, referrer-policy) and must not block a real
        // enquiry — but a *mismatched* one is a genuine signal.
        const referer = toOrigin(request.headers.get("referer"));
        const claimed = origin ?? referer;
        if (claimed && !originAllowed(claimed, form.site.domains)) {
          return failureResponse(mode, "origin_rejected", "Origin not allowed for this form", form.redirectErrorUrl, headers);
        }
      }
    }

    // 4. Rate limits: per IP+form first, then the form as a whole.
    const ip = clientIp(request);
    const perIp = await checkRateLimit(
      `ip:${ip}:form:${form.id}`,
      RATE_LIMIT_PER_IP.limit,
      RATE_LIMIT_PER_IP.windowSeconds,
    );
    if (!perIp.ok) {
      return failureResponse(mode, "rate_limited", "Too many submissions, please wait", form.redirectErrorUrl, headers, {
        "Retry-After": String(perIp.retryAfter),
      });
    }
    const perForm = await checkRateLimit(
      `form:${form.id}`,
      RATE_LIMIT_PER_FORM.limit,
      RATE_LIMIT_PER_FORM.windowSeconds,
    );
    if (!perForm.ok) {
      return failureResponse(mode, "rate_limited", "This form is receiving too many submissions", form.redirectErrorUrl, headers, {
        "Retry-After": String(perForm.retryAfter),
      });
    }

    // 5. Parse.
    let parsed;
    try {
      parsed = await parseBody(request, { allowFiles: form.uploadsEnabled });
    } catch (error) {
      const message = error instanceof BodyParseError ? error.message : "Could not read submission";
      return failureResponse(mode, "bad_request", message, form.redirectErrorUrl, headers);
    }

    // 6 & 7. Honeypot and timing. These quarantine rather than reject: the
    // caller is told everything went fine (see below).
    const spam = evaluateSpam(parsed.fields, form);

    // 8. Turnstile — the only check that costs a network call, so it runs last.
    // Skipped for quarantined submissions; there's no point paying for it.
    if (form.turnstileEnabled && form.turnstileSecretEnc && !spam.quarantine) {
      const raw = parsed.fields[TURNSTILE_FIELD];
      const token = Array.isArray(raw) ? raw[0] : raw;
      const secret = decryptSecret(form.turnstileSecretEnc);
      const result = await verifyTurnstile(secret, token, ip);
      if (!result.ok) {
        return failureResponse(mode, "captcha_failed", "Captcha verification failed", form.redirectErrorUrl, headers);
      }
    }

    // 9. Strip control fields and enforce payload limits.
    const { data, error: sanitizeError } = sanitizeFields(parsed.fields, form);
    if (sanitizeError) {
      return failureResponse(mode, "bad_request", sanitizeError, form.redirectErrorUrl, headers);
    }
    if (Object.keys(data).length === 0) {
      return failureResponse(mode, "bad_request", "Submission contained no fields", form.redirectErrorUrl, headers);
    }

    // 10. Collapse accidental double-submits.
    const dedupeKey = buildDedupeKey(form.id, data);
    const existing = await prisma.submission.findFirst({
      where: { formId: form.id, dedupeKey },
      select: { id: true },
    });
    if (existing) {
      return successResponse(mode, existing.id, form.redirectUrl, headers);
    }

    // 11. Uploads. These must land before the transaction because the file
    // rows need R2 keys. Spam never gets uploaded — no point paying for it.
    const quarantined = spam.quarantine;
    const submissionId = randomUUID();
    let upload: UploadOutcome = { stored: [], error: null };

    if (parsed.files.length > 0 && !quarantined) {
      const validationError = validateFiles(parsed.files, form);
      if (validationError) {
        return failureResponse(mode, "payload_too_large", validationError, form.redirectErrorUrl, headers);
      }
      upload = await storeFiles(parsed.files, form.agencyId, submissionId);
    }

    // 12. Commit. Submission, its files and its delivery jobs in one
    // transaction: a submission can never exist without the jobs that will
    // notify someone about it.
    const webhooks = quarantined
      ? []
      : await loadWebhooks(form.agencyId, form.id);
    const submission = await prisma.$transaction(async (tx) => {
      const created = await tx.submission.create({
        data: {
          id: submissionId,
          agencyId: form.agencyId,
          formId: form.id,
          siteId: form.siteId,
          data,
          subjectPreview: buildSubjectPreview(data),
          submitterEmail: extractSubmitterEmail(data),
          ip,
          userAgent: request.headers.get("user-agent"),
          origin: origin ?? toOrigin(request.headers.get("referer")),
          status: quarantined ? "SPAM" : "NEW",
          spamReasons: spam.reasons,
          uploadError: upload.error,
          dedupeKey,
        },
      });

      if (upload.stored.length > 0) {
        await tx.submissionFile.createMany({
          data: upload.stored.map((f) => ({
            ...f,
            agencyId: form.agencyId,
            submissionId: created.id,
          })),
        });
      }

      // Spam is stored for review but nobody is emailed about it.
      if (!quarantined) {
        await enqueueSubmissionJobs(tx, {
          submissionId: created.id,
          agencyId: form.agencyId,
          recipients: form.recipients,
          webhooks,
        });
      }

      return created;
    });

    // 12. Respond. Delivery is already durable in the queue.
    // A honeypot hit gets the same response as a real submission — any
    // difference teaches the bot to adapt.
    const response = successResponse(mode, submission.id, form.redirectUrl, headers);

    // Sends the alert now rather than waiting for the scheduler. This is what
    // makes alerts near-instant regardless of how often QStash fires.
    if (!quarantined) {
      kickDelivery({ batchSize: 10, budgetMs: 10_000 });
    }

    return response;
  } catch (error) {
    console.error("[ingest] unhandled error", error);
    return failureResponse(mode, "server_error", "Could not process submission", null, headers);
  }
}
