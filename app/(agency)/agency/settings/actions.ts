"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAgencyOwner } from "@/lib/guards";
import { encryptSecret, generateToken } from "@/lib/crypto";
import { verifyAgencyTransport } from "@/lib/mailer";
import { describeError } from "@/lib/errors";
import { fieldErrors, withAction, type ActionState } from "@/lib/action-state";

const smtpSchema = z.object({
  host: z.string().min(1, "Host is required"),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().min(1, "Username is required"),
  password: z.string().optional(),
  fromName: z.string().min(1, "From name is required"),
  fromEmail: z.string().email("Enter a valid email address"),
});

export async function saveSmtpConfig(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withAction(async () => {
    const { agencyId } = await requireAgencyOwner();
    const parsed = smtpSchema.safeParse({
      ...Object.fromEntries(formData),
      secure: formData.get("secure") === "on",
    });
    if (!parsed.success) return fieldErrors(parsed.error);

    const { password, ...rest } = parsed.data;
    const existing = await prisma.agencySmtpConfig.findUnique({
      where: { agencyId },
    });

    if (!existing && !password) {
      return { errors: { password: ["A password is required"] } };
    }

    await prisma.agencySmtpConfig.upsert({
      where: { agencyId },
      // A blank password means "keep the stored one".
      update: {
        ...rest,
        ...(password ? { passwordEnc: encryptSecret(password) } : {}),
        verifiedAt: null,
      },
      create: {
        agencyId,
        ...rest,
        passwordEnc: encryptSecret(password!),
      },
    });

    revalidatePath("/agency/settings");
    return { ok: true, message: "SMTP settings saved. Test them before relying on them." };
  });
}

/** Opens a connection and authenticates without sending anything. */
export async function testSmtpConfig(
  _state: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  return withAction(async () => {
    const { agencyId } = await requireAgencyOwner();
    try {
      await verifyAgencyTransport(agencyId);
    } catch (error) {
      return { ok: false, message: `Connection failed: ${describeError(error)}` };
    }
    await prisma.agencySmtpConfig.updateMany({
      where: { agencyId },
      data: { verifiedAt: new Date() },
    });
    revalidatePath("/agency/settings");
    return { ok: true, message: "SMTP connection verified." };
  });
}

export async function deleteSmtpConfig(): Promise<void> {
  const { agencyId } = await requireAgencyOwner();
  await prisma.agencySmtpConfig.deleteMany({ where: { agencyId } });
  revalidatePath("/agency/settings");
}

const webhookSchema = z.object({
  url: z.string().url("Enter a valid https URL"),
  formId: z.string().optional(),
});

export async function createWebhook(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withAction(async () => {
    const { agencyId } = await requireAgencyOwner();
    const parsed = webhookSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fieldErrors(parsed.error);

    const url = new URL(parsed.data.url);
    if (url.protocol !== "https:" && url.hostname !== "localhost") {
      return { errors: { url: ["Use https for webhook endpoints"] } };
    }

    const formId = parsed.data.formId || null;
    if (formId) {
      const owned = await prisma.form.findFirst({
        where: { id: formId, agencyId },
        select: { id: true },
      });
      if (!owned) return { ok: false, message: "Form not found." };
    }

    // The signing secret is shown once, right after creation.
    const secret = generateToken(24);
    await prisma.webhookEndpoint.create({
      data: {
        agencyId,
        formId,
        url: parsed.data.url,
        secretEnc: encryptSecret(secret),
      },
    });

    revalidatePath("/agency/settings");
    return {
      ok: true,
      message: `Webhook created. Signing secret (shown once): ${secret}`,
    };
  });
}

export async function deleteWebhook(formData: FormData): Promise<void> {
  const { agencyId } = await requireAgencyOwner();
  const id = String(formData.get("id") ?? "");
  await prisma.webhookEndpoint.deleteMany({ where: { id, agencyId } });
  revalidatePath("/agency/settings");
}
