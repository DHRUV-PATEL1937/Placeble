import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { type Types } from "mongoose";
import { Batch, batchLabel, batchPeriod } from "../models/Batch";
import { Branch } from "../models/Branch";
import { Institution } from "../models/Institution";
import { StudentProfile } from "../models/StudentProfile";
import { StudentRosterEntry } from "../models/StudentRosterEntry";
import { RefreshSession } from "../models/RefreshSession";
import { User, type UserDocument } from "../models/User";
import { appLink, emailConfigured, queueEmail } from "./email-service";
import { applyPlacement } from "./placement-service";

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGIT = "23456789";
const pick = (set: string) => set[crypto.randomInt(set.length)];

/** 12 characters with an uppercase letter, a lowercase letter and a digit; ambiguous characters (0/O, 1/l/I) are left out. */
export function generateTemporaryPassword() {
  const all = UPPER + LOWER + DIGIT;
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT), ...Array.from({ length: 9 }, () => pick(all))];
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swap = crypto.randomInt(index + 1);
    [chars[index], chars[swap]] = [chars[swap], chars[index]];
  }
  return chars.join("");
}

// Cost 10 keeps a bulk invite of a few hundred students to a minute or so; the password is temporary and must be changed at first sign-in.
const hashTemporary = (password: string) => bcrypt.hash(password, 10);

async function sendCredentials(input: { user: { _id: unknown; email: string; name: string }; institutionName: string; temporaryPassword: string; reissue: boolean }) {
  return queueEmail({
    key: `student-credentials:${String(input.user._id)}:${Date.now()}`,
    to: input.user.email,
    subject: input.reissue ? "Your new Placeble sign-in details" : `${input.institutionName} has set up your Placeble account`,
    text: `Hello ${input.user.name},\n\n${input.reissue ? "Here are your new sign-in details." : `${input.institutionName} has created your Placeble account to help you prepare for placements.`}\n\nSign in: ${appLink("/login/student")}\nEmail: ${input.user.email}\nTemporary password: ${input.temporaryPassword}\n\nYou will be asked to choose your own password the first time you sign in. Please do not share this email.`,
    expiresAt: new Date(Date.now() + 7 * 86400000),
  });
}

/** Details an institute sets for a student. Students can see them but never change them. */
export async function instituteDetailsFor(userId: string | Types.ObjectId) {
  const entry = await StudentRosterEntry.findOne({ matchedUserId: userId }).select("fullName rollNumber branch branchId batchId batchYear institutionId").lean();
  if (!entry) return null;
  const [branch, batch] = await Promise.all([entry.branchId ? Branch.findById(entry.branchId).select("programCode").lean() : null, entry.batchId ? Batch.findById(entry.batchId).lean() : null]);
  return { fullName: entry.fullName, rollNumber: entry.rollNumber ?? "", branch: entry.branch ?? "", programCode: branch?.programCode ?? null, batchYear: entry.batchYear ?? null, batchLabel: batch ? batchLabel(batch) : "", batchPeriod: batch ? batchPeriod(batch) : "", batchStart: batch?.startYear ?? null };
}

/** Copies a roster entry's name, branch and batch year onto the student's account and profile. */
export async function syncStudentFromEntry(entry: { matchedUserId?: Types.ObjectId | null; institutionId: Types.ObjectId; fullName: string; branch?: string | null; batchYear?: number | null; branchId?: Types.ObjectId | null; batchId?: Types.ObjectId | null }) {
  if (!entry.matchedUserId) return;
  await Promise.all([
    User.updateOne({ _id: entry.matchedUserId }, { $set: { name: entry.fullName } }),
    StudentProfile.findOneAndUpdate(
      { userId: entry.matchedUserId },
      { $set: { institutionId: entry.institutionId, ...(entry.branch ? { degree: entry.branch } : {}), ...(entry.batchYear ? { graduationYear: entry.batchYear } : {}) } },
      { upsert: true, setDefaultsOnInsert: true },
    ),
  ]);
  await applyPlacement(entry.matchedUserId, entry);
}

export type InviteOutcome =
  | { ok: true; user: UserDocument; delivery: string; temporaryPassword: string; created: boolean; joined?: boolean }
  | { ok: false; reason: string };

