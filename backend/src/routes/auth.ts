import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Invite } from "../models/Invite";
import { Institution } from "../models/Institution";
import { FacultyProfile } from "../models/FacultyProfile";
import { RecruiterProfile } from "../models/RecruiterProfile";
import { RefreshSession } from "../models/RefreshSession";
import { StudentProfile } from "../models/StudentProfile";
import { User, type UserDocument } from "../models/User";
import { requireAuth, requireInstitutionScope, requireRole } from "../middleware/auth";
import {
  clearRefreshCookie,
  createSession,
  hashToken,
  readRefreshToken,
  verifyRefreshToken,
} from "../services/token-service";
import { queueMatchingRecompute } from "../services/matching-service";
import { StudentRosterEntry } from "../models/StudentRosterEntry";
import { RecruiterOrganization } from "../models/RecruiterOrganization";
import { InstitutionLead } from "../models/InstitutionLead";
import { issueActivationInvite } from "../services/invite-issuance-service";

const router = Router();
const passwordSchema = z.string().min(8, "Use at least 8 characters.").regex(/[A-Z]/, "Add an uppercase letter.").regex(/[a-z]/, "Add a lowercase letter.").regex(/[0-9]/, "Add a number.");

function destinationFor(user: UserDocument, onboardingCompleted = true) {
  if (user.role === "student") return onboardingCompleted ? "student-dashboard" : "student-onboarding";
  if (user.role === "platform_admin") return "platform-admin-console";
  if (user.role === "tpo") return "tpo-dashboard";
  if (user.role === "recruiter") return "recruiter-dashboard";
  return "faculty-dashboard";
}

async function publicUser(user: UserDocument) {
  const profile = user.role === "student" ? await StudentProfile.findOne({ userId: user._id }).lean() : null;
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    institutionId: user.institutionId?.toString() ?? null,
    recruiterOrgId: user.recruiterOrgId?.toString() ?? null,
    studentVerificationStatus: user.studentVerificationStatus ?? null,
    onboardingCompleted: profile?.onboardingCompleted ?? user.role !== "student",
    destination: destinationFor(user, profile?.onboardingCompleted ?? false),
  };
}

type InviteState = "valid" | "expired" | "already_used" | "invalid";

async function resolveInvite(rawToken: string) {
  if (rawToken.length < 20 || rawToken.length > 256) return { state: "invalid" as InviteState, invite: null };
  const invite = await Invite.findOne({ tokenHash: hashToken(rawToken) });
  if (!invite || invite.status === "revoked") return { state: "invalid" as InviteState, invite: null };
  if (invite.role === "recruiter") {
    if (invite.status === "pending") { invite.status = "revoked"; await invite.save(); }
    return { state: "invalid" as InviteState, invite: null };
  }
  if (invite.status === "accepted") return { state: "already_used" as InviteState, invite };
  if (invite.status === "expired" || invite.expiresAt.getTime() <= Date.now()) {
    if (invite.status === "pending") {
      invite.status = "expired";
      await invite.save();
    }
    return { state: "expired" as InviteState, invite };
  }
  return { state: "valid" as InviteState, invite };
}

function inviteStateResponse(state: InviteState) {
  if (state === "expired") return { status: 410, code: "INVITE_EXPIRED", message: "This invite has expired. Ask your institution administrator to send a new one." };
  if (state === "already_used") return { status: 409, code: "INVITE_ALREADY_USED", message: "This invite has already been used. Sign in with the account created from it." };
  return { status: 400, code: "INVITE_INVALID", message: "This invite link is invalid or malformed. Check the full link or request a new invite." };
}

router.post("/register", async (request, response, next) => {
  try {
    const input = z.object({
      name: z.string().trim().min(2).max(80),
      email: z.string().email(),
      password: passwordSchema,
    }).parse(request.body);
    const email = input.email.toLowerCase();
    if (await User.exists({ email })) return response.status(409).json({ message: "An account with this email already exists." });
    const domain = email.split("@")[1];
    const institution = await Institution.findOne({ status: "active", $or: [{ approvedEmailDomains: domain }, { officialDomains: domain }] });
    if (!institution) return response.status(403).json({ code: "DOMAIN_NOT_RECOGNIZED", message: `The email domain @${domain} is not recognized for any Placeble institution. Ask your placement office to contact us.` });
    const rosterEntry = await StudentRosterEntry.findOne({ institutionId: institution._id, email, status: "unmatched", matchedUserId: null });
    if (!rosterEntry) return response.status(403).json({ code: "ROSTER_ENTRY_REQUIRED", message: "Your email has not been added to this institution’s student roster. Ask your placement office or TPO to add it before you sign up." });
    const verificationStatus = "pending_tpo_approval";
    const user = await User.create({
      name: input.name,
      email,
      passwordHash: await bcrypt.hash(input.password, 12),
      role: "student",
      institutionId: institution._id,
      studentVerificationStatus: verificationStatus,
      authProvider: "password",
      status: "pending",
      emailVerified: false,
    }) as UserDocument;
    await StudentProfile.create({ userId: user._id, institutionId: institution._id, onboardingCompleted: false });
    await StudentRosterEntry.updateOne({ _id: rosterEntry._id, status: "unmatched", matchedUserId: null }, { $set: { matchedUserId: user._id, status: "matched" } });
    return response.status(202).json({ code: "ACCOUNT_PENDING", user: await publicUser(user), verification: verificationStatus, institutionName: institution.name, message: "Your signup is complete and is waiting for approval from your institution TPO." });
  } catch (error) { return next(error); }
});

