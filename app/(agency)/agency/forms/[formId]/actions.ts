"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAgency } from "@/lib/guards";
import { encryptSecret } from "@/lib/crypto";
import { fieldErrors, withAction, type ActionState } from "@/lib/action-state";

/** Confirms the form belongs to the caller's agency before any write. */
async function assertOwnedForm(formId: string): Promise<string> {
  const { agencyId } = await requireAgency();
  const form = await prisma.form.findFirst({
    where: { id: formId, agencyId },
    select: { id: true },
  });
  if (!form) throw new Error("Form not found");
  return agencyId;
}

const settingsSchema = z.object({
  formId: z.string().min(1),
  name: z.string().min(1, "Name is required").max(120),
  redirectUrl: z.string().url("Enter a valid URL").or(z.literal("")),
  redirectErrorUrl: z.string().url("Enter a valid URL").or(z.literal("")),
  honeypotField: z.string().min(1).max(60),
  minSubmitSeconds: z.coerce.number().int().min(0).max(300),
  requireOriginMatch: z.coerce.boolean(),
  status: z.enum(["ACTIVE", "PAUSED"]),
  uploadsEnabled: z.coerce.boolean(),
});

export async function updateFormSettings(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withAction(async () => {
    const raw = Object.fromEntries(formData);
    // Unchecked switches submit nothing at all, so absence means false.
    const parsed = settingsSchema.safeParse({
      ...raw,
      requireOriginMatch: formData.get("requireOriginMatch") === "on",
      uploadsEnabled: formData.get("uploadsEnabled") === "on",
    });
    if (!parsed.success) return fieldErrors(parsed.error);

    const agencyId = await assertOwnedForm(parsed.data.formId);

    await prisma.form.updateMany({
      where: { id: parsed.data.formId, agencyId },
      data: {
        name: parsed.data.name,
        redirectUrl: parsed.data.redirectUrl || null,
        redirectErrorUrl: parsed.data.redirectErrorUrl || null,
        honeypotField: parsed.data.honeypotField,
        minSubmitSeconds: parsed.data.minSubmitSeconds,
        requireOriginMatch: parsed.data.requireOriginMatch,
        status: parsed.data.status,
        uploadsEnabled: parsed.data.uploadsEnabled,
      },
    });

    revalidatePath(`/agency/forms/${parsed.data.formId}`);
    return { ok: true, message: "Form updated." };
  });
}

const turnstileSchema = z.object({
  formId: z.string().min(1),
  turnstileSecret: z.string().optional(),
  turnstileEnabled: z.boolean(),
});

export async function updateTurnstile(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withAction(async () => {
    const parsed = turnstileSchema.safeParse({
      formId: formData.get("formId"),
      turnstileSecret: formData.get("turnstileSecret") ?? "",
      turnstileEnabled: formData.get("turnstileEnabled") === "on",
    });
    if (!parsed.success) return fieldErrors(parsed.error);

    const agencyId = await assertOwnedForm(parsed.data.formId);
    const secret = parsed.data.turnstileSecret?.trim();

    if (parsed.data.turnstileEnabled && !secret) {
      const current = await prisma.form.findUnique({
        where: { id: parsed.data.formId },
        select: { turnstileSecretEnc: true },
      });
      if (!current?.turnstileSecretEnc) {
        return {
          errors: { turnstileSecret: ["A secret key is required to enable Turnstile"] },
        };
      }
    }

    await prisma.form.updateMany({
      where: { id: parsed.data.formId, agencyId },
      data: {
        turnstileEnabled: parsed.data.turnstileEnabled,
        // Blank means "leave the stored secret alone".
        ...(secret ? { turnstileSecretEnc: encryptSecret(secret) } : {}),
      },
    });

    revalidatePath(`/agency/forms/${parsed.data.formId}`);
    return { ok: true, message: "Captcha settings saved." };
  });
}

const recipientSchema = z.object({
  formId: z.string().min(1),
  email: z.string().email("Enter a valid email address"),
  kind: z.enum(["TO", "CC", "BCC"]),
});

export async function addRecipient(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withAction(async () => {
    const parsed = recipientSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fieldErrors(parsed.error);

    await assertOwnedForm(parsed.data.formId);

    await prisma.formRecipient.upsert({
      where: {
        formId_email_kind: {
          formId: parsed.data.formId,
          email: parsed.data.email.toLowerCase(),
          kind: parsed.data.kind,
        },
      },
      update: { enabled: true },
      create: {
        formId: parsed.data.formId,
        email: parsed.data.email.toLowerCase(),
        kind: parsed.data.kind,
      },
    });

    revalidatePath(`/agency/forms/${parsed.data.formId}`);
    return { ok: true, message: "Recipient added." };
  });
}

export async function removeRecipient(formData: FormData): Promise<void> {
  const formId = String(formData.get("formId") ?? "");
  const recipientId = String(formData.get("recipientId") ?? "");
  await assertOwnedForm(formId);
  await prisma.formRecipient.deleteMany({ where: { id: recipientId, formId } });
  revalidatePath(`/agency/forms/${formId}`);
}
