import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnswerActivity, observeAnswerTranscript, observeAnswerAudio, answerSilenceRemaining } from '../src/services/interview-silence.ts';

test('quiet transcribed speech submits at six seconds, not five', () => {
  const state = createAnswerActivity();
  observeAnswerTranscript(state, 'My answer', 1000);
  assert.equal(answerSilenceRemaining(state, 6000), 1000);
  assert.equal(answerSilenceRemaining(state, 7000), 0);
});
test('new speech resets the countdown', () => {
  const state = createAnswerActivity();
  observeAnswerTranscript(state, 'My answer', 1000);
  observeAnswerTranscript(state, 'My answer continues', 5500);
  assert.equal(answerSilenceRemaining(state, 7000), 4500);
  assert.equal(answerSilenceRemaining(state, 11500), 0);
});
test('background audio and duplicate caption events cannot indefinitely delay submission', () => {
  const state = createAnswerActivity();
  observeAnswerTranscript(state, 'Answer', 1000);
  observeAnswerAudio(state, 0.5, 6000);
  observeAnswerTranscript(state, 'Answer', 6500);
  assert.equal(answerSilenceRemaining(state, 7000), 0);
});
test('no empty answer is automatically submitted', () => {
  const state = createAnswerActivity();
  observeAnswerAudio(state, 0, 1000);
  observeAnswerTranscript(state, ' ', 2000);
  assert.equal(answerSilenceRemaining(state, 12000), null);
});
test('audio-only speech arms the fallback and continuing speech resets it', () => {
  const state = createAnswerActivity();
  observeAnswerAudio(state, 0.1, 1000);
  observeAnswerAudio(state, 0.1, 1300);
  observeAnswerAudio(state, 0.1, 2000);
  observeAnswerAudio(state, 0, 2200);
  assert.equal(answerSilenceRemaining(state, 7000), 1000);
  assert.equal(answerSilenceRemaining(state, 8000), 0);
});
test('brief clicks do not count as an answer', () => {
  const state = createAnswerActivity();
  observeAnswerAudio(state, 0.1, 1000);
  observeAnswerAudio(state, 0, 1100);
  assert.equal(answerSilenceRemaining(state, 8000), null);
});
