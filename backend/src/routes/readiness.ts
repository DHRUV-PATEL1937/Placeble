import { Router } from "express";
import { requireAuth, requireInstitutionScope, requireRole } from "../middleware/auth";
import { institutionReadiness, studentReadiness } from "../services/readiness-service";

const router = Router();
router.get("/me", requireAuth, requireRole("student"), async (request, response) => response.json(await studentReadiness(request.auth!.userId)));
router.get("/cohort", requireAuth, requireRole("tpo", "faculty"), requireInstitutionScope, async (request, response) => response.json(await institutionReadiness(request.institutionScope!)));
export { router as readinessRouter };
