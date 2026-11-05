import { type Types } from "mongoose";
import { Batch, batchLabel, type BatchDocument } from "../models/Batch";
import { Branch } from "../models/Branch";
import { StudentProfile } from "../models/StudentProfile";
import { User } from "../models/User";
import { getPrograms, matchProgram } from "./program-service";

type BranchLite = { _id: Types.ObjectId; name: string; programCode?: string | null };
type BatchLite = BatchDocument & { _id: Types.ObjectId };

/** Looks up an institute's enabled branches and batches so a roster row's branch and batch can be matched without a query per row. */
export async function loadPlacementIndex(institutionId: string | Types.ObjectId) {
  const [programs, branches, batches] = await Promise.all([
    getPrograms({ includeInactive: true }),
    Branch.find({ institutionId, status: "active" }).select("name programCode").lean() as Promise<BranchLite[]>,
    Batch.find({ institutionId }).lean() as Promise<BatchLite[]>,
  ]);

  const findBranch = (text: string) => {
    const wanted = text.trim();
    if (!wanted) return { error: "Branch is required. Pick one of your enabled branches." } as const;
    const program = matchProgram(programs, wanted);
    const normal = wanted.toLowerCase().replace(/[^a-z0-9]/g, "");
    const branch = branches.find(item => (program && item.programCode === program.code) || item.name.toLowerCase().replace(/[^a-z0-9]/g, "") === normal);
    return branch ? { branch } as const : { error: `Branch “${wanted}” isn’t enabled for your institute. Enable it under Branches first.` } as const;
  };

  /** "2025-2027", "2025–2027" or "2025 to 2027" means start year to end year. A lone year is taken as the graduating year. */
  const findBatch = (branch: BranchLite, text: string) => {
    const mine = batches.filter(batch => String(batch.branchId) === String(branch._id));
    const range = text.match(/(\d{4})\D+(\d{4})/);
    const single = text.match(/^\s*(\d{4})\s*$/);
    if (!range && !single) return { error: `Batch is required, like 2025-2027 (${branch.name}).` } as const;
    const found = range ? mine.filter(batch => batch.startYear === Number(range[1]) && batch.endYear === Number(range[2])) : mine.filter(batch => batch.endYear === Number(single![1]));
    if (found.length === 1) return { batch: found[0] } as const;
    if (found.length > 1) return { error: `More than one ${branch.name} batch matches “${text.trim()}”. Use the Batches page to tell them apart.` } as const;
    return { error: `No ${branch.name} batch “${text.trim()}”. Create it under Batches first.` } as const;
  };

  const batchById = (id: string) => batches.find(batch => String(batch._id) === id);
  const branchById = (id: string) => branches.find(branch => String(branch._id) === id);
  return { findBranch, findBatch, batchById, branchById };
}

/** Puts a student on their roster entry's branch and batch: their access end date, graduating year and programme follow. */
export async function applyPlacement(userId: Types.ObjectId | string, entry: { branchId?: Types.ObjectId | null; batchId?: Types.ObjectId | null }) {
  const [batch, branch] = await Promise.all([
    entry.batchId ? Batch.findById(entry.batchId).lean() : null,
    entry.branchId ? Branch.findById(entry.branchId).select("name programCode").lean() : null,
  ]);
  await Promise.all([
    User.updateOne({ _id: userId }, { $set: { batchId: batch?._id ?? null, batchEndsAt: batch?.endsAt ?? null } }),
    StudentProfile.findOneAndUpdate(
      { userId },
      { $set: { ...(branch ? { degree: branch.name, programCode: branch.programCode ?? null } : {}), ...(batch ? { graduationYear: batch.endYear, admissionYear: batch.startYear } : {}) } },
      { upsert: true, setDefaultsOnInsert: true },
    ),
  ]);
}

export { batchLabel };
