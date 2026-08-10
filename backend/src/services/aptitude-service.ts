import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { env } from "../config/env";
import { AptitudeAttempt } from "../models/AptitudeAttempt";
import { AptitudeQuestion, aptitudeCategories, aptitudeDifficulties } from "../models/AptitudeQuestion";
import { ensureAptitudeQuestionBank, getDynamicQuestionBankStatus, refreshDynamicAptitudeQuestionBank } from "./aptitude-question-bank";

export type AptitudeCategory = typeof aptitudeCategories[number];
export type AptitudeDifficulty = typeof aptitudeDifficulties[number];
type PlainQuestion = Record<string, unknown> & { _id: unknown; category: AptitudeCategory; topic: string; difficulty: AptitudeDifficulty; prompt: string; options?: string[]; correctOptionIndex?: number; explanation?: string; starterCode?: Record<string, string>; testCases?: Array<{ input: string; expectedOutput: string; hidden: boolean }>; timeLimitSeconds?: number; tags?: string[] };
type JobStatus = "queued" | "processing" | "complete" | "failed";
type AptitudeJob = { id: string; userId: string; kind: "aptitude:gradeAttempt" | "aptitude:refreshQuestionBank"; status: JobStatus; progress: number; message: string; result?: unknown; error?: string };

const aptitudeJobs = new Map<string, AptitudeJob>();

export function queueAptitudeJob(userId: string, message: string, task: () => Promise<unknown>, kind: AptitudeJob["kind"] = "aptitude:gradeAttempt") {
  const id = randomUUID();
  const job: AptitudeJob = { id, userId, kind, status: "queued", progress: 10, message };
  aptitudeJobs.set(id, job);
  setTimeout(() => {
    Object.assign(job, { status: "processing", progress: 45 });
    void task().then(result => Object.assign(job, { status: "complete", progress: 100, message: "Results ready", result }))
      .catch(error => Object.assign(job, { status: "failed", progress: 100, error: error instanceof Error ? error.message : "Code execution failed." }));
  }, 180);
  return job;
}

export function getAptitudeJob(id: string, userId: string) {
  const job = aptitudeJobs.get(id);
  return job?.userId === userId ? job : null;
}

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function sampleMixedDifficulty(pool: PlainQuestion[], count: number) {
  const targets: Record<AptitudeDifficulty, number> = {
    easy: Math.round(count * .3),
    medium: Math.round(count * .5),
    hard: Math.max(0, count - Math.round(count * .3) - Math.round(count * .5)),
  };
  const chosen: PlainQuestion[] = [];
  for (const difficulty of aptitudeDifficulties) chosen.push(...shuffle(pool.filter(question => question.difficulty === difficulty)).slice(0, targets[difficulty]));
  const chosenIds = new Set(chosen.map(question => String(question._id)));
  chosen.push(...shuffle(pool.filter(question => !chosenIds.has(String(question._id)))).slice(0, Math.max(0, count - chosen.length)));
  return shuffle(chosen).slice(0, count);
}

export async function createAptitudeAttempt(input: { userId: string; sections: AptitudeCategory[]; questionCount: number; durationMinutes: number; difficulty: AptitudeDifficulty | "mixed"; topic?: string }) {
  await ensureAptitudeQuestionBank();
  const recent = await AptitudeAttempt.find({ studentId: input.userId }).sort({ createdAt: -1 }).limit(3).select("questionIds").lean();
  const recentIds = new Set(recent.flatMap(attempt => attempt.questionIds.map(id => id.toString())));
  const query: Record<string, unknown> = { isActive: true, category: { $in: input.sections } };
  if (input.topic) query.topic = input.topic;
  if (input.difficulty !== "mixed") query.difficulty = input.difficulty;
  const all = await AptitudeQuestion.find(query).lean() as unknown as PlainQuestion[];
  if (!all.length) throw new Error("No active questions match this practice setup.");
  const fresh = all.filter(question => !recentIds.has(String(question._id)));
  const pool = fresh.length >= Math.min(input.questionCount, all.length) ? fresh : all;
  const selected = input.difficulty === "mixed" ? sampleMixedDifficulty(pool, input.questionCount) : shuffle(pool).slice(0, input.questionCount);
  const attempt = await AptitudeAttempt.create({
    studentId: input.userId,
    sections: [...new Set(selected.map(question => question.category))],
    questionIds: selected.map(question => new mongoose.Types.ObjectId(String(question._id))),
    responses: [],
    startedAt: new Date(),
    durationSeconds: input.durationMinutes * 60,
    status: "in_progress",
    mode: input.topic ? "focused" : "balanced",
    focusTopic: input.topic ?? "",
  });
  return getAttemptPayload(attempt.id, input.userId, false);
}

