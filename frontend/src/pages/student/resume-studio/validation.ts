import { cleanNameInput, cleanPhoneInput, emailProblem, nameProblem, phoneProblem, urlProblem } from "@/services/validation";
import type { Personal } from "./types";

type Key = keyof Personal;

/** Removes characters that can't belong in the field, as the person types. */
export function cleanPersonal(key: Key, value: string) {
  switch (key) {
    case "fullName": return cleanNameInput(value);
    case "professionalTitle": return value.replace(/[^\p{L}\p{N} &/.,()+#'’-]/gu, "").slice(0, 80);
    case "phone": return cleanPhoneInput(value);
    case "location": return value.replace(/[^\p{L}\p{N} ,.'’()-]/gu, "").slice(0, 80);
    case "linkedin": case "website": return value.replace(/\s/g, "").slice(0, 200);
    case "email": return value.replace(/\s/g, "").slice(0, 160);
    default: return value;
  }
}

const LINKEDIN = /^(https?:\/\/)?([a-z]{2,3}\.)?linkedin\.com\/(in|pub|company)\/[\w%.-]+\/?(\?.*)?$/i;

/** An empty string means the value is fine. Optional fields are fine when blank. */
export function personalProblem(key: Key, value: string) {
  const text = value.trim();
  switch (key) {
    case "fullName": return nameProblem(text);
    case "email": return emailProblem(text);
    case "professionalTitle": return text && text.length < 2 ? "Enter a title, or leave this blank." : "";
    case "phone": return phoneProblem(text);
    case "location": return text && text.length < 2 ? "Enter a city, or leave this blank." : "";
    case "linkedin": return text && !LINKEDIN.test(text) ? "Use your LinkedIn profile link, like linkedin.com/in/yourname." : "";
    case "website": return urlProblem(text);
    default: return "";
  }
}

/** Free-text bits inside an entry. */
export const cleanDates = (value: string) => value.replace(/[^\p{L}\p{N} —–/.,-]/gu, "").slice(0, 40);
export const cleanPlace = (value: string) => value.replace(/[^\p{L}\p{N} ,.'’()-]/gu, "").slice(0, 80);
export const limitBullets = (value: string) => value.split("\n").slice(0, 12).map(line => line.slice(0, 300));
