import { Types } from "mongoose";
import { AgentResult, type agentResultKinds } from "../models/AgentResult";
import { recencyWeighted, score100 } from "./scoring";

/** A student's progress on one agent that keeps its results in AgentResult: totals plus the most recent runs, newest first. */
export async function agentResultHistory(studentId: string, agent: typeof agentResultKinds[number]) {
  if (!Types.ObjectId.isValid(studentId)) return { score: 0, attempts: 0, best: 0, average: 0, latest: null, recent: [] };
  const [all, recent] = await Promise.all([
    AgentResult.find({ studentId, agent }).select("score").lean(),
    AgentResult.find({ studentId, agent }).sort({ createdAt: -1 }).limit(10).select("score title detail createdAt").lean(),
  ]);
  const scores = all.map(item => item.score);
  return {
    // The agent's score: the same number the progress page and readiness use (last three results, newest counting most).
    score: score100(recencyWeighted(recent.slice(0, 3).map(item => item.score))),
    attempts: scores.length,
    best: scores.length ? Math.max(...scores) : 0,
    average: scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0,
    latest: recent[0]?.score ?? null,
    recent: recent.map(item => ({ score: item.score, title: item.title ?? "", detail: item.detail ?? "", createdAt: item.createdAt })),
  };
}
