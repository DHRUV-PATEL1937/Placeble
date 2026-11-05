import { Router, type Request } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { requireAuth, requireRole, requireTpoPermission } from "../middleware/auth";
import { Batch, batchLabel, batchPeriod } from "../models/Batch";
import { Branch } from "../models/Branch";
import { Broadcast } from "../models/Broadcast";
import { Institution } from "../models/Institution";
import { Notification } from "../models/Notification";
import { University } from "../models/University";
import { audienceSchema, deliverBroadcast, render, resolveRecipients, unknownVariables, VARIABLES, type Audience, type Sender } from "../services/broadcast-service";
import { getPrograms } from "../services/program-service";

/** Announcements and bulk notifications. Superadmin reaches anyone; an institute TPO reaches only their own students. */
const router = Router();
router.use(requireAuth, requireRole("platform_admin", "tpo"));
router.use((request, response, next) => (request.auth!.role === "platform_admin" ? next() : requireTpoPermission("messaging")(request, response, next)));

/** Pages a student can be sent to from a notification. */
export const STUDENT_VIEWS = [
  ["Overview", "Home"], ["Agents", "Practice tools"], ["Progress", "My progress"], ["Messages", "Messages"], ["Resume Maker", "Resume builder"], ["Aptitude Test", "Aptitude practice"],
  ["Mock Interview", "Mock interview"], ["Cover Letter", "Cover letter"], ["Coding Practice", "Coding practice"], ["Profile", "Profile"], ["Plan", "Plan"], ["Settings", "Settings"],
] as const;

function senderOf(request: Request): Sender | null {
  if (request.auth!.role === "platform_admin") return { kind: "admin" };
  return request.auth!.institutionId ? { kind: "tpo", institutionId: request.auth!.institutionId } : null;
}
const needInstitute = "Open one of your colleges first. A TPO message is sent from inside a college.";

const scope = (request: Request) => request.auth!.role === "platform_admin"
  ? { senderRole: "platform_admin" as const }
  : { senderRole: "tpo" as const, institutionId: new mongoose.Types.ObjectId(request.auth!.institutionId) };

router.get("/options", async (request, response) => {
  const sender = senderOf(request);
  if (!sender) return response.status(403).json({ message: needInstitute });
  const common = { variables: VARIABLES, views: STUDENT_VIEWS.map(([value, label]) => ({ value, label })) };
  if (sender.kind === "admin") {
    const [institutions, universities, programs] = await Promise.all([Institution.find({ status: "active" }).sort({ name: 1 }).select("name universityId").lean(), University.find({ status: "active" }).sort({ name: 1 }).select("name").lean(), getPrograms()]);
    return response.json({ ...common, kind: "admin", institutions: institutions.map(item => ({ id: String(item._id), name: item.name, universityId: item.universityId ? String(item.universityId) : null })), universities: universities.map(item => ({ id: String(item._id), name: item.name })), programs: programs.map(item => ({ code: item.code, name: item.name })) });
  }
  const [branches, batches] = await Promise.all([Branch.find({ institutionId: sender.institutionId, status: "active" }).sort({ name: 1 }).lean(), Batch.find({ institutionId: sender.institutionId }).sort({ endYear: -1 }).lean()]);
  const branchName = new Map(branches.map(branch => [String(branch._id), branch.name]));
  return response.json({ ...common, kind: "tpo", branches: branches.map(branch => ({ id: String(branch._id), name: branch.name })), batches: batches.map(batch => ({ id: String(batch._id), branchId: String(batch.branchId), label: `${branchName.get(String(batch.branchId)) ?? ""} ${batchLabel(batch)}`.trim(), period: batchPeriod(batch) })) });
});

router.post("/preview", async (request, response, next) => {
  try {
    const sender = senderOf(request);
    if (!sender) return response.status(403).json({ message: needInstitute });
    const input = z.object({ audience: audienceSchema, title: z.string().max(140).default(""), body: z.string().max(2000).default("") }).parse(request.body);
    const recipients = await resolveRecipients(sender, input.audience);
    const first = recipients[0];
    return response.json({
      count: recipients.length,
      sample: recipients.slice(0, 5).map(item => ({ name: item.name, email: item.email, role: item.role, branch: item.branch, batch: item.batch })),
      rendered: first ? { title: render(input.title, first), body: render(input.body, first), forName: first.name } : null,
    });
  } catch (error) { return next(error); }
});

