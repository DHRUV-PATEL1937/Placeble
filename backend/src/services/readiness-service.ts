import { Types } from "mongoose";
import { Application } from "../models/Application";
import { AptitudeAttempt } from "../models/AptitudeAttempt";
import { GdSession } from "../models/GdSession";
import { Interview } from "../models/Interview";
import { ReadinessScore } from "../models/ReadinessScore";
import { Resume } from "../models/Resume";
import { User } from "../models/User";

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export async function recomputeReadiness(studentId: string, reason = "activity") {
  if (!Types.ObjectId.isValid(studentId)) return null;
  const [user, resume, aptitude, interviews, discussions, applications] = await Promise.all([
    User.findById(studentId).select("institutionId").lean(),
    Resume.findOne({ studentId, isCurrent: true }).sort({ updatedAt: -1 }).select("atsScore").lean(),
    AptitudeAttempt.findOne({ studentId, status: "completed" }).sort({ completedAt: -1 }).select("scoreTotal").lean(),
    Interview.find({ studentId, status: "completed" }).sort({ completedAt: -1 }).limit(3).select("overallScore").lean(),
    GdSession.find({ studentId, status: "completed" }).sort({ completedAt: -1 }).limit(3).select("observerMetrics").lean(),
    Application.find({ studentId }).select("status updatedAt").lean(),
  ]);
  if (!user) return null;
  const interviewScores = interviews.map(item => item.overallScore ?? 0).filter(value => value > 0);
  const gdScores = discussions.map(item => average(Object.values(item.observerMetrics ?? {}).map(Number)) * 10).filter(value => value > 0);
  const activeApplications = applications.filter(item => item.status !== "saved").length;
  const progressedApplications = applications.filter(item => ["interviewing", "offer"].includes(item.status)).length;
  const components = {
    resume: clamp(resume?.atsScore ?? 0),
    aptitude: clamp(aptitude?.scoreTotal ?? 0),
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
  const latest = await ReadinessScore.findOne({ studentId }).sort({ calculatedAt: -1 }).lean();
  if (latest && latest.score === score && JSON.stringify(latest.components) === JSON.stringify(components)) return latest;
  return ReadinessScore.create({ studentId, institutionId: user.institutionId, score, components, evidenceCount: available.length, reason, calculatedAt: new Date() });
}

export async function studentReadiness(studentId: string) {
  await recomputeReadiness(studentId, "dashboard_refresh");
  const history = await ReadinessScore.find({ studentId }).sort({ calculatedAt: -1 }).limit(12).lean();
  return { current: history[0] ?? null, history: history.reverse() };
}

export async function institutionReadiness(institutionId: string) {
  const students = await User.find({ institutionId, role: "student", status: "active" }).select("name email").lean();
  await Promise.all(students.map(student => recomputeReadiness(String(student._id), "cohort_refresh")));
  const rows = await Promise.all(students.map(async student => {
    const [profile, latest, previous] = await Promise.all([
      import("../models/StudentProfile").then(({ StudentProfile }) => StudentProfile.findOne({ userId: student._id }).lean()),
      ReadinessScore.findOne({ studentId: student._id }).sort({ calculatedAt: -1 }).lean(),
      ReadinessScore.findOne({ studentId: student._id }).sort({ calculatedAt: -1 }).skip(1).lean(),
    ]);
    const score = latest?.score ?? 0;
    return { id: String(student._id), name: student.name, email: student.email, branch: profile?.degree || "Programme not added", graduationYear: profile?.graduationYear, skills: profile?.skills ?? [], readiness: score, trend: score - (previous?.score ?? score), components: latest?.components ?? { resume: 0, aptitude: 0, interview: 0, groupDiscussion: 0, careerActivity: 0 }, status: score >= 75 ? "Ready" : score >= 60 ? "On track" : score >= 45 ? "Stalled" : "At risk" };
  }));
  const scores = rows.map(row => row.readiness);
  return { students: rows, summary: { studentCount: rows.length, average: clamp(average(scores)), placementReady: scores.filter(score => score >= 75).length, atRisk: scores.filter(score => score < 45).length, distribution: [scores.filter(s => s < 40).length, scores.filter(s => s >= 40 && s < 60).length, scores.filter(s => s >= 60 && s < 75).length, scores.filter(s => s >= 75 && s < 90).length, scores.filter(s => s >= 90).length] } };
}
