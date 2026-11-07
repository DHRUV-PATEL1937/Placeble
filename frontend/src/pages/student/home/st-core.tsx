import { useCountUp, useDrawIn } from "@/hooks/use-motion";
import { BookOpenCheck, Briefcase, Code2, FileText, MessageSquareText, Mic2, UserRoundSearch, UsersRound, type LucideIcon } from "lucide-react";

export type View =
  | "Overview" | "Progress" | "Agents" | "Messages" | "Profile" | "Settings"
  | "Resume Maker" | "Aptitude Test" | "Mock Interview" | "Job Matching" | "Cover Letter" | "Group Discussion"
  | "Opportunities" | "Applications" | "Plan" | "Coding Practice" | "Case Study" | "HR Simulator";

export const STUDENT_VIEWS: readonly View[] = [
  "Overview", "Progress", "Agents", "Messages", "Profile", "Settings",
  "Resume Maker", "Aptitude Test", "Mock Interview", "Job Matching", "Cover Letter", "Group Discussion",
  "Opportunities", "Applications", "Plan", "Coding Practice", "Case Study", "HR Simulator",
];

/** Tools that live under the Career Studio page (Career Studio) for navigation highlighting and the back button. */
export const TOOL_VIEWS: readonly View[] = ["Resume Maker", "Aptitude Test", "Mock Interview", "Job Matching", "Cover Letter", "Group Discussion", "Coding Practice", "Case Study", "HR Simulator"];

// Product flags
export const SHOW_GROUP_DISCUSSION = false;
export const SHOW_JOB_MATCHING = false;

export type Components = { resume: number; aptitude: number; interview: number; groupDiscussion: number; careerActivity: number; caseStudy?: number; hrSimulation?: number };
export type ReadinessPayload = {
  current: { score: number; evidenceCount?: number; components: Components } | null;
  history: Array<{ score: number; calculatedAt: string; reason?: string }>;
  /** Every scored agent, whether the student has used it, and its own score. */
  agents?: Agent[];
  /** Tools the student can use that don't count for their programme (e.g. the Case Solver outside MBA/BBA). Own score only, no effect on the overall score. */
  optionalAgents?: Agent[];
  /** How much each area counts for this student (0 to 1). Business programmes weigh differently from IT ones. */
  weights?: Partial<Record<keyof Components, number>>;
  /** True once every required agent has been used at least once. Until then there is no overall score. */
  unlocked?: boolean;
  usedCount?: number;
  totalCount?: number;
  overall?: number | null;
};
export type Agent = { key: string; label: string; view: View; used: boolean; score: number; /** Percent of the overall score (0 for optional agents). Set per programme. */ weight?: number };

export type ToolCategory = "interviews" | "resume" | "aptitude" | "business" | "jobs";
export type Tool = {
  view: View; name: string; description: string; icon: LucideIcon; cta: string; metric: string; done: boolean; category: ToolCategory;
};
/** Filter chips on the Career Studio page, in display order. */
export const TOOL_CATEGORIES: Array<{ id: ToolCategory; label: string }> = [
  { id: "interviews", label: "Interviews" }, { id: "resume", label: "Resume & letters" }, { id: "aptitude", label: "Aptitude & coding" }, { id: "business", label: "Business skills" }, { id: "jobs", label: "Jobs" },
];
const CATEGORY_OF: Partial<Record<View, ToolCategory>> = {
  "Mock Interview": "interviews", "Group Discussion": "interviews", "Resume Maker": "resume", "Cover Letter": "resume",
  "Aptitude Test": "aptitude", "Coding Practice": "aptitude", "Case Study": "business", "HR Simulator": "business", "Job Matching": "jobs",
};

export type Guidance = { programCode: string | null; programName: string; interviewStyle: "technical" | "business" | "mixed"; roles: string[]; tools?: { coding: boolean; caseStudy?: boolean; hrSimulator?: boolean } } | null | undefined;

