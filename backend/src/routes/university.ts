import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { personName } from "../services/validation";
import { requireAuth, requireRole } from "../middleware/auth";
import { Institution } from "../models/Institution";
import { Invite } from "../models/Invite";
import { User, type UserDocument } from "../models/User";
import { createInstitute } from "../services/institute-service";
import { issueActivationInvite } from "../services/invite-issuance-service";
import { removeLogo, saveLogo, takeLogo } from "../services/logo-service";
import { universityRollup } from "../services/university-rollup";
import { signActingAccessToken } from "../services/token-service";

const router = Router();
router.use(requireAuth, requireRole("university_admin"));

const objectId = z.string().refine(value => mongoose.isValidObjectId(value), "Invalid id.");
const domain = z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Enter a valid domain like college.edu.");
const permissionKeys = ["roster", "approvals", "recruiters", "settings", "messaging"] as const;

/** Loads an institute only if it belongs to the caller's university. */
async function ownInstitute(universityId: string, institutionId: string) {
  if (!mongoose.isValidObjectId(institutionId)) return null;
  return Institution.findOne({ _id: institutionId, universityId });
}

router.put("/logo", takeLogo, async (request, response) => {
  const result = await saveLogo("university", request.auth!.universityId!, request.file!);
  return response.status(result.status).json(result.status === 200 ? { logoUrl: result.logoUrl } : { message: result.message });
});
router.delete("/logo", async (request, response) => response.status((await removeLogo("university", request.auth!.universityId!)).status === 200 ? 204 : 404).end());

router.get("/overview", async (request, response) => response.json(await universityRollup(request.auth!.universityId!)));

router.post("/institutes", async (request, response, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(2).max(160), approvedEmailDomains: z.array(domain).min(1).max(12), tpoName: personName, tpoEmail: z.string().email() }).parse(request.body);
    const result = await createInstitute({ ...input, universityId: request.auth!.universityId, invitedBy: request.auth!.userId });
    if (!result.ok) return response.status(result.status).json({ code: result.code, message: result.message });
    return response.status(201).json({ institution: result.institution, invite: { email: result.issued.invite.email, expiresAt: result.issued.invite.expiresAt }, activationPath: result.issued.activationPath, delivery: result.issued.delivery });
  } catch (error) { return next(error); }
});

router.patch("/institutes/:institutionId/status", async (request, response, next) => {
  try {
    const input = z.object({ status: z.enum(["active", "suspended"]) }).parse(request.body);
    const institute = await ownInstitute(request.auth!.universityId!, request.params.institutionId as string);
    if (!institute) return response.status(404).json({ message: "Institute not found in your university." });
    institute.status = input.status;
    await institute.save();
    return response.json({ institution: institute });
  } catch (error) { return next(error); }
});

/** Issues a short-lived token that lets the university TPO work inside one of its institutes as that institute's TPO. */
router.post("/institutes/:institutionId/enter", async (request, response) => {
  const institute = await ownInstitute(request.auth!.universityId!, request.params.institutionId as string);
  if (!institute) return response.status(404).json({ message: "Institute not found in your university." });
  if (institute.status !== "active") return response.status(409).json({ message: "This institute is suspended." });
  const user = await User.findById(request.auth!.userId) as UserDocument | null;
  if (!user) return response.status(401).json({ message: "This account is not active." });
  return response.json({ accessToken: signActingAccessToken(user, String(institute._id)), institution: { id: String(institute._id), name: institute.name } });
});

