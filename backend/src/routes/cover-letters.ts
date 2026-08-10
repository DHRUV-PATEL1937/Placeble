import { Router } from "express";
import { z } from "zod";
import { Application } from "../models/Application";
import { CoverLetter } from "../models/CoverLetter";
import { Job } from "../models/Job";
import { Resume } from "../models/Resume";
import { StudentProfile } from "../models/StudentProfile";
import { User } from "../models/User";
import { requireAuth, requireRole } from "../middleware/auth";
import { generateCoverLetter } from "../services/cover-letter-service";
import { getResumeJob, queueResumeJob, renderSimpleTextPdf, type ResumeSection } from "../services/resume-service";

const router = Router();
const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Select a valid item.");
router.use(requireAuth, requireRole("student"));

router.get("/context", async (request, response) => {
  const studentId = request.auth!.userId;
  const [resumes, applications, letters] = await Promise.all([
    Resume.find({ studentId }).select("title versionNumber sourceType isCurrent targetJdText updatedAt").sort({ isCurrent: -1, updatedAt: -1 }).limit(30).lean(),
    Application.find({ studentId }).sort({ updatedAt: -1 }).lean(),
    CoverLetter.find({ studentId }).sort({ updatedAt: -1 }).limit(30).lean(),
  ]);
  const jobs = await Job.find({ _id: { $in: applications.map(item => item.jobId) } }).select("title companyName description location").lean();
  const jobMap = new Map(jobs.map(job => [String(job._id), job]));
  return response.json({ resumes, applications: applications.map(item => ({ ...item, job: jobMap.get(String(item.jobId)) })), letters });
});

router.get("/jobs/:jobId", (request, response) => {
  const job = getResumeJob(request.params.jobId, request.auth!.userId);
  return job ? response.json({ job }) : response.status(404).json({ message: "That writing job was not found." });
});

router.post("/generate", async (request, response) => {
  const input = z.object({
    resumeId: objectId,
    applicationId: objectId.optional().nullable(),
    targetJdText: z.string().max(30000).optional().default(""),
    companyName: z.string().trim().max(180).optional().default(""),
    hiringManagerName: z.string().trim().max(180).optional().default(""),
  }).parse(request.body);
  const studentId = request.auth!.userId;
  const [resume, profile, user, application] = await Promise.all([
    Resume.findOne({ _id: input.resumeId, studentId }).lean(),
    StudentProfile.findOne({ userId: studentId }).lean(),
    User.findById(studentId).select("name").lean(),
    input.applicationId ? Application.findOne({ _id: input.applicationId, studentId }).lean() : null,
  ]);
  if (!resume) return response.status(404).json({ message: "That resume was not found. Choose another saved resume." });
  if (!profile || !user) return response.status(404).json({ message: "Your student profile could not be loaded." });
  if (input.applicationId && !application) return response.status(404).json({ message: "That application was not found." });
  const linkedJob = application ? await Job.findById(application.jobId).lean() : null;
  const targetJdText = input.targetJdText.trim() || linkedJob?.description || resume.targetJdText || "";
  const companyName = input.companyName || linkedJob?.companyName || "";
  const hiringManagerName = input.hiringManagerName || "";
  const userId = String(studentId);
  const job = queueResumeJob(userId, "coverLetter:generate", "Writing your draft…", async () => {
    const result = await generateCoverLetter({
      studentName: user.name,
      profile,
      resume: { title: resume.title, sections: resume.sections as unknown as ResumeSection[], targetJdText: resume.targetJdText },
      targetJdText,
      companyName,
      hiringManagerName,
      roleTitle: linkedJob?.title ?? profile.preferredRoles?.[0] ?? "",
    });
    const letter = await CoverLetter.create({
      studentId,
      applicationId: application?._id ?? null,
      resumeId: resume._id,
      targetJdText,
      companyName,
      hiringManagerName,
      bodyText: result.bodyText,
      status: "draft",
    });
    return { letter, provider: result.provider, model: result.model };
  });
  return response.status(202).json({ job });
});

router.patch("/:letterId", async (request, response) => {
  const input = z.object({
    bodyText: z.string().trim().min(40).max(12000).optional(),
    status: z.enum(["draft", "final"]).optional(),
    companyName: z.string().trim().max(180).optional(),
    hiringManagerName: z.string().trim().max(180).optional(),
  }).refine(value => Object.keys(value).length > 0).parse(request.body);
  const letter = await CoverLetter.findOneAndUpdate({ _id: request.params.letterId, studentId: request.auth!.userId }, input, { new: true, runValidators: true });
  return letter ? response.json({ letter }) : response.status(404).json({ message: "That cover letter was not found." });
});

router.post("/:letterId/attach", async (request, response) => {
  const input = z.object({ applicationId: objectId }).parse(request.body);
  const application = await Application.findOne({ _id: input.applicationId, studentId: request.auth!.userId }).lean();
  if (!application) return response.status(404).json({ message: "That application was not found." });
  const letter = await CoverLetter.findOneAndUpdate({ _id: request.params.letterId, studentId: request.auth!.userId }, { applicationId: application._id }, { new: true });
  return letter ? response.json({ letter }) : response.status(404).json({ message: "That cover letter was not found." });
});

router.get("/:letterId/download/:format", async (request, response) => {
  const format = z.enum(["txt", "pdf"]).parse(request.params.format);
  const [letter, user] = await Promise.all([
    CoverLetter.findOne({ _id: request.params.letterId, studentId: request.auth!.userId }).lean(),
    User.findById(request.auth!.userId).select("name").lean(),
  ]);
  if (!letter || !user) return response.status(404).json({ message: "That cover letter was not found." });
  const baseName = `${letter.companyName || "target-role"}-cover-letter`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  if (format === "txt") {
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="${baseName}.txt"`);
    return response.send(letter.bodyText);
  }
  const buffer = await renderSimpleTextPdf({ studentName: user.name, title: letter.companyName ? `Cover letter · ${letter.companyName}` : "Cover letter", bodyText: letter.bodyText });
  response.setHeader("Content-Type", "application/pdf");
  response.setHeader("Content-Disposition", `attachment; filename="${baseName}.pdf"`);
  return response.send(buffer);
});

export { router as coverLetterRouter };
