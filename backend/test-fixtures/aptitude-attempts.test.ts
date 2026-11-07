import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { AptitudeAttempt } from "../src/models/AptitudeAttempt";
import { createAptitudeAttempt } from "../src/services/aptitude-service";

let server: MongoMemoryServer;
before(async () => { server = await MongoMemoryServer.create(); await mongoose.connect(server.getUri()); });
after(async () => { await mongoose.disconnect(); await server.stop(); });

test("a student gets different questions on every test", async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const seen = new Set<string>();
  for (let round = 0; round < 6; round += 1) {
    const { attempt, questions } = (await createAptitudeAttempt({ userId, sections: ["quant", "logical", "verbal"], questionCount: 20, durationMinutes: 30, difficulty: "mixed" }))!;
    assert.equal(questions.length, 20);
    for (const question of questions) {
      assert.ok(!seen.has(question.prompt), `repeated: ${question.prompt}`);
      seen.add(question.prompt);
      assert.equal(question.options.length, 4);
    }
    await AptitudeAttempt.updateOne({ _id: attempt._id }, { status: "completed" });
  }
  assert.equal(seen.size, 120);
});

test("topic filters and single sections are honoured", async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const { questions } = (await createAptitudeAttempt({ userId, sections: ["quant"], questionCount: 10, durationMinutes: 15, difficulty: "hard", topicFilters: { quant: ["probability", "profit-loss"] } }))!;
  assert.equal(questions.length, 10);
  assert.ok(questions.every(question => ["probability", "profit-loss"].includes(question.topic)));
});
