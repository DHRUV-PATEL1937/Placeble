import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { Router } from "express";
import mongoose from "mongoose";
import { Types } from "mongoose";
import { z } from "zod";
import { env } from "../config/env";
import { requireAuth, requireRole } from "../middleware/auth";
import { AdminAuditLogEntry, adminAuditActions } from "../models/AdminAuditLogEntry";
import { Application } from "../models/Application";
import { AptitudeAttempt } from "../models/AptitudeAttempt";
import { Drive } from "../models/Drive";
import { DriveAccessGrant } from "../models/DriveAccessGrant";
import { GdSession } from "../models/GdSession";
import { Institution } from "../models/Institution";
import { InstitutionLead } from "../models/InstitutionLead";
import { MarketplaceRequest } from "../models/MarketplaceRequest";
import { Invite } from "../models/Invite";
import { Interview } from "../models/Interview";
import { ReadinessScore } from "../models/ReadinessScore";
import { RecruiterOrganization } from "../models/RecruiterOrganization";
import { Resume } from "../models/Resume";
import { StudentRosterEntry } from "../models/StudentRosterEntry";
import { User } from "../models/User";
import { writeAdminAudit } from "../services/admin-audit-service";
import { issueActivationInvite } from "../services/invite-issuance-service";
import { institutionReadiness } from "../services/readiness-service";

const router = Router();
router.use(requireAuth, requireRole("platform_admin"));

const objectId = z.string().refine(value => Types.ObjectId.isValid(value), "Invalid identifier.");
const reasonSchema = z.string().trim().min(3, "Please record a reason.").max(500);

async function latestReadinessByInstitution() {
  return ReadinessScore.aggregate<{ _id: Types.ObjectId | null; average: number }>([
    { $sort: { studentId: 1, calculatedAt: -1 } },
    { $group: { _id: "$studentId", institutionId: { $first: "$institutionId" }, score: { $first: "$score" } } },
    { $group: { _id: "$institutionId", average: { $avg: "$score" } } },
  ]);
}

router.get("/health", async (_request, response) => {
  const startedAt = Date.now();
  const database = await (async () => {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return { key: "database", label: "MongoDB database", status: "down" as const, detail: "The database connection is not ready." };
    try {
      await mongoose.connection.db.admin().ping();
      return { key: "database", label: "MongoDB database", status: "operational" as const, detail: `Connected to ${env.MONGODB_DB_NAME}.` };
    } catch {
      return { key: "database", label: "MongoDB database", status: "down" as const, detail: "The database did not respond to a ping." };
    }
  })();
  const records = await (async () => {
    if (database.status === "down") return { key: "core-data", label: "Core data access", status: "down" as const, detail: "Skipped while the database is unavailable." };
    try {
      const [users, resumes, questions] = await Promise.all([User.countDocuments(), Resume.countDocuments(), AptitudeAttempt.countDocuments()]);
      return { key: "core-data", label: "Core data access", status: "operational" as const, detail: `${users} users · ${resumes} resumes · ${questions} aptitude attempts accessible.` };
    } catch {
      return { key: "core-data", label: "Core data access", status: "degraded" as const, detail: "Database is connected, but one or more core collections could not be read." };
    }
  })();
  const services = [
    { key: "api", label: "API runtime", status: "operational" as const, detail: `Running for ${Math.floor(process.uptime() / 60)} minutes.` },
    database,
    records,
    { key: "ai", label: "AI provider", status: (env.AI_PROVIDER === "sarvam" ? !!env.SARVAM_API_KEY : env.AI_PROVIDER === "gemini" ? !!env.GEMINI_API_KEY : !!env.OPENAI_API_KEY) ? "configured" as const : "degraded" as const, detail: (env.AI_PROVIDER === "sarvam" ? !!env.SARVAM_API_KEY : env.AI_PROVIDER === "gemini" ? !!env.GEMINI_API_KEY : !!env.OPENAI_API_KEY) ? `${env.AI_PROVIDER} is configured for agent tasks.` : `${env.AI_PROVIDER} is selected but its API key is missing.` },
    { key: "coding", label: "Coding evaluator", status: env.JUDGE0_ENDPOINT ? "configured" as const : "degraded" as const, detail: env.JUDGE0_ENDPOINT ? "Judge0 endpoint is configured for coding tests." : "Judge0 is not configured; coding aptitude questions are unavailable." },
    { key: "authentication", label: "Authentication", status: "operational" as const, detail: "Access and refresh-token signing are configured." },
  ];
  const overall = services.some(service => service.status === "down") ? "down" : services.some(service => service.status === "degraded") ? "degraded" : "operational";
  return response.json({ overall, checkedAt: new Date().toISOString(), responseTimeMs: Date.now() - startedAt, services });
});

