import { Router } from "express";
import { Types } from "mongoose";
import { requireAuth, requireRole } from "../middleware/auth";
import { RecruiterShortlist } from "../models/RecruiterShortlist";
import { User } from "../models/User";
import { institutionReadiness } from "../services/readiness-service";
import { DriveAccessGrant } from "../models/DriveAccessGrant";
import { RecruiterOrganization } from "../models/RecruiterOrganization";
import { Institution } from "../models/Institution";
import { MarketplaceRequest } from "../models/MarketplaceRequest";
import { z } from "zod";

const router = Router();

async function recruiterScope(recruiterOrgId: string) {
  const [organization, grants] = await Promise.all([
    RecruiterOrganization.findById(recruiterOrgId).select("companyName").lean(),
    DriveAccessGrant.find({ recruiterOrgId, status: "approved", $or: [{ accessLevel: "candidate_access" }, { accessLevel: { $exists: false } }] }).select("institutionId driveId accessLevel relationshipSource").lean(),
  ]);
  if (!organization) return null;
  return { companyName: organization.companyName, institutionIds: [...new Set(grants.map(grant => grant.institutionId.toString()))], driveIds: grants.map(grant => grant.driveId.toString()), grants };
}

const accessLevelSchema = z.enum(["aggregate_stats", "candidate_access"]);

router.get("/marketplace", requireAuth, requireRole("recruiter"), async (request, response) => {
  const input = z.object({ search: z.string().trim().max(100).default(""), branch: z.string().trim().max(60).default(""), studentCountBand: z.string().trim().max(30).default("") }).parse(request.query);
  const escaped = input.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const filter: Record<string, unknown> = {
    status: "active",
    "marketplaceListing.isListed": true,
    ...(input.branch ? { "marketplaceListing.topBranches": input.branch } : {}),
    ...(input.studentCountBand ? { "marketplaceListing.studentCountBand": input.studentCountBand } : {}),
    ...(input.search ? { $or: [{ name: new RegExp(escaped, "i") }, { "marketplaceListing.headline": new RegExp(escaped, "i") }, { "marketplaceListing.topBranches": new RegExp(escaped, "i") }] } : {}),
  };
  const institutions = await Institution.find(filter).select("name slug marketplaceListing").sort({ name: 1 }).lean();
  const requests = await MarketplaceRequest.find({ recruiterOrgId: request.auth!.recruiterOrgId, institutionId: { $in: institutions.map(item => item._id) } }).lean();
  const requestByInstitution = new Map(requests.map(item => [String(item.institutionId), item]));
  return response.json({ institutions: institutions.map(item => ({ ...item, request: requestByInstitution.get(String(item._id)) ?? null })) });
});

router.get("/marketplace/requests", requireAuth, requireRole("recruiter"), async (request, response) => {
  const requests = await MarketplaceRequest.find({ recruiterOrgId: request.auth!.recruiterOrgId }).populate("institutionId", "name slug marketplaceListing").sort({ createdAt: -1 }).lean();
  return response.json({ requests });
});

router.get("/institutions", requireAuth, requireRole("recruiter"), async (request, response) => {
  const recruiterOrgId = request.auth!.recruiterOrgId!;
  const [relationships, directGrants] = await Promise.all([
    MarketplaceRequest.find({ recruiterOrgId, status: "approved", grantedAccessLevel: { $in: ["aggregate_stats", "candidate_access"] } }).populate("institutionId", "name slug status marketplaceListing").sort({ decidedAt: -1 }).lean(),
    DriveAccessGrant.find({ recruiterOrgId, status: "approved", $or: [{ relationshipSource: "direct_tpo" }, { relationshipSource: { $exists: false } }] }).populate("institutionId", "name slug status marketplaceListing").populate("driveId", "title companyName status startsAt").lean(),
  ]);
  const institutionIds = new Set<string>();
  for (const relationship of relationships) if (relationship.institutionId && typeof relationship.institutionId === "object" && "_id" in relationship.institutionId) institutionIds.add(String(relationship.institutionId._id));
  for (const grant of directGrants) if (grant.institutionId && typeof grant.institutionId === "object" && "_id" in grant.institutionId) institutionIds.add(String(grant.institutionId._id));
  const allDriveGrants = await DriveAccessGrant.find({ recruiterOrgId, status: "approved", institutionId: { $in: [...institutionIds] }, $or: [{ accessLevel: "candidate_access" }, { accessLevel: { $exists: false } }] }).populate("driveId", "title companyName status startsAt").lean();
  const institutions = await Promise.all([...institutionIds].map(async institutionId => {
    const relationship = relationships.find(item => String((item.institutionId as { _id?: unknown })?._id) === institutionId);
    const directGrant = directGrants.find(item => String((item.institutionId as { _id?: unknown })?._id) === institutionId);
    const institution = (relationship?.institutionId ?? directGrant?.institutionId) as unknown as { _id: Types.ObjectId; name: string; slug: string; status: string; marketplaceListing?: unknown };
    const grants = allDriveGrants.filter(item => String(item.institutionId) === institutionId);
    const readiness = await institutionReadiness(institutionId);
    return {
      _id: institution._id,
      name: institution.name,
      slug: institution.slug,
      accessLevel: relationship?.grantedAccessLevel ?? "candidate_access",
      requestedAccessLevel: relationship?.requestedAccessLevel ?? "candidate_access",
      relationshipSource: relationship ? "marketplace" : "direct_tpo",
      approvedAt: relationship?.decidedAt ?? directGrant?.decidedAt ?? directGrant?.createdAt,
      summary: readiness.summary,
      drives: grants.map(grant => ({ grantId: grant._id, driveId: (grant.driveId as unknown as { _id?: unknown })?._id ?? grant.driveId, title: (grant.driveId as unknown as { title?: string })?.title ?? "Drive", companyName: (grant.driveId as unknown as { companyName?: string })?.companyName ?? "", status: (grant.driveId as unknown as { status?: string })?.status ?? "published", startsAt: (grant.driveId as unknown as { startsAt?: Date })?.startsAt ?? null })),
    };
  }));
  return response.json({ institutions });
});

