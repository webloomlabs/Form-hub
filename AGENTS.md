<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# FormHub

Form-submission backend for static sites. A site POSTs to `/f/{publicKey}`;
FormHub stores the submission and reliably emails the website owner. Replaces
hand-rolled n8n webhook workflows, whose failure mode was losing enquiries
silently.

## The one rule that shapes everything

**The database commit is the acknowledgement.** Nothing that can fail slowly
(SMTP, webhooks, R2) may run before the ingest response. If a caller gets a
success response, the submission is durably on disk and something is queued to
notify a human about it.

Corollaries, all of which have bitten already:

- Email and webhooks are **never** sent inline — they are `DeliveryJob` rows
  drained by `lib/delivery/tick.ts`.
- Never persist an empty error string. Use `describeError()` from
  `lib/errors.ts`; the AWS SDK and undici throw errors with empty `.message`
  and the real cause nested in `cause`/`errors`. An empty string renders as
  "no problem" in the UI, which is the exact silent failure this service exists
  to prevent.
- Honeypot hits are **quarantined, not rejected**: stored with
  `status: SPAM` while the caller gets a response byte-identical to success.
  Any difference teaches bots to adapt.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · npm · no `src/` dir ·
Prisma 7 + `@prisma/adapter-pg` · NextAuth v5 (JWT, Credentials) · Tailwind v4
(CSS-first) + shadcn/ui `base-nova` · zod v4 · nodemailer · Cloudflare R2.

## Conventions

- **No `src/`.** `app/`, `components/`, `lib/`, `worker/`, `scripts/` at root.
  Alias `@/*` → `./*`.
- **`proxy.ts`, not `middleware.ts`.** Next 16 renamed it. It may import
  `auth.config.ts` **only** — pulling in `auth.ts` (and therefore Prisma or
  bcrypt) breaks the edge build.
- **Prisma 7**: the connection URL lives in `prisma.config.ts` and is passed to
  `PrismaClient` via the pg adapter, *not* in `schema.prisma`. The client is
  generated to `app/generated/prisma` and imported from there, never from
  `@prisma/client`.
- **Real migrations** (`prisma migrate dev`), not `db push`. This service owns
  irreplaceable customer data.
- **Mutations are server actions** in a colocated `actions.ts`, zod-parsed from
  `FormData`, returning `ActionState` for `useActionState`, ending in
  `revalidatePath`. API routes only where HTTP is genuinely required: ingest,
  auth, cron, CSV export.
- **Every action opens with a guard** from `lib/guards.ts` (`requireAgency`,
  `requireAgencyOwner`, `requireClient`) and every tenant query filters by the
  returned `agencyId` (plus `site.clientId` for client scope). Prefer
  `updateMany`/`deleteMany` with the tenant id in the `where` — a forged id
  becomes a no-op instead of a 500.
- **Keyset pagination only** (`WHERE (createdAt, id) < (…)`), never `OFFSET`.
- **shadcn is base-ui, not Radix**: composition uses `render={<Link />}`, not
  `asChild`. Theme tokens only — never hardcode hex.
- `params` and `searchParams` are Promises and must be awaited.

## Security notes

- `ENCRYPTION_KEY` (AES-256-GCM) protects agency SMTP passwords, Turnstile
  secrets and webhook signing keys. Ciphertexts are version-prefixed (`v1.`) so
  the key can be rotated later.
- Invite tokens and `CRON_SECRET` are compared with `safeEqual` (constant
  time). Only token *hashes* are stored.
- The ingest endpoint is deliberately unauthenticated: never reflect
  `Access-Control-Allow-Origin: *`, never set `Allow-Credentials`. Echo only an
  origin registered on the site.
- **nodemailer advisory GHSA-p6gq-j5cr-w38f has no fix.** It is reachable only
  through message-level `raw`, `path` and `href` options. Nothing may ever pass
  user- or agency-supplied values to those; attachments go out as presigned
  links in the body.

## Local development

```bash
docker compose up -d postgres mailpit minio   # pg :5433, Mailpit UI :8025, MinIO :9100
cp .env.example .env.local                    # then fill AUTH_SECRET, ENCRYPTION_KEY, CRON_SECRET
npm run db:migrate && npm run db:seed
npm run dev                                   # :3100 — :3000 is often taken
```

Seeded logins (password `password123`): `agency@formhub.test` at
`/agency/login`, `owner@acme.test` at `/client/login`.

The delivery queue drains via `/api/cron/deliver` (needs the `CRON_SECRET`
bearer) or `npm run worker`.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md). Two things that bite:

- The generated Prisma client is gitignored; `npm run build` runs
  `prisma generate` first. Don't commit `app/generated/`.
- `lib/prisma.ts` builds the client lazily behind a Proxy so importing it
  doesn't need `DATABASE_URL` — `next build` evaluates every route module, and
  an eager client would make the database a build-time dependency. Keep it lazy.

## Verification scripts

```bash
npx tsx scripts/test-delivery-retry.ts     # backoff, dead-lettering, the reaper
npx tsx scripts/test-tenant-isolation.ts   # cross-tenant read/write isolation
```

Run both after touching delivery or any tenant-scoped query.
