import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { Institution } from "../models/Institution";
import { Notification } from "../models/Notification";
import { StudentRosterEntry } from "../models/StudentRosterEntry";
import { ProfileChangeRequest } from "../models/ProfileChangeRequest";
import { sendPushes } from "../services/push-service";
import { RefreshSession } from "../models/RefreshSession";
import { StudentProfile } from "../models/StudentProfile";
import { Subscription } from "../models/Subscription";
import { UsageEvent } from "../models/UsageEvent";
import { User } from "../models/User";
import { writeAdminAudit } from "../services/admin-audit-service";
import { planSummary, startOfMonth } from "../services/plans";

/** Superadmin management of direct (B2C) students: people who signed up themselves and belong to no institute. */
const router = Router();
router.use(requireAuth, requireRole("platform_admin"));

const objectId = z.string().refine(value => mongoose.isValidObjectId(value), "Invalid identifier.");
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const DIRECT = { role: "student" as const, institutionId: null };
const DAY = 86_400_000;

router.get("/summary", async (_request, response) => {
  const since30 = new Date(Date.now() - 30 * DAY);
  const [total, verified, signups30, active30, paying, suspended] = await Promise.all([
    User.countDocuments(DIRECT),
    User.countDocuments({ ...DIRECT, emailVerified: true }),
    User.countDocuments({ ...DIRECT, createdAt: { $gte: since30 } }),
    User.countDocuments({ ...DIRECT, lastLoginAt: { $gte: since30 } }),
    Subscription.countDocuments({ plan: "pro", status: "active", currentPeriodEnd: { $gt: new Date() } }),
    User.countDocuments({ ...DIRECT, status: "suspended" }),
  ]);
  return response.json({ total, verified, unverified: total - verified, signups30, active30, paying, free: Math.max(0, total - paying), suspended });
});

/* ───────── Move an institute student to B2C ───────── */

/** Find institute students (from any college or university) by name or email, so one can be made a direct student. */
router.get("/institute-students", async (request, response) => {
  const search = z.string().trim().min(2).max(100).parse(request.query.search);
  const term = new RegExp(escape(search), "i");
  const users = await User.find({ role: "student", institutionId: { $ne: null }, $or: [{ name: term }, { email: term }] }).sort({ name: 1 }).limit(15).select("name email status institutionId").lean();
  const institutions = await Institution.find({ _id: { $in: users.map(user => user.institutionId) } }).select("name").lean();
  const nameOf = new Map(institutions.map(item => [String(item._id), item.name]));
  return response.json({ students: users.map(user => ({ id: String(user._id), name: user.name, email: user.email, status: user.status, institution: nameOf.get(String(user.institutionId)) ?? "Unknown college" })) });
});

/**
 * Turn an institute student into a direct (B2C) student. They keep their account, resume, practice history and password,
 * but leave their college: it can no longer see them, and they get Placeble's own free plan. They have to sign in again.
 */
router.post("/convert", async (request, response, next) => {
  try {
    const input = z.object({ studentId: objectId, reason: z.string().trim().min(3, "Please record a reason.").max(500) }).parse(request.body);
    const student = await User.findOne({ _id: input.studentId, role: "student" }).select("name email institutionId").lean();
    if (!student) return response.status(404).json({ message: "Student not found." });
    if (!student.institutionId) return response.status(409).json({ message: "This student is already a direct (B2C) student." });
    const institution = await Institution.findById(student.institutionId).select("name").lean();

    await Promise.all([
      User.updateOne({ _id: student._id }, { $set: { institutionId: null, universityId: null, batchId: null, batchEndsAt: null, studentVerificationStatus: "approved" } }),
      StudentProfile.updateOne({ userId: student._id }, { $set: { institutionId: null } }),
      // The college's roster entry stays as a record but no longer points at this account.
      StudentRosterEntry.updateMany({ matchedUserId: student._id }, { $set: { matchedUserId: null, status: "unmatched" } }),
      RefreshSession.deleteMany({ userId: student._id }),
    ]);
    await writeAdminAudit({ platformAdminId: request.auth!.userId, action: "student_made_b2c", targetType: "user", targetId: student._id, metadata: { email: student.email, previousInstitution: institution?.name ?? "", reason: input.reason } });
    await Notification.updateOne(
      { userId: student._id, sourceKey: `made-b2c:${student._id}` },
      { $setOnInsert: { kind: "system", title: "Your account is now independent", body: "Placeble now manages your account directly. Your resume and practice history are kept. Sign in again to continue.", priority: "important" } },
      { upsert: true },
    ).catch(() => undefined);
    return response.json({ student: { id: String(student._id), name: student.name, email: student.email } });
  } catch (error) { return next(error); }
});

