import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

const recruiterOrganizationSchema = new Schema({
  companyName: { type: String, required: true, trim: true },
  companyDomain: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  verificationStatus: { type: String, enum: ["pending", "verified", "rejected"], default: "pending", index: true },
  verifiedByPlatformAdminId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  verifiedAt: { type: Date, default: null },
  suspendedAt: { type: Date, default: null },
}, { timestamps: true });

type RecruiterOrganizationShape = InferSchemaType<typeof recruiterOrganizationSchema>;
export const RecruiterOrganization = (models.RecruiterOrganization as Model<RecruiterOrganizationShape> | undefined) ?? model<RecruiterOrganizationShape>("RecruiterOrganization", recruiterOrganizationSchema);
