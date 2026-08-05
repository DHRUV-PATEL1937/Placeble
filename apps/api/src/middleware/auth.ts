import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { UserRole } from "../models/User";

export function requireAuth(request: Request, response: Response, next: NextFunction) {
  const header = request.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return response.status(401).json({ message: "Authentication required." });
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as {
      userId: string;
      role: UserRole;
      institutionId?: string;
    };
    request.auth = payload;
    return next();
  } catch {
    return response.status(401).json({ message: "Your session has expired.", code: "ACCESS_EXPIRED" });
  }
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

