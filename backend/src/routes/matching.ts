import { Router } from "express";
import { z } from "zod";
import { applicationStatuses } from "../models/Application";
import { Job } from "../models/Job";
import { requireAuth, requireRole } from "../middleware/auth";
import { dismissJob, getMatchingDashboard, getMatchingJob, queueMatchingRecompute, resetDismissedJobs, saveOrApplyJob, updateApplication } from "../services/matching-service";

const router = Router();
router.use(requireAuth, requireRole("student"));
router.get("/dashboard", async (request, response) => response.json(await getMatchingDashboard(request.auth!.userId)));
router.get("/jobs/:jobId", async (request, response) => { const job = await Job.findOne({ _id: request.params.jobId, isActive: true }).lean(); return job ? response.json({ job }) : response.status(404).json({ message: "That job is no longer active." }); });
router.get("/jobs-tasks/:jobId", (request, response) => { const job = getMatchingJob(String(request.params.jobId), request.auth!.userId); return job ? response.json({ job }) : response.status(404).json({ message: "That match update was not found." }); });
router.post("/recompute", (request, response) => { const job = queueMatchingRecompute(request.auth!.userId, { studentId: request.auth!.userId }); return response.status(202).json({ job }); });
router.post("/jobs/:jobId/save", async (request, response) => response.status(201).json({ application: await saveOrApplyJob(request.auth!.userId, String(request.params.jobId), "saved") }));
router.post("/jobs/:jobId/apply", async (request, response) => response.status(201).json({ application: await saveOrApplyJob(request.auth!.userId, String(request.params.jobId), "applied") }));
router.post("/jobs/:jobId/pass", async (request, response) => response.json(await dismissJob(request.auth!.userId, String(request.params.jobId))));
router.post("/feed/reset", async (request, response) => response.json(await resetDismissedJobs(request.auth!.userId)));
router.patch("/applications/:applicationId", async (request, response) => {
  const input = z.object({ status: z.enum(applicationStatuses).optional(), notes: z.string().max(4000).optional() }).refine(value => value.status !== undefined || value.notes !== undefined).parse(request.body);
  const application = await updateApplication({ ...input, applicationId: String(request.params.applicationId), studentId: request.auth!.userId });
  return application ? response.json({ application }) : response.status(404).json({ message: "That application was not found." });
});
export { router as matchingRouter };
