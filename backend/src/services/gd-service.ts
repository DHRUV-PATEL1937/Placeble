import { randomUUID } from "node:crypto";
import { GdSession, gdPersonaKeys } from "../models/GdSession";
import { assertivePersona } from "./gd-persona-assertive";
import { analyticalPersona } from "./gd-persona-analytical";
import { bridgingPersona } from "./gd-persona-bridging";
import { generatePersonaSpeech, scoreGroupDiscussion } from "./gd-ai-service";

type PersonaKey = typeof gdPersonaKeys[number];
type GdJobKind = "gd:personaTurn" | "gd:scoreSession";
type GdJob = { id: string; userId: string; sessionId: string; kind: GdJobKind; status: "queued" | "processing" | "complete" | "failed"; progress: number; message: string; speakerKey?: PersonaKey; result?: unknown; error?: string };
const jobs = new Map<string, GdJob>();

export const GD_INTERRUPTION_RULE = "Push-to-talk immediately stops persona playback and invalidates any pending persona response. The interrupted persona is deferred and receives extra priority after the student finishes; their completed turn is never erased.";

export const gdTopics = [
  "Should AI tools be allowed in college assessments?",
  "Should companies prioritise skills over formal degrees?",
  "Is remote work better for early-career professionals?",
  "Can social media be a reliable source of news?",
  "Should sustainability targets outweigh short-term business growth?",
] as const;

const personaDefinitions = [assertivePersona, analyticalPersona, bridgingPersona] as const;
const positionSets = [
  ["Take the pro-change side: current systems are too slow and practical action matters more than perfect safeguards.", "Question both extremes: support change only when criteria, evidence, and measurable safeguards are clear.", "Support a balanced pilot: include affected groups, set boundaries, and revise the policy from real outcomes."],
  ["Argue against the fashionable consensus and insist on accountability, feasibility, and clear ownership.", "Separate the claim into outcomes, risks, and implementation; accept only the parts supported by sound reasoning.", "Find the workable middle that protects people while still allowing progress, and invite the student to refine it."],
  ["Argue firmly for the main proposition and push the group toward a decisive recommendation.", "Remain cautiously undecided until trade-offs and definitions are tested; challenge unsupported generalisations.", "Lean toward the proposition but prioritise inclusion, transition support, and a compromise the group can actually adopt."],
] as const;

function hashTopic(topic: string) { return [...topic].reduce((total, character) => total + character.charCodeAt(0), 0); }

function queueJob(userId: string, sessionId: string, kind: GdJobKind, message: string, task: (update: (progress: number, message: string) => void) => Promise<unknown>) {
  const job: GdJob = { id: randomUUID(), userId, sessionId, kind, status: "queued", progress: 8, message };
  jobs.set(job.id, job);
  setTimeout(() => {
    Object.assign(job, { status: "processing", progress: 22 });
    void task((progress, nextMessage) => Object.assign(job, { progress, message: nextMessage }))
      .then(result => Object.assign(job, { status: "complete", progress: 100, message: "Ready", result }))
      .catch(error => Object.assign(job, { status: "failed", progress: 100, message: "Needs attention", error: error instanceof Error ? error.message : "The discussion task failed." }));
  }, 80);
  return job;
}

export function getGdJob(id: string, userId: string) { const job = jobs.get(id); return job?.userId === userId ? job : null; }

export function publicGdSession(session: Record<string, unknown>) {
  return { ...session, personas: (session.personas as Array<Record<string, unknown>> ?? []).map(({ systemPrompt: _systemPrompt, ...persona }) => { void _systemPrompt; return persona; }) };
}

export async function createGdSession(input: { userId: string; topic: string; turnCap: number; durationMinutes: number }) {
  const positions = positionSets[hashTopic(input.topic) % positionSets.length];
  const personas = personaDefinitions.map((persona, index) => ({
    key: persona.key, name: persona.name, stance: persona.stance, avatarKey: persona.avatarKey, description: persona.description,
    topicPosition: positions[index], systemPrompt: persona.buildSystemPrompt(input.topic, positions[index]),
  }));
  const session = await GdSession.create({ studentId: input.userId, topic: input.topic, personas, status: "in_progress", startedAt: new Date(), orchestration: { revision: 0, processing: false, currentPersonaKey: "", deferredPersonaKey: "", turnCap: input.turnCap, endsAtMs: input.durationMinutes * 60_000 } });
  return session;
}