router.post("/marketplace/:institutionId/request", requireAuth, requireRole("recruiter"), async (request, response) => {
  const institutionId = Array.isArray(request.params.institutionId) ? request.params.institutionId[0] : request.params.institutionId;
  if (!Types.ObjectId.isValid(institutionId)) return response.status(400).json({ message: "Institution ID is invalid." });
  const input = z.object({ requestedAccessLevel: accessLevelSchema, message: z.string().trim().max(500).default("") }).parse(request.body);
  const institution = await Institution.findOne({ _id: institutionId, status: "active", "marketplaceListing.isListed": true }).select("_id").lean();
  if (!institution) return response.status(404).json({ code: "LISTING_UNAVAILABLE", message: "This institution is not currently accepting marketplace requests." });
  const existing = await MarketplaceRequest.findOne({ recruiterOrgId: request.auth!.recruiterOrgId, institutionId });
  if (existing && existing.status !== "rejected") return response.status(409).json({ code: "REQUEST_ALREADY_EXISTS", message: "Your organization already has an active relationship request with this institution." });
  const marketplaceRequest = await MarketplaceRequest.findOneAndUpdate(
    { recruiterOrgId: request.auth!.recruiterOrgId, institutionId },
    { $set: { requestedAccessLevel: input.requestedAccessLevel, message: input.message, status: "pending", grantedAccessLevel: null, respondingTpoId: null, decidedAt: null } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return response.status(201).json({ request: marketplaceRequest });
});

router.get("/marketplace/:institutionId/aggregate", requireAuth, requireRole("recruiter"), async (request, response) => {
  const institutionId = Array.isArray(request.params.institutionId) ? request.params.institutionId[0] : request.params.institutionId;
  if (!Types.ObjectId.isValid(institutionId)) return response.status(400).json({ message: "Institution ID is invalid." });
  const relationship = await MarketplaceRequest.findOne({ recruiterOrgId: request.auth!.recruiterOrgId, institutionId, status: "approved", grantedAccessLevel: { $in: ["aggregate_stats", "candidate_access"] } }).lean();
  const directGrant = relationship ? null : await DriveAccessGrant.findOne({ recruiterOrgId: request.auth!.recruiterOrgId, institutionId, status: "approved", $or: [{ relationshipSource: "direct_tpo" }, { relationshipSource: { $exists: false } }] }).lean();
  if (!relationship && !directGrant) return response.status(403).json({ code: "AGGREGATE_ACCESS_REQUIRED", message: "Approved aggregate access is required for this institution." });
  const cohort = await institutionReadiness(institutionId);
  const branchBreakdown = [...cohort.students.reduce((map, student) => map.set(student.branch, (map.get(student.branch) ?? 0) + 1), new Map<string, number>())].map(([branch, count]) => ({ branch, count }));
  const skillBreakdown = [...cohort.students.flatMap(student => student.skills).reduce((map, skill) => map.set(skill, (map.get(skill) ?? 0) + 1), new Map<string, number>())].sort((left, right) => right[1] - left[1]).slice(0, 12).map(([skill, count]) => ({ skill, count }));
  return response.json({ institutionId, accessLevel: relationship?.grantedAccessLevel ?? "candidate_access", summary: cohort.summary, branchBreakdown, skillBreakdown });
});

router.get("/candidates", requireAuth, requireRole("recruiter"), async (request, response) => {
  const scope = await recruiterScope(request.auth!.recruiterOrgId!);
  if (!scope) return response.status(403).json({ message: "No recruiter scope is assigned to this account." });

  const requestedInstitution = typeof request.query.institutionId === "string" ? request.query.institutionId : null;
  const requestedDrive = typeof request.query.driveId === "string" ? request.query.driveId : scope.driveIds[0] ?? null;
  if (requestedInstitution && !scope.institutionIds.includes(requestedInstitution)) {
    return response.status(403).json({ code: "OUTSIDE_RECRUITER_SCOPE", message: "That institution is outside your granted recruiter scope." });
  }
  if (requestedDrive && !scope.driveIds.includes(requestedDrive)) {
    return response.status(403).json({ code: "OUTSIDE_RECRUITER_SCOPE", message: "That drive is outside your granted recruiter scope." });
  }
  const driveGrant = requestedDrive ? scope.grants.find(grant => grant.driveId.toString() === requestedDrive) : null;
  if (!driveGrant) return response.status(403).json({ code: "CANDIDATE_DRIVE_GRANT_REQUIRED", message: "A specific approved candidate-access drive grant is required." });
  if (driveGrant.relationshipSource === "marketplace") {
    const relationship = await MarketplaceRequest.exists({ recruiterOrgId: request.auth!.recruiterOrgId, institutionId: driveGrant.institutionId, status: "approved", grantedAccessLevel: "candidate_access" });
    if (!relationship) return response.status(403).json({ code: "MARKETPLACE_CANDIDATE_ACCESS_REQUIRED", message: "Candidate access has not been approved at the institution relationship level." });
  }
  if (requestedInstitution && driveGrant && driveGrant.institutionId.toString() !== requestedInstitution) {
    return response.status(403).json({ code: "OUTSIDE_RECRUITER_SCOPE", message: "That drive does not belong to the requested institution scope." });
  }
  const institutionIds = [driveGrant.institutionId.toString()];
  const cohorts = await Promise.all(institutionIds.map(institutionReadiness));
  const students = cohorts.flatMap(cohort => cohort.students);
  const shortlisted = await RecruiterShortlist.find({ recruiterId: request.auth!.userId, candidateId: { $in: students.map(student => student.id) } }).select("candidateId").lean();
  const scores = students.map(student => student.readiness);
  return response.json({
    students,
    shortlistedCandidateIds: shortlisted.map(item => item.candidateId.toString()),
    scope: { companyName: scope.companyName, institutionIds: scope.institutionIds, driveIds: scope.driveIds, activeDriveId: requestedDrive },
    summary: {
      candidateCount: students.length,
      averageReadiness: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0,
      readyCount: scores.filter(score => score >= 75).length,
      shortlistCount: shortlisted.length,
    },
  });
});

router.post("/shortlist/:candidateId", requireAuth, requireRole("recruiter"), async (request, response) => {
  const scope = await recruiterScope(request.auth!.recruiterOrgId!);
  if (!scope) return response.status(403).json({ message: "No recruiter scope is assigned to this account." });
  const candidateId = Array.isArray(request.params.candidateId) ? request.params.candidateId[0] : request.params.candidateId;
  if (!Types.ObjectId.isValid(candidateId)) return response.status(400).json({ message: "Candidate ID is invalid." });
  const driveId = typeof request.body?.driveId === "string" ? request.body.driveId : scope.driveIds[0];
  const grant = scope.grants.find(item => item.driveId.toString() === driveId);
  if (!grant) return response.status(403).json({ code: "CANDIDATE_DRIVE_GRANT_REQUIRED", message: "A specific approved candidate-access drive grant is required." });
  if (grant.relationshipSource === "marketplace" && !await MarketplaceRequest.exists({ recruiterOrgId: request.auth!.recruiterOrgId, institutionId: grant.institutionId, status: "approved", grantedAccessLevel: "candidate_access" })) return response.status(403).json({ code: "MARKETPLACE_CANDIDATE_ACCESS_REQUIRED", message: "Candidate access has not been approved at the institution relationship level." });
  const candidate = await User.findOne({ _id: candidateId, role: "student", status: "active", institutionId: grant.institutionId }).select("_id").lean();
  if (!candidate) return response.status(403).json({ code: "OUTSIDE_RECRUITER_SCOPE", message: "That candidate is outside your granted recruiter scope." });
  await RecruiterShortlist.updateOne({ recruiterId: request.auth!.userId, candidateId: candidate._id }, { $setOnInsert: { recruiterId: request.auth!.userId, candidateId: candidate._id } }, { upsert: true });
  return response.status(201).json({ candidateId: candidate._id.toString(), shortlisted: true });
});

router.delete("/shortlist/:candidateId", requireAuth, requireRole("recruiter"), async (request, response) => {
  const candidateId = Array.isArray(request.params.candidateId) ? request.params.candidateId[0] : request.params.candidateId;
  if (!Types.ObjectId.isValid(candidateId)) return response.status(400).json({ message: "Candidate ID is invalid." });
  await RecruiterShortlist.deleteOne({ recruiterId: request.auth!.userId, candidateId });
  return response.json({ candidateId, shortlisted: false });
});

export { router as recruiterRouter };
