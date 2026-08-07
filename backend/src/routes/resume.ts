import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { Resume } from "../models/Resume";
import { StudentProfile } from "../models/StudentProfile";
import { User } from "../models/User";
import {
  generateProfileResume,
  getExport,
  getResumeJob,
  parseResumeUpload,
  queueResumeJob,
  renderResumeDocx,
  renderResumePdf,
  scoreResume,
  storeExport,
  type ResumeSection,
} from "../services/resume-service";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: (_request, file, callback) => callback(null, /\.(pdf|docx)$/i.test(file.originalname)) });

const sectionSchema = z.object({
  type: z.enum(["summary", "experience", "education", "skills", "projects", "certifications"]),
  order: z.number().int().min(0),
  content: z.record(z.string(), z.unknown()),
});
const saveSchema = z.object({
  title: z.string().trim().min(2).max(140),
  sections: z.array(sectionSchema).max(12),
  targetJdText: z.string().max(30000).optional().default(""),
  template: z.enum(["classic", "modern", "compact"]).optional().default("classic"),
});

router.use(requireAuth, requireRole("student"));

router.get("/current", async (request, response) => {
  const resume = await Resume.findOne({ studentId: request.auth!.userId, isCurrent: true }).sort({ updatedAt: -1 });
  return response.json({ resume });
});

router.get("/versions", async (request, response) => {
  const versions = await Resume.find({ studentId: request.auth!.userId }).select("title versionNumber sourceType atsScore template createdAt updatedAt isCurrent").sort({ versionNumber: -1 }).limit(20).lean();
  return response.json({ versions });
});

router.get("/jobs/:jobId", (request, response) => {
  const job = getResumeJob(request.params.jobId, request.auth!.userId);
  return job ? response.json({ job }) : response.status(404).json({ message: "That resume job was not found." });
});

router.post("/generate", async (request, response) => {
  const input = z.object({ targetJdText: z.string().max(30000).optional().default("") }).parse(request.body);
  const [profile, user] = await Promise.all([
    StudentProfile.findOne({ userId: request.auth!.userId }).lean(),
    User.findById(request.auth!.userId).select("name").lean(),
  ]);
  if (!profile || !user) return response.status(404).json({ message: "Complete your student profile before generating a resume." });
  const userId = request.auth!.userId;
  const job = queueResumeJob(userId, "resume:generate", "Building a first draft from your profile", async () => {
    const generated = generateProfileResume(profile, user.name, input.targetJdText);
    const current = await Resume.findOne({ studentId: userId, isCurrent: true }).lean();
    const previous = await Resume.findOne({ studentId: userId }).sort({ versionNumber: -1 }).select("versionNumber _id").lean();
    const sections = current?.sections?.length ? current.sections as unknown as ResumeSection[] : generated.sections;
    if (current?.sourceType === "uploaded") {
      const profileSkills = profile.skills?.filter(Boolean) ?? [];
      const skillsSection = sections.find(section => section.type === "skills");
      if (skillsSection) skillsSection.content.items = [...new Set([...(Array.isArray(skillsSection.content.items) ? skillsSection.content.items : []), ...profileSkills])];
    }
    const score = scoreResume(sections, input.targetJdText);
    await Resume.updateMany({ studentId: userId, isCurrent: true }, { isCurrent: false });
    const resume = await Resume.create({
      studentId: userId,
      title: current?.title ?? generated.title,
      sections,
      sourceType: current?.sourceType === "uploaded" ? "hybrid" : "generated",
      targetJdText: generated.targetJdText,
      atsScore: score.atsScore,
      atsBreakdown: { keywordOverlap: score.keywordOverlap, semanticSimilarity: score.semanticSimilarity, missingKeywords: score.missingKeywords },
      template: current?.template ?? "classic",
      versionNumber: (previous?.versionNumber ?? 0) + 1,
      parentVersionId: previous?._id ?? null,
      isCurrent: true,
    });
    return { resume };
  });
  return response.status(202).json({ job });
});

router.post("/upload", upload.single("resume"), async (request, response) => {
  if (!request.file) return response.status(400).json({ message: "Choose a PDF or DOCX resume to continue." });
  const file = request.file;
  const userId = request.auth!.userId;
  const job = queueResumeJob(userId, "resume:parseUpload", "Reading sections from your existing resume", async () => {
    const parsed = await parseResumeUpload(file);
    const previous = await Resume.findOne({ studentId: userId }).sort({ versionNumber: -1 }).select("versionNumber _id").lean();
    await Resume.updateMany({ studentId: userId, isCurrent: true }, { isCurrent: false });
    const resume = await Resume.create({
      studentId: userId,
      title: parsed.title,
      sections: parsed.sections,
      sourceType: "uploaded",
      atsScore: parsed.atsScore,
      atsBreakdown: { keywordOverlap: parsed.keywordOverlap, semanticSimilarity: parsed.semanticSimilarity, missingKeywords: parsed.missingKeywords },
      versionNumber: (previous?.versionNumber ?? 0) + 1,
      parentVersionId: previous?._id ?? null,
      isCurrent: true,
    });
    return { resume, found: { sections: parsed.sections.filter(section => Object.values(section.content).some(value => Array.isArray(value) ? value.length : Boolean(value))).length, characters: parsed.rawTextLength } };
  });
  return response.status(202).json({ job });
});

