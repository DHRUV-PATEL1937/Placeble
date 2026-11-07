import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

export const supportTopics = ["account", "technical", "billing", "practice", "feedback", "other"] as const;

/** A message to the Placeble team sent from inside the app (Contact support). The team gets it by email; this keeps a record. */
const supportRequestSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  role: { type: String, required: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, lowercase: true, trim: true },
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", default: null },
  topic: { type: String, enum: supportTopics, required: true },
  subject: { type: String, required: true, trim: true, maxlength: 140 },
  message: { type: String, required: true, trim: true, maxlength: 3000 },
  /** The screen they were on, to help reproduce problems. */
  page: { type: String, default: "", maxlength: 120 },
  userAgent: { type: String, default: "", maxlength: 200 },
  status: { type: String, enum: ["new", "replied", "closed"], default: "new", index: true },
}, { timestamps: true });
supportRequestSchema.index({ createdAt: -1 });

type SupportRequestShape = InferSchemaType<typeof supportRequestSchema>;
export const SupportRequest = (models.SupportRequest as Model<SupportRequestShape> | undefined) ?? model<SupportRequestShape>("SupportRequest", supportRequestSchema);
