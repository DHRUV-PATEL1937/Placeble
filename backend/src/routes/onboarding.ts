import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { StudentProfile } from "../models/StudentProfile";
import { User, type UserDocument } from "../models/User";
import { appLink, emailConfigured, queueEmail } from "../services/email-service";
import { queueMatchingRecompute } from "../services/matching-service";
import { ADULT_AGE, MAX_AGE, MIN_AGE, ageOn, onboardingState, yearLimits } from "../services/onboarding-service";
import { getPrograms, programByCode } from "../services/program-service";
import { instituteDetailsFor } from "../services/student-account-service";
import { hashToken } from "../services/token-service";
import { publicUser } from "./auth";

const router = Router();
const CONSENT_DAYS = 7;

const catalog = async () => (await getPrograms()).map(program => ({ code: program.code, name: program.name, category: program.category, durationYears: program.durationYears, interviewStyle: program.interviewStyle, roles: program.roles }));

async function sendGuardianRequest(input: { studentName: string; studentEmail: string; guardianName: string; guardianEmail: string; token: string }) {
  const link = appLink(`/guardian-consent?token=${input.token}`);
  // With no email provider (local development) print the link so the flow can still be tried end to end.
  if (!emailConfigured() && process.env.NODE_ENV !== "production") console.log(`[guardian consent] ${input.guardianEmail}: ${link}`);
  return queueEmail({
    key: `guardian:${input.studentEmail}:${Date.now()}`, to: input.guardianEmail,
    subject: `Please confirm ${input.studentName}'s Placeble account`,
    text: `Hello ${input.guardianName},\n\n${input.studentName} has signed up for Placeble, a career-preparation platform (resume help, mock interviews and aptitude practice). Because ${input.studentName} is under 18, we need your permission before they can use it.\n\nWhat we store: their name, email, profile, practice results and readiness scores. If their college uses Placeble, the college's placement team can see their progress. We never sell personal information.\n\nReview and respond here (the link works for ${CONSENT_DAYS} days):\n${link}\n\nIf you don't recognise this request, you can ignore this email or decline on that page.`,
    expiresAt: new Date(Date.now() + CONSENT_DAYS * 86_400_000),
  });
}

/* ───────── Student: first-time setup ───────── */

router.get("/", requireAuth, requireRole("student"), async (request, response) => {
  const userId = request.auth!.userId;
  const [user, profile, institute] = await Promise.all([User.findById(userId).select("name institutionId").lean(), StudentProfile.findOne({ userId }).lean(), instituteDetailsFor(userId)]);
  if (!user) return response.status(404).json({ message: "Account not found." });
  const lockedProgram = await programByCode(institute?.programCode);
  const hasBranch = Boolean(lockedProgram || profile?.programCode);
  const lockedBatch = Boolean(institute?.batchLabel);
  const direct = !user.institutionId;
  return response.json({
    state: onboardingState(profile ?? {}), isDirect: direct, name: user.name,
    needs: {
      dateOfBirth: !profile?.dateOfBirth,
      // Institute (B2B) students never choose their course: the TPO supplies it with the roster.
      program: direct && !hasBranch,
      batch: direct && !lockedBatch && (!profile?.admissionYear || !profile?.graduationYear),
      goals: !profile?.preferredRoles?.length || !profile?.skills?.length,
    },
    locked: { program: lockedProgram ? { code: lockedProgram.code, name: lockedProgram.name } : institute?.branch ? { code: null, name: institute.branch } : null, batch: lockedBatch ? { label: institute!.batchLabel, period: institute!.batchPeriod } : null },
    programs: await catalog(),
    profile: { dateOfBirth: profile?.dateOfBirth ? profile.dateOfBirth.toISOString().slice(0, 10) : "", programCode: profile?.programCode ?? lockedProgram?.code ?? "", admissionYear: profile?.admissionYear ?? null, graduationYear: profile?.graduationYear ?? null, roles: profile?.preferredRoles ?? [], skills: profile?.skills ?? [] },
    guardian: { status: profile?.guardianConsent?.status ?? "not_required", name: profile?.guardianConsent?.guardianName ?? "", email: profile?.guardianConsent?.guardianEmail ?? "" },
    limits: { minAge: MIN_AGE, adultAge: ADULT_AGE, maxAge: MAX_AGE, minYear: yearLimits().admissionMin, maxYear: yearLimits().graduationMax, ...yearLimits() },
  });
});

