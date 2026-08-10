import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "../config/env";
import { AptitudeQuestion, type aptitudeCategories, type aptitudeDifficulties } from "../models/AptitudeQuestion";

type Category = typeof aptitudeCategories[number];
type Difficulty = typeof aptitudeDifficulties[number];
type QuestionSeed = {
  seedKey: string; category: Category; topic: string; difficulty: Difficulty; prompt: string;
  options?: string[]; correctOptionIndex?: number; explanation: string; tags: string[];
  starterCode?: Record<string, string>; testCases?: { input: string; expectedOutput: string; hidden: boolean }[]; timeLimitSeconds?: number;
};

export const aptitudeQuestionSeeds: QuestionSeed[] = [
  { seedKey: "quant-percentage-01", category: "quant", topic: "percentages", difficulty: "easy", prompt: "A product marked at ₹800 is sold at a 15% discount. What is its selling price?", options: ["₹660", "₹680", "₹700", "₹720"], correctOptionIndex: 1, explanation: "15% of 800 is 120, so the selling price is 800 − 120 = ₹680.", tags: ["arithmetic", "discount"] },
  { seedKey: "quant-average-01", category: "quant", topic: "averages", difficulty: "easy", prompt: "The average of five numbers is 24. If four of them sum to 86, what is the fifth number?", options: ["30", "32", "34", "36"], correctOptionIndex: 2, explanation: "The total is 5 × 24 = 120. The missing number is 120 − 86 = 34.", tags: ["arithmetic", "average"] },
  { seedKey: "quant-ratio-01", category: "quant", topic: "ratios", difficulty: "medium", prompt: "In a class, the ratio of boys to girls is 7:5. If 8 more girls join, the ratio becomes 7:6. How many boys are there?", options: ["42", "49", "56", "63"], correctOptionIndex: 2, explanation: "Let boys and girls be 7x and 5x. Then 7x/(5x+8)=7/6, giving x=8 and 56 boys.", tags: ["ratio", "algebra"] },
  { seedKey: "quant-speed-01", category: "quant", topic: "time-speed-distance", difficulty: "medium", prompt: "A train covers 180 km in 2.5 hours. At the same speed, how long will it take to cover 288 km?", options: ["3.5 hours", "4 hours", "4.25 hours", "4.5 hours"], correctOptionIndex: 1, explanation: "Speed is 180/2.5 = 72 km/h. Time for 288 km is 288/72 = 4 hours.", tags: ["speed", "distance"] },
  { seedKey: "quant-probability-01", category: "quant", topic: "probability", difficulty: "hard", prompt: "Two fair dice are rolled. What is the probability that their sum is at least 10?", options: ["1/12", "1/6", "5/36", "1/4"], correctOptionIndex: 1, explanation: "Sums 10, 11 and 12 have 3, 2 and 1 outcomes respectively: 6/36 = 1/6.", tags: ["probability", "counting"] },
  { seedKey: "quant-data-01", category: "quant", topic: "data-interpretation", difficulty: "hard", prompt: "A team’s quarterly sales were 120, 150, 135 and 195 units. By what percentage did Q4 exceed the quarterly average?", options: ["20%", "25%", "30%", "35%"], correctOptionIndex: 2, explanation: "The average is 600/4 = 150. Q4 exceeds it by 45, which is 30% of 150.", tags: ["data", "percentages"] },
  { seedKey: "logical-series-01", category: "logical", topic: "number-series", difficulty: "easy", prompt: "Choose the next number: 3, 7, 15, 31, ?", options: ["47", "55", "63", "65"], correctOptionIndex: 2, explanation: "Each term is the previous term × 2 + 1, so 31 × 2 + 1 = 63.", tags: ["patterns", "series"] },
  { seedKey: "logical-directions-01", category: "logical", topic: "directions", difficulty: "easy", prompt: "Maya walks 4 km north, 3 km east, then 4 km south. Where is she relative to her starting point?", options: ["3 km east", "3 km west", "4 km north", "At the starting point"], correctOptionIndex: 0, explanation: "The north and south movements cancel, leaving Maya 3 km east.", tags: ["spatial", "directions"] },
  { seedKey: "logical-syllogism-01", category: "logical", topic: "syllogisms", difficulty: "medium", prompt: "Statements: All analysts are curious. Some curious people are designers. Which conclusion must follow?", options: ["All designers are analysts", "Some analysts are designers", "All analysts are curious", "No designer is an analyst"], correctOptionIndex: 2, explanation: "The first conclusion repeats the only universally guaranteed relationship. The overlap with designers is not fixed.", tags: ["deduction", "syllogism"] },
  { seedKey: "logical-code-01", category: "logical", topic: "coding-decoding", difficulty: "medium", prompt: "If PLACE is written as QMBDF by moving every letter one step forward, how is SKILL written?", options: ["TLJMM", "TLKMM", "TJHKK", "SLJMM"], correctOptionIndex: 0, explanation: "Move each letter one position forward: S→T, K→L, I→J, L→M, L→M.", tags: ["letters", "coding"] },
  { seedKey: "logical-seating-01", category: "logical", topic: "seating-arrangement", difficulty: "hard", prompt: "Four people P, Q, R and S sit in a row. R is immediately right of P. Q is not at an end. S sits left of Q. Who must be at the left end?", options: ["P", "Q", "R", "S"], correctOptionIndex: 3, explanation: "Q cannot be at an end and S must be left of Q. Testing the valid placements of the P–R block leaves S at the left end.", tags: ["arrangement", "constraints"] },
  { seedKey: "logical-assumption-01", category: "logical", topic: "critical-reasoning", difficulty: "hard", prompt: "A company says remote work will reduce office costs. Which assumption is necessary?", options: ["Every employee prefers remote work", "The company can reduce or repurpose office space", "Remote employees always work longer", "The company will hire fewer people"], correctOptionIndex: 1, explanation: "Office costs fall only if the organisation can actually reduce or repurpose the space and related expenses.", tags: ["assumptions", "reasoning"] },
  { seedKey: "verbal-grammar-01", category: "verbal", topic: "grammar", difficulty: "easy", prompt: "Choose the grammatically correct sentence.", options: ["Neither of the reports are complete.", "Neither of the reports is complete.", "Neither of the report is complete.", "Neither reports are complete."], correctOptionIndex: 1, explanation: "‘Neither’ is singular here, so it takes ‘is’; ‘of the reports’ is the correct phrase.", tags: ["subject-verb-agreement"] },
  { seedKey: "verbal-vocab-01", category: "verbal", topic: "vocabulary", difficulty: "easy", prompt: "Choose the word closest in meaning to ‘pragmatic’.", options: ["Idealistic", "Practical", "Hesitant", "Decorative"], correctOptionIndex: 1, explanation: "Pragmatic means dealing with problems in a practical, realistic way.", tags: ["synonyms"] },
  { seedKey: "verbal-sentence-01", category: "verbal", topic: "sentence-correction", difficulty: "medium", prompt: "Choose the best revision: ‘The data indicates that each of the teams have improved.’", options: ["The data indicate that each of the teams have improved.", "The data indicates that each of the teams has improved.", "The data indicate that each of the teams has improved.", "The data are indicating each team have improved."], correctOptionIndex: 2, explanation: "In formal usage ‘data’ is plural (‘indicate’), while ‘each’ is singular (‘has’).", tags: ["grammar", "editing"] },
  { seedKey: "verbal-order-01", category: "verbal", topic: "para-jumbles", difficulty: "medium", prompt: "Arrange the ideas logically: A. The pilot was then expanded. B. A small team tested the process. C. Results showed a 20% time saving. D. The company first identified a repetitive task.", options: ["D-B-C-A", "B-D-A-C", "D-C-B-A", "B-C-D-A"], correctOptionIndex: 0, explanation: "The task is identified first, then tested, measured, and finally expanded.", tags: ["coherence", "sequence"] },
  { seedKey: "verbal-inference-01", category: "verbal", topic: "reading-comprehension", difficulty: "hard", prompt: "A report notes that customer complaints fell after response times improved, while product-return rates stayed unchanged. What is the strongest inference?", options: ["Products became higher quality", "Faster responses improved customer experience without changing product quality", "Customers stopped returning products", "Response time has no effect on satisfaction"], correctOptionIndex: 1, explanation: "Complaints changed alongside service speed, while returns—a product-quality signal—did not.", tags: ["inference", "comprehension"] },
  { seedKey: "verbal-tone-01", category: "verbal", topic: "tone", difficulty: "hard", prompt: "‘The proposal is ambitious, but its cost assumptions deserve closer scrutiny.’ The tone is best described as:", options: ["Dismissive", "Cautiously analytical", "Enthusiastic", "Indifferent"], correctOptionIndex: 1, explanation: "The sentence acknowledges merit while carefully questioning one aspect, making the tone cautiously analytical.", tags: ["tone", "comprehension"] },
  { seedKey: "coding-array-01", category: "coding", topic: "arrays", difficulty: "easy", prompt: "Read integers from one line and print the largest value. Input begins with n followed by n integers.", explanation: "Track the maximum while traversing the array once. Time complexity is O(n).", tags: ["arrays", "iteration"], starterCode: { javascript: "const fs = require('fs');\nconst values = fs.readFileSync(0, 'utf8').trim().split(/\\s+/).map(Number);\nconst n = values[0];\nconst arr = values.slice(1, n + 1);\n// Print the largest value\n", python: "values = list(map(int, input().split()))\nn, arr = values[0], values[1:]\n# Print the largest value\n" }, testCases: [{ input: "5 3 9 2 8 4", expectedOutput: "9", hidden: false }, { input: "4 -7 -2 -11 -5", expectedOutput: "-2", hidden: true }], timeLimitSeconds: 120 },
  { seedKey: "coding-string-01", category: "coding", topic: "strings", difficulty: "medium", prompt: "Read a string and print YES if it is a palindrome after ignoring case; otherwise print NO.", explanation: "Normalise the case and compare the string with its reverse, or use two pointers.", tags: ["strings", "two-pointers"], starterCode: { javascript: "const fs = require('fs');\nconst value = fs.readFileSync(0, 'utf8').trim();\n// Print YES or NO\n", python: "value = input().strip()\n# Print YES or NO\n" }, testCases: [{ input: "Level", expectedOutput: "YES", hidden: false }, { input: "Placeble", expectedOutput: "NO", hidden: true }], timeLimitSeconds: 180 },
  { seedKey: "coding-frequency-01", category: "coding", topic: "hash-maps", difficulty: "hard", prompt: "Given n integers, print the value that occurs most often. If tied, print the smallest value.", explanation: "Count values in a hash map, then select by highest frequency and smallest value. Time complexity is O(n).", tags: ["hash-map", "frequency"], starterCode: { javascript: "const fs = require('fs');\nconst values = fs.readFileSync(0, 'utf8').trim().split(/\\s+/).map(Number);\nconst n = values[0];\nconst arr = values.slice(1, n + 1);\n// Print the required value\n", python: "values = list(map(int, input().split()))\nn, arr = values[0], values[1:]\n# Print the required value\n" }, testCases: [{ input: "7 4 2 4 3 2 4 2", expectedOutput: "2", hidden: false }, { input: "6 8 8 5 5 3 3", expectedOutput: "3", hidden: true }], timeLimitSeconds: 240 },
];

