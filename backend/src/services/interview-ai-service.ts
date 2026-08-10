import { z } from "zod";
import { env } from "../config/env";

const scoreOutputSchema = z.object({
  structure: z.object({ score: z.number().min(0).max(10), note: z.string().min(10).transform(value => value.slice(0, 500)) }),
  relevance: z.object({ score: z.number().min(0).max(10), note: z.string().min(10).transform(value => value.slice(0, 500)) }),
  specificity: z.object({ score: z.number().min(0).max(10), note: z.string().min(10).transform(value => value.slice(0, 500)) }),
  feedback: z.string().min(20).transform(value => value.slice(0, 900)),
  nextQuestion: z.string().min(15).transform(value => value.slice(0, 800)),
});

const debriefOutputSchema = z.object({
  overallScore: z.number().min(0).max(100),
  overallFeedback: z.string().min(50).transform(value => value.slice(0, 1800)),
  strengths: z.array(z.string().min(10).transform(value => value.slice(0, 300))).min(2).max(4),
  improvements: z.array(z.string().min(10).transform(value => value.slice(0, 300))).min(2).max(4),
});

const scoreJsonSchema = {
  type: "object", required: ["structure", "relevance", "specificity", "feedback", "nextQuestion"],
  properties: {
    structure: { type: "object", required: ["score", "note"], properties: { score: { type: "number", minimum: 0, maximum: 10 }, note: { type: "string" } } },
    relevance: { type: "object", required: ["score", "note"], properties: { score: { type: "number", minimum: 0, maximum: 10 }, note: { type: "string" } } },
    specificity: { type: "object", required: ["score", "note"], properties: { score: { type: "number", minimum: 0, maximum: 10 }, note: { type: "string" } } },
    feedback: { type: "string" }, nextQuestion: { type: "string" },
  },
} as const;

const debriefJsonSchema = {
  type: "object", required: ["overallScore", "overallFeedback", "strengths", "improvements"],
  properties: {
    overallScore: { type: "number", minimum: 0, maximum: 100 }, overallFeedback: { type: "string" },
    strengths: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
    improvements: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
  },
} as const;

async function providerError(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  return payload?.error?.message?.slice(0, 300) ?? `AI provider request failed (${response.status}).`;
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3) {
  let response: Response | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    response = await fetch(url, init);
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === attempts - 1) return response;
    await new Promise(resolve => setTimeout(resolve, 1200 * (attempt + 1)));
  }
  return response!;
}

export async function callStructuredAi(prompt: string, schema: object, schemaName = "interview_result") {
  if (env.AI_PROVIDER === "openai") {
    if (!env.OPENAI_API_KEY) throw new Error("OpenAI is selected, but OPENAI_API_KEY is not configured.");
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: env.OPENAI_MODEL, input: prompt, text: { format: { type: "json_schema", name: schemaName, strict: true, schema } } }),
      signal: AbortSignal.timeout(70_000),
    });
    if (!response.ok) throw new Error(await providerError(response));
    const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
    const text = payload.output_text ?? payload.output?.flatMap(item => item.content ?? []).find(item => item.type === "output_text")?.text;
    if (!text) throw new Error("The AI provider returned an empty interview response.");
    return text;
  }
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required for mock interview feedback.");
  const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } } }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(await providerError(response));
  const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty interview response.");
  return text;
}

export async function callTextAi(prompt: string, maxOutputTokens = 360) {
  if (env.AI_PROVIDER === "openai") {
    if (!env.OPENAI_API_KEY) throw new Error("OpenAI is selected, but OPENAI_API_KEY is not configured.");
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: env.OPENAI_MODEL, input: prompt, max_output_tokens: maxOutputTokens }), signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) throw new Error(await providerError(response));
    const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
    const text = payload.output_text ?? payload.output?.flatMap(item => item.content ?? []).find(item => item.type === "output_text")?.text;
    if (!text?.trim()) throw new Error("The AI provider returned an empty response.");
    return text.trim();
  }
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required for AI discussion turns.");
  const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens, temperature: .72, thinkingConfig: { thinkingBudget: 0 } } }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(await providerError(response));
  const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join(" ").trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

