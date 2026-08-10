import { z } from "zod";
import { callStructuredAi, callTextAi } from "./interview-ai-service";

const observerSchema = z.object({
  clarity: z.number().min(0).max(10),
  confidence: z.number().min(0).max(10),
  leadership: z.number().min(0).max(10),
  relevance: z.number().min(0).max(10),
  feedback: z.string().min(60).max(1800),
  strengths: z.array(z.string().min(12).max(280)).min(2).max(3),
  improvements: z.array(z.string().min(12).max(280)).min(2).max(3),
});

const observerJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["clarity", "confidence", "leadership", "relevance", "feedback", "strengths", "improvements"],
  properties: {
    clarity: { type: "number", minimum: 0, maximum: 10 }, confidence: { type: "number", minimum: 0, maximum: 10 },
    leadership: { type: "number", minimum: 0, maximum: 10 }, relevance: { type: "number", minimum: 0, maximum: 10 },
    feedback: { type: "string" },
    strengths: { type: "array", minItems: 2, maxItems: 3, items: { type: "string" } },
    improvements: { type: "array", minItems: 2, maxItems: 3, items: { type: "string" } },
  },
} as const;

type TranscriptTurn = { speaker: string; text: string };

export async function generatePersonaSpeech(input: { systemPrompt: string; personaName: string; topic: string; transcript: TranscriptTurn[] }) {
  const recentTranscript = input.transcript.slice(-14).map(turn => `${turn.speaker}: ${turn.text}`).join("\n") || "The discussion has not begun yet.";
  const prompt = `${input.systemPrompt}

Running transcript:
${recentTranscript}

Respond now as ${input.personaName}. Engage the most recent point rather than repeating an opening statement.`;
  const started = Date.now();
  const raw = await callTextAi(prompt, 240);
  const text = raw.replace(/^(["“]|\*+)?[^:\n]{1,30}:\s*/, "").replace(/^["“]|["”]$/g, "").trim().slice(0, 1300);
  if (text.length < 20) throw new Error(`${input.personaName} did not return a usable discussion turn.`);
  return { text, latencyMs: Date.now() - started };
}

export async function scoreGroupDiscussion(input: { topic: string; transcript: TranscriptTurn[] }) {
  const prompt = `You are Placeble's silent Group Discussion Observer. You were never a participant and must evaluate only once, now that the session has ended.

Topic: ${input.topic}
Full transcript:
${input.transcript.map(turn => `${turn.speaker}: ${turn.text}`).join("\n")}

Score only the student's participation from 0 to 10 on:
- clarity: ideas are understandable and logically expressed;
- confidence: points are stated directly without excessive hedging;
- leadership: the student advances, reframes, includes others, or manages disagreement constructively;
- relevance: contributions respond to the topic and preceding discussion.

Be exacting and evidence-based. Feedback must cite concrete moments from the student's turns, synthesize the overall pattern, and give the highest-leverage next step. Do not judge interruption count, silence, or speaking share; those are calculated separately from timestamps. Return structured JSON only.`;
  return observerSchema.parse(JSON.parse(await callStructuredAi(prompt, observerJsonSchema, "gd_observer_score")));
}
