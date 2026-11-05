import type { NextFunction, Request, Response } from "express";
import { UsageEvent, type MeteredFeature } from "../models/UsageEvent";
import { FEATURE_LABEL, FREE_LIMITS, currentPlan, monthlyUsage, startOfNextMonth } from "../services/plans";

/** A student with no institute is a direct (B2C) student. Institute students are never limited: their college covers them. */
export const isDirectStudent = (request: Request) => request.auth?.role === "student" && !request.auth.institutionId;

/**
 * Enforces the free plan's monthly allowance on a feature. Use after requireAuth.
 * A use is only counted when the request succeeds, so a failed AI call doesn't cost the student anything.
 */
export function meter(feature: MeteredFeature) {
  return async (request: Request, response: Response, next: NextFunction) => {
    if (!isDirectStudent(request)) return next();
    const userId = request.auth!.userId;
    try {
      const plan = await currentPlan(userId);
      if (plan.plan === "free") {
        const limit = FREE_LIMITS[feature];
        if (limit !== null && (await monthlyUsage(userId))[feature] >= limit) {
          return response.status(402).json({ code: "LIMIT_REACHED", feature, limit, resetsAt: startOfNextMonth(), message: `You’ve used all ${limit} free ${FEATURE_LABEL[feature]} this month. Upgrade to Pro for unlimited use, or wait until next month.` });
        }
      }
    } catch { return next(); }   // never block a student because usage couldn't be read
    response.on("finish", () => {
      if (response.statusCode < 400) void UsageEvent.create({ userId, feature }).catch(() => undefined);
    });
    return next();
  };
}
