import { z } from "zod";
import { env } from "../config/env";
import { RUBRIC_ANCHORS_10 } from "./scoring";

const scoreOutputSchema = z.object({
  structure: z.object({ score: z.number().min(0).max(10), note: z.string().min(10).transform(value => value.slice(0, 500)) }),
  relevance: z.object({ score: z.number().min(0).max(10), note: z.string().min(10).transform(value => value.slice(0, 500)) }),
  specificity: z.object({ score: z.number().min(0).max(10), note: z.string().min(10).transform(value => value.slice(0, 500)) }),
  feedback: z.string().min(20).transform(value => value.slice(0, 900)),
  nextQuestion: z.string().min(15).transform(value => value.slice(0, 800)),
});

export function parseInterviewTurnScore(raw: unknown, finalTurn: boolean) {
  // There is no next question after the final answer. Do not reject valid
  // scores just because the provider returned an empty closing question.
  const value = finalTurn && raw && typeof raw === "object" ? { ...raw, nextQuestion: "Thank you for completing this interview." } : raw;
  return scoreOutputSchema.parse(value);
}

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
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callStructuredAiOnce(prompt, schema, schemaName);
      const clean = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      // Validate before returning: providers occasionally truncate an otherwise
      // successful response. Retry that request rather than losing the answer.
      const parsed: unknown = JSON.parse(clean);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new SyntaxError("Expected a JSON object");
      return JSON.stringify(parsed);
    } catch (error) {
      const malformed = error instanceof SyntaxError || (error instanceof Error && /empty.*response/i.test(error.message));
      if (!malformed) throw error;
      if (attempt === 1) throw new Error("The interview reviewer returned an incomplete response. Your recording is preserved. Please retry your saved answer.");
    }
  }
  throw new Error("The interview response could not be read. Please retry your saved answer.");
}

