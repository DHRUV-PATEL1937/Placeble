import { z } from "zod";

/** A person's name: letters (any language), spaces, dots, apostrophes and hyphens only. No digits or symbols. */
export const PERSON_NAME_PATTERN = /^\p{L}[\p{L}\p{M} .'’-]*$/u;
export const personName = z.string().trim().min(2, "Enter the full name.").max(80).regex(PERSON_NAME_PATTERN, "Names can only contain letters, spaces, dots, apostrophes and hyphens.");

/** Indian mobile number, with or without +91 / 0. Returns the 10 digits, or null. */
export function cleanIndianMobile(value: string) {
  const digits = value.replace(/[\s()-]/g, "").replace(/^(\+?91|0)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

/**
 * Mail providers that everyone uses. Any number of colleges and universities may list them,
 * because they say nothing about which college a student belongs to.
 */
export const COMMON_EMAIL_DOMAINS = ["gmail.com"] as const;
export const isCommonDomain = (domain: string) => (COMMON_EMAIL_DOMAINS as readonly string[]).includes(domain.trim().toLowerCase());
/** The domains that only one college may own. */
export const exclusiveDomains = (domains: string[]) => domains.filter(domain => !isCommonDomain(domain));

/** Direct (B2C) students sign up with Gmail only for now. */
export const B2C_EMAIL_DOMAIN = "gmail.com";
