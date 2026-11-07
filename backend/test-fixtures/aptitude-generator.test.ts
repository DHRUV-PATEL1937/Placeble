import assert from "node:assert/strict";
import test from "node:test";
import { generateQuestion, generatedTopics, type GenCategory } from "../src/services/aptitude-generator";

const categories: GenCategory[] = ["quant", "logical", "verbal"];

test("every generated question is well formed", () => {
  for (const category of categories) {
    for (const difficulty of ["easy", "medium", "hard", "mixed"] as const) {
      for (let index = 0; index < 1500; index += 1) {
        const question = generateQuestion({ category, difficulty });
        assert.ok(question, `${category}/${difficulty} produced nothing`);
        assert.equal(question.options.length, 4);
        assert.equal(new Set(question.options).size, 4, `duplicate options: ${question.options.join(" | ")} for ${question.prompt}`);
        assert.ok(question.correctOptionIndex >= 0 && question.correctOptionIndex < 4);
        assert.ok(question.prompt.length > 10 && question.explanation.length > 5);
        assert.ok(!/NaN|undefined|Infinity/.test(`${question.prompt} ${question.options.join(" ")} ${question.explanation}`), question.prompt);
      }
    }
  }
});

test("every topic can be asked for on its own", () => {
  for (const category of categories) for (const topic of generatedTopics[category]) {
    assert.ok(generateQuestion({ category, topics: [topic], difficulty: "mixed" }), `${category}/${topic}`);
  }
});

test("questions are not repeated when prompts are avoided", () => {
  const seen = new Set<string>();
  for (let index = 0; index < 60; index += 1) {
    const question = generateQuestion({ category: "quant", difficulty: "mixed", avoid: seen });
    assert.ok(question);
    assert.ok(!seen.has(question.prompt));
    seen.add(question.prompt);
  }
});

test("quant questions are different almost every time", () => {
  const prompts = new Set<string>();
  for (let index = 0; index < 200; index += 1) prompts.add(generateQuestion({ category: "quant", difficulty: "mixed" })!.prompt);
  assert.ok(prompts.size > 170, `only ${prompts.size} distinct prompts out of 200`);
});

test("every topic works at every difficulty", () => {
  for (const category of categories) for (const topic of generatedTopics[category]) for (const difficulty of ["easy", "medium", "hard"] as const) {
    let made = 0;
    for (let index = 0; index < 30; index += 1) if (generateQuestion({ category, topics: [topic], difficulty })) made += 1;
    assert.ok(made > 0, `${category}/${topic}/${difficulty} never produced a question`);
  }
});

test("there is a wide choice of topics", () => {
  assert.ok(generatedTopics.quant.length >= 20 && generatedTopics.logical.length >= 12 && generatedTopics.verbal.length >= 10);
});
