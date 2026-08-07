import path from "node:path";
import dotenv from "dotenv";
import { Client } from "@upstash/qstash";

dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: false });

/**
 * Creates (or re-points) the QStash schedule that drains the delivery queue.
 *
 *   npx tsx scripts/setup-qstash.ts
 *   npx tsx scripts/setup-qstash.ts --cron "*\/2 * * * *"
 *   npx tsx scripts/setup-qstash.ts --budget 500
 *
 * Needs QSTASH_TOKEN and NEXT_PUBLIC_APP_URL. Idempotent: an existing schedule
 * for the same destination is removed first, so running it twice doesn't leave
 * two schedules firing.
 *
 * QStash bills per message, so the schedule has to fit a daily quota. Five
 * minutes is the default because the schedule is only a safety net — alerts
 * are already sent by the in-request tick (see lib/delivery/kick.ts), so a
 * longer interval costs nothing in the common case.
 */

const DEFAULT_CRON = "*/5 * * * *";
/** QStash free tier at time of writing; override with --budget. */
const DEFAULT_DAILY_BUDGET = 500;
/** Matches `retries` below: one delivery plus up to N retries per firing. */
const RETRIES = 2;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** Expands one cron field ("*", "*​/5", "1-4", "0,30", "7") to the values it matches. */
function expandField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const [range, stepRaw] = part.split("/");
    const step = stepRaw ? Number(stepRaw) : 1;
    if (!Number.isFinite(step) || step < 1) throw new Error(`Bad step in "${field}"`);

    let start = min;
    let end = max;
    if (range && range !== "*") {
      const [a, b] = range.split("-");
      start = Number(a);
      end = b === undefined ? (stepRaw ? max : Number(a)) : Number(b);
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        throw new Error(`Bad range in "${field}"`);
      }
    }
    for (let v = start; v <= end; v += step) values.add(v);
  }
  return values;
}

/**
 * Average firings per day, by walking a full year of minutes. Brute force, but
 * exact for day-of-month and day-of-week expressions that arithmetic gets
 * wrong, and it runs in well under a second.
 */
function estimateCallsPerDay(cron: string): number {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(
      `Expected 5 cron fields (minute hour day month weekday), got ${fields.length}: "${cron}"`,
    );
  }
  const [minF, hourF, domF, monF, dowF] = fields;
  const minutes = expandField(minF!, 0, 59);
  const hours = expandField(hourF!, 0, 23);
  const doms = expandField(domF!, 1, 31);
  const months = expandField(monF!, 1, 12);
  const dows = expandField(dowF!, 0, 6);

  // A non-leap year starting Monday; averaging over 365 days smooths out
  // month-length and weekday effects.
  const start = new Date(Date.UTC(2027, 0, 1, 0, 0, 0));
  let matches = 0;
  const cursor = new Date(start);
  for (let i = 0; i < 365 * 24 * 60; i += 1) {
    const dom = cursor.getUTCDate();
    const dow = cursor.getUTCDay();
    // Standard cron: when both day-of-month and day-of-week are restricted,
    // a match on either one counts.
    const domRestricted = domF !== "*";
    const dowRestricted = dowF !== "*";
    const dayOk =
      domRestricted && dowRestricted
        ? doms.has(dom) || dows.has(dow)
        : (!domRestricted || doms.has(dom)) && (!dowRestricted || dows.has(dow));

    if (
      minutes.has(cursor.getUTCMinutes()) &&
      hours.has(cursor.getUTCHours()) &&
      months.has(cursor.getUTCMonth() + 1) &&
      dayOk
    ) {
      matches += 1;
    }
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return matches / 365;
}

async function main() {
  const token = process.env.QSTASH_TOKEN;
  const appUrl = arg("url") ?? process.env.NEXT_PUBLIC_APP_URL;
  const cron = arg("cron") ?? DEFAULT_CRON;
  const budget = Number(arg("budget") ?? DEFAULT_DAILY_BUDGET);
  const dryRun = process.argv.includes("--dry-run");

  const perDay = estimateCallsPerDay(cron);
  const worstCase = perDay * (1 + RETRIES);

  console.log(`\ncron            ${cron}`);
  console.log(`calls/day       ${perDay.toFixed(0)}`);
  console.log(`worst case      ${worstCase.toFixed(0)}  (every firing exhausting ${RETRIES} retries)`);
  console.log(`daily budget    ${budget}`);

  if (perDay > budget) {
    throw new Error(
      `This schedule sends ~${perDay.toFixed(0)} messages/day, over the ${budget}/day budget.\n` +
        `Pick a longer interval — "*/5 * * * *" is ~288/day, "*/15 * * * *" is ~96/day.\n` +
        `Alerts don't wait for the schedule anyway; it only covers retries on quiet sites.`,
    );
  }
  if (worstCase > budget) {
    console.log(
      `\n  note: if every run failed and exhausted its retries you'd reach ~${worstCase.toFixed(0)}/day.\n` +
        `  That only happens during a sustained outage.`,
    );
  }

  if (dryRun) {
    console.log("\n--dry-run: no schedule created.\n");
    return;
  }

  if (!token) {
    throw new Error(
      "QSTASH_TOKEN is not set. Copy it from https://console.upstash.com/qstash",
    );
  }
  if (!appUrl || appUrl.includes("localhost")) {
    throw new Error(
      `NEXT_PUBLIC_APP_URL must be your public https URL (got: ${appUrl ?? "unset"}).\n` +
        "QStash calls your deployment from the internet — it cannot reach localhost.\n" +
        "Pass one explicitly: npx tsx scripts/setup-qstash.ts --url https://your-domain.com",
    );
  }

  const destination = `${appUrl.replace(/\/$/, "")}/api/cron/deliver`;
  const schedules = new Client({ token }).schedules;

  for (const schedule of await schedules.list()) {
    if (schedule.destination === destination) {
      await schedules.delete(schedule.scheduleId);
      console.log(`\nremoved existing schedule ${schedule.scheduleId}`);
    }
  }

  const { scheduleId } = await schedules.create({
    destination,
    cron,
    retries: RETRIES,
  });

  console.log(`\nSchedule created`);
  console.table([{ scheduleId, destination, cron }]);
  console.log(
    "\nSet these in Vercel (QStash → Signing keys) so the endpoint trusts it:\n" +
      "  QSTASH_CURRENT_SIGNING_KEY\n  QSTASH_NEXT_SIGNING_KEY\n",
  );
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
