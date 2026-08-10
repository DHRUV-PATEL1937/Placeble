import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

export const workModes = ["remote", "hybrid", "onsite"] as const;
export const employmentTypes = ["full_time", "internship"] as const;

const jobSchema = new Schema({
  title: { type: String, required: true, trim: true, index: true },
  companyName: { type: String, required: true, trim: true, index: true },
  description: { type: String, required: true },
  requiredSkills: { type: [String], default: [] },
  location: { type: String, required: true },
  workMode: { type: String, enum: workModes, required: true },
  employmentType: { type: String, enum: employmentTypes, required: true },
  salaryLabel: { type: String, default: "" },
  postedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  institutionScope: [{ type: Schema.Types.ObjectId, ref: "Institution" }],
  embedding: { type: [Number], default: [] },
  embeddingUpdatedAt: { type: Date },
  embeddingTemplateVersion: { type: String, default: "" },
  isActive: { type: Boolean, default: true, index: true },
}, { timestamps: true });

jobSchema.index({ isActive: 1, createdAt: -1 });
jobSchema.index({ companyName: 1, title: 1 }, { unique: true });
type JobShape = InferSchemaType<typeof jobSchema>;
export const Job = (models.Job as Model<JobShape> | undefined) ?? model<JobShape>("Job", jobSchema);