export function publicQuestion(question: PlainQuestion, includeAnswers: boolean) {
  const testCases = question.testCases ?? [];
  const starterCode = question.starterCode instanceof Map ? Object.fromEntries(question.starterCode) : question.starterCode ?? {};
  return {
    _id: String(question._id), category: question.category, topic: question.topic, difficulty: question.difficulty,
    prompt: question.prompt, options: question.options ?? [], starterCode,
    testCases: testCases.filter(testCase => !testCase.hidden).map(({ input, expectedOutput }) => ({ input, expectedOutput })),
    testCaseCount: testCases.length, timeLimitSeconds: question.timeLimitSeconds ?? 120, tags: question.tags ?? [],
    ...(includeAnswers ? { correctOptionIndex: question.correctOptionIndex, explanation: question.explanation ?? "" } : {}),
  };
}

export async function getAttemptPayload(attemptId: string, userId: string, forceAnswers?: boolean) {
  const attempt = await AptitudeAttempt.findOne({ _id: attemptId, studentId: userId });
  if (!attempt) return null;
  const questions = await AptitudeQuestion.find({ _id: { $in: attempt.questionIds } }).lean() as unknown as PlainQuestion[];
  const byId = new Map(questions.map(question => [String(question._id), question]));
  const ordered = attempt.questionIds.map(id => byId.get(id.toString())).filter(Boolean) as PlainQuestion[];
  return {
    attempt: attempt.toObject({ flattenMaps: true }),
    questions: ordered.map(question => publicQuestion(question, forceAnswers ?? attempt.status === "completed")),
  };
}

export async function saveAttemptResponse(input: { attemptId: string; userId: string; questionId: string; selectedOptionIndex?: number; codeSubmission?: { language: string; code: string }; timeSpentSeconds: number }) {
  const attempt = await AptitudeAttempt.findOne({ _id: input.attemptId, studentId: input.userId, status: "in_progress" });
  if (!attempt) throw new Error("This practice attempt is no longer active.");
  if (!attempt.questionIds.some(id => id.toString() === input.questionId)) throw new Error("That question is not part of this attempt.");
  const responses = attempt.responses.map(response => response.toObject()) as Array<Record<string, unknown>>;
  const next = { questionId: input.questionId, selectedOptionIndex: input.selectedOptionIndex, codeSubmission: input.codeSubmission, isCorrect: false, awardedFraction: 0, timeSpentSeconds: input.timeSpentSeconds };
  const existingIndex = responses.findIndex(response => String(response.questionId) === input.questionId);
  if (existingIndex >= 0) responses[existingIndex] = next;
  else responses.push(next);
  attempt.set("responses", responses);
  await attempt.save();
  return { saved: true, answeredCount: responses.length };
}

function scoreGroups(items: Array<{ category: string; topic: string; fraction: number }>) {
  const aggregate = (key: "category" | "topic") => Object.fromEntries([...new Set(items.map(item => item[key]))].map(value => {
    const relevant = items.filter(item => item[key] === value);
    return [value, Math.round(relevant.reduce((sum, item) => sum + item.fraction, 0) / relevant.length * 100)];
  }));
  return { scoreByCategory: aggregate("category"), scoreByTopic: aggregate("topic") };
}

