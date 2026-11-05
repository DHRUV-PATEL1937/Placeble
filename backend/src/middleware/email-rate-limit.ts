import type { RequestHandler } from "express";
// Per-process abuse protection, in addition to durable per-account link cooldowns.
const requests = new Map<string, { count: number; until: number }>();
export const emailRateLimit: RequestHandler = (request, response, next) => {
  const now = Date.now();
  for (const [key, value] of requests) if (value.until <= now) requests.delete(key);
  const key = request.ip || request.socket.remoteAddress || "unknown";
  const entry = requests.get(key) ?? { count: 0, until: now + 15 * 60000 };
  if (entry.count >= 10 || requests.size >= 10000 && !requests.has(key)) {
    response.setHeader("Retry-After", "900");
    response.status(429).json({ message: "Too many requests. Please try again later." });
    return;
  }
  entry.count += 1;
  requests.set(key, entry);
  next();
};
