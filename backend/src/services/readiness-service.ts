import { Batch, batchLabel } from "../models/Batch";
import { StudentRosterEntry } from "../models/StudentRosterEntry";
import { Types } from "mongoose";
import { Application } from "../models/Application";
import { CodingSubmission } from "../models/CodingSubmission";
import { AptitudeAttempt } from "../models/AptitudeAttempt";
import { GdSession } from "../models/GdSession";
import { Interview } from "../models/Interview";
import { ReadinessScore } from "../models/ReadinessScore";
import { Resume } from "../models/Resume";
import { StudentProfile } from "../models/StudentProfile";
import { User } from "../models/User";
import { programByCode, programHasCoding } from "./program-service";

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

/**
 * Aptitude covers the latest test plus coding practice. Each distinct coding problem solved is worth 10 points (10 solved is full marks).
 * Coding can only lift the component above the test score, never pull it down, so practising code never hurts an aptitude result.
 */
export function aptitudeComponent(testScore: number, solvedProblems: number) {
  const test = clamp(testScore);
  const coding = clamp(solvedProblems * 10);
  if (!coding) return test;
  if (!test) return coding;
  return clamp(test * 0.7 + Math.max(test, coding) * 0.3);
}

const pending = new Map<string, { timer: NodeJS.Timeout; reason: string }>();
/** Recompute shortly after the last activity, so a burst of saves (editing a resume, several submissions) writes one score, not one per event. */
export function scheduleReadiness(studentId: string, reason: string, delayMs = 1500) {
  const key = String(studentId);
  const existing = pending.get(key);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => { pending.delete(key); void recomputeReadiness(key, reason).catch(console.error); }, delayMs);
  timer.unref?.();
  pending.set(key, { timer, reason });
}

export async function recomputeReadiness(studentId: string, reason = "activity") {
  if (!Types.ObjectId.isValid(studentId)) return null;
  const [user, resume, aptitude, interviews, discussions, applications, solvedProblems, codingTried, profile] = await Promise.all([
    User.findById(studentId).select("institutionId").lean(),
    Resume.findOne({ studentId, isCurrent: true }).sort({ updatedAt: -1 }).select("atsScore").lean(),
    AptitudeAttempt.findOne({ studentId, status: "completed" }).sort({ completedAt: -1 }).select("scoreTotal").lean(),
    Interview.find({ studentId, status: "completed" }).sort({ completedAt: -1 }).limit(3).select("overallScore").lean(),
    GdSession.find({ studentId, status: "completed" }).sort({ completedAt: -1 }).limit(3).select("observerMetrics").lean(),
    Application.find({ studentId }).select("status updatedAt").lean(),
    CodingSubmission.distinct("questionId", { studentId, status: "accepted" }),
    CodingSubmission.exists({ studentId }),
    StudentProfile.findOne({ userId: studentId }).select("programCode").lean(),
  ]);
  if (!user) return null;
  const codingRequired = programHasCoding(await programByCode(profile?.programCode ?? null));
  const interviewScores = interviews.map(item => item.overallScore ?? 0).filter(value => value > 0);
  const gdScores = discussions.map(item => average(Object.values(item.observerMetrics ?? {}).map(Number)) * 10).filter(value => value > 0);
  const activeApplications = applications.filter(item => item.status !== "saved").length;
  const progressedApplications = applications.filter(item => ["interviewing", "offer"].includes(item.status)).length;
  const components = {
    resume: clamp(resume?.atsScore ?? 0),
    aptitude: aptitudeComponent(aptitude?.scoreTotal ?? 0, solvedProblems.length),
    interview: clamp(average(interviewScores)),
    groupDiscussion: clamp(average(gdScores)),
    careerActivity: clamp(activeApplications * 12 + progressedApplications * 16),
  };
  const weighted: Array<[number, number]> = [
    [components.resume, 0.25], [components.aptitude, 0.25], [components.interview, 0.25],
    [components.groupDiscussion, 0.15], [components.careerActivity, 0.10],
  ];
  const available = weighted.filter(([value]) => value > 0);
  const weightTotal = available.reduce((sum, [, weight]) => sum + weight, 0);
  const score = clamp(weightTotal ? available.reduce((sum, [value, weight]) => sum + value * weight, 0) / weightTotal : 0);
  // The scored agents a student can see. Group discussion and job matching are hidden for now, so they don't count here.
  const agents = [
    { key: "resume", label: "Resume builder", view: "Resume Maker", used: components.resume > 0, score: components.resume },
    { key: "aptitude", label: "Aptitude practice", view: "Aptitude Test", used: Boolean(aptitude), score: clamp(aptitude?.scoreTotal ?? 0) },
    { key: "interview", label: "Interview Room", view: "Mock Interview", used: interviews.length > 0, score: components.interview },
    ...(codingRequired ? [{ key: "coding", label: "Coding practice", view: "Coding Practice", used: Boolean(codingTried), score: clamp(solvedProblems.length * 10) }] : []),
  ];
  const complete = agents.every(agent => agent.used);
  const latest = await ReadinessScore.findOne({ studentId }).sort({ calculatedAt: -1 }).lean();
  if (latest && latest.score === score && latest.complete === complete && JSON.stringify(latest.components) === JSON.stringify(components) && JSON.stringify((latest.agents ?? []).map(a => [a.key, a.used, a.score])) === JSON.stringify(agents.map(a => [a.key, a.used, a.score]))) return latest;
  return ReadinessScore.create({ studentId, institutionId: user.institutionId, score, components, agents, complete, evidenceCount: available.length, reason, calculatedAt: new Date() });
}

