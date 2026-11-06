import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { meter } from "../middleware/usage-limit";
import { StudentProfile } from "../models/StudentProfile";
import { HR_CHALLENGE_IDS, HR_LEVELS, HR_STEPS, evaluateHrCase, historySchema, hrCaseSchema, nextHrStep, startHrCase } from "../services/hr-sim-service";
import { programByCode } from "../services/program-service";

const router = Router();
router.use(requireAuth, requireRole("student"));

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
  return response.json({ evaluation: await evaluateHrCase(input) });
});

export { router as hrSimRouter };