function decideNextPersona(session: { turns: Array<{ speaker: string; text: string }>; personas: Array<{ key: string; name: string }>; orchestration: { deferredPersonaKey?: string | null } }) {
  const lastTurn = session.turns.at(-1);
  const lastText = lastTurn?.speaker === "student" ? lastTurn.text.toLowerCase() : "";
  const scored = session.personas.map(persona => {
    let lastIndex = -1;
    for (let index = session.turns.length - 1; index >= 0; index -= 1) { if (session.turns[index].speaker === persona.key) { lastIndex = index; break; } }
    const turnsSince = lastIndex < 0 ? session.turns.length + 2 : session.turns.length - lastIndex;
    let score = Math.random() * 1.7 + Math.min(3, turnsSince * .42);
    if (session.orchestration.deferredPersonaKey === persona.key) score += 5;
    if (lastText.includes(persona.name.split(" ")[0].toLowerCase())) score += 4;
    if (lastTurn?.speaker === persona.key) score *= .18;
    if (!session.turns.length && persona.key === "persona_a") score += 2.2;
    return { key: persona.key as PersonaKey, score };
  });
  return scored.sort((left, right) => right.score - left.score)[0].key;
}

function speakerName(session: { personas: Array<{ key: string; name: string }> }, speaker: string) { return speaker === "student" ? "Student" : session.personas.find(persona => persona.key === speaker)?.name ?? speaker; }

export async function enqueuePersonaTurn(sessionId: string, userId: string) {
  const session = await GdSession.findOne({ _id: sessionId, studentId: userId, status: "in_progress" });
  if (!session) throw new Error("This discussion is no longer active.");
  if (session.orchestration.processing) throw new Error("A participant is already preparing a response.");
  const personaKey = decideNextPersona(session);
  const revision = session.orchestration.revision;
  session.orchestration.processing = true; session.orchestration.currentPersonaKey = personaKey;
  await session.save();
  const personaName = session.personas.find(persona => persona.key === personaKey)?.name ?? "A participant";
  const job = queueJob(userId, sessionId, "gd:personaTurn", `${personaName} is considering the discussion`, async update => {
    try {
      const snapshot = await GdSession.findOne({ _id: sessionId, studentId: userId });
      if (!snapshot || snapshot.status !== "in_progress") throw new Error("This discussion is no longer active.");
      const persona = snapshot.personas.find(item => item.key === personaKey);
      if (!persona) throw new Error("The selected discussion participant is unavailable.");
      update(38, `${persona.name} is forming a point`);
      const generated = await generatePersonaSpeech({ systemPrompt: persona.systemPrompt, personaName: persona.name, topic: snapshot.topic, transcript: snapshot.turns.map(turn => ({ speaker: speakerName(snapshot, turn.speaker), text: turn.text })) });
      update(82, `${persona.name} is ready to speak`);
      const latest = await GdSession.findOne({ _id: sessionId, studentId: userId });
      if (!latest || latest.status !== "in_progress" || latest.orchestration.revision !== revision) return { deferred: true, session: latest ? publicGdSession(latest.toObject() as unknown as Record<string, unknown>) : null };
      const timestampStart = Math.max(0, Date.now() - latest.startedAt.getTime());
      const estimatedDuration = Math.max(2400, Math.min(14_000, Math.round(generated.text.split(/\s+/).length / 2.55 * 1000)));
      latest.turns.push({ turnNumber: latest.turns.length + 1, speaker: personaKey, text: generated.text, audioUrl: "", timestampStart, timestampEnd: timestampStart + estimatedDuration, generationLatencyMs: generated.latencyMs });
      latest.orchestration.processing = false; latest.orchestration.currentPersonaKey = "";
      if (latest.orchestration.deferredPersonaKey === personaKey) latest.orchestration.deferredPersonaKey = "";
      await latest.save();
      const personaTurns = latest.turns.filter(turn => turn.speaker !== "student").length;
      const shouldEnd = personaTurns >= latest.orchestration.turnCap || timestampStart >= latest.orchestration.endsAtMs;
      return { deferred: false, session: publicGdSession(latest.toObject() as unknown as Record<string, unknown>), speakerKey: personaKey, latencyMs: generated.latencyMs, nextDelayMs: 1700 + Math.floor(Math.random() * 2300), shouldEnd };
    } catch (error) {
      await GdSession.updateOne({ _id: sessionId, studentId: userId, "orchestration.revision": revision }, { $set: { "orchestration.processing": false, "orchestration.currentPersonaKey": "" } });
      throw error;
    }
  });
  job.speakerKey = personaKey;
  return job;
}

export async function interruptPersona(sessionId: string, userId: string, duringPersonaPlayback: boolean) {
  const session = await GdSession.findOne({ _id: sessionId, studentId: userId, status: "in_progress" });
  if (!session) return null;
  const current = session.orchestration.currentPersonaKey;
  const lastPersona = [...session.turns].reverse().find(turn => turn.speaker !== "student")?.speaker;
  session.orchestration.revision += 1;
  session.orchestration.processing = false;
  session.orchestration.currentPersonaKey = "";
  session.orchestration.deferredPersonaKey = (current || (duringPersonaPlayback ? lastPersona : "") || "") as PersonaKey | "";
  await session.save();
  return session;
}

