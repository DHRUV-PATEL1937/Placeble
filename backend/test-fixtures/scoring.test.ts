import { test } from 'node:test';
import assert from 'node:assert/strict';
const s = await import('../src/services/scoring');

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

test('interview answer: weights, filler penalty and short-answer caps', () => {
  assert.equal(s.interviewTurnScore({ structure: 8, relevance: 8, specificity: 8 }, words(80)), 8);
  assert.equal(s.interviewTurnScore({ structure: 8, relevance: 8, specificity: 8, fillerWordRate: 8 }, words(80)), 7.3);
  assert.equal(s.interviewTurnScore({ structure: 9, relevance: 9, specificity: 9 }, words(10)), 3);
  assert.equal(s.interviewTurnScore({ structure: 9, relevance: 9, specificity: 9 }, words(30)), 6);
  assert.equal(s.interviewTurnScore({ structure: NaN, relevance: 99, specificity: -4 }, words(80)), 4);
});

test('interview overall: ending early costs up to half', () => {
  const turn = { scores: { structure: 8, relevance: 8, specificity: 8, fillerWordRate: 0 }, answerTranscript: words(80) };
  assert.equal(s.interviewOverallScore([turn, turn, turn, turn], 4), 80);
  assert.equal(s.interviewOverallScore([turn, turn], 4), 60);
  assert.equal(s.interviewOverallScore([], 4), 0);
});

test('group discussion: participation caps and penalties', () => {
  const metrics = { clarity: 8, confidence: 8, leadership: 8, relevance: 8 };
  assert.equal(s.gdSessionScore(metrics, { speakingTimeShare: 0.25, interruptionCount: 0 }, [words(40), words(40), words(40)]), 80);
  assert.equal(s.gdSessionScore(metrics, { speakingTimeShare: 0.25 }, [words(100)]), 45);
  assert.equal(s.gdSessionScore(metrics, { speakingTimeShare: 0.25 }, [words(10), words(10), words(10)]), 40);
  assert.equal(s.gdSessionScore(metrics, { speakingTimeShare: 0.7, interruptionCount: 3 }, [words(40), words(40), words(40)]), 66);
  assert.equal(s.gdSessionScore(metrics, { speakingTimeShare: 0 }, [words(40), words(40), words(40)]), 80);
});

test('aptitude: short drills and older attempts count less', () => {
  assert.equal(s.aptitudeTestScore([{ scoreTotal: 100, questionCount: 5 }, { scoreTotal: 50, questionCount: 30 }]), 71);
  assert.equal(s.aptitudeTestScore([{ scoreTotal: 70, questionCount: 10 }]), 70);
  assert.equal(s.aptitudeTestScore([]), 0);
});

test('coding: points by difficulty, capped at 100', () => {
  assert.equal(s.codingScore(['easy', 'medium', 'hard']), 31);
  assert.equal(s.codingScore(Array(10).fill('hard')), 100);
  assert.equal(s.codingScore([undefined]), 10);
});

test('resume: job fit plus completeness', () => {
  assert.equal(s.resumeAtsScore(90, 92), 93);
  assert.equal(s.resumeAtsScore(90, 20), 73);
});

test('case study: computed from criteria, capped when answers are missing', () => {
  const criteria = { structure: 8, analysis: 8, recommendation: 8, communication: 8 };
  assert.equal(s.caseStudyScore(criteria, [words(60), words(60), words(60)]), 80);
  assert.equal(s.caseStudyScore(criteria, [words(60), words(60), '']), 75);
  assert.equal(s.caseStudyScore(criteria, [words(20), words(20), words(20)]), 35);
});

test('HR simulator: score and verdict always agree', () => {
  const score = s.hrSimScore({ decisionMaking: 90, problemSolving: 80, policyAwareness: 80, empathy: 70, communication: 70 });
  assert.equal(score, 80);
  assert.equal(s.hrVerdict(score), 'Good decisions');
  assert.equal(s.hrVerdict(40), 'Poor handling');
});

test('overall readiness: required parts count at zero, weakest part holds it back', () => {
  const req = (value: number, weight = 25) => ({ value, weight, required: true });
  assert.equal(s.overallReadiness([req(80), req(80), req(80), req(80)]), 80);
  assert.equal(s.overallReadiness([req(80, 33), req(80, 33), req(0, 34)]), 45);
  assert.equal(s.overallReadiness([req(80), req(80), req(80), req(0)]), 51);
  // Optional extras only add when given, and never set the weakest part.
  assert.equal(s.overallReadiness([req(80), req(80), req(80), req(80), { value: 0, weight: 10, required: false }]), 74);
  assert.equal(s.overallReadiness([req(80), { value: 100, weight: 0, required: false }]), 80);
  assert.equal(s.overallReadiness([]), 0);
});

test('weight shares always add up to 100', () => {
  assert.deepEqual(s.weightShares([{ key: 'a', weight: 1 }, { key: 'b', weight: 1 }, { key: 'c', weight: 1 }]), { a: 34, b: 33, c: 33 });
  assert.deepEqual(s.weightShares([{ key: 'a', weight: 30 }, { key: 'b', weight: 10 }, { key: 'c', weight: 0 }]), { a: 75, b: 25 });
  assert.deepEqual(s.weightShares([]), {});
});

test('career activity has diminishing returns', () => {
  assert.equal(s.careerActivityScore(0, 0), 0);
  assert.equal(s.careerActivityScore(1, 0), 22);
  assert.ok(s.careerActivityScore(40, 0) <= 100);
  assert.ok(s.careerActivityScore(2, 2) > s.careerActivityScore(4, 0));
});
