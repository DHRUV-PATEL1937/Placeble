import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

export const profileChangeFields = ["degree", "graduationYear"] as const;

/**
 * A direct student's request to change a locked profile detail (course / graduating year).
 * pending -> approved (admin gives ONE edit) -> used (student made that edit), or pending -> rejected.
 */
const profileChangeRequestSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  fields: [{ type: String, enum: profileChangeFields }],
  reason: { type: String, required: true, trim: true, minlength: 10, maxlength: 500 },
  // Snapshot of what they had when they asked, for the admin and the audit trail.
  previous: { degree: { type: String, default: "" }, graduationYear: { type: Number, default: null } },
  status: { type: String, enum: ["pending", "approved", "rejected", "used"], default: "pending", index: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  reviewNote: { type: String, default: "", maxlength: 500 },
  decidedAt: { type: Date, default: null },
  usedAt: { type: Date, default: null },
}, { timestamps: true });
profileChangeRequestSchema.index({ userId: 1, createdAt: -1 });
// A student can only have one open request (pending, or approved and not yet used) at a time.
profileChangeRequestSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { status: { $in: ["pending", "approved"] } } });

type ProfileChangeRequestShape = InferSchemaType<typeof profileChangeRequestSchema>;
export const ProfileChangeRequest = (models.ProfileChangeRequest as Model<ProfileChangeRequestShape> | undefined) ?? model<ProfileChangeRequestShape>("ProfileChangeRequest", profileChangeRequestSchema);
