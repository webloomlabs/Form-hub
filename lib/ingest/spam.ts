import crypto from "node:crypto";
import { isControlField } from "./parse";

/**
 * Spam signals.
 *
 * Two different outcomes, and the difference matters:
 *  - "reject"   -> the request is refused outright (Turnstile failure).
 *  - "quarantine" -> the submission is *stored* as SPAM but the caller is told
 *    it succeeded. Bots must not be able to tell the honeypot caught them,
 *    otherwise they adapt. Humans caught by a false positive still have their
 *    enquiry saved, and the agency can un-spam it.
 */

export type SpamVerdict = {
  quarantine: boolean;
  reasons: string[];
};

export function checkHoneypot(
  fields: Record<string, string | string[]>,
  honeypotField: string,
): boolean {
  const value = fields[honeypotField];
  if (value === undefined) return false;
  const text = Array.isArray(value) ? value.join("") : value;
  return text.trim().length > 0;
}

/**
 * `_t` carries the epoch-ms the form was rendered. A submission that arrives
 * faster than a human could type is almost certainly automated.
 * A missing or unparseable `_t` is not held against the submitter — plenty of
 * legitimate integrations won't include it.
 */
export function checkTiming(
  fields: Record<string, string | string[]>,
  minSeconds: number,
): boolean {
  if (minSeconds <= 0) return false;
  const raw = fields._t;
  const text = Array.isArray(raw) ? raw[0] : raw;
  if (!text) return false;
  const rendered = Number(text);
  if (!Number.isFinite(rendered) || rendered <= 0) return false;
  const elapsedSeconds = (Date.now() - rendered) / 1000;
  // A negative elapsed time means a forged/clock-skewed value: treat as spam.
  if (elapsedSeconds < 0) return true;
  return elapsedSeconds < minSeconds;
}

export function evaluateSpam(
  fields: Record<string, string | string[]>,
  form: { honeypotField: string; minSubmitSeconds: number },
): SpamVerdict {
  const reasons: string[] = [];
  if (checkHoneypot(fields, form.honeypotField)) reasons.push("honeypot");
  if (checkTiming(fields, form.minSubmitSeconds)) reasons.push("too_fast");
  return { quarantine: reasons.length > 0, reasons };
}

/** Strips control fields and enforces the form's payload limits. */
export function sanitizeFields(
  fields: Record<string, string | string[]>,
  form: {
    allowedFields: string[];
    maxFieldCount: number;
    maxFieldLength: number;
  },
): { data: Record<string, string | string[]>; error: string | null } {
  const data: Record<string, string | string[]> = {};
  const allowlist =
    form.allowedFields.length > 0 ? new Set(form.allowedFields) : null;

  let count = 0;
  for (const [key, value] of Object.entries(fields)) {
    if (isControlField(key)) continue;
    if (allowlist && !allowlist.has(key)) continue;

    count += 1;
    if (count > form.maxFieldCount) {
      return { data, error: `Too many fields (limit ${form.maxFieldCount})` };
    }

    if (Array.isArray(value)) {
      const tooLong = value.find((v) => v.length > form.maxFieldLength);
      if (tooLong !== undefined) {
        return { data, error: `Field "${key}" exceeds the length limit` };
      }
      data[key] = value;
    } else {
      if (value.length > form.maxFieldLength) {
        return { data, error: `Field "${key}" exceeds the length limit` };
      }
      data[key] = value;
    }
  }

  return { data, error: null };
}

/**
 * Collapses accidental double-submits (double-click, browser retry) within a
 * one-minute bucket. Deliberately coarse: identical content from the same form
 * a minute apart is far more likely a retry than two real enquiries.
 */
export function buildDedupeKey(
  formId: string,
  data: Record<string, string | string[]>,
): string {
  const canonical = JSON.stringify(
    Object.keys(data)
      .sort()
      .map((k) => [k, data[k]]),
  );
  const bucket = Math.floor(Date.now() / 60000);
  return crypto
    .createHash("sha256")
    .update(`${formId}:${canonical}:${bucket}`)
    .digest("hex");
}
