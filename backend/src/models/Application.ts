import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

export const applicationStatuses = ["saved", "applied", "interviewing", "offer", "rejected", "withdrawn"] as const;
const statusHistorySchema = new Schema({ status: { type: String, enum: applicationStatuses, required: true }, changedAt: { type: Date, required: true, default: Date.now } }, { _id: false });
const applicationSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true, index: true },
  status: { type: String, enum: applicationStatuses, required: true, default: "saved", index: true },
  appliedAt: { type: Date },
  statusHistory: { type: [statusHistorySchema], default: [] },
  notes: { type: String, maxlength: 4000, default: "" },
}, { timestamps: true });
applicationSchema.index({ studentId: 1, jobId: 1 }, { unique: true });
type ApplicationShape = InferSchemaType<typeof applicationSchema>;
export const Application = (models.Application as Model<ApplicationShape> | undefined) ?? model<ApplicationShape>("Application", applicationSchema);
