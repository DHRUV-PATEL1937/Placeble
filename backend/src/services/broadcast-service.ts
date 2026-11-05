import { Types } from "mongoose";
import { z } from "zod";
import { Batch, batchLabel } from "../models/Batch";
import { Broadcast } from "../models/Broadcast";
import { Institution } from "../models/Institution";
import { Notification } from "../models/Notification";
import { ReadinessScore } from "../models/ReadinessScore";
import { StudentProfile } from "../models/StudentProfile";
import { StudentRosterEntry } from "../models/StudentRosterEntry";
import { Subscription } from "../models/Subscription";
import { User } from "../models/User";
import { sendPushes } from "./push-service";
import { appLink, emailConfigured, queueEmail } from "./email-service";

export const MAX_RECIPIENTS = 20_000;
export const VARIABLES = ["firstName", "name", "branch", "batch", "institute"] as const;
export const STAFF_ROLES = ["tpo", "principal", "university_admin", "recruiter"] as const;

const ids = z.array(z.string().refine(value => Types.ObjectId.isValid(value))).max(500);
export const audienceSchema = z.object({
  roles: z.array(z.enum(["student", ...STAFF_ROLES])).max(5).optional(),
  scope: z.enum(["all", "institutions", "direct"]).optional(),
  institutionIds: ids.optional(),
  universityIds: ids.optional(),
  branchIds: ids.optional(),
  batchIds: ids.optional(),
  programCodes: z.array(z.string().max(40)).max(60).optional(),
  loginStatus: z.enum(["any", "signed_in", "not_signed_in"]).optional(),
  plan: z.enum(["any", "free", "pro"]).optional(),
  readinessMin: z.number().min(0).max(100).optional(),
  readinessMax: z.number().min(0).max(100).optional(),
  studentIds: ids.optional(),
}).strict();
export type Audience = z.infer<typeof audienceSchema>;
export type Sender = { kind: "admin" } | { kind: "tpo"; institutionId: string };

export type Recipient = { userId: Types.ObjectId; email: string; name: string; firstName: string; role: string; branch: string; batch: string; institute: string };

const oid = (value: string) => new Types.ObjectId(value);