export async function transcribeInterviewRecording(buffer: Buffer, mimeType: string) {
  if (env.AI_PROVIDER === "openai") {
    if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for transcription when OpenAI is selected.");
    const form = new FormData();
    form.append("model", "gpt-4o-mini-transcribe");
    form.append("file", new Blob([buffer], { type: mimeType }), `answer.${mimeType.includes("mp4") ? "mp4" : "webm"}`);
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: form, signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(await providerError(response));
    const payload = await response.json() as { text?: string };
    if (!payload.text?.trim()) throw new Error("The recording could not be transcribed. Please retry in a quieter space.");
    return payload.text.trim();
  }
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required for interview transcription.");
  const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Transcribe this interview answer exactly as spoken. Return only the transcript, without labels or commentary." }, { inlineData: { mimeType, data: buffer.toString("base64") } }] }], generationConfig: { maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } } }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(await providerError(response));
  const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const transcript = payload.candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join(" ").trim();
  if (!transcript) throw new Error("The recording could not be transcribed. Please retry in a quieter space.");
  return transcript;
}

export const transcribeStudentRecording = transcribeInterviewRecording;

export function fillerWordRate(transcript: string) {
  const words = transcript.toLowerCase().match(/[a-z']+/g) ?? [];
  if (!words.length) return 0;
  const normalized = ` ${words.join(" ")} `;
  const phrases = ["um", "uh", "erm", "hmm", "like", "basically", "actually", "you know", "i mean", "sort of", "kind of"];
  const count = phrases.reduce((total, phrase) => total + (normalized.match(new RegExp(`\\s${phrase.replace(" ", "\\s+")}\\s`, "g"))?.length ?? 0), 0);
  return Math.round(count / words.length * 1000) / 10;
}

export async function scoreTurnAndGenerateNext(input: { type: string; targetRole: string; turnNumber: number; totalTurns: number; question: string; transcript: string; history: Array<{ question: string; answerTranscript: string; feedback: string }> }) {
  const prompt = `You are Placeble's calm, rigorous mock interviewer. Score the student's completed answer and generate the single next interview question in ONE response.

Interview: ${input.type}; target role: ${input.targetRole || "general graduate role"}; turn ${input.turnNumber} of ${input.totalTurns}.
Question: ${input.question}
Transcript: ${input.transcript}
Earlier turns: ${JSON.stringify(input.history.slice(-5))}

Fixed rubric (each 0-10): structure = clear logical or STAR-like shape; relevance = directly answers the question; specificity = concrete actions, reasoning, evidence and outcomes. Be exacting but fair. Feedback must cite a specific strength and the most useful change; forbid vague praise such as "great job". The next question must respect the interview type, feel like a natural interviewer follow-up, avoid repeating earlier questions, and be answerable by a student. If this is the final turn, still return a short closing reflection question as nextQuestion; it will not be shown.`;
  return scoreOutputSchema.parse(JSON.parse(await callStructuredAi(prompt, scoreJsonSchema)));
}

export async function createInterviewDebrief(input: { type: string; targetRole: string; turns: unknown[] }) {
  const prompt = `You are Placeble's interview coach. Produce a session-level debrief for this ${input.type} interview targeting ${input.targetRole || "a general graduate role"}.
Turns: ${JSON.stringify(input.turns)}

The overall score is 0-100 and must reflect the full trajectory, not a simple arithmetic average. Note patterns across turns, improvement or decline, structure, relevance, specificity, and filler-word rate. Give earned, concrete feedback with two to four specific strengths and improvements. Never use generic praise.`;
  return debriefOutputSchema.parse(JSON.parse(await callStructuredAi(prompt, debriefJsonSchema)));
}
