import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.MONGODB_URI = 'mongodb://127.0.0.1/test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-000000000000000000000000';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-00000000000000000000000';
const p = await import('../src/services/program-service');

const program = (overrides: Record<string, unknown> = {}) => ({ code: 'X', name: 'X', category: 'X', durationYears: 2, interviewStyle: 'technical' as const, roles: [], coding: false, active: true, agents: null, ...overrides });
const modes = (list: Array<{ key: string; mode: string; weight: number }>) => Object.fromEntries(list.map(agent => [agent.key, `${agent.mode}:${agent.weight}`]));

test('defaults match how programmes worked before the settings existed', () => {
  assert.deepEqual(modes(p.programAgents(program({ interviewStyle: 'business' }))), { resume: 'scored:20', aptitude: 'scored:20', interview: 'scored:20', coding: 'optional:0', case_study: 'scored:20', hr_simulation: 'scored:20' });
  assert.deepEqual(modes(p.programAgents(program({ coding: true }))), { resume: 'scored:25', aptitude: 'scored:25', interview: 'scored:25', coding: 'scored:25', case_study: 'optional:0', hr_simulation: 'optional:0' });
  assert.deepEqual(modes(p.programAgents(program())), { resume: 'scored:33', aptitude: 'scored:33', interview: 'scored:34', coding: 'optional:0', case_study: 'optional:0', hr_simulation: 'optional:0' });
  assert.equal(p.programHasCoding(undefined), true);
  // For now every agent is available to every student.
  for (const style of ['technical', 'business', 'mixed'] as const) for (const coding of [true, false]) assert.ok(p.programAgents(program({ interviewStyle: style, coding })).every(agent => agent.mode !== 'off'));
});

test('saved settings win, missing agents fall back to defaults, core agents never switch off', () => {
  const saved = program({ coding: true, agents: [{ key: 'case_study', mode: 'off', weight: 0 }, { key: 'hr_simulation', mode: 'scored', weight: 10 }, { key: 'resume', mode: 'off', weight: 0 }] });
  const agents = modes(p.programAgents(saved));
  assert.equal(agents.case_study, 'off:0');
  assert.equal(agents.hr_simulation, 'scored:10');
  assert.equal(agents.coding, 'scored:25');
  assert.equal(agents.resume, 'optional:0');
  assert.equal(p.programHasCaseStudy(saved), false);
  assert.equal(p.programHasHrSimulator(saved), true);
});

test('optional agents carry no weight', () => {
  const agents = p.programAgents(program({ agents: [{ key: 'coding', mode: 'optional', weight: 40 }] }));
  assert.equal(agents.find(agent => agent.key === 'coding')!.weight, 0);
});
