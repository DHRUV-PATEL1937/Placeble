import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { Interview, interviewTypes } from "../models/Interview";
import { storeInterviewRecording } from "../services/interview-storage-service";
import { createInterviewSession, generateInterviewDebrief, getInterviewJob, getInterviewSession, getInterviewSummary, processInterviewTurn, queueInterviewJob } from "../services/interview-service";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 }, fileFilter: (_request, file, callback) => callback(null, /^(audio|video)\//.test(file.mimetype)) });
router.use(requireAuth, requireRole("student"));

router.get("/summary", async (request, response) => response.json(await getInterviewSummary(request.auth!.userId)));
router.get("/jobs/:jobId", (request, response) => { const job = getInterviewJob(request.params.jobId, request.auth!.userId); return job ? response.json({ job }) : response.status(404).json({ message: "That interview task was not found." }); });
router.get("/sessions/:id", async (request, response) => { const interview = await getInterviewSession(request.params.id, request.auth!.userId); return interview ? response.json({ interview }) : response.status(404).json({ message: "That interview was not found." }); });

router.post("/sessions", async (request, response) => {
  const input = z.object({ type: z.enum(interviewTypes), targetRole: z.string().trim().max(120).default(""), totalTurns: z.number().int().min(3).max(8).default(5) }).parse(request.body);
  const existing = await Interview.findOne({ studentId: request.auth!.userId, status: "in_progress" }).select("_id").lean();
  if (existing) return response.status(409).json({ message: "You already have an interview in progress. Resume or abandon it first.", interviewId: existing._id });
  return response.status(201).json({ interview: await createInterviewSession({ ...input, userId: request.auth!.userId }) });
});

router.post("/sessions/:id/turns", upload.single("recording"), async (request, response) => {
  const interviewId = String(request.params.id);
  const input = z.object({ manualTranscript: z.string().trim().max(12000).default(""), timeSpentSeconds: z.coerce.number().int().min(0).max(1800).default(0) }).parse(request.body);
  if (!request.file && input.manualTranscript.length < 12) return response.status(400).json({ message: "Record an answer or provide a typed practice answer." });
  const interview = await Interview.findOne({ _id: interviewId, studentId: request.auth!.userId, status: "in_progress" });
  if (!interview) return response.status(404).json({ message: "This interview is no longer active." });
  const turnNumber = interview.turns.length + 1;
  if (interview.processingTurn) return response.status(409).json({ message: "This answer is already being reviewed." });
  interview.processingTurn = turnNumber;
  await interview.save();
  const recording = request.file ? { buffer: request.file.buffer, mimetype: request.file.mimetype, originalname: request.file.originalname } : undefined;
  const recordingUrl = recording ? await storeInterviewRecording(recording, request.auth!.userId) : "";
  const userId = request.auth!.userId;
  const job = queueInterviewJob(userId, "interview:scoreTurn", "Receiving your answer", async update => {
    const result = await processInterviewTurn({ interviewId, userId, recording, recordingUrl, manualTranscript: input.manualTranscript, timeSpentSeconds: input.timeSpentSeconds }, update);
    if (!result.needsDebrief) return result;
    const debriefJob = queueInterviewJob(userId, "interview:debrief", "Preparing your interview debrief", nextUpdate => generateInterviewDebrief(interviewId, userId, nextUpdate));
    return { ...result, debriefJobId: debriefJob.id };
  });
  return response.status(202).json({ job });
});

router.post("/sessions/:id/complete", async (request, response) => {
  const interview = await Interview.findOne({ _id: request.params.id, studentId: request.auth!.userId, status: "in_progress", processingTurn: 0 });
  if (!interview?.turns.length) return response.status(400).json({ message: "Answer at least one question before ending early." });
  const userId = request.auth!.userId;
  const job = queueInterviewJob(userId, "interview:debrief", "Preparing your early-session debrief", update => generateInterviewDebrief(request.params.id, userId, update));
  return response.status(202).json({ job });
});

router.post("/sessions/:id/abandon", async (request, response) => {
  const interview = await Interview.findOneAndUpdate({ _id: request.params.id, studentId: request.auth!.userId, status: "in_progress" }, { status: "abandoned", completedAt: new Date(), processingTurn: 0 }, { new: true });
  return interview ? response.json({ interview }) : response.status(404).json({ message: "That active interview was not found." });
});

export { router as interviewRouter };