async function callStructuredAiOnce(prompt: string, schema: object, schemaName: string) {
  if (env.AI_PROVIDER === "sarvam") {
    if (!env.SARVAM_API_KEY) throw new Error("Sarvam is selected, but SARVAM_API_KEY is not configured.");
    const response = await fetchWithRetry("https://api.sarvam.ai/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.SARVAM_API_KEY}` },
      body: JSON.stringify({ model: env.SARVAM_MODEL, messages: [{ role: "user", content: prompt }], max_tokens: 4096, reasoning_effort: null, response_format: { type: "json_schema", json_schema: { name: schemaName, schema, strict: true } } }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) throw new Error(await providerError(response));
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("Sarvam returned an empty interview response.");
    return text;
  }
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
  if (env.AI_PROVIDER === "sarvam") {
    if (!env.SARVAM_API_KEY) throw new Error("Sarvam is selected, but SARVAM_API_KEY is not configured.");
    const response = await fetchWithRetry("https://api.sarvam.ai/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.SARVAM_API_KEY}` },
      body: JSON.stringify({ model: env.SARVAM_MODEL, messages: [{ role: "user", content: prompt }], max_tokens: maxOutputTokens, temperature: .72, reasoning_effort: null }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) throw new Error(await providerError(response));
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("Sarvam returned an empty response.");
    return text;
  }
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
  if (env.AI_PROVIDER === "sarvam") {
    if (!env.SARVAM_API_KEY) throw new Error("SARVAM_API_KEY is required for voice answers when Sarvam is selected.");
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mimeType }), `answer.${mimeType.includes("ogg") ? "ogg" : "webm"}`);
    form.append("model", "saaras:v3");
    form.append("mode", "verbatim");
    form.append("language_code", "unknown");
    const response = await fetchWithRetry("https://api.sarvam.ai/speech-to-text", { method: "POST", headers: { "api-subscription-key": env.SARVAM_API_KEY }, body: form, signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(await providerError(response));
    const payload = await response.json() as { transcript?: string };
    if (!payload.transcript?.trim()) throw new Error("Sarvam could not hear enough of your answer. Please retry in a quieter space.");
    return payload.transcript.trim();
  }
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

export async function scoreTurnAndGenerateNext(input: { type: string; targetRole: string; turnNumber: number; totalTurns: number; question: string; transcript: string; resumeContext?: string; history: Array<{ question: string; answerTranscript: string; feedback: string }> }) {
  const typeGuidance: Record<string, string> = {
    hr: "Focus on motivation, communication, self-awareness, interests, and why this role fits. Progress from background to motivation to expectations.",
    technical: "Focus on the target role's practical skills, projects, decisions, trade-offs, debugging, and simple role-relevant fundamentals. Ask one focused technical question at a time.",
    behavioral: "Focus on evidence-led situations, actions, teamwork, ownership, setbacks, and outcomes. Use natural STAR-style follow-ups without naming the framework every time.",
    mixed: "Blend the interview naturally: start with fit, then one role-relevant project or skill, then one behavior or learning question. Do not ask the same style twice in a row.",
  };
  const previousQuestions = input.history.map(turn => turn.question);
  const prompt = `You are Placeble's calm, conversational mock interviewer. Score the student's completed answer and generate the single next interview question in ONE response.

Interview: ${input.type}; target role: ${input.targetRole || "general graduate role"}; turn ${input.turnNumber} of ${input.totalTurns}.
The target role above is the student's selected role and is authoritative. Never substitute a resume role, preferred role, previous role, or another title for it. Every question must be about this selected target role.
Question: ${input.question}
Transcript: ${input.transcript}
Earlier turns: ${JSON.stringify(input.history.slice(-5))}
Interview guidance: ${typeGuidance[input.type] ?? typeGuidance.mixed}
Verified student context: ${input.resumeContext || "No resume context was available; ask about the student's stated experience without guessing."}

Fixed rubric (each 0-10): structure = clear logical or STAR-like shape; relevance = directly answers the question; specificity = concrete actions, reasoning, evidence and outcomes. ${RUBRIC_ANCHORS_10} A very short answer, or one that restates the question, cannot score above 3 on any criterion. Be supportive in tone and fair to an early-career student, but keep the numbers honest. Feedback must cite a specific strength and the most useful change; forbid vague praise such as "great job".
For nextQuestion, respond like a real interviewer who listened: use one detail from the transcript or ask the most useful next probe. Use plain language, ask for one clear example or explanation, avoid trick questions and deep specialist knowledge, respect the interview type, and never repeat or lightly rephrase an earlier question. Do not use generic prompts such as "tell me about yourself" after turn one. If the target role seems unrelated to the verified resume or preferred roles, ask a respectful clarification such as whether there is a specific reason the student is applying and what transferable experience connects them to it; never reject the role or make a judgment. If the target role is unusually specific, mention it naturally and ask about motivation or fit. Earlier questions to avoid: ${JSON.stringify(previousQuestions)}. If this is the final turn, still return a short closing reflection question as nextQuestion; it will not be shown.`;
  const result = parseInterviewTurnScore(JSON.parse(await callStructuredAi(prompt, scoreJsonSchema)), input.turnNumber >= input.totalTurns);
  const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const nextNormalized = normalized(result.nextQuestion);
  const repeated = previousQuestions.some(question => normalized(question) === nextNormalized || normalized(question).includes(nextNormalized) || nextNormalized.includes(normalized(question)));
  if (repeated) {
    const fallback: Record<string, string[]> = {
      hr: ["What part of this kind of role would you most like to learn first, and why?", "What kind of team helps you do your best work?", "What is one goal you would set for your first few months in this role?"],
      technical: ["What was one decision you made in that project, and what made you choose it?", "How would you check that your solution is working correctly?", "What is one technical area you would like to strengthen for this role?"],
      behavioral: ["What did you personally do next, and what happened because of it?", "What would you do differently if you faced that situation again?", "How did you keep the work moving when something became difficult?"],
      mixed: ["What did you personally contribute to that project or experience?", "What is one skill you are building for this role, and how are you practising it?", "Tell me about a small setback and what you learned from it."],
    };
    result.nextQuestion = fallback[input.type]?.[(input.turnNumber - 1) % 3] ?? fallback.mixed[(input.turnNumber - 1) % 3];
  }
  return result;
}

export async function createInterviewDebrief(input: { type: string; targetRole: string; turns: unknown[] }) {
  const prompt = `You are Placeble's interview coach. Produce a session-level debrief for this ${input.type} interview targeting ${input.targetRole || "a general graduate role"}.
Turns: ${JSON.stringify(input.turns)}

The overall score is 0-100 and must reflect the full trajectory, not a simple arithmetic average. Note patterns across turns, improvement or decline, structure, relevance, specificity, and filler-word rate. Give earned, concrete feedback with two to four specific strengths and improvements. Never use generic praise.`;
  return debriefOutputSchema.parse(JSON.parse(await callStructuredAi(prompt, debriefJsonSchema)));
}

export async function generateInterviewOpeningQuestion(input: { targetRole: string; resumeContext: string }) {
  const selectedRole = input.targetRole.trim() || "Software Engineer";
  const contextText = input.resumeContext.toLowerCase();
  const roleWords = selectedRole.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 3 && !["with", "from", "role", "at", "the"].includes(word));
  const matchingWords = roleWords.filter(word => contextText.includes(word));
  const roleFitsResume = roleWords.length > 0 && matchingWords.length >= Math.max(1, Math.ceil(roleWords.length * 0.5));
  
  const prompt = `You are Alex Vance, the Lead People & Culture Sub-Agent opening a live virtual placement interview for the position: ${selectedRole}.
This is Turn 1 of a realistic live interview. Greet the candidate warmly and ask a natural, conversational opening introduction question tailored specifically to the ${selectedRole} role.
Candidate verified background context:
${input.resumeContext || "Early-career candidate."}

Guidelines:
1. Speak naturally as Alex from People & Culture.
2. Ask for a brief introduction of their journey, their passion for ${selectedRole}, and what motivated them to apply.
3. Keep it warm, engaging, and under 40 words.
4. Return ONLY the question text without quotes or preamble.
5. Every generation must feel unique and fresh.`;

  try {
    const result = (await callTextAi(prompt, 180)).replace(/^['"“”]+|['"“”]+$/g, "").trim();
    if (result.length >= 25 && !result.toLowerCase().includes("as an ai")) {
      return result.slice(0, 500);
    }
  } catch { /* fallback below ensures interview always starts reliably */ }

  const dynamicOpeners = [
    `Hi, welcome! I'm Alex from People & Culture. To kick off our session, could you walk us through your journey and what drew you specifically to this ${selectedRole} opportunity?`,
    `Welcome to the interview! Let's start with a brief introduction—tell us about yourself, your background, and the key projects that got you excited about becoming a ${selectedRole}.`,
    `Great to have you here today. To get us started, could you share a bit about yourself and what motivates you to pursue this ${selectedRole} position?`,
    `Hello and welcome to your interview! I'd love to start by learning about you—could you give us a quick overview of your experience and what made you choose the ${selectedRole} path?`,
    `Welcome! We're excited to speak with you today. To get things rolling, tell us about yourself and the experiences that best represent your readiness for this ${selectedRole} role.`
  ];
  return dynamicOpeners[Math.floor(Math.random() * dynamicOpeners.length)];
}
