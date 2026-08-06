/**
 * Origin handling for the public ingest endpoint.
 *
 * The endpoint is deliberately unauthenticated, so it must never reflect
 * credentials and must never answer with `*`. It echoes an origin only when
 * that exact origin is registered on the site.
 */

/** Reduces a URL or origin string to a bare origin, or null if unparseable. */
export function toOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Normalises the domains an agency typed in so comparison is exact. */
export function normalizeDomains(domains: string[]): string[] {
  return domains
    .map((d) => {
      const trimmed = d.trim();
      if (!trimmed) return null;
      return toOrigin(trimmed) ?? toOrigin(`https://${trimmed}`);
    })
    .filter((d): d is string => Boolean(d));
}

export function originAllowed(
  origin: string | null,
  siteDomains: string[],
): boolean {
  if (!origin) return false;
  return normalizeDomains(siteDomains).includes(origin);
}

export function corsHeaders(allowedOrigin: string | null): Headers {
  const headers = new Headers();
  if (allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
    // The set of valid origins varies per form, so caches must key on Origin.
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "content-type");
    headers.set("Access-Control-Max-Age", "86400");
  }
  // Access-Control-Allow-Credentials is intentionally never set.
  return headers;
}
