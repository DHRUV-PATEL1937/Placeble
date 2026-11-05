import type { Types } from "mongoose";
import { PushDevice } from "../models/PushDevice";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type PushMessage = { userId: Types.ObjectId | string; title: string; body: string; url?: string };

/**
 * Sends a phone push (via Expo, which relays to Firebase) to every device the users registered.
 * Never throws: a push failure must not break the notification or broadcast that triggered it.
 */
export async function sendPushes(messages: PushMessage[]) {
  try {
    if (!messages.length) return;
    const devices = await PushDevice.find({ userId: { $in: [...new Set(messages.map(item => String(item.userId)))] } }).select("userId token").lean();
    if (!devices.length) return;
    const byUser = new Map<string, string[]>();
    for (const device of devices) byUser.set(String(device.userId), [...(byUser.get(String(device.userId)) ?? []), device.token]);

    const payloads = messages.flatMap(message => (byUser.get(String(message.userId)) ?? []).map(token => ({
      to: token, title: message.title.slice(0, 100), body: message.body.slice(0, 240), sound: "default", channelId: "default", priority: "high", data: { url: message.url ?? "/" },
    })));

    for (let start = 0; start < payloads.length; start += 100) {
      const chunk = payloads.slice(start, start + 100);
      const response = await fetch(EXPO_PUSH_URL, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(chunk) });
      if (!response.ok) { console.error("Expo push failed", response.status); continue; }
      const result = await response.json() as { data?: Array<{ status: string; details?: { error?: string } }> };
      for (const ticket of result.data ?? []) if (ticket.status === "error") console.error("Expo push rejected", ticket.details?.error ?? "unknown", JSON.stringify(ticket).slice(0, 300));
      // Drop tokens Google says no longer exist (app uninstalled / data cleared).
      const dead = (result.data ?? []).flatMap((ticket, index) => ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered" ? [chunk[index].to] : []);
      if (dead.length) await PushDevice.deleteMany({ token: { $in: dead } });
    }
  } catch (error) {
    console.error("Push delivery failed", error instanceof Error ? error.message : error);
  }
}
