const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Cloudflare Turnstile server-side verification.
 * Runs last among the spam checks because it is the only one that costs a
 * network round-trip.
 */
export async function verifyTurnstile(
  secret: string,
  token: string | undefined,
  remoteIp?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!token) return { ok: false, error: "missing_token" };

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      // Never let a slow captcha provider hold the ingest path open.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, error: `verify_http_${res.status}` };
    const json = (await res.json()) as {
      success: boolean;
      "error-codes"?: string[];
    };
    return json.success
      ? { ok: true }
      : { ok: false, error: json["error-codes"]?.join(",") ?? "verify_failed" };
  } catch {
    return { ok: false, error: "verify_unreachable" };
  }
}
