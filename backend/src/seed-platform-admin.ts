import bcrypt from "bcryptjs";
import { connectDatabase, disconnectDatabase } from "./config/database";
import { env } from "./config/env";
import { User } from "./models/User";

async function seedPlatformAdmin() {
  if (!env.PLATFORM_ADMIN_EMAIL || !env.PLATFORM_ADMIN_PASSWORD) {
    throw new Error("Set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD before running the one-time platform-admin seed.");
  }
  await connectDatabase();
  const existing = await User.findOne({ email: env.PLATFORM_ADMIN_EMAIL.toLowerCase() });
  if (existing && existing.role !== "platform_admin") throw new Error("That email already belongs to a non-platform account.");
  await User.findOneAndUpdate(
    { email: env.PLATFORM_ADMIN_EMAIL.toLowerCase() },
    { $set: { name: existing?.name ?? "Placeble Platform Admin", passwordHash: await bcrypt.hash(env.PLATFORM_ADMIN_PASSWORD, 12), role: "platform_admin", institutionId: null, recruiterOrgId: null, authProvider: "password", status: "active", emailVerified: true, passwordChangedAt: new Date() } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
  console.log("Platform administrator seeded securely.");
  await disconnectDatabase();
}

seedPlatformAdmin().catch(async error => { console.error(error instanceof Error ? error.message : error); await disconnectDatabase(); process.exit(1); });
