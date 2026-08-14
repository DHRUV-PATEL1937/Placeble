import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

const marketplaceRequestSchema = new Schema({
  recruiterOrgId: { type: Schema.Types.ObjectId, ref: "RecruiterOrganization", required: true, index: true },
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", required: true, index: true },
  requestedAccessLevel: { type: String, enum: ["aggregate_stats", "candidate_access"], required: true },
  grantedAccessLevel: { type: String, enum: ["aggregate_stats", "candidate_access"], default: null },
  message: { type: String, trim: true, maxlength: 500, default: "" },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
  respondingTpoId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  decidedAt: { type: Date, default: null },
}, { timestamps: true });

marketplaceRequestSchema.index({ recruiterOrgId: 1, institutionId: 1 }, { unique: true });
type MarketplaceRequestShape = InferSchemaType<typeof marketplaceRequestSchema>;
export const MarketplaceRequest = (models.MarketplaceRequest as Model<MarketplaceRequestShape> | undefined) ?? model<MarketplaceRequestShape>("MarketplaceRequest", marketplaceRequestSchema);
