import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

/** A B2C student's paid plan. No document (or an expired one) means the free plan. */
const subscriptionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  plan: { type: String, enum: ["free", "pro"], default: "free" },
  interval: { type: String, enum: ["monthly", "yearly", null], default: null },
  status: { type: String, enum: ["active", "canceled", "expired"], default: "active" },
  currentPeriodEnd: { type: Date, default: null },
  // "admin" = granted by us; "payment" = bought through the payment provider.
  source: { type: String, enum: ["admin", "payment"], default: "admin" },
  provider: { type: String, default: "" },
  providerReference: { type: String, default: "" },
  grantedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  note: { type: String, default: "", maxlength: 300 },
}, { timestamps: true });

export type SubscriptionDocument = InferSchemaType<typeof subscriptionSchema>;
export const Subscription = (models.Subscription as Model<SubscriptionDocument> | undefined) ?? model<SubscriptionDocument>("Subscription", subscriptionSchema);
