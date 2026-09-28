import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

const actionItemSchema = new Schema({ key: { type: String, required: true }, title: { type: String, required: true }, detail: { type: String, required: true }, href: { type: String, default: "" }, status: { type: String, enum: ["pending", "completed", "dismissed"], default: "pending" }, completedAt: { type: Date, default: null } }, { _id: true });
const studentActionPlanSchema = new Schema({ studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true }, generatedAt: { type: Date, default: Date.now }, items: { type: [actionItemSchema], default: [] } }, { timestamps: true });
type StudentActionPlanShape = InferSchemaType<typeof studentActionPlanSchema>;
export const StudentActionPlan = (models.StudentActionPlan as Model<StudentActionPlanShape> | undefined) ?? model<StudentActionPlanShape>("StudentActionPlan", studentActionPlanSchema);
