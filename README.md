# FormHub

Form-submission backend for static sites, built to replace fragile n8n webhook
workflows.

A static site POSTs its form to `https://formhub/f/{publicKey}`. FormHub
validates it, filters spam, **commits it to Postgres, and only then
acknowledges** — then a queue-backed worker delivers the email alert with
retries, recording every attempt. Agencies manage clients, sites and forms;
website owners get their own login and their own inbox.

## Why it exists

The n8n approach loses enquiries silently: a node errors, a credential expires,
the instance is down, and nobody finds out until a client asks why they never
heard back. FormHub's guarantee is narrower and stronger — if the endpoint
returned success, the submission is on disk, and every delivery failure is
visible and retryable.

## Quick start

```bash
docker compose up -d postgres mailpit minio
cp .env.example .env.local
# Fill in AUTH_SECRET, ENCRYPTION_KEY, CRON_SECRET:
#   openssl rand -base64 32   (AUTH_SECRET, ENCRYPTION_KEY)
#   openssl rand -hex 32      (CRON_SECRET)
npm install
npm run db:migrate
npm run db:seed
npm run dev            # http://localhost:3100
```

Seeded logins, password `password123`:

| Role | Email | Portal |
| --- | --- | --- |
| Agency owner | `agency@formhub.test` | `/agency/login` |
| Website owner | `owner@acme.test` | `/client/login` |

Mailpit (outgoing mail) is at http://localhost:8025.

## Submitting a form

Native HTML — no JavaScript, redirects to your thank-you page:

```html
<form action="https://formhub.example/f/YOUR_KEY" method="POST">
  <input name="name" required>
  <input name="email" type="email" required>
  <textarea name="message" required></textarea>
  <input name="_hp" tabindex="-1" autocomplete="off"
         style="position:absolute;left:-9999px" aria-hidden="true">
  <button>Send</button>
</form>
```

JSON — stays on the page. The request `Origin` must be registered on the site:

```js
await fetch("https://formhub.example/f/YOUR_KEY", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name, email, message }),
});
```

The agency console renders both snippets with the real key on each form's page.

## How delivery works

Submissions and their `DeliveryJob` rows are written in one transaction, so a
submission can never exist without something queued to notify a human. Jobs are
claimed with `FOR UPDATE SKIP LOCKED` — concurrent workers are safe by
construction — and retried on a fixed schedule:

```
immediate → 30s → 2m → 10m → 1h → 6h → dead-lettered
```

Every attempt writes a `DeliveryAttempt` row, which is what the delivery log
renders. Dead jobs can be resent from the UI. Jobs stuck in `PROCESSING` for
over five minutes (a killed function, a redeployed container) are returned to
the queue automatically.

`runDeliveryTick()` is a plain function with two callers, so the deployment
target is a configuration choice rather than a rewrite:

- **Vercel** — `/api/cron/deliver`, run every minute by `vercel.json`.
- **Docker/VPS** — `worker/index.ts`, polling every second.
  `docker compose --profile deploy up -d --build`.

## Spam handling

| Signal | Outcome |
| --- | --- |
| Honeypot field filled | Stored as spam; caller sees a normal success response |
| Submitted faster than `minSubmitSeconds` | Stored as spam |
| Origin/Referer not registered on the site | Rejected, `403` |
| Over 10/min from one IP, or 300/min for the form | Rejected, `429` |
| Turnstile verification failed (when enabled) | Rejected, `403` |

Honeypot and timing hits are quarantined rather than refused, so a false
positive never costs a real enquiry and a bot never learns it was caught.

## Deployment notes

- Vercel caps request bodies at ~4.5 MB, so uploads are capped below that.
  Larger files need presigned direct-to-R2 uploads; `SubmissionFile` already
  stores only an object key, so that can be added without a migration.
- The default mail transport sends on behalf of every agency, so SPF, DKIM and
  DMARC on the platform domain are mandatory. Agencies can configure their own
  SMTP under Settings to send from their own domain.
- Vercel Cron's floor is one minute, so worst-case first-alert latency is ~60s.
  The ingest route opportunistically kicks a tick after responding, which
  covers the common case; sub-second alerting is the reason to move to the
  Docker worker.

See [AGENTS.md](AGENTS.md) for conventions and the invariants to preserve.
