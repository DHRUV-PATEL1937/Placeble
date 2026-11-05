/** Shared form checks. Keep in step with server/src/services/validation.ts. */
export const NAME_PATTERN = /^\p{L}[\p{L}\p{M} .'’-]*$/u;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Removes anything that isn't allowed in a person's name, so digits and symbols can't be typed. */
export const cleanNameInput = (value: string) => value.replace(/[^\p{L}\p{M} .'’-]/gu, "").replace(/\s{2,}/g, " ").slice(0, 80);

export function nameProblem(value: string, label = "full name") {
  const text = value.trim();
  if (!text) return `Enter your ${label}.`;
  if (text.length < 2) return `Your ${label} is too short.`;
  if (!NAME_PATTERN.test(text)) return "Use letters only. Spaces, dots, apostrophes and hyphens are fine.";
  return "";
}

export const emailProblem = (value: string) => !value.trim() ? "Enter your email address." : EMAIL_RE.test(value.trim()) ? "" : "Enter a valid email address, like you@example.com.";

export const cleanPhoneInput = (value: string) => value.replace(/[^\d+\s()-]/g, "").slice(0, 16);
export function phoneProblem(value: string, required = false) {
  if (!value.trim()) return required ? "Enter a phone number." : "";
  const digits = value.replace(/[\s()-]/g, "").replace(/^(\+?91|0)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? "" : "Enter a 10-digit Indian mobile number.";
}

export function urlProblem(value: string) {
  if (!value.trim()) return "";
  try { const url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`); return url.hostname.includes(".") ? "" : "Enter a valid link."; } catch { return "Enter a valid link."; }
}

export const clampText = (value: string, max: number) => value.slice(0, max);
