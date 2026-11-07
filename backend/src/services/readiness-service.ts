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
import { AgentResult } from "../models/AgentResult";
import { AGENT_INFO, programAgents, programByCode, type AgentKey } from "./program-service";

import { AptitudeQuestion } from "../models/AptitudeQuestion";
import { CAREER_ACTIVITY_WEIGHT, GROUP_DISCUSSION_WEIGHT, aptitudeComponent, aptitudeTestScore, careerActivityScore, codingScore, gdSessionScore, overallReadiness, recencyWeighted, score100, weightShares } from "./scoring";

const clamp = score100;
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

// The scoring rules live in ./scoring. Re-exported here for existing imports.
export { aptitudeComponent };

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
  const [user, resume, aptitudeAttempts, interviews, discussions, applications, solvedProblems, codingTried, profile, caseResults, hrResults] = await Promise.all([
    User.findById(studentId).select("institutionId").lean(),
    Resume.findOne({ studentId, isCurrent: true }).sort({ updatedAt: -1 }).select("atsScore").lean(),
    AptitudeAttempt.find({ studentId, status: "completed" }).sort({ completedAt: -1 }).limit(3).select("scoreTotal questionIds").lean(),
    Interview.find({ studentId, status: "completed" }).sort({ completedAt: -1 }).limit(3).select("overallScore").lean(),
    GdSession.find({ studentId, status: "completed" }).sort({ completedAt: -1 }).limit(3).select("overallScore observerMetrics heuristicFlags turns.speaker turns.text").lean(),
    Application.find({ studentId }).select("status updatedAt").lean(),
    CodingSubmission.distinct("questionId", { studentId, status: "accepted" }),
    CodingSubmission.exists({ studentId }),
    StudentProfile.findOne({ userId: studentId }).select("programCode").lean(),
    AgentResult.find({ studentId, agent: "case_study" }).sort({ createdAt: -1 }).limit(3).select("score").lean(),
    AgentResult.find({ studentId, agent: "hr_simulation" }).sort({ createdAt: -1 }).limit(3).select("score").lean(),
  ]);
  if (!user) return null;
  const program = await programByCode(profile?.programCode ?? null);
  // Which agents this student's programme has, and how each counts. Set per programme by the superadmin.
  const config = programAgents(program);
  const modeOf = (key: AgentKey) => config.find(agent => agent.key === key)!.mode;
  const codingScored = modeOf("coding") === "scored";
  const solvedDifficulties = solvedProblems.length ? (await AptitudeQuestion.find({ _id: { $in: solvedProblems } }).select("difficulty").lean()).map(question => question.difficulty) : [];
  // Problems whose question was since removed still count, at medium difficulty.
  const coding = codingScore([...solvedDifficulties, ...Array(Math.max(0, solvedProblems.length - solvedDifficulties.length)).fill("medium")]);
  const aptitudeTest = aptitudeTestScore(aptitudeAttempts.map(attempt => ({ scoreTotal: attempt.scoreTotal, questionCount: attempt.questionIds?.length })));
  // Newest first everywhere below: recent sessions count more, so improvement shows up quickly.
  const interviewScores = interviews.map(item => item.overallScore ?? 0);
  const gdScores = discussions.map(item => item.overallScore ?? gdSessionScore(item.observerMetrics, item.heuristicFlags, (item.turns ?? []).filter(turn => turn.speaker === "student").map(turn => turn.text)));
  const activeApplications = applications.filter(item => item.status !== "saved").length;
  const progressedApplications = applications.filter(item => ["interviewing", "offer"].includes(item.status)).length;
  const components = {
    resume: clamp(resume?.atsScore ?? 0),
    // When coding counts on its own, aptitude is the test alone. Otherwise coding practice can only lift the aptitude score.
    aptitude: codingScored ? aptitudeTest : aptitudeComponent(aptitudeTest, modeOf("coding") === "off" ? 0 : coding),
    interview: clamp(recencyWeighted(interviewScores)),
    groupDiscussion: clamp(recencyWeighted(gdScores)),
    careerActivity: careerActivityScore(activeApplications, progressedApplications),
    caseStudy: clamp(recencyWeighted(caseResults.map(item => item.score))),
    hrSimulation: clamp(recencyWeighted(hrResults.map(item => item.score))),
  };
  const agentState: Record<AgentKey, { used: boolean; score: number }> = {
    resume: { used: components.resume > 0, score: components.resume },
    aptitude: { used: aptitudeAttempts.length > 0, score: components.aptitude },
    interview: { used: interviews.length > 0, score: components.interview },
    coding: { used: Boolean(codingTried), score: coding },
    case_study: { used: caseResults.length > 0, score: components.caseStudy },
    hr_simulation: { used: hrResults.length > 0, score: components.hrSimulation },
  };
  // Scored agents count towards the overall score and must all be used before it unlocks. Weights are scaled to add up to 100.
  const scored = config.filter(agent => agent.mode === "scored" && agent.weight > 0);
  const shares = weightShares(scored);
  const agents = scored.map(agent => ({ key: agent.key, ...AGENT_INFO[agent.key], ...agentState[agent.key], weight: shares[agent.key] ?? 0 }));
  // Optional agents: the student can use them and sees their own score, but they don't change the overall score or hold back the unlock.
  const optionalAgents = config.filter(agent => agent.mode === "optional" || (agent.mode === "scored" && agent.weight <= 0)).map(agent => ({ key: agent.key, ...AGENT_INFO[agent.key], ...agentState[agent.key], weight: 0 }));
  const score = overallReadiness([
    ...agents.map(agent => ({ value: agent.score, weight: agent.weight, required: true })),
    ...(activeApplications > 0 ? [{ value: components.careerActivity, weight: CAREER_ACTIVITY_WEIGHT, required: false }] : []),
    ...(discussions.length > 0 ? [{ value: components.groupDiscussion, weight: GROUP_DISCUSSION_WEIGHT, required: false }] : []),
  ]);
  const evidenceCount = [components.resume > 0, aptitudeAttempts.length > 0, interviews.length > 0, Boolean(codingTried), discussions.length > 0, activeApplications > 0, caseResults.length > 0, hrResults.length > 0].filter(Boolean).length;
  const complete = agents.length > 0 && agents.every(agent => agent.used);
  const latest = await ReadinessScore.findOne({ studentId }).sort({ calculatedAt: -1 }).lean();
  if (latest && latest.score === score && latest.complete === complete && JSON.stringify(latest.components) === JSON.stringify(components) && JSON.stringify((latest.agents ?? []).map(a => [a.key, a.used, a.score, a.weight])) === JSON.stringify(agents.map(a => [a.key, a.used, a.score, a.weight])) && JSON.stringify((latest.optionalAgents ?? []).map(a => [a.key, a.used, a.score])) === JSON.stringify(optionalAgents.map(a => [a.key, a.used, a.score]))) return latest;
  return ReadinessScore.create({ studentId, institutionId: user.institutionId, score, components, agents, optionalAgents, complete, evidenceCount, reason, calculatedAt: new Date() });
}

