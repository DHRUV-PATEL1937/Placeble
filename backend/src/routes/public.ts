import crypto from "node:crypto";
import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { env } from "../config/env";
import { contactRateLimit } from "../middleware/contact-rate-limit";
import { Blog } from "../models/Blog";
import { ContactSubmission } from "../models/ContactSubmission";
import { present } from "./blogs";
import { queueEmail } from "../services/email-service";

// Unauthenticated endpoints used by the public marketing site. Nothing here reads or returns account data.
export const publicRouter = Router();

// Strip control characters so a value can never add lines to an email header or subject.
const single = (max: number, min = 1) => z.string().transform(value => value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim()).pipe(z.string().min(min).max(max));

const contactSchema = z.object({
  name: single(100, 2),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().max(20).regex(/^[+()\d\s-]{7,20}$/).optional().or(z.literal("").transform(() => undefined)),
  organisation: single(150, 2),
  role: z.enum(["Student", "TPO", "Principal", "University", "Recruiter", "Other"]),
  message: z.string().trim().min(10).max(2000),
  topic: z.enum(["general", "demo"]).default("general"),
  consent: z.literal(true),
});

// Published blog posts for the marketing site. Drafts are never returned. Pictures come from the already public /blogs/:id/image.
publicRouter.get("/blogs", async (request, response, next) => {
  try {
    const limit = Math.min(Math.max(Number(request.query.limit) || 12, 1), 30);
    const posts = await Blog.find({ status: "published" }).sort({ publishedAt: -1 }).limit(limit).lean();
    response.setHeader("Cache-Control", "public, max-age=60");
    // The list leaves the full text out; the post page loads it.
    return response.json({ posts: posts.map(post => ({ ...present(post), body: "", excerpt: post.summary || post.body.slice(0, 160) })) });
  } catch (error) {
    return next(error);
  }
});

publicRouter.get("/blogs/:id", async (request, response, next) => {
  try {
    const id = String(request.params.id);
    if (!mongoose.isValidObjectId(id)) return response.status(404).json({ message: "That post doesn’t exist." });
    const post = await Blog.findOne({ _id: id, status: "published" }).lean();
    if (!post) return response.status(404).json({ message: "That post doesn’t exist or isn’t published." });
    response.setHeader("Cache-Control", "public, max-age=60");
    return response.json({ post: present(post) });
  } catch (error) {
    return next(error);
  }
});

publicRouter.post("/contact", contactRateLimit, async (request, response, next) => {
  try {
    // Honeypot: the form has a hidden "website" field that people never fill in. Pretend it worked, store nothing.
    const body = request.body as Record<string, unknown> | undefined;
    if (typeof body?.website === "string" && body.website.trim() !== "") return response.status(201).json({ ok: true });

    const data = contactSchema.parse(body ?? {});
    const submission = await ContactSubmission.create({
      name: data.name, email: data.email, phone: data.phone ?? "", organisation: data.organisation, role: data.role,
      message: data.message, topic: data.topic, consentAt: new Date(),
      ipHash: crypto.createHash("sha256").update(`${request.ip ?? ""}:${env.JWT_REFRESH_SECRET}`).digest("hex").slice(0, 32),
      userAgent: String(request.get("user-agent") ?? "").slice(0, 200),
    });

    // The submission is saved first. If email is not configured or the queue fails, the message is still kept.
    const subject = `${data.topic === "demo" ? "Demo request" : "Contact"}: ${data.name} (${data.role})`;
    const text = [
      `New ${data.topic === "demo" ? "demo request" : "message"} from the Placeble website.`, "",
      `Name: ${data.name}`, `Email: ${data.email}`, `Phone: ${data.phone ?? "not given"}`,
      `Organisation: ${data.organisation}`, `Role: ${data.role}`, "", data.message, "",
      `Reference: ${submission.id}`,
    ].join("\n");
    await queueEmail({ key: `contact:${submission.id}`, to: env.CONTACT_NOTIFY_EMAIL, subject, text, expiresAt: new Date(Date.now() + 30 * 86400000) });

    return response.status(201).json({ ok: true });
  } catch (error) {
    return next(error);
  }
});