/** Works out who an audience matches right now. A TPO can only ever reach students of their own institute. */
export async function resolveRecipients(sender: Sender, audience: Audience): Promise<Recipient[]> {
  const admin = sender.kind === "admin";
  const roles = admin ? (audience.roles?.length ? audience.roles : ["student"]) : ["student"];
  const clauses: Array<Record<string, unknown>> = [];

  // Institutes the audience is limited to (admin only): picked directly, or via their university.
  let instituteIds: Types.ObjectId[] = [];
  if (admin) {
    instituteIds = (audience.institutionIds ?? []).map(oid);
    if (audience.universityIds?.length) {
      const inUniversities = await Institution.find({ universityId: { $in: audience.universityIds.map(oid) } }).select("_id").lean();
      instituteIds = [...instituteIds, ...inUniversities.map(item => item._id)];
    }
  }

  if (roles.includes("student")) {
    const clause: Record<string, unknown> = { role: "student" };
    if (!admin) clause.institutionId = oid(sender.institutionId);
    else if (audience.scope === "direct") clause.institutionId = null;
    else if (instituteIds.length) clause.institutionId = { $in: instituteIds };
    if (audience.studentIds?.length) clause._id = { $in: audience.studentIds.map(oid) };
    if (audience.loginStatus === "signed_in") clause.$or = [{ firstLoginAt: { $ne: null } }, { lastLoginAt: { $ne: null } }];
    if (audience.loginStatus === "not_signed_in") { clause.firstLoginAt = null; clause.lastLoginAt = null; }
    clauses.push(clause);
  }
  const staff = roles.filter(role => role !== "student");
  if (admin && staff.length) {
    const clause: Record<string, unknown> = { role: { $in: staff } };
    if (instituteIds.length || audience.universityIds?.length) clause.$or = [{ institutionId: { $in: instituteIds } }, { universityId: { $in: (audience.universityIds ?? []).map(oid) } }];
    clauses.push(clause);
  }
  if (!clauses.length) return [];

  let users = await User.find({ status: "active", $or: clauses }).select("name email role institutionId").limit(MAX_RECIPIENTS + 1).lean();
  if (users.length > MAX_RECIPIENTS) throw Object.assign(new Error(`That audience is larger than ${MAX_RECIPIENTS.toLocaleString("en-IN")} people. Narrow it down.`), { status: 400 });

  // Student-only refinements.
  const studentIds = users.filter(user => user.role === "student").map(user => user._id);
  const keep = new Set<string>(studentIds.map(String));
  const narrow = (allowed: Iterable<unknown>) => { const set = new Set([...allowed].map(String)); for (const id of [...keep]) if (!set.has(id)) keep.delete(id); };

  if (studentIds.length && (audience.branchIds?.length || audience.batchIds?.length)) {
    const entries = await StudentRosterEntry.find({
      matchedUserId: { $in: studentIds },
      ...(audience.branchIds?.length ? { branchId: { $in: audience.branchIds.map(oid) } } : {}),
      ...(audience.batchIds?.length ? { batchId: { $in: audience.batchIds.map(oid) } } : {}),
    }).select("matchedUserId").lean();
    narrow(entries.map(entry => entry.matchedUserId));
  }
  if (studentIds.length && audience.programCodes?.length) {
    narrow((await StudentProfile.find({ userId: { $in: studentIds }, programCode: { $in: audience.programCodes } }).select("userId").lean()).map(profile => profile.userId));
  }
  if (studentIds.length && admin && audience.plan && audience.plan !== "any") {
    const pro = new Set((await Subscription.find({ userId: { $in: studentIds }, plan: "pro", status: "active", currentPeriodEnd: { $gt: new Date() } }).select("userId").lean()).map(item => String(item.userId)));
    const direct = new Set(users.filter(user => user.role === "student" && !user.institutionId).map(user => String(user._id)));
    // Plans only exist for direct students; institute students are covered by their college and are left out of a plan filter.
    narrow([...direct].filter(id => audience.plan === "pro" ? pro.has(id) : !pro.has(id)));
  }
  if (studentIds.length && (audience.readinessMin !== undefined || audience.readinessMax !== undefined)) {
    const latest = await ReadinessScore.aggregate<{ _id: Types.ObjectId; score: number }>([{ $match: { studentId: { $in: studentIds } } }, { $sort: { calculatedAt: -1 } }, { $group: { _id: "$studentId", score: { $first: "$score" } } }]);
    const score = new Map(latest.map(item => [String(item._id), item.score]));
    narrow(studentIds.filter(id => { const value = score.get(String(id)) ?? 0; return value >= (audience.readinessMin ?? 0) && value <= (audience.readinessMax ?? 100); }));
  }
  users = users.filter(user => user.role !== "student" || keep.has(String(user._id)));

  // Details used to personalise the message.
  const finalStudents = users.filter(user => user.role === "student").map(user => user._id);
  const [entries, institutes] = await Promise.all([
    finalStudents.length ? StudentRosterEntry.find({ matchedUserId: { $in: finalStudents } }).select("matchedUserId branch batchId").lean() : [],
    Institution.find({ _id: { $in: [...new Set(users.map(user => user.institutionId).filter(Boolean).map(String))].map(oid) } }).select("name").lean(),
  ]);
  const batches = await Batch.find({ _id: { $in: entries.map(entry => entry.batchId).filter(Boolean) as Types.ObjectId[] } }).lean();
  const batchName = new Map(batches.map(batch => [String(batch._id), batchLabel(batch)]));
  const entryOf = new Map(entries.map(entry => [String(entry.matchedUserId), entry]));
  const instituteName = new Map(institutes.map(item => [String(item._id), item.name]));

  return users.map(user => {
    const entry = entryOf.get(String(user._id));
    return {
      userId: user._id, email: user.email, name: user.name, firstName: user.name.trim().split(/\s+/)[0] || user.name, role: user.role,
      branch: entry?.branch ?? "", batch: entry?.batchId ? batchName.get(String(entry.batchId)) ?? "" : "", institute: user.institutionId ? instituteName.get(String(user.institutionId)) ?? "" : "",
    };
  });
}

