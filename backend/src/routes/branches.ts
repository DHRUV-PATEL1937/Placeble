import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { requireAuth, requireInstitutionScope, requireRole, requireTpoPermission } from "../middleware/auth";
import { Batch } from "../models/Batch";
import { Branch } from "../models/Branch";
import { StudentRosterEntry } from "../models/StudentRosterEntry";
import { getPrograms, programByCode } from "../services/program-service";

const router = Router();
// Anyone who can read institute data (TPO, university TPO inside an institute, principal) can list branches.
router.use(requireAuth, requireInstitutionScope);

const shape = (branch: { _id: unknown; name: string; code?: string | null; programCode?: string | null; status: string }, counts?: { students: number; registered: number }) => ({
  id: String(branch._id), name: branch.name, code: branch.code ?? "", programCode: branch.programCode ?? null, status: branch.status,
  students: counts?.students ?? 0, registered: counts?.registered ?? 0,
});

router.get("/", requireRole("tpo", "faculty"), async (request, response) => {
  const institutionId = new mongoose.Types.ObjectId(request.institutionScope);
  const [branches, counts, batches] = await Promise.all([
    Branch.find({ institutionId }).sort({ name: 1 }).lean(),
    StudentRosterEntry.aggregate([
      { $match: { institutionId, branchId: { $ne: null } } },
      { $group: { _id: "$branchId", students: { $sum: 1 }, registered: { $sum: { $cond: [{ $eq: ["$status", "matched"] }, 1, 0] } } } },
    ]),
    Batch.aggregate([{ $match: { institutionId } }, { $group: { _id: "$branchId", batches: { $sum: 1 } } }]),
  ]);
  const byId = new Map(counts.map(item => [String(item._id), item]));
  const batchCount = new Map(batches.map(item => [String(item._id), item.batches as number]));
  return response.json({ branches: branches.map(branch => ({ ...shape(branch, byId.get(String(branch._id))), batches: batchCount.get(String(branch._id)) ?? 0 })) });
});

/** The fixed list of programmes an institute can switch on, with which ones are already enabled. */
router.get("/catalog", requireRole("tpo", "faculty"), async (request, response) => {
  const enabled = await Branch.find({ institutionId: request.institutionScope, programCode: { $ne: null } }).select("programCode status").lean();
  const state = new Map(enabled.map(branch => [branch.programCode, branch.status]));
  return response.json({ programs: (await getPrograms()).map(program => ({ code: program.code, name: program.name, category: program.category, durationYears: program.durationYears, enabled: state.get(program.code) === "active", archived: state.get(program.code) === "archived" })) });
});

/** Switch on a programme for this institute. The name comes from the catalog, never from the request. */
router.post("/", requireRole("tpo"), requireTpoPermission("roster"), async (request, response, next) => {
  try {
    const input = z.object({ programCode: z.string().trim().min(1).max(40) }).parse(request.body);
    const program = await programByCode(input.programCode);
    if (!program || !program.active) return response.status(400).json({ message: "Choose a programme from the list." });
    const existing = await Branch.findOne({ institutionId: request.institutionScope, programCode: program.code });
    if (existing) {
      if (existing.status === "active") return response.status(409).json({ message: `${program.name} is already enabled.` });
      existing.status = "active"; await existing.save();
      return response.json({ branch: shape(existing) });
    }
    const branch = await Branch.create({ institutionId: request.institutionScope, name: program.name, code: program.code, programCode: program.code });
    return response.status(201).json({ branch: shape(branch) });
  } catch (error) { return next(error); }
});

/** Archive or restore a branch. Branches can't be renamed: the name is the programme's. */
router.patch("/:branchId", requireRole("tpo"), requireTpoPermission("roster"), async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.branchId)) return response.status(404).json({ message: "Branch not found." });
    const input = z.object({ status: z.enum(["active", "archived"]) }).parse(request.body);
    const branch = await Branch.findOne({ _id: request.params.branchId, institutionId: request.institutionScope });
    if (!branch) return response.status(404).json({ message: "Branch not found." });
    branch.status = input.status;
    await branch.save();
    return response.json({ branch: shape(branch) });
  } catch (error) { return next(error); }
});

export { router as branchRouter };
