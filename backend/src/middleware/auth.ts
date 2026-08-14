import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { UserRole } from "../models/User";
import { User } from "../models/User";
import { Institution } from "../models/Institution";
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
      recruiterOrgId?: string;
    };
    const user = await User.findOne({ _id: payload.userId, status: "active" }).select("role institutionId recruiterOrgId studentVerificationStatus").lean();
    if (!user || user.role !== payload.role) return response.status(401).json({ message: "This account is not active." });
    if (["student", "tpo", "faculty"].includes(user.role)) {
      if (!user.institutionId) return response.status(403).json({ message: "No institution scope is assigned to this account." });
      const institutionActive = await Institution.exists({ _id: user.institutionId, status: "active" });
      if (!institutionActive) return response.status(403).json({ code: "TENANT_SUSPENDED", message: "This institution workspace is suspended." });
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

export function requireRole(...allowedRoles: UserRole[]) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.auth || !allowedRoles.includes(request.auth.role)) {
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