const cleanList = (values: string[]) => [...new Map(values.map(value => value.trim().replace(/\s+/g, " ")).filter(Boolean).map(value => [value.toLowerCase(), value])).values()];

router.post("/", requireAuth, requireRole("student"), async (request, response, next) => {
  try {
    const input = z.object({
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth.").optional(),
      programCode: z.string().trim().max(40).optional(),
      admissionYear: z.coerce.number().int().min(2000).max(2100).optional(),
      graduationYear: z.coerce.number().int().min(2000).max(2100).optional(),
      roles: z.array(z.string().trim().min(2).max(80)).min(1, "Add at least one role you’re aiming for.").max(12),
      skills: z.array(z.string().trim().min(1).max(60)).min(1, "Add at least one skill.").max(40),
      guardianName: z.string().trim().min(2).max(80).optional(),
      guardianEmail: z.string().trim().toLowerCase().email().optional(),
    }).parse(request.body);

    const userId = request.auth!.userId;
    const [user, existing, institute] = await Promise.all([User.findById(userId) as Promise<UserDocument | null>, StudentProfile.findOne({ userId }), instituteDetailsFor(userId)]);
    if (!user) return response.status(404).json({ message: "Account not found." });
    const profile = existing ?? new StudentProfile({ userId, institutionId: user.institutionId ?? null });

    // Date of birth is set once. Anything else a student can't change later is only filled in here when it's still empty.
    if (!profile.dateOfBirth) {
      if (!input.dateOfBirth) return response.status(400).json({ message: "Enter your date of birth." });
      const dob = new Date(`${input.dateOfBirth}T00:00:00.000Z`);
      if (Number.isNaN(dob.getTime()) || dob.getTime() > Date.now()) return response.status(400).json({ message: "Enter a valid date of birth." });
      const age = ageOn(dob);
      if (age < MIN_AGE) return response.status(403).json({ code: "TOO_YOUNG", message: `You need to be at least ${MIN_AGE} to use Placeble.` });
      if (age > MAX_AGE) return response.status(400).json({ message: `Enter a valid date of birth. Placeble is for students up to ${MAX_AGE}.` });
      profile.dateOfBirth = dob;
    }
    const age = ageOn(profile.dateOfBirth!);

    // Programme: the institute's branch wins; otherwise it must be picked from the fixed list.
    const lockedProgram = await programByCode(institute?.programCode);
    const direct = !user.institutionId;
    if (direct && !lockedProgram && !profile.programCode) {
      const program = await programByCode(input.programCode ?? null);
      if (!program || !program.active) return response.status(400).json({ message: "Choose your programme from the list." });
      profile.programCode = program.code; profile.degree = program.name;
    }
    // Batch years: the institute's batch wins; otherwise the student gives their own.
    if (direct && !institute?.batchLabel && (!profile.admissionYear || !profile.graduationYear)) {
      if (!input.admissionYear || !input.graduationYear) return response.status(400).json({ message: "Choose your admission year and graduating year." });
      const years = yearLimits();
      if (input.admissionYear < years.admissionMin || input.admissionYear > years.admissionMax) return response.status(400).json({ message: `Choose an admission year from ${years.admissionMin} to ${years.admissionMax}.` });
      if (input.graduationYear < years.graduationMin || input.graduationYear > years.graduationMax) return response.status(400).json({ message: `Choose a graduating year from ${years.graduationMin} to ${years.graduationMax}.` });
      if (input.graduationYear < input.admissionYear || input.graduationYear - input.admissionYear > 8) return response.status(400).json({ message: "Your graduating year should be after your admission year." });
      profile.admissionYear = input.admissionYear; profile.graduationYear = input.graduationYear;
    }

    profile.preferredRoles = cleanList(input.roles);
    profile.skills = cleanList(input.skills);
    profile.onboardingCompleted = true;
    profile.embedding = []; profile.embeddingProfileVersion = 0; profile.profileVersion = (profile.profileVersion ?? 1) + 1;

    // Under 18: a parent or guardian has to agree before the student can use Placeble.
    let consentRequested = false;
    if (age >= ADULT_AGE) {
      profile.guardianConsent = { status: "not_required", guardianName: "", guardianEmail: "", tokenHash: null, tokenExpiresAt: null, requestedAt: null, respondedAt: null };
    } else if (profile.guardianConsent?.status !== "granted") {
      if (!input.guardianName || !input.guardianEmail) return response.status(400).json({ code: "GUARDIAN_REQUIRED", message: "Because you’re under 18, add a parent or guardian’s name and email so they can give permission." });
      if (input.guardianEmail === user.email) return response.status(400).json({ message: "The guardian’s email must be different from yours." });
      const token = crypto.randomBytes(32).toString("base64url");
      profile.guardianConsent = { status: "pending", guardianName: input.guardianName, guardianEmail: input.guardianEmail, tokenHash: hashToken(token), tokenExpiresAt: new Date(Date.now() + CONSENT_DAYS * 86_400_000), requestedAt: new Date(), respondedAt: null };
      await sendGuardianRequest({ studentName: user.name, studentEmail: user.email, guardianName: input.guardianName, guardianEmail: input.guardianEmail, token });
      consentRequested = true;
    }
    await profile.save();
    if (existing === null || profile.programCode) queueMatchingRecompute(userId, { studentId: userId });
    return response.json({ user: await publicUser(user), consentRequested });
  } catch (error) { return next(error); }
});

