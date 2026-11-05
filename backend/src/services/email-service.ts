import crypto from "node:crypto";
import nodemailer from "nodemailer";
import { env } from "../config/env";
import { EmailMessage } from "../models/EmailMessage";
import { Notification } from "../models/Notification";
import { User } from "../models/User";

export const emailConfigured = () => Boolean(env.SMTP_USER && env.SMTP_PASSWORD);
export function appLink(path: string) {
  const base = env.APP_LINK_ORIGIN ?? (env.NODE_ENV === "production" ? "https://app.placeble.in" : env.APP_ORIGIN.split(",")[0].trim());
  const url = new URL(path.startsWith("/") ? path : `/${path}`, base);
  if (url.origin !== new URL(base).origin) throw new Error("Invalid email link");
  return url.toString();
}
const key = crypto.createHash("sha256").update(env.JWT_REFRESH_SECRET).digest();
function seal(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const content = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), content]).toString("base64");
}
function open(value: string) {
  const data = Buffer.from(value, "base64");
  const cipher = crypto.createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  cipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString("utf8");
}
export async function queueEmail(input: { key: string; to: string; subject: string; text: string; expiresAt?: Date }) {
  if (!emailConfigured()) return "provider_not_configured";
  try {
    await EmailMessage.updateOne({ key: input.key }, { $setOnInsert: {
      recipient: input.to, payload: seal(JSON.stringify({ subject: input.subject, text: input.text })),
      expiresAt: input.expiresAt ?? new Date(Date.now() + 7 * 86400000),
    } }, { upsert: true });
    return "queued";
  } catch { console.error("Email could not be queued; account operation preserved."); return "queue_failed"; }
}
export async function emailAudience(filter: Record<string, unknown>, key: string, subject: string, text: string) {
  if (!emailConfigured()) return;
  try {
    const users = await User.find(filter).select("email").lean();
    for (const user of users) await queueEmail({ key: `${key}:${user._id}`, to: user.email, subject, text });
  } catch { console.error("Audience email could not be queued; account operation preserved."); }
}
const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
export function startEmailWorker() {
  if (!emailConfigured()) { console.warn("SMTP is not configured; email delivery disabled."); return () => {}; }
  const transport = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465, requireTLS: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 });
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await EmailMessage.updateMany({ status: "sending", attempts: { $gte: 5 }, nextAttemptAt: { $lte: new Date() } }, { $set: { status: "failed" } });
      // Only new notifications have emailPending=true; never backfill old inboxes.
      const notifications = await Notification.find({ emailPending: true }).sort({ createdAt: 1 }).limit(10);
      for (const notification of notifications) {
        const user = await User.findById(notification.userId).select("email status");
        if (user?.email && user.status !== "suspended") {
          const delivery = await queueEmail({ key: `notification:${notification._id}`, to: user.email,
            subject: notification.title, text: `${notification.body}\n\nOpen your Placeble workspace: ${appLink("/")}` });
          if (delivery !== "queued") continue;
        }
        await Notification.updateOne({ _id: notification._id }, { $set: { emailPending: false } });
      }
      const message = await EmailMessage.findOneAndUpdate({ status: { $in: ["queued", "sending"] },
        nextAttemptAt: { $lte: new Date() }, expiresAt: { $gt: new Date() }, attempts: { $lt: 5 } },
      { $set: { status: "sending", nextAttemptAt: new Date(Date.now() + 120000) }, $inc: { attempts: 1 } }, { returnDocument: "after" });
      if (!message) return;
      try {
        const content = JSON.parse(open(message.payload));
        await transport.sendMail({ from: { name: "Placeble", address: env.EMAIL_FROM }, to: message.recipient,
          messageId: `<${message._id}@placeble.in>`, subject: content.subject, text: content.text,
          html: `<div style="font:16px/1.7 Arial,sans-serif;color:#14213d;max-width:600px;margin:auto;padding:32px"><h2 style="color:#2563eb">placeble</h2><h3>${escape(content.subject)}</h3><p style="white-space:pre-line">${escape(content.text)}</p><hr><small>Placeble · Your career, in progress.</small></div>` });
        await EmailMessage.updateOne({ _id: message._id }, { $set: { status: "sent", payload: "" } });
      } catch {
        await EmailMessage.updateOne({ _id: message._id }, { $set: { status: message.attempts >= 5 ? "failed" : "queued",
          nextAttemptAt: new Date(Date.now() + 60000 * 2 ** message.attempts) } });
        console.error("SMTP delivery failed; message retained for retry.");
      }
    } finally { busy = false; }
  };
  const timer = setInterval(() => { void tick().catch(() => console.error("Email worker unavailable; retrying.")); }, 3000);
  timer.unref();
  return () => { clearInterval(timer); transport.close(); };
}
