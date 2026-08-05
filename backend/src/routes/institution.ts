import { Router } from "express";
import { requireAuth, requireInstitutionScope, requireRole } from "../middleware/auth";
import { User } from "../models/User";

const router = Router();

router.get("/members", requireAuth, requireRole("tpo", "faculty"), requireInstitutionScope, async (request, response) => {
  const users = await User.find({ institutionId: request.institutionScope }).select("name email role status lastLoginAt").sort({ createdAt: -1 }).lean();
  return response.json({ users });
});

router.post("/faculty-write-check", requireAuth, requireRole("tpo"), requireInstitutionScope, (_request, response) => {
  return response.json({ ok: true });
});

export { router as institutionRouter };

