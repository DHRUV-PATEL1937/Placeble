import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

const driveAccessGrantSchema = new Schema({
  recruiterOrgId: { type: Schema.Types.ObjectId, ref: "RecruiterOrganization", required: true, index: true },
  driveId: { type: Schema.Types.ObjectId, ref: "Drive", required: true, index: true },
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", required: true, index: true },
  grantedByTpoId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  status: { type: String, enum: ["requested", "approved", "revoked"], default: "requested", index: true },
  requestedAt: { type: Date, default: Date.now },
  decidedAt: { type: Date, default: null },
  accessLevel: { type: String, enum: ["aggregate_stats", "candidate_access"], default: "candidate_access", index: true },
  requestedAccessLevel: { type: String, enum: ["aggregate_stats", "candidate_access"], default: "candidate_access" },
  relationshipSource: { type: String, enum: ["marketplace", "direct_tpo"], default: "direct_tpo" },
}, { timestamps: true });

driveAccessGrantSchema.index({ recruiterOrgId: 1, driveId: 1 }, { unique: true });
type DriveAccessGrantShape = InferSchemaType<typeof driveAccessGrantSchema>;
export const DriveAccessGrant = (models.DriveAccessGrant as Model<DriveAccessGrantShape> | undefined) ?? model<DriveAccessGrantShape>("DriveAccessGrant", driveAccessGrantSchema);
