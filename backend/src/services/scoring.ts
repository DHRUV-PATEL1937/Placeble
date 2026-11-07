/**
 * Scoring rules shared by every agent and the overall readiness score.
 *
 * Every score here is computed in code. The AI reviewers grade the separate criteria and write the feedback,
 * but the final number is always worked out from those criteria with fixed weights, so it cannot disagree with them
 * and the same evidence always gives the same score.
 */

/** Keeps a value inside a range. NaN or Infinity (a malformed AI reply) becomes the minimum, never a free mark. */
export function bounded(value: number, min = 0, max = 100) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}

export const score100 = (value: number) => Math.round(bounded(value));
const oneDecimal = (value: number) => Math.round(value * 10) / 10;

export function wordCount(text: string) {
  return (text.match(/[\p{L}\p{N}']+/gu) ?? []).length;
}

/** Weighted mean of { key: value } using { key: weight }. Keys without a weight are ignored. */
export function weightedMean<K extends string>(values: Record<K, number>, weights: Record<K, number>) {
  let total = 0; let weightTotal = 0;
  for (const key of Object.keys(weights) as K[]) {
    total += bounded(Number(values[key]), 0, Number.POSITIVE_INFINITY) * weights[key];
    weightTotal += weights[key];
  }
  return weightTotal ? total / weightTotal : 0;
}

/**
 * Average where newer results count more. `values` is newest first; each older result counts `decay` times as much as the
 * one after it (0.6 gives 1, 0.6, 0.36). Optional `reliability` scales each result's weight too, for example by how many questions it had.
 */
export function recencyWeighted(values: number[], decay = 0.6, reliability?: number[]) {
  let total = 0; let weightTotal = 0;
  values.forEach((value, index) => {
    const weight = decay ** index * (reliability?.[index] ?? 1);
    total += bounded(value) * weight;
    weightTotal += weight;
  });
  return weightTotal ? total / weightTotal : 0;
}

/** The same anchors for every AI grader, so a 6 means the same thing in an interview, a discussion or a case. */
export const RUBRIC_ANCHORS_10 = "Calibrate every 0-10 rating to these anchors: 0-2 missing, off-topic or wrong; 3-4 attempted but vague or mostly generic; 5-6 adequate, answers the point with some support; 7-8 strong, specific and well reasoned with evidence; 9-10 exceptional, rare even among well-prepared candidates. Do not inflate: an answer with no concrete detail cannot score above 5 on specificity or analysis. Rate each criterion independently from the evidence in the student's own words.";
export const RUBRIC_ANCHORS_100 = "Calibrate every 0-100 rating to these anchors: 0-20 missing or harmful; 30-45 attempted but weak; 50-65 adequate; 70-85 strong and well judged; 90-100 exceptional and rare. Do not inflate, and rate each skill independently from what the student actually did.";

/* ------------------------------------------------------------------ Interview */

export const INTERVIEW_WEIGHTS = { relevance: 0.4, specificity: 0.35, structure: 0.25 } as const;

/**
 * One answer, out of 10. Relevance counts most, then specificity, then structure.
 * Filler words above 3% of the answer cost up to 1.5 points, and very short answers are capped
 * (under 20 words: 3/10, under 45 words: 6/10) however the reviewer graded them.
 */
export function interviewTurnScore(scores: { structure: number; relevance: number; specificity: number; fillerWordRate?: number }, transcript: string) {
  const base = weightedMean({ structure: bounded(scores.structure, 0, 10), relevance: bounded(scores.relevance, 0, 10), specificity: bounded(scores.specificity, 0, 10) }, INTERVIEW_WEIGHTS);
  const fillerPenalty = Math.min(1.5, Math.max(0, bounded(scores.fillerWordRate ?? 0) - 3) * 0.15);
  const words = wordCount(transcript);
  const cap = words < 20 ? 3 : words < 45 ? 6 : 10;
  return oneDecimal(bounded(Math.min(cap, base - fillerPenalty), 0, 10));
}

/**
 * The whole interview, out of 100: the average answer score, scaled by how much of the interview was completed.
 * Answering every question keeps the full score; ending halfway keeps 75% of it, so a single strong answer can't stand in for a full interview.
 */
export function interviewOverallScore(turns: Array<{ scores?: { structure?: number | null; relevance?: number | null; specificity?: number | null; fillerWordRate?: number | null } | null; answerTranscript?: string | null }>, totalTurns: number) {
  if (!turns.length) return 0;
  const perAnswer = turns.map(turn => interviewTurnScore({ structure: turn.scores?.structure ?? 0, relevance: turn.scores?.relevance ?? 0, specificity: turn.scores?.specificity ?? 0, fillerWordRate: turn.scores?.fillerWordRate ?? 0 }, turn.answerTranscript ?? ""));
  const average = perAnswer.reduce((sum, value) => sum + value, 0) / perAnswer.length;
  const completion = Math.min(1, turns.length / Math.max(1, totalTurns));
  return score100(average * 10 * (0.5 + 0.5 * completion));
}

/* ------------------------------------------------------------------ Group discussion */

export const GD_WEIGHTS = { relevance: 0.3, clarity: 0.25, leadership: 0.25, confidence: 0.2 } as const;

/**
 * The student's discussion score, out of 100. The Observer's four ratings (out of 10) are weighted, then adjusted for how the student took part:
 * one contribution caps the score at 45 and two at 70; under 60 words in total caps it at 40; speaking under 8% of the time costs 10 and
 * dominating over 55% costs 8; each interruption after the first costs 3 (up to 12).
 */
export function gdSessionScore(metrics: { clarity?: number | null; confidence?: number | null; leadership?: number | null; relevance?: number | null } | null | undefined, heuristics: { interruptionCount?: number | null; speakingTimeShare?: number | null } | null | undefined, studentTurns: string[]) {
  if (!metrics) return 0;
  const base = weightedMean({ clarity: bounded(metrics.clarity ?? 0, 0, 10), confidence: bounded(metrics.confidence ?? 0, 0, 10), leadership: bounded(metrics.leadership ?? 0, 0, 10), relevance: bounded(metrics.relevance ?? 0, 0, 10) }, GD_WEIGHTS) * 10;
  if (!base) return 0;
  const share = bounded(heuristics?.speakingTimeShare ?? 0, 0, 1);
  const interruptions = Math.max(0, Math.round(heuristics?.interruptionCount ?? 0));
  let adjusted = base;
  // A share of exactly 0 means timing wasn't recorded (older sessions), so it isn't treated as silence.
  if (share > 0 && share < 0.08) adjusted -= 10;
  if (share > 0.55) adjusted -= 8;
  adjusted -= Math.min(12, Math.max(0, interruptions - 1) * 3);
  const contributions = studentTurns.filter(turn => wordCount(turn) > 0).length;
  const words = studentTurns.reduce((sum, turn) => sum + wordCount(turn), 0);
  if (contributions && contributions < 2) adjusted = Math.min(adjusted, 45);
  else if (contributions === 2) adjusted = Math.min(adjusted, 70);
  if (contributions && words < 60) adjusted = Math.min(adjusted, 40);
  return score100(adjusted);
}

/* ------------------------------------------------------------------ Aptitude and coding */

/**
 * Aptitude test component from recent completed attempts (newest first). Newer attempts count more, and short drills count less than full tests:
 * a 5-question drill weighs a third, a 10-question test half and a 30-question test three quarters, so one lucky drill can't max the score.
 */
export function aptitudeTestScore(attempts: Array<{ scoreTotal?: number | null; questionCount?: number | null }>) {
  if (!attempts.length) return 0;
  const reliability = attempts.map(attempt => { const count = Math.max(1, attempt.questionCount ?? 10); return count / (count + 10); });
  return score100(recencyWeighted(attempts.map(attempt => attempt.scoreTotal ?? 0), 0.6, reliability));
}

export const CODING_POINTS = { easy: 6, medium: 10, hard: 15 } as const;

/** Coding practice, out of 100: each distinct problem solved earns points by difficulty (easy 6, medium 10, hard 15). */
export function codingScore(solvedDifficulties: Array<string | null | undefined>) {
  return score100(solvedDifficulties.reduce((sum, difficulty) => sum + (CODING_POINTS[difficulty as keyof typeof CODING_POINTS] ?? CODING_POINTS.medium), 0));
}

/**
 * For programmes without required coding: coding practice can only lift the aptitude score above the test score, never pull it down.
 */
export function aptitudeComponent(testScore: number, coding: number) {
  const test = score100(testScore);
  const practice = score100(coding);
  if (!practice) return test;
  if (!test) return practice;
  return score100(test * 0.7 + Math.max(test, practice) * 0.3);
}

/* ------------------------------------------------------------------ Resume */

/** With a target job: 75% fit to that job, 25% how complete the resume is (completeness is out of 92, so it is scaled to 100 first). */
export function resumeAtsScore(jobFit: number, completeness: number) {
  return Math.min(98, score100(bounded(jobFit) * 0.75 + bounded(completeness / 92 * 100) * 0.25));
}

/* ------------------------------------------------------------------ Case study */

export const CASE_WEIGHTS = { analysis: 0.3, recommendation: 0.3, structure: 0.25, communication: 0.15 } as const;

/**
 * Case study, out of 100, from the four criteria (out of 10). Each of the three questions left unanswered (under 15 words) lowers the ceiling by 25,
 * and under 80 words across all answers caps the score at 35.
 */
export function caseStudyScore(criteria: Record<keyof typeof CASE_WEIGHTS, number>, answers: string[]) {
  let value = weightedMean({ analysis: bounded(criteria.analysis, 0, 10), recommendation: bounded(criteria.recommendation, 0, 10), structure: bounded(criteria.structure, 0, 10), communication: bounded(criteria.communication, 0, 10) }, CASE_WEIGHTS) * 10;
  const unanswered = answers.filter(answer => wordCount(answer) < 15).length;
  value = Math.min(value, 100 - unanswered * 25);
  if (answers.reduce((sum, answer) => sum + wordCount(answer), 0) < 80) value = Math.min(value, 35);
  return score100(value);
}

/* ------------------------------------------------------------------ HR simulator */

export const HR_WEIGHTS = { decisionMaking: 0.3, problemSolving: 0.2, policyAwareness: 0.2, empathy: 0.15, communication: 0.15 } as const;

export function hrSimScore(skills: Record<keyof typeof HR_WEIGHTS, number>) {
  return score100(weightedMean(skills, HR_WEIGHTS));
}

/** The verdict follows the score, so it can never say "Excellent" next to a low number. */
export function hrVerdict(score: number) {
  return score >= 85 ? "Excellent handling" : score >= 70 ? "Good decisions" : score >= 50 ? "Needs improvement" : "Poor handling";
}

/* ------------------------------------------------------------------ Overall readiness */

export type ReadinessComponents = { resume: number; aptitude: number; interview: number; groupDiscussion: number; careerActivity: number; caseStudy: number; hrSimulation: number };

/**
 * Which agents count, and how much, is set per programme (see program-service: programAgents). Their weights are scaled to 100.
 * On top of those, career activity adds 10 once the student has applied somewhere.
 * Group discussion is switched off for now, so it adds nothing. Set GROUP_DISCUSSION_WEIGHT back to 15 to bring it back as an optional part.
 */
export const GROUP_DISCUSSION_WEIGHT = 0;
export const CAREER_ACTIVITY_WEIGHT = 10;

/** Applications and progress, with diminishing returns so mass-applying can't max it: 1 application ≈ 22, 4 ≈ 63, reaching interviews or offers counts 2.5x. */
export function careerActivityScore(activeApplications: number, progressedApplications: number) {
  const evidence = Math.max(0, activeApplications) + Math.max(0, progressedApplications) * 1.5;
  return score100(100 * (1 - Math.exp(-evidence / 4)));
}

/** Scales weights so they add up to 100, keeping whole numbers that still add up to exactly 100. */
export function weightShares<K extends string>(weights: Array<{ key: K; weight: number }>) {
  const usable = weights.filter(item => item.weight > 0);
  const total = usable.reduce((sum, item) => sum + item.weight, 0);
  if (!total) return {} as Record<K, number>;
  const exact = usable.map(item => ({ key: item.key, value: item.weight / total * 100 }));
  const shares = exact.map(item => ({ key: item.key, value: Math.floor(item.value), rest: item.value - Math.floor(item.value) }));
  let left = 100 - shares.reduce((sum, item) => sum + item.value, 0);
  for (const item of [...shares].sort((x, y) => y.rest - x.rest)) { if (left <= 0) break; item.value += 1; left -= 1; }
  return Object.fromEntries(shares.map(item => [item.key, item.value])) as Record<K, number>;
}

export type ReadinessPart = { value: number; weight: number; required: boolean };

/**
 * Overall readiness, out of 100, from the parts that count: the programme's scored agents (required, they count even at zero,
 * so skipping or failing one can't be hidden) plus optional extras that the student has used.
 * The result is 85% the weighted average and 15% the weakest required part, so one very weak area holds the overall score back.
 */
export function overallReadiness(parts: ReadinessPart[]) {
  const counted = parts.filter(part => part.weight > 0);
  const weightTotal = counted.reduce((sum, part) => sum + part.weight, 0);
  if (!weightTotal) return 0;
  const weighted = counted.reduce((sum, part) => sum + bounded(part.value) * part.weight, 0) / weightTotal;
  const required = counted.filter(part => part.required).map(part => bounded(part.value));
  const weakestRequired = required.length ? Math.min(...required) : weighted;
  return score100(weighted * 0.85 + weakestRequired * 0.15);
}
