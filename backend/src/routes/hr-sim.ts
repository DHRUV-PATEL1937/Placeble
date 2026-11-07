import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { meter } from "../middleware/usage-limit";
import { StudentProfile } from "../models/StudentProfile";
import { HR_CHALLENGE_IDS, HR_LEVELS, HR_STEPS, evaluateHrCase, historySchema, hrCaseSchema, nextHrStep, startHrCase } from "../services/hr-sim-service";
import { AgentResult } from "../models/AgentResult";
import { agentResultHistory } from "../services/agent-results";
import { programByCode, programHasHrSimulator } from "../services/program-service";
import { scheduleReadiness } from "../services/readiness-service";

const router = Router();
router.use(requireAuth, requireRole("student"));

/** Business programmes only (MBA, BBA, B.Com, M.Com, BA). IT and other programmes don't get this tool. */
router.use(async (request, response, next) => {
  const profile = await StudentProfile.findOne({ userId: request.auth!.userId }).select("programCode").lean();
  if (!programHasHrSimulator(await programByCode(profile?.programCode))) return response.status(403).json({ code: "NOT_IN_PROGRAMME", message: "The HR Manager Simulator isn't part of your programme." });
  return next();
});

router.post("/start", meter("hr_simulation"), async (request, response) => {
  const input = z.object({ challenge: z.enum(HR_CHALLENGE_IDS), level: z.enum(HR_LEVELS).default("Medium") }).parse(request.body);
  const profile = await StudentProfile.findOne({ userId: request.auth!.userId }).select("programCode degree").lean();
  const program = await programByCode(profile?.programCode);
  const hrCase = await startHrCase({ ...input, programName: program?.name ?? profile?.degree ?? "college" });
  return response.json({ hrCase });
});

/** Takes every decision so far and returns the next turn of the Decision Room. */
router.post("/next", async (request, response) => {
  const input = z.object({ hrCase: hrCaseSchema, history: historySchema }).parse(request.body);
  if (input.history.length >= HR_STEPS) return response.status(400).json({ message: "All decisions are made. Get your evaluation instead." });
  return response.json({ step: await nextHrStep(input) });
});

router.post("/evaluate", async (request, response) => {
  const input = z.object({ hrCase: hrCaseSchema, history: historySchema }).parse(request.body);
  if (input.history.length !== HR_STEPS) return response.status(400).json({ message: `Make all ${HR_STEPS} decisions before the evaluation.` });
  const evaluation = await evaluateHrCase(input);
  // Keep the score so it counts towards readiness. Failing to save must never lose the student's feedback.
  await AgentResult.create({ studentId: request.auth!.userId, agent: "hr_simulation", score: Math.round(evaluation.overallScore), title: input.hrCase.title, detail: evaluation.verdict }).then(() => scheduleReadiness(request.auth!.userId, "hr_simulation_completed")).catch(console.error);
  return response.json({ evaluation });
});

/** The student's HR simulator progress: attempts, best, average and recent results. */
router.get("/history", async (request, response) => response.json(await agentResultHistory(request.auth!.userId, "hr_simulation")));

export { router as hrSimRouter };
