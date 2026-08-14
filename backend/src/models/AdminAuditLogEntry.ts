import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { model, models, Schema } = mongoose;

export const adminAuditActions = [
  "institution_created",
  "institution_suspended",
  "institution_reactivated",
  "recruiter_org_verified",
  "recruiter_org_rejected",
  "recruiter_org_suspended",
  "recruiter_org_reactivated",
  "tpo_credential_reissued",
  "admin_viewed_institution_detail",
] as const;

const adminAuditLogEntrySchema = new Schema({
  platformAdminId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  action: { type: String, enum: adminAuditActions, required: true, index: true },
  targetType: { type: String, enum: ["institution", "recruiterOrganization", "user"], required: true, index: true },
  targetId: { type: Schema.Types.ObjectId, required: true, index: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, immutable: true, index: true },
}, { versionKey: false });

adminAuditLogEntrySchema.index({ createdAt: -1, action: 1 });

type AdminAuditLogEntryShape = InferSchemaType<typeof adminAuditLogEntrySchema>;
export const AdminAuditLogEntry = (models.AdminAuditLogEntry as Model<AdminAuditLogEntryShape> | undefined)
  ?? model<AdminAuditLogEntryShape>("AdminAuditLogEntry", adminAuditLogEntrySchema);