export async function completeAptitudeAttempt(attemptId: string, userId: string) {
  const attempt = await AptitudeAttempt.findOne({ _id: attemptId, studentId: userId, status: "in_progress" });
  if (!attempt) throw new Error("This attempt has already been completed or abandoned.");
  const questions = await AptitudeQuestion.find({ _id: { $in: attempt.questionIds } }).lean() as unknown as PlainQuestion[];
  const responses = new Map(attempt.responses.map(response => [response.questionId.toString(), response.toObject()]));
  const scored = questions.map(question => {
    const questionId = String(question._id);
    const existing = responses.get(questionId) as { selectedOptionIndex?: number; codeSubmission?: unknown; awardedFraction?: number; timeSpentSeconds?: number } | undefined;
    const fraction = question.category === "coding" ? Math.max(0, Math.min(1, existing?.awardedFraction ?? 0)) : Number(existing?.selectedOptionIndex === question.correctOptionIndex);
    return { questionId, category: question.category, topic: question.topic, fraction, response: { questionId, selectedOptionIndex: existing?.selectedOptionIndex, codeSubmission: existing?.codeSubmission, isCorrect: fraction === 1, awardedFraction: fraction, timeSpentSeconds: existing?.timeSpentSeconds ?? 0 } };
  });
  const scoreTotal = Math.round(scored.reduce((sum, item) => sum + item.fraction, 0) / Math.max(1, scored.length) * 100);
  const groups = scoreGroups(scored);
  attempt.set({ responses: scored.map(item => item.response), scoreTotal, ...groups, completedAt: new Date(), status: "completed" });
  await attempt.save();
  const [payload, heatmap] = await Promise.all([getAttemptPayload(attemptId, userId, true), getWeakAreaHeatmap(userId)]);
  return { ...payload, heatmap };
}

export async function getWeakAreaHeatmap(userId: string) {
  return AptitudeAttempt.aggregate([
    { $match: { studentId: new mongoose.Types.ObjectId(userId), status: "completed" } },
    { $unwind: "$responses" },
    { $lookup: { from: "aptitudequestions", localField: "responses.questionId", foreignField: "_id", as: "question" } },
    { $unwind: "$question" },
    { $group: { _id: { topic: "$question.topic", category: "$question.category" }, score: { $avg: "$responses.awardedFraction" }, attempts: { $sum: 1 }, lastPractisedAt: { $max: "$completedAt" } } },
    { $project: { _id: 0, topic: "$_id.topic", category: "$_id.category", score: { $round: [{ $multiply: ["$score", 100] }, 0] }, attempts: 1, lastPractisedAt: 1 } },
    { $sort: { score: 1, attempts: -1 } },
  ]);
}

export async function getAptitudeSummary(userId: string) {
  await ensureAptitudeQuestionBank();
  const currentBankStatus = await getDynamicQuestionBankStatus();
  const needsRefresh = !currentBankStatus.lastDynamicRefreshAt || Date.now() - new Date(currentBankStatus.lastDynamicRefreshAt).getTime() >= 7 * 24 * 60 * 60 * 1000;
  if (needsRefresh) void refreshDynamicAptitudeQuestionBank(false).catch(error => console.error("Dynamic aptitude refresh failed:", error instanceof Error ? error.message : error));
  const [attempts, inProgress, heatmap, counts] = await Promise.all([
    AptitudeAttempt.find({ studentId: userId, status: "completed" }).sort({ completedAt: -1 }).limit(8).select("scoreTotal scoreByCategory scoreByTopic sections completedAt mode focusTopic questionIds").lean({ flattenMaps: true }),
    AptitudeAttempt.findOne({ studentId: userId, status: "in_progress" }).sort({ createdAt: -1 }).select("sections startedAt durationSeconds questionIds mode focusTopic").lean(),
    getWeakAreaHeatmap(userId),
    AptitudeQuestion.aggregate([{ $match: { isActive: true } }, { $group: { _id: "$category", count: { $sum: 1 } } }]),
  ]);
  return { attempts, inProgress, heatmap, questionCounts: Object.fromEntries(counts.map(item => [item._id, item.count])), codingAvailable: Boolean(env.JUDGE0_ENDPOINT), ...currentBankStatus, dynamicRefreshWarning: "" };
}

