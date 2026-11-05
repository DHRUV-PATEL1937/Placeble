import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { env } from "../config/env";
import { AptitudeQuestion } from "../models/AptitudeQuestion";
import { CodingSubmission } from "../models/CodingSubmission";
import { CodingWorkspace } from "../models/CodingWorkspace";
import { CODING_LIBRARY_VERSION, curatedCodingQuestions, codingLibrarySource, libraryProblem } from "./curated-coding-library";
import { recomputeReadiness } from "./readiness-service";

export const SUPPORTED_LANGUAGES = [
  { id: "javascript", label: "JavaScript (Node.js)", judge0Id: 63, extension: "js" },
  { id: "python", label: "Python 3", judge0Id: 71, extension: "py" },
  { id: "java", label: "Java (OpenJDK 17)", judge0Id: 62, extension: "java" },
  { id: "cpp", label: "C++ (GCC 9.2)", judge0Id: 54, extension: "cpp" },
  { id: "typescript", label: "TypeScript (5.0)", judge0Id: 74, extension: "ts" },
  { id: "c", label: "C (GCC 9.2)", judge0Id: 50, extension: "c" },
  { id: "go", label: "Go (1.13)", judge0Id: 60, extension: "go" },
] as const;

export type SupportedLanguageId = typeof SUPPORTED_LANGUAGES[number]["id"];

const languageIdMap: Record<string, number> = Object.fromEntries(
  SUPPORTED_LANGUAGES.map(lang => [lang.id, lang.judge0Id])
);

export type TestCase = {
  input: string;
  expectedOutput: string;
  hidden?: boolean;
};

export type ExecutionResultItem = {
  caseIndex: number;
  input: string;
  expectedOutput: string;
  actualOutput: string;
  passed: boolean;
  status: "Accepted" | "Wrong Answer" | "Runtime Error" | "Time Limit Exceeded" | "Compilation Error";
  error?: string;
  executionTimeMs: number;
};

export type ExecutionReport = {
  passed: number;
  total: number;
  allPassed: boolean;
  runtimeMs: number;
  results: ExecutionResultItem[];
};

function normalizeOutput(text: string): string {
  try {
    const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)])) : value;
    return JSON.stringify(stable(JSON.parse(text)));
  } catch { /* Older stdin problems still compare plain-text output. */ }
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(line => line.trimEnd())
    .join("\n")
    .trim();
}

