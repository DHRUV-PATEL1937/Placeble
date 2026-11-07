import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.MONGODB_URI = 'mongodb://127.0.0.1/test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-000000000000000000000000';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-00000000000000000000000';
const mongoose = (await import('mongoose')).default;
const { UsageEvent } = await import('../src/models/UsageEvent');
const { monthlyUsage } = await import('../src/services/plans');

test('monthly usage matches the stored ObjectId even when given a string id', async () => {
  const id = new mongoose.Types.ObjectId();
  let pipeline: Array<Record<string, any>> = [];
  const original = UsageEvent.aggregate;
  (UsageEvent as any).aggregate = async (stages: Array<Record<string, any>>) => { pipeline = stages; return [{ _id: 'interview', count: 2 }]; };
  try {
    const usage = await monthlyUsage(String(id));
    assert.ok(pipeline[0].$match.userId instanceof mongoose.Types.ObjectId);
    assert.ok(pipeline[0].$match.userId.equals(id));
    assert.equal(usage.interview, 2);
    assert.equal(usage.aptitude, 0);
  } finally {
    (UsageEvent as any).aggregate = original;
  }
});
