import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

const componentSchema = new Schema({
  resume: { type: Number, min: 0, max: 100, default: 0 },
  aptitude: { type: Number, min: 0, max: 100, default: 0 },
  interview: { type: Number, min: 0, max: 100, default: 0 },
  groupDiscussion: { type: Number, min: 0, max: 100, default: 0 },
  careerActivity: { type: Number, min: 0, max: 100, default: 0 },
}, { _id: false });

// Which scored agents the student has used at least once. The overall score is shown only when every required one is used.
const agentSchema = new Schema({
  key: { type: String, required: true },
  label: { type: String, required: true },
  view: { type: String, required: true },
  used: { type: Boolean, default: false },
  score: { type: Number, min: 0, max: 100, default: 0 },
}, { _id: false });

const readinessScoreSchema = new Schema({
  agents: { type: [agentSchema], default: [] },
  complete: { type: Boolean, default: false, index: true },
  studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", default: null, index: true },
  score: { type: Number, min: 0, max: 100, required: true },
  components: { type: componentSchema, required: true },
  evidenceCount: { type: Number, min: 0, default: 0 },
  reason: { type: String, required: true, default: "activity" },
  calculatedAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true });

readinessScoreSchema.index({ studentId: 1, calculatedAt: -1 });
readinessScoreSchema.index({ institutionId: 1, calculatedAt: -1 });
type ReadinessScoreShape = InferSchemaType<typeof readinessScoreSchema>;
export const ReadinessScore = (models.ReadinessScore as Model<ReadinessScoreShape> | undefined) ?? model<ReadinessScoreShape>("ReadinessScore", readinessScoreSchema);
