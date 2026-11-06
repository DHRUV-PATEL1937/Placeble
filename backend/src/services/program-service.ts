import { ProgramModel } from "../models/Program";
import { DEFAULT_PROGRAMS, type InterviewStyle } from "./programs";

export type ProgramView = { code: string; name: string; category: string; durationYears: number; interviewStyle: InterviewStyle; roles: string[]; coding: boolean; active: boolean };

let seeded = false;
let cache: { at: number; list: ProgramView[] } | null = null;
const TTL_MS = 30_000;

/** First run: copy the built-in programmes into the database. Existing rows (and any edits to them) are never overwritten. */
async function ensureSeeded() {
  if (seeded) return;
  await Promise.all(DEFAULT_PROGRAMS.map((program, index) => ProgramModel.updateOne({ code: program.code }, { $setOnInsert: { ...program, active: true, order: index } }, { upsert: true })));
  seeded = true;
}

export const invalidatePrograms = () => { cache = null; };

const view = (row: { code: string; name: string; category: string; durationYears: number; interviewStyle?: string | null; roles?: string[] | null; coding?: boolean | null; active?: boolean | null }): ProgramView => ({
  code: row.code, name: row.name, category: row.category, durationYears: row.durationYears,
  interviewStyle: (row.interviewStyle as InterviewStyle) ?? "mixed", roles: row.roles ?? [], coding: Boolean(row.coding), active: row.active !== false,
});

/** All programmes in display order. By default only active ones; pass includeInactive to resolve programmes already in use. */
export async function getPrograms(options: { includeInactive?: boolean } = {}): Promise<ProgramView[]> {
  await ensureSeeded();
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const rows = await ProgramModel.find({}).sort({ order: 1, name: 1 }).lean();
    cache = { at: Date.now(), list: rows.map(view) };
  }
  return options.includeInactive ? cache.list : cache.list.filter(program => program.active);
}

export async function programByCode(code: string | null | undefined) {
  if (!code) return undefined;
  return (await getPrograms({ includeInactive: true })).find(program => program.code === code);
}

/** Matches a programme by code or name, ignoring case and spacing, e.g. "bsc it" -> BSCIT. */
export function matchProgram(list: ProgramView[], text: string) {
  const key = text.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!key) return undefined;
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return list.find(program => norm(program.code) === key || norm(program.name) === key);
}

/** Does this student's programme include the Coding tool? Unknown programme: yes, so nobody loses it by accident. */
export const programHasCoding = (program: ProgramView | undefined) => (program ? program.coding : true);

/**
 * The business tools (Business Case Solver, HR Manager Simulator) are for business programmes: MBA, BBA, B.Com, M.Com, BA and anything
 * the superadmin marks with the "business" interview style. Everyone else doesn't see them. IT programmes get Coding instead.
 */
export const programIsBusiness = (program: ProgramView | undefined) => Boolean(program && program.interviewStyle === "business");
export const programHasCaseStudy = programIsBusiness;
export const programHasHrSimulator = programIsBusiness;
