import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { Application, applicationStatuses } from "../models/Application";
import { Job } from "../models/Job";
import { MatchScore } from "../models/MatchScore";
import { Resume } from "../models/Resume";
import { StudentProfile } from "../models/StudentProfile";
import { User } from "../models/User";
import { cosineSimilarity, embedText, embeddingModelName, EMBEDDING_PIPELINE_VERSION } from "./embedding-service";
import { resumeText, type ResumeSection } from "./resume-service";

export const JOB_EMBEDDING_TEMPLATE_VERSION = "job-match-v1";
type ApplicationStatus = typeof applicationStatuses[number];
type MatchingJob = { id: string; userId: string; kind: "matching:recompute"; status: "queued" | "processing" | "complete" | "failed"; progress: number; message: string; result?: unknown; error?: string };
const matchingJobs = new Map<string, MatchingJob>();

export function queueMatchingRecompute(userId: string, input: { studentId?: string; jobId?: string }) {
  const job: MatchingJob = { id: randomUUID(), userId, kind: "matching:recompute", status: "queued", progress: 8, message: "Preparing match updates" };
  matchingJobs.set(job.id, job);
  setTimeout(() => {
    Object.assign(job, { status: "processing", progress: 35, message: "Comparing profile and role signals" });
    void recomputeMatches(input).then(result => Object.assign(job, { status: "complete", progress: 100, message: "Matches updated", result }))
      .catch(error => Object.assign(job, { status: "failed", progress: 100, message: "Update needs attention", error: error instanceof Error ? error.message : "Matches could not be updated." }));
  }, 140);
  return job;
}

export function getMatchingJob(id: string, userId: string) { const job = matchingJobs.get(id); return job?.userId === userId ? job : null; }

export async function markStudentMatchingProfileChanged(studentId: string) {
  const profile = await StudentProfile.findOneAndUpdate(
    { userId: studentId },
    { $inc: { profileVersion: 1 }, $set: { embedding: [], embeddingProfileVersion: 0 }, $unset: { embeddingUpdatedAt: 1 } },
    { new: true },
  ).lean();
  if (!profile) return null;
  return queueMatchingRecompute(studentId, { studentId });
}

function jobEmbeddingInput(job: { title: string; companyName: string; description: string; requiredSkills: string[]; employmentType: string; workMode: string }) {
  return `[${EMBEDDING_PIPELINE_VERSION}|${JOB_EMBEDDING_TEMPLATE_VERSION}] JOB TITLE: ${job.title}\nCOMPANY: ${job.companyName}\nEMPLOYMENT: ${job.employmentType}\nWORK MODE: ${job.workMode}\nREQUIRED SKILLS: ${job.requiredSkills.join(", ")}\nDESCRIPTION: ${job.description}`;
}

function studentEmbeddingInput(profile: { degree?: string | null; graduationYear?: number | null; skills?: string[] | null; preferredRoles?: string[] | null }, sections: ResumeSection[]) {
  return `[${EMBEDDING_PIPELINE_VERSION}|student-profile-v1] DEGREE: ${profile.degree ?? ""}\nGRADUATION: ${profile.graduationYear ?? ""}\nPREFERRED ROLES: ${(profile.preferredRoles ?? []).join(", ")}\nSKILLS: ${(profile.skills ?? []).join(", ")}\nRESUME EVIDENCE: ${resumeText(sections)}`;
}

