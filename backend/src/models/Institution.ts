import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

const institutionSchema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true },
  officialDomains: [{ type: String, lowercase: true }],
  status: { type: String, enum: ["active", "pending", "suspended"], default: "active" },
}, { timestamps: true });

export type InstitutionDocument = InferSchemaType<typeof institutionSchema>;
export const Institution = (models.Institution as Model<InstitutionDocument> | undefined) ?? model<InstitutionDocument>("Institution", institutionSchema);