router.get("/super-admins", async (_request, response) => {
  const admins = await User.find({ role: "platform_admin" }).select("name email status lastLoginAt createdAt").sort({ createdAt: 1 }).lean();
  return response.json({ admins });
});

router.post("/super-admins", async (request, response) => {
  const input = z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().email().transform(value => value.toLowerCase()) }).parse(request.body);
  if (await User.exists({ email: input.email })) return response.status(409).json({ message: "An account already exists for this email address." });
  const temporaryPassword = `Plb!${randomBytes(12).toString("base64url")}9a`;
  const admin = await User.create({ name: input.name, email: input.email, role: "platform_admin", passwordHash: await bcrypt.hash(temporaryPassword, 12), authProvider: "password", status: "active", emailVerified: true, passwordChangedAt: new Date() });
  await writeAdminAudit({ platformAdminId: request.auth!.userId, action: "platform_admin_created", targetType: "user", targetId: admin._id, metadata: { name: admin.name, email: admin.email } });
  return response.status(201).json({ admin: { _id: admin._id, name: admin.name, email: admin.email, status: admin.status }, temporaryPassword });
});
router.get("/overview", async (_request, response) => {
  const sinceMonth = new Date(); sinceMonth.setDate(1); sinceMonth.setHours(0, 0, 0, 0);
  const since90 = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000); since90.setHours(0, 0, 0, 0);
  const [activeInstitutions, newInstitutions, students, onboardedStudents, verifiedRecruiters, pendingRecruiters, readiness, signupRows, audit, leads] = await Promise.all([
    Institution.countDocuments({ status: "active" }),
    Institution.countDocuments({ createdAt: { $gte: sinceMonth } }),
    User.countDocuments({ role: "student" }),
    User.countDocuments({ role: "student", status: "active", studentVerificationStatus: { $in: ["approved", "roster_matched"] } }),
    RecruiterOrganization.countDocuments({ verificationStatus: "verified", suspendedAt: null }),
    RecruiterOrganization.countDocuments({ verificationStatus: "pending", suspendedAt: null }),
    ReadinessScore.aggregate<{ average: number }>([
      { $sort: { studentId: 1, calculatedAt: -1 } },
      { $group: { _id: "$studentId", score: { $first: "$score" } } },
      { $group: { _id: null, average: { $avg: "$score" } } },
    ]),
    User.aggregate<{ _id: string; count: number }>([
      { $match: { role: "student", createdAt: { $gte: since90 } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    AdminAuditLogEntry.find().sort({ createdAt: -1 }).limit(10).populate("platformAdminId", "name email").lean(),
    InstitutionLead.find().sort({ createdAt: -1 }).limit(5).lean(),
  ]);
  const signupMap = new Map(signupRows.map(row => [row._id, row.count]));
  const signupTrend = Array.from({ length: 90 }, (_, index) => {
    const date = new Date(since90); date.setDate(date.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    return { date: key, count: signupMap.get(key) ?? 0 };
  });
  return response.json({
    metrics: {
      activeInstitutions,
      newInstitutionsThisMonth: newInstitutions,
      students,
      onboardedStudents,
      onboardingRate: students ? Math.round(onboardedStudents / students * 100) : 0,
      verifiedRecruiters,
      pendingRecruiters,
      averageReadiness: Math.round(readiness[0]?.average ?? 0),
    },
    signupTrend,
    recentActivity: audit,
    leads,
  });
});

router.get("/institutions", async (request, response) => {
  const input = z.object({
    search: z.string().trim().max(100).default(""),
    status: z.enum(["all", "active", "suspended", "pending"]).default("all"),
    sort: z.enum(["name", "students", "onboarded"]).default("onboarded"),
    order: z.enum(["asc", "desc"]).default("desc"),
  }).parse(request.query);
  const filter = {
    ...(input.status !== "all" ? { status: input.status } : {}),
    ...(input.search ? { $or: [{ name: new RegExp(input.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }, { approvedEmailDomains: new RegExp(input.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }] } : {}),
  };
  const [institutions, userStats, rosterStats, readinessStats] = await Promise.all([
    Institution.find(filter).lean(),
    User.aggregate<{ _id: { institutionId: Types.ObjectId; role: string }; count: number }>([
      { $match: { institutionId: { $ne: null }, role: { $in: ["student", "tpo"] } } },
      { $group: { _id: { institutionId: "$institutionId", role: "$role" }, count: { $sum: 1 } } },
    ]),
    StudentRosterEntry.aggregate<{ _id: Types.ObjectId; total: number; matched: number }>([
      { $group: { _id: "$institutionId", total: { $sum: 1 }, matched: { $sum: { $cond: [{ $eq: ["$status", "matched"] }, 1, 0] } } } },
    ]),
    latestReadinessByInstitution(),
  ]);
  const users = new Map(userStats.map(row => [`${row._id.institutionId}:${row._id.role}`, row.count]));
  const roster = new Map(rosterStats.map(row => [String(row._id), row]));
  const readiness = new Map(readinessStats.map(row => [String(row._id), Math.round(row.average)]));
  const rows = institutions.map(institution => {
    const id = String(institution._id); const rosterRow = roster.get(id);
    return {
      ...institution,
      studentCount: users.get(`${id}:student`) ?? 0,
      tpoCount: users.get(`${id}:tpo`) ?? 0,
      rosterTotal: rosterRow?.total ?? 0,
      rosterMatched: rosterRow?.matched ?? 0,
      rosterMatchRate: rosterRow?.total ? Math.round(rosterRow.matched / rosterRow.total * 100) : 0,
      averageReadiness: readiness.get(id) ?? 0,
    };
  });
  const direction = input.order === "asc" ? 1 : -1;
  rows.sort((left, right) => {
    if (input.sort === "name") return left.name.localeCompare(right.name) * direction;
    if (input.sort === "students") return (left.studentCount - right.studentCount) * direction;
    return (+new Date(left.createdAt) - +new Date(right.createdAt)) * direction;
  });
  return response.json({ institutions: rows });
});

router.post("/institutions", async (request, response) => {
  const input = z.object({ name: z.string().trim().min(2).max(160), approvedEmailDomains: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)).min(1).max(12), tpoName: z.string().trim().min(2).max(80), tpoEmail: z.string().email() }).parse(request.body);
  const domains = [...new Set(input.approvedEmailDomains)];
  const domainOwner = await Institution.findOne({ $or: [{ approvedEmailDomains: { $in: domains } }, { officialDomains: { $in: domains } }] }).select("name").lean();
  if (domainOwner) return response.status(409).json({ code: "DOMAIN_ALREADY_ASSIGNED", message: `One of these domains is already assigned to ${domainOwner.name}.` });
  if (await User.exists({ email: input.tpoEmail.toLowerCase() })) return response.status(409).json({ message: "An account already exists for the first TPO email." });
  const slugBase = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 54) || "institution";
  let slug = slugBase;
  for (let suffix = 2; await Institution.exists({ slug }); suffix += 1) slug = `${slugBase}-${suffix}`;
  const institution = await Institution.create({ name: input.name, slug, approvedEmailDomains: domains, officialDomains: domains, status: "active", createdByPlatformAdminId: request.auth!.userId });
  try {
    const issued = await issueActivationInvite({ name: input.tpoName, email: input.tpoEmail, role: "tpo", institutionId: institution._id, invitedBy: request.auth!.userId });
    await writeAdminAudit({ platformAdminId: request.auth!.userId, action: "institution_created", targetType: "institution", targetId: institution._id, metadata: { name: institution.name, domains, tpoEmail: input.tpoEmail.toLowerCase() } });
    return response.status(201).json({ institution, invite: { id: issued.invite._id, email: issued.invite.email, expiresAt: issued.invite.expiresAt }, activationPath: issued.activationPath, delivery: "provider_not_configured" });
  } catch (error) {
    await Promise.all([Institution.deleteOne({ _id: institution._id }), Invite.deleteMany({ institutionId: institution._id })]);
    throw error;
  }
});

router.get("/institutions/:institutionId", async (request, response) => {
  const institutionId = objectId.parse(request.params.institutionId);
  const institution = await Institution.findById(institutionId).lean();
  if (!institution) return response.status(404).json({ message: "Institution not found." });
  const students = await User.find({ institutionId, role: "student" }).select("_id").lean();
  const studentIds = students.map(student => student._id);
  const [primaryTpo, rosterEntries, rosterTotal, rosterMatched, readiness, resumeUsers, aptitudeUsers, interviewUsers, gdUsers, applicationUsers, drives] = await Promise.all([
    User.findOne({ institutionId, role: "tpo" }).sort({ createdAt: 1 }).select("name email status lastLoginAt").lean(),
    StudentRosterEntry.find({ institutionId }).sort({ uploadedAt: -1 }).limit(200).lean(),
    StudentRosterEntry.countDocuments({ institutionId }),
    StudentRosterEntry.countDocuments({ institutionId, status: "matched" }),
    institutionReadiness(institutionId),
    Resume.distinct("studentId", { studentId: { $in: studentIds } }),
    AptitudeAttempt.distinct("studentId", { studentId: { $in: studentIds }, status: "completed" }),
    Interview.distinct("studentId", { studentId: { $in: studentIds }, status: "completed" }),
    GdSession.distinct("studentId", { studentId: { $in: studentIds }, status: "completed" }),
    Application.distinct("studentId", { studentId: { $in: studentIds }, status: { $ne: "saved" } }),
    Drive.find({ institutionId }).sort({ createdAt: -1 }).lean(),
  ]);
  const driveIds = drives.map(drive => drive._id);
  const grants = await DriveAccessGrant.find({ institutionId, driveId: { $in: driveIds } }).populate("recruiterOrgId", "companyName companyDomain verificationStatus").sort({ requestedAt: -1 }).lean();
  await writeAdminAudit({ platformAdminId: request.auth!.userId, action: "admin_viewed_institution_detail", targetType: "institution", targetId: institution._id, metadata: { name: institution.name } });
  return response.json({
    institution,
    primaryTpo,
    roster: { total: rosterTotal, matched: rosterMatched, unmatched: rosterTotal - rosterMatched, entries: rosterEntries },
    engagement: { resumes: resumeUsers.length, aptitude: aptitudeUsers.length, interviews: interviewUsers.length, groupDiscussions: gdUsers.length, applications: applicationUsers.length },
    readiness,
    drives: drives.map(drive => ({ ...drive, grants: grants.filter(grant => String(grant.driveId) === String(drive._id)) })),
  });
});

router.patch("/institutions/:institutionId/status", async (request, response) => {
  const institutionId = objectId.parse(request.params.institutionId);
  const input = z.object({ status: z.enum(["active", "suspended"]), reason: reasonSchema }).parse(request.body);
  const institution = await Institution.findByIdAndUpdate(institutionId, { $set: { status: input.status } }, { returnDocument: "after" });
  if (!institution) return response.status(404).json({ message: "Institution not found." });
  await writeAdminAudit({ platformAdminId: request.auth!.userId, action: input.status === "suspended" ? "institution_suspended" : "institution_reactivated", targetType: "institution", targetId: institution._id, metadata: { reason: input.reason, name: institution.name } });
  return response.json({ institution });
});

router.post("/institutions/:institutionId/reissue-tpo", async (request, response) => {
  const institutionId = objectId.parse(request.params.institutionId);
  const input = z.object({ tpoId: objectId.optional(), reason: reasonSchema }).parse(request.body);
  const tpo = await User.findOne({ ...(input.tpoId ? { _id: input.tpoId } : {}), institutionId, role: "tpo", status: { $ne: "suspended" } }).sort({ createdAt: 1 });
  if (!tpo) return response.status(404).json({ message: "No active TPO account was found for this institution." });
  const issued = await issueActivationInvite({ name: tpo.name, email: tpo.email, role: "tpo", institutionId, invitedBy: request.auth!.userId, expiresInHours: 24, revokePrevious: true, purpose: "credential_reissue", targetUserId: tpo._id });
  await writeAdminAudit({ platformAdminId: request.auth!.userId, action: "tpo_credential_reissued", targetType: "user", targetId: tpo._id, metadata: { institutionId, reason: input.reason, email: tpo.email } });
  return response.status(201).json({ invite: { id: issued.invite._id, email: issued.invite.email, expiresAt: issued.invite.expiresAt }, activationPath: issued.activationPath, delivery: "provider_not_configured" });
});

router.get("/recruiter-organizations", async (request, response) => {
  const input = z.object({ search: z.string().trim().max(100).default(""), status: z.enum(["all", "pending", "verified", "rejected", "suspended"]).default("pending") }).parse(request.query);
  const filter = {
    ...(input.status === "suspended" ? { suspendedAt: { $ne: null } } : input.status !== "all" ? { verificationStatus: input.status, suspendedAt: null } : {}),
    ...(input.search ? { $or: [{ companyName: new RegExp(input.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }, { companyDomain: new RegExp(input.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }] } : {}),
  };
  const [organizations, grants, marketplace] = await Promise.all([
    RecruiterOrganization.find(filter).sort({ createdAt: -1 }).lean(),
    DriveAccessGrant.aggregate<{ _id: Types.ObjectId; approved: number; total: number }>([{ $group: { _id: "$recruiterOrgId", approved: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } }, total: { $sum: 1 } } }]),
    MarketplaceRequest.aggregate<{ _id: Types.ObjectId; approved: number; aggregate: number; candidate: number; total: number }>([{ $group: { _id: "$recruiterOrgId", approved: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } }, aggregate: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "approved"] }, { $eq: ["$grantedAccessLevel", "aggregate_stats"] }] }, 1, 0] } }, candidate: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "approved"] }, { $eq: ["$grantedAccessLevel", "candidate_access"] }] }, 1, 0] } }, total: { $sum: 1 } } }]),
  ]);
  const grantMap = new Map(grants.map(row => [String(row._id), row]));
  const marketplaceMap = new Map(marketplace.map(row => [String(row._id), row]));
  return response.json({ organizations: organizations.map(organization => ({ ...organization, approvedGrantCount: grantMap.get(String(organization._id))?.approved ?? 0, totalGrantCount: grantMap.get(String(organization._id))?.total ?? 0, marketplaceApprovedCount: marketplaceMap.get(String(organization._id))?.approved ?? 0, marketplaceAggregateCount: marketplaceMap.get(String(organization._id))?.aggregate ?? 0, marketplaceCandidateCount: marketplaceMap.get(String(organization._id))?.candidate ?? 0, marketplaceRequestCount: marketplaceMap.get(String(organization._id))?.total ?? 0 })) });
});

