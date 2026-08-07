import path from "node:path";
import { defineConfig } from "prisma/config";
import dotenv from "dotenv";

// Secrets live in .env.local (gitignored); .env is not used.
// `override: false` so real environment variables win in CI and on Vercel.
dotenv.config({
  path: path.join(process.cwd(), ".env.local"),
  override: false,
});

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    // Migrations need a direct connection. Neon's pooled endpoint runs
    // PgBouncer, which can't run the DDL and advisory locks Migrate relies on,
    // so point DIRECT_URL at the unpooled host. Falls back to DATABASE_URL for
    // local Postgres, where there is no pooler.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
});