router.patch("/current", async (request, response) => {
  const input = saveSchema.parse(request.body);
  const score = scoreResume(input.sections as ResumeSection[], input.targetJdText);
  const resume = await Resume.findOneAndUpdate(
    { studentId: request.auth!.userId, isCurrent: true },
    { ...input, atsScore: score.atsScore, atsBreakdown: { keywordOverlap: score.keywordOverlap, semanticSimilarity: score.semanticSimilarity, missingKeywords: score.missingKeywords }, fileUrl: "" },
    { new: true, runValidators: true },
  );
  return resume ? response.json({ resume }) : response.status(404).json({ message: "Generate or upload a resume before editing." });
});

router.post("/score", async (request, response) => {
  const input = z.object({ sections: z.array(sectionSchema), targetJdText: z.string().max(30000).optional().default("") }).parse(request.body);
  const userId = request.auth!.userId;
  const job = queueResumeJob(userId, "resume:scoreAts", "Comparing your current draft with the target role", async () => {
    const score = scoreResume(input.sections as ResumeSection[], input.targetJdText);
    const resume = await Resume.findOneAndUpdate({ studentId: userId, isCurrent: true }, { targetJdText: input.targetJdText, atsScore: score.atsScore, atsBreakdown: { keywordOverlap: score.keywordOverlap, semanticSimilarity: score.semanticSimilarity, missingKeywords: score.missingKeywords } }, { new: true });
    return { score, resumeId: resume?._id };
  });
  return response.status(202).json({ job });
});

router.post("/versions", async (request, response) => {
  const current = await Resume.findOne({ studentId: request.auth!.userId, isCurrent: true });
  if (!current) return response.status(404).json({ message: "There is no current draft to save." });
  const nextVersion = await Resume.create({
    studentId: current.studentId,
    title: current.title,
    sections: current.sections.map(section => ({ type: section.type, order: section.order, content: section.content })),
    sourceType: current.sourceType,
    targetJdText: current.targetJdText,
    atsScore: current.atsScore,
    atsBreakdown: current.atsBreakdown,
    template: current.template,
    versionNumber: current.versionNumber + 1,
    parentVersionId: current._id,
    isCurrent: true,
  });
  current.isCurrent = false;
  await current.save();
  return response.status(201).json({ resume: nextVersion });
});

router.post("/versions/:versionId/restore", async (request, response) => {
  const source = await Resume.findOne({ _id: request.params.versionId, studentId: request.auth!.userId });
  if (!source) return response.status(404).json({ message: "That saved version was not found." });
  const latest = await Resume.findOne({ studentId: request.auth!.userId }).sort({ versionNumber: -1 }).select("versionNumber").lean();
  await Resume.updateMany({ studentId: request.auth!.userId, isCurrent: true }, { isCurrent: false });
  const resume = await Resume.create({
    studentId: source.studentId,
    title: source.title,
    sections: source.sections.map(section => ({ type: section.type, order: section.order, content: section.content })),
    sourceType: source.sourceType,
    targetJdText: source.targetJdText,
    atsScore: source.atsScore,
    atsBreakdown: source.atsBreakdown,
    template: source.template,
    versionNumber: (latest?.versionNumber ?? 0) + 1,
    parentVersionId: source._id,
    isCurrent: true,
  });
  return response.status(201).json({ resume });
});

router.post("/new", async (request, response) => {
  await Resume.updateMany({ studentId: request.auth!.userId, isCurrent: true }, { isCurrent: false });
  return response.json({ ok: true });
});

router.post("/export/:format", async (request, response) => {
  const format = z.enum(["pdf", "docx"]).parse(request.params.format);
  const [resume, user] = await Promise.all([
    Resume.findOne({ studentId: request.auth!.userId, isCurrent: true }).lean(),
    User.findById(request.auth!.userId).select("name").lean(),
  ]);
  if (!resume || !user) return response.status(404).json({ message: "There is no resume to export." });
  const userId = request.auth!.userId;
  const job = queueResumeJob(userId, format === "pdf" ? "resume:renderPdf" : "resume:renderDocx", `Rendering your ${format.toUpperCase()} file`, async () => {
    const sections = resume.sections as unknown as ResumeSection[];
    const buffer = format === "pdf" ? await renderResumePdf(user.name, resume.title, sections) : await renderResumeDocx(user.name, resume.title, sections);
    const filename = `${user.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}-resume.${format}`;
    const mimeType = format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const exportId = storeExport(userId, filename, mimeType, buffer);
    const fileUrl = `/api/v1/resume/download/${exportId}`;
    await Resume.updateOne({ _id: resume._id }, { fileUrl });
    return { fileUrl, filename, format };
  });
  return response.status(202).json({ job });
});

router.get("/download/:exportId", (request, response) => {
  const file = getExport(request.params.exportId, request.auth!.userId);
  if (!file) return response.status(404).json({ message: "That export has expired. Create it again." });
  response.setHeader("Content-Type", file.mimeType);
  response.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
  return response.send(file.buffer);
});

export { router as resumeRouter };
