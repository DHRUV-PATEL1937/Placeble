import type { RequestHandler } from "express";

// Public contact form: a few messages per address per hour. Per-process, like email-rate-limit.ts.
const WINDOW_MS = 60 * 60000;
const MAX_PER_WINDOW = 5;
const MAX_TRACKED = 10000;
const requests = new Map<string, { count: number; until: number }>();

export const contactRateLimit: RequestHandler = (request, response, next) => {
  const now = Date.now();
  for (const [key, value] of requests) if (value.until <= now) requests.delete(key);
  const key = request.ip || request.socket.remoteAddress || "unknown";
  const entry = requests.get(key) ?? { count: 0, until: now + WINDOW_MS };
  if (entry.count >= MAX_PER_WINDOW || (requests.size >= MAX_TRACKED && !requests.has(key))) {
    response.setHeader("Retry-After", String(Math.max(1, Math.ceil((entry.until - now) / 1000))));
    response.status(429).json({ message: "You’ve sent a few messages already. Please try again later, or email support@placeble.in." });
    return;
  }
  entry.count += 1;
  requests.set(key, entry);
  next();
};
