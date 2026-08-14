import { Types } from "mongoose";
import { AdminAuditLogEntry, adminAuditActions } from "../models/AdminAuditLogEntry";

export async function writeAdminAudit(input: {
  platformAdminId: string;
  action: (typeof adminAuditActions)[number];
  targetType: "institution" | "recruiterOrganization" | "user";
  targetId: string | Types.ObjectId;
  metadata?: Record<string, unknown>;
}) {
  return AdminAuditLogEntry.create({
    platformAdminId: input.platformAdminId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: input.metadata ?? {},
  });
}
