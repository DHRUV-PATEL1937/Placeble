import type { UserRole } from "../models/User";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: UserRole;
        institutionId?: string;
        /** The student's batch has ended: they can look but not change anything. */
        graduated?: boolean;
        universityId?: string;
        /** Set on a university TPO token that is working inside one of its institutes. */
        actingInstitutionId?: string;
        recruiterOrgId?: string;
      };
      institutionScope?: string;
      driveAccess?: { driveId: string; institutionId: string; recruiterOrgId: string };
    }
  }
}

export {};
