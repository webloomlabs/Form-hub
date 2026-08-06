/**
 * Produces a non-empty, human-readable description for any thrown value.
 *
 * This matters more than it looks. The AWS SDK, undici and nodemailer all
 * throw errors whose `.message` can be empty, with the real cause nested in
 * `cause`. Persisting "" would make `lastError` / `uploadError` falsy, and the
 * UI would render a genuine failure as "no problem" — the exact silent failure
 * this service exists to eliminate.
 */
export function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;

  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) {
      const label = current.message?.trim() || current.name || "Error";
      if (!parts.includes(label)) parts.push(label);

      // AggregateError (thrown by undici when every connection attempt fails)
      // carries its detail in `errors`, not `cause`.
      const aggregated = (current as AggregateError).errors;
      if (Array.isArray(aggregated) && aggregated.length > 0) {
        current = aggregated[0];
        continue;
      }
      current = (current as Error & { cause?: unknown }).cause;
    } else if (typeof current === "string" && current.trim()) {
      if (!parts.includes(current.trim())) parts.push(current.trim());
      break;
    } else if (current && typeof current === "object") {
      const code = (current as { code?: unknown }).code;
      if (typeof code === "string" && !parts.includes(code)) parts.push(code);
      break;
    } else {
      break;
    }
  }

  return parts.join(": ").trim() || "Failed for an unknown reason";
}
