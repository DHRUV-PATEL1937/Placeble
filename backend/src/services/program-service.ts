import { ProgramModel } from "../models/Program";
import { DEFAULT_PROGRAMS, type InterviewStyle } from "./programs";

/* ------------------------------------------------------------------ Agents per programme */

export const AGENT_KEYS = ["resume", "aptitude", "interview", "coding", "case_study", "hr_simulation"] as const;
export type AgentKey = typeof AGENT_KEYS[number];
export type AgentMode = "off" | "optional" | "scored";
export type AgentConfig = { key: AgentKey; mode: AgentMode; weight: number };

export const AGENT_INFO: Record<AgentKey, { label: string; view: string }> = {
  resume: { label: "Resume builder", view: "Resume Maker" },
  aptitude: { label: "Aptitude practice", view: "Aptitude Test" },
  interview: { label: "Interview Room", view: "Mock Interview" },
  coding: { label: "Coding practice", view: "Coding Practice" },
  case_study: { label: "Business Case Solver", view: "Case Study" },
  hr_simulation: { label: "HR Manager Simulator", view: "HR Simulator" },
};
/** Resume, aptitude and interview are core: every student has them, so they can be optional or scored but never switched off. */
export const CORE_AGENTS = new Set<AgentKey>(["resume", "aptitude", "interview"]);

export type ProgramView = { code: string; name: string; category: string; durationYears: number; interviewStyle: InterviewStyle; roles: string[]; coding: boolean; active: boolean; agents: AgentConfig[] | null };

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

const view = (row: { code: string; name: string; category: string; durationYears: number; interviewStyle?: string | null; roles?: string[] | null; coding?: boolean | null; active?: boolean | null; agents?: Array<{ key: string; mode: string; weight?: number | null }> | null }): ProgramView => ({
  code: row.code, name: row.name, category: row.category, durationYears: row.durationYears,
  interviewStyle: (row.interviewStyle as InterviewStyle) ?? "mixed", roles: row.roles ?? [], coding: Boolean(row.coding), active: row.active !== false,
  agents: row.agents?.length ? row.agents.map(agent => ({ key: agent.key as AgentKey, mode: agent.mode as AgentMode, weight: agent.weight ?? 0 })) : null,
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

/**
 * The defaults for a programme with no agent settings saved, matching how things worked before the settings existed:
 * - Business programmes (MBA, BBA, B.Com, ...): resume, aptitude, interview, Case Solver and HR Simulator count, 20% each.
 * - Programmes with coding: resume, aptitude, interview and coding count, 25% each.
 * - Everyone else: resume, aptitude and interview count, a third each.
 * Outside business programmes the Case Solver and HR Simulator are optional (usable, with their own score).
 * FOR NOW every agent is available to every student: nothing defaults to off. Coding is optional where it doesn't count.
 * To hide coding from programmes without it again, change ALL_AGENTS_FOR_EVERYONE to false (or switch it off per programme in the admin).
 * Unknown programme (student hasn't picked one): treated as a coding programme, so nobody loses a tool by accident.
 */
export const ALL_AGENTS_FOR_EVERYONE = true;
const codingWhenNotCounted: AgentMode = ALL_AGENTS_FOR_EVERYONE ? "optional" : "off";

export function defaultAgents(program: ProgramView | undefined): AgentConfig[] {
  const business = Boolean(program && program.interviewStyle === "business");
  const coding = program ? program.coding : true;
  if (business) return [
    { key: "resume", mode: "scored", weight: 20 }, { key: "aptitude", mode: "scored", weight: 20 }, { key: "interview", mode: "scored", weight: 20 },
    { key: "coding", mode: coding ? "optional" : codingWhenNotCounted, weight: 0 },
    { key: "case_study", mode: "scored", weight: 20 }, { key: "hr_simulation", mode: "scored", weight: 20 },
  ];
  const core = coding ? 25 : 33;
  return [
    { key: "resume", mode: "scored", weight: core }, { key: "aptitude", mode: "scored", weight: core }, { key: "interview", mode: "scored", weight: coding ? 25 : 34 },
    { key: "coding", mode: coding ? "scored" : codingWhenNotCounted, weight: coding ? 25 : 0 },
    { key: "case_study", mode: "optional", weight: 0 }, { key: "hr_simulation", mode: "optional", weight: 0 },
  ];
}

/** The agent settings in force for a programme: what the superadmin saved, with any missing agent filled in from the defaults. */
export function programAgents(program: ProgramView | undefined): AgentConfig[] {
  const defaults = defaultAgents(program);
  const saved = new Map((program?.agents ?? []).map(agent => [agent.key, agent]));
  return AGENT_KEYS.map(key => {
    const agent = saved.get(key) ?? defaults.find(item => item.key === key)!;
    const mode: AgentMode = CORE_AGENTS.has(key) && agent.mode === "off" ? "optional" : agent.mode;
    return { key, mode, weight: mode === "scored" ? Math.max(0, agent.weight) : 0 };
  });
}

export const agentMode = (program: ProgramView | undefined, key: AgentKey) => programAgents(program).find(agent => agent.key === key)!.mode;

/** Does this student's programme include the Coding tool? Follows the programme's agent settings. */
export const programHasCoding = (program: ProgramView | undefined) => agentMode(program, "coding") !== "off";

/** Business programmes: used for guidance and recommendations (what to practise first). Scoring follows the agent settings instead. */
export const programIsBusiness = (program: ProgramView | undefined) => Boolean(program && program.interviewStyle === "business");
export const programHasCaseStudy = (program: ProgramView | undefined) => agentMode(program, "case_study") !== "off";
export const programHasHrSimulator = (program: ProgramView | undefined) => agentMode(program, "hr_simulation") !== "off";
