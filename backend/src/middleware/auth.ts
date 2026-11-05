import { pilotEnded } from "../services/pilot-service";
const PILOT_ENDED_MESSAGE = "This pilot has ended, so the workspace is paused. Contact Placeble to continue. Nothing has been deleted.";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { UserRole } from "../models/User";
import { User } from "../models/User";
import { Institution } from "../models/Institution";
import { University } from "../models/University";
import { studentAccess } from "../models/Batch";
import { RecruiterOrganization } from "../models/RecruiterOrganization";
import { DriveAccessGrant } from "../models/DriveAccessGrant";
import { MarketplaceRequest } from "../models/MarketplaceRequest";

export async function requireAuth(request: Request, response: Response, next: NextFunction) {
  const header = request.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return response.status(401).json({ message: "Authentication required." });
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as {
      userId: string;
      role: UserRole;
      institutionId?: string;
      universityId?: string;
      graduated?: boolean;
      actingInstitutionId?: string;
      recruiterOrgId?: string;
      iat?: number;
    };
    const user = await User.findOne({ _id: payload.userId, status: "active" }).select("role institutionId universityId recruiterOrgId studentVerificationStatus passwordChangedAt batchEndsAt").lean();
    if (!user || user.role !== payload.role) return response.status(401).json({ message: "This account is not active." });
    if (user.passwordChangedAt && (!payload.iat || payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000))) return response.status(401).json({ message: "Your password changed. Please sign in again.", code: "ACCESS_EXPIRED" });
    if (user.role === "university_admin") {
      if (!user.universityId) return response.status(403).json({ message: "No university scope is assigned to this account." });
      const university = await University.findOne({ _id: user.universityId, status: "active" }).select("commercial").lean();
      if (!university) return response.status(403).json({ code: "TENANT_SUSPENDED", message: "This university workspace is suspended." });
      if (pilotEnded(university.commercial)) return response.status(403).json({ code: "PILOT_ENDED", message: PILOT_ENDED_MESSAGE });
      payload.universityId = user.universityId.toString();
      if (payload.actingInstitutionId) {
        // A university TPO may only work inside institutes that belong to its own university.
        const institute = await Institution.exists({ _id: payload.actingInstitutionId, universityId: user.universityId, status: "active" });
        if (!institute) return response.status(403).json({ code: "OUTSIDE_UNIVERSITY_SCOPE", message: "That institute is not part of your university." });
        payload.institutionId = payload.actingInstitutionId;
      } else delete payload.institutionId;
    }
    // A student with no institute is a direct (B2C) student: no institute scope, and that's fine.
    const directStudent = user.role === "student" && !user.institutionId;
    if (!directStudent && ["student", "tpo", "faculty", "principal"].includes(user.role)) {
      if (!user.institutionId) return response.status(403).json({ message: "No institution scope is assigned to this account." });
      const institute = await Institution.findOne({ _id: user.institutionId, status: "active" }).select("commercial universityId").lean();
      if (!institute) return response.status(403).json({ code: "TENANT_SUSPENDED", message: "This institution workspace is suspended." });
      const parent = institute.universityId ? await University.findById(institute.universityId).select("commercial").lean() : null;
      if (pilotEnded(institute.commercial) || pilotEnded(parent?.commercial)) return response.status(403).json({ code: "PILOT_ENDED", message: PILOT_ENDED_MESSAGE });
      payload.institutionId = user.institutionId.toString();
    }
    if (user.role === "student" && !["approved", "roster_matched"].includes(user.studentVerificationStatus ?? "")) {
      return response.status(403).json({ code: "STUDENT_APPROVAL_PENDING", message: "Your institution TPO must approve your account before you can use Placeble." });
    }
    if (user.role === "recruiter") {
      if (!user.recruiterOrgId) return response.status(403).json({ message: "No recruiter organization is assigned to this account." });
      const organization = await RecruiterOrganization.findById(user.recruiterOrgId).select("verificationStatus suspendedAt").lean();
      if (!organization || organization.verificationStatus !== "verified" || organization.suspendedAt) return response.status(403).json({ code: "RECRUITER_ORG_UNAVAILABLE", message: "Your recruiter organization is not currently verified." });
      payload.recruiterOrgId = user.recruiterOrgId.toString();
    }
    if (user.role === "student") {
      const access = studentAccess(user.batchEndsAt);
      if (access === "closed") return response.status(403).json({ code: "BATCH_ENDED", message: "Your batch has ended and access has now closed. Contact your placement office if you think this is a mistake." });
      if (access === "graduate") {
        payload.graduated = true;
        // Graduates can look and download, but not change anything.
        const mutating = !["GET", "HEAD", "OPTIONS"].includes(request.method);
        if (mutating && !/\/api\/v1\/auth\/|\/export\//.test(request.originalUrl)) return response.status(403).json({ code: "BATCH_READ_ONLY", message: "Your batch has ended, so your workspace is read-only. You can still view and download your resume and reports." });
      }
    }
    request.auth = payload;
    return next();
  } catch {
    return response.status(401).json({ message: "Your session has expired.", code: "ACCESS_EXPIRED" });
  }
}

