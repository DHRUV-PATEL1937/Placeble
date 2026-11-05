import { Router } from "express";
import { requireAuth, requireInstitutionScope, requireRole } from "../middleware/auth";
import { Institution } from "../models/Institution";
import { University } from "../models/University";
import { User } from "../models/User";

const router = Router();

/** The caller's own institute (name and university, if any). Readable by every institute-scoped staff role. */
router.get("/me", requireAuth, requireRole("tpo", "faculty"), requireInstitutionScope, async (request, response) => {
  const institution = await Institution.findById(request.institutionScope).select("name universityId").lean();
  if (!institution) return response.status(404).json({ message: "Institution not found." });
  const university = institution.universityId ? await University.findById(institution.universityId).select("name").lean() : null;
  return response.json({ institution: { id: String(institution._id), name: institution.name, university: university ? { id: String(university._id), name: university.name } : null } });
});

router.get("/members", requireAuth, requireRole("tpo", "faculty"), requireInstitutionScope, async (request, response) => {
  const users = await User.find({ institutionId: request.institutionScope }).select("name email role status lastLoginAt").sort({ createdAt: -1 }).lean();
  return response.json({ users });
});

router.post("/faculty-write-check", requireAuth, requireRole("tpo"), requireInstitutionScope, (_request, response) => {
  return response.json({ ok: true });
});

export { router as institutionRouter };

