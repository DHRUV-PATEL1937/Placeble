import type { ResumeDesign, ResumePersonalDetails } from "./resume-settings";
export function formatResumeDate(value: unknown, design: ResumeDesign) {
  const source = String(value || "");
  if (design.dateFormat === "original" || !source) return source;
  return source.split(/\s+[—–-]\s+|\s+to\s+/i).map(part => {
    if (/^\d{4}$/.test(part)) return part;
    const match = part.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/) || part.match(/^(\d{1,2})\/(\d{4})$/);
    if (!match) return part;
    const year = match[1].length === 4 ? Number(match[1]) : Number(match[2]);
    const month = match[1].length === 4 ? Number(match[2]) : Number(match[1]);
    if (month < 1 || month > 12) return part;
    if (design.dateFormat === "year") return String(year);
    if (design.dateFormat === "short") return `${String(month).padStart(2, "0")}/${year}`;
    return new Intl.DateTimeFormat(design.locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
  }).join(" — ");
}
export function resumeContacts(person: ResumePersonalDetails, design: ResumeDesign) {
  return [person.email, person.phone, person.location, ...(design.showLinks ? [person.linkedin, person.website] : [])].filter(Boolean);
}