function cleanJson(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// 1. Multi-Language Code Execution Engine
// ---------------------------------------------------------------------------

async function executeViaJudge0(code: string, language: string, testCase: TestCase): Promise<ExecutionResultItem> {
  if (!env.JUDGE0_ENDPOINT) throw new Error("Judge0 not configured");
  const judge0Id = languageIdMap[language];
  if (!judge0Id) throw new Error(`Unsupported language for Judge0: ${language}`);

  const start = Date.now();
  const response = await fetch(`${env.JUDGE0_ENDPOINT.replace(/\/$/, "")}/submissions?base64_encoded=true&wait=true`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.JUDGE0_API_KEY ? { "X-RapidAPI-Key": env.JUDGE0_API_KEY } : {}),
    },
    body: JSON.stringify({
      language_id: judge0Id,
      source_code: Buffer.from(code).toString("base64"),
      stdin: Buffer.from(testCase.input).toString("base64"),
      expected_output: Buffer.from(testCase.expectedOutput).toString("base64"),
      cpu_time_limit: 2,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Judge0 returned ${response.status}`);
  }

  const payload = await response.json() as {
    status?: { id?: number; description?: string };
    stdout?: string;
    stderr?: string;
    compile_output?: string;
    time?: string;
  };

  const actual = payload.stdout ? Buffer.from(payload.stdout, "base64").toString() : "";
  const errorMsg = (payload.stderr ? Buffer.from(payload.stderr, "base64").toString() : "") ||
                   (payload.compile_output ? Buffer.from(payload.compile_output, "base64").toString() : "");
  const normalizedActual = normalizeOutput(actual);
  const normalizedExpected = normalizeOutput(testCase.expectedOutput);
  const passed = payload.status?.id === 3 && normalizedActual === normalizedExpected;
  const executionTimeMs = payload.time ? Math.round(parseFloat(payload.time) * 1000) : (Date.now() - start);

  let status: ExecutionResultItem["status"] = "Accepted";
  if (!passed) {
    if (payload.status?.id === 4) status = "Wrong Answer";
    else if (payload.status?.id === 5) status = "Time Limit Exceeded";
    else if (payload.status?.id === 6) status = "Compilation Error";
    else if (payload.status?.id && payload.status.id >= 7) status = "Runtime Error";
    else status = normalizedActual === normalizedExpected ? "Accepted" : "Wrong Answer";
  }

  return {
    caseIndex: 0,
    input: testCase.input,
    expectedOutput: testCase.expectedOutput,
    actualOutput: normalizedActual,
    passed,
    status,
    error: errorMsg.slice(0, 500) || undefined,
    executionTimeMs,
  };
}

async function executeJavascriptInVm(code: string, stdinText: string, expectedOutput: string): Promise<ExecutionResultItem> {
  const start = Date.now();
  let outputBuffer = "";
  let errorMsg = "";

  const sandbox = {
    console: {
      log: (...args: unknown[]) => {
        outputBuffer += args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ") + "\n";
      },
      error: (...args: unknown[]) => {
        errorMsg += args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ") + "\n";
      },
      info: (...args: unknown[]) => {
        outputBuffer += args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ") + "\n";
      },
      warn: (...args: unknown[]) => {
        outputBuffer += args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ") + "\n";
      },
    },
    fs: {
      readFileSync: (_fd: unknown, _encoding?: string) => stdinText,
      readSync: () => stdinText,
    },
    require: (moduleName: string) => {
      if (moduleName === "fs") {
        return {
          readFileSync: (_fd: unknown, _encoding?: string) => stdinText,
          readSync: () => stdinText,
        };
      }
      throw new Error(`Module '${moduleName}' is not available in safe coding sandbox.`);
    },
    process: {
      stdin: {
        read: () => stdinText,
        on: () => {},
      },
      stdout: {
        write: (chunk: string) => {
          outputBuffer += chunk;
        },
      },
      argv: ["node", "solution.js"],
      env: {},
    },
    Buffer,
    Math,
    Date,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    WeakMap,
    WeakSet,
  };

  try {
    const context = vm.createContext(sandbox);
    const script = new vm.Script(code, { filename: "solution.js" });
    script.runInContext(context, { timeout: 3500 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    errorMsg = message;
  }

  const executionTimeMs = Date.now() - start;
  const normalizedActual = normalizeOutput(outputBuffer);
  const normalizedExpected = normalizeOutput(expectedOutput);
  const passed = !errorMsg && normalizedActual === normalizedExpected;

  let status: ExecutionResultItem["status"] = "Accepted";
  if (errorMsg) {
    status = errorMsg.includes("Script execution timed out") ? "Time Limit Exceeded" : "Runtime Error";
  } else if (!passed) {
    status = "Wrong Answer";
  }

  return {
    caseIndex: 0,
    input: stdinText,
    expectedOutput,
    actualOutput: normalizedActual,
    passed,
    status,
    error: errorMsg || undefined,
    executionTimeMs,
  };
}

async function executePythonLocally(code: string, stdinText: string, expectedOutput: string): Promise<ExecutionResultItem> {
  const start = Date.now();
  try {
    const stdout = execFileSync("python", ["-c", code], {
      input: stdinText,
      encoding: "utf8",
      timeout: 3500,
      maxBuffer: 1024 * 512,
    });
    const executionTimeMs = Date.now() - start;
    const normalizedActual = normalizeOutput(stdout);
    const normalizedExpected = normalizeOutput(expectedOutput);
    const passed = normalizedActual === normalizedExpected;
    return {
      caseIndex: 0,
      input: stdinText,
      expectedOutput,
      actualOutput: normalizedActual,
      passed,
      status: passed ? "Accepted" : "Wrong Answer",
      executionTimeMs,
    };
  } catch (err: unknown) {
    const executionTimeMs = Date.now() - start;
    const error = err as { stdout?: string | Buffer; stderr?: string | Buffer; killed?: boolean; message?: string };
    const stdout = error.stdout ? normalizeOutput(String(error.stdout)) : "";
    const stderr = error.stderr ? String(error.stderr).slice(0, 500) : "";
    const isTimeout = error.killed || error.message?.includes("timed out");
    return {
      caseIndex: 0,
      input: stdinText,
      expectedOutput,
      actualOutput: stdout,
      passed: false,
      status: isTimeout ? "Time Limit Exceeded" : "Runtime Error",
      error: stderr || error.message?.slice(0, 500) || "Execution failed",
      executionTimeMs,
    };
  }
}

// ---------------------------------------------------------------------------
// 1. Multi-Language Code Execution Engine (Hybrid VM + Single AI Virtual Sandbox)
// ---------------------------------------------------------------------------

async function evaluateCodeWithAI(input: {
  code: string;
  language: string;
  testCases: TestCase[];
  problemTitle?: string;
  problemPrompt?: string;
}): Promise<ExecutionReport> {
  const { code, language, testCases, problemTitle, problemPrompt } = input;
  const startTotal = Date.now();

  const formattedTestCases = testCases.map((tc, idx) => {
    return `[Test Case #${idx + 1}]
Input:
${tc.input || "(empty)"}
Expected Output:
${tc.expectedOutput}`;
  }).join("\n\n");

  const prompt = `You are a strict, automated compiler and code execution engine for ${language}.
Your task is to compile and simulate the execution of the user's code against ALL ${testCases.length} test cases in a single evaluation pass.

Problem: ${problemTitle || "Coding Problem"}
${problemPrompt ? `Specification:\n${problemPrompt}\n` : ""}
Language: ${language}

User's Code:
\`\`\`${language}
${code}
\`\`\`

Test Cases to Evaluate:
${formattedTestCases}

Strict Instructions:
1. Syntax & Compilation Check:
   - Check if this code compiles without syntax errors in ${language} (e.g. valid syntax, proper imports/packages, type declarations, semicolons).
   - If there is a syntax or compilation error, set "compilationError" to a brief compiler error with the approximate line number.
   - If compilation fails, set every test case status to "Compilation Error", "passed": false, "actualOutput": "", "error": compilation error.
2. Step-by-step Execution (if code compiles):
   - For EACH test case, simulate running the code with the given Input passed via standard input (stdin).
   - Compute the exact standard output (stdout) printed by the code.
   - Compare the trimmed actual output against the trimmed expected output.
   - If outputs match exactly: "passed": true, "status": "Accepted", "error": null.
   - If outputs differ: "passed": false, "status": "Wrong Answer", "error": null.
   - If the code throws an unhandled exception (NullPointerException, IndexError, division by zero, stack overflow):
     "passed": false, "status": "Runtime Error", "error": exception message.
   - If the code has an obvious infinite loop:
     "passed": false, "status": "Time Limit Exceeded", "error": "Execution timed out".

CRITICAL: Return ONLY a valid JSON object matching the schema below. Do NOT include markdown ticks, explanatory text, or preamble:
{
  "compilationError": null,
  "coachFeedback": "Brief 1-sentence tip on code efficiency or why it failed.",
  "results": [
    {
      "caseIndex": 1,
      "actualOutput": "...",
      "passed": true,
      "status": "Accepted",
      "error": null,
      "executionTimeMs": 25
    }
  ]
}
The "results" array MUST contain exactly ${testCases.length} elements corresponding to the test cases in order.`;

  let jsonText = "";

  // 1. Try Sarvam AI (Single API call for all cases)
  if (env.SARVAM_API_KEY) {
    try {
      const response = await fetch("https://api.sarvam.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.SARVAM_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.SARVAM_MODEL || "sarvam-105b",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 4096,
          reasoning_effort: null,
          response_format: { type: "json_object" },
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(35_000),
      });

      if (response.ok) {
        const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        jsonText = payload.choices?.[0]?.message?.content?.trim() || "";
      } else {
        console.warn("Coding evaluator: Sarvam HTTP", response.status);
      }
    } catch (err) {
      console.warn("Sarvam AI code evaluation request failed, attempting Gemini fallback:", err);
    }
  }

  // 2. Try Gemini fallback (Single API call)
  if (!jsonText && env.GEMINI_API_KEY) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
        }),
        signal: AbortSignal.timeout(35_000),
      });

      if (response.ok) {
        const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        jsonText = payload.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim() || "";
      }
    } catch (err) {
      console.warn("Gemini AI code evaluation fallback failed:", err);
    }
  }

  // 3. Try OpenAI fallback if configured (Single API call)
  if (!jsonText && env.OPENAI_API_KEY) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 8192,
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(35_000),
      });

      if (response.ok) {
        const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        jsonText = payload.choices?.[0]?.message?.content?.trim() || "";
      }
    } catch (err) {
      console.warn("OpenAI code evaluation fallback failed:", err);
    }
  }

  const executionTimeMs = Math.round((Date.now() - startTotal) / (testCases.length || 1)) || 20;

  if (jsonText) {
    try {
      const parsed = JSON.parse(cleanJson(jsonText)) as {
        compilationError?: string | null;
        coachFeedback?: string;
        results?: Array<{
          caseIndex?: number;
          actualOutput?: string;
          passed?: boolean;
          status?: ExecutionResultItem["status"];
          error?: string | null;
          executionTimeMs?: number;
        }>;
      };

      if (Array.isArray(parsed.results) && parsed.results.length > 0) {
        const items: ExecutionResultItem[] = testCases.map((tc, idx) => {
          const res = parsed.results?.[idx];
          const actualOutput = normalizeOutput(res?.actualOutput ?? "");
          const expectedOutput = normalizeOutput(tc.expectedOutput);
          const hasError = Boolean(res?.error || parsed.compilationError);
          const passed = Boolean(res) && !hasError && actualOutput === expectedOutput;
          const status: ExecutionResultItem["status"] =
            res?.status ||
            (parsed.compilationError ? "Compilation Error" :
             passed ? "Accepted" :
             hasError ? "Runtime Error" : "Wrong Answer");

          return {
            caseIndex: idx + 1,
            input: tc.input,
            expectedOutput: tc.expectedOutput,
            actualOutput,
            passed: Boolean(passed && status === "Accepted"),
            status,
            error: res?.error || parsed.compilationError || undefined,
            executionTimeMs: res?.executionTimeMs || executionTimeMs,
          };
        });

        const passedCount = items.filter(r => r.passed).length;
        return {
          passed: passedCount,
          total: items.length,
          allPassed: passedCount === items.length && items.length > 0,
          runtimeMs: Date.now() - startTotal,
          results: items,
        };
      }
    } catch (err) {
      console.error("Failed to parse AI code execution response:", err, jsonText);
    }
  }

  // Provider failure is not a student's runtime error or an incorrect attempt.
  throw new Error("The code checker is temporarily unavailable. Your editor code is preserved. Please retry in a moment.");
}