const skillAliases: Record<string, string> = { reactjs: "react", reactnative: "react native", nodejs: "node", node: "node", postgres: "sql", postgresql: "sql", mysql: "sql", mongodb: "mongodb", javascript: "javascript", typescript: "typescript", powerbi: "power bi", restapi: "rest api", restfulapi: "rest api", githubactions: "ci cd", cicd: "ci cd" };
function normalizeSkill(value: string) { const compact = value.toLowerCase().replace(/[^a-z0-9+#]/g, ""); return skillAliases[compact] ?? value.toLowerCase().replace(/\.js\b/g, "").replace(/[^a-z0-9+#]+/g, " ").trim(); }
function hasSkill(studentSkills: string[], required: string) { const target = normalizeSkill(required); return studentSkills.some(skill => { const current = normalizeSkill(skill); return current === target || current.includes(target) || target.includes(current); }); }
function skillBreakdown(studentSkills: string[], requiredSkills: string[]) { return { matchedSkills: requiredSkills.filter(skill => hasSkill(studentSkills, skill)), missingSkills: requiredSkills.filter(skill => !hasSkill(studentSkills, skill)) }; }

async function ensureJobEmbedding(job: { _id: unknown; title: string; companyName: string; description: string; requiredSkills: string[]; employmentType: string; workMode: string; embedding: number[]; embeddingTemplateVersion: string }) {
  if (job.embedding?.length && job.embeddingTemplateVersion === JOB_EMBEDDING_TEMPLATE_VERSION) return job.embedding;
  const embedding = await embedText(jobEmbeddingInput(job));
  await Job.updateOne({ _id: job._id }, { embedding, embeddingUpdatedAt: new Date(), embeddingTemplateVersion: JOB_EMBEDDING_TEMPLATE_VERSION });
  return embedding;
}

async function studentContext(studentId: string) {
  const [profile, resume] = await Promise.all([StudentProfile.findOne({ userId: studentId }), Resume.findOne({ studentId, isCurrent: true }).lean()]);
  if (!profile) throw new Error("Complete your student profile before calculating job matches.");
  const sections = (resume?.sections ?? []).map(section => ({ type: section.type, order: section.order, content: section.content })) as unknown as ResumeSection[];
  if (!profile.embedding?.length || profile.embeddingProfileVersion !== profile.profileVersion) {
    profile.embedding = await embedText(studentEmbeddingInput(profile, sections)); profile.embeddingUpdatedAt = new Date(); profile.embeddingProfileVersion = profile.profileVersion; await profile.save();
  }
  return { profile, embedding: profile.embedding, skills: profile.skills ?? [] };
}

async function computeOne(studentId: string, job: { _id: unknown; title: string; companyName: string; description: string; requiredSkills: string[]; employmentType: string; workMode: string; embedding: number[]; embeddingTemplateVersion: string }, context?: Awaited<ReturnType<typeof studentContext>>) {
  const student = context ?? await studentContext(studentId);
  const jobEmbedding = await ensureJobEmbedding(job);
  const breakdown = skillBreakdown(student.skills, job.requiredSkills);
  const semantic = Math.max(0, Math.min(1, cosineSimilarity(student.embedding, jobEmbedding)));
  const skillCoverage = job.requiredSkills.length ? breakdown.matchedSkills.length / job.requiredSkills.length : 1;
  const matchPercent = Math.round(Math.min(98, Math.max(18, semantic * 78 + skillCoverage * 22)));
  await MatchScore.findOneAndUpdate({ studentId: new mongoose.Types.ObjectId(studentId), jobId: job._id as mongoose.Types.ObjectId }, { matchPercent, ...breakdown, computedAt: new Date(), studentProfileVersion: student.profile.profileVersion, embeddingModel: embeddingModelName() }, { upsert: true, new: true });
  return matchPercent;
}

export async function recomputeMatches(input: { studentId?: string; jobId?: string }) {
  if (input.studentId) {
    const context = await studentContext(input.studentId);
    const query: Record<string, unknown> = { isActive: true };
    if (context.profile.institutionId) query.$or = [{ institutionScope: { $size: 0 } }, { institutionScope: context.profile.institutionId }];
    const jobs = await Job.find(query).lean();
    for (const job of jobs) await computeOne(input.studentId, job as never, context);
    return { side: "student", computed: jobs.length, profileVersion: context.profile.profileVersion };
  }
  if (input.jobId) {
    const job = await Job.findOne({ _id: input.jobId, isActive: true }).lean();
    if (!job) return { side: "job", computed: 0 };
    const profileQuery: Record<string, unknown> = { onboardingCompleted: true };
    if (job.institutionScope?.length) profileQuery.institutionId = { $in: job.institutionScope };
    const profiles = await StudentProfile.find(profileQuery).select("userId").lean();
    for (const profile of profiles) await computeOne(String(profile.userId), job as never);
    return { side: "job", computed: profiles.length };
  }
  throw new Error("A studentId or jobId is required for match recomputation.");
}

const demoJobs = [
  { companyName: "Razorpay", title: "Product Analyst", description: "Translate product and payment data into clear insights, define metrics, build SQL analyses, and work with product teams on experiments and customer journeys.", requiredSkills: ["SQL", "Data Analysis", "Excel", "Communication"], location: "Bengaluru", workMode: "hybrid", employmentType: "full_time", salaryLabel: "₹9–12 LPA" },
  { companyName: "Freshworks", title: "Graduate Software Engineer", description: "Build dependable web product features, contribute to API design, review code, write automated tests, and collaborate with engineering and product peers.", requiredSkills: ["JavaScript", "React", "Node.js", "REST APIs", "Git"], location: "Chennai", workMode: "hybrid", employmentType: "full_time", salaryLabel: "₹8–11 LPA" },
  { companyName: "Atlassian", title: "Associate Backend Engineer", description: "Develop backend services for collaboration products, reason about distributed systems, improve reliability, and solve problems with data structures and clean code.", requiredSkills: ["Java", "Data Structures", "REST APIs", "SQL", "System Design"], location: "Bengaluru", workMode: "remote", employmentType: "full_time", salaryLabel: "₹14–18 LPA" },
  { companyName: "Zoho", title: "Frontend Engineering Intern", description: "Create accessible user interfaces, translate product requirements into responsive React components, test browser behaviour, and improve frontend performance.", requiredSkills: ["HTML", "CSS", "JavaScript", "React", "Testing"], location: "Chennai", workMode: "onsite", employmentType: "internship", salaryLabel: "₹35k/month" },
  { companyName: "CRED", title: "Business Analyst", description: "Investigate business and customer trends, build dashboards, frame ambiguous questions, and present recommendations to cross-functional stakeholders.", requiredSkills: ["SQL", "Excel", "Power BI", "Statistics", "Communication"], location: "Bengaluru", workMode: "hybrid", employmentType: "full_time", salaryLabel: "₹10–14 LPA" },
  { companyName: "BrowserStack", title: "QA Automation Engineer", description: "Design automated test suites for web platforms, investigate failures, improve CI quality gates, and partner with developers on reliable releases.", requiredSkills: ["JavaScript", "Testing", "Selenium", "CI/CD", "Git"], location: "Mumbai", workMode: "remote", employmentType: "full_time", salaryLabel: "₹9–13 LPA" },
  { companyName: "Postman", title: "Developer Support Engineer", description: "Help developers solve API integration problems, reproduce technical issues, write clear guidance, and feed customer insights back into the product.", requiredSkills: ["REST APIs", "JavaScript", "Communication", "Debugging", "SQL"], location: "Bengaluru", workMode: "remote", employmentType: "full_time", salaryLabel: "₹8–12 LPA" },
  { companyName: "Meesho", title: "Data Analyst Intern", description: "Explore marketplace datasets, validate metrics, automate recurring reports, and communicate practical insights to operations and product teams.", requiredSkills: ["SQL", "Python", "Excel", "Statistics", "Data Visualization"], location: "Bengaluru", workMode: "hybrid", employmentType: "internship", salaryLabel: "₹45k/month" },
] as const;

export async function ensureDemoJobCatalog() {
  const [recruiter, studentProfile] = await Promise.all([User.findOne({ role: "recruiter" }).select("_id").lean(), StudentProfile.findOne({ onboardingCompleted: true }).select("institutionId").lean()]);
  if (!recruiter) return { inserted: 0 };
  let inserted = 0;
  for (const seed of demoJobs) {
    const result = await Job.updateOne({ companyName: seed.companyName, title: seed.title }, { $setOnInsert: { ...seed, postedBy: recruiter._id, institutionScope: studentProfile?.institutionId ? [studentProfile.institutionId] : [], embedding: [], isActive: true } }, { upsert: true });
    inserted += result.upsertedCount;
  }
  return { inserted };
}

export async function bootstrapJobMatching() {
  await ensureDemoJobCatalog();
  const profiles = await StudentProfile.find({ onboardingCompleted: true }).select("userId institutionId profileVersion embeddingProfileVersion").lean();
  for (const profile of profiles) {
    const visibleJobs = await Job.countDocuments({ isActive: true, $or: [{ institutionScope: { $size: 0 } }, { institutionScope: profile.institutionId }] });
    const currentScores = await MatchScore.countDocuments({ studentId: profile.userId, studentProfileVersion: profile.profileVersion });
    if (profile.embeddingProfileVersion !== profile.profileVersion || currentScores < visibleJobs) queueMatchingRecompute(String(profile.userId), { studentId: String(profile.userId) });
  }
}

export async function getMatchingDashboard(studentId: string) {
  const profile = await StudentProfile.findOne({ userId: studentId }).lean();
  if (!profile) return { matches: [], applications: [], recalculating: false, profileVersion: 0, activeJobCount: 0 };
  const visibleQuery: Record<string, unknown> = { isActive: true, _id: { $nin: profile.dismissedJobIds ?? [] } };
  if (profile.institutionId) visibleQuery.$or = [{ institutionScope: { $size: 0 } }, { institutionScope: profile.institutionId }];
  const [jobs, scores, applications] = await Promise.all([
    Job.find(visibleQuery).sort({ createdAt: -1 }).lean(),
    MatchScore.find({ studentId, studentProfileVersion: profile.profileVersion }).sort({ matchPercent: -1 }).lean(),
    Application.find({ studentId }).sort({ updatedAt: -1 }).lean(),
  ]);
  const jobMap = new Map(jobs.map(job => [String(job._id), job]));
  const applicationJobIds = new Set(applications.map(item => String(item.jobId)));
  const matches = scores.filter(score => jobMap.has(String(score.jobId)) && !applicationJobIds.has(String(score.jobId))).map(score => ({ ...score, job: jobMap.get(String(score.jobId)) }));
  const allApplicationJobs = await Job.find({ _id: { $in: applications.map(item => item.jobId) } }).lean();
  const appJobMap = new Map(allApplicationJobs.map(job => [String(job._id), job]));
  const scoreMap = new Map(scores.map(score => [String(score.jobId), score]));
  const tracker = applications.map(item => { const lastChangedAt = item.statusHistory.at(-1)?.changedAt ?? item.updatedAt; return { ...item, job: appJobMap.get(String(item.jobId)), matchPercent: scoreMap.get(String(item.jobId))?.matchPercent ?? 0, lastChangedAt, daysSinceLastChange: Math.max(0, Math.floor((Date.now() - new Date(lastChangedAt).getTime()) / 86_400_000)) }; });
  return { matches, applications: tracker, recalculating: profile.embeddingProfileVersion !== profile.profileVersion || scores.length < jobs.length, profileVersion: profile.profileVersion, activeJobCount: jobs.length, computedAt: scores[0]?.computedAt ?? null };
}

export async function saveOrApplyJob(studentId: string, jobId: string, status: "saved" | "applied") {
  const now = new Date();
  return Application.findOneAndUpdate({ studentId, jobId }, { $set: { status, ...(status === "applied" ? { appliedAt: now } : {}) }, $push: { statusHistory: { status, changedAt: now } } }, { upsert: true, new: true, setDefaultsOnInsert: true });
}

export async function updateApplication(input: { applicationId: string; studentId: string; status?: ApplicationStatus; notes?: string }) {
  const application = await Application.findOne({ _id: input.applicationId, studentId: input.studentId });
  if (!application) return null;
  if (input.status && input.status !== application.status) { application.status = input.status; application.statusHistory.push({ status: input.status, changedAt: new Date() }); if (input.status === "applied" && !application.appliedAt) application.appliedAt = new Date(); }
  if (input.notes !== undefined) application.notes = input.notes;
  await application.save(); return application;
}

export async function dismissJob(studentId: string, jobId: string) { await StudentProfile.updateOne({ userId: studentId }, { $addToSet: { dismissedJobIds: new mongoose.Types.ObjectId(jobId) } }); return { dismissed: true }; }
export async function resetDismissedJobs(studentId: string) { await StudentProfile.updateOne({ userId: studentId }, { $set: { dismissedJobIds: [] } }); return { reset: true }; }
