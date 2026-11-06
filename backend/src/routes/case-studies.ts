import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { meter } from "../middleware/usage-limit";
import { StudentProfile } from "../models/StudentProfile";
import { CASE_FOCUS, CASE_LEVELS, evaluateCaseAnswers, generateCaseStudy } from "../services/case-study-service";
import { AgentResult } from "../models/AgentResult";
import { programByCode, programHasCaseStudy } from "../services/program-service";
import { scheduleReadiness } from "../services/readiness-service";

const router = Router();
router.use(requireAuth, requireRole("student"));

/** Business programmes only (MBA, BBA, B.Com, M.Com, BA). IT and other programmes don't get this tool. */
router.use(async (request, response, next) => {
  const profile = await StudentProfile.findOne({ userId: request.auth!.userId }).select("programCode degree preferredRoles").lean();
  const program = await programByCode(profile?.programCode);
  if (!programHasCaseStudy(program)) return response.status(403).json({ code: "NOT_IN_PROGRAMME", message: "The Business Case Solver isn't part of your programme." });
  response.locals.programName = program?.name ?? profile?.degree ?? "college";
  response.locals.targetRole = profile?.preferredRoles?.[0] ?? "";
  return next();
});

const caseSchema = z.object({
  title: z.string().trim().min(5).max(160),
  company: z.string().trim().min(2).max(120),
  scenario: z.string().trim().min(120).max(3000),
  brief: z.string().trim().min(30).max(300),
  keyFacts: z.array(z.string().trim().min(5).max(300)).min(3).max(6),
  questions: z.array(z.string().trim().min(15).max(400)).length(3),
});

router.post("/generate", meter("case_study"), async (request, response) => {
  const input = z.object({ focus: z.enum(CASE_FOCUS), level: z.enum(CASE_LEVELS).default("Intermediate") }).parse(request.body);
  const caseStudy = await generateCaseStudy({ ...input, programName: response.locals.programName, targetRole: response.locals.targetRole });
  return response.json({ caseStudy });
});

router.post("/evaluate", async (request, response) => {
  const input = z.object({ caseStudy: caseSchema, answers: z.array(z.string().trim().max(4000)).length(3) }).parse(request.body);
  if (input.answers.every(answer => answer.length < 20)) return response.status(400).json({ message: "Write a few sentences for at least one question before submitting." });
  const evaluation = await evaluateCaseAnswers({ ...input, programName: response.locals.programName });
  // Keep the score so it counts towards readiness. Failing to save must never lose the student's feedback.
  await AgentResult.create({ studentId: request.auth!.userId, agent: "case_study", score: Math.round(evaluation.overallScore) }).then(() => scheduleReadiness(request.auth!.userId, "case_study_completed")).catch(console.error);
  return response.json({ evaluation });
});

export { router as caseStudyRouter };