router.get("/recruiter-organizations/:organizationId", async (request, response) => {
  const organizationId = objectId.parse(request.params.organizationId);
  const organization = await RecruiterOrganization.findById(organizationId).lean();
  if (!organization) return response.status(404).json({ message: "Recruiter organization not found." });
  const [grants, recruiters, marketplaceRequests] = await Promise.all([
    DriveAccessGrant.find({ recruiterOrgId: organizationId }).populate("institutionId", "name status").populate("driveId", "title companyName status startsAt").sort({ requestedAt: -1 }).lean(),
    User.find({ recruiterOrgId: organizationId, role: "recruiter" }).select("name email status lastLoginAt createdAt").lean(),
    MarketplaceRequest.find({ recruiterOrgId: organizationId }).populate("institutionId", "name status").sort({ createdAt: -1 }).lean(),
  ]);
  return response.json({ organization, grants, recruiters, marketplaceRequests });
});

router.patch("/recruiter-organizations/:organizationId", async (request, response) => {
  const organizationId = objectId.parse(request.params.organizationId);
  const input = z.object({ action: z.enum(["verify", "reject", "suspend", "restore"]), reason: z.string().trim().max(500).default("") }).parse(request.body);
  if (["reject", "suspend"].includes(input.action) && input.reason.length < 3) return response.status(400).json({ message: "Please record a reason for this decision." });
  const status = input.action === "verify" || input.action === "restore" ? "verified" : input.action === "reject" ? "rejected" : undefined;
  const update = input.action === "suspend"
    ? { $set: { suspendedAt: new Date() } }
    : { $set: { ...(status ? { verificationStatus: status } : {}), suspendedAt: null, ...(input.action === "verify" ? { verifiedByPlatformAdminId: request.auth!.userId, verifiedAt: new Date() } : {}) } };
  const organization = await RecruiterOrganization.findByIdAndUpdate(organizationId, update, { returnDocument: "after" });
  if (!organization) return response.status(404).json({ message: "Recruiter organization not found." });
  if (input.action === "verify" || input.action === "restore") await User.updateMany({ recruiterOrgId: organization._id, role: "recruiter" }, { $set: { status: "active" } });
  if (input.action === "reject" || input.action === "suspend") await User.updateMany({ recruiterOrgId: organization._id, role: "recruiter" }, { $set: { status: "suspended" } });
  const action = ({ verify: "recruiter_org_verified", reject: "recruiter_org_rejected", suspend: "recruiter_org_suspended", restore: "recruiter_org_reactivated" } as const)[input.action];
  await writeAdminAudit({ platformAdminId: request.auth!.userId, action, targetType: "recruiterOrganization", targetId: organization._id, metadata: { reason: input.reason || undefined, companyName: organization.companyName } });
  return response.json({ organization });
});

