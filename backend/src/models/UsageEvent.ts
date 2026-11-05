import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

export const meteredFeatures = ["resume_ai", "aptitude", "interview", "cover_letter", "group_discussion", "assistant", "case_study"] as const;
export type MeteredFeature = typeof meteredFeatures[number];

/** One successful use of a limited feature by a B2C student. Counted per calendar month. */
const usageEventSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  feature: { type: String, enum: meteredFeatures, required: true },
  createdAt: { type: Date, default: Date.now },
});
usageEventSchema.index({ userId: 1, feature: 1, createdAt: -1 });

export type UsageEventDocument = InferSchemaType<typeof usageEventSchema>;
export const UsageEvent = (models.UsageEvent as Model<UsageEventDocument> | undefined) ?? model<UsageEventDocument>("UsageEvent", usageEventSchema);
