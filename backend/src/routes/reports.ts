import { AgentResult } from "../models/AgentResult";
import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth, requireInstitutionScope, requireRole } from "../middleware/auth";
import { Application } from "../models/Application";
import { AptitudeAttempt } from "../models/AptitudeAttempt";
import { Batch, batchLabel, batchPeriod, batchState } from "../models/Batch";
import { Branch } from "../models/Branch";
import { GdSession } from "../models/GdSession";
import { Interview } from "../models/Interview";
import { ReadinessScore } from "../models/ReadinessScore";
import { Resume } from "../models/Resume";
import { StudentProfile } from "../models/StudentProfile";
import { StudentRosterEntry } from "../models/StudentRosterEntry";
import { User } from "../models/User";
import { institutionReadiness } from "../services/readiness-service";

const router = Router();
// Read-only reports: institute TPOs, university TPOs inside an institute, and principals.
router.use(requireAuth, requireRole("tpo", "faculty"), requireInstitutionScope);

const round = (value: number) => Math.round(value);
const average = (values: number[]) => values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;

export async function studentRows(institutionId: string) {
  const [cohort, roster, branches] = await Promise.all([
    institutionReadiness(institutionId),
    StudentRosterEntry.find({ institutionId, matchedUserId: { $ne: null } }).select("matchedUserId branchId branch rollNumber batchYear").lean(),
    Branch.find({ institutionId }).select("name").lean(),
  ]);
  const branchName = new Map(branches.map(branch => [String(branch._id), branch.name]));
  const byUser = new Map(roster.map(entry => [String(entry.matchedUserId), entry]));
  const rows = cohort.students.map(student => {
    const entry = byUser.get(student.id);
    return { ...student, branchId: entry?.branchId ? String(entry.branchId) : null, branchName: entry?.branchId ? branchName.get(String(entry.branchId)) ?? entry.branch : entry?.branch || "", rollNumber: entry?.rollNumber ?? "", batchYear: entry?.batchYear ?? null };
  });
  return { rows, summary: cohort.summary };
}

router.get("/overview", async (request, response) => {
  const all = await studentRows(request.institutionScope!);
  const batchFilter = typeof request.query.batchId === "string" && mongoose.isValidObjectId(request.query.batchId) ? request.query.batchId : "";
  const rows = batchFilter ? all.rows.filter(row => row.batchId === batchFilter) : all.rows;
  const summary = batchFilter ? { ...all.summary, studentCount: rows.length } : all.summary;
  const started = rows.filter(row => row.loginStatus === "active");
  const groups = new Map<string, { branchId: string | null; name: string; invited: number; inProgress: number; scores: number[]; resume: number[]; aptitude: number[]; interview: number[]; ready: number; atRisk: number }>();
  for (const row of rows) {
    const key = row.branchId ?? "none";
    const group = groups.get(key) ?? { branchId: row.branchId, name: row.branchName || "No branch", invited: 0, inProgress: 0, scores: [], resume: [], aptitude: [], interview: [], ready: 0, atRisk: 0 };
    groups.set(key, group);
    if (row.loginStatus !== "active") { group.invited += 1; continue; }
    // Per-agent averages use everyone's real scores. The overall average, ready and at-risk counts use only students who have used every required agent.
    if (row.components.resume) group.resume.push(row.components.resume);
    if (row.components.aptitude) group.aptitude.push(row.components.aptitude);
    if (row.components.interview) group.interview.push(row.components.interview);
    if (!row.complete) { group.inProgress += 1; continue; }
    group.scores.push(row.readiness);
    if (row.readiness >= 75) group.ready += 1;
    if (row.readiness < 45) group.atRisk += 1;
    groups.set(key, group);
  }
  const roster = await StudentRosterEntry.countDocuments({ institutionId: request.institutionScope, ...(batchFilter ? { batchId: batchFilter } : {}) });
  const batchRows = await Batch.find({ institutionId: request.institutionScope }).sort({ endYear: -1, endMonth: -1 }).lean();
  const branchNames = new Map((await Branch.find({ institutionId: request.institutionScope }).select("name").lean()).map(branch => [String(branch._id), branch.name]));
  return response.json({
    batches: batchRows.map(batch => ({ id: String(batch._id), label: `${branchNames.get(String(batch.branchId)) ?? ""} ${batchLabel(batch)}`.trim(), period: batchPeriod(batch), state: batchState(batch) })),
    summary: { ...summary, rosterTotal: roster, registered: rows.length, signedIn: started.length },
    branches: [...groups.values()].map(group => ({ branchId: group.branchId, name: group.name, students: group.scores.length + group.inProgress + group.invited, signedIn: group.scores.length + group.inProgress, inProgress: group.inProgress, invited: group.invited, average: round(average(group.scores)), ready: group.ready, atRisk: group.atRisk, resume: round(average(group.resume)), aptitude: round(average(group.aptitude)), interview: round(average(group.interview)) })).sort((a, b) => b.students - a.students),
  });
});

router.get("/students", async (request, response) => {
  const { rows } = await studentRows(request.institutionScope!);
  const branchId = typeof request.query.branchId === "string" ? request.query.branchId : "";
  const login = typeof request.query.login === "string" ? request.query.login : "";
  const byBranch = branchId ? rows.filter(row => (branchId === "none" ? !row.branchId : row.branchId === branchId)) : rows;
  const byLogin = login === "invited" || login === "active" ? byBranch.filter(row => row.loginStatus === login) : byBranch;
  const batchParam = typeof request.query.batchId === "string" ? request.query.batchId : "";
  const filtered = batchParam ? byLogin.filter(row => row.batchId === batchParam) : byLogin;
  return response.json({ students: filtered });
});