/** Which tools lead for each kind of programme. Business programmes lean on interviews and communication; technical ones on aptitude and coding-style practice. */
const ORDER: Record<string, View[]> = {
  technical: ["Aptitude Test", "Case Study", "HR Simulator", "Coding Practice", "Mock Interview", "Resume Maker", "Cover Letter", "Job Matching", "Group Discussion"],
  business: ["Mock Interview", "Case Study", "HR Simulator", "Resume Maker", "Group Discussion", "Cover Letter", "Aptitude Test", "Job Matching", "Coding Practice"],
  mixed: ["Resume Maker", "Aptitude Test", "Case Study", "HR Simulator", "Coding Practice", "Mock Interview", "Cover Letter", "Job Matching", "Group Discussion"],
};

export function buildTools(readiness: ReadinessPayload | null, guidance?: Guidance): Tool[] {
  const c = readiness?.current?.components;
  const tools: Array<Omit<Tool, "category">> = [
    { view: "Resume Maker", name: "Resume builder", description: "Shape a focused, ATS-ready resume from your profile.", icon: FileText, cta: c?.resume ? "Improve resume" : "Build resume", metric: c?.resume ? `ATS score ${c.resume}` : "Not started", done: Boolean(c?.resume) },
    { view: "Aptitude Test", name: "Aptitude practice", description: "Strengthen the topics that are holding your score back.", icon: BookOpenCheck, cta: c?.aptitude ? "Practice again" : "Start practice", metric: c?.aptitude ? `${c.aptitude}% latest` : "Not started", done: Boolean(c?.aptitude) },
    { view: "Mock Interview", name: "Interview Room", description: "Practise role-specific answers and get measured feedback.", icon: Mic2, cta: c?.interview ? "Interview again" : "Start interview", metric: c?.interview ? `${c.interview}% score` : "Not started", done: Boolean(c?.interview) },
    { view: "Coding Practice", name: "Coding practice", description: "Solve problems in a built-in editor and check them against real test cases.", icon: Code2, cta: "Start coding", metric: "Open tool", done: false },
    { view: "Case Study", name: "Business Case Solver", description: "Think like a management consultant: solve a fresh business case and get scored feedback.", icon: Briefcase, cta: c?.caseStudy ? "Solve another" : "Solve a case", metric: c?.caseStudy ? `${c.caseStudy}% score` : "Not started", done: Boolean(c?.caseStudy) },
    { view: "HR Simulator", name: "HR Manager Simulator", description: "Step into the HR Manager role: handle real workplace situations and get scored on your decisions.", icon: UsersRound, cta: c?.hrSimulation ? "Simulate again" : "Start simulation", metric: c?.hrSimulation ? `${c.hrSimulation}% score` : "Not started", done: Boolean(c?.hrSimulation) },
    { view: "Cover Letter", name: "Cover letter", description: "Turn a job description into a clear, personal letter.", icon: MessageSquareText, cta: "Write a letter", metric: "Open tool", done: false },
    { view: "Job Matching", name: "Job matching", description: "Find roles where your skills and intent line up.", icon: UserRoundSearch, cta: "See matches", metric: c?.careerActivity ? `${c.careerActivity}% activity` : "Explore roles", done: Boolean(c?.careerActivity) },
    { view: "Group Discussion", name: "Group discussion", description: "Build clarity, confidence and leadership in a live room.", icon: UsersRound, cta: "Start discussion", metric: c?.groupDiscussion ? `${c.groupDiscussion}% score` : "Not started", done: Boolean(c?.groupDiscussion) },
  ];
  const order = ORDER[guidance?.interviewStyle ?? "mixed"] ?? ORDER.mixed;
  return tools.filter(tool => (SHOW_JOB_MATCHING || tool.view !== "Job Matching") && (SHOW_GROUP_DISCUSSION || tool.view !== "Group Discussion") && (tool.view !== "Coding Practice" || guidance?.tools?.coding !== false) && (tool.view !== "Case Study" || guidance?.tools?.caseStudy === true) && (tool.view !== "HR Simulator" || guidance?.tools?.hrSimulator === true)).sort((a, b) => order.indexOf(a.view) - order.indexOf(b.view)).map(tool => ({ ...tool, category: CATEGORY_OF[tool.view] ?? "resume" }));
}

