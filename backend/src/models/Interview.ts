import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

export const interviewTypes = ["hr", "technical", "behavioral", "mixed"] as const;
export type InterviewType = typeof interviewTypes[number];

const interviewTurnSchema = new Schema({
  turnNumber: { type: Number, required: true, min: 1 },
  question: { type: String, required: true },
  questionAudioUrl: { type: String, default: "" },
  answerTranscript: { type: String, required: true },
  answerAudioUrl: { type: String, default: "" },
  answerVideoUrl: { type: String, default: "" },
  timeSpentSeconds: { type: Number, min: 0, default: 0 },
  scores: {
    structure: { type: Number, min: 0, max: 10, required: true },
    relevance: { type: Number, min: 0, max: 10, required: true },
    specificity: { type: Number, min: 0, max: 10, required: true },
    fillerWordRate: { type: Number, min: 0, max: 100, required: true },
  },
  feedback: { type: String, required: true },
}, { _id: false });

const interviewSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type: { type: String, enum: interviewTypes, required: true },
  targetRole: { type: String, trim: true, default: "" },
  turns: { type: [interviewTurnSchema], default: [] },
  totalTurns: { type: Number, min: 3, max: 8, default: 5 },
  currentQuestion: { type: String, default: "" },
  processingTurn: { type: Number, min: 0, default: 0 },
  overallScore: { type: Number, min: 0, max: 100 },
  overallFeedback: { type: String, default: "" },
  strengths: { type: [String], default: [] },
  improvements: { type: [String], default: [] },
  status: { type: String, enum: ["setup", "in_progress", "completed", "abandoned"], default: "setup", index: true },
  startedAt: { type: Date, required: true, default: Date.now },
  completedAt: { type: Date },
}, { timestamps: true });

interviewSchema.index({ studentId: 1, createdAt: -1 });
interviewSchema.post("save", document => { if (document.status === "completed") void import("../services/readiness-service").then(({ recomputeReadiness }) => recomputeReadiness(String(document.studentId), "interview_completed")).catch(console.error); });
type InterviewShape = InferSchemaType<typeof interviewSchema>;
export const Interview = (models.Interview as Model<InterviewShape> | undefined) ?? model<InterviewShape>("Interview", interviewSchema);
