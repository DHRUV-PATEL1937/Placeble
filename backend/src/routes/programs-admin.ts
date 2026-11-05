import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { Branch } from "../models/Branch";
import { ProgramModel } from "../models/Program";
import { StudentProfile } from "../models/StudentProfile";
import { writeAdminAudit } from "../services/admin-audit-service";
import { invalidatePrograms } from "../services/program-service";

/** Superadmin: manage the list of programmes (branches) that institutes and students choose from. */
const router = Router();
router.use(requireAuth, requireRole("platform_admin"));

const cleanRoles = (roles: string[]) => [...new Map(roles.map(role => role.trim().replace(/\s+/g, " ")).filter(Boolean).map(role => [role.toLowerCase(), role])).values()];
const fields = {
  name: z.string().trim().min(2).max(80),
  category: z.string().trim().min(2).max(60),
  durationYears: z.coerce.number().int().min(1).max(8),
  interviewStyle: z.enum(["technical", "business", "mixed"]),
  roles: z.array(z.string().trim().min(2).max(80)).min(1, "Add at least one suggested role.").max(20).transform(cleanRoles),
  coding: z.boolean(),
};

router.get("/", async (_request, response) => {
  const [programs, institutes, students] = await Promise.all([
    ProgramModel.find({}).sort({ order: 1, name: 1 }).lean(),
    Branch.aggregate<{ _id: string; count: number }>([{ $match: { programCode: { $ne: null }, status: "active" } }, { $group: { _id: "$programCode", count: { $sum: 1 } } }]),
    StudentProfile.aggregate<{ _id: string; count: number }>([{ $match: { programCode: { $ne: null } } }, { $group: { _id: "$programCode", count: { $sum: 1 } } }]),
  ]);
  const instituteCount = new Map(institutes.map(row => [row._id, row.count]));
  const studentCount = new Map(students.map(row => [row._id, row.count]));
  return response.json({ programs: programs.map(program => ({ code: program.code, name: program.name, category: program.category, durationYears: program.durationYears, interviewStyle: program.interviewStyle, roles: program.roles, coding: program.coding, active: program.active, institutes: instituteCount.get(program.code) ?? 0, students: studentCount.get(program.code) ?? 0 })) });
});

router.post("/", async (request, response, next) => {
  try {
    const input = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,40}$/, "Use 2–40 letters, numbers or underscores for the code."), ...fields }).parse(request.body);
    if (await ProgramModel.exists({ code: input.code })) return response.status(409).json({ message: `A programme with the code ${input.code} already exists.` });
    if (await ProgramModel.exists({ name: new RegExp(`^${input.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") })) return response.status(409).json({ message: `A programme named ${input.name} already exists.` });
    const last = await ProgramModel.findOne({}).sort({ order: -1 }).select("order").lean();
    const program = await ProgramModel.create({ ...input, active: true, order: (last?.order ?? 0) + 1 });
    invalidatePrograms();
    await writeAdminAudit({ platformAdminId: request.auth!.userId, action: "program_changed", targetType: "program", targetId: program._id, metadata: { code: program.code, change: "created" } });
    return response.status(201).json({ code: program.code });
  } catch (error) { return next(error); }
});

router.patch("/:code", async (request, response, next) => {
  try {
    const input = z.object({ ...Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, schema.optional()])), active: z.boolean().optional() }).parse(request.body) as Partial<{ name: string; category: string; durationYears: number; interviewStyle: "technical" | "business" | "mixed"; roles: string[]; coding: boolean; active: boolean }>;
    const program = await ProgramModel.findOne({ code: String(request.params.code).toUpperCase() });
    if (!program) return response.status(404).json({ message: "Programme not found." });
    if (input.name && input.name.toLowerCase() !== program.name.toLowerCase() && await ProgramModel.exists({ code: { $ne: program.code }, name: new RegExp(`^${input.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") })) return response.status(409).json({ message: `A programme named ${input.name} already exists.` });
    Object.assign(program, input);
    await program.save();
    // Branches keep a readable copy of the name; a rename should show everywhere.
    if (input.name) await Branch.updateMany({ programCode: program.code }, { $set: { name: program.name } });
    invalidatePrograms();
    await writeAdminAudit({ platformAdminId: request.auth!.userId, action: "program_changed", targetType: "program", targetId: program._id, metadata: { code: program.code, changed: Object.keys(input) } });
    return response.json({ code: program.code });
  } catch (error) { return next(error); }
});

export { router as programsAdminRouter };