export function nextBestAction(readiness: ReadinessPayload | null, guidance?: Guidance): { title: string; text: string; view: View; cta: string } {
  const c = readiness?.current?.components;
  const role = guidance?.roles?.[0];
  const style = guidance?.interviewStyle ?? "mixed";
  const baseline = { title: "Take your aptitude baseline", text: "Find out where you stand in quantitative, logical and problem-solving questions.", view: "Aptitude Test" as View, cta: "Start assessment" };
  const resume = { title: "Get your resume ATS-ready", text: role ? `Tailor your projects and skills for ${role} roles so recruiter screening tools can read them.` : "Tailor your projects and skills so recruiter screening tools can read them.", view: "Resume Maker" as View, cta: "Improve resume" };
  const interview = { title: role ? `Practise a ${role} interview` : "Practise an interview", text: style === "business" ? "Rehearse clear, confident answers. Communication counts for a lot in business roles." : "Rehearse role-specific answers and see exactly where to sharpen them.", view: "Mock Interview" as View, cta: "Start interview" };
  // Business programmes lead with interviews; technical ones with the aptitude baseline.
  const sequence = style === "business" ? [[c?.interview, 60, interview], [c?.resume, 60, resume], [c?.aptitude, 1, baseline]] as const : [[c?.aptitude, 1, baseline], [c?.resume, 60, resume], [c?.interview, 60, interview]] as const;
  for (const [value, minimum, action] of sequence) if (!value || value < minimum) return action;
  return { title: "Keep your momentum going", text: "You’re in good shape. Another round of practice keeps your scores fresh for recruiters.", view: "Agents", cta: "Choose a tool" };
}

export const COMPONENT_META: Array<{ key: keyof Components; label: string; weight: number; view: View }> = [
  { key: "resume", label: "Resume", weight: 25, view: "Resume Maker" },
  { key: "aptitude", label: "Aptitude", weight: 25, view: "Aptitude Test" },
  { key: "interview", label: "Interview", weight: 25, view: "Mock Interview" },
  { key: "groupDiscussion", label: "Group discussion", weight: 15, view: "Group Discussion" },
  { key: "careerActivity", label: "Career activity", weight: 10, view: "Job Matching" },
  { key: "caseStudy", label: "Business case solver", weight: 20, view: "Case Study" },
  { key: "hrSimulation", label: "HR manager simulator", weight: 20, view: "HR Simulator" },
];

export const bandLabel = (score: number) => score >= 75 ? "Placement ready" : score >= 60 ? "On track" : score >= 45 ? "Building up" : score > 0 ? "Just getting started" : "Not started";

export function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** Progress towards unlocking the overall score: how many of the required agents have been used once. */
export function AgentRing({ used, total, size = 148 }: { used: number; total: number; size?: number }) {
  const stroke = Math.round(size * 0.08);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const drawn = useDrawIn(used);
  const counted = useCountUp(used, 600);
  const share = total ? Math.min(1, drawn / total) : 0;
  return (
    <div className="st-ring" style={{ width: size, height: size }} role="img" aria-label={`${used} of ${total} agents used`}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} className="track" />
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} className="bar" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - share)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div><strong style={{ fontSize: size * 0.26 }}>{counted}/{total}</strong><small>agents used</small></div>
    </div>
  );
}

export function ScoreRing({ score, size = 148, label = "Readiness" }: { score: number; size?: number; label?: string }) {
  const value = Math.max(0, Math.min(100, Math.round(score)));
  const drawn = useDrawIn(value);
  const counted = useCountUp(value);
  const stroke = Math.round(size * 0.08);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="st-ring" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${value} out of 100`}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} className="track" />
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} className="bar" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - drawn / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div><strong style={{ fontSize: size * 0.3 }}>{counted}</strong><small>{label}</small></div>
    </div>
  );
}
