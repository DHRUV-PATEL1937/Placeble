import mongoose, { type Types } from "mongoose";
import { Subscription } from "../models/Subscription";
import { UsageEvent, meteredFeatures, type MeteredFeature } from "../models/UsageEvent";

export const FEATURE_LABEL: Record<MeteredFeature, string> = {
  resume_ai: "AI resume actions", aptitude: "aptitude attempts", interview: "mock interviews", cover_letter: "cover letters", group_discussion: "group discussions", assistant: "assistant messages", case_study: "case studies", hr_simulation: "HR simulations",
};

/** Free-plan allowance per calendar month. `null` means no monthly limit. Change these numbers to change the free tier. */
export const FREE_LIMITS: Record<MeteredFeature, number | null> = { resume_ai: 5, aptitude: 3, interview: 2, cover_letter: 3, group_discussion: 2, assistant: 20, case_study: 3, hr_simulation: 2 };
/** Features switched off in the app for now. They are left out of the plan page so students don't see usage for something they can't open. */
export const HIDDEN_FEATURES = new Set<MeteredFeature>(["group_discussion"]);
export const PRO_LIMITS: Record<MeteredFeature, number | null> = { resume_ai: null, aptitude: null, interview: null, cover_letter: null, group_discussion: null, assistant: null, case_study: null, hr_simulation: null };

/** Prices in rupees. Set PRO_PRICE_MONTHLY_INR / PRO_PRICE_YEARLY_INR to change them; the defaults are the live prices. */
export const PRICES = {
  monthly: Number(process.env.PRO_PRICE_MONTHLY_INR ?? 149),
  yearly: Number(process.env.PRO_PRICE_YEARLY_INR ?? 1499),
  currency: "INR",
};

export const startOfMonth = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), 1);
export const startOfNextMonth = (date = new Date()) => new Date(date.getFullYear(), date.getMonth() + 1, 1);

export async function currentPlan(userId: string | Types.ObjectId) {
  const subscription = await Subscription.findOne({ userId }).lean();
  const active = Boolean(subscription && subscription.plan === "pro" && subscription.status === "active" && subscription.currentPeriodEnd && subscription.currentPeriodEnd.getTime() > Date.now());
  return {
    plan: active ? "pro" as const : "free" as const,
    interval: active ? subscription!.interval ?? null : null,
    renewsAt: active ? subscription!.currentPeriodEnd : null,
    source: subscription?.source ?? null,
    expired: Boolean(subscription && subscription.plan === "pro" && !active),
  };
}

export async function monthlyUsage(userId: string | Types.ObjectId) {
  // aggregate() does not cast its pipeline, so a string id would never match the stored ObjectId and every count would read 0.
  const rows = await UsageEvent.aggregate<{ _id: MeteredFeature; count: number }>([
    { $match: { userId: new mongoose.Types.ObjectId(String(userId)), createdAt: { $gte: startOfMonth() } } },
    { $group: { _id: "$feature", count: { $sum: 1 } } },
  ]);
  const used = new Map(rows.map(row => [row._id, row.count]));
  return Object.fromEntries(meteredFeatures.map(feature => [feature, used.get(feature) ?? 0])) as Record<MeteredFeature, number>;
}

export async function planSummary(userId: string | Types.ObjectId) {
  const [plan, used] = await Promise.all([currentPlan(userId), monthlyUsage(userId)]);
  const limits = plan.plan === "pro" ? PRO_LIMITS : FREE_LIMITS;
  return {
    ...plan, prices: PRICES, resetsAt: startOfNextMonth(),
    features: meteredFeatures.filter(feature => !HIDDEN_FEATURES.has(feature)).map(feature => ({ feature, label: FEATURE_LABEL[feature], used: used[feature], limit: limits[feature] })),
  };
}
