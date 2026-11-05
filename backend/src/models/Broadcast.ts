import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

/** A message sent to many people at once by the superadmin or an institute TPO. Each recipient gets their own Notification. */
const broadcastSchema = new Schema({
  senderId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  senderRole: { type: String, enum: ["platform_admin", "tpo"], required: true, index: true },
  /** Set for TPO broadcasts: the institute they were sent within. */
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", default: null, index: true },
  title: { type: String, required: true, trim: true, maxlength: 140 },
  body: { type: String, required: true, trim: true, maxlength: 2000 },
  priority: { type: String, enum: ["info", "important", "urgent"], default: "info" },
  ctaLabel: { type: String, default: "", trim: true, maxlength: 40 },
  /** An in-app page (e.g. "Resume Maker") or an https link. */
  ctaUrl: { type: String, default: "", trim: true, maxlength: 300 },
  channels: { inApp: { type: Boolean, default: true }, email: { type: Boolean, default: false } },
  /** Who it goes to, kept as the filters the sender chose so it can be shown and re-run. */
  audience: { type: Schema.Types.Mixed, default: {} },
  recipientCount: { type: Number, default: 0 },
  emailsQueued: { type: Number, default: 0 },
  status: { type: String, enum: ["scheduled", "sending", "sent", "canceled", "recalled", "failed"], default: "sending", index: true },
  scheduledAt: { type: Date, default: null, index: true },
  sentAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  error: { type: String, default: "" },
}, { timestamps: true });

export type BroadcastDocument = InferSchemaType<typeof broadcastSchema>;
export const Broadcast = (models.Broadcast as Model<BroadcastDocument> | undefined) ?? model<BroadcastDocument>("Broadcast", broadcastSchema);
