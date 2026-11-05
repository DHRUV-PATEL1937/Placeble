import assert from "node:assert/strict";
import { test } from "node:test";
import crypto from "node:crypto";
import mongoose from "mongoose";
import express from "express";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.MONGODB_URI = "mongodb://127.0.0.1/email-test";
process.env.JWT_ACCESS_SECRET = "test-access-secret-000000000000000000000000";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-00000000000000000000000";
process.env.SMTP_USER = "test@example.com";
process.env.SMTP_PASSWORD = "fake-app-password";
process.env.APP_ORIGIN = "https://placeble.example";
const { env } = await import("../src/config/env");
const { queueEmail, startEmailWorker, appLink } = await import("../src/services/email-service");
const { sendAccountLink } = await import("../src/services/account-email-service");
const { EmailMessage } = await import("../src/models/EmailMessage");
const { EmailActionToken } = await import("../src/models/EmailActionToken");
const { User } = await import("../src/models/User");
const { Notification } = await import("../src/models/Notification");
const { authRouter } = await import("../src/routes/auth");

test("SMTP queue and account recovery integration", async t => {
  const db = await MongoMemoryServer.create();
  await mongoose.connect(db.getUri());
  const app = express(); app.use(express.json()); app.use("/auth", authRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.on("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const post = (path: string, body: object) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const user = await User.create({ name: "Test Student", email: "student@example.com", passwordHash: await bcrypt.hash("OldPassword1", 4), role: "student", status: "active" });
  let stop = () => {};
  const originalTransport = nodemailer.createTransport;
  try {
    await t.test("queue deduplicates and encrypts message contents", async () => {
      const message = { key: "test-dedupe", to: user.email, subject: "Test", text: "secret-token" };
      assert.equal(await queueEmail(message), "queued"); await queueEmail(message);
      assert.equal(await EmailMessage.countDocuments({ key: message.key }), 1);
      assert.ok(!(await EmailMessage.findOne({ key: message.key })).payload.includes("secret-token"));
      assert.equal(appLink("/reset-password?token=abc"), "https://placeble.example/reset-password?token=abc");
      assert.throws(() => appLink("//evil.example"));
    });
    await t.test("reset links are hashed, rate limited per account, and single use", async () => {
      await sendAccountLink(user, "reset"); await sendAccountLink(user, "reset");
      assert.equal(await EmailActionToken.countDocuments({ userId: user._id, purpose: "reset" }), 1);
      const mail = await EmailMessage.findOne({ recipient: user.email, key: /^account:/ });
      const buffer = Buffer.from(mail.payload, "base64");
      const cipher = crypto.createDecipheriv("aes-256-gcm", crypto.createHash("sha256").update(env.JWT_REFRESH_SECRET).digest(), buffer.subarray(0, 12)); cipher.setAuthTag(buffer.subarray(12, 28));
      const content = JSON.parse(Buffer.concat([cipher.update(buffer.subarray(28)), cipher.final()]).toString());
      const token = content.text.match(/token=([A-Za-z0-9_-]+)/)[1];
      assert.notEqual((await EmailActionToken.findOne({ userId: user._id })).tokenHash, token);
      assert.equal((await post("/auth/reset-password", { token, password: "NewPassword2" })).status, 200);
      assert.ok(await bcrypt.compare("NewPassword2", (await User.findById(user._id))!.passwordHash!));
      assert.equal((await post("/auth/reset-password", { token, password: "NewPassword3" })).status, 400);
      const missing = await (await post("/auth/forgot-password", { email: "missing@example.com" })).json();
      const existing = await (await post("/auth/forgot-password", { email: user.email })).json();
      assert.deepEqual(existing, missing);
    });
    await t.test("SMTP worker sends queued email and new notifications, clearing sensitive payloads", async () => {
      let sent = 0;
      nodemailer.createTransport = ((options: any) => {
        assert.equal(options.secure, true); assert.equal(options.requireTLS, true);
        return { sendMail: async (message: any) => { assert.equal(message.from.address, "noreply@placeble.in"); sent++; }, close() {} };
      }) as typeof nodemailer.createTransport;
      await Notification.create({ userId: user._id, kind: "drive", title: "Shortlisted", body: "Your next step" });
      stop = startEmailWorker();
      await new Promise(resolve => setTimeout(resolve, 6500));
      assert.ok(sent >= 1);
      assert.equal((await EmailMessage.findOne({ status: "sent" })).payload, "");
      assert.equal(await Notification.countDocuments({ emailPending: true }), 0);
      assert.equal(await EmailMessage.countDocuments({ key: /^notification:/ }), 1);
    });
    await t.test("unconfigured provider does not claim delivery", async () => {
      const password = env.SMTP_PASSWORD; env.SMTP_PASSWORD = "";
      try { assert.equal(await queueEmail({ key: "disabled", to: user.email, subject: "Disabled", text: "test" }), "provider_not_configured"); }
      finally { env.SMTP_PASSWORD = password; }
    });
    await t.test("verification preserves account approval and rejects expired or reused tokens", async () => {
      const token = crypto.randomBytes(32).toString("base64url");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      await User.updateOne({ _id: user._id }, { $set: { status: "pending" } });
      await EmailActionToken.create({ userId: user._id, purpose: "verify", tokenHash, expiresAt: new Date(Date.now() + 60000) });
      assert.equal((await post("/auth/verify-email", { token })).status, 200);
      const verified = await User.findById(user._id);
      assert.equal(verified!.emailVerified, true); assert.equal(verified!.status, "pending");
      assert.equal((await post("/auth/verify-email", { token })).status, 400);
      const expired = "expired-token-00000000000000000";
      await EmailActionToken.create({ userId: user._id, purpose: "reset", tokenHash: crypto.createHash("sha256").update(expired).digest("hex"), expiresAt: new Date(Date.now() - 1000) });
      assert.equal((await post("/auth/reset-password", { token: expired, password: "NewPassword4" })).status, 400);
    });
    await t.test("SMTP failure keeps the message for a delayed retry", async () => {
      stop();
      await EmailMessage.deleteMany({});
      nodemailer.createTransport = (() => ({ sendMail: async () => { throw new Error("Simulated SMTP outage"); }, close() {} })) as typeof nodemailer.createTransport;
      await queueEmail({ key: "retry-me", to: user.email, subject: "Retry", text: "Keep this message" });
      stop = startEmailWorker();
      await new Promise(resolve => setTimeout(resolve, 3500));
      const queued = await EmailMessage.findOne({ key: "retry-me" });
      assert.equal(queued.status, "queued"); assert.equal(queued.attempts, 1);
      assert.ok(queued.nextAttemptAt.getTime() > Date.now());
      assert.ok(queued.payload.length > 0);
    });
  } finally { stop(); nodemailer.createTransport = originalTransport; server.close(); await mongoose.disconnect(); await db.stop(); }
});