export async function addStudentTurn(input: { sessionId: string; userId: string; text: string; audioUrl: string; timestampStart: number; timestampEnd: number }) {
  const session = await GdSession.findOne({ _id: input.sessionId, studentId: input.userId, status: "in_progress" });
  if (!session) throw new Error("This discussion is no longer active.");
  const timestampStart = Math.max(0, Math.min(input.timestampStart, Date.now() - session.startedAt.getTime() + 5000));
  const timestampEnd = Math.max(timestampStart + 300, Math.min(input.timestampEnd, timestampStart + 180_000));
  session.turns.push({ turnNumber: session.turns.length + 1, speaker: "student", text: input.text, audioUrl: input.audioUrl, timestampStart, timestampEnd });
  await session.save();
  return session;
}

export function computeGdHeuristics(turns: Array<{ speaker: string; timestampStart: number; timestampEnd: number }>) {
  const ordered = [...turns].sort((left, right) => left.timestampStart - right.timestampStart);
  let interruptionCount = 0; let longestGap = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]; const current = ordered[index];
    if (current.timestampStart < previous.timestampEnd && current.speaker !== previous.speaker && (current.speaker === "student" || previous.speaker === "student")) interruptionCount += 1;
    longestGap = Math.max(longestGap, Math.max(0, current.timestampStart - previous.timestampEnd));
  }
  const firstStart = ordered[0]?.timestampStart ?? 0; const lastEnd = Math.max(...ordered.map(turn => turn.timestampEnd), firstStart + 1);
  const studentDuration = ordered.filter(turn => turn.speaker === "student").reduce((total, turn) => total + Math.max(0, turn.timestampEnd - turn.timestampStart), 0);
  return { interruptionCount, longestSilenceSeconds: Math.round(longestGap / 100) / 10, speakingTimeShare: Math.round(Math.min(1, studentDuration / Math.max(1, lastEnd - firstStart)) * 1000) / 1000 };
}

export async function enqueueSessionScore(sessionId: string, userId: string) {
  const session = await GdSession.findOne({ _id: sessionId, studentId: userId, status: "in_progress" });
  if (!session || !session.turns.some(turn => turn.speaker === "student")) throw new Error("Contribute at least once before ending the discussion.");
  session.orchestration.revision += 1; session.orchestration.processing = true; session.orchestration.currentPersonaKey = "";
  await session.save();
  return queueJob(userId, sessionId, "gd:scoreSession", "The Observer is reviewing the discussion", async update => {
    try {
      const current = await GdSession.findOne({ _id: sessionId, studentId: userId, status: "in_progress" });
      if (!current) throw new Error("This discussion is no longer available for scoring.");
      update(30, "Calculating speaking patterns from session timing");
      const heuristicFlags = computeGdHeuristics(current.turns.map(turn => ({ speaker: turn.speaker, timestampStart: turn.timestampStart, timestampEnd: turn.timestampEnd })));
      update(55, "The Observer is reviewing your contribution");
      const observer = await scoreGroupDiscussion({ topic: current.topic, transcript: current.turns.map(turn => ({ speaker: speakerName(current, turn.speaker), text: turn.text })) });
      Object.assign(current, { observerMetrics: { clarity: observer.clarity, confidence: observer.confidence, leadership: observer.leadership, relevance: observer.relevance }, heuristicFlags, observerFeedback: observer.feedback, observerStrengths: observer.strengths, observerImprovements: observer.improvements, status: "completed", completedAt: new Date() });
      current.orchestration.processing = false;
      await current.save();
      update(90, "Preparing your discussion scorecard");
      return { session: publicGdSession(current.toObject() as unknown as Record<string, unknown>) };
    } catch (error) {
      await GdSession.updateOne({ _id: sessionId, studentId: userId, status: "in_progress" }, { $set: { "orchestration.processing": false } });
      throw error;
    }
  });
}

export async function abandonGdSession(sessionId: string, userId: string) {
  return GdSession.findOneAndUpdate({ _id: sessionId, studentId: userId, status: "in_progress" }, { $set: { status: "abandoned", completedAt: new Date(), "orchestration.processing": false, "orchestration.currentPersonaKey": "" }, $inc: { "orchestration.revision": 1 } }, { new: true });
}

export async function getGdSummary(userId: string) {
  const [active, completed, abandoned] = await Promise.all([
    GdSession.findOne({ studentId: userId, status: "in_progress" }).sort({ updatedAt: -1 }).lean(),
    GdSession.find({ studentId: userId, status: "completed" }).sort({ completedAt: -1 }).limit(8).lean(),
    GdSession.find({ studentId: userId, status: "abandoned" }).sort({ completedAt: -1 }).limit(3).lean(),
  ]);
  return { active: active ? publicGdSession(active as unknown as Record<string, unknown>) : null, completed: completed.map(item => publicGdSession(item as unknown as Record<string, unknown>)), abandoned: abandoned.map(item => publicGdSession(item as unknown as Record<string, unknown>)), topics: gdTopics, interruptionRule: GD_INTERRUPTION_RULE, voiceMode: "shared-browser-tts", transcriptionMode: "shared-server-stt" };
}