export async function ensureAptitudeQuestionBank() {
  await AptitudeQuestion.collection.bulkWrite(aptitudeQuestionSeeds.map(question => ({
    updateOne: { filter: { seedKey: question.seedKey }, update: { $set: { ...question, source: "curated", isActive: true } }, upsert: true },
  })), { ordered: false });
}

const generatedCategorySchema = z.string().trim().toLowerCase().transform(value => {
  if (value.startsWith("quant")) return "quant";
  if (value.startsWith("logic")) return "logical";
  if (value.startsWith("verb")) return "verbal";
  return value;
}).pipe(z.enum(["quant", "logical", "verbal"]));

const generatedQuestionSchema = z.object({
  category: generatedCategorySchema,
  topic: z.string().trim().min(3).max(60).transform(value => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")),
  difficulty: z.enum(["easy", "medium", "hard"]),
  prompt: z.string().trim().min(20).max(1200),
  options: z.array(z.string().trim().min(1).max(300)).length(4),
  correctOptionIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().min(20).transform(value => value.slice(0, 3000)),
  tags: z.array(z.string().trim().min(2).max(40)).min(1).max(5),
});

const generatedBatchSchema = z.object({ questions: z.array(generatedQuestionSchema).min(9).max(15) });
let refreshPromise: Promise<{ generated: number; refreshedAt: Date | null }> | null = null;

function dynamicSeedKey(prompt: string) {
  return `gemini-${createHash("sha256").update(prompt.toLowerCase().replace(/\s+/g, " ").trim()).digest("hex").slice(0, 20)}`;
}

function parseGeneratedJson(value: string) {
  let insideString = false;
  let escaped = false;
  let repaired = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      repaired += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && insideString) {
      const next = value[index + 1];
      const validSimpleEscape = next && '"\\/bfnrt'.includes(next);
      const validUnicodeEscape = next === "u";
      repaired += validSimpleEscape || validUnicodeEscape ? character : "\\\\";
      escaped = Boolean(validSimpleEscape || validUnicodeEscape);
      continue;
    }
    if (character === '"') {
      insideString = !insideString;
      repaired += character;
      continue;
    }
    if (insideString && character.charCodeAt(0) < 32) {
      repaired += JSON.stringify(character).slice(1, -1);
      continue;
    }
    repaired += character;
  }
  return JSON.parse(repaired) as unknown;
}

