import mongoose, { type Model } from "mongoose";
const { model, models, Schema } = mongoose;

const rateLimitBucketSchema = new Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, required: true, default: 0 },
  resetAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

type RateLimitBucket = { key: string; count: number; resetAt: Date };
export const RateLimitBucket = (models.RateLimitBucket as Model<RateLimitBucket> | undefined) ?? model<RateLimitBucket>("RateLimitBucket", rateLimitBucketSchema);
