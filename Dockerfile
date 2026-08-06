# Multi-stage build serving both the web app and the delivery worker.
# The worker is the reason to run here rather than on Vercel: it polls every
# second instead of every minute, cutting first-alert latency from ~60s to ~1s.

FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# ── deps ──────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ── build ─────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generates the Prisma client into app/generated/prisma before compiling.
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── web ───────────────────────────────────────────────────────────────
FROM base AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/app/generated ./app/generated
EXPOSE 3000
CMD ["npx", "next", "start", "--port", "3000", "--hostname", "0.0.0.0"]

# ── worker ────────────────────────────────────────────────────────────
# Runs the exact same runDeliveryTick() the Vercel cron route calls.
FROM base AS worker
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/app/generated ./app/generated
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/lib ./lib
COPY --from=build /app/worker ./worker
CMD ["npx", "tsx", "worker/index.ts"]
