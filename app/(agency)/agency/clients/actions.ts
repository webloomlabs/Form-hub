"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAgency } from "@/lib/guards";
import { generateToken, hashToken } from "@/lib/crypto";
import { sendMail } from "@/lib/mailer";
import { fieldErrors, withAction, type ActionState } from "@/lib/action-state";

const clientSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  contactEmail: z.string().email("Enter a valid email address"),
});

export async function createClient(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withAction(async () => {
    const { agencyId } = await requireAgency();
    const parsed = clientSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fieldErrors(parsed.error);

    await prisma.client.create({
      data: { agencyId, ...parsed.data },
    });

    revalidatePath("/agency/clients");
    return { ok: true, message: "Client created." };
  });
}

export async function updateClient(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withAction(async () => {
    const { agencyId } = await requireAgency();
    const id = String(formData.get("id") ?? "");
    const parsed = clientSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fieldErrors(parsed.error);

    // agencyId in the filter is what stops one tenant editing another's data.
    const { count } = await prisma.client.updateMany({
      where: { id, agencyId },
      data: parsed.data,
    });
    if (count === 0) return { ok: false, message: "Client not found." };

    revalidatePath("/agency/clients");
    return { ok: true, message: "Client updated." };
  });
}

export async function deleteClient(formData: FormData): Promise<void> {
  const { agencyId } = await requireAgency();
  const id = String(formData.get("id") ?? "");
  await prisma.client.deleteMany({ where: { id, agencyId } });
  revalidatePath("/agency/clients");
}

const inviteSchema = z.object({
  clientId: z.string().min(1),
  email: z.string().email("Enter a valid email address"),
});

const INVITE_TTL_DAYS = 7;

/**
 * Invites a website owner. Only the token's hash is stored; the raw token
 * exists solely inside the emailed link.
 */
export async function inviteClientUser(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withAction(async () => {
    const { agencyId, userId } = await requireAgency();
    const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fieldErrors(parsed.error);

    const { clientId, email } = parsed.data;
    const client = await prisma.client.findFirst({
      where: { id: clientId, agencyId },
    });
    if (!client) return { ok: false, message: "Client not found." };

    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (existing) {
      return { ok: false, message: "A user with that email already exists." };
    }

    const token = generateToken();
    const expiresAt = new Date(
      Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    await prisma.invite.create({
      data: {
        agencyId,
        clientId,
        email: email.toLowerCase(),
        tokenHash: hashToken(token),
        expiresAt,
        createdById: userId,
      },
    });

    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3100";
    const link = `${base}/client/accept?token=${token}`;

    try {
      await sendMail(agencyId, {
        to: [email],
        subject: `You've been invited to view your website enquiries`,
        text: `You've been invited to access form submissions for ${client.name}.\n\nSet your password here (link valid ${INVITE_TTL_DAYS} days):\n${link}\n`,
        html: `<p>You've been invited to access form submissions for <strong>${client.name}</strong>.</p>
               <p><a href="${link}">Set your password</a> — link valid ${INVITE_TTL_DAYS} days.</p>`,
      });
    } catch {
      // The invite row is valid regardless; surfacing the link means a failed
      // SMTP config doesn't strand the agency.
      return {
        ok: true,
        message: `Invite created, but the email could not be sent. Share this link manually: ${link}`,
      };
    }

    revalidatePath("/agency/clients");
    return { ok: true, message: `Invite sent to ${email}.` };
  });
}
