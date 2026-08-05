import mongoose, { type InferSchemaType, type Model } from "mongoose";
import { userRoles } from "./User";
const { model, models, Schema } = mongoose;

const inviteSchema = new Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  role: { type: String, enum: userRoles, required: true },
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", required: true, index: true },
  driveIds: [{ type: String }],
  tokenHash: { type: String, required: true, unique: true },
  invitedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["pending", "accepted", "expired", "revoked"], default: "pending" },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  acceptedAt: { type: Date, default: null },
}, { timestamps: true });

type InviteShape = InferSchemaType<typeof inviteSchema>;
export const Invite = (models.Invite as Model<InviteShape> | undefined) ?? model<InviteShape>("Invite", inviteSchema);
