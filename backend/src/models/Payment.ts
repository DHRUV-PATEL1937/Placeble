import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { model, models, Schema } = mongoose;

/** One attempt to buy a Pro plan through Razorpay. The order is created first, then marked paid once Razorpay confirms it. */
const paymentSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  provider: { type: String, default: "razorpay" },
  orderId: { type: String, required: true, unique: true },
  paymentId: { type: String, default: "", index: true },
  interval: { type: String, enum: ["monthly", "yearly"], required: true },
  /** In paise, exactly what Razorpay was asked to charge. */
  amount: { type: Number, required: true },
  currency: { type: String, default: "INR" },
  status: { type: String, enum: ["created", "paid", "failed"], default: "created", index: true },
  paidAt: { type: Date, default: null },
  failureReason: { type: String, default: "" },
}, { timestamps: true });

export type PaymentDocument = InferSchemaType<typeof paymentSchema>;
export const Payment = (models.Payment as Model<PaymentDocument> | undefined) ?? model<PaymentDocument>("Payment", paymentSchema);
