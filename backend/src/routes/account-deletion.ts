import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { AccountDeletionRequest } from "../models/AccountDeletionRequest";
import { AgentResult } from "../models/AgentResult";
import { Application } from "../models/Application";
import { AptitudeAttempt } from "../models/AptitudeAttempt";
import { CodingSubmission } from "../models/CodingSubmission";
import { CodingWorkspace } from "../models/CodingWorkspace";
import { CoverLetter } from "../models/CoverLetter";
import { GdSession } from "../models/GdSession";
import { Interview } from "../models/Interview";
import { MatchScore } from "../models/MatchScore";
import { ReadinessScore } from "../models/ReadinessScore";
import { Resume } from "../models/Resume";
import { StudentActionPlan } from "../models/StudentActionPlan";
import { Notification } from "../models/Notification";
import { PushDevice } from "../models/PushDevice";
import { RefreshSession } from "../models/RefreshSession";
import { StudentProfile } from "../models/StudentProfile";
import { User } from "../models/User";
import { writeAdminAudit } from "../services/admin-audit-service";

const objectId = z.string().refine(value => mongoose.isValidObjectId(value), "Invalid identifier.");

/** Direct (B2C) students can ask to have their account deleted. Institute accounts are managed by the institute. */
export const accountRouter = Router();
accountRouter.use(requireAuth);

const shape = (row: { _id: unknown; status: string; reason?: string | null; reviewNote?: string | null; createdAt?: Date; decidedAt?: Date | null }) => ({
  id: String(row._id), status: row.status, reason: row.reason ?? "", reviewNote: row.reviewNote ?? "", requestedAt: row.createdAt, decidedAt: row.decidedAt ?? null,
});

accountRouter.get("/deletion-request", async (request, response) => {
  const latest = await AccountDeletionRequest.findOne({ userId: request.auth!.userId }).sort({ createdAt: -1 }).lean();
  return response.json({ request: latest ? shape(latest) : null });
});

accountRouter.post("/deletion-request", async (request, response, next) => {
  try {
    const input = z.object({ reason: z.string().trim().max(500).default("") }).parse(request.body);
    const user = await User.findById(request.auth!.userId).select("name email role institutionId").lean();
    if (!user) return response.status(404).json({ message: "Account not found." });
    // Only people who signed up on their own. Institute accounts belong to the institute and are managed by it.
    if (user.role !== "student" || user.institutionId) return response.status(403).json({ code: "NOT_DIRECT_STUDENT", message: "Your account is managed by your institute. Please ask your placement team." });
    try {
      const created = await AccountDeletionRequest.create({ userId: user._id, name: user.name, email: user.email, role: user.role, institutionId: user.institutionId ?? null, reason: input.reason });
      return response.status(201).json({ request: shape(created) });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return response.status(409).json({ message: "You already have a deletion request waiting for review." });
      throw error;
    }
  } catch (error) { return next(error); }
});

accountRouter.delete("/deletion-request", async (request, response) => {
  const cancelled = await AccountDeletionRequest.findOneAndUpdate({ userId: request.auth!.userId, status: "pending" }, { $set: { status: "cancelled", decidedAt: new Date() } }, { returnDocument: "after" });
  if (!cancelled) return response.status(404).json({ message: "There's no pending request to cancel." });
  return response.json({ request: shape(cancelled) });
});

/** Superadmin review queue. */
export const accountDeletionAdminRouter = Router();
accountDeletionAdminRouter.use(requireAuth, requireRole("platform_admin"));

accountDeletionAdminRouter.get("/", async (request, response) => {
  const status = z.enum(["pending", "approved", "rejected", "cancelled", "all"]).default("pending").parse(request.query.status);
  const rows = await AccountDeletionRequest.find(status === "all" ? {} : { status }).sort({ createdAt: status === "pending" ? 1 : -1 }).limit(200).lean();
  const pending = await AccountDeletionRequest.countDocuments({ status: "pending" });
  return response.json({
    pending,
    requests: rows.map(row => ({ ...shape(row), userId: String(row.userId), name: row.name, email: row.email, role: row.role })),
  });
});

accountDeletionAdminRouter.patch("/:id", async (request, response, next) => {
  try {
    const id = objectId.parse(request.params.id);
    const input = z.object({ decision: z.enum(["approve", "reject"]), note: z.string().trim().max(500).default("") }).parse(request.body);
    if (input.decision === "reject" && input.note.length < 3) return response.status(400).json({ message: "Please tell them why it was declined." });
    const found = await AccountDeletionRequest.findOne({ _id: id, status: "pending" }).lean();
    if (!found) return response.status(409).json({ message: "This request was already handled." });
    const target = await User.findById(found.userId).select("role").lean();
    if (input.decision === "approve" && target?.role === "platform_admin") return response.status(403).json({ message: "Super admin accounts can't be deleted this way." });

    const changed = await AccountDeletionRequest.findOneAndUpdate(
      { _id: id, status: "pending" },
      { $set: { status: input.decision === "approve" ? "approved" : "rejected", reviewedBy: request.auth!.userId, reviewNote: input.note, decidedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!changed) return response.status(409).json({ message: "This request was already handled." });

    if (input.decision === "approve" && target) {
      // Close the account and remove the personal details. The email is freed so the address can be used to sign up again.
      await Promise.all([
        User.updateOne({ _id: changed.userId }, { $set: { status: "suspended", name: "Deleted user", email: `deleted+${changed.userId}@deleted.placeble.invalid` }, $unset: { passwordHash: "" } }),
        RefreshSession.deleteMany({ userId: changed.userId }),
        PushDevice.deleteMany({ userId: changed.userId }),
        Notification.deleteMany({ userId: changed.userId }),
        StudentProfile.deleteOne({ userId: changed.userId }),
        // Everything the student created. Payments and subscriptions stay, as accounting records.
        ...[AgentResult, Application, AptitudeAttempt, CodingSubmission, CodingWorkspace, CoverLetter, GdSession, Interview, MatchScore, ReadinessScore, Resume, StudentActionPlan].map(model => (model as unknown as { deleteMany: (filter: object) => Promise<unknown> }).deleteMany({ studentId: changed.userId })),
      ]);
    }
    await writeAdminAudit({ platformAdminId: request.auth!.userId, action: input.decision === "approve" ? "account_deletion_approved" : "account_deletion_rejected", targetType: "user", targetId: changed.userId, metadata: { email: changed.email, role: changed.role, note: input.note } });
    return response.json({ request: shape(changed) });
  } catch (error) { return next(error); }
});