async function generateQuestionBatch() {
  if (!env.GEMINI_API_KEY) throw new Error("Dynamic aptitude questions require the configured Gemini key.");
  const model = env.GEMINI_MODEL;
  const prompt = `Create exactly 12 original placement-style multiple-choice aptitude questions for a 2026 Indian campus hiring practice platform.

Distribution requirements:
- 4 quantitative aptitude, 4 logical reasoning, 4 verbal ability.
- Within each category include at least one easy, two medium, and one hard question.
- Use diverse current recruitment-style contexts: business data, operations, workplace communication, analytical decisions, charts described in text, and practical problem solving.
- Questions must be original and must not claim to be recalled or copied from any company's proprietary test.
- Avoid current-affairs facts, news, politics, changing statistics, brand trivia, or facts that could become stale. "Latest" means current hiring style and framing, not unverified news.
- Every question must have exactly four unambiguous options, one correctOptionIndex from 0 to 3, and a clear worked explanation. Escape all line breaks and control characters inside JSON strings.
- Quant calculations must be internally consistent. Logical questions must have one necessary answer. Verbal questions must follow standard professional English.
- Use concise kebab-case topic names such as data-interpretation, percentages, syllogisms, critical-reasoning, grammar, or reading-comprehension.

Return only JSON with this shape:
{"questions":[{"category":"quant|logical|verbal","topic":"topic-name","difficulty":"easy|medium|hard","prompt":"...","options":["...","...","...","..."],"correctOptionIndex":0,"explanation":"...","tags":["..."]}]}`;
  const responseSchema = {
    type: "OBJECT",
    required: ["questions"],
    properties: {
      questions: {
        type: "ARRAY", minItems: 12, maxItems: 12,
        items: {
          type: "OBJECT",
          required: ["category", "topic", "difficulty", "prompt", "options", "correctOptionIndex", "explanation", "tags"],
          properties: {
            category: { type: "STRING", enum: ["quant", "logical", "verbal"] },
            topic: { type: "STRING" },
            difficulty: { type: "STRING", enum: ["easy", "medium", "hard"] },
            prompt: { type: "STRING" },
            options: { type: "ARRAY", minItems: 4, maxItems: 4, items: { type: "STRING" } },
            correctOptionIndex: { type: "INTEGER", minimum: 0, maximum: 3 },
            explanation: { type: "STRING" },
            tags: { type: "ARRAY", minItems: 1, maxItems: 5, items: { type: "STRING" } },
          },
        },
      },
    },
  };
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } } }),
    signal: AbortSignal.timeout(110_000),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(detail?.error?.message?.slice(0, 260) ?? `Gemini question refresh failed (${response.status}).`);
  }
  const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty aptitude question batch.");
  return generatedBatchSchema.parse(parseGeneratedJson(text)).questions;
}

