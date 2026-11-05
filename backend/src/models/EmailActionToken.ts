import mongoose from "mongoose";
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  purpose: { type: String, enum: ["reset", "verify"], required: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, expires: 0 },
  usedAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ userId: 1, purpose: 1, createdAt: -1 });
export const EmailActionToken = mongoose.models.EmailActionToken ?? mongoose.model("EmailActionToken", schema);
