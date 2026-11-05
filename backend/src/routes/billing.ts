import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { requireAuth, requireRole } from "../middleware/auth";
import { Payment } from "../models/Payment";
import { User } from "../models/User";
import { planSummary } from "../services/plans";
import { activatePaidOrder, createOrder, markFailed, razorpayConfigured, verifyCheckoutSignature, verifyWebhookSignature } from "../services/razorpay-service";

const router = Router();
router.use(requireAuth, requireRole("student"));

/** The student's plan, this month's usage against the limits, and prices. Institute students are covered by their college. */
router.get("/me", async (request, response) => {
  if (request.auth!.institutionId) return response.json({ covered: true, plan: "institute" });
  return response.json({ covered: false, paymentsEnabled: razorpayConfigured(), ...(await planSummary(request.auth!.userId)) });
});

router.get("/history", async (request, response) => {
  const payments = await Payment.find({ userId: request.auth!.userId, status: "paid" }).sort({ paidAt: -1 }).limit(24).select("interval amount currency paidAt paymentId").lean();
  return response.json({ payments: payments.map(item => ({ id: String(item._id), interval: item.interval, amount: item.amount / 100, currency: item.currency, paidAt: item.paidAt, reference: item.paymentId })) });
});

/** Step 1: create a Razorpay order for the chosen plan. The browser opens Razorpay Checkout with what this returns. */
router.post("/checkout", async (request, response) => {
  if (request.auth!.institutionId) return response.status(400).json({ message: "Your college already covers your access." });
  if (!razorpayConfigured()) return response.status(503).json({ code: "PAYMENT_NOT_CONFIGURED", message: "Online payments aren’t switched on yet. Contact support and we’ll upgrade you." });
  const { interval } = z.object({ interval: z.enum(["monthly", "yearly"]) }).parse(request.body);
  const [user, order] = await Promise.all([User.findById(request.auth!.userId).select("name email").lean(), createOrder(request.auth!.userId, interval).catch(error => error as Error)]);
  if (order instanceof Error) return response.status(502).json({ message: "We couldn’t start the payment. Please try again in a moment." });
  return response.json({ keyId: env.RAZORPAY_KEY_ID, orderId: order.orderId, amount: order.amount, currency: order.currency, interval, name: "Placeble", description: `Placeble Pro · ${interval}`, prefill: { name: user?.name ?? "", email: user?.email ?? "" } });
});

/** Step 2: Checkout hands back a signature. Verify it, then switch the plan on. */
router.post("/verify", async (request, response) => {
  if (!razorpayConfigured()) return response.status(503).json({ code: "PAYMENT_NOT_CONFIGURED", message: "Online payments aren’t switched on yet." });
  const input = z.object({ razorpay_order_id: z.string().min(5).max(80), razorpay_payment_id: z.string().min(5).max(80), razorpay_signature: z.string().min(20).max(200) }).parse(request.body);
  const own = await Payment.findOne({ orderId: input.razorpay_order_id, userId: request.auth!.userId }).lean();
  if (!own) return response.status(404).json({ message: "We couldn’t find that payment." });
  if (!verifyCheckoutSignature(input.razorpay_order_id, input.razorpay_payment_id, input.razorpay_signature)) {
    await markFailed(input.razorpay_order_id, "Signature did not match");
    return response.status(400).json({ message: "We couldn’t confirm that payment. If money was taken, it will be matched automatically within a few minutes, or contact support." });
  }
  const result = await activatePaidOrder(input.razorpay_order_id, input.razorpay_payment_id);
  return response.json({ ok: true, message: "You’re on Pro. Thank you!", summary: await planSummary(request.auth!.userId), already: result.alreadyActive });
});

export { router as billingRouter };

/**
 * Razorpay calls this when a payment is captured, even if the student closed the tab before our page heard back.
 * It needs the raw body to check the signature, so server.ts mounts it with express.raw before the JSON parser.
 */
export async function razorpayWebhook(request: Request, response: Response) {
  const signature = String(request.header("x-razorpay-signature") ?? "");
  const raw = request.body as Buffer;
  if (!Buffer.isBuffer(raw) || !signature || !verifyWebhookSignature(raw, signature)) return response.status(400).json({ message: "Invalid signature." });
  const event = JSON.parse(raw.toString("utf8")) as { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; error_description?: string } } } };
  const payment = event.payload?.payment?.entity;
  if (payment?.order_id && payment.id) {
    if (event.event === "payment.captured" || event.event === "order.paid") await activatePaidOrder(payment.order_id, payment.id);
    else if (event.event === "payment.failed") await markFailed(payment.order_id, payment.error_description ?? "Payment failed");
  }
  return response.json({ received: true });
}
