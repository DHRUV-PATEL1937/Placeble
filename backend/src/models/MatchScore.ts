import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

const matchScoreSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true, index: true },
  matchPercent: { type: Number, min: 0, max: 100, required: true },
  missingSkills: { type: [String], default: [] },
  matchedSkills: { type: [String], default: [] },
  computedAt: { type: Date, required: true, default: Date.now },
  studentProfileVersion: { type: Number, min: 1, required: true },
  embeddingModel: { type: String, required: true },
}, { timestamps: true });

matchScoreSchema.index({ studentId: 1, jobId: 1 }, { unique: true });
matchScoreSchema.index({ studentId: 1, matchPercent: -1 });
type MatchScoreShape = InferSchemaType<typeof matchScoreSchema>;
export const MatchScore = (models.MatchScore as Model<MatchScoreShape> | undefined) ?? model<MatchScoreShape>("MatchScore", matchScoreSchema);
