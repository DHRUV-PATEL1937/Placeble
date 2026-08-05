import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

const refreshSessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  revokedAt: { type: Date, default: null },
  replacedByTokenHash: { type: String, default: null },
  userAgent: { type: String, default: "" },
  ipAddress: { type: String, default: "" },
}, { timestamps: true });

type RefreshSessionShape = InferSchemaType<typeof refreshSessionSchema>;
export const RefreshSession = (models.RefreshSession as Model<RefreshSessionShape> | undefined) ?? model<RefreshSessionShape>("RefreshSession", refreshSessionSchema);
