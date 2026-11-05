import crypto from "node:crypto";
import type { Types } from "mongoose";
import { env } from "../config/env";
import { Payment } from "../models/Payment";
import { Subscription } from "../models/Subscription";
import { PRICES } from "./plans";

export const razorpayConfigured = () => Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

const authHeader = () => `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64")}`;
const safeEqual = (a: string, b: string) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export type Interval = "monthly" | "yearly";

/** The price always comes from the server, never from the browser. */
export const priceInPaise = (interval: Interval) => Math.round(PRICES[interval] * 100);

export async function createOrder(userId: string | Types.ObjectId, interval: Interval) {
  const amount = priceInPaise(interval);
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ amount, currency: PRICES.currency, receipt: `pb_${String(userId).slice(-10)}_${Date.now().toString(36)}`, notes: { userId: String(userId), interval } }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => ({})) as { id?: string; error?: { description?: string } };
  if (!response.ok || !body.id) throw new Error(body.error?.description ?? "Razorpay could not create the order.");
  await Payment.create({ userId, orderId: body.id, interval, amount, currency: PRICES.currency });
  return { orderId: body.id, amount, currency: PRICES.currency };
}

/** Checkout returns order_id, payment_id and a signature. This proves they came from Razorpay for our key. */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string) {
  const expected = crypto.createHmac("sha256", env.RAZORPAY_KEY_SECRET ?? "").update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqual(expected, signature);
}

export function verifyWebhookSignature(rawBody: Buffer, signature: string) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
  const expected = crypto.createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}

function addPeriod(from: Date, interval: Interval) {
  const end = new Date(from);
  if (interval === "yearly") end.setFullYear(end.getFullYear() + 1); else end.setMonth(end.getMonth() + 1);
  return end;
}

/**
 * Marks an order paid and gives the student Pro. Safe to call twice (the checkout reply and the webhook both arrive),
 * and a plan bought while still on Pro is added to the end of the current period.
 */
export async function activatePaidOrder(orderId: string, paymentId: string) {
  const claimed = await Payment.findOneAndUpdate({ orderId, status: { $ne: "paid" } }, { $set: { status: "paid", paymentId, paidAt: new Date(), failureReason: "" } }, { returnDocument: "after" });
  if (!claimed) return { alreadyActive: true as const, payment: await Payment.findOne({ orderId }).lean() };
  const existing = await Subscription.findOne({ userId: claimed.userId }).lean();
  const stillActive = existing?.plan === "pro" && existing.status === "active" && existing.currentPeriodEnd && existing.currentPeriodEnd.getTime() > Date.now();
  const from = stillActive ? existing!.currentPeriodEnd! : new Date();
  const currentPeriodEnd = addPeriod(from, claimed.interval as Interval);
  await Subscription.updateOne(
    { userId: claimed.userId },
    { $set: { plan: "pro", interval: claimed.interval, status: "active", currentPeriodEnd, source: "payment", provider: "razorpay", providerReference: paymentId, note: "" } },
    { upsert: true },
  );
  return { alreadyActive: false as const, payment: claimed.toObject(), currentPeriodEnd };
}

export async function markFailed(orderId: string, reason: string) {
  await Payment.updateOne({ orderId, status: "created" }, { $set: { status: "failed", failureReason: reason.slice(0, 200) } });
}
