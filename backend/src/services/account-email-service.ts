import crypto from "node:crypto";
import { EmailActionToken } from "../models/EmailActionToken";
import { appLink, emailConfigured, queueEmail } from "./email-service";
import { hashToken } from "./token-service";

export async function sendAccountLink(user: { _id: unknown; email: string; name: string }, purpose: "reset" | "verify") {
  if (!emailConfigured()) return;
  if (await EmailActionToken.exists({ userId: user._id, purpose, createdAt: { $gt: new Date(Date.now() - 60000) } })) return;
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + (purpose === "reset" ? 30 * 60000 : 24 * 3600000));
  const record = await EmailActionToken.create({ userId: user._id, purpose, tokenHash: hashToken(token), expiresAt });
  await queueEmail({ key: `account:${record._id}`, to: user.email, expiresAt,
    subject: purpose === "reset" ? "Reset your Placeble password" : "Verify your Placeble email",
    text: `Hello ${user.name},\n\n${purpose === "reset" ? "Reset your password" : "Confirm your email address"} using this secure link:\n${appLink(`/${purpose === "reset" ? "reset-password" : "verify-email"}?token=${token}`)}\n\nThis link expires in ${purpose === "reset" ? "30 minutes" : "24 hours"}. If you did not request this, you can ignore this email. Email verification does not replace institution or company approval.` });
}