function fallbackSimulateCases(
  code: string,
  language: string,
  testCases: TestCase[],
  startTotal: number
): ExecutionReport {
  if (!code.trim()) {
    const results: ExecutionResultItem[] = testCases.map((tc, idx) => ({
      caseIndex: idx + 1,
      input: tc.input,
      expectedOutput: tc.expectedOutput,
      actualOutput: "",
      passed: false,
      status: "Compilation Error",
      error: "Empty code submitted. Please write your solution before running.",
      executionTimeMs: 0,
    }));
    return { passed: 0, total: testCases.length, allPassed: false, runtimeMs: 0, results };
  }

  const results: ExecutionResultItem[] = testCases.map((tc, idx) => ({
    caseIndex: idx + 1,
    input: tc.input,
    expectedOutput: tc.expectedOutput,
    actualOutput: "",
    passed: false,
    status: "Runtime Error",
    error: `AI execution engine is unavailable. Please verify SARVAM_API_KEY or GEMINI_API_KEY in server environment.`,
    executionTimeMs: 0,
  }));

  return {
    passed: 0,
    total: testCases.length,
    allPassed: false,
    runtimeMs: Date.now() - startTotal,
    results,
  };
}

export async function executeCodeAgainstCases(input: {
  code: string;
  language: string;
  testCases: TestCase[];
  problemTitle?: string;
  problemPrompt?: string;
}): Promise<ExecutionReport> {
  const { code, language, testCases, problemTitle, problemPrompt } = input;
  if (!testCases || testCases.length === 0) {
    return { passed: 0, total: 0, allPassed: false, runtimeMs: 0, results: [] };
  }

  // 1. If Judge0 is configured in env, attempt Judge0 first
  if (env.JUDGE0_ENDPOINT) {
    try {
      const results: ExecutionResultItem[] = [];
      const startTotal = Date.now();
      for (let i = 0; i < testCases.length; i++) {
        const item = await executeViaJudge0(code, language, testCases[i]);
        item.caseIndex = i + 1;
        results.push(item);
      }
      const passed = results.filter(r => r.passed).length;
      return {
        passed,
        total: results.length,
        allPassed: passed === results.length && results.length > 0,
        runtimeMs: Date.now() - startTotal,
        results,
      };
    } catch (judge0Err) {
      console.warn("Judge0 execution failed, falling back to local VM or AI virtual sandbox:", judge0Err);
    }
  }

  // JavaScript can run directly; TypeScript needs a compiler or AI evaluation.
  if (language === "javascript") {
    const results: ExecutionResultItem[] = [];
    const startTotal = Date.now();
    for (let i = 0; i < testCases.length; i++) {
      const item = await executeJavascriptInVm(code, testCases[i].input, testCases[i].expectedOutput);
      item.caseIndex = i + 1;
      results.push(item);
    }
    const passed = results.filter(r => r.passed).length;
    return {
      passed,
      total: results.length,
      allPassed: passed === results.length && results.length > 0,
      runtimeMs: Date.now() - startTotal,
      results,
    };
  }

  // 3. Python: If local python executable exists, run locally (0 AI calls, fast)
  if (language === "python") {
    try {
      const testFirst = await executePythonLocally(code, testCases[0].input, testCases[0].expectedOutput);
      if (!testFirst.error?.includes("not recognized") && !testFirst.error?.includes("ENOENT")) {
        const results: ExecutionResultItem[] = [testFirst];
        testFirst.caseIndex = 1;
        const startTotal = Date.now();
        for (let i = 1; i < testCases.length; i++) {
          const item = await executePythonLocally(code, testCases[i].input, testCases[i].expectedOutput);
          item.caseIndex = i + 1;
          results.push(item);
        }
        const passed = results.filter(r => r.passed).length;
        return {
          passed,
          total: results.length,
          allPassed: passed === results.length && results.length > 0,
          runtimeMs: Date.now() - startTotal + testFirst.executionTimeMs,
          results,
        };
      }
    } catch {
      // Python not in PATH - seamlessly falls through to AI Virtual Engine below
    }
  }

  // 4. All other languages (Java, C++, C, Go, or Python without local runtime):
  // Evaluates ALL test cases together in EXACTLY 1 AI API call!
  return evaluateCodeWithAI({
    code,
    language,
    testCases,
    problemTitle,
    problemPrompt,
  });
}

