import crypto from "node:crypto";
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

const router = Router();
const passwordSchema = z.string().min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/);

function destinationFor(user: UserDocument, onboardingCompleted = true) {
  if (user.role === "student") return onboardingCompleted ? "student-dashboard" : "student-onboarding";
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
    onboardingCompleted: profile?.onboardingCompleted ?? user.role !== "student",
    destination: destinationFor(user, profile?.onboardingCompleted ?? false),
  };
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
    const user = await User.create({
      name: input.name,
      email,
      passwordHash: await bcrypt.hash(input.password, 12),
      role: "student",
      authProvider: "password",
      status: "active",
      emailVerified: false,
    }) as UserDocument;
    await StudentProfile.create({ userId: user._id, onboardingCompleted: false });
    const accessToken = await createSession(user, request, response);
    return response.status(201).json({ accessToken, user: await publicUser(user), verificationDelivery: "provider_not_configured" });
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
    if (user.status === "pending") return response.status(202).json({ code: "ACCOUNT_PENDING", user: await publicUser(user) });
    if (user.status === "suspended") return response.status(403).json({ code: "ACCOUNT_SUSPENDED", message: "This account is currently suspended. Contact your Placeble administrator for help." });
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
  await StudentProfile.findOneAndUpdate({ userId: request.auth!.userId }, { ...input, onboardingCompleted: true }, { upsert: true, new: true });
  const user = await User.findById(request.auth!.userId) as UserDocument;
  return response.json({ user: await publicUser(user) });
});

router.post("/invites", requireAuth, requireRole("tpo"), requireInstitutionScope, async (request, response) => {
  const input = z.object({
    email: z.string().email(),
    role: z.enum(["recruiter", "faculty"]),
    driveIds: z.array(z.string()).default([]),
  }).parse(request.body);
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const invite = await Invite.create({
    email: input.email.toLowerCase(),
    role: input.role,
    institutionId: request.institutionScope,
    driveIds: input.driveIds,
    tokenHash: hashToken(rawToken),
    invitedBy: request.auth!.userId,
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  });
  return response.status(201).json({
    invite: { id: invite._id, email: invite.email, role: invite.role, status: invite.status },
    activationPath: `/activate?token=${rawToken}`,
    delivery: "provider_not_configured",
  });
});

router.post("/activate", async (request, response) => {
  const input = z.object({ token: z.string().min(20), name: z.string().min(2), password: passwordSchema }).parse(request.body);
  const invite = await Invite.findOne({ tokenHash: hashToken(input.token), status: "pending", expiresAt: { $gt: new Date() } });
  if (!invite) return response.status(410).json({ message: "This activation link has expired. Ask your institution for a new invite." });
  if (await User.exists({ email: invite.email })) return response.status(409).json({ message: "An account already exists for this email." });
  const user = await User.create({
    name: input.name,
    email: invite.email,
    passwordHash: await bcrypt.hash(input.password, 12),
    role: invite.role,
    institutionId: invite.institutionId,
    authProvider: "password",
    status: "active",
    emailVerified: true,
  });
  invite.status = "accepted";
  invite.acceptedAt = new Date();
  await invite.save();
  if (user.role === "recruiter") {
    await RecruiterProfile.create({ userId: user._id, companyName: "Pending setup", institutionIds: [invite.institutionId], driveIds: invite.driveIds });
  }
  if (user.role === "faculty") {
    await FacultyProfile.create({ userId: user._id, institutionId: invite.institutionId, cohortLabels: [] });
  }
  return response.status(201).json({ message: "Your account is active. You can now sign in.", role: user.role });
});

router.post("/tpo-registration", async (request, response) => {
  const input = z.object({ name: z.string().min(2), email: z.string().email(), password: passwordSchema, institutionName: z.string().min(2) }).parse(request.body);
  const domain = input.email.split("@")[1].toLowerCase();
  const institution = await Institution.findOne({ officialDomains: domain });
  const user = await User.create({
    name: input.name,
    email: input.email.toLowerCase(),
    passwordHash: await bcrypt.hash(input.password, 12),
    role: "tpo",
    institutionId: institution?._id ?? null,
    status: institution ? "active" : "pending",
    emailVerified: false,
  });
  return response.status(201).json({ user: await publicUser(user as UserDocument), verification: institution ? "domain_verified" : "manual_review" });
});

export { router as authRouter };
