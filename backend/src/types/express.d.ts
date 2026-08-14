import type { UserRole } from "../models/User";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: UserRole;
        institutionId?: string;
        recruiterOrgId?: string;
      };
      institutionScope?: string;
      driveAccess?: { driveId: string; institutionId: string; recruiterOrgId: string };
    }
  }
}

export {};
