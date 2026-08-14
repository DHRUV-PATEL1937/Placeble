import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

const rosterUploadBatchSchema = new Schema({
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", required: true, index: true },
  uploadedByTpoId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  fileName: { type: String, required: true },
  totalRows: { type: Number, required: true },
  successfulRows: { type: Number, default: 0 },
  updatedRows: { type: Number, default: 0 },
  skippedRows: { type: Number, default: 0 },
  errorRows: [{ row: Number, reason: String }],
  uploadedAt: { type: Date, default: Date.now },
}, { timestamps: true });

type RosterUploadBatchShape = InferSchemaType<typeof rosterUploadBatchSchema>;
export const RosterUploadBatch = (models.RosterUploadBatch as Model<RosterUploadBatchShape> | undefined) ?? model<RosterUploadBatchShape>("RosterUploadBatch", rosterUploadBatchSchema);
