import { Router } from "express";
import { z } from "zod";
import { meter } from "../middleware/usage-limit";
import { requireAuth, requireRole } from "../middleware/auth";
import { askAssistant, type Audience } from "../services/assistant-service";

const router = Router();
router.use(requireAuth, requireRole("student", "tpo", "principal", "platform_admin"));

// A small per-student speed limit so a stuck page or a script can't run up AI costs.
const recent = new Map<string, number[]>();
function tooFast(userId: string) {
  const now = Date.now();
  const stamps = (recent.get(userId) ?? []).filter(time => now - time < 60_000);
  if (stamps.length >= 8) { recent.set(userId, stamps); return true; }
  recent.set(userId, [...stamps, now]);
  return false;
}

/** Everyone gets help about their own work only. A university TPO inside a college is treated as that college's TPO. */
function audienceOf(role: string, institutionId?: string): Audience {
  if (role === "student") return "student";
  if (role === "platform_admin") return "admin";
  if (role === "principal") return "principal";
  if (role === "university_admin") return institutionId ? "tpo" : "university";
  return "tpo";
}

const body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(3000) })).min(1).max(20),
  /** The pages this student can actually open, so the assistant only suggests those. */
  views: z.array(z.string().max(30)).max(20).optional(),
});

router.post("/chat", meter("assistant"), async (request, response, next) => {
  try {
    const { messages, views } = body.parse(request.body);
    if (messages[messages.length - 1].role !== "user") return response.status(400).json({ message: "Ask a question first." });
    if (tooFast(request.auth!.userId)) return response.status(429).json({ message: "You’re going a little fast. Wait a few seconds and ask again." });
    const result = await askAssistant({ userId: request.auth!.userId, audience: audienceOf(request.auth!.role, request.auth!.institutionId), institutionId: request.auth!.institutionId, universityId: request.auth!.universityId }, messages, views).catch(() => null);
    if (!result) return response.status(502).json({ message: "The assistant couldn’t answer just now. Please try again in a moment." });
    return response.json(result);
  } catch (error) { return next(error); }
});

export { router as assistantRouter };
