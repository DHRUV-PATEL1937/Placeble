import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { B2C_EMAIL_DOMAIN, personName } from "../services/validation";
import { Invite } from "../models/Invite";
import { pilotState } from "../services/pilot-service";
import { Institution } from "../models/Institution";
import { University } from "../models/University";
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
  signAccessToken,
  verifyRefreshToken,
} from "../services/token-service";
import { queueMatchingRecompute } from "../services/matching-service";
import { StudentRosterEntry } from "../models/StudentRosterEntry";
import { RecruiterOrganization } from "../models/RecruiterOrganization";
import { InstitutionLead } from "../models/InstitutionLead";
import { issueActivationInvite } from "../services/invite-issuance-service";
import { instituteDetailsFor } from "../services/student-account-service";
import { currentPlan } from "../services/plans";
import { closesAt, studentAccess } from "../models/Batch";
import { onboardingState } from "../services/onboarding-service";
import { getPrograms, programByCode, programHasCaseStudy, programHasCoding, programHasHrSimulator } from "../services/program-service";
import { ProfileChangeRequest, profileChangeFields } from "../models/ProfileChangeRequest";
import { EmailActionToken } from "../models/EmailActionToken";
import { sendAccountLink } from "../services/account-email-service";
import { appLink, emailAudience, emailConfigured, queueEmail } from "../services/email-service";
import { emailRateLimit } from "../middleware/email-rate-limit";

const router = Router();
const passwordSchema = z.string().min(8, "Use at least 8 characters.").regex(/[A-Z]/, "Add an uppercase letter.").regex(/[a-z]/, "Add a lowercase letter.").regex(/[0-9]/, "Add a number.");

function destinationFor(user: UserDocument, onboardingCompleted = true) {
  if (user.role === "student") return onboardingCompleted ? "student-dashboard" : "student-onboarding";
  if (user.role === "platform_admin") return "platform-admin-console";
  if (user.role === "tpo") return "tpo-dashboard";
  if (user.role === "university_admin") return "university-dashboard";
  if (user.role === "principal") return "principal-dashboard";
  if (user.role === "recruiter") return "recruiter-dashboard";
  return "faculty-dashboard";
}

/** The logo and name each person sees in their sidebar: their college, and its university if it has one. */
/** True when this person's college or university is on a pilot that has run out. */
async function tenantPilotEnded(user: UserDocument) {
  const institute = user.institutionId ? await Institution.findById(user.institutionId).select("commercial universityId").lean() : null;
  const universityId = institute?.universityId ?? user.universityId ?? null;
  const university = universityId ? await University.findById(universityId).select("commercial").lean() : null;
  return pilotState(institute?.commercial).expired || pilotState(university?.commercial).expired;
}

async function brandingFor(user: UserDocument) {
  const institute = user.institutionId ? await Institution.findById(user.institutionId).select("name logoUrl universityId commercial").lean() : null;
  const universityId = institute?.universityId ?? user.universityId ?? null;
  const university = universityId ? await University.findById(universityId).select("name logoUrl commercial").lean() : null;
  const staff = user.role !== "student";
  const trial = (commercial: Parameters<typeof pilotState>[0]) => { const state = pilotState(commercial); return staff && state.type === "pilot" ? { pilotEndsAt: state.endsAt, pilotDaysLeft: state.daysLeft } : {}; };
  return {
    institution: institute ? { name: institute.name, logoUrl: institute.logoUrl ?? "", ...trial(institute.commercial) } : null,
    university: university ? { name: university.name, logoUrl: university.logoUrl ?? "", ...trial(university.commercial) } : null,
  };
}

