import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.MONGODB_URI = 'mongodb://127.0.0.1/test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-000000000000000000000000';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-00000000000000000000000';
const { parseInterviewTurnScore } = await import('../src/services/interview-ai-service');
const { callStructuredAi } = await import('../src/services/interview-ai-service');
const valid = { structure: { score: 7, note: 'Clear structured answer.' }, relevance: { score: 8, note: 'Relevant to the question.' }, specificity: { score: 7, note: 'Includes concrete examples.' }, feedback: 'Your example was clear and relevant to this question.' };
test('final answer accepts empty or absent next question', () => {
  assert.equal(parseInterviewTurnScore({ ...valid, nextQuestion: '' }, true).structure.score, 7);
  assert.equal(parseInterviewTurnScore(valid, true).relevance.score, 8);
});
test('non-final answer still requires a valid next question', () => {
  assert.throws(() => parseInterviewTurnScore({ ...valid, nextQuestion: '' }, false));
});
test('final turn still validates actual scoring fields', () => {
  assert.throws(() => parseInterviewTurnScore({ ...valid, structure: { score: 99, note: 'Invalid score.' } }, true));
});
test('truncated provider JSON is automatically retried', async () => {
  const { env } = await import('../src/config/env');
  const saved = { provider: env.AI_PROVIDER, key: env.SARVAM_API_KEY, fetch: globalThis.fetch };
  env.AI_PROVIDER = 'sarvam';
  env.SARVAM_API_KEY = 'test-only-placeholder-key';
  let requests = 0;
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: ++requests === 1 ? '{"incomplete":' : '{"complete":true}' } }] });
  try {
    assert.deepEqual(JSON.parse(await callStructuredAi('test', {})), { complete: true });
    assert.equal(requests, 2);
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: '{"incomplete":' } }] });
    await assert.rejects(callStructuredAi('test', {}), /recording is preserved/);
  } finally { env.AI_PROVIDER = saved.provider; env.SARVAM_API_KEY = saved.key; globalThis.fetch = saved.fetch; }
});