/**
 * What the student sees. The overall score is only handed out once every required agent has been used at least once;
 * until then they get the per-agent scores and how many agents are left.
 */
export async function studentReadiness(studentId: string) {
  await recomputeReadiness(studentId, "dashboard_refresh");
  const history = await ReadinessScore.find({ studentId }).sort({ calculatedAt: -1 }).limit(12).lean();
  const current = history[0] ?? null;
  const agents = (current?.agents ?? []).map(agent => ({ key: agent.key, label: agent.label, view: agent.view, used: agent.used, score: agent.score, weight: agent.weight ?? 0 }));
  const optionalAgents = (current?.optionalAgents ?? []).map(agent => ({ key: agent.key, label: agent.label, view: agent.view, used: agent.used, score: agent.score }));
  const unlocked = Boolean(current?.complete);
  const usedCount = agents.filter(agent => agent.used).length;
  // Before the unlock, earlier overall scores are hidden too, so the trend line can't reveal a number they haven't earned yet.
  const visibleHistory = unlocked ? history.filter(item => item.complete).reverse() : [];
  // How much each scored agent counts (percent), keyed like the readiness components the client already knows.
  const componentKey: Record<string, string> = { resume: "resume", aptitude: "aptitude", interview: "interview", coding: "coding", case_study: "caseStudy", hr_simulation: "hrSimulation" };
  const weights = Object.fromEntries(agents.map(agent => [componentKey[agent.key] ?? agent.key, agent.weight / 100]));
  return { current, history: visibleHistory, agents, optionalAgents, weights, unlocked, usedCount, totalCount: agents.length, overall: unlocked && current ? current.score : null };
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