router.get("/audit-log", async (request, response) => {
  const input = z.object({
    adminId: z.string().default(""),
    action: z.enum(["", ...adminAuditActions]).default(""),
    from: z.string().default(""),
    to: z.string().default(""),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(10).max(100).default(25),
  }).parse(request.query);
  const filter: Record<string, unknown> = {};
  if (input.adminId && Types.ObjectId.isValid(input.adminId)) filter.platformAdminId = input.adminId;
  if (input.action) filter.action = input.action;
  if (input.from || input.to) filter.createdAt = { ...(input.from ? { $gte: new Date(`${input.from}T00:00:00.000Z`) } : {}), ...(input.to ? { $lte: new Date(`${input.to}T23:59:59.999Z`) } : {}) };
  const [entries, total, admins] = await Promise.all([
    AdminAuditLogEntry.find(filter).sort({ createdAt: -1 }).skip((input.page - 1) * input.limit).limit(input.limit).populate("platformAdminId", "name email").lean(),
    AdminAuditLogEntry.countDocuments(filter),
    User.find({ role: "platform_admin" }).select("name email").sort({ name: 1 }).lean(),
  ]);
  return response.json({ entries, total, page: input.page, pages: Math.max(1, Math.ceil(total / input.limit)), admins, actions: adminAuditActions });
});

export { router as platformRouter };
