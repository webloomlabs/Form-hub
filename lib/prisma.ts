import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/app/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  // Prisma 7 drives Postgres through a driver adapter; the URL is no longer
  // read from schema.prisma.
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function getClient(): PrismaClient {
  const existing = globalForPrisma.prisma;
  if (existing) return existing;
  const client = createClient();
  // Reused across HMR reloads in dev, and across warm invocations in prod.
  globalForPrisma.prisma = client;
  return client;
}

/**
 * Lazily-constructed Prisma client.
 *
 * The connection is only opened on first *use*, not on import. `next build`
 * evaluates every route module while collecting page data, so constructing
 * eagerly would make DATABASE_URL a build-time requirement and fail any CI
 * build without database credentials. Behaviour at runtime is unchanged.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
  has(_target, prop) {
    return Reflect.has(getClient(), prop);
  },
}) as PrismaClient;
