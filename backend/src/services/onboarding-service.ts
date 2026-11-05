export const MIN_AGE = 13;
export const ADULT_AGE = 18;

export function ageOn(dateOfBirth: Date, now = new Date()) {
  let age = now.getFullYear() - dateOfBirth.getFullYear();
  const hadBirthday = now.getMonth() > dateOfBirth.getMonth() || (now.getMonth() === dateOfBirth.getMonth() && now.getDate() >= dateOfBirth.getDate());
  if (!hadBirthday) age -= 1;
  return age;
}

export type OnboardingState = "needed" | "guardian_pending" | "guardian_declined" | "done";

/**
 * Where a student is in first-time setup. "done" needs the setup form submitted, a date of birth, and,
 * for anyone under 18, a parent or guardian's consent.
 */
export function onboardingState(profile: { onboardingCompleted?: boolean | null; dateOfBirth?: Date | null; guardianConsent?: { status?: string | null } | null }): OnboardingState {
  if (!profile.onboardingCompleted || !profile.dateOfBirth) return "needed";
  const status = profile.guardianConsent?.status ?? "not_required";
  if (status === "pending") return "guardian_pending";
  if (status === "declined") return "guardian_declined";
  return "done";
}
