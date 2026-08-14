import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

export const resumeSectionTypes = ["summary", "experience", "education", "skills", "projects", "certifications"] as const;

const resumeSectionSchema = new Schema({
  type: { type: String, enum: resumeSectionTypes, required: true },
  order: { type: Number, required: true },
  content: { type: Schema.Types.Mixed, required: true },
}, { _id: true });

const resumeSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, trim: true },
  sections: { type: [resumeSectionSchema], default: [] },
  sourceType: { type: String, enum: ["generated", "uploaded", "hybrid"], required: true },
  targetJdText: { type: String, default: "" },
  atsScore: { type: Number, min: 0, max: 100, default: 0 },
  atsBreakdown: {
    keywordOverlap: { type: Number, min: 0, max: 100, default: 0 },
    semanticSimilarity: { type: Number, min: 0, max: 100, default: 0 },
    missingKeywords: [{ type: String }],
  },
  fileUrl: { type: String, default: "" },
  template: { type: String, enum: ["classic", "modern", "compact"], default: "classic" },
  versionNumber: { type: Number, default: 1 },
  parentVersionId: { type: Schema.Types.ObjectId, ref: "Resume", default: null },
  isCurrent: { type: Boolean, default: true, index: true },
}, { timestamps: true });

resumeSchema.index({ studentId: 1, versionNumber: -1 });
resumeSchema.post("save", document => { void import("../services/readiness-service").then(({ recomputeReadiness }) => recomputeReadiness(String(document.studentId), "resume_saved")).catch(console.error); });

type ResumeShape = InferSchemaType<typeof resumeSchema>;
export const Resume = (models.Resume as Model<ResumeShape> | undefined) ?? model<ResumeShape>("Resume", resumeSchema);
