import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

export const gdPersonaKeys = ["persona_a", "persona_b", "persona_c"] as const;
const personaSchema = new Schema({
  key: { type: String, enum: gdPersonaKeys, required: true },
  name: { type: String, required: true },
  stance: { type: String, enum: ["assertive", "analytical", "agreeable"], required: true },
  systemPrompt: { type: String, required: true },
  avatarKey: { type: String, required: true },
  description: { type: String, required: true },
  topicPosition: { type: String, required: true },
}, { _id: false });

const turnSchema = new Schema({
  turnNumber: { type: Number, required: true },
  speaker: { type: String, enum: ["student", ...gdPersonaKeys], required: true },
  text: { type: String, required: true, maxlength: 6000 },
  audioUrl: { type: String, default: "" },
  timestampStart: { type: Number, min: 0, required: true },
  timestampEnd: { type: Number, min: 0, required: true },
  generationLatencyMs: { type: Number, min: 0 },
}, { _id: false });

const orchestrationSchema = new Schema({
  revision: { type: Number, min: 0, default: 0 },
  processing: { type: Boolean, default: false },
  currentPersonaKey: { type: String, enum: [...gdPersonaKeys, ""], default: "" },
  deferredPersonaKey: { type: String, enum: [...gdPersonaKeys, ""], default: "" },
  turnCap: { type: Number, min: 6, max: 20, default: 12 },
  endsAtMs: { type: Number, min: 120000, default: 480000 },
}, { _id: false });

const gdSessionSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  topic: { type: String, required: true, trim: true, maxlength: 300 },
  personas: { type: [personaSchema], required: true },
  turns: { type: [turnSchema], default: [] },
  observerMetrics: {
    clarity: { type: Number, min: 0, max: 10, default: 0 },
    confidence: { type: Number, min: 0, max: 10, default: 0 },
    leadership: { type: Number, min: 0, max: 10, default: 0 },
    relevance: { type: Number, min: 0, max: 10, default: 0 },
  },
  heuristicFlags: {
    interruptionCount: { type: Number, min: 0, default: 0 },
    longestSilenceSeconds: { type: Number, min: 0, default: 0 },
    speakingTimeShare: { type: Number, min: 0, max: 1, default: 0 },
  },
  observerFeedback: { type: String, maxlength: 3000, default: "" },
  observerStrengths: { type: [String], default: [] },
  observerImprovements: { type: [String], default: [] },
  status: { type: String, enum: ["setup", "in_progress", "completed", "abandoned"], default: "setup", index: true },
  startedAt: { type: Date, required: true, default: Date.now },
  completedAt: { type: Date },
  orchestration: { type: orchestrationSchema, required: true, default: () => ({}) },
}, { timestamps: true });

gdSessionSchema.index({ studentId: 1, createdAt: -1 });
type GdSessionShape = InferSchemaType<typeof gdSessionSchema>;
export const GdSession = (models.GdSession as Model<GdSessionShape> | undefined) ?? model<GdSessionShape>("GdSession", gdSessionSchema);