export async function refreshDynamicAptitudeQuestionBank(force = false) {
  if (!env.GEMINI_API_KEY) return { generated: 0, refreshedAt: null };
  const latest = await AptitudeQuestion.findOne({ source: "gemini", isActive: true }).sort({ generatedAt: -1 }).select("generatedAt generationBatchId").lean();
  const isFresh = latest?.generatedAt && Date.now() - new Date(latest.generatedAt).getTime() < 7 * 24 * 60 * 60 * 1000;
  if (!force && isFresh) return { generated: await AptitudeQuestion.countDocuments({ source: "gemini", isActive: true }), refreshedAt: new Date(latest.generatedAt!) };
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const questions = await generateQuestionBatch();
    const generatedAt = new Date();
    const generationBatchId = randomUUID();
    await AptitudeQuestion.updateMany({ source: "gemini", isActive: true }, { isActive: false });
    await AptitudeQuestion.collection.bulkWrite(questions.map(question => ({
      updateOne: {
        filter: { seedKey: dynamicSeedKey(question.prompt) },
        update: { $set: { ...question, seedKey: dynamicSeedKey(question.prompt), source: "gemini", generationBatchId, generatedAt, isActive: true } },
        upsert: true,
      },
    })), { ordered: false });
    return { generated: questions.length, refreshedAt: generatedAt };
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

export async function getDynamicQuestionBankStatus() {
  const latest = await AptitudeQuestion.findOne({ source: "gemini", isActive: true }).sort({ generatedAt: -1 }).select("generatedAt generationBatchId").lean();
  return {
    dynamicQuestionCount: await AptitudeQuestion.countDocuments({ source: "gemini", isActive: true }),
    lastDynamicRefreshAt: latest?.generatedAt ?? null,
    generationBatchId: latest?.generationBatchId ?? "",
  };
}