router.get("/", async (request, response) => {
  const input = z.object({
    search: z.string().trim().max(100).default(""),
    plan: z.enum(["all", "free", "pro"]).default("all"),
    page: z.coerce.number().int().min(1).default(1),
  }).parse(request.query);
  const pageSize = 25;
  const term = input.search ? new RegExp(escape(input.search), "i") : null;
  const active = await Subscription.find({ plan: "pro", status: "active", currentPeriodEnd: { $gt: new Date() } }).select("userId").lean();
  const proIds = active.map(item => item.userId);
  const filter = {
    ...DIRECT,
    ...(term ? { $or: [{ name: term }, { email: term }] } : {}),
    ...(input.plan === "pro" ? { _id: { $in: proIds } } : input.plan === "free" ? { _id: { $nin: proIds } } : {}),
  };
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((input.page - 1) * pageSize).limit(pageSize).select("name email status emailVerified createdAt lastLoginAt").lean(),
    User.countDocuments(filter),
  ]);
  const ids = users.map(user => user._id);
  const [subscriptions, usage, profiles] = await Promise.all([
    Subscription.find({ userId: { $in: ids } }).lean(),
    UsageEvent.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([{ $match: { userId: { $in: ids }, createdAt: { $gte: startOfMonth() } } }, { $group: { _id: "$userId", count: { $sum: 1 } } }]),
    StudentProfile.find({ userId: { $in: ids } }).select("userId degree graduationYear").lean(),
  ]);
  const subscriptionOf = new Map(subscriptions.map(item => [String(item.userId), item]));
  const usedOf = new Map(usage.map(item => [String(item._id), item.count]));
  const profileOf = new Map(profiles.map(item => [String(item.userId), item]));
  return response.json({
    total, page: input.page, pageSize,
    students: users.map(user => {
      const subscription = subscriptionOf.get(String(user._id));
      const pro = Boolean(subscription && subscription.plan === "pro" && subscription.status === "active" && subscription.currentPeriodEnd && subscription.currentPeriodEnd.getTime() > Date.now());
      const profile = profileOf.get(String(user._id));
      return {
        id: String(user._id), name: user.name, email: user.email, status: user.status, emailVerified: Boolean(user.emailVerified),
        joinedAt: user.createdAt, lastLoginAt: user.lastLoginAt ?? null, programme: profile?.degree ?? "", graduationYear: profile?.graduationYear ?? null,
        plan: pro ? "pro" : "free", interval: pro ? subscription!.interval : null, renewsAt: pro ? subscription!.currentPeriodEnd : null, source: pro ? subscription!.source : null,
        usedThisMonth: usedOf.get(String(user._id)) ?? 0,
      };
    }),
  });
});

/* ───────── Course / graduating-year change requests ───────── */

router.get("/profile-changes", async (request, response) => {
  const status = z.enum(["pending", "approved", "rejected", "used", "all"]).default("pending").parse(request.query.status);
  const rows = await ProfileChangeRequest.find(status === "all" ? {} : { status }).sort({ createdAt: status === "pending" ? 1 : -1 }).limit(100).lean();
  const users = await User.find({ _id: { $in: rows.map(row => row.userId) } }).select("name email").lean();
  const userOf = new Map(users.map(user => [String(user._id), user]));
  return response.json({
    requests: rows.map(row => ({
      id: String(row._id), studentId: String(row.userId), name: userOf.get(String(row.userId))?.name ?? "Unknown", email: userOf.get(String(row.userId))?.email ?? "",
      fields: row.fields, reason: row.reason, previous: row.previous, status: row.status, reviewNote: row.reviewNote, requestedAt: row.createdAt, decidedAt: row.decidedAt,
    })),
  });
});