// ---------------------------------------------------------------------------
// 2. Versioned, open-source problem library
// ---------------------------------------------------------------------------

let libraryReady: Promise<void> | undefined;
export async function ensureCodingQuestionBank() {
  if (!libraryReady) {
    libraryReady = AptitudeQuestion.bulkWrite(curatedCodingQuestions.map(question => ({
      updateOne: { filter: { seedKey: question.seedKey }, update: { $set: question }, upsert: true },
    }))).then(() => undefined).catch(error => { libraryReady = undefined; throw error; });
  }
  await libraryReady;
  return curatedCodingQuestions.length;
}

export async function getCodingProblemsCatalog(userId: string, filter?: {
  topic?: string;
  difficulty?: string;
  search?: string;
  status?: "all" | "solved" | "attempted" | "todo";
}) {
  await ensureCodingQuestionBank();

  const query: Record<string, unknown> = { category: "coding", isActive: true, generationBatchId: CODING_LIBRARY_VERSION };
  if (filter?.difficulty && filter.difficulty !== "all") {
    query.difficulty = filter.difficulty;
  }
  if (filter?.topic && filter.topic !== "all") {
    query.topic = filter.topic;
  }

  const rawQuestions = await AptitudeQuestion.find(query).sort({ difficulty: 1, createdAt: -1 }).lean();

  // Find user submissions to compute status
  const submissions = await CodingSubmission.find({ studentId: userId, questionId: { $in: rawQuestions.map(q => q._id) } }).select("questionId status runtimeMs createdAt").lean();
  const submissionStatusMap = new Map<string, "accepted" | "attempted">();
  for (const s of submissions) {
    const qid = String(s.questionId);
    if (s.status === "accepted") {
      submissionStatusMap.set(qid, "accepted");
    } else if (!submissionStatusMap.has(qid)) {
      submissionStatusMap.set(qid, "attempted");
    }
  }

  let mapped = rawQuestions.map(q => {
    const qid = String(q._id);
    const userStatus: "solved" | "attempted" | "todo" =
      submissionStatusMap.get(qid) === "accepted" ? "solved" :
      submissionStatusMap.get(qid) === "attempted" ? "attempted" : "todo";

    const starterMap = q.starterCode instanceof Map ? Object.fromEntries(q.starterCode) : (q.starterCode || {});

    return {
      _id: qid,
      title: q.title || q.prompt.slice(0, 48) + "...",
      topic: q.topic,
      difficulty: q.difficulty,
      prompt: q.prompt,
      tags: q.tags || [],
      constraints: q.constraints || [],
      examples: q.examples || [],
      starterCodeLanguages: Object.keys(starterMap),
      testCaseCount: (q.testCases || []).length,
      visibleTestCaseCount: (q.testCases || []).filter(tc => !tc.hidden).length,
      userStatus,
      source: q.source,
      sourceUrl: libraryProblem(q.seedKey)?.sourceUrl,
      license: libraryProblem(q.seedKey) ? "MIT" : undefined,
    };
  });

  if (filter?.search?.trim()) {
    const searchLower = filter.search.toLowerCase().trim();
    mapped = mapped.filter(q =>
      q.title.toLowerCase().includes(searchLower) ||
      q.topic.toLowerCase().includes(searchLower) ||
      q.tags.some(t => t.toLowerCase().includes(searchLower))
    );
  }

  if (filter?.status && filter.status !== "all") {
    mapped = mapped.filter(q => q.userStatus === filter.status);
  }

  // Summary statistics
  const total = rawQuestions.length;
  const solved = Array.from(submissionStatusMap.values()).filter(v => v === "accepted").length;
  const attempted = Array.from(submissionStatusMap.values()).length;
  const easyCount = rawQuestions.filter(q => q.difficulty === "easy").length;
  const mediumCount = rawQuestions.filter(q => q.difficulty === "medium").length;
  const hardCount = rawQuestions.filter(q => q.difficulty === "hard").length;

  const previousIds = await CodingSubmission.distinct('questionId', { studentId: userId });
  const previousQuestions = await AptitudeQuestion.find({ _id: { $in: previousIds }, category: 'coding', generationBatchId: { $ne: CODING_LIBRARY_VERSION } }).select('title topic difficulty prompt tags testCases source').lean();
  const previousAccepted = new Set((await CodingSubmission.distinct('questionId', { studentId: userId, status: 'accepted' })).map(String));
  const archivedProblems = previousQuestions.map(q => ({
    _id: String(q._id), title: q.title || q.prompt.slice(0, 64), topic: q.topic, difficulty: q.difficulty,
    tags: q.tags || [], testCaseCount: q.testCases.length, userStatus: previousAccepted.has(String(q._id)) ? 'solved' : 'attempted', source: q.source,
  }));

  return {
    problems: mapped,
    archivedProblems,
    stats: {
      total,
      solved,
      attempted,
      easyCount,
      mediumCount,
      hardCount,
      acceptanceRate: attempted > 0 ? Math.round((solved / attempted) * 100) : 0,
    },
    supportedLanguages: SUPPORTED_LANGUAGES,
    librarySource: codingLibrarySource,
  };
}

