import crypto from "node:crypto";
import { type Types } from "mongoose";
import { Invite } from "../models/Invite";
import { hashToken } from "./token-service";

export async function issueActivationInvite(input: {
  name: string;
  email: string;
  role: "tpo" | "faculty";
  institutionId: string | Types.ObjectId;
  invitedBy: string | Types.ObjectId;
  expiresInHours?: number;
  revokePrevious?: boolean;
  purpose?: "account_activation" | "credential_reissue";
  targetUserId?: string | Types.ObjectId;
  driveIds?: string[];
}) {
  const email = input.email.trim().toLowerCase();
  if (input.revokePrevious) {
    await Invite.updateMany({ email, institutionId: input.institutionId, role: input.role, status: "pending" }, { $set: { status: "revoked" } });
  }
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const invite = await Invite.create({
    name: input.name,
    email,
    role: input.role,
    purpose: input.purpose ?? "account_activation",
    targetUserId: input.targetUserId ?? null,
    institutionId: input.institutionId,
    driveIds: input.driveIds ?? [],
    tokenHash: hashToken(rawToken),
    invitedBy: input.invitedBy,
    expiresAt: new Date(Date.now() + (input.expiresInHours ?? 48) * 60 * 60 * 1000),
  });
  return { invite, rawToken, activationPath: `/activate?token=${rawToken}` };
}
