import type { NextFunction, Request, Response } from "express";
import { RateLimitBucket } from "../models/RateLimitBucket";

export type RateLimitPolicy = { name: string; limit: number; windowMs: number; key?: (request: Request) => string };

function clientKey(request: Request) {
  return request.ip || request.socket.remoteAddress || "unknown";
}

export function rateLimit(policy: RateLimitPolicy) {
  return async (request: Request, response: Response, next: NextFunction) => {
    const now = Date.now();
    const resetAt = new Date(now + policy.windowMs);
    const identity = policy.key?.(request) || clientKey(request);
    const key = `${policy.name}:${identity}`;
    try {
      let bucket = await RateLimitBucket.findOneAndUpdate(
        { key, resetAt: { $gt: new Date(now) } },
        { $inc: { count: 1 } },
        { returnDocument: "after" },
      ).lean();
      if (!bucket) {
        try {
          bucket = await RateLimitBucket.findOneAndUpdate(
            { key },
            { $set: { count: 1, resetAt } },
            { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
          ).lean();
        } catch (error) {
          if ((error as { code?: number }).code !== 11000) throw error;
          bucket = await RateLimitBucket.findOneAndUpdate({ key, resetAt: { $gt: new Date(now) } }, { $inc: { count: 1 } }, { returnDocument: "after" }).lean();
        }
      }
      if (!bucket) return response.status(503).json({ code: "AUTH_PROTECTION_UNAVAILABLE", message: "Authentication protection is temporarily unavailable. Please try again shortly." });
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt.getTime() - now) / 1000));
      response.setHeader("RateLimit-Limit", policy.limit);
      response.setHeader("RateLimit-Remaining", Math.max(0, policy.limit - bucket.count));
      response.setHeader("RateLimit-Reset", Math.ceil(bucket.resetAt.getTime() / 1000));
      if (bucket.count > policy.limit) {
        response.setHeader("Retry-After", retryAfter);
        return response.status(429).json({ code: "AUTH_RATE_LIMITED", message: "Too many authentication attempts. Please try again later." });
      }
      return next();
    } catch (error) {
      console.error("Authentication rate limiter unavailable", error instanceof Error ? error.message : "unknown error");
      return response.status(503).json({ code: "AUTH_PROTECTION_UNAVAILABLE", message: "Authentication protection is temporarily unavailable. Please try again shortly." });
    }
  };
}
