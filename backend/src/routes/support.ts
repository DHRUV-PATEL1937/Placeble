import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { requireAuth } from "../middleware/auth";
import { Institution } from "../models/Institution";
import { SupportRequest, supportTopics } from "../models/SupportRequest";
import { User } from "../models/User";
import { queueEmail } from "../services/email-service";

/** Contact support from inside the app. Any signed-in user can write to the Placeble team. */
const router = Router();
router.use(requireAuth);

const TOPIC_LABEL: Record<typeof supportTopics[number], string> = {
  account: "Account and sign-in", technical: "Something isn't working", billing: "Plan and payments",
  practice: "Practice agents and scores", feedback: "Feedback or an idea", other: "Something else",
};

// A few messages per person per hour, so a stuck button can't flood the inbox. Per-process, like the other limiters.
const WINDOW_MS = 60 * 60000;
const MAX_PER_WINDOW = 5;
const recent = new Map<string, number[]>();
function allowed(userId: string) {
  const now = Date.now();
  const times = (recent.get(userId) ?? []).filter(time => now - time < WINDOW_MS);
  if (times.length >= MAX_PER_WINDOW) { recent.set(userId, times); return false; }
  times.push(now); recent.set(userId, times);
  if (recent.size > 10000) for (const [key, value] of recent) if (!value.some(time => now - time < WINDOW_MS)) recent.delete(key);
  return true;
}

router.get("/topics", (_request, response) => response.json({ topics: supportTopics.map(id => ({ id, label: TOPIC_LABEL[id] })), email: env.CONTACT_NOTIFY_EMAIL }));

router.post("/", async (request, response, next) => {
  try {
    const input = z.object({
      topic: z.enum(supportTopics),
      subject: z.string().trim().min(3, "Add a short subject.").max(140),
      message: z.string().trim().min(15, "Tell us a little more, at least a sentence.").max(3000),
      page: z.string().trim().max(120).optional().default(""),
    }).parse(request.body);
    const userId = request.auth!.userId;
    if (!allowed(userId)) return response.status(429).json({ message: `You've sent a few messages already. We'll reply soon, or email ${env.CONTACT_NOTIFY_EMAIL}.` });
    const user = await User.findById(userId).select("name email role institutionId").lean();
    if (!user) return response.status(404).json({ message: "We couldn't find your account." });
    const institution = user.institutionId ? await Institution.findById(user.institutionId).select("name").lean() : null;
    const saved = await SupportRequest.create({
      userId, role: user.role, name: user.name, email: user.email, institutionId: user.institutionId ?? null,
      topic: input.topic, subject: input.subject, message: input.message, page: input.page,
      userAgent: String(request.get("user-agent") ?? "").slice(0, 200),
    });
    const reference = String(saved._id).slice(-6).toUpperCase();
    // Saved first, so the message is kept even if email isn't configured or the queue fails.
    await queueEmail({
      key: `support:${saved.id}`, to: env.CONTACT_NOTIFY_EMAIL,
      subject: `Support #${reference}: ${input.subject}`,
      text: [
        `New support message from inside the Placeble app.`, "",
        `From: ${user.name} <${user.email}>`, `Role: ${user.role}`, `College: ${institution?.name ?? "None (direct)"}`,
        `Topic: ${TOPIC_LABEL[input.topic]}`, `Screen: ${input.page || "not given"}`, "",
        input.message, "",
        `Reply to ${user.email}. Reference: ${reference} (${saved.id})`,
      ].join("\n"),
      expiresAt: new Date(Date.now() + 30 * 86400000),
    }).catch(console.error);
    return response.status(201).json({ ok: true, reference, email: user.email });
  } catch (error) { return next(error); }
});

export { router as supportRouter };
