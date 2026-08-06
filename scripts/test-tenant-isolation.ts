import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

/**
 * Creates a second agency with its own client, site and submission, then
 * asserts that neither the other agency nor the other client can read it
 * through the same queries the pages use.
 */
async function main() {
  const { prisma } = await import("../lib/prisma");
  const { generatePublicKey } = await import("../lib/crypto");
  const { listSubmissions } = await import("../lib/submissions");

  const rival = await prisma.agency.upsert({
    where: { slug: "rival-agency" },
    update: {},
    create: { name: "Rival Agency", slug: "rival-agency" },
  });

  let rivalClient = await prisma.client.findFirst({
    where: { agencyId: rival.id, name: "Rival Client" },
  });
  rivalClient ??= await prisma.client.create({
    data: {
      agencyId: rival.id,
      name: "Rival Client",
      contactEmail: "rival@rival.test",
    },
  });

  let rivalSite = await prisma.site.findFirst({
    where: { agencyId: rival.id, name: "rival.test" },
  });
  rivalSite ??= await prisma.site.create({
    data: {
      agencyId: rival.id,
      clientId: rivalClient.id,
      name: "rival.test",
      domains: ["https://rival.test"],
    },
  });

  let rivalForm = await prisma.form.findFirst({
    where: { siteId: rivalSite.id },
  });
  rivalForm ??= await prisma.form.create({
    data: {
      agencyId: rival.id,
      siteId: rivalSite.id,
      name: "Rival contact",
      publicKey: generatePublicKey(),
    },
  });

  const secret = await prisma.submission.create({
    data: {
      agencyId: rival.id,
      formId: rivalForm.id,
      siteId: rivalSite.id,
      data: { message: "RIVAL SECRET — must never be visible to Demo Agency" },
      subjectPreview: "RIVAL SECRET",
      status: "NEW",
      dedupeKey: `rival-${Date.now()}`,
    },
  });

  const demo = await prisma.agency.findUniqueOrThrow({
    where: { slug: "demo-agency" },
  });
  const demoClient = await prisma.client.findFirstOrThrow({
    where: { agencyId: demo.id },
  });

  const results: [string, boolean][] = [];

  // 1. Demo agency's submission list must not contain the rival's row.
  const demoList = await listSubmissions({ agencyId: demo.id }, { status: "ALL" });
  results.push([
    "demo agency list excludes rival submission",
    !demoList.items.some((s) => s.id === secret.id),
  ]);

  // 2. Demo client's scoped list must not contain it either.
  const clientList = await listSubmissions(
    { agencyId: demo.id, site: { clientId: demoClient.id } },
    { status: "ALL" },
  );
  results.push([
    "demo client list excludes rival submission",
    !clientList.items.some((s) => s.id === secret.id),
  ]);

  // 3. Direct fetch by id, scoped the way the detail page scopes it.
  const direct = await prisma.submission.findFirst({
    where: { id: secret.id, agencyId: demo.id },
  });
  results.push(["demo agency cannot fetch rival submission by id", direct === null]);

  const directClient = await prisma.submission.findFirst({
    where: { id: secret.id, agencyId: demo.id, site: { clientId: demoClient.id } },
  });
  results.push([
    "demo client cannot fetch rival submission by id",
    directClient === null,
  ]);

  // 4. Cross-tenant status mutation must affect zero rows.
  const { count } = await prisma.submission.updateMany({
    where: { id: secret.id, agencyId: demo.id },
    data: { status: "ARCHIVED" },
  });
  results.push(["demo agency cannot mutate rival submission", count === 0]);

  // 5. Cross-tenant job requeue must affect zero rows.
  const rivalJob = await prisma.deliveryJob.create({
    data: {
      agencyId: rival.id,
      submissionId: secret.id,
      kind: "EMAIL_ALERT",
      status: "DEAD",
      payload: { to: ["rival@rival.test"], cc: [], bcc: [] },
    },
  });
  const { requeueJob } = await import("../lib/delivery/tick");
  const requeued = await requeueJob(rivalJob.id, demo.id);
  const jobAfter = await prisma.deliveryJob.findUniqueOrThrow({
    where: { id: rivalJob.id },
  });
  results.push([
    "demo agency cannot requeue rival job",
    requeued === false && jobAfter.status === "DEAD",
  ]);

  console.log("\nTenant isolation:");
  let failed = 0;
  for (const [label, pass] of results) {
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}`);
    if (!pass) failed += 1;
  }

  await prisma.deliveryJob.delete({ where: { id: rivalJob.id } });
  await prisma.$disconnect();
  console.log(failed === 0 ? "\nAll isolation checks passed.\n" : `\n${failed} FAILED\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