router.post("/", async (request, response, next) => {
  try {
    const sender = senderOf(request);
    if (!sender) return response.status(403).json({ message: needInstitute });
    const input = z.object({
      title: z.string().trim().min(3, "Add a title.").max(140),
      body: z.string().trim().min(3, "Write your message.").max(2000),
      priority: z.enum(["info", "important", "urgent"]).default("info"),
      ctaLabel: z.string().trim().max(40).default(""),
      ctaUrl: z.string().trim().max(300).default("").refine(value => !value || value.startsWith("https://") || STUDENT_VIEWS.some(([view]) => view === value), "Choose a page, or use a full https:// link."),
      channels: z.object({ inApp: z.boolean(), email: z.boolean() }).refine(value => value.inApp || value.email, "Choose at least one way to send it."),
      audience: audienceSchema,
      sendAt: z.string().datetime().optional(),
      expiresAt: z.string().datetime().optional(),
    }).parse(request.body);

    const unknown = unknownVariables(input.title, input.body);
    if (unknown.length) return response.status(400).json({ message: `Unknown placeholder ${unknown.map(item => `{{${item}}}`).join(", ")}. You can use ${VARIABLES.map(item => `{{${item}}}`).join(", ")}.` });
    const sendAt = input.sendAt ? new Date(input.sendAt) : null;
    const later = Boolean(sendAt && sendAt.getTime() > Date.now() + 60_000);
    if (sendAt && sendAt.getTime() > Date.now() + 90 * 86_400_000) return response.status(400).json({ message: "You can schedule up to 90 days ahead." });
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= (later ? sendAt!.getTime() : Date.now())) return response.status(400).json({ message: "The expiry must be after the send time." });
    if (await Broadcast.countDocuments({ senderId: request.auth!.userId, createdAt: { $gt: new Date(Date.now() - 3_600_000) } }) >= 20) return response.status(429).json({ message: "You’ve sent a lot of announcements in the last hour. Please wait a bit." });

    const recipients = await resolveRecipients(sender, input.audience as Audience);
    if (!recipients.length) return response.status(400).json({ message: "No one matches this audience yet. Widen the filters." });

    const broadcast = await Broadcast.create({
      senderId: request.auth!.userId, senderRole: sender.kind === "admin" ? "platform_admin" : "tpo", institutionId: sender.kind === "tpo" ? sender.institutionId : null,
      title: input.title, body: input.body, priority: input.priority, ctaLabel: input.ctaUrl ? input.ctaLabel : "", ctaUrl: input.ctaUrl, channels: input.channels, audience: input.audience,
      recipientCount: recipients.length, status: later ? "scheduled" : "sending", scheduledAt: later ? sendAt : null, expiresAt,
    });
    if (!later) setImmediate(() => { void deliverBroadcast(broadcast._id); });
    return response.status(201).json({ id: String(broadcast._id), status: broadcast.status, recipientCount: recipients.length });
  } catch (error) { return next(error); }
});

router.get("/", async (request, response) => {
  const broadcasts = await Broadcast.find(scope(request)).sort({ createdAt: -1 }).limit(50).lean();
  const stats = await Notification.aggregate<{ _id: mongoose.Types.ObjectId; total: number; read: number }>([
    { $match: { broadcastId: { $in: broadcasts.map(item => item._id) } } },
    { $group: { _id: "$broadcastId", total: { $sum: 1 }, read: { $sum: { $cond: [{ $ne: ["$readAt", null] }, 1, 0] } } } },
  ]);
  const byId = new Map(stats.map(item => [String(item._id), item]));
  return response.json({ broadcasts: broadcasts.map(item => ({
    id: String(item._id), title: item.title, body: item.body, priority: item.priority, status: item.status, channels: item.channels, ctaLabel: item.ctaLabel, ctaUrl: item.ctaUrl,
    recipientCount: item.recipientCount, emailsQueued: item.emailsQueued, read: byId.get(String(item._id))?.read ?? 0, delivered: byId.get(String(item._id))?.total ?? 0,
    createdAt: item.createdAt, scheduledAt: item.scheduledAt, sentAt: item.sentAt, expiresAt: item.expiresAt, error: item.error,
  })) });
});

/** Cancel a scheduled announcement, or pull a sent one back out of people's notifications. */
router.delete("/:id", async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(404).json({ message: "Announcement not found." });
  const broadcast = await Broadcast.findOne({ _id: request.params.id, ...scope(request) });
  if (!broadcast) return response.status(404).json({ message: "Announcement not found." });
  if (broadcast.status === "scheduled") { broadcast.status = "canceled"; await broadcast.save(); return response.json({ status: "canceled" }); }
  if (broadcast.status === "sent") {
    await Notification.deleteMany({ broadcastId: broadcast._id });
    broadcast.status = "recalled"; await broadcast.save();
    return response.json({ status: "recalled", note: "Removed from everyone’s notifications. Emails already sent can’t be taken back." });
  }
  return response.status(409).json({ message: "This announcement can’t be changed right now." });
});

export { router as broadcastRouter };
