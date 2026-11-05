import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

const institutionSchema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true },
  universityId: { type: Schema.Types.ObjectId, ref: "University", default: null, index: true },
  officialDomains: [{ type: String, lowercase: true }],
  approvedEmailDomains: [{ type: String, lowercase: true, trim: true }],
  // Pilot = a free trial with an end date. Customer = a paying account. Missing means customer, so older records keep working.
  commercial: {
    type: { type: String, enum: ["pilot", "customer"], default: "customer" },
    pilotStartsAt: { type: Date, default: null },
    pilotEndsAt: { type: Date, default: null },
    convertedAt: { type: Date, default: null },
    note: { type: String, default: "", maxlength: 300 },
  },
  logoUrl: { type: String, default: "" },
  logoPublicId: { type: String, default: "" },
  status: { type: String, enum: ["active", "pending", "suspended"], default: "active" },
  createdByPlatformAdminId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  marketplaceListing: {
    isListed: { type: Boolean, default: false },
    listedAt: { type: Date, default: null },
    headline: { type: String, trim: true, maxlength: 240, default: "" },
    studentCountBand: { type: String, enum: ["", "Under 250", "250-500", "500-1000", "1000-2500", "2500+"], default: "" },
    topBranches: [{ type: String, trim: true, maxlength: 60 }],
  },
}, { timestamps: true });

export type InstitutionDocument = InferSchemaType<typeof institutionSchema>;
export const Institution = (models.Institution as Model<InstitutionDocument> | undefined) ?? model<InstitutionDocument>("Institution", institutionSchema);
