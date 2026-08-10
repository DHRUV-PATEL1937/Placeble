import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { AptitudeAttempt } from "../models/AptitudeAttempt";
import { AptitudeQuestion, aptitudeCategories, aptitudeDifficulties } from "../models/AptitudeQuestion";
import {
  completeAptitudeAttempt,
  createAptitudeAttempt,
  getAptitudeJob,
  getAptitudeSummary,
  getAttemptPayload,
  forceRefreshDynamicQuestionBank,
  gradeCodingAndCompleteAttempt,
  queueAptitudeJob,
  runCodingQuestion,
  saveAttemptResponse,
} from "../services/aptitude-service";

const router = Router();
router.use(requireAuth, requireRole("student"));

router.get("/summary", async (request, response) => response.json(await getAptitudeSummary(request.auth!.userId)));

router.get("/jobs/:jobId", (request, response) => {
  const job = getAptitudeJob(request.params.jobId, request.auth!.userId);
  return job ? response.json({ job }) : response.status(404).json({ message: "That aptitude job was not found." });
});

router.post("/question-bank/refresh", (request, response) => {
  const job = queueAptitudeJob(request.auth!.userId, "Refreshing placement-style questions with Gemini", forceRefreshDynamicQuestionBank, "aptitude:refreshQuestionBank");
  return response.status(202).json({ job });
});

router.post("/attempts", async (request, response) => {
  const input = z.object({
    sections: z.array(z.enum(aptitudeCategories)).min(1).max(4),
    questionCount: z.number().int().min(3).max(20).default(10),
    durationMinutes: z.number().int().min(3).max(120).default(15),
    difficulty: z.union([z.enum(aptitudeDifficulties), z.literal("mixed")]).default("mixed"),
    topic: z.string().trim().max(80).optional(),
  }).parse(request.body);
  const existing = await AptitudeAttempt.findOne({ studentId: request.auth!.userId, status: "in_progress" }).sort({ createdAt: -1 }).select("_id").lean();
  if (existing) return response.status(409).json({ message: "You already have an active test. Resume or abandon it before starting another.", attemptId: existing._id });
  const summary = await getAptitudeSummary(request.auth!.userId);
  if (input.sections.includes("coding") && !summary.codingAvailable) return response.status(503).json({ message: "Coding practice needs a Judge0 endpoint. Choose quant, logical, or verbal for now." });
  return response.status(201).json(await createAptitudeAttempt({ ...input, userId: request.auth!.userId }));
});

router.get("/attempts/:attemptId", async (request, response) => {
  const payload = await getAttemptPayload(request.params.attemptId, request.auth!.userId);
  return payload ? response.json(payload) : response.status(404).json({ message: "That aptitude attempt was not found." });
});

router.patch("/attempts/:attemptId/response", async (request, response) => {
  const input = z.object({
    questionId: z.string().min(12),
    selectedOptionIndex: z.number().int().min(0).max(10).optional(),
    codeSubmission: z.object({ language: z.enum(["javascript", "python", "java", "cpp"]), code: z.string().max(50000) }).optional(),
    timeSpentSeconds: z.number().int().min(0).max(3600).default(0),
  }).refine(value => value.selectedOptionIndex !== undefined || value.codeSubmission, { message: "Provide an answer or code submission." }).parse(request.body);
  return response.json(await saveAttemptResponse({ ...input, attemptId: request.params.attemptId, userId: request.auth!.userId }));
});

router.post("/attempts/:attemptId/run-code", async (request, response) => {
  const input = z.object({ questionId: z.string().min(12), language: z.enum(["javascript", "python", "java", "cpp"]), code: z.string().min(1).max(50000) }).parse(request.body);
  const ownsQuestion = await AptitudeAttempt.exists({ _id: request.params.attemptId, studentId: request.auth!.userId, status: "in_progress", questionIds: input.questionId });
  if (!ownsQuestion) return response.status(404).json({ message: "That coding question is not part of your active attempt." });
  const question = await AptitudeQuestion.findOne({ _id: input.questionId, category: "coding", isActive: true }).select("_id").lean();
  if (!question) return response.status(404).json({ message: "That coding question was not found." });
  const job = queueAptitudeJob(request.auth!.userId, "Running your code against visible test cases", () => runCodingQuestion({ ...input, visibleOnly: true }));
  return response.status(202).json({ job });
});

router.post("/attempts/:attemptId/submit", async (request, response) => {
  const attempt = await AptitudeAttempt.findOne({ _id: request.params.attemptId, studentId: request.auth!.userId, status: "in_progress" }).select("questionIds").lean();
  if (!attempt) return response.status(404).json({ message: "This attempt is no longer active." });
  const codingCount = await AptitudeQuestion.countDocuments({ _id: { $in: attempt.questionIds }, category: "coding" });
  if (codingCount) {
    const job = queueAptitudeJob(request.auth!.userId, "Running final code submissions against all test cases", () => gradeCodingAndCompleteAttempt(request.params.attemptId, request.auth!.userId));
    return response.status(202).json({ job });
  }
  return response.json(await completeAptitudeAttempt(request.params.attemptId, request.auth!.userId));
});

router.post("/attempts/:attemptId/abandon", async (request, response) => {
  const attempt = await AptitudeAttempt.findOneAndUpdate({ _id: request.params.attemptId, studentId: request.auth!.userId, status: "in_progress" }, { status: "abandoned", completedAt: new Date() }, { new: true });
  return attempt ? response.json({ ok: true }) : response.status(404).json({ message: "This attempt is no longer active." });
});

export { router as aptitudeRouter };
