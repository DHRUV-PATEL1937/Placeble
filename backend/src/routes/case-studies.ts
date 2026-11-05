import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { meter } from "../middleware/usage-limit";
import { StudentProfile } from "../models/StudentProfile";
import { CASE_FOCUS, CASE_LEVELS, evaluateCaseAnswers, generateCaseStudy } from "../services/case-study-service";
import { programByCode } from "../services/program-service";

const router = Router();
router.use(requireAuth, requireRole("student"));

/** Temporarily open to every student. To limit it to BBA/MBA again, return 403 when !programHasCaseStudy(program). */
router.use(async (request, response, next) => {
  const profile = await StudentProfile.findOne({ userId: request.auth!.userId }).select("programCode degree preferredRoles").lean();
  const program = await programByCode(profile?.programCode);
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
  return response.json({ evaluation });
});

export { router as caseStudyRouter };
