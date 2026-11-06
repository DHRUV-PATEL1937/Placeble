import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { requireAuth, requireInstitutionScope, requireRole, requireTpoPermission } from "../middleware/auth";
import { InstitutionMessage } from "../models/InstitutionMessage";
import { User } from "../models/User";
import { StudentProfile } from "../models/StudentProfile";
import { StudentRosterEntry } from "../models/StudentRosterEntry";
import { ReadinessScore } from "../models/ReadinessScore";

const router = Router();
router.use(requireAuth, requireRole("student", "tpo"), requireInstitutionScope, requireTpoPermission("messaging"));

const messageInput = z.object({ body: z.string().trim().min(1).max(2000), studentId: z.string().optional() }).strict();
const editInput = z.object({ body: z.string().trim().min(1).max(2000) }).strict();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeMessage(item: any) {
  return {
    id: String(item._id),
    body: item.deletedAt ? "" : item.body,
    senderId: String(item.senderId),
    senderRole: item.senderRole,
    createdAt: item.createdAt,
    deliveredAt: item.deliveredAt ?? null,
    readAt: item.readAt ?? null,
    editedAt: item.editedAt ?? null,
    deletedAt: item.deletedAt ?? null,
    status: item.readAt ? "read" : item.deliveredAt ? "delivered" : "sent",
  };
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const APPROVED: Array<"approved" | "roster_matched"> = ["approved", "roster_matched"];

/** Roster details (branch, batch, roll number) for a set of student user ids, keyed by user id. */
async function rosterDetails(institutionId: string | undefined, userIds: Array<string | mongoose.Types.ObjectId>) {
  const entries = await StudentRosterEntry.find({ institutionId, matchedUserId: { $in: userIds } }).select("matchedUserId rollNumber branch batchYear").lean();
  return new Map(entries.map(entry => [String(entry.matchedUserId), entry]));
}

async function scopedStudent(request: Parameters<typeof requireAuth>[0], studentId: string) {
  if (!mongoose.isValidObjectId(studentId)) return null;
  if (request.auth!.role === "student" && request.auth!.userId !== studentId) return null;
  return User.findOne({
    _id: studentId,
    role: "student",
    status: "active",
    institutionId: request.institutionScope,
    studentVerificationStatus: { $in: ["approved", "roster_matched"] },
  }).select("name email").lean();
}

router.get("/team", requireRole("student"), async (request, response) => {
  const team = await User.find({ institutionId: request.institutionScope, role: "tpo", status: "active" })
    .select("name")
    .sort({ name: 1 })
    .lean();
  return response.json({ team: team.map(member => ({ id: String(member._id), name: member.name })) });
});

router.get("/threads", requireRole("tpo"), async (request, response) => {
  const rows = await InstitutionMessage.aggregate([
    { $match: { institutionId: new mongoose.Types.ObjectId(request.institutionScope) } },
    { $sort: { _id: -1 } },
    {
      $group: {
        _id: "$studentId",
        lastMessage: {
          $first: {
            body: { $cond: [{ $ne: ["$deletedAt", null] }, "Message deleted", "$body"] },
            createdAt: "$createdAt",
            senderRole: "$senderRole",
            deliveredAt: "$deliveredAt",
            readAt: "$readAt",
            deletedAt: "$deletedAt",
          },
        },
        unread: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$senderRole", "student"] }, { $eq: ["$readAt", null] }, { $eq: ["$deletedAt", null] }] },
              1,
              0,
            ],
          },
        },
      },
    },
    { $sort: { "lastMessage.createdAt": -1 } },
    { $limit: 200 },
  ]);
  const students = await User.find({
    _id: { $in: rows.map(row => row._id) },
    institutionId: request.institutionScope,
    role: "student",
    status: "active",
    studentVerificationStatus: { $in: ["approved", "roster_matched"] },
  }).select("name email").lean();
  const byId = new Map(students.map(student => [String(student._id), student]));
  const roster = await rosterDetails(request.institutionScope, students.map(student => student._id));
  return response.json({
    threads: rows
      .filter(row => byId.has(String(row._id)))
      .map(row => ({
        studentId: String(row._id),
        student: byId.get(String(row._id)),
        branch: roster.get(String(row._id))?.branch || "",
        batchYear: roster.get(String(row._id))?.batchYear ?? null,
        lastMessage: row.lastMessage,
        unread: row.unread,
      })),
  });
});

