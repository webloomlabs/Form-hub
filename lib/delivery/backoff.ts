/**
 * Retry schedule, indexed by the number of attempts already made.
 * attempts=1 failed -> wait 30s, attempts=2 failed -> 2m, and so on.
 * Once attempts reaches the job's maxAttempts the job is dead-lettered and
 * surfaces in the delivery log for a human to resend.
 */
const BACKOFF_SECONDS = [30, 120, 600, 3600, 21600];

export function nextRunAfter(attempts: number, now = new Date()): Date {
  const index = Math.min(attempts - 1, BACKOFF_SECONDS.length - 1);
  const seconds = BACKOFF_SECONDS[Math.max(0, index)]!;
  return new Date(now.getTime() + seconds * 1000);
}

export function describeSchedule(): string {
  return ["immediate", ...BACKOFF_SECONDS.map((s) => `${s}s`)].join(" → ");
}
