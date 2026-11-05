import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

/** A programme within an institute, e.g. BSc IT, MSc IT, BCA, MCA. */
const branchSchema = new Schema({
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  code: { type: String, default: "", trim: true, uppercase: true, maxlength: 20 },
  /** Which catalog programme this is (see services/programs.ts). Branches are chosen from that list, never typed. */
  programCode: { type: String, default: null, index: true },
  status: { type: String, enum: ["active", "archived"], default: "active" },
}, { timestamps: true });

// Case-insensitive uniqueness per institute, so "BCA" and "bca" can't both exist.
branchSchema.index({ institutionId: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

branchSchema.index({ institutionId: 1, programCode: 1 }, { unique: true, partialFilterExpression: { programCode: { $type: "string" } } });

export type BranchDocument = InferSchemaType<typeof branchSchema>;
export const Branch = (models.Branch as Model<BranchDocument> | undefined) ?? model<BranchDocument>("Branch", branchSchema);