/** Ask the guardian again (new link). At most once a minute. */
router.post("/guardian/resend", requireAuth, requireRole("student"), async (request, response) => {
  const userId = request.auth!.userId;
  const [user, profile] = await Promise.all([User.findById(userId).select("name email").lean(), StudentProfile.findOne({ userId })]);
  const consent = profile?.guardianConsent;
  if (!user || !profile || !consent || (consent.status !== "pending" && consent.status !== "declined")) return response.status(400).json({ message: "There’s no guardian request to resend." });
  if (consent.requestedAt && Date.now() - consent.requestedAt.getTime() < 60_000) return response.status(429).json({ message: "Please wait a minute before sending it again." });
  const token = crypto.randomBytes(32).toString("base64url");
  profile.guardianConsent = { guardianName: consent.guardianName ?? "", guardianEmail: consent.guardianEmail ?? "", status: "pending", tokenHash: hashToken(token), tokenExpiresAt: new Date(Date.now() + CONSENT_DAYS * 86_400_000), requestedAt: new Date(), respondedAt: null };
  await profile.save();
  await sendGuardianRequest({ studentName: user.name, studentEmail: user.email, guardianName: consent.guardianName ?? "", guardianEmail: consent.guardianEmail ?? "", token });
  return response.json({ ok: true });
});

/* ───────── Guardian: public page (no sign-in) ───────── */

async function profileForToken(token: string) {
  if (token.length < 20 || token.length > 256) return null;
  const profile = await StudentProfile.findOne({ "guardianConsent.tokenHash": hashToken(token) });
  return profile && profile.guardianConsent?.status === "pending" && profile.guardianConsent.tokenExpiresAt && profile.guardianConsent.tokenExpiresAt.getTime() > Date.now() ? profile : null;
}

router.get("/guardian", async (request, response) => {
  const profile = await profileForToken(typeof request.query.token === "string" ? request.query.token : "");
  if (!profile) return response.status(404).json({ code: "LINK_INVALID", message: "This link has expired or has already been used." });
  const user = await User.findById(profile.userId).select("name").lean();
  return response.json({ studentName: user?.name ?? "A student", guardianName: profile.guardianConsent?.guardianName ?? "" });
});

router.post("/guardian", async (request, response, next) => {
  try {
    const input = z.object({ token: z.string().min(20).max(256), decision: z.enum(["grant", "decline"]) }).parse(request.body);
    const profile = await profileForToken(input.token);
    if (!profile || !profile.guardianConsent) return response.status(404).json({ code: "LINK_INVALID", message: "This link has expired or has already been used." });
    profile.guardianConsent.status = input.decision === "grant" ? "granted" : "declined";
    profile.guardianConsent.respondedAt = new Date();
    profile.guardianConsent.tokenHash = null;
    profile.guardianConsent.tokenExpiresAt = null;
    await profile.save();
    return response.json({ status: profile.guardianConsent.status });
  } catch (error) { return next(error); }
});

export { router as onboardingRouter };
