"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAgency } from "@/lib/guards";
import { generatePublicKey } from "@/lib/crypto";
import { normalizeDomains } from "@/lib/ingest/cors";
import { fieldErrors, withAction, type ActionState } from "@/lib/action-state";

/**
 * Domains are entered one per line and normalised to bare origins, because the
 * ingest endpoint compares against `new URL(origin).origin` exactly.
 */
const siteSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  clientId: z.string().optional(),
  domains: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(/[\n,]/)
        .map((d) => d.trim())
        .filter(Boolean),
    ),
});

export async function createSite(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withAction(async () => {
    const { agencyId } = await requireAgency();
    const parsed = siteSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fieldErrors(parsed.error);

    const domains = normalizeDomains(parsed.data.domains);
    if (parsed.data.domains.length > 0 && domains.length === 0) {
      return { errors: { domains: ["Could not parse any valid domains"] } };
    }

    const clientId = parsed.data.clientId || null;
    if (clientId) {
      const owned = await prisma.client.findFirst({
        where: { id: clientId, agencyId },
        select: { id: true },
      });
      if (!owned) return { ok: false, message: "Client not found." };
    }

    await prisma.site.create({
      data: { agencyId, clientId, name: parsed.data.name, domains },
    });

    revalidatePath("/agency/sites");
    return { ok: true, message: "Site created." };
  });
}

export async function updateSite(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withAction(async () => {
    const { agencyId } = await requireAgency();
    const id = String(formData.get("id") ?? "");
    const parsed = siteSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fieldErrors(parsed.error);

    const domains = normalizeDomains(parsed.data.domains);
    const clientId = parsed.data.clientId || null;

    if (clientId) {
      const owned = await prisma.client.findFirst({
        where: { id: clientId, agencyId },
        select: { id: true },
      });
      if (!owned) return { ok: false, message: "Client not found." };
    }

    const { count } = await prisma.site.updateMany({
      where: { id, agencyId },
      data: { name: parsed.data.name, domains, clientId },
    });
    if (count === 0) return { ok: false, message: "Site not found." };

    revalidatePath("/agency/sites");
    return { ok: true, message: "Site updated." };
  });
}

const formSchema = z.object({
  siteId: z.string().min(1),
  name: z.string().min(1, "Name is required").max(120),
  redirectUrl: z.string().url("Enter a valid URL").or(z.literal("")),
  recipients: z.string().optional(),
});

export async function createForm(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withAction(async () => {
    const { agencyId } = await requireAgency();
    const parsed = formSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fieldErrors(parsed.error);

    const site = await prisma.site.findFirst({
      where: { id: parsed.data.siteId, agencyId },
      select: { id: true },
    });
    if (!site) return { ok: false, message: "Site not found." };

    const emails = (parsed.data.recipients ?? "")
      .split(/[\n,]/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));

    await prisma.form.create({
      data: {
        agencyId,
        siteId: site.id,
        name: parsed.data.name,
        publicKey: generatePublicKey(),
        redirectUrl: parsed.data.redirectUrl || null,
        recipients: {
          create: emails.map((email) => ({ email, kind: "TO" as const })),
        },
      },
    });

    revalidatePath("/agency/sites");
    return { ok: true, message: "Form created." };
  });
}
