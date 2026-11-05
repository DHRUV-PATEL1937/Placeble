export type DeviceScope = "camera" | "microphone" | "both";
export type DeviceIssueKind = "blocked" | "missing" | "busy" | "insecure" | "timeout" | "disconnected" | "unsupported" | "unknown";
export type DeviceIssue = { kind: DeviceIssueKind; scope: DeviceScope; title: string; help: string[] };

const what = (scope: DeviceScope) => scope === "both" ? "camera and microphone" : scope;

/** Turns the browser's cryptic media errors into a clear problem and the steps that actually fix it. */
export function describeMediaError(error: unknown, scope: DeviceScope): DeviceIssue {
  const name = (error as { name?: string })?.name ?? "";
  const message = (error as { message?: string })?.message ?? "";
  const subject = what(scope);
  if (typeof window !== "undefined" && !window.isSecureContext) return { kind: "insecure", scope, title: "This page isn’t secure, so the browser blocks your devices", help: ["Open Placeble using its https:// address.", "Browsers only allow camera and microphone on secure pages."] };
  if (!navigator.mediaDevices?.getUserMedia) return { kind: "unsupported", scope, title: "This browser can’t use your camera or microphone", help: ["Use the latest Chrome, Edge or Safari.", "You can still practise by typing your answers."] };
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return { kind: "blocked", scope, title: `Your browser is blocking the ${subject}`, help: [
    "Click the camera or lock icon at the left of the address bar and choose Allow for camera and microphone.",
    "Then press Try again.",
    "Still stuck? On Windows open Settings → Privacy & security → Camera / Microphone, and make sure apps and your browser are allowed.",
  ] };
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return { kind: "missing", scope, title: `No ${subject} found`, help: [
    "Check that it’s plugged in and not switched off.",
    "On a laptop, make sure the camera isn’t disabled with a function key or privacy shutter.",
    "Then press Try again, or choose another device from the list.",
  ] };
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return { kind: "busy", scope, title: `Another app is using your ${subject}`, help: [
    "Close Zoom, Teams, Google Meet, or any other tab or app that might be using it.",
    "Then press Try again.",
  ] };
  if (message.includes("timed out")) return { kind: "timeout", scope, title: "Waiting for you to allow access", help: [
    "Look for a pop-up near the address bar asking to use your camera and microphone, and choose Allow.",
    "If you don’t see one, press Try again.",
  ] };
  return { kind: "unknown", scope, title: `We couldn’t start your ${subject}`, help: ["Press Try again.", "If it keeps happening, reload the page, or practise by typing your answers."] };
}

export const disconnectedIssue = (scope: DeviceScope): DeviceIssue => ({
  kind: "disconnected", scope, title: `Your ${what(scope)} disconnected`,
  help: ["It may have been unplugged, or another app took it.", "Reconnect it and press Try again. Your answers so far are safe."],
});

export type DeviceChoice = { id: string; label: string };
export async function listDevices(): Promise<{ cameras: DeviceChoice[]; microphones: DeviceChoice[] }> {
  if (!navigator.mediaDevices?.enumerateDevices) return { cameras: [], microphones: [] };
  const all = await navigator.mediaDevices.enumerateDevices();
  const pick = (kind: MediaDeviceKind, fallback: string) => all.filter(device => device.kind === kind && device.deviceId).map((device, index) => ({ id: device.deviceId, label: device.label || `${fallback} ${index + 1}` }));
  return { cameras: pick("videoinput", "Camera"), microphones: pick("audioinput", "Microphone") };
}

export const captionsSupported = () => typeof window !== "undefined" && Boolean((window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);
