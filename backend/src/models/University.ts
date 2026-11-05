import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

/** A group of institutes (colleges). Optional: an institute can exist without one. */
const universitySchema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true },
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
  status: { type: String, enum: ["active", "suspended"], default: "active", index: true },
  createdByPlatformAdminId: { type: Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

export type UniversityDocument = InferSchemaType<typeof universitySchema>;
export const University = (models.University as Model<UniversityDocument> | undefined) ?? model<UniversityDocument>("University", universitySchema);
