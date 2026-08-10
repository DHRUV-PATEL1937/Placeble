import mongoose, { type InferSchemaType, type Model } from "mongoose";
import { aptitudeCategories } from "./AptitudeQuestion";
const { model, models, Schema } = mongoose;

const responseSchema = new Schema({
  questionId: { type: Schema.Types.ObjectId, ref: "AptitudeQuestion", required: true },
  selectedOptionIndex: { type: Number },
  codeSubmission: {
    language: { type: String },
    code: { type: String },
  },
  isCorrect: { type: Boolean, default: false },
  awardedFraction: { type: Number, min: 0, max: 1, default: 0 },
  timeSpentSeconds: { type: Number, min: 0, default: 0 },
}, { _id: false });

const aptitudeAttemptSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  sections: [{ type: String, enum: aptitudeCategories }],
  questionIds: [{ type: Schema.Types.ObjectId, ref: "AptitudeQuestion" }],
  responses: { type: [responseSchema], default: [] },
  scoreTotal: { type: Number, min: 0, max: 100, default: 0 },
  scoreByCategory: { type: Map, of: Number, default: {} },
  scoreByTopic: { type: Map, of: Number, default: {} },
  startedAt: { type: Date, required: true, default: Date.now },
  completedAt: { type: Date },
  durationSeconds: { type: Number, min: 60, max: 7200, default: 900 },
  status: { type: String, enum: ["in_progress", "completed", "abandoned"], default: "in_progress", index: true },
  mode: { type: String, enum: ["balanced", "focused"], default: "balanced" },
  focusTopic: { type: String, default: "" },
}, { timestamps: true });

aptitudeAttemptSchema.index({ studentId: 1, createdAt: -1 });

type AptitudeAttemptShape = InferSchemaType<typeof aptitudeAttemptSchema>;
export const AptitudeAttempt = (models.AptitudeAttempt as Model<AptitudeAttemptShape> | undefined) ?? model<AptitudeAttemptShape>("AptitudeAttempt", aptitudeAttemptSchema);
