import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { requireAuth, requireInstitutionScope, requireRole, requireTpoPermission } from "../middleware/auth";
import { Batch, GRACE_DAYS, batchLabel, batchPeriod, batchState, endOfMonth } from "../models/Batch";
import { Branch } from "../models/Branch";
import { StudentRosterEntry } from "../models/StudentRosterEntry";
import { User } from "../models/User";

const router = Router();
router.use(requireAuth, requireInstitutionScope);

/** "2025-06" from a calendar month picker. */
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a month and year.").transform(value => ({ year: Number(value.slice(0, 4)), month: Number(value.slice(5)) }));

async function present(institutionId: string) {
  const id = new mongoose.Types.ObjectId(institutionId);
  const [batches, branches, counts] = await Promise.all([
    Batch.find({ institutionId: id }).sort({ endYear: -1, endMonth: -1 }).lean(),
    Branch.find({ institutionId: id }).select("name").lean(),
    StudentRosterEntry.aggregate([{ $match: { institutionId: id, batchId: { $ne: null } } }, { $group: { _id: "$batchId", students: { $sum: 1 }, registered: { $sum: { $cond: [{ $eq: ["$status", "matched"] }, 1, 0] } } } }]),
  ]);
  const branchName = new Map(branches.map(branch => [String(branch._id), branch.name]));
  const count = new Map(counts.map(item => [String(item._id), item]));
  return batches.map(batch => ({
    id: String(batch._id), branchId: String(batch.branchId), branchName: branchName.get(String(batch.branchId)) ?? "Branch",
    startMonth: `${batch.startYear}-${String(batch.startMonth).padStart(2, "0")}`, endMonth: `${batch.endYear}-${String(batch.endMonth).padStart(2, "0")}`,
    label: batchLabel(batch), period: batchPeriod(batch), endsAt: batch.endsAt, state: batchState(batch), graceDays: GRACE_DAYS,
    students: count.get(String(batch._id))?.students ?? 0, registered: count.get(String(batch._id))?.registered ?? 0,
  }));
}

router.get("/", requireRole("tpo", "faculty"), async (request, response) => response.json({ batches: await present(request.institutionScope!) }));

router.post("/", requireRole("tpo"), requireTpoPermission("roster"), async (request, response, next) => {
  try {
    const input = z.object({ branchId: z.string().refine(value => mongoose.isValidObjectId(value), "Choose a branch."), start: month, end: month }).parse({ branchId: request.body?.branchId, start: request.body?.startMonth, end: request.body?.endMonth });
    if (input.end.year * 12 + input.end.month <= input.start.year * 12 + input.start.month) return response.status(400).json({ message: "The end month must be after the start month." });
    const branch = await Branch.findOne({ _id: input.branchId, institutionId: request.institutionScope, status: "active" }).select("_id").lean();
    if (!branch) return response.status(404).json({ message: "Choose one of your enabled branches." });
    const clash = await Batch.exists({ institutionId: request.institutionScope, branchId: branch._id, startYear: input.start.year, startMonth: input.start.month, endYear: input.end.year, endMonth: input.end.month });
    if (clash) return response.status(409).json({ message: "This batch already exists for that branch." });
    await Batch.create({ institutionId: request.institutionScope, branchId: branch._id, startYear: input.start.year, startMonth: input.start.month, endYear: input.end.year, endMonth: input.end.month, endsAt: endOfMonth(input.end.year, input.end.month) });
    return response.status(201).json({ batches: await present(request.institutionScope!) });
  } catch (error) { return next(error); }
});

/** Change a batch's dates, e.g. to extend it. Everyone in the batch follows the new end date straight away. */
router.patch("/:batchId", requireRole("tpo"), requireTpoPermission("roster"), async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.batchId)) return response.status(404).json({ message: "Batch not found." });
    const input = z.object({ start: month.optional(), end: month.optional() }).parse({ start: request.body?.startMonth, end: request.body?.endMonth });
    const batch = await Batch.findOne({ _id: request.params.batchId, institutionId: request.institutionScope });
    if (!batch) return response.status(404).json({ message: "Batch not found." });
    const start = input.start ?? { year: batch.startYear, month: batch.startMonth };
    const end = input.end ?? { year: batch.endYear, month: batch.endMonth };
    if (end.year * 12 + end.month <= start.year * 12 + start.month) return response.status(400).json({ message: "The end month must be after the start month." });
    const clash = await Batch.exists({ _id: { $ne: batch._id }, institutionId: request.institutionScope, branchId: batch.branchId, startYear: start.year, startMonth: start.month, endYear: end.year, endMonth: end.month });
    if (clash) return response.status(409).json({ message: "Another batch of this branch already has those dates." });
    Object.assign(batch, { startYear: start.year, startMonth: start.month, endYear: end.year, endMonth: end.month, endsAt: endOfMonth(end.year, end.month) });
    await batch.save();
    // Keep each student's access date and graduating year in step.
    const entries = await StudentRosterEntry.find({ batchId: batch._id }).select("_id matchedUserId").lean();
    await StudentRosterEntry.updateMany({ batchId: batch._id }, { $set: { batchYear: end.year } });
    const userIds = entries.map(entry => entry.matchedUserId).filter((id): id is mongoose.Types.ObjectId => Boolean(id));
    if (userIds.length) {
      await User.updateMany({ _id: { $in: userIds } }, { $set: { batchEndsAt: batch.endsAt } });
      const { StudentProfile } = await import("../models/StudentProfile");
      await StudentProfile.updateMany({ userId: { $in: userIds } }, { $set: { graduationYear: end.year } });
    }
    return response.json({ batches: await present(request.institutionScope!) });
  } catch (error) { return next(error); }
});

export { router as batchRouter };
