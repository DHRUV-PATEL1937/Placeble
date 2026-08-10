import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { GdSession } from "../models/GdSession";
import { requireAuth, requireRole } from "../middleware/auth";
import { transcribeStudentRecording } from "../services/interview-ai-service";
import { storeInterviewRecording } from "../services/interview-storage-service";
import { abandonGdSession, addStudentTurn, createGdSession, enqueuePersonaTurn, enqueueSessionScore, getGdJob, getGdSummary, interruptPersona, publicGdSession } from "../services/gd-service";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 24 * 1024 * 1024 }, fileFilter: (_request, file, callback) => callback(null, /^audio\//.test(file.mimetype)) });
router.use(requireAuth, requireRole("student"));

router.get("/summary", async (request, response) => response.json(await getGdSummary(request.auth!.userId)));
router.get("/jobs/:jobId", (request, response) => { const job = getGdJob(request.params.jobId, request.auth!.userId); return job ? response.json({ job }) : response.status(404).json({ message: "That discussion task was not found." }); });
router.get("/sessions/:sessionId", async (request, response) => {
  const session = await GdSession.findOne({ _id: request.params.sessionId, studentId: request.auth!.userId }).lean();
  return session ? response.json({ session: publicGdSession(session as unknown as Record<string, unknown>) }) : response.status(404).json({ message: "That discussion session was not found." });
});

router.post("/sessions", async (request, response) => {
  const input = z.object({ topic: z.string().trim().min(12).max(300), turnCap: z.number().int().min(6).max(16).default(10), durationMinutes: z.number().int().min(3).max(12).default(6) }).parse(request.body);
  const existing = await GdSession.findOne({ studentId: request.auth!.userId, status: "in_progress" }).select("_id").lean();
  if (existing) return response.status(409).json({ message: "You already have a discussion in progress. Resume or abandon it first.", sessionId: existing._id });
  const session = await createGdSession({ ...input, userId: request.auth!.userId });
  const job = await enqueuePersonaTurn(String(session._id), request.auth!.userId);
  return response.status(201).json({ session: publicGdSession(session.toObject() as unknown as Record<string, unknown>), job });
});

router.post("/sessions/:sessionId/next", async (request, response) => {
  try { return response.status(202).json({ job: await enqueuePersonaTurn(String(request.params.sessionId), request.auth!.userId) }); }
  catch (error) { return response.status(409).json({ message: error instanceof Error ? error.message : "The next participant is not ready." }); }
});

router.post("/sessions/:sessionId/interrupt", async (request, response) => {
  const input = z.object({ duringPersonaPlayback: z.boolean().default(false) }).parse(request.body);
  const session = await interruptPersona(String(request.params.sessionId), request.auth!.userId, input.duringPersonaPlayback);
  return session ? response.json({ session: publicGdSession(session.toObject() as unknown as Record<string, unknown>) }) : response.status(404).json({ message: "This discussion is no longer active." });
});

router.post("/sessions/:sessionId/student-turns", upload.single("recording"), async (request, response) => {
  const input = z.object({ manualTranscript: z.string().trim().max(6000).default(""), timestampStart: z.coerce.number().int().min(0).max(3_600_000), timestampEnd: z.coerce.number().int().min(0).max(3_600_000) }).parse(request.body);
  if (!request.file && input.manualTranscript.length < 8) return response.status(400).json({ message: "Hold push-to-talk and speak, or type a point before submitting." });
  const transcript = input.manualTranscript || (request.file ? await transcribeStudentRecording(request.file.buffer, request.file.mimetype) : "");
  if (transcript.trim().length < 8) return response.status(400).json({ message: "We could not hear enough of your point. Please try again a little closer to the microphone." });
  const audioUrl = request.file ? await storeInterviewRecording(request.file, request.auth!.userId) : "";
  const session = await addStudentTurn({ sessionId: String(request.params.sessionId), userId: request.auth!.userId, text: transcript.trim(), audioUrl, timestampStart: input.timestampStart, timestampEnd: input.timestampEnd });
  const job = await enqueuePersonaTurn(String(session._id), request.auth!.userId);
  return response.status(202).json({ session: publicGdSession(session.toObject() as unknown as Record<string, unknown>), job });
});

router.post("/sessions/:sessionId/resume", async (request, response) => {
  const session = await GdSession.findOne({ _id: request.params.sessionId, studentId: request.auth!.userId, status: "in_progress" });
  if (!session) return response.status(404).json({ message: "This discussion is no longer active." });
  session.orchestration.revision += 1; session.orchestration.processing = false; session.orchestration.currentPersonaKey = "";
  await session.save();
  const needsResponse = !session.turns.length || session.turns.at(-1)?.speaker === "student";
  const job = needsResponse ? await enqueuePersonaTurn(String(session._id), request.auth!.userId) : null;
  return response.json({ session: publicGdSession(session.toObject() as unknown as Record<string, unknown>), job });
});

router.post("/sessions/:sessionId/end", async (request, response) => {
  try { return response.status(202).json({ job: await enqueueSessionScore(String(request.params.sessionId), request.auth!.userId) }); }
  catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : "This discussion cannot be scored yet." }); }
});

router.post("/sessions/:sessionId/abandon", async (request, response) => {
  const session = await abandonGdSession(String(request.params.sessionId), request.auth!.userId);
  return session ? response.json({ session: publicGdSession(session.toObject() as unknown as Record<string, unknown>) }) : response.status(404).json({ message: "This discussion is no longer active." });
});

export { router as gdRouter };