export async function getCodingProblemById(problemId: string, userId: string) {
  await ensureCodingQuestionBank();
  const q = await AptitudeQuestion.findOne({ _id: problemId, category: "coding" }).lean();
  if (!q) throw new Error("Coding problem not found");

  const starterMap = q.starterCode instanceof Map ? Object.fromEntries(q.starterCode) : (q.starterCode || {});

  // Populate default starter code for languages if missing
  for (const lang of SUPPORTED_LANGUAGES) {
    if (!starterMap[lang.id]) {
      starterMap[lang.id] = `// Solution in ${lang.label}\n`;
    }
  }

  // Visible test cases for the IDE use-cases panel
  const visibleCases = (q.testCases || []).filter(tc => !tc.hidden).map((tc, idx) => ({
    caseIndex: idx + 1,
    input: tc.input,
    expectedOutput: tc.expectedOutput,
  }));

  const userSubmissions = await CodingSubmission.find({ questionId: problemId, studentId: userId })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  // Accepted solutions are queried independently of the latest ten attempts.
  const [accepted, workspace] = await Promise.all([
    CodingSubmission.findOne({ questionId: problemId, studentId: userId, status: "accepted" }).sort({ createdAt: -1 }).select("language code createdAt").lean(),
    CodingWorkspace.findOne({ questionId: problemId, studentId: userId }).lean(),
  ]);
  const preferred = accepted ?? userSubmissions[0];
  return {
    sourceUrl: libraryProblem(q.seedKey)?.sourceUrl,
    sourceName: libraryProblem(q.seedKey) ? "Exercism" : "Previous practice",
    license: libraryProblem(q.seedKey) ? "MIT" : undefined,
    userStatus: accepted ? "solved" : userSubmissions.length ? "attempted" : "todo",
    savedSolution: preferred ? { language: preferred.language, code: preferred.code, accepted: Boolean(accepted), createdAt: preferred.createdAt } : null,
    workspace: workspace ? { language: workspace.language, codePerLanguage: workspace.codePerLanguage instanceof Map ? Object.fromEntries(workspace.codePerLanguage) : workspace.codePerLanguage } : null,
    _id: String(q._id),
    title: q.title || q.prompt.slice(0, 48),
    topic: q.topic,
    difficulty: q.difficulty,
    prompt: q.prompt,
    constraints: q.constraints || [],
    examples: q.examples || [],
    starterCode: starterMap,
    hints: q.hints || [],
    explanation: q.explanation || "",
    tags: q.tags || [],
    visibleTestCases: visibleCases,
    totalTestCaseCount: (q.testCases || []).length,
    recentSubmissions: userSubmissions.map(s => ({
      _id: String(s._id),
      language: s.language,
      code: s.code,
      status: s.status,
      passedTestCases: s.passedTestCases,
      totalTestCases: s.totalTestCases,
      runtimeMs: s.runtimeMs,
      createdAt: s.createdAt,
    })),
  };
}

