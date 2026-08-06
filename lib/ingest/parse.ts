/**
 * Turning a request body into a plain field map, whichever way the static
 * site chose to submit.
 */

export type IngestMode = "json" | "browser";

export type ParsedBody = {
  fields: Record<string, string | string[]>;
  files: ParsedFile[];
};

export type ParsedFile = {
  fieldName: string;
  fileName: string;
  mimeType: string;
  size: number;
  data: Buffer;
};

/**
 * Control fields are consumed by FormHub and never stored as submission data.
 * Anything with a leading underscore is reserved.
 */
export const TURNSTILE_FIELD = "cf-turnstile-response";

export function isControlField(name: string): boolean {
  return name.startsWith("_") || name === TURNSTILE_FIELD;
}

export function detectMode(request: Request): IngestMode {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return "json";
  const accept = request.headers.get("accept") ?? "";
  // An XHR that posts urlencoded but wants JSON back still gets JSON.
  if (accept.includes("application/json")) return "json";
  return "browser";
}

function pushField(
  target: Record<string, string | string[]>,
  key: string,
  value: string,
): void {
  const existing = target[key];
  if (existing === undefined) {
    target[key] = value;
  } else if (Array.isArray(existing)) {
    existing.push(value);
  } else {
    // Repeated keys (checkbox groups) collapse into an array.
    target[key] = [existing, value];
  }
}

export class BodyParseError extends Error {}

export async function parseBody(
  request: Request,
  opts: { allowFiles: boolean },
): Promise<ParsedBody> {
  const contentType = request.headers.get("content-type") ?? "";
  const fields: Record<string, string | string[]> = {};
  const files: ParsedFile[] = [];

  if (contentType.includes("application/json")) {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      throw new BodyParseError("Malformed JSON body");
    }
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new BodyParseError("JSON body must be an object");
    }
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (value === null || value === undefined) continue;
      if (Array.isArray(value)) {
        fields[key] = value.map((v) => String(v));
      } else if (typeof value === "object") {
        // Nested objects are flattened to JSON so nothing is silently dropped.
        fields[key] = JSON.stringify(value);
      } else {
        fields[key] = String(value);
      }
    }
    return { fields, files };
  }

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new BodyParseError("Malformed multipart body");
    }
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") {
        pushField(fields, key, value);
        continue;
      }
      // A File part. Size limits are enforced by validateFiles() so the
      // caller gets a 413 rather than a generic 400; the absolute
      // Content-Length guard in the route already bounds memory here.
      if (!opts.allowFiles) continue;
      if (value.size === 0 && !value.name) continue;
      files.push({
        fieldName: key,
        fileName: value.name || "upload",
        mimeType: value.type || "application/octet-stream",
        size: value.size,
        data: Buffer.from(await value.arrayBuffer()),
      });
    }
    return { fields, files };
  }

  // Default: application/x-www-form-urlencoded
  let text: string;
  try {
    text = await request.text();
  } catch {
    throw new BodyParseError("Could not read request body");
  }
  const params = new URLSearchParams(text);
  for (const [key, value] of params.entries()) {
    pushField(fields, key, value);
  }
  return { fields, files };
}

/** Best-effort extraction of the submitter's email, for Reply-To and search. */
export function extractSubmitterEmail(
  fields: Record<string, string | string[]>,
): string | null {
  const preferred = ["email", "e-mail", "emailaddress", "email_address", "from"];
  const entries = Object.entries(fields);

  const byName = entries.find(([key]) =>
    preferred.includes(key.toLowerCase().replace(/[\s-]/g, "")),
  );
  const candidate =
    byName?.[1] ??
    entries.find(([, v]) => typeof v === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v))?.[1];

  const value = Array.isArray(candidate) ? candidate[0] : candidate;
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed) ? trimmed : null;
}

/** First meaningful line of the submission, for list views. */
export function buildSubjectPreview(
  fields: Record<string, string | string[]>,
): string | null {
  const preferred = ["subject", "message", "enquiry", "comments", "name"];
  for (const key of preferred) {
    const found = Object.entries(fields).find(
      ([k]) => k.toLowerCase().replace(/[\s-_]/g, "") === key,
    );
    const value = found?.[1];
    const text = Array.isArray(value) ? value[0] : value;
    if (typeof text === "string" && text.trim()) {
      return text.trim().slice(0, 160);
    }
  }
  const first = Object.values(fields).find(
    (v) => typeof v === "string" && v.trim(),
  );
  return typeof first === "string" ? first.trim().slice(0, 160) : null;
}