export async function requireDriveAccess(request: Request, response: Response, next: NextFunction) {
  const recruiterOrgId = request.auth?.recruiterOrgId;
  const rawDriveId = request.params.driveId ?? request.query.driveId ?? request.body?.driveId;
  const driveId = Array.isArray(rawDriveId) ? rawDriveId[0] : typeof rawDriveId === "string" ? rawDriveId : "";
  if (!recruiterOrgId || !driveId) return response.status(403).json({ message: "An approved drive scope is required." });
  const grant = await DriveAccessGrant.findOne({ recruiterOrgId, driveId, status: "approved", $or: [{ accessLevel: "candidate_access" }, { accessLevel: { $exists: false } }] }).lean();
  if (!grant) return response.status(403).json({ code: "OUTSIDE_DRIVE_SCOPE", message: "This drive is outside your approved recruiter scope." });
  if (grant.relationshipSource === "marketplace" && !await MarketplaceRequest.exists({ recruiterOrgId, institutionId: grant.institutionId, status: "approved", grantedAccessLevel: "candidate_access" })) return response.status(403).json({ code: "MARKETPLACE_CANDIDATE_ACCESS_REQUIRED", message: "Candidate access has not been approved at the institution relationship level." });
  request.driveAccess = { driveId, institutionId: grant.institutionId.toString(), recruiterOrgId };
  return next();
}

/**
 * A university TPO can do everything an institute TPO can (inside an institute it has entered),
 * and a principal can do everything a read-only role can. Routes keep naming only "tpo" / "faculty".
 */
const ROLE_ALSO_SATISFIES: Partial<Record<UserRole, UserRole[]>> = { university_admin: ["tpo"], principal: ["faculty"] };
export const roleSatisfies = (actual: UserRole, allowed: readonly UserRole[]) => allowed.includes(actual) || (ROLE_ALSO_SATISFIES[actual] ?? []).some(role => allowed.includes(role));

export function requireRole(...allowedRoles: UserRole[]) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.auth || !roleSatisfies(request.auth.role, allowedRoles)) {
      return response.status(403).json({ message: "You do not have permission to perform this action." });
    }
    return next();
  };
}

export function requireInstitutionScope(request: Request, response: Response, next: NextFunction) {
  const institutionId = request.auth?.institutionId;
  if (!institutionId) return response.status(403).json({ message: "No institution scope is assigned to this account." });
  request.institutionScope = institutionId;
  return next();
}

export type TpoPermission = "roster" | "approvals" | "recruiters" | "settings" | "messaging";

/**
 * Institute TPOs can be restricted by their university TPO. University TPOs, and institutes that
 * have no university (where the institute TPO is the top admin), are never restricted.
 */
export function requireTpoPermission(permission: TpoPermission) {
  return async (request: Request, response: Response, next: NextFunction) => {
    if (request.auth?.role !== "tpo") return next();
    const user = await User.findById(request.auth.userId).select("tpoPermissions").lean();
    if (user?.tpoPermissions?.[permission] === false) {
      return response.status(403).json({ code: "PERMISSION_REVOKED", message: "Your university has turned off this action for your account. Contact your university TPO." });
    }
    return next();
  };
}
