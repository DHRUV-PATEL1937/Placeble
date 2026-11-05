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
  "admin_viewed_student_report",
  "commercial_changed",
  "platform_admin_created",
  "university_created",
  "university_suspended",
  "university_reactivated",
  "b2c_plan_changed",
  "b2c_student_suspended",
  "b2c_student_reactivated",
  "program_changed",
  "b2c_profile_change_approved",
  "b2c_profile_change_rejected",
  "student_made_b2c",
  "account_deletion_approved",
  "account_deletion_rejected",
] as const;

const adminAuditLogEntrySchema = new Schema({
  platformAdminId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  action: { type: String, enum: adminAuditActions, required: true, index: true },
  targetType: { type: String, enum: ["institution", "recruiterOrganization", "user", "university", "program"], required: true, index: true },
  targetId: { type: Schema.Types.ObjectId, required: true, index: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, immutable: true, index: true },
}, { versionKey: false });

adminAuditLogEntrySchema.index({ createdAt: -1, action: 1 });

type AdminAuditLogEntryShape = InferSchemaType<typeof adminAuditLogEntrySchema>;
export const AdminAuditLogEntry = (models.AdminAuditLogEntry as Model<AdminAuditLogEntryShape> | undefined)
  ?? model<AdminAuditLogEntryShape>("AdminAuditLogEntry", adminAuditLogEntrySchema);
