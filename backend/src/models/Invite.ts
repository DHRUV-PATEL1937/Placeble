import mongoose, { type InferSchemaType, type Model } from "mongoose";
import { userRoles } from "./User";
const { model, models, Schema } = mongoose;

const inviteSchema = new Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  name: { type: String, default: "", trim: true },
  role: { type: String, enum: userRoles, required: true },
  purpose: { type: String, enum: ["account_activation", "credential_reissue"], default: "account_activation", index: true },
  targetUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", required: true, index: true },
  driveIds: [{ type: String }],
  tokenHash: { type: String, required: true, unique: true },
  invitedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["pending", "accepted", "expired", "revoked"], default: "pending" },
  // Keep expired invites so activation links can explain that they expired instead
  // of becoming indistinguishable from malformed tokens after a TTL cleanup.
  expiresAt: { type: Date, required: true, index: true },
  acceptedAt: { type: Date, default: null },
}, { timestamps: true });

type InviteShape = InferSchemaType<typeof inviteSchema>;
export const Invite = (models.Invite as Model<InviteShape> | undefined) ?? model<InviteShape>("Invite", inviteSchema);

export async function ensureInviteRetentionIndex() {
  const indexes = await Invite.collection.indexes();
  const expiryIndex = indexes.find(index => index.key?.expiresAt === 1);
  if (expiryIndex && "expireAfterSeconds" in expiryIndex) {
    await Invite.collection.dropIndex(expiryIndex.name!);
  }
  await Invite.collection.createIndex({ expiresAt: 1 }, { name: "expiresAt_1" });
}