router.post("/recruiter-register", async (request, response, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(2).max(80), companyName: z.string().trim().min(2).max(120), email: z.string().email(), password: passwordSchema }).parse(request.body);
    const email = input.email.toLowerCase();
    if (await User.exists({ email })) return response.status(409).json({ message: "An account with this email already exists." });
    const domain = email.split("@")[1];
    if (["gmail.com", "outlook.com", "hotmail.com", "yahoo.com"].includes(domain)) return response.status(400).json({ code: "WORK_EMAIL_REQUIRED", message: "Use your company email so we can verify the organization domain." });
    let organization = await RecruiterOrganization.findOne({ companyDomain: domain });
    if (!organization) organization = await RecruiterOrganization.create({ companyName: input.companyName, companyDomain: domain, verificationStatus: "pending" });
    if (organization.verificationStatus === "rejected") return response.status(403).json({ code: "ORGANIZATION_REJECTED", message: "This company domain cannot currently register on Placeble. Contact support if this looks incorrect." });
    const user = await User.create({ name: input.name, email, passwordHash: await bcrypt.hash(input.password, 12), role: "recruiter", recruiterOrgId: organization._id, authProvider: "password", status: organization.verificationStatus === "verified" ? "active" : "pending", emailVerified: false }) as UserDocument;
    await RecruiterProfile.create({ userId: user._id, companyName: organization.companyName, institutionIds: [], driveIds: [] });
    if (user.status === "pending") return response.status(202).json({ code: "COMPANY_VERIFICATION_PENDING", user: await publicUser(user), companyName: organization.companyName, message: "Your company registration is being verified by Placeble." });
    const accessToken = await createSession(user, request, response);
    return response.status(201).json({ accessToken, user: await publicUser(user) });
  } catch (error) { return next(error); }
});

router.post("/institution-leads", async (request, response, next) => {
  try {
    const input = z.object({ institutionName: z.string().trim().min(2).max(160), contactName: z.string().trim().min(2).max(80), workEmail: z.string().email(), note: z.string().trim().max(1000).default("") }).parse(request.body);
    await InstitutionLead.create({ ...input, workEmail: input.workEmail.toLowerCase() });
    return response.status(201).json({ message: "Thanks — our institution team will contact you shortly." });
  } catch (error) { return next(error); }
});

router.post("/login", async (request, response, next) => {
  try {
    const input = z.object({
      email: z.string().email(),
      password: z.string().min(1),
      portal: z.enum(["student", "institution"]).default("student"),
    }).parse(request.body);
    const user = await User.findOne({ email: input.email.toLowerCase() }) as UserDocument | null;
    if (!user && input.portal === "institution") {
      return response.status(403).json({ message: "This email hasn’t been invited by an institution yet.", code: "UNINVITED" });
    }
    if (!user?.passwordHash || !(await bcrypt.compare(input.password, user.passwordHash))) {
      return response.status(401).json({ message: "Email or password is incorrect." });
    }
    if (user.status === "pending") return response.status(202).json({ code: user.role === "recruiter" ? "COMPANY_VERIFICATION_PENDING" : "ACCOUNT_PENDING", user: await publicUser(user), message: user.role === "recruiter" ? "Your company registration is still being verified by Placeble." : "Your signup is waiting for approval from your institution TPO." });
    if (user.status === "suspended") return response.status(403).json({ code: "ACCOUNT_SUSPENDED", message: "This account is currently suspended. Contact your Placeble administrator for help." });
    if (user.role === "student" && !["approved", "roster_matched"].includes(user.studentVerificationStatus ?? "")) return response.status(202).json({ code: "ACCOUNT_PENDING", user: await publicUser(user), message: "Your signup is waiting for approval from your institution TPO." });
    user.lastLoginAt = new Date();
    await user.save();
    const accessToken = await createSession(user, request, response);
    return response.json({ accessToken, user: await publicUser(user) });
  } catch (error) { return next(error); }
});