/** Find students (to start a new chat) and messages matching a search term. TPO only. */
router.get("/search", requireRole("tpo"), async (request, response) => {
  const term = typeof request.query.q === "string" ? request.query.q.trim().slice(0, 80) : "";
  if (term.length < 2) return response.json({ people: [], messages: [] });
  const pattern = new RegExp(escapeRegex(term), "i");
  const scope = { institutionId: request.institutionScope, role: "student" as const, status: "active" as const, studentVerificationStatus: { $in: APPROVED } };
  const [byProfile, byRoster, hits] = await Promise.all([
    User.find({ ...scope, $or: [{ name: pattern }, { email: pattern }] }).select("_id").limit(20).lean(),
    StudentRosterEntry.find({ institutionId: request.institutionScope, matchedUserId: { $ne: null }, $or: [{ rollNumber: pattern }, { branch: pattern }] }).select("matchedUserId").limit(20).lean(),
    InstitutionMessage.find({ institutionId: request.institutionScope, deletedAt: null, body: pattern }).sort({ _id: -1 }).limit(15).lean(),
  ]);
  const ids = [...new Set([...byProfile.map(item => String(item._id)), ...byRoster.map(item => String(item.matchedUserId))])].slice(0, 20);
  const hitStudentIds = [...new Set(hits.map(hit => String(hit.studentId)))];
  const [people, hitStudents, threadIds, roster] = await Promise.all([
    User.find({ ...scope, _id: { $in: ids } }).select("name email").sort({ name: 1 }).lean(),
    User.find({ ...scope, _id: { $in: hitStudentIds } }).select("name").lean(),
    InstitutionMessage.distinct("studentId", { institutionId: request.institutionScope, studentId: { $in: ids } }),
    rosterDetails(request.institutionScope, ids),
  ]);
  const hasThread = new Set(threadIds.map(String));
  const nameById = new Map(hitStudents.map(student => [String(student._id), student.name]));
  return response.json({
    people: people.map(person => ({ id: String(person._id), name: person.name, email: person.email, branch: roster.get(String(person._id))?.branch || "", batchYear: roster.get(String(person._id))?.batchYear ?? null, rollNumber: roster.get(String(person._id))?.rollNumber || "", hasThread: hasThread.has(String(person._id)) })),
    messages: hits.filter(hit => nameById.has(String(hit.studentId))).map(hit => ({ id: String(hit._id), studentId: String(hit.studentId), studentName: nameById.get(String(hit.studentId)), body: hit.body, senderRole: hit.senderRole, createdAt: hit.createdAt })),
  });
});

/** A student's profile card for the chat side panel. TPO only. */
router.get("/students/:studentId/profile", requireRole("tpo"), async (request, response) => {
  const studentId = request.params.studentId as string;
  if (!mongoose.isValidObjectId(studentId)) return response.status(404).json({ message: "Student not found." });
  const user = await User.findOne({ _id: studentId, role: "student", institutionId: request.institutionScope, status: "active", studentVerificationStatus: { $in: APPROVED } }).select("name email emailVerified createdAt").lean();
  if (!user) return response.status(404).json({ message: "Student not found." });
  const [profile, latest, previous, roster, messageCount] = await Promise.all([
    StudentProfile.findOne({ userId: studentId }).select("degree graduationYear skills preferredRoles").lean(),
    ReadinessScore.findOne({ studentId }).sort({ calculatedAt: -1 }).lean(),
    ReadinessScore.findOne({ studentId }).sort({ calculatedAt: -1 }).skip(1).lean(),
    StudentRosterEntry.findOne({ institutionId: request.institutionScope, matchedUserId: studentId }).select("rollNumber branch batchYear").lean(),
    InstitutionMessage.countDocuments({ institutionId: request.institutionScope, studentId, deletedAt: null }),
  ]);
  // The overall score exists only once every required agent has been used; until then the card shows progress instead.
  const complete = Boolean(latest?.complete);
  const agents = latest?.agents ?? [];
  const score = complete ? latest?.score ?? 0 : 0;
  const components = (latest?.components ?? {}) as Record<string, number>;
  return response.json({
    profile: {
      id: String(user._id), name: user.name, email: user.email, emailVerified: Boolean(user.emailVerified), joinedAt: user.createdAt,
      branch: roster?.branch || profile?.degree || "", batchYear: roster?.batchYear ?? profile?.graduationYear ?? null, rollNumber: roster?.rollNumber || "",
      skills: profile?.skills ?? [], preferredRoles: profile?.preferredRoles ?? [],
      readiness: score, trend: complete && previous?.complete ? score - previous.score : 0,
      complete, agentsUsed: agents.filter(agent => agent.used).length, agentsTotal: agents.length,
      status: !complete ? "In progress" : score >= 75 ? "Ready" : score >= 60 ? "On track" : score >= 45 ? "Stalled" : "At risk",
      components: { resume: components.resume ?? 0, aptitude: components.aptitude ?? 0, interview: components.interview ?? 0 },
      messageCount,
    },
  });
});

