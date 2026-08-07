# Deploying FormHub

Target stack: **Vercel** (app), **Neon** (Postgres), **Cloudflare R2**
(uploads), **Upstash QStash** (scheduler), and any **SMTP** provider for
outbound mail. All of it fits inside Vercel's **Hobby** plan.

Everything below assumes the repo is pushed to GitHub.

---

## 1. Neon

Create a project, then grab **two** connection strings from the dashboard —
they are different and both are needed:

| Variable | Neon endpoint | Used by |
|---|---|---|
| `DATABASE_URL` | **Pooled** (host contains `-pooler`) | The app at runtime |
| `DIRECT_URL` | **Direct** (no `-pooler`) | `prisma migrate` only |

Serverless functions open many short-lived connections, so runtime traffic goes
through Neon's PgBouncer pooler. Migrations can't: they need DDL and advisory
locks the pooler won't proxy, hence the direct URL. `prisma.config.ts` already
prefers `DIRECT_URL` and falls back to `DATABASE_URL` for local Postgres.

Append `?sslmode=require` to both.

Run the migrations and seed a first login from your machine:

```bash
DIRECT_URL="postgresql://…neon.tech/formhub?sslmode=require" \
DATABASE_URL="postgresql://…-pooler…neon.tech/formhub?sslmode=require" \
  npx prisma migrate deploy

# Optional: creates the demo agency/client/site/form and three logins.
# Change the passwords immediately, or write your own seed.
DATABASE_URL="…pooled…" npx prisma db seed
```

Use `migrate deploy` (`npm run db:deploy`), never `migrate dev`, against a real
database — `dev` can prompt to reset.

## 2. Cloudflare R2

1. Create a bucket, e.g. `formhub-uploads`. **Keep it private** — files are
   served through short-lived presigned URLs, never public links, so there is
   no need to enable public access or a custom domain.
2. R2 → *Manage API Tokens* → create a token with **Object Read & Write**
   scoped to that bucket.
3. Collect `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_BUCKET_NAME`.

Leave `R2_ENDPOINT` **unset** in production — it exists only to point local dev
at MinIO. Bucket CORS is not required: download links are opened as top-level
navigations, not `fetch`.

Uploads stay off until an agency enables them per form (Form → Settings →
*Accept file uploads*).

## 3. SMTP

Any provider works — the app uses plain nodemailer.

```
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
SMTP_SECURE   # true for port 465, false for 587 (STARTTLS)
SMTP_FROM     # e.g. "FormHub <no-reply@yourdomain.com>"
```

**Set up SPF, DKIM and DMARC on the sending domain before real traffic.** This
address sends on behalf of every agency, so all of them share its reputation.
Alerts go out with `Reply-To` set to whoever filled in the form, so replying
reaches the enquirer directly.

Agencies that want mail from their own domain can add their own SMTP under
**Settings → Sending email**; those credentials are stored AES-256-GCM
encrypted and there is a *Test connection* button that authenticates without
sending anything.

## 4. Vercel

Import the repo. Framework preset **Next.js**; leave the build command alone —
`package.json` already runs `prisma generate && next build`, which matters
because the generated client is gitignored.

Set these environment variables for **Production** (and Preview if you use it):

```
DATABASE_URL          # Neon pooled
DIRECT_URL            # Neon direct
AUTH_SECRET           # openssl rand -base64 32
ENCRYPTION_KEY        # openssl rand -base64 32  (32 bytes, base64)
CRON_SECRET           # openssl rand -hex 32
QSTASH_TOKEN QSTASH_CURRENT_SIGNING_KEY QSTASH_NEXT_SIGNING_KEY
NEXT_PUBLIC_APP_URL   # https://your-domain.com  — no trailing slash
AUTH_TRUST_HOST       # true
SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASS SMTP_FROM
R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_NAME
```

`NEXT_PUBLIC_APP_URL` is baked into the client bundle at build time and is what
form endpoint URLs and invite links are built from — set it before the first
build, and redeploy after changing it.

There is **no `vercel.json`** in this repo and Vercel Cron is not used — see
the next section.

## 4b. Scheduling with Upstash QStash

Vercel's Hobby plan allows cron **once per day**, and a more frequent schedule
is rejected at deploy time. So the schedule lives outside Vercel: QStash calls
`/api/cron/deliver` on whatever interval you choose, on any plan.

1. Create a QStash database at <https://console.upstash.com/qstash>.
2. Copy the token and both signing keys into your Vercel environment:

   ```
   QSTASH_TOKEN                 # only needed to create the schedule
   QSTASH_CURRENT_SIGNING_KEY   # what the endpoint verifies against
   QSTASH_NEXT_SIGNING_KEY      # set both, so key rotation isn't an outage
   ```

3. Create the schedule, after the first deploy so the URL exists:

   ```bash
   npm run qstash:setup                        # */5, uses NEXT_PUBLIC_APP_URL
   npm run qstash:setup -- --cron "*/15 * * * *" --url https://your-domain.com
   npm run qstash:setup -- --cron "*/2 * * * *" --dry-run   # price it first
   ```

   It is idempotent — an existing schedule for the same URL is replaced, so
   running it twice won't leave two firing.