/** Replaces {{firstName}}, {{branch}} etc. with the recipient's own details. */
export const render = (text: string, recipient: Recipient) => text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => (VARIABLES as readonly string[]).includes(key) ? String(recipient[key as keyof Recipient] ?? "") : "");
export const unknownVariables = (...texts: string[]) => [...new Set(texts.flatMap(text => [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(match => match[1])).filter(key => !(VARIABLES as readonly string[]).includes(key)))];

const ctaLink = (url: string) => (url.startsWith("http") ? url : appLink("/"));

/** Creates each recipient's notification (and email, if chosen), then marks the broadcast sent. Safe to retry: duplicates are ignored. */
export async function deliverBroadcast(broadcastId: Types.ObjectId | string) {
  const broadcast = await Broadcast.findById(broadcastId);
  if (!broadcast || broadcast.status !== "sending") return;
  try {
    const sender: Sender = broadcast.senderRole === "platform_admin" ? { kind: "admin" } : { kind: "tpo", institutionId: String(broadcast.institutionId) };
    const recipients = await resolveRecipients(sender, (broadcast.audience ?? {}) as Audience);
    const sourceKey = `broadcast:${broadcast._id}`;
    let emails = 0;
    for (let start = 0; start < recipients.length; start += 500) {
      const chunk = recipients.slice(start, start + 500);
      if (broadcast.channels?.inApp !== false) {
        await Notification.insertMany(chunk.map(recipient => ({
          userId: recipient.userId, sourceKey, kind: "announcement", title: render(broadcast.title, recipient).slice(0, 140), body: render(broadcast.body, recipient).slice(0, 2000),
          href: broadcast.ctaUrl ?? "", ctaLabel: broadcast.ctaLabel ?? "", priority: broadcast.priority, broadcastId: broadcast._id, expiresAt: broadcast.expiresAt ?? null, emailPending: false,
        })), { ordered: false }).catch(() => undefined);   // the unique (user, sourceKey) index drops duplicates on a retry
        await sendPushes(chunk.map(recipient => ({ userId: recipient.userId, title: render(broadcast.title, recipient), body: render(broadcast.body, recipient) })));
      }
      if (broadcast.channels?.email && emailConfigured()) {
        for (const recipient of chunk) {
          const prefix = broadcast.priority === "urgent" ? "[Urgent] " : "";
          const link = broadcast.ctaUrl ? `\n\n${broadcast.ctaLabel || "Open"}: ${ctaLink(broadcast.ctaUrl)}` : `\n\nOpen Placeble: ${appLink("/")}`;
          const result = await queueEmail({ key: `broadcast:${broadcast._id}:${recipient.userId}`, to: recipient.email, subject: `${prefix}${render(broadcast.title, recipient)}`.slice(0, 200), text: `${render(broadcast.body, recipient)}${link}`, expiresAt: broadcast.expiresAt ?? undefined });
          if (result === "queued") emails += 1;
        }
      }
    }
    await Broadcast.updateOne({ _id: broadcast._id }, { $set: { status: "sent", sentAt: new Date(), recipientCount: recipients.length, emailsQueued: emails } });
  } catch (error) {
    await Broadcast.updateOne({ _id: broadcast._id }, { $set: { status: "failed", error: error instanceof Error ? error.message.slice(0, 300) : "Delivery failed." } });
  }
}

/** Sends scheduled broadcasts when their time comes. Claiming is atomic so two servers never send the same one. */
export function startBroadcastScheduler() {
  const tick = async () => {
    for (;;) {
      const due = await Broadcast.findOneAndUpdate({ status: "scheduled", scheduledAt: { $lte: new Date() } }, { $set: { status: "sending" } }, { sort: { scheduledAt: 1 } });
      if (!due) return;
      await deliverBroadcast(due._id);
    }
  };
  const timer = setInterval(() => { void tick().catch(() => console.error("Broadcast scheduler unavailable; retrying.")); }, 30_000);
  timer.unref?.();
  return () => clearInterval(timer);
}