export async function runVisibleCode(input: {
  problemId: string;
  language: string;
  code: string;
  customInput?: string;
}): Promise<ExecutionReport> {
  const q = await AptitudeQuestion.findById(input.problemId).lean();
  if (!q || q.category !== "coding") throw new Error("Problem not found");

  let casesToRun: TestCase[];
  if (input.customInput !== undefined && input.customInput.trim().length > 0) {
    casesToRun = [{ input: input.customInput.trim(), expectedOutput: "(Custom Input Evaluation)" }];
  } else {
    casesToRun = (q.testCases || []).filter(tc => !tc.hidden);
    if (casesToRun.length === 0 && (q.testCases || []).length > 0) {
      casesToRun = [(q.testCases || [])[0]];
    }
  }

  return executeCodeAgainstCases({
    code: input.code,
    language: input.language,
    testCases: casesToRun,
    problemTitle: q.title || (q.prompt ? q.prompt.slice(0, 60) : undefined),
    problemPrompt: q.prompt,
  });
}

export async function submitFullSolution(input: {
  problemId: string;
  userId: string;
  language: string;
  code: string;
}) {
  const q = await AptitudeQuestion.findById(input.problemId).lean();
  if (!q || q.category !== "coding") throw new Error("Problem not found");

  const allCases: TestCase[] = q.testCases || [];
  if (!allCases.length) throw new Error("This problem has no published test cases.");

  const report = await executeCodeAgainstCases({
    code: input.code,
    language: input.language,
    testCases: allCases,
    problemTitle: q.title || (q.prompt ? q.prompt.slice(0, 60) : undefined),
    problemPrompt: q.prompt,
  });

  let submissionStatus: "accepted" | "wrong_answer" | "runtime_error" | "time_limit_exceeded" = "accepted";
  if (!report.allPassed) {
    const errorCase = report.results.find(r => !r.passed);
    if (errorCase?.status === "Time Limit Exceeded") submissionStatus = "time_limit_exceeded";
    else if (errorCase?.status === "Runtime Error" || errorCase?.status === "Compilation Error") submissionStatus = "runtime_error";
    else submissionStatus = "wrong_answer";
  }

  const submission = await CodingSubmission.create({
    studentId: input.userId,
    questionId: input.problemId,
    language: input.language,
    code: input.code,
    status: submissionStatus,
    passedTestCases: report.passed,
    totalTestCases: report.total,
    runtimeMs: report.runtimeMs,
    results: report.results.slice(0, 10), // Store up to 10 result details
  });

  if (submissionStatus === "accepted") {
    // Recompute readiness score asynchronously for student
    void recomputeReadiness(input.userId, "coding_accepted").catch(console.error);
  }

  return {
    submissionId: String(submission._id),
    status: submissionStatus,
    report: { ...report, results: report.results.map((result, index) => allCases[index]?.hidden ? { ...result, input: "Hidden test case", expectedOutput: "Hidden", actualOutput: "Hidden", error: result.error ? "This hidden test encountered an execution error." : undefined } : result) },
    isAccepted: submissionStatus === "accepted",
    passedTestCases: report.passed,
    totalTestCases: report.total,
    runtimeMs: report.runtimeMs,
  };
}

export async function saveCodingWorkspace(input: { problemId: string; userId: string; language: string; codePerLanguage: Record<string, string> }) {
  const exists = await AptitudeQuestion.exists({ _id: input.problemId, category: "coding" });
  if (!exists) throw new Error("Problem not found");
  await CodingWorkspace.findOneAndUpdate(
    { questionId: input.problemId, studentId: input.userId },
    { $set: { language: input.language, codePerLanguage: input.codePerLanguage } },
    { upsert: true, runValidators: true },
  );
  return { saved: true };
}
