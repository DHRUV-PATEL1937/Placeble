import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { curatedCodingQuestions, CODING_LIBRARY_VERSION } from '../src/services/curated-coding-library';
import { AptitudeQuestion } from '../src/models/AptitudeQuestion';
import { CodingSubmission } from '../src/models/CodingSubmission';
import { CodingWorkspace } from '../src/models/CodingWorkspace';

process.env.MONGODB_URI = 'mongodb://127.0.0.1/coding-library-test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-000000000000000000000000';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-00000000000000000000000';
const service = await import('../src/services/coding-service');

test('curated library contracts, evaluation, and per-student persistence', async t => {
  const db = await MongoMemoryServer.create();
  await mongoose.connect(db.getUri());
  try {
    await t.test('all licensed exercises validate, retain exact large integers, and expose every operation', async () => {
      assert.ok(curatedCodingQuestions.length >= 50);
      assert.ok(new Set(curatedCodingQuestions.map(p => p.topic)).size >= 12);
      assert.equal(new Set(curatedCodingQuestions.map(p => p.seedKey)).size, curatedCodingQuestions.length);
      for (const problem of curatedCodingQuestions) {
        await new AptitudeQuestion(problem).validate();
        const all = new Set(problem.testCases.map(c => JSON.parse(c.input).operation));
        const visible = new Set(problem.testCases.filter(c => !c.hidden).map(c => JSON.parse(c.input).operation));
        assert.deepEqual(visible, all, problem.title + ' must illustrate every operation');
      }
      assert.equal(curatedCodingQuestions.find(p => p.title === 'Grains')!.testCases.at(-1)!.expectedOutput, '"18446744073709551615"');
    });
    const first = new mongoose.Types.ObjectId().toString();
    const second = new mongoose.Types.ObjectId().toString();
    await t.test('idempotent seeding and fixed catalog, without calling generation', async () => {
      await Promise.all([service.ensureCodingQuestionBank(), service.ensureCodingQuestionBank()]);
      assert.equal(await AptitudeQuestion.countDocuments({ generationBatchId: CODING_LIBRARY_VERSION }), curatedCodingQuestions.length);
      const catalog = await service.getCodingProblemsCatalog(first);
      assert.equal(catalog.problems.length, curatedCodingQuestions.length);
      assert.equal(catalog.stats.solved, 0);
    });
    const referencePrograms: Record<string, string> = {
      'Binary Search': 'const n = input.array.indexOf(input.value); return n < 0 ? {error:"value not in array"} : n;',
      'Flatten Array': 'return input.array.flat(Infinity).filter(x=>x!==null);',
      'Leap': 'return input.year%4===0 && (input.year%100!==0 || input.year%400===0);',
      'Matching Brackets': 'const stack=[];for(const ch of input.value){if("([{ ".trim().includes(ch))stack.push(ch);else if(")] }".replace(/ /g,"").includes(ch)){if(stack.pop()!==({")":"(","]":"[","}":"{"})[ch])return false;}}return !stack.length;',
      'Etl': 'const result={}; for(const [score,letters] of Object.entries(input.legacy)) for(const letter of letters)result[letter.toLowerCase()]=Number(score); return result;',
      'Grains': 'if(operation==="square" && (input.square<1||input.square>64))return {error:"square must be between 1 and 64"};const n=operation==="total"?(2n**64n)-1n:2n**BigInt(input.square-1);return n>BigInt(Number.MAX_SAFE_INTEGER)?n.toString():Number(n);',
    };
    await t.test('known solutions pass canonical cases; wrong answers and exceptions fail', async () => {
      for (const [title, body] of Object.entries(referencePrograms)) {
        const p = curatedCodingQuestions.find(p => p.title === title)!;
        const code = `const {operation,input}=JSON.parse(require('fs').readFileSync(0,'utf8'));function solve(){${body}}console.log(JSON.stringify(solve()));`;
        const report = await service.executeCodeAgainstCases({ code, language: 'javascript', testCases: p.testCases });
        assert.equal(report.allPassed, true, title + ': ' + JSON.stringify(report.results.filter(r => !r.passed)));
      }
      const report = await service.executeCodeAgainstCases({ language: 'javascript', code: 'throw new Error("invalid")', testCases: [{ input: '{}', expectedOutput: 'true' }] });
      assert.equal(report.allPassed, false);
      const wrong = await service.executeCodeAgainstCases({ language: 'javascript', code: 'console.log(false)', testCases: [{ input: '{}', expectedOutput: 'true' }] });
      assert.equal(wrong.allPassed, false);
    });
    const problem = await AptitudeQuestion.findOne({ title: 'Binary Search', generationBatchId: CODING_LIBRARY_VERSION }).orFail();
    await t.test('submissions persist their exact code and mask hidden-case details in the response', async () => {
      const code = 'console.log("incorrect")';
      const result = await service.submitFullSolution({ problemId: String(problem._id), userId: second, language: 'javascript', code });
      assert.equal(result.isAccepted, false);
      assert.equal((await CodingSubmission.findById(result.submissionId).orFail()).code, code);
      assert.equal(result.report.results.find(r => r.input === 'Hidden test case')?.expectedOutput, 'Hidden');
    });
    await t.test('AI evaluation cannot mark mismatched or missing outputs as accepted', async () => {
      const { env } = await import('../src/config/env');
      const previousKey = env.SARVAM_API_KEY;
      const originalFetch = globalThis.fetch;
      env.SARVAM_API_KEY = 'test-only-placeholder-key';
      globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ results: [{ passed: true, status: 'Accepted', actualOutput: 'false' }] }) } }] }), { status: 200 });
      try {
        const report = await service.executeCodeAgainstCases({ language: 'java', code: '// test code, never executed remotely', testCases: [{ input: '{}', expectedOutput: 'true' }, { input: '{}', expectedOutput: 'true' }] });
        assert.equal(report.passed, 0);
        assert.equal(report.allPassed, false);
      } finally { env.SARVAM_API_KEY = previousKey; globalThis.fetch = originalFetch; }
    });
    await t.test('Sarvam requests fit the Starter limit and return JSON without reasoning', async () => {
      const { env } = await import('../src/config/env');
      const oldKey = env.SARVAM_API_KEY;
      const oldFetch = globalThis.fetch;
      env.SARVAM_API_KEY = 'test-only-placeholder-key';
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        assert.ok(body.max_tokens <= 4096);
        assert.equal(body.reasoning_effort, null);
        assert.equal(body.response_format.type, 'json_object');
        return Response.json({ choices: [{ message: { content: JSON.stringify({ results: [{ actualOutput: '[1]', status: 'Accepted' }] }) } }] });
      };
      try {
        const result = await service.executeCodeAgainstCases({ language: 'cpp', code: 'int main() {}', testCases: [{ input: '{}', expectedOutput: '[1]' }] });
        assert.equal(result.allPassed, true);
      } finally { env.SARVAM_API_KEY = oldKey; globalThis.fetch = oldFetch; }
    });
    await t.test('provider outages do not save a failed submission', async () => {
      const { env } = await import('../src/config/env');
      const previous = [env.SARVAM_API_KEY, env.GEMINI_API_KEY, env.OPENAI_API_KEY];
      env.SARVAM_API_KEY = env.GEMINI_API_KEY = env.OPENAI_API_KEY = undefined;
      const before = await CodingSubmission.countDocuments();
      try {
        await assert.rejects(service.submitFullSolution({ userId: second, problemId: String(problem._id), language: 'cpp', code: 'int main() {}' }), /temporarily unavailable/);
        assert.equal(await CodingSubmission.countDocuments(), before);
      } finally { [env.SARVAM_API_KEY, env.GEMINI_API_KEY, env.OPENAI_API_KEY] = previous; }
    });
    await t.test('drafts are isolated by authenticated student and problem', async () => {
      await service.saveCodingWorkspace({ userId: first, problemId: String(problem._id), language: 'python', codePerLanguage: { python: 'print(42)' } });
      const one = await service.getCodingProblemById(String(problem._id), first);
      const two = await service.getCodingProblemById(String(problem._id), second);
      assert.equal(one.workspace?.language, 'python');
      assert.equal(two.workspace, null);
      assert.equal(await CodingWorkspace.countDocuments(), 1);
    });
    await t.test('accepted code survives more than ten later attempts and returns only to its owner', async () => {
      const fields = { studentId: first, questionId: problem._id, language: 'python', passedTestCases: 1, totalTestCases: 1 };
      await CodingSubmission.create({ ...fields, status: 'accepted', code: '# accepted solution', createdAt: new Date('2025-01-01') });
      for (let i = 0; i < 12; i++) await CodingSubmission.create({ ...fields, status: 'wrong_answer', code: '# later attempt ' + i });
      const restored = await service.getCodingProblemById(String(problem._id), first);
      assert.equal(restored.savedSolution?.code, '# accepted solution');
      assert.equal(restored.savedSolution?.accepted, true);
      assert.equal(restored.recentSubmissions.length, 10);
      assert.ok(restored.recentSubmissions.every(s => s.code.startsWith('# later')));
      assert.equal((await service.getCodingProblemById(String(problem._id), second)).savedSolution?.code, 'console.log("incorrect")');
      assert.equal((await service.getCodingProblemById(String(problem._id), new mongoose.Types.ObjectId().toString())).savedSolution, null);
      const catalog = await service.getCodingProblemsCatalog(first);
      assert.equal(catalog.stats.solved, 1);
      assert.equal(catalog.problems.find(p => p._id === String(problem._id))?.userStatus, 'solved');
    });
    await t.test('previous generated problems remain accessible in the archive with their original code', async () => {
      const legacy = await AptitudeQuestion.create({ seedKey: 'legacy-test', category: 'coding', topic: 'arrays', difficulty: 'easy', prompt: 'Old problem', source: 'sarvam', testCases: [{ input: '1', expectedOutput: '1' }] });
      await CodingSubmission.create({ studentId: first, questionId: legacy._id, language: 'javascript', code: 'console.log(1)', status: 'accepted', passedTestCases: 1, totalTestCases: 1 });
      const catalog = await service.getCodingProblemsCatalog(first);
      assert.equal(catalog.problems.some(p => p._id === String(legacy._id)), false);
      assert.equal(catalog.archivedProblems.length, 1);
      assert.equal((await service.getCodingProblemsCatalog(second)).archivedProblems.length, 0);
      assert.equal((await service.getCodingProblemById(String(legacy._id), first)).savedSolution?.code, 'console.log(1)');
    });
  } finally { await mongoose.disconnect(); await db.stop(); }
});
