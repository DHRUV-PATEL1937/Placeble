import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

const studentRosterEntrySchema = new Schema({
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  fullName: { type: String, required: true, trim: true },
  rollNumber: { type: String, default: "", trim: true },
  branch: { type: String, default: "", trim: true },
  branchId: { type: Schema.Types.ObjectId, ref: "Branch", default: null, index: true },
  batchId: { type: Schema.Types.ObjectId, ref: "Batch", default: null, index: true },
  batchYear: { type: Number, default: null },
  uploadBatchId: { type: Schema.Types.ObjectId, ref: "RosterUploadBatch", required: true, index: true },
  matchedUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  status: { type: String, enum: ["unmatched", "matched"], default: "unmatched", index: true },
  uploadedAt: { type: Date, default: Date.now },
}, { timestamps: true });

studentRosterEntrySchema.index({ institutionId: 1, email: 1 }, { unique: true });
type StudentRosterEntryShape = InferSchemaType<typeof studentRosterEntrySchema>;
export const StudentRosterEntry = (models.StudentRosterEntry as Model<StudentRosterEntryShape> | undefined) ?? model<StudentRosterEntryShape>("StudentRosterEntry", studentRosterEntrySchema);
