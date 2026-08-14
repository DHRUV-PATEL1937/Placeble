import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

const institutionLeadSchema = new Schema({
  institutionName: { type: String, required: true, trim: true },
  contactName: { type: String, required: true, trim: true },
  workEmail: { type: String, required: true, lowercase: true, trim: true },
  note: { type: String, default: "", trim: true },
  status: { type: String, enum: ["new", "contacted", "closed"], default: "new" },
}, { timestamps: true });

type InstitutionLeadShape = InferSchemaType<typeof institutionLeadSchema>;
export const InstitutionLead = (models.InstitutionLead as Model<InstitutionLeadShape> | undefined) ?? model<InstitutionLeadShape>("InstitutionLead", institutionLeadSchema);
