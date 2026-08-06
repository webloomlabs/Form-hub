import path from "node:path";
import { defineConfig } from "prisma/config";
import dotenv from "dotenv";

// Secrets live in .env.local (gitignored); .env is not used.
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
});
