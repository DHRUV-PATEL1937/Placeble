import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

export const agentResultKinds = ["case_study", "hr_simulation"] as const;

/** One finished, scored run of an agent that doesn't keep its own history (Business Case Solver, HR Manager Simulator). Feeds the readiness score. */
const agentResultSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  agent: { type: String, enum: agentResultKinds, required: true },
  score: { type: Number, min: 0, max: 100, required: true },
  // Shown in the student's history on the agent page: the case title, and a short label such as the company or verdict.
  title: { type: String, maxlength: 200, default: "" },
  detail: { type: String, maxlength: 200, default: "" },
  createdAt: { type: Date, default: Date.now },
});
agentResultSchema.index({ studentId: 1, agent: 1, createdAt: -1 });

type Shape = InferSchemaType<typeof agentResultSchema>;
export const AgentResult = (models.AgentResult as Model<Shape> | undefined) ?? model<Shape>("AgentResult", agentResultSchema);