export async function forceRefreshDynamicQuestionBank() {
  await ensureAptitudeQuestionBank();
  await refreshDynamicAptitudeQuestionBank(true);
  return getDynamicQuestionBankStatus();
}

const languageIds: Record<string, number> = { javascript: 63, python: 71, java: 62, cpp: 54 };

async function judgeOne(code: string, language: string, testCase: { input: string; expectedOutput: string }) {
  if (!env.JUDGE0_ENDPOINT) throw new Error("Coding practice requires JUDGE0_ENDPOINT. MCQ practice remains available.");
  const response = await fetch(`${env.JUDGE0_ENDPOINT.replace(/\/$/, "")}/submissions?base64_encoded=true&wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(env.JUDGE0_API_KEY ? { "X-RapidAPI-Key": env.JUDGE0_API_KEY } : {}) },
    body: JSON.stringify({ language_id: languageIds[language], source_code: Buffer.from(code).toString("base64"), stdin: Buffer.from(testCase.input).toString("base64"), expected_output: Buffer.from(testCase.expectedOutput).toString("base64") }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Judge0 rejected the submission (${response.status}).`);
  const payload = await response.json() as { status?: { id?: number; description?: string }; stdout?: string; stderr?: string; compile_output?: string };
  return { passed: payload.status?.id === 3, status: payload.status?.description ?? "Unknown", output: payload.stdout ? Buffer.from(payload.stdout, "base64").toString().trim() : "", error: payload.stderr || payload.compile_output ? Buffer.from(payload.stderr ?? payload.compile_output ?? "", "base64").toString().slice(0, 500) : "" };
}

export async function runCodingQuestion(input: { questionId: string; language: string; code: string; visibleOnly: boolean }) {
  const question = await AptitudeQuestion.findById(input.questionId).lean() as unknown as PlainQuestion | null;
  if (!question || question.category !== "coding") throw new Error("That coding question was not found.");
  if (!languageIds[input.language]) throw new Error("Choose a supported language.");
  const cases = (question.testCases ?? []).filter(testCase => !input.visibleOnly || !testCase.hidden);
  const results = [];
  for (const testCase of cases) results.push(await judgeOne(input.code, input.language, testCase));
  return { passed: results.filter(result => result.passed).length, total: results.length, results: input.visibleOnly ? results : results.map(result => ({ passed: result.passed, status: result.status })) };
}

export async function gradeCodingAndCompleteAttempt(attemptId: string, userId: string) {
  const attempt = await AptitudeAttempt.findOne({ _id: attemptId, studentId: userId, status: "in_progress" });
  if (!attempt) throw new Error("This attempt is no longer active.");
  const questions = await AptitudeQuestion.find({ _id: { $in: attempt.questionIds }, category: "coding" }).lean() as unknown as PlainQuestion[];
  const responses = attempt.responses.map(response => response.toObject()) as Array<Record<string, unknown>>;
  for (const question of questions) {
    const response = responses.find(item => String(item.questionId) === String(question._id));
    const submission = response?.codeSubmission as { language?: string; code?: string } | undefined;
    if (!response || !submission?.language || !submission.code) continue;
    const result = await runCodingQuestion({ questionId: String(question._id), language: submission.language, code: submission.code, visibleOnly: false });
    response.awardedFraction = result.total ? result.passed / result.total : 0;
    response.isCorrect = result.passed === result.total && result.total > 0;
  }
  attempt.set("responses", responses);
  await attempt.save();
  return completeAptitudeAttempt(attemptId, userId);
}
