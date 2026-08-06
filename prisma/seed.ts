import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { generatePublicKey } from "../lib/crypto";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const DEMO_PASSWORD = "password123";

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const superAdmin = await prisma.user.upsert({
    where: { email: "admin@formhub.test" },
    update: {},
    create: {
      email: "admin@formhub.test",
      name: "Platform Admin",
      role: "SUPER_ADMIN",
      passwordHash,
    },
  });

  const agency = await prisma.agency.upsert({
    where: { slug: "demo-agency" },
    update: {},
    create: { name: "Demo Agency", slug: "demo-agency" },
  });

  const agencyOwner = await prisma.user.upsert({
    where: { email: "agency@formhub.test" },
    update: { agencyId: agency.id },
    create: {
      email: "agency@formhub.test",
      name: "Agency Owner",
      role: "AGENCY_OWNER",
      passwordHash,
      agencyId: agency.id,
    },
  });

  let client = await prisma.client.findFirst({
    where: { agencyId: agency.id, name: "Acme Joinery" },
  });
  client ??= await prisma.client.create({
    data: {
      agencyId: agency.id,
      name: "Acme Joinery",
      contactEmail: "owner@acme.test",
    },
  });

  const clientUser = await prisma.user.upsert({
    where: { email: "owner@acme.test" },
    update: { agencyId: agency.id, clientId: client.id },
    create: {
      email: "owner@acme.test",
      name: "Acme Owner",
      role: "CLIENT",
      passwordHash,
      agencyId: agency.id,
      clientId: client.id,
    },
  });

  let site = await prisma.site.findFirst({
    where: { agencyId: agency.id, name: "acme.test" },
  });
  site ??= await prisma.site.create({
    data: {
      agencyId: agency.id,
      clientId: client.id,
      name: "acme.test",
      // The local test harness in Phase 5 is served from :8080.
      domains: ["http://localhost:8080", "https://acme.test"],
    },
  });

  let form = await prisma.form.findFirst({
    where: { siteId: site.id, name: "Contact form" },
  });
  form ??= await prisma.form.create({
    data: {
      agencyId: agency.id,
      siteId: site.id,
      name: "Contact form",
      publicKey: generatePublicKey(),
      redirectUrl: "http://localhost:8080/thanks.html",
      redirectErrorUrl: "http://localhost:8080/error.html",
      recipients: {
        create: [{ email: "owner@acme.test", kind: "TO" }],
      },
    },
  });

  console.log("Seed complete.\n");
  console.table([
    { role: "SUPER_ADMIN", email: superAdmin.email, portal: "/agency/login" },
    { role: "AGENCY_OWNER", email: agencyOwner.email, portal: "/agency/login" },
    { role: "CLIENT", email: clientUser.email, portal: "/client/login" },
  ]);
  console.log(`\nPassword for all seeded users: ${DEMO_PASSWORD}`);
  console.log(`Demo form endpoint: POST /f/${form.publicKey}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
