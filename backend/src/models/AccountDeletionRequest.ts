import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

/**
 * Someone's request to have their account deleted. A superadmin reviews it.
 * pending -> approved (account closed and personal details removed) or pending -> rejected. The person can also cancel while pending.
 */
const accountDeletionRequestSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  // Snapshot taken when they asked: the account is anonymised on approval, so the admin's history must not depend on it.
  name: { type: String, default: "" },
  email: { type: String, default: "" },
  role: { type: String, default: "" },
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", default: null },
  reason: { type: String, default: "", trim: true, maxlength: 500 },
  status: { type: String, enum: ["pending", "approved", "rejected", "cancelled"], default: "pending", index: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  reviewNote: { type: String, default: "", maxlength: 500 },
  decidedAt: { type: Date, default: null },
}, { timestamps: true });
accountDeletionRequestSchema.index({ createdAt: -1 });
// One open request per person.
accountDeletionRequestSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { status: "pending" } });

type Shape = InferSchemaType<typeof accountDeletionRequestSchema>;
export const AccountDeletionRequest = (models.AccountDeletionRequest as Model<Shape> | undefined) ?? model<Shape>("AccountDeletionRequest", accountDeletionRequestSchema);