router.post("/refresh", async (request, response) => {
  try {
    const oldToken = readRefreshToken(request);
    if (!oldToken) return response.status(401).json({ message: "No active session." });
    const payload = verifyRefreshToken(oldToken);
    const oldHash = hashToken(oldToken);
    const oldSession = await RefreshSession.findOne({ tokenHash: oldHash, revokedAt: null, expiresAt: { $gt: new Date() } });
    if (!oldSession) {
      clearRefreshCookie(response);
      return response.status(401).json({ message: "This session is no longer valid." });
    }
    const user = await User.findById(payload.userId) as UserDocument | null;
    if (!user || user.status !== "active") return response.status(401).json({ message: "This account is not active." });
    oldSession.revokedAt = new Date();
    const newToken = await (async () => {
      const accessToken = await createSession(user, request, response);
      const refreshToken = readRefreshTokenFromResponse(response);
      oldSession.replacedByTokenHash = refreshToken ? hashToken(refreshToken) : null;
      await oldSession.save();
      return accessToken;
    })();
    return response.json({ accessToken: newToken, user: await publicUser(user) });
  } catch {
    clearRefreshCookie(response);
    return response.status(401).json({ message: "This session is no longer valid." });
  }
});

function readRefreshTokenFromResponse(response: import("express").Response) {
  const cookieHeader = response.getHeader("set-cookie");
  const cookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
  if (typeof cookie !== "string") return null;
  const match = cookie.match(/^placeble_refresh=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

router.post("/logout", async (request, response) => {
  const token = readRefreshToken(request);
  if (token) await RefreshSession.updateOne({ tokenHash: hashToken(token) }, { revokedAt: new Date() });
  clearRefreshCookie(response);
  return response.status(204).send();
});

router.get("/me", requireAuth, async (request, response) => {
  const user = await User.findById(request.auth!.userId) as UserDocument | null;
  if (!user) return response.status(404).json({ message: "Account not found." });
  return response.json({ user: await publicUser(user) });
});

router.get("/profile", requireAuth, requireRole("student"), async (request, response) => {
  const [user, profile] = await Promise.all([
    User.findById(request.auth!.userId).select("name email").lean(),
    StudentProfile.findOne({ userId: request.auth!.userId }).lean(),
  ]);
  if (!user) return response.status(404).json({ message: "Account not found." });
  return response.json({ profile: { name: user.name, email: user.email, degree: profile?.degree ?? "", graduationYear: profile?.graduationYear ?? new Date().getFullYear(), skills: profile?.skills ?? [], preferredRoles: profile?.preferredRoles ?? [] } });
});

router.patch("/profile", requireAuth, requireRole("student"), async (request, response) => {
  const input = z.object({
    name: z.string().trim().min(2).max(80),
    degree: z.string().trim().min(2).max(120),
    graduationYear: z.coerce.number().min(new Date().getFullYear()).max(new Date().getFullYear() + 8),
    skills: z.array(z.string().trim().min(1).max(60)).min(1).max(40),
    preferredRoles: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  }).parse(request.body);
  await Promise.all([
    User.updateOne({ _id: request.auth!.userId }, { $set: { name: input.name } }),
    StudentProfile.findOneAndUpdate({ userId: request.auth!.userId }, { $set: { degree: input.degree, graduationYear: input.graduationYear, skills: input.skills, preferredRoles: input.preferredRoles, onboardingCompleted: true, embedding: [], embeddingProfileVersion: 0 }, $inc: { profileVersion: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true }),
  ]);
  queueMatchingRecompute(request.auth!.userId, { studentId: request.auth!.userId });
  const user = await User.findById(request.auth!.userId) as UserDocument;
  return response.json({ user: await publicUser(user), message: "Profile updated." });
});

router.post("/forgot-password", async (request, response) => {
  z.object({ email: z.string().email() }).parse(request.body);
  return response.json({ message: "If an account exists for that email, reset instructions will be sent.", delivery: "provider_not_configured" });
});

router.post("/onboarding", requireAuth, requireRole("student"), async (request, response) => {
  const input = z.object({
    degree: z.string().min(2),
    graduationYear: z.coerce.number().min(new Date().getFullYear()).max(new Date().getFullYear() + 8),
    skills: z.array(z.string().min(1)).min(1),
    preferredRoles: z.array(z.string().min(1)).min(1),
  }).parse(request.body);
  await StudentProfile.findOneAndUpdate({ userId: request.auth!.userId }, { $set: { ...input, onboardingCompleted: true, embedding: [], embeddingProfileVersion: 0 }, $inc: { profileVersion: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  queueMatchingRecompute(request.auth!.userId, { studentId: request.auth!.userId });
  const user = await User.findById(request.auth!.userId) as UserDocument;
  return response.json({ user: await publicUser(user) });
});

router.post("/invites", requireAuth, requireRole("tpo"), requireInstitutionScope, async (request, response) => {
  const input = z.object({
    email: z.string().email(),
    role: z.enum(["faculty", "tpo"]),
    driveIds: z.array(z.string()).default([]),
  }).parse(request.body);
  const issued = await issueActivationInvite({ name: "", email: input.email, role: input.role, institutionId: request.institutionScope!, driveIds: input.driveIds, invitedBy: request.auth!.userId });
  return response.status(201).json({
    invite: { id: issued.invite._id, email: issued.invite.email, role: issued.invite.role, status: issued.invite.status },
    activationPath: issued.activationPath,
    delivery: "provider_not_configured",
  });
});

router.get("/activate", async (request, response, next) => {
  try {
    const token = typeof request.query.token === "string" ? request.query.token.trim() : "";
    const result = await resolveInvite(token);
    if (result.state !== "valid" || !result.invite) {
      const failure = inviteStateResponse(result.state);
      return response.status(failure.status).json({ code: failure.code, state: result.state, message: failure.message });
    }
    const institution = await Institution.findById(result.invite.institutionId).select("name").lean();
    return response.json({
      state: "valid",
      invite: {
        email: result.invite.email,
        name: result.invite.name,
        role: result.invite.role,
        purpose: result.invite.purpose,
        institutionId: result.invite.institutionId.toString(),
        institutionName: institution?.name ?? "Your institution",
        expiresAt: result.invite.expiresAt,
      },
    });
  } catch (error) { return next(error); }
});

router.post("/activate", async (request, response) => {
  const rawToken = typeof request.body?.token === "string" ? request.body.token.trim() : "";
  const resolved = await resolveInvite(rawToken);
  if (resolved.state !== "valid" || !resolved.invite) {
    const failure = inviteStateResponse(resolved.state);
    return response.status(failure.status).json({ code: failure.code, state: resolved.state, message: failure.message });
  }
  const input = z.object({ name: z.string().trim().min(2).max(80), password: passwordSchema }).parse(request.body);
  const invite = resolved.invite;
  if (invite.purpose !== "credential_reissue" && await User.exists({ email: invite.email })) {
    return response.status(409).json({ code: "INVITE_ACCOUNT_EXISTS", state: "already_used", message: "An account already exists for this invited email. Sign in instead." });
  }
  const claimed = await Invite.findOneAndUpdate(
    { _id: invite._id, status: "pending", expiresAt: { $gt: new Date() } },
    { $set: { status: "accepted", acceptedAt: new Date() } },
    { new: true },
  );
  if (!claimed) {
    const latest = await resolveInvite(rawToken);
    const failure = inviteStateResponse(latest.state);
    return response.status(failure.status).json({ code: failure.code, state: latest.state, message: failure.message });
  }
  let createdUserId: string | null = null;
  try {
    if (claimed.purpose === "credential_reissue") {
      const existingUser = await User.findOne({
        _id: claimed.targetUserId,
        email: claimed.email,
        role: claimed.role,
        institutionId: claimed.institutionId,
        status: { $ne: "suspended" },
      }) as UserDocument | null;
      if (!existingUser) {
        await Invite.updateOne({ _id: claimed._id }, { $set: { status: "revoked" } });
        return response.status(409).json({ code: "CREDENTIAL_TARGET_INVALID", state: "invalid", message: "This credential reset no longer matches an active TPO account." });
      }
      existingUser.name = input.name;
      existingUser.passwordHash = await bcrypt.hash(input.password, 12);
      existingUser.passwordChangedAt = new Date();
      existingUser.emailVerified = true;
      await existingUser.save();
      const accessToken = await createSession(existingUser, request, response);
      return response.json({ message: "Your credentials have been reset.", accessToken, user: await publicUser(existingUser) });
    }
    const user = await User.create({
      name: input.name,
      email: claimed.email,
      passwordHash: await bcrypt.hash(input.password, 12),
      role: claimed.role,
      institutionId: claimed.institutionId,
      authProvider: "password",
      status: "active",
      emailVerified: true,
    }) as UserDocument;
    createdUserId = user._id.toString();
    if (user.role === "faculty") {
      await FacultyProfile.create({ userId: user._id, institutionId: claimed.institutionId, cohortLabels: [] });
    }
    const accessToken = await createSession(user, request, response);
    return response.status(201).json({ message: "Your account is active.", accessToken, user: await publicUser(user) });
  } catch (error) {
    if (createdUserId) {
      await Promise.all([
        FacultyProfile.deleteMany({ userId: createdUserId }),
        User.deleteOne({ _id: createdUserId }),
      ]);
    }
    await Invite.updateOne({ _id: claimed._id, status: "accepted" }, { $set: { status: "pending", acceptedAt: null } });
    throw error;
  }
});

export { router as authRouter };