export async function publicUser(user: UserDocument) {
  const profile = user.role === "student" ? await StudentProfile.findOne({ userId: user._id }).lean() : null;
  const direct = user.role === "student" && !user.institutionId;
  const plan = direct ? await currentPlan(user._id) : null;
  const state = user.role === "student" ? onboardingState(profile ?? {}) : "done";
  const access = user.role === "student" ? studentAccess(user.batchEndsAt) : "open";
  const program = await programByCode(profile?.programCode ?? null);
  const branding = user.role === "platform_admin" || user.role === "recruiter" ? null : await brandingFor(user);
  return {
    branding,
    onboarding: user.role === "student" ? { state } : null,
    graduate: access === "graduate" && user.batchEndsAt ? { endedAt: user.batchEndsAt, closesAt: closesAt(user.batchEndsAt) } : null,
    // What the dashboard tailors itself to: the student's programme and the roles they're aiming for.
    guidance: user.role === "student" ? { programCode: program?.code ?? null, programName: program?.name ?? profile?.degree ?? "", interviewStyle: program?.interviewStyle ?? "mixed", roles: profile?.preferredRoles ?? [], tools: { coding: programHasCoding(program), caseStudy: programHasCaseStudy(program), hrSimulator: programHasHrSimulator(program) } } : null,
    accountType: user.role === "student" ? (direct ? "direct" : "institute") : null,
    plan: plan ? { plan: plan.plan, interval: plan.interval, renewsAt: plan.renewsAt } : null,
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    mustChangePassword: Boolean(user.mustChangePassword),
    institutionId: user.institutionId?.toString() ?? null,
    universityId: user.universityId?.toString() ?? null,
    tpoPermissions: user.role === "tpo" ? { roster: true, approvals: true, recruiters: true, settings: true, messaging: true, ...(user.tpoPermissions ?? {}) } : null,
    recruiterOrgId: user.recruiterOrgId?.toString() ?? null,
    studentVerificationStatus: user.studentVerificationStatus ?? null,
    onboardingCompleted: user.role === "student" ? state === "done" : true,
    destination: destinationFor(user, state === "done"),
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

/**
 * Direct (B2C) student signup. These students belong to Placeble, not to an institute: no TPO, no roster,
 * no institute reports. They must verify their email before signing in.
 */
router.post("/register", emailRateLimit, async (request, response, next) => {
  try {
    const input = z.object({
      name: personName,
      email: z.string().trim().email().refine(value => value.toLowerCase().endsWith(`@${B2C_EMAIL_DOMAIN}`), `Sign up with a Gmail address (name@${B2C_EMAIL_DOMAIN}). If your college added you, sign in with the details they emailed you.`),
      password: passwordSchema,
      acceptTerms: z.literal(true, { message: "Please accept the Terms of Service and Privacy Policy." }),
    }).parse(request.body);
    const email = input.email.toLowerCase();
    if (await User.exists({ email })) return response.status(409).json({ code: "EMAIL_IN_USE", message: "An account with this email already exists. Try signing in, or reset your password." });
    const user = await User.create({
      name: input.name, email, passwordHash: await bcrypt.hash(input.password, 12), role: "student",
      institutionId: null, studentVerificationStatus: "approved", authProvider: "password", status: "active",
      // With no email provider (local dev) there is no way to verify, so don't lock people out.
      emailVerified: !emailConfigured(),
    }) as UserDocument;
    await StudentProfile.create({ userId: user._id, institutionId: null, onboardingCompleted: false });
    await sendAccountLink(user, "verify");
    return response.status(201).json({ code: "ACCOUNT_CREATED", emailVerificationRequired: emailConfigured(), message: emailConfigured() ? "Check your email to verify your address, then sign in." : "Your account is ready. Sign in to continue." });
  } catch (error) { return next(error); }
});

router.post("/recruiter-register", async (request, response, next) => {
  try {
    const input = z.object({ name: personName, companyName: z.string().trim().min(2).max(120), email: z.string().email(), password: passwordSchema }).parse(request.body);
    const email = input.email.toLowerCase();
    if (await User.exists({ email })) return response.status(409).json({ message: "An account with this email already exists." });
    const domain = email.split("@")[1];
    if (["gmail.com", "outlook.com", "hotmail.com", "yahoo.com"].includes(domain)) return response.status(400).json({ code: "WORK_EMAIL_REQUIRED", message: "Use your company email so we can verify the organization domain." });
    let organization = await RecruiterOrganization.findOne({ companyDomain: domain });
    if (!organization) organization = await RecruiterOrganization.create({ companyName: input.companyName, companyDomain: domain, verificationStatus: "pending" });
    if (organization.verificationStatus === "rejected") return response.status(403).json({ code: "ORGANIZATION_REJECTED", message: "This company domain cannot currently register on Placeble. Contact support if this looks incorrect." });
    const user = await User.create({ name: input.name, email, passwordHash: await bcrypt.hash(input.password, 12), role: "recruiter", recruiterOrgId: organization._id, authProvider: "password", status: organization.verificationStatus === "verified" ? "active" : "pending", emailVerified: false }) as UserDocument;
    await RecruiterProfile.create({ userId: user._id, companyName: organization.companyName, institutionIds: [], driveIds: [] });
    await sendAccountLink(user, "verify");
    if (user.status === "pending") await emailAudience({ role: "platform_admin", status: "active" }, `company-review:${organization._id}`, "A company is waiting for verification", `A recruiter company signup is waiting in the verification queue. Review it in Placeble: ${appLink("/")}`);
    if (user.status === "pending") return response.status(202).json({ code: "COMPANY_VERIFICATION_PENDING", user: await publicUser(user), companyName: organization.companyName, message: "Your company registration is being verified by Placeble." });
    const accessToken = await createSession(user, request, response);
    return response.status(201).json({ accessToken, user: await publicUser(user) });
  } catch (error) { return next(error); }
});

router.post("/institution-leads", async (request, response, next) => {
  try {
    const input = z.object({ institutionName: z.string().trim().min(2).max(160), contactName: personName, workEmail: z.string().email(), note: z.string().trim().max(1000).default("") }).parse(request.body);
    const lead = await InstitutionLead.create({ ...input, workEmail: input.workEmail.toLowerCase() });
    await emailAudience({ role: "platform_admin", status: "active" }, `lead-review:${lead._id}`, "New institution enquiry", `A new institution enquiry has arrived. Review it securely in your Placeble console: ${appLink("/")}`);
    await queueEmail({ key: `lead:${lead._id}`, to: input.workEmail, subject: "We received your Placeble institution request", text: `Hello ${input.contactName},\n\nThank you for contacting Placeble on behalf of ${input.institutionName}. Our team will review your request and contact you shortly.` });
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
    if (user.role === "student" && !user.institutionId && !user.emailVerified && emailConfigured()) return response.status(403).json({ code: "EMAIL_NOT_VERIFIED", message: "Verify your email address before signing in. Check your inbox for the verification link." });
    if (user.status === "pending") return response.status(202).json({ code: user.role === "recruiter" ? "COMPANY_VERIFICATION_PENDING" : "ACCOUNT_PENDING", user: await publicUser(user), message: user.role === "recruiter" ? "Your company registration is still being verified by Placeble." : "Your signup is waiting for approval from your institution TPO." });
    if (user.status === "suspended") return response.status(403).json({ code: "ACCOUNT_SUSPENDED", message: "This account is currently suspended. Contact your Placeble administrator for help." });
    if (await tenantPilotEnded(user)) return response.status(403).json({ code: "PILOT_ENDED", message: "This pilot has ended, so the workspace is paused. Contact Placeble to continue. Nothing has been deleted." });
    if (user.role === "student" && !["approved", "roster_matched"].includes(user.studentVerificationStatus ?? "")) return response.status(202).json({ code: "ACCOUNT_PENDING", user: await publicUser(user), message: "Your signup is waiting for approval from your institution TPO." });
    if (user.role === "student" && studentAccess(user.batchEndsAt) === "closed") return response.status(403).json({ code: "BATCH_ENDED", message: "Your batch has ended and access has now closed. Contact your placement office if you think this is a mistake." });
    user.lastLoginAt = new Date();
    if (!user.firstLoginAt) user.firstLoginAt = user.lastLoginAt;
    // They received the password at this address, so signing in proves the email works.
    if (!user.emailVerified) user.emailVerified = true;
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
    const oldSession = await RefreshSession.findOne({ tokenHash: oldHash, expiresAt: { $gt: new Date() } });
    if (!oldSession) {
      clearRefreshCookie(response);
      return response.status(401).json({ message: "This session is no longer valid." });
    }

    // Grace period for concurrent requests & multiple tabs / devices (60 seconds)
    const GRACE_PERIOD_MS = 60 * 1000;
    if (oldSession.revokedAt && Date.now() - oldSession.revokedAt.getTime() > GRACE_PERIOD_MS) {
      clearRefreshCookie(response);
      return response.status(401).json({ message: "This session is no longer valid." });
    }

    const user = await User.findById(payload.userId) as UserDocument | null;
    if (!user || user.status !== "active") return response.status(401).json({ message: "This account is not active." });
    // Rotate the refresh cookie at most once a day. Rotating on every refresh meant a phone (Android WebView saves cookies lazily)
    // could come back from a closed app holding an already-replaced cookie and be signed out.
    const ROTATE_AFTER_MS = 24 * 60 * 60 * 1000;
    if (!oldSession.revokedAt && Date.now() - oldSession.createdAt.getTime() < ROTATE_AFTER_MS) {
      return response.json({ accessToken: signAccessToken(user), user: await publicUser(user) });
    }
    if (!oldSession.revokedAt) {
      oldSession.revokedAt = new Date();
    }
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
  const [user, profile, institute] = await Promise.all([
    User.findById(request.auth!.userId).select("name email institutionId").lean(),
    StudentProfile.findOne({ userId: request.auth!.userId }).lean(),
    instituteDetailsFor(request.auth!.userId),
  ]);
  if (!user) return response.status(404).json({ message: "Account not found." });
  if (!user.institutionId) {
    // A direct student owns their details, but once course and graduating year are set they only change through an admin-approved request.
    const courseLocked = Boolean(profile?.degree && profile?.graduationYear);
    const latest = courseLocked ? await ProfileChangeRequest.findOne({ userId: request.auth!.userId }).sort({ createdAt: -1 }).lean() : null;
    return response.json({ profile: {
      name: user.name, email: user.email, rollNumber: "", degree: profile?.degree ?? "", graduationYear: profile?.graduationYear ?? new Date().getFullYear() + 1,
      skills: profile?.skills ?? [], preferredRoles: profile?.preferredRoles ?? [], locked: ["email"],
      courseLocked,
      changeRequest: latest ? { id: String(latest._id), status: latest.status, fields: latest.fields, reason: latest.reason, reviewNote: latest.reviewNote, requestedAt: latest.createdAt, decidedAt: latest.decidedAt } : null,
    } });
  }
  // Name, ID, branch and batch year come from the institute's roster and are read-only for the student.
  return response.json({ profile: {
    name: institute?.fullName ?? user.name, email: user.email,
    rollNumber: institute?.rollNumber ?? "", degree: institute?.branch || profile?.degree || "", graduationYear: institute?.batchYear ?? profile?.graduationYear ?? null,
    skills: profile?.skills ?? [], preferredRoles: profile?.preferredRoles ?? [],
    locked: ["name", "email", "rollNumber", "degree", "graduationYear"],
  } });
});

router.patch("/profile", requireAuth, requireRole("student"), async (request, response) => {
  const account = await User.findById(request.auth!.userId).select("institutionId").lean();
  if (account && !account.institutionId) {
    const userId = request.auth!.userId;
    const current = await StudentProfile.findOne({ userId }).select("degree graduationYear programCode").lean();
    const courseLocked = Boolean(current?.degree && current?.graduationYear);
    // Once set, course and graduating year can only change with an approved request, and that approval is good for one edit.
    const approval = courseLocked ? await ProfileChangeRequest.findOne({ userId, status: "approved" }).lean() : null;
    const own = z.object({
      name: personName,
      degree: z.string().trim().min(2).max(120).optional(),
      graduationYear: z.coerce.number().min(new Date().getFullYear() - 1).max(new Date().getFullYear() + 8).optional(),
      skills: z.array(z.string().trim().min(1).max(60)).min(1).max(40),
      preferredRoles: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
    }).parse(request.body);

    const courseUpdate: Record<string, unknown> = {};
    if (!courseLocked) {
      if (!own.degree || !own.graduationYear) return response.status(400).json({ message: "Choose your programme and graduating year." });
      courseUpdate.degree = own.degree; courseUpdate.graduationYear = own.graduationYear;
    } else {
      const degreeChanged = Boolean(own.degree) && own.degree !== current!.degree;
      const yearChanged = Boolean(own.graduationYear) && own.graduationYear !== current!.graduationYear;
      if (degreeChanged || yearChanged) {
        if (!approval) return response.status(403).json({ code: "COURSE_LOCKED", message: "Your course and graduating year are locked. Send a change request with a reason and an admin will review it." });
        if ((degreeChanged && !approval.fields.includes("degree")) || (yearChanged && !approval.fields.includes("graduationYear"))) {
          return response.status(403).json({ code: "FIELD_NOT_APPROVED", message: "Your request only covers the fields you asked to change." });
        }
        // Spend the one-time approval atomically so two tabs can't both use it.
        const spent = await ProfileChangeRequest.findOneAndUpdate({ _id: approval._id, status: "approved" }, { $set: { status: "used", usedAt: new Date() } });
        if (!spent) return response.status(409).json({ message: "This approval has already been used." });
        if (degreeChanged) courseUpdate.degree = own.degree;
        if (yearChanged) courseUpdate.graduationYear = own.graduationYear;
      }
    }
    if (typeof courseUpdate.degree === "string") {
      const program = (await getPrograms({ includeInactive: true })).find(item => item.name === courseUpdate.degree);
      if (program) courseUpdate.programCode = program.code;
    }
    await Promise.all([
      User.updateOne({ _id: userId }, { $set: { name: own.name } }),
      StudentProfile.findOneAndUpdate({ userId }, { $set: { ...courseUpdate, skills: own.skills, preferredRoles: own.preferredRoles, onboardingCompleted: true, embedding: [], embeddingProfileVersion: 0 }, $inc: { profileVersion: 1 } }, { upsert: true, setDefaultsOnInsert: true }),
    ]);
    queueMatchingRecompute(request.auth!.userId, { studentId: request.auth!.userId });
    const fresh = await User.findById(request.auth!.userId) as UserDocument;
    return response.json({ user: await publicUser(fresh), message: "Profile updated." });
  }
  // Only skills and preferred roles can be changed here. Any name, ID, branch or year in the request is ignored.
  const input = z.object({
    skills: z.array(z.string().trim().min(1).max(60)).min(1).max(40),
    preferredRoles: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  }).parse(request.body);
  await Promise.all([
    StudentProfile.findOneAndUpdate({ userId: request.auth!.userId }, { $set: { skills: input.skills, preferredRoles: input.preferredRoles, onboardingCompleted: true, embedding: [], embeddingProfileVersion: 0 }, $inc: { profileVersion: 1 } }, { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }),
  ]);
  queueMatchingRecompute(request.auth!.userId, { studentId: request.auth!.userId });
  const user = await User.findById(request.auth!.userId) as UserDocument;
  return response.json({ user: await publicUser(user), message: "Profile updated." });
});

/** A direct student asks an admin to unlock course and/or graduating year for a single edit. */
router.post("/profile/change-request", requireAuth, requireRole("student"), async (request, response, next) => {
  try {
    const input = z.object({
      fields: z.array(z.enum(profileChangeFields)).min(1, "Choose what you want to change.").max(2),
      reason: z.string().trim().min(10, "Please explain why in at least a sentence (10+ characters).").max(500),
    }).parse(request.body);
    const userId = request.auth!.userId;
    const account = await User.findById(userId).select("institutionId").lean();
    if (!account || account.institutionId) return response.status(403).json({ message: "Your institute manages these details. Ask your placement office." });
    const profile = await StudentProfile.findOne({ userId }).select("degree graduationYear").lean();
    if (!profile?.degree || !profile?.graduationYear) return response.status(400).json({ message: "Your course isn’t locked yet, so you can edit it directly." });
    try {
      await ProfileChangeRequest.create({ userId, fields: [...new Set(input.fields)], reason: input.reason, previous: { degree: profile.degree, graduationYear: profile.graduationYear } });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return response.status(409).json({ message: "You already have an open change request." });
      throw error;
    }
    return response.status(201).json({ message: "Request sent. We’ll notify you when an admin reviews it." });
  } catch (error) { return next(error); }
});

router.post("/forgot-password", emailRateLimit, async (request, response) => {
  const input = z.object({ email: z.string().email() }).parse(request.body);
  const user = await User.findOne({ email: input.email.trim().toLowerCase(), authProvider: "password" });
  if (user) await sendAccountLink(user, "reset");
  return response.json({ message: "If an account exists for that email, reset instructions will be sent." });
});

router.post("/reset-password", emailRateLimit, async (request, response) => {
  const input = z.object({ token: z.string().min(20).max(256), password: passwordSchema }).parse(request.body);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const token = await EmailActionToken.findOneAndUpdate({ tokenHash: hashToken(input.token), purpose: "reset", usedAt: null, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } }, { returnDocument: "after" });
  if (!token) return response.status(400).json({ message: "This reset link is invalid or expired. Request a new one." });
  const user = await User.findOneAndUpdate({ _id: token.userId, authProvider: "password" }, { $set: { passwordHash, passwordChangedAt: new Date() } }, { returnDocument: "after" });
  if (!user) return response.status(400).json({ message: "This reset link is no longer valid." });
  await EmailActionToken.updateMany({ userId: user._id, purpose: "reset", usedAt: null }, { $set: { usedAt: new Date() } });
  await RefreshSession.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  await queueEmail({ key: `password-reset:${token._id}`, to: user.email, subject: "Your Placeble password was reset", text: `Your password was just reset. If this was not you, reset your password immediately at ${appLink("/forgot-password")}.` });
  return response.json({ message: "Password reset successfully. Sign in with your new password." });
});

router.post("/verify-email", emailRateLimit, async (request, response) => {
  const input = z.object({ token: z.string().min(20).max(256) }).parse(request.body);
  const token = await EmailActionToken.findOneAndUpdate({ tokenHash: hashToken(input.token), purpose: "verify", usedAt: null, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } }, { returnDocument: "after" });
  if (!token) return response.status(400).json({ message: "This verification link is invalid or expired." });
  await User.updateOne({ _id: token.userId }, { $set: { emailVerified: true } });
  return response.json({ message: "Email verified. Institution or company approval may still be required." });
});

router.post("/resend-verification", emailRateLimit, async (request, response) => {
  const { email } = z.object({ email: z.string().email() }).parse(request.body);
  const user = await User.findOne({ email: email.trim().toLowerCase(), emailVerified: false });
  if (user) await sendAccountLink(user, "verify");
  return response.json({ message: "If verification is needed, a new link will be sent." });
});

router.post("/change-password", requireAuth, async (request, response, next) => {
  try {
    const input = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }).parse(request.body);
    const user = await User.findById(request.auth!.userId) as UserDocument | null;
    if (!user?.passwordHash || user.authProvider !== "password") return response.status(400).json({ message: "This account does not use a password. Use the sign-in method provided for your account." });
    if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) return response.status(400).json({ message: "Your current password is incorrect." });
    if (await bcrypt.compare(input.newPassword, user.passwordHash)) return response.status(400).json({ message: "Choose a password you have not used for this account." });
    user.passwordHash = await bcrypt.hash(input.newPassword, 12);
    user.passwordChangedAt = new Date();
    user.mustChangePassword = false;
    await user.save();
    await queueEmail({ key: `password-change:${user._id}:${user.passwordChangedAt.getTime()}`, to: user.email, subject: "Your Placeble password changed", text: `Your account password was changed. If this was not you, recover your account at ${appLink("/forgot-password")}.` });
    await RefreshSession.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    const accessToken = await createSession(user, request, response);
    return response.json({ message: "Password changed successfully.", accessToken, user: await publicUser(user) });
  } catch (error) { return next(error); }
});