/**
 * Creates (or re-issues) the account for a roster entry and emails the student their temporary password.
 * There is no signup or approval step: being on the roster is the authorisation.
 */
export async function inviteRosterStudent(input: { institutionId: string | Types.ObjectId; entryId: string | Types.ObjectId }): Promise<InviteOutcome> {
  const [entry, institution] = await Promise.all([
    StudentRosterEntry.findOne({ _id: input.entryId, institutionId: input.institutionId }),
    Institution.findById(input.institutionId).select("name").lean(),
  ]);
  if (!entry || !institution) return { ok: false, reason: "Roster entry not found." };

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashTemporary(temporaryPassword);

  let user = await User.findOne({ email: entry.email }) as UserDocument | null;
  let created = false;
  if (user && user.role === "student" && !user.institutionId) {
    // This person already signed up directly. Move their existing account into the institute so their
    // progress, resumes and scores come with them. They keep their own password and sign in as before.
    user.institutionId = input.institutionId as UserDocument["institutionId"];
    user.studentVerificationStatus = "approved";
    user.status = "active";
    user.name = entry.fullName;
    await user.save();
    await StudentProfile.findOneAndUpdate(
      { userId: user._id },
      { $set: { institutionId: input.institutionId, ...(entry.branch ? { degree: entry.branch } : {}), ...(entry.batchYear ? { graduationYear: entry.batchYear } : {}) } },
      { upsert: true, setDefaultsOnInsert: true },
    );
    entry.matchedUserId = user._id;
    entry.status = "matched";
    await entry.save();
    await applyPlacement(user._id, entry);
    const delivery = await queueEmail({
      key: `student-joined:${String(user._id)}:${Date.now()}`, to: user.email,
      subject: `${institution.name} has added you on Placeble`,
      text: `Hello ${user.name},\n\n${institution.name} has added you to its Placeble workspace. Your account, progress and everything you've built so far have moved with you.\n\nSign in as usual with your existing password: ${appLink("/login/student")}\n\nYour placement office can now see your progress and help you prepare.`,
      expiresAt: new Date(Date.now() + 7 * 86400000),
    });
    return { ok: true, user, delivery, temporaryPassword: "", created: false, joined: true };
  }
  if (user) {
    // An existing account may only be re-issued if it is this institute's own student.
    if (user.role !== "student" || String(user.institutionId) !== String(input.institutionId)) return { ok: false, reason: "An account with this email already exists elsewhere." };
    user.passwordHash = passwordHash;
    user.passwordChangedAt = new Date();
    user.mustChangePassword = true;
    user.status = "active";
    user.studentVerificationStatus = "approved";
    user.credentialsSentAt = new Date();
    await user.save();
    await RefreshSession.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  } else {
    user = await User.create({
      name: entry.fullName, email: entry.email, passwordHash, role: "student",
      institutionId: input.institutionId, studentVerificationStatus: "approved", authProvider: "password",
      status: "active", emailVerified: false, mustChangePassword: true, credentialsSentAt: new Date(),
    }) as UserDocument;
    created = true;
  }

  await StudentProfile.findOneAndUpdate(
    { userId: user._id },
    { $setOnInsert: { onboardingCompleted: false }, $set: { institutionId: input.institutionId, ...(entry.branch ? { degree: entry.branch } : {}), ...(entry.batchYear ? { graduationYear: entry.batchYear } : {}) } },
    { upsert: true, setDefaultsOnInsert: true },
  );
  entry.matchedUserId = user._id;
  entry.status = "matched";
  await entry.save();
  await applyPlacement(user._id, entry);

  const delivery = await sendCredentials({ user, institutionName: institution.name, temporaryPassword, reissue: !created });
  return { ok: true, user, delivery, temporaryPassword, created };
}

/**
 * Invites many roster entries in the background so a large upload doesn't hold the request open.
 * Skipped entirely when email isn't configured: otherwise nobody would ever learn the passwords.
 */
export function inviteInBackground(institutionId: string, entryIds: Array<string | Types.ObjectId>) {
  if (!emailConfigured() || !entryIds.length) return;
  setImmediate(async () => {
    for (const entryId of entryIds) {
      try { await inviteRosterStudent({ institutionId, entryId }); }
      catch (error) { console.error("Student invite failed", error instanceof Error ? error.message : error); }
    }
  });
}
