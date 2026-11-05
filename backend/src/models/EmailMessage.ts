import mongoose from "mongoose";
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  recipient: { type: String, required: true },
  payload: { type: String, required: true },
  status: { type: String, default: "queued", index: true },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true });
export const EmailMessage = mongoose.models.EmailMessage ?? mongoose.model("EmailMessage", schema);