/** One student's full read-only report, or null if they aren't in this institute. Shared by TPO, principal and superadmin views. */
export async function buildStudentReport(institutionId: string, studentId: string) {
  if (!mongoose.isValidObjectId(studentId)) return null;
  const user = await User.findOne({ _id: studentId, role: "student", institutionId: institutionId }).select("name email emailVerified status createdAt lastLoginAt").lean();
  if (!user) return null;
  const rosterBatch = await StudentRosterEntry.findOne({ institutionId: institutionId, matchedUserId: studentId }).select("batchId").lean();
  const batchDoc = rosterBatch?.batchId ? await Batch.findById(rosterBatch.batchId).lean() : null;
  const [profile, roster, history, aptitude, interviews, resumes, discussions, applications, agentResults] = await Promise.all([
    StudentProfile.findOne({ userId: studentId }).select("degree graduationYear skills preferredRoles").lean(),
    StudentRosterEntry.findOne({ institutionId: institutionId, matchedUserId: studentId }).select("rollNumber branch batchYear").lean(),
    ReadinessScore.find({ studentId }).sort({ calculatedAt: -1 }).limit(12).lean(),
    AptitudeAttempt.find({ studentId, status: "completed" }).sort({ completedAt: -1 }).limit(5).select("scoreTotal completedAt mode").lean(),
    Interview.find({ studentId, status: "completed" }).sort({ completedAt: -1 }).limit(5).select("overallScore completedAt targetRole type").lean(),
    Resume.find({ studentId }).sort({ updatedAt: -1 }).limit(3).select("title atsScore isCurrent updatedAt").lean(),
    GdSession.find({ studentId, status: "completed" }).sort({ completedAt: -1 }).limit(3).select("topic completedAt").lean(),
    Application.find({ studentId }).select("status").lean(),
    AgentResult.find({ studentId }).sort({ createdAt: -1 }).limit(20).select("agent score title detail createdAt").lean(),
  ]);
  const latest = history[0];
  const recentResults = (agent: string) => agentResults.filter(item => item.agent === agent).slice(0, 5).map(item => ({ score: item.score, title: item.title ?? "", detail: item.detail ?? "", completedAt: item.createdAt }));
  const score = latest?.score ?? 0;
  const byStatus = applications.reduce<Record<string, number>>((acc, item) => { acc[item.status] = (acc[item.status] ?? 0) + 1; return acc; }, {});
  return ({
    student: {
      id: String(user._id), name: user.name, email: user.email, emailVerified: Boolean(user.emailVerified), status: user.status, joinedAt: user.createdAt, lastLoginAt: user.lastLoginAt ?? null,
      batchLabel: batchDoc ? batchLabel(batchDoc) : "", batchPeriod: batchDoc ? batchPeriod(batchDoc) : "",
      branch: roster?.branch || profile?.degree || "", batchYear: roster?.batchYear ?? profile?.graduationYear ?? null, rollNumber: roster?.rollNumber ?? "",
      skills: profile?.skills ?? [], preferredRoles: profile?.preferredRoles ?? [],
    },
    // The overall score and its trend exist only once the student has used every required agent. Before that, the per-agent components are the real numbers.
    readiness: { score, agents: (latest?.agents ?? []).map(agent => ({ key: agent.key, label: agent.label, used: agent.used, score: agent.score })), optionalAgents: (latest?.optionalAgents ?? []).map(agent => ({ key: agent.key, label: agent.label, used: agent.used, score: agent.score })), complete: Boolean(latest?.complete), agentsUsed: (latest?.agents ?? []).filter(agent => agent.used).length, agentsTotal: (latest?.agents ?? []).length, status: !latest?.complete ? "In progress" : score >= 75 ? "Ready" : score >= 60 ? "On track" : score >= 45 ? "Stalled" : "At risk", components: latest?.components ?? null, history: latest?.complete ? [...history].reverse().filter(item => item.complete).map(item => ({ score: item.score, calculatedAt: item.calculatedAt })) : [] },
    activity: {
      aptitude: aptitude.map(item => ({ score: item.scoreTotal ?? 0, completedAt: item.completedAt, mode: item.mode })),
      interviews: interviews.map(item => ({ score: item.overallScore ?? 0, completedAt: item.completedAt, role: item.targetRole, type: item.type })),
      resumes: resumes.map(item => ({ title: item.title, atsScore: item.atsScore ?? 0, current: Boolean(item.isCurrent), updatedAt: item.updatedAt })),
      groupDiscussions: discussions.map(item => ({ topic: item.topic, completedAt: item.completedAt })),
      caseStudies: recentResults("case_study"),
      hrSimulations: recentResults("hr_simulation"),
      applications: { total: applications.length, byStatus },
    },
  });
}

router.get("/students/:studentId", async (request, response) => {
  const report = await buildStudentReport(request.institutionScope!, request.params.studentId as string);
  if (!report) return response.status(404).json({ message: "Student not found." });
  return response.json(report);
});

export { router as reportsRouter };
