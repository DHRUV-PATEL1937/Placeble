import crypto from "node:crypto";
import { type Types } from "mongoose";
import { Invite } from "../models/Invite";
import { hashToken } from "./token-service";
import { appLink, queueEmail } from "./email-service";

const ROLE_LABEL = { tpo: "TPO", faculty: "faculty", principal: "principal", university_admin: "university TPO" } as const;

export async function issueActivationInvite(input: {
  name: string;
  email: string;
  role: "tpo" | "faculty" | "principal" | "university_admin";
  /** Required for tpo / faculty / principal. */
  institutionId?: string | Types.ObjectId | null;
  /** Required for university_admin. */
  universityId?: string | Types.ObjectId | null;
  invitedBy: string | Types.ObjectId;
  expiresInHours?: number;
  revokePrevious?: boolean;
  purpose?: "account_activation" | "credential_reissue";
  targetUserId?: string | Types.ObjectId;
  driveIds?: string[];
}) {
  const email = input.email.trim().toLowerCase();
  if (input.role === "university_admin" ? !input.universityId : !input.institutionId) throw new Error("An invite needs the institute (or university) it belongs to.");
  if (input.revokePrevious) {
    await Invite.updateMany({ email, institutionId: input.institutionId ?? null, universityId: input.universityId ?? null, role: input.role, status: "pending" }, { $set: { status: "revoked" } });
  }
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const invite = await Invite.create({
    name: input.name,
    email,
    role: input.role,
    purpose: input.purpose ?? "account_activation",
    targetUserId: input.targetUserId ?? null,
    institutionId: input.institutionId ?? null,
    universityId: input.universityId ?? null,
    driveIds: input.driveIds ?? [],
    tokenHash: hashToken(rawToken),
    invitedBy: input.invitedBy,
    expiresAt: new Date(Date.now() + (input.expiresInHours ?? 48) * 60 * 60 * 1000),
  });
  const activationPath = `/activate?token=${rawToken}`;
  const delivery = await queueEmail({ key: `invite:${invite._id}`, to: email,
    subject: input.purpose === "credential_reissue" ? "Reset your Placeble credentials" : "You are invited to Placeble",
    text: `Hello ${input.name || "there"},\n\nYour ${ROLE_LABEL[input.role]} workspace is ready. Set your password using this secure link:\n${appLink(activationPath)}\n\nThis link expires at ${invite.expiresAt.toISOString()}. If you did not expect this invitation, ignore this email.`, expiresAt: invite.expiresAt });
  return { invite, rawToken, activationPath, delivery };
}