/**
 * What the student sees. The overall score is only handed out once every required agent has been used at least once;
 * until then they get the per-agent scores and how many agents are left.
 */
export async function studentReadiness(studentId: string) {
  await recomputeReadiness(studentId, "dashboard_refresh");
  const history = await ReadinessScore.find({ studentId }).sort({ calculatedAt: -1 }).limit(12).lean();
  const current = history[0] ?? null;
  const agents = (current?.agents ?? []).map(agent => ({ key: agent.key, label: agent.label, view: agent.view, used: agent.used, score: agent.score }));
  const unlocked = Boolean(current?.complete);
  const usedCount = agents.filter(agent => agent.used).length;
  // Before the unlock, earlier overall scores are hidden too, so the trend line can't reveal a number they haven't earned yet.
  const visibleHistory = unlocked ? history.filter(item => item.complete).reverse() : [];
  return { current, history: visibleHistory, agents, unlocked, usedCount, totalCount: agents.length, overall: unlocked && current ? current.score : null };
}

/** Mongo filter for students who have signed in at least once. Invited-but-never-signed-in students have no activity to score. */
export const hasLoggedIn = { $or: [{ firstLoginAt: { $ne: null } }, { lastLoginAt: { $ne: null } }] };

export async function institutionReadiness(institutionId: string) {
  const students = await User.find({ institutionId, role: "student", status: "active" }).select("name email firstLoginAt lastLoginAt credentialsSentAt").lean();
  const signedIn = (student: (typeof students)[number]) => Boolean(student.firstLoginAt ?? student.lastLoginAt);
  await Promise.all(students.filter(signedIn).map(student => recomputeReadiness(String(student._id), "cohort_refresh")));
  // Which batch each student is in, so reports can show and filter by it.
  const [entries, batches] = await Promise.all([
    StudentRosterEntry.find({ institutionId, matchedUserId: { $in: students.map(student => student._id) } }).select("matchedUserId batchId").lean(),
    Batch.find({ institutionId }).lean(),
  ]);
  const batchOf = new Map(entries.map(entry => [String(entry.matchedUserId), entry.batchId ? String(entry.batchId) : null]));
  const batchById = new Map(batches.map(batch => [String(batch._id), batch]));
  const rows = await Promise.all(students.map(async student => {
    const [profile, latest, previous] = await Promise.all([
      import("../models/StudentProfile").then(({ StudentProfile }) => StudentProfile.findOne({ userId: student._id }).lean()),
      ReadinessScore.findOne({ studentId: student._id }).sort({ calculatedAt: -1 }).lean(),
      ReadinessScore.findOne({ studentId: student._id }).sort({ calculatedAt: -1 }).skip(1).lean(),
    ]);
    const score = latest?.score ?? 0;
    const complete = Boolean(latest?.complete);
    const agents = latest?.agents ?? [];
    const batchId = batchOf.get(String(student._id)) ?? null;
    const batch = batchId ? batchById.get(batchId) : undefined;
    return { id: String(student._id), name: student.name, email: student.email, batchId, batchLabel: batch ? batchLabel(batch) : "", loginStatus: (signedIn(student) ? "active" : "invited") as "active" | "invited", firstLoginAt: student.firstLoginAt ?? student.lastLoginAt ?? null, lastLoginAt: student.lastLoginAt ?? null, invitedAt: student.credentialsSentAt ?? null, branch: profile?.degree || "Programme not added", graduationYear: profile?.graduationYear, skills: profile?.skills ?? [], readiness: score, trend: score - (previous?.score ?? score), components: latest?.components ?? { resume: 0, aptitude: 0, interview: 0, groupDiscussion: 0, careerActivity: 0 }, complete, agentsUsed: agents.filter(agent => agent.used).length, agentsTotal: agents.length, status: !complete ? "In progress" : score >= 75 ? "Ready" : score >= 60 ? "On track" : score >= 45 ? "Stalled" : "At risk" };
  }));
  // Averages and risk counts cover only students who have used every required agent. Students still working through them are "in progress", and invited ones haven't started.
  const started = rows.filter(row => row.loginStatus === "active");
  const scores = started.filter(row => row.complete).map(row => row.readiness);
  return { students: rows, summary: { studentCount: rows.length, loggedIn: started.length, inProgress: started.length - scores.length, invited: rows.length - started.length, average: clamp(average(scores)), placementReady: scores.filter(score => score >= 75).length, atRisk: scores.filter(score => score < 45).length, distribution: [scores.filter(s => s < 40).length, scores.filter(s => s >= 40 && s < 60).length, scores.filter(s => s >= 60 && s < 75).length, scores.filter(s => s >= 75 && s < 90).length, scores.filter(s => s >= 90).length] } };
}
