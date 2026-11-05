import { exclusiveDomains } from "./validation";
import { type Types } from "mongoose";
import { Institution } from "../models/Institution";
import { Invite } from "../models/Invite";
import { User } from "../models/User";
import { issueActivationInvite } from "./invite-issuance-service";

export type CreateInstituteInput = {
  name: string;
  approvedEmailDomains: string[];
  tpoName: string;
  tpoEmail: string;
  universityId?: string | Types.ObjectId | null;
  /** The platform admin who created it, when we create it (null when a university TPO does). */
  createdByPlatformAdminId?: string | Types.ObjectId | null;
  invitedBy: string | Types.ObjectId;
};

export type CreateInstituteResult =
  | { ok: true; institution: InstanceType<typeof Institution>; issued: Awaited<ReturnType<typeof issueActivationInvite>> }
  | { ok: false; status: number; code?: string; message: string };

/**
 * Creates an institute and invites its first TPO. Shared by the platform admin and a university TPO.
 * The institute is rolled back if the invite can't be created, so it never exists without an owner.
 */
export async function createInstitute(input: CreateInstituteInput): Promise<CreateInstituteResult> {
  const domains = [...new Set(input.approvedEmailDomains.map(domain => domain.trim().toLowerCase()))];
  // Shared providers like gmail.com can belong to any number of colleges; every other domain belongs to one.
  const owned = exclusiveDomains(domains);
  const domainOwner = owned.length ? await Institution.findOne({ $or: [{ approvedEmailDomains: { $in: owned } }, { officialDomains: { $in: owned } }] }).select("name").lean() : null;
  if (domainOwner) return { ok: false, status: 409, code: "DOMAIN_ALREADY_ASSIGNED", message: `One of these domains is already assigned to ${domainOwner.name}.` };
  if (await User.exists({ email: input.tpoEmail.toLowerCase() })) return { ok: false, status: 409, message: "An account already exists for the first TPO email." };

  const slugBase = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 54) || "institution";
  let slug = slugBase;
  for (let suffix = 2; await Institution.exists({ slug }); suffix += 1) slug = `${slugBase}-${suffix}`;

  const institution = await Institution.create({
    name: input.name, slug, approvedEmailDomains: domains, officialDomains: domains, status: "active",
    universityId: input.universityId ?? null, createdByPlatformAdminId: input.createdByPlatformAdminId ?? null,
  });
  try {
    const issued = await issueActivationInvite({ name: input.tpoName, email: input.tpoEmail, role: "tpo", institutionId: institution._id, invitedBy: input.invitedBy });
    return { ok: true, institution, issued };
  } catch (error) {
    await Promise.all([Institution.deleteOne({ _id: institution._id }), Invite.deleteMany({ institutionId: institution._id })]);
    throw error;
  }
}