### Picking an interval for your QStash quota

QStash bills per message, so the interval is a budget decision:

| Cron | Calls/day | Worst case with retries |
|---|---|---|
| `* * * * *` | 1440 | 4320 |
| `*/2 * * * *` | 720 | 2160 |
| `*/5 * * * *` (default) | **288** | 864 |
| `*/10 * * * *` | 144 | 432 |
| `*/15 * * * *` | 96 | 288 |
| `0 * * * *` | 24 | 72 |

"Worst case" assumes every single run fails and exhausts its 2 retries — a
sustained outage, not normal operation.

For a **1000/day** quota, `*/5` is the recommendation: 288 messages leaves room
for the retry ceiling and for anything else you put on the same QStash account.
`*/2` (720) also fits but only if nothing else shares the quota. `*/15` or even
hourly is perfectly reasonable too — see below for why.

`npm run qstash:setup` prints the projected volume before creating anything and
**refuses** a schedule that exceeds the budget (`--budget`, default 500). Add
`--dry-run` to price an interval without touching QStash.

### Why a long interval is fine

The schedule is a safety net, not the delivery path. A normal alert never waits
for it — it goes out within a second of the submission, via the in-request
tick. The schedule only matters when a send **failed** and the site has no
further traffic to trigger a retry.

The retry backoff is `30s → 2m → 10m → 1h → 6h`, so on a `*/15` schedule the
first couple of retry steps are simply picked up at the next firing. Since
those steps only exist because the mail server was unreachable, a few extra
minutes changes nothing in practice — and any agency page view or new
submission drains the queue sooner anyway.

QStash signs every request; the endpoint verifies the signature with the
signing keys and rejects anything else. It also retries non-2xx responses,
which is what you want when a tick fails on a transient database error.

### Without QStash

The endpoint also accepts `Authorization: Bearer $CRON_SECRET`, so any
scheduler works:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://your-domain.com/api/cron/deliver
```

The repo ships `.github/workflows/deliver.yml` as a zero-signup alternative
(GitHub Actions, roughly every 5 minutes). It needs repository secret
`CRON_SECRET` and variable `APP_URL`. Delete it if you use QStash.

**On Pro** you can use Vercel Cron instead: add a `vercel.json` containing
`{ "crons": [{ "path": "/api/cron/deliver", "schedule": "* * * * *" }] }` —
Vercel sends `CRON_SECRET` as a bearer token automatically — and skip QStash.

### The scheduler is a safety net, not the delivery path

Alerts do not wait for it. `kickDelivery()` runs a tick after every accepted
submission and every agency page view, and there is a **Process queue now**
button on the Deliveries page:

| Trigger | Covers |
|---|---|
| Every accepted submission | The alert itself — sent seconds after submission |
| Every agency page view | Retries of earlier failures, as staff use the app |
| **Process queue now** button | On-demand drain |
| QStash schedule | Everything else, including sites with no traffic |

All of them call the same `runDeliveryTick()`, and a tick claims *any* due job,
so one trigger drains the whole backlog. Overlapping ticks are safe by
construction (`FOR UPDATE SKIP LOCKED`), so the schedule firing while a
submission is being processed is a non-issue.

Other Hobby limits worth knowing: functions cap at **60s** (the endpoint
declares `maxDuration = 60` and budgets 45s of work, so it fits), and there is
no always-on process — which is why the Docker worker is a VPS-only option.

## 5. Verify the deployment

1. `https://your-domain.com/agency/login` — sign in.
2. Create a client, a site (add the real origin, e.g. `https://acme.com`), and
   a form. Copy the snippet from the form page.
3. Submit the form from the real site. Expect a redirect to your thank-you URL
   and the submission in the inbox immediately.
4. Check the alert email arrived, and that **Deliveries** shows it delivered.
5. Submit with the honeypot field filled — it should look successful to the
   sender but land under **Spam** with no email sent.
6. Post from an unregistered origin — expect `403`.

If a submission appears but no email does, open the submission and read the
delivery log: every attempt is recorded with its error, and **Resend now**
re-queues it.

## Notes and limits

- **Request bodies cap at ~4.5 MB on Vercel.** Forms are capped below that
  (`maxTotalUploadBytes`, default 4 MB). Larger files need presigned
  direct-to-R2 uploads from the browser; `SubmissionFile` already stores only
  an object key, so that can be added without a migration.
- **First-alert latency is seconds, not minutes**, on any plan: the ingest
  route kicks a delivery tick right after responding. The scheduler only
  matters for retrying alerts that failed the first time.
- **Sub-second alerting** is the reason to move to the Docker worker instead:
  `docker compose --profile deploy up -d --build` runs `worker/index.ts`,
  which polls every second. It calls the same `runDeliveryTick()` as the cron
  route, so nothing else changes.
- **`ENCRYPTION_KEY` cannot be rotated casually** — it decrypts stored agency
  SMTP passwords, Turnstile secrets and webhook signing keys. Ciphertexts carry
  a `v1.` prefix so a re-encrypting rotation can be added later.
- **Back up the database.** Neon's history/PITR window on the free plan is
  short; submissions are customer data you cannot regenerate.
