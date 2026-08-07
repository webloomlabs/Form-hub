import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: false });

/**
 * Creates an agency and its owner login against whatever DATABASE_URL points
 * at — used to bootstrap a fresh deployment, where there is no one to log in
 * as yet and no seed data is wanted.
 *
 *   DATABASE_URL="postgresql://…" npx tsx scripts/create-agency-owner.ts \
 *     --email you@example.com --agency "Your Agency"
 *
 * Idempotent on the email: an existing user has their password reset and is
 * reported rather than duplicated.
 */

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** Readable but high-entropy: 4 groups of 5 from an unambiguous alphabet. */
function generatePassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const groups: string[] = [];
  for (let g = 0; g < 4; g += 1) {
    let group = "";
    for (let i = 0; i < 5; i += 1) {
      group += alphabet[crypto.randomInt(alphabet.length)];
    }
    groups.push(group);
  }
  return groups.join("-");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

async function main() {
  const email = (arg("email") ?? "").trim().toLowerCase();
  const agencyName = arg("agency") ?? "My Agency";
  const userName = arg("name") ?? "Agency Owner";
  const password = arg("password") ?? generatePassword();

  if (!email || !email.includes("@")) {
    throw new Error("Pass a valid --email");
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    // Keep the slug unique without failing the run on a collision.
    const base = slugify(agencyName) || "agency";
    let slug = base;
    for (let n = 2; await prisma.agency.findUnique({ where: { slug } }); n += 1) {
      slug = `${base}-${n}`;
    }

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, agencyId: true, role: true },
    });

    const passwordHash = await bcrypt.hash(password, 12);

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash },
      });
      const agency = existing.agencyId
        ? await prisma.agency.findUnique({
            where: { id: existing.agencyId },
            select: { name: true },
          })
        : null;
      console.log("\nUser already existed — password reset.\n");
      console.table([
        { email, role: existing.role, agency: agency?.name ?? "(none)", password },
      ]);
      return;
    }

    const agency = await prisma.agency.create({
      data: {
        name: agencyName,
        slug,
        users: {
          create: {
            email,
            name: userName,
            role: "AGENCY_OWNER",
            passwordHash,
          },
        },
      },
      select: { id: true, name: true, slug: true },
    });

    console.log("\nAgency owner created.\n");
    console.table([
      { email, password, role: "AGENCY_OWNER", agency: agency.name, slug: agency.slug },
    ]);
    console.log("Sign in at /agency/login — change the password after first use.\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
