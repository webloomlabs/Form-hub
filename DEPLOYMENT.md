# Deploying FormHub

Target stack: **Vercel** (app + cron), **Neon** (Postgres), **Cloudflare R2**
(uploads), and any **SMTP** provider for outbound mail.

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
NEXT_PUBLIC_APP_URL   # https://your-domain.com  — no trailing slash
AUTH_TRUST_HOST       # true
SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASS SMTP_FROM
R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_NAME
```

`NEXT_PUBLIC_APP_URL` is baked into the client bundle at build time and is what
form endpoint URLs and invite links are built from — set it before the first
build, and redeploy after changing it.

`vercel.json` already registers the cron:

```json
{ "crons": [{ "path": "/api/cron/deliver", "schedule": "* * * * *" }] }
```

Vercel sends `CRON_SECRET` as a bearer token automatically; the route rejects
anything else with a constant-time comparison. Cron requires a Pro plan for
per-minute scheduling — on Hobby the minimum is daily, which is far too slow
for alerts. If you're on Hobby, either upgrade or drive the same endpoint from
an external scheduler:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/cron/deliver
```

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
- **First-alert latency is up to ~60s** on Vercel Cron. The ingest route kicks
  a delivery tick right after responding, so the common case is near-instant;
  the cron is the guarantee for anything that fails.
- **Sub-second alerting** is the reason to move to the Docker worker instead:
  `docker compose --profile deploy up -d --build` runs `worker/index.ts`,
  which polls every second. It calls the same `runDeliveryTick()` as the cron
  route, so nothing else changes.
- **`ENCRYPTION_KEY` cannot be rotated casually** — it decrypts stored agency
  SMTP passwords, Turnstile secrets and webhook signing keys. Ciphertexts carry
  a `v1.` prefix so a re-encrypting rotation can be added later.
- **Back up the database.** Neon's history/PITR window on the free plan is
  short; submissions are customer data you cannot regenerate.