// First-time setup lives in routes/onboarding.ts (date of birth, programme, batch, roles, guardian consent).

router.post("/invites", requireAuth, requireRole("tpo"), requireInstitutionScope, async (request, response) => {
  const input = z.object({
    email: z.string().email(),
    role: z.enum(["faculty", "tpo", "principal"]),
    driveIds: z.array(z.string()).default([]),
  }).parse(request.body);
  const issued = await issueActivationInvite({ name: "", email: input.email, role: input.role, institutionId: request.institutionScope!, driveIds: input.driveIds, invitedBy: request.auth!.userId });
  return response.status(201).json({
    invite: { id: issued.invite._id, email: issued.invite.email, role: issued.invite.role, status: issued.invite.status },
    activationPath: issued.activationPath,
    delivery: issued.delivery,
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
    const institution = result.invite.institutionId ? await Institution.findById(result.invite.institutionId).select("name").lean() : null;
    const university = result.invite.universityId ? await University.findById(result.invite.universityId).select("name").lean() : null;
    return response.json({
      state: "valid",
      invite: {
        email: result.invite.email,
        name: result.invite.name,
        role: result.invite.role,
        purpose: result.invite.purpose,
        institutionId: result.invite.institutionId?.toString() ?? null,
        institutionName: university?.name ?? institution?.name ?? "Your institution",
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
  const input = z.object({ name: personName, password: passwordSchema }).parse(request.body);
  const invite = resolved.invite;
  if (invite.purpose !== "credential_reissue" && await User.exists({ email: invite.email })) {
    return response.status(409).json({ code: "INVITE_ACCOUNT_EXISTS", state: "already_used", message: "An account already exists for this invited email. Sign in instead." });
  }
  const claimed = await Invite.findOneAndUpdate(
    { _id: invite._id, status: "pending", expiresAt: { $gt: new Date() } },
    { $set: { status: "accepted", acceptedAt: new Date() } },
    { returnDocument: "after" },
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
        ...(claimed.institutionId ? { institutionId: claimed.institutionId } : {}),
        ...(claimed.universityId ? { universityId: claimed.universityId } : {}),
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
      await RefreshSession.updateMany({ userId: existingUser._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
      await queueEmail({ key: `credential-reset:${claimed._id}`, to: existingUser.email, subject: "Your Placeble credentials were reset", text: `Your account credentials have been reset using an institution invitation. If this was not you, contact your institution administrator immediately.` });
      const accessToken = await createSession(existingUser, request, response);
      return response.json({ message: "Your credentials have been reset.", accessToken, user: await publicUser(existingUser) });
    }
    const user = await User.create({
      name: input.name,
      email: claimed.email,
      passwordHash: await bcrypt.hash(input.password, 12),
      role: claimed.role,
      institutionId: claimed.institutionId ?? null,
      universityId: claimed.universityId ?? null,
      authProvider: "password",
      status: "active",
      emailVerified: true,
    }) as UserDocument;
    createdUserId = user._id.toString();
    if (user.role === "faculty") {
      await FacultyProfile.create({ userId: user._id, institutionId: claimed.institutionId!, cohortLabels: [] });
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
