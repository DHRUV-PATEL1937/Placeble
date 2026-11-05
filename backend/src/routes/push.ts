import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { PushDevice } from "../models/PushDevice";

const router = Router();
router.use(requireAuth);

const registerInput = z.object({
  token: z.string().trim().regex(/^(Expo|Exponent)PushToken\[[\w-]+\]$/, "Invalid push token."),
  platform: z.enum(["android", "ios"]).default("android"),
}).strict();

/** The mobile app calls this after sign-in. A token belongs to one user at a time, so signing in as someone else moves it. */
router.post("/register", async (request, response) => {
  const input = registerInput.parse(request.body);
  await PushDevice.findOneAndUpdate({ token: input.token }, { $set: { userId: request.auth!.userId, platform: input.platform, lastSeenAt: new Date() } }, { upsert: true });
  return response.status(204).end();
});

/** Called on sign-out so the phone stops receiving this user's notifications. */
router.post("/unregister", async (request, response) => {
  const { token } = z.object({ token: z.string().max(200) }).parse(request.body);
  await PushDevice.deleteOne({ token, userId: request.auth!.userId });
  return response.status(204).end();
});

export { router as pushRouter };
