export const MIN_AGE = 13;
export const ADULT_AGE = 18;
/** Oldest age accepted for a date of birth. Keeps the date picker to realistic student years instead of going back to 1950. */
export const MAX_AGE = 45;

/**
 * Years a student can pick. Graduating: 5 years back (graduates looking for placement) up to 5 years ahead.
 * Admission: 10 years back (so a 4 or 5 year course that ended 5 years ago still fits) up to next year.
 */
export const GRADUATION_YEARS_AHEAD = 5;
export const GRADUATION_YEARS_BACK = 5;
export const ADMISSION_YEARS_BACK = 10;
export function yearLimits(now = new Date()) {
  const year = now.getFullYear();
  return { admissionMin: year - ADMISSION_YEARS_BACK, admissionMax: year + 1, graduationMin: year - GRADUATION_YEARS_BACK, graduationMax: year + GRADUATION_YEARS_AHEAD };
}

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
