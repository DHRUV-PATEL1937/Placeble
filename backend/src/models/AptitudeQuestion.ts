import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

export const aptitudeCategories = ["quant", "logical", "verbal", "coding"] as const;
export const aptitudeDifficulties = ["easy", "medium", "hard"] as const;

const testCaseSchema = new Schema({
  input: { type: String, required: true },
  expectedOutput: { type: String, required: true },
  hidden: { type: Boolean, default: false },
}, { _id: false });

const exampleSchema = new Schema({
  input: { type: String, required: true },
  output: { type: String, required: true },
  explanation: { type: String, default: "" },
}, { _id: false });

const aptitudeQuestionSchema = new Schema({
  seedKey: { type: String, required: true, unique: true, index: true },
  title: { type: String },
  category: { type: String, enum: aptitudeCategories, required: true, index: true },
  topic: { type: String, required: true, index: true },
  difficulty: { type: String, enum: aptitudeDifficulties, required: true, index: true },
  prompt: { type: String, required: true },
  options: [{ type: String }],
  correctOptionIndex: { type: Number },
  explanation: { type: String, default: "" },
  starterCode: { type: Map, of: String, default: {} },
  testCases: { type: [testCaseSchema], default: [] },
  examples: { type: [exampleSchema], default: [] },
  constraints: [{ type: String }],
  hints: [{ type: String }],
  timeLimitSeconds: { type: Number, min: 15, max: 900, default: 120 },
  tags: [{ type: String }],
  source: { type: String, enum: ["curated", "gemini", "sarvam", "openai"], default: "curated", index: true },
  generationBatchId: { type: String, default: "", index: true },
  generatedAt: { type: Date },
  isActive: { type: Boolean, default: true, index: true },
}, { timestamps: true });

aptitudeQuestionSchema.index({ category: 1, topic: 1, difficulty: 1, isActive: 1 });

type AptitudeQuestionShape = InferSchemaType<typeof aptitudeQuestionSchema>;
export const AptitudeQuestion = (models.AptitudeQuestion as Model<AptitudeQuestionShape> | undefined) ?? model<AptitudeQuestionShape>("AptitudeQuestion", aptitudeQuestionSchema);
