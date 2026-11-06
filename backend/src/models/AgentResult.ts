import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

export const agentResultKinds = ["case_study", "hr_simulation"] as const;

/** One finished, scored run of an agent that doesn't keep its own history (Business Case Solver, HR Manager Simulator). Feeds the readiness score. */
const agentResultSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  agent: { type: String, enum: agentResultKinds, required: true },
  score: { type: Number, min: 0, max: 100, required: true },
  createdAt: { type: Date, default: Date.now },
});
agentResultSchema.index({ studentId: 1, agent: 1, createdAt: -1 });

type Shape = InferSchemaType<typeof agentResultSchema>;
export const AgentResult = (models.AgentResult as Model<Shape> | undefined) ?? model<Shape>("AgentResult", agentResultSchema);