router.patch("/profile-changes/:id", async (request, response) => {
  const id = objectId.parse(request.params.id);
  const input = z.object({
    decision: z.enum(["approve", "reject"]),
    note: z.string().trim().max(500).default(""),
  }).parse(request.body);
  if (input.decision === "reject" && input.note.length < 3) return response.status(400).json({ message: "Please tell the student why it was declined." });
  const changed = await ProfileChangeRequest.findOneAndUpdate(
    { _id: id, status: "pending" },
    { $set: { status: input.decision === "approve" ? "approved" : "rejected", reviewedBy: request.auth!.userId, reviewNote: input.note, decidedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!changed) return response.status(409).json({ message: "This request was already reviewed." });
  const student = await User.findById(changed.userId).select("email").lean();
  await writeAdminAudit({ platformAdminId: request.auth!.userId, action: input.decision === "approve" ? "b2c_profile_change_approved" : "b2c_profile_change_rejected", targetType: "user", targetId: changed.userId, metadata: { email: student?.email, fields: changed.fields, studentReason: changed.reason, note: input.note } });

  const approved = input.decision === "approve";
  const title = approved ? "Your change request was approved" : "Your change request was declined";
  const body = approved
    ? "You can now update your course / graduating year once from your Profile. After you save, it locks again."
    : `An admin reviewed your request and kept your details as they are. ${input.note}`.slice(0, 240);
  await Notification.updateOne(
    { userId: changed.userId, sourceKey: `profile-change:${changed._id}:${changed.status}` },
    { $setOnInsert: { kind: "system", title, body, href: "Profile", priority: approved ? "important" : "info" } },
    { upsert: true },
  ).catch(() => undefined);
  void sendPushes([{ userId: changed.userId, title, body }]);
  return response.json({ request: { id: String(changed._id), status: changed.status } });
});

router.get("/:userId", async (request, response) => {
  const userId = objectId.parse(request.params.userId);
  const user = await User.findOne({ _id: userId, ...DIRECT }).select("name email status emailVerified createdAt lastLoginAt").lean();
  if (!user) return response.status(404).json({ message: "Direct student not found." });
  const [profile, summary, subscription] = await Promise.all([
    StudentProfile.findOne({ userId }).select("degree graduationYear skills preferredRoles onboardingCompleted").lean(),
    planSummary(userId),
    Subscription.findOne({ userId }).lean(),
  ]);
  return response.json({
    student: { id: String(user._id), name: user.name, email: user.email, status: user.status, emailVerified: Boolean(user.emailVerified), joinedAt: user.createdAt, lastLoginAt: user.lastLoginAt ?? null, programme: profile?.degree ?? "", graduationYear: profile?.graduationYear ?? null, skills: profile?.skills ?? [], preferredRoles: profile?.preferredRoles ?? [], onboarded: Boolean(profile?.onboardingCompleted) },
    plan: summary,
    subscription: subscription ? { plan: subscription.plan, interval: subscription.interval, status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd, source: subscription.source, note: subscription.note } : null,
  });
});

router.patch("/:userId/plan", async (request, response) => {
  const userId = objectId.parse(request.params.userId);
  const input = z.object({
    plan: z.enum(["free", "pro"]),
    interval: z.enum(["monthly", "yearly"]).optional(),
    // Grant for a custom number of months instead of a standard interval (e.g. a trial or a goodwill extension).
    months: z.coerce.number().int().min(1).max(36).optional(),
    note: z.string().trim().max(300).default(""),
  }).parse(request.body);
  const user = await User.findOne({ _id: userId, ...DIRECT }).select("email").lean();
  if (!user) return response.status(404).json({ message: "Direct student not found." });

  if (input.plan === "free") {
    await Subscription.findOneAndUpdate({ userId }, { $set: { plan: "free", status: "canceled", interval: null, currentPeriodEnd: null, source: "admin", grantedBy: request.auth!.userId, note: input.note } }, { upsert: true });
  } else {
    const months = input.months ?? (input.interval === "yearly" ? 12 : 1);
    if (!input.months && !input.interval) return response.status(400).json({ message: "Choose monthly, yearly, or a number of months." });
    // Extend from the current end date if the student is already on Pro, so we never shorten what they have.
    const existing = await Subscription.findOne({ userId }).lean();
    const from = existing?.plan === "pro" && existing.status === "active" && existing.currentPeriodEnd && existing.currentPeriodEnd.getTime() > Date.now() ? existing.currentPeriodEnd : new Date();
    const end = new Date(from); end.setMonth(end.getMonth() + months);
    await Subscription.findOneAndUpdate({ userId }, { $set: { plan: "pro", status: "active", interval: input.interval ?? null, currentPeriodEnd: end, source: "admin", grantedBy: request.auth!.userId, note: input.note } }, { upsert: true });
  }
  await writeAdminAudit({ platformAdminId: request.auth!.userId, action: "b2c_plan_changed", targetType: "user", targetId: userId, metadata: { email: user.email, plan: input.plan, interval: input.interval ?? null, months: input.months ?? null, note: input.note } });
  return response.json({ plan: await planSummary(userId) });
});

router.patch("/:userId/status", async (request, response) => {
  const userId = objectId.parse(request.params.userId);
  const input = z.object({ status: z.enum(["active", "suspended"]), reason: z.string().trim().min(3, "Please record a reason.").max(500) }).parse(request.body);
  const user = await User.findOneAndUpdate({ _id: userId, ...DIRECT }, { $set: { status: input.status } }, { returnDocument: "after" }).select("email status");
  if (!user) return response.status(404).json({ message: "Direct student not found." });
  if (input.status === "suspended") await RefreshSession.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  await writeAdminAudit({ platformAdminId: request.auth!.userId, action: input.status === "suspended" ? "b2c_student_suspended" : "b2c_student_reactivated", targetType: "user", targetId: userId, metadata: { email: user.email, reason: input.reason } });
  return response.json({ student: { id: String(user._id), status: user.status } });
});

export { router as directStudentsRouter };
