import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

const coverLetterSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  applicationId: { type: Schema.Types.ObjectId, ref: "Application", default: null, index: true },
  resumeId: { type: Schema.Types.ObjectId, ref: "Resume", required: true, index: true },
  targetJdText: { type: String, maxlength: 30000, default: "" },
  companyName: { type: String, trim: true, maxlength: 180, default: "" },
  hiringManagerName: { type: String, trim: true, maxlength: 180, default: "" },
  bodyText: { type: String, required: true, maxlength: 12000 },
  status: { type: String, enum: ["draft", "final"], required: true, default: "draft", index: true },
}, { timestamps: true });

coverLetterSchema.index({ studentId: 1, updatedAt: -1 });
type CoverLetterShape = InferSchemaType<typeof coverLetterSchema>;
export const CoverLetter = (models.CoverLetter as Model<CoverLetterShape> | undefined) ?? model<CoverLetterShape>("CoverLetter", coverLetterSchema);