router.get("/threads/:studentId/messages", async (request, response) => {
  const studentId = request.params.studentId as string;
  const student = await scopedStudent(request, studentId);
  if (!student) return response.status(404).json({ message: "Conversation not found." });
  const before = typeof request.query.before === "string" && mongoose.isValidObjectId(request.query.before) ? request.query.before : null;
  const filter = { institutionId: request.institutionScope, studentId, ...(before ? { _id: { $lt: before } } : {}) };
  await InstitutionMessage.updateMany(
    { institutionId: request.institutionScope, studentId, senderId: { $ne: request.auth!.userId }, deliveredAt: null },
    { $set: { deliveredAt: new Date() } }
  );
  const messages = await InstitutionMessage.find(filter).sort({ _id: -1 }).limit(51).lean();
  const hasMore = messages.length > 50;
  return response.json({
    student: { id: String(student._id), name: student.name, email: student.email },
    messages: messages.slice(0, 50).reverse().map(serializeMessage),
    hasMore,
  });
});

router.post("/messages", async (request, response) => {
  const input = messageInput.parse(request.body);
  const studentId = request.auth!.role === "student" ? request.auth!.userId : input.studentId;
  if (!studentId || !await scopedStudent(request, studentId)) return response.status(404).json({ message: "Conversation not found." });
  if (request.auth!.role === "student" && !await User.exists({ institutionId: request.institutionScope, role: "tpo", status: "active" })) {
    return response.status(409).json({ message: "Your placement team is not available yet. Please try again later." });
  }
  const senderRole = request.auth!.role === "student" ? "student" : "tpo";
  const message = await InstitutionMessage.create({
    institutionId: request.institutionScope,
    studentId,
    senderId: request.auth!.userId,
    senderRole,
    body: input.body,
    deliveredAt: new Date(),
  });
  return response.status(201).json({ message: serializeMessage(message.toObject()) });
});

router.patch("/messages/:messageId", async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.messageId)) return response.status(404).json({ message: "Message not found." });
  const input = editInput.parse(request.body);
  const message = await InstitutionMessage.findOne({
    _id: request.params.messageId,
    institutionId: request.institutionScope,
    senderId: request.auth!.userId,
    deletedAt: null,
  });
  if (!message) return response.status(404).json({ message: "Message not found." });
  message.body = input.body;
  message.editedAt = new Date();
  await message.save();
  return response.json({ message: serializeMessage(message.toObject()) });
});

router.delete("/messages/:messageId", async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.messageId)) return response.status(404).json({ message: "Message not found." });
  const message = await InstitutionMessage.findOneAndUpdate(
    { _id: request.params.messageId, institutionId: request.institutionScope, senderId: request.auth!.userId, deletedAt: null },
    { $set: { body: "", deletedAt: new Date() } },
    { new: true }
  );
  if (!message) return response.status(404).json({ message: "Message not found." });
  return response.json({ message: serializeMessage(message.toObject()) });
});

router.patch("/threads/:studentId/read", async (request, response) => {
  const studentId = request.params.studentId as string;
  if (!await scopedStudent(request, studentId)) return response.status(404).json({ message: "Conversation not found." });
  const senderRole = request.auth!.role === "student" ? "tpo" : "student";
  await InstitutionMessage.updateMany(
    { institutionId: request.institutionScope, studentId, senderRole, readAt: null },
    { $set: { readAt: new Date() } }
  );
  return response.json({ ok: true });
});

export { router as chatRouter };