router.get("/institutes/:institutionId/team", async (request, response) => {
  const institute = await ownInstitute(request.auth!.universityId!, request.params.institutionId as string);
  if (!institute) return response.status(404).json({ message: "Institute not found in your university." });
  const [members, invites] = await Promise.all([
    User.find({ institutionId: institute._id, role: { $in: ["tpo", "principal"] } }).sort({ role: 1, createdAt: 1 }).select("name email role status lastLoginAt tpoPermissions createdAt").lean(),
    Invite.find({ institutionId: institute._id, role: { $in: ["tpo", "principal"] }, status: "pending", expiresAt: { $gt: new Date() }, purpose: "account_activation" }).select("email name role expiresAt").lean(),
  ]);
  return response.json({
    institution: { id: String(institute._id), name: institute.name },
    members: members.map(member => ({ id: String(member._id), name: member.name, email: member.email, role: member.role, status: member.status, lastLoginAt: member.lastLoginAt ?? null, permissions: member.role === "tpo" ? { roster: true, approvals: true, recruiters: true, settings: true, messaging: true, ...(member.tpoPermissions ?? {}) } : null })),
    invites: invites.map(invite => ({ id: String(invite._id), email: invite.email, name: invite.name, role: invite.role, expiresAt: invite.expiresAt })),
  });
});

router.post("/institutes/:institutionId/team", async (request, response, next) => {
  try {
    const input = z.object({ name: personName, email: z.string().email(), role: z.enum(["tpo", "principal"]) }).parse(request.body);
    const institute = await ownInstitute(request.auth!.universityId!, request.params.institutionId as string);
    if (!institute) return response.status(404).json({ message: "Institute not found in your university." });
    if (await User.exists({ email: input.email.toLowerCase() })) return response.status(409).json({ message: "An account already exists for this email." });
    const issued = await issueActivationInvite({ name: input.name, email: input.email, role: input.role, institutionId: institute._id, invitedBy: request.auth!.userId });
    return response.status(201).json({ invite: { email: issued.invite.email, expiresAt: issued.invite.expiresAt }, activationPath: issued.activationPath, delivery: issued.delivery });
  } catch (error) { return next(error); }
});

router.patch("/institutes/:institutionId/team/:userId", async (request, response, next) => {
  try {
    const input = z.object({
      status: z.enum(["active", "suspended"]).optional(),
      permissions: z.object(Object.fromEntries(permissionKeys.map(key => [key, z.boolean().optional()]))).optional(),
    }).parse(request.body);
    const institute = await ownInstitute(request.auth!.universityId!, request.params.institutionId as string);
    if (!institute) return response.status(404).json({ message: "Institute not found in your university." });
    if (!mongoose.isValidObjectId(request.params.userId)) return response.status(404).json({ message: "Team member not found." });
    const member = await User.findOne({ _id: request.params.userId, institutionId: institute._id, role: { $in: ["tpo", "principal"] } });
    if (!member) return response.status(404).json({ message: "Team member not found." });
    if (input.status) member.status = input.status;
    if (input.permissions) {
      if (member.role !== "tpo") return response.status(400).json({ message: "Permissions apply to institute TPOs only." });
      for (const key of permissionKeys) if (input.permissions[key] !== undefined) member.set(`tpoPermissions.${key}`, input.permissions[key]);
    }
    await member.save();
    return response.json({ member: { id: String(member._id), status: member.status, permissions: member.role === "tpo" ? { roster: true, approvals: true, recruiters: true, settings: true, messaging: true, ...(member.toObject().tpoPermissions ?? {}) } : null } });
  } catch (error) { return next(error); }
});

/** Invite another university TPO. */
router.post("/team", async (request, response, next) => {
  try {
    const input = z.object({ name: personName, email: z.string().email() }).parse(request.body);
    if (await User.exists({ email: input.email.toLowerCase() })) return response.status(409).json({ message: "An account already exists for this email." });
    const issued = await issueActivationInvite({ name: input.name, email: input.email, role: "university_admin", universityId: request.auth!.universityId!, invitedBy: request.auth!.userId });
    return response.status(201).json({ invite: { email: issued.invite.email, expiresAt: issued.invite.expiresAt }, activationPath: issued.activationPath, delivery: issued.delivery });
  } catch (error) { return next(error); }
});

export { router as universityRouter };
