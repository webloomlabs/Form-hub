"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/crypto";
import { fieldErrors, type ActionState } from "@/lib/action-state";

const schema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(10, "Use at least 10 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

export type InviteLookup =
  | { valid: true; email: string; clientName: string }
  | { valid: false; reason: string };

/** Looked up by hash — the raw token is never stored, so it can't leak from the DB. */
export async function lookupInvite(token: string): Promise<InviteLookup> {
  if (!token) return { valid: false, reason: "This link is missing its token." };

  const invite = await prisma.invite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { client: { select: { name: true } } },
  });

  if (!invite) return { valid: false, reason: "This invite link is not valid." };
  if (invite.acceptedAt) {
    return { valid: false, reason: "This invite has already been used." };
  }
  if (invite.expiresAt < new Date()) {
    return { valid: false, reason: "This invite has expired. Ask your agency for a new one." };
  }
  return { valid: true, email: invite.email, clientName: invite.client.name };
}

export async function acceptInvite(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  const { token, password } = parsed.data;

  const invite = await prisma.invite.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return { ok: false, message: "This invite is no longer valid." };
  }

  const existing = await prisma.user.findUnique({
    where: { email: invite.email },
  });
  if (existing) {
    return { ok: false, message: "An account with this email already exists." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Creating the user and consuming the invite must happen together, so a
  // token can never be redeemed twice.
  await prisma.$transaction([
    prisma.user.create({
      data: {
        email: invite.email,
        role: "CLIENT",
        passwordHash,
        agencyId: invite.agencyId,
        clientId: invite.clientId,
      },
    }),
    prisma.invite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    }),
  ]);

  redirect("/client/login?accepted=1");
}
