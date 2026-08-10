import { randomUUID } from "node:crypto";
import { Interview, type InterviewType } from "../models/Interview";
import { createInterviewDebrief, fillerWordRate, scoreTurnAndGenerateNext, transcribeInterviewRecording } from "./interview-ai-service";

type InterviewJobKind = "interview:scoreTurn" | "interview:renderQuestionAudio" | "interview:debrief";
type InterviewJob = { id: string; userId: string; kind: InterviewJobKind; status: "queued" | "processing" | "complete" | "failed"; progress: number; message: string; result?: unknown; error?: string };
const interviewJobs = new Map<string, InterviewJob>();

export function queueInterviewJob(userId: string, kind: InterviewJobKind, message: string, task: (update: (progress: number, message: string) => void) => Promise<unknown>) {
  const job: InterviewJob = { id: randomUUID(), userId, kind, status: "queued", progress: 8, message };
  interviewJobs.set(job.id, job);
  setTimeout(() => {
    job.status = "processing";
    void task((progress, nextMessage) => Object.assign(job, { progress, message: nextMessage }))
      .then(result => Object.assign(job, { status: "complete", progress: 100, message: "Ready", result }))
      .catch(error => Object.assign(job, { status: "failed", progress: 100, message: "Needs attention", error: error instanceof Error ? error.message : "The interview task failed." }));
  }, 120);
  return job;
}

export function getInterviewJob(id: string, userId: string) {
  const job = interviewJobs.get(id);
  return job?.userId === userId ? job : null;
}

const starterQuestions: Record<string, string[]> = {
  hr: ["Tell me about yourself and the kind of opportunity you are looking for.", "What motivates you to do your best work?"],
  technical: ["Walk me through a technical project you are proud of. What problem did it solve, and what did you personally build?", "Describe a technical decision you made and the trade-offs you considered."],
  behavioral: ["Tell me about a time you faced a difficult challenge in a team. What did you do, and what happened?", "Describe a time you received difficult feedback and how you responded."],
  mixed: ["Give me a concise introduction to your background, then tell me about one project or experience that best represents your strengths.", "Tell me about a problem you solved and the people or technical choices involved."],
};

function firstQuestion(type: InterviewType, targetRole: string) {
  const base = starterQuestions[type]?.[Math.floor(Math.random() * starterQuestions[type].length)] ?? starterQuestions.mixed[0];
  return targetRole ? `${base} Please connect your answer to the ${targetRole} role where relevant.` : base;
}

export async function createInterviewSession(input: { userId: string; type: InterviewType; targetRole: string; totalTurns: number }) {
  const interview = await Interview.create({ studentId: input.userId, type: input.type, targetRole: input.targetRole, totalTurns: input.totalTurns, currentQuestion: firstQuestion(input.type, input.targetRole), status: "in_progress", startedAt: new Date() });
  return interview.toObject();
}

export async function getInterviewSummary(userId: string) {
  const [active, completed] = await Promise.all([
    Interview.findOne({ studentId: userId, status: "in_progress" }).sort({ updatedAt: -1 }).lean(),
    Interview.find({ studentId: userId, status: "completed" }).sort({ completedAt: -1 }).limit(8).lean(),
  ]);
  return { active, completed, aiProvider: "gemini_or_openai", transcriptionMode: "server", questionVoiceMode: "browser" };
}

export async function getInterviewSession(id: string, userId: string) {
  return Interview.findOne({ _id: id, studentId: userId }).lean();
}

export async function processInterviewTurn(input: { interviewId: string; userId: string; recording?: { buffer: Buffer; mimetype: string }; recordingUrl: string; manualTranscript: string; timeSpentSeconds: number }, update: (progress: number, message: string) => void) {
  try {
    const interview = await Interview.findOne({ _id: input.interviewId, studentId: input.userId, status: "in_progress" });
    if (!interview) throw new Error("This interview is no longer active.");
    const turnNumber = interview.turns.length + 1;
    if (interview.processingTurn !== turnNumber) throw new Error("This answer is not the active interview turn.");
    update(28, input.manualTranscript ? "Preparing your answer" : "Transcribing your recording");
    const transcript = input.manualTranscript.trim() || (input.recording ? await transcribeInterviewRecording(input.recording.buffer, input.recording.mimetype) : "");
    if (transcript.length < 12) throw new Error("We could not hear enough of your answer. Please retry and speak a little closer to the microphone.");
    update(64, "Reviewing structure, relevance and specificity");
    const scored = await scoreTurnAndGenerateNext({ type: interview.type, targetRole: interview.targetRole, turnNumber, totalTurns: interview.totalTurns, question: interview.currentQuestion, transcript, history: interview.turns.map(turn => ({ question: turn.question, answerTranscript: turn.answerTranscript, feedback: turn.feedback })) });
    const rate = fillerWordRate(transcript);
    interview.turns.push({ turnNumber, question: interview.currentQuestion, questionAudioUrl: "", answerTranscript: transcript, answerAudioUrl: "", answerVideoUrl: input.recordingUrl, timeSpentSeconds: input.timeSpentSeconds, scores: { structure: Math.round(scored.structure.score * 10) / 10, relevance: Math.round(scored.relevance.score * 10) / 10, specificity: Math.round(scored.specificity.score * 10) / 10, fillerWordRate: rate }, feedback: scored.feedback });
    const finalTurn = turnNumber >= interview.totalTurns;
    interview.currentQuestion = finalTurn ? "" : scored.nextQuestion;
    interview.processingTurn = 0;
    await interview.save();
    update(88, finalTurn ? "Preparing your full debrief" : "Preparing the next question");
    return { interview: interview.toObject(), needsDebrief: finalTurn };
  } catch (error) {
    await Interview.updateOne({ _id: input.interviewId, studentId: input.userId }, { processingTurn: 0 });
    throw error;
  }
}

export async function generateInterviewDebrief(interviewId: string, userId: string, update: (progress: number, message: string) => void) {
  const interview = await Interview.findOne({ _id: interviewId, studentId: userId, status: "in_progress" });
  if (!interview || !interview.turns.length) throw new Error("Complete at least one answer before opening a debrief.");
  update(40, "Looking for patterns across your answers");
  const result = await createInterviewDebrief({ type: interview.type, targetRole: interview.targetRole, turns: interview.turns.map(turn => turn.toObject()) });
  Object.assign(interview, { overallScore: Math.round(result.overallScore), overallFeedback: result.overallFeedback, strengths: result.strengths, improvements: result.improvements, status: "completed", completedAt: new Date(), currentQuestion: "", processingTurn: 0 });
  await interview.save();
  update(88, "Finishing your coaching notes");
  return { interview: interview.toObject() };
}
