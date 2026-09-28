import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

export const notificationKinds = ["action_plan", "intervention", "drive", "security", "system"] as const;
const notificationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  sourceKey: { type: String, default: "", maxlength: 200 },
  kind: { type: String, enum: notificationKinds, required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 140 },
  body: { type: String, required: true, trim: true, maxlength: 500 },
  href: { type: String, default: "", maxlength: 200 },
  readAt: { type: Date, default: null, index: true },
}, { timestamps: true });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, sourceKey: 1 }, { unique: true, partialFilterExpression: { sourceKey: { $type: "string", $gt: "" } } });
type NotificationShape = InferSchemaType<typeof notificationSchema>;
export const Notification = (models.Notification as Model<NotificationShape> | undefined) ?? model<NotificationShape>("Notification", notificationSchema);
