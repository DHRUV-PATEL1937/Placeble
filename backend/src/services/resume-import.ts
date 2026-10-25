import type { ResumeSection } from "./resume-service";

const headingTypes: Array<[RegExp, ResumeSection["type"]]> = [
  [/^(professional |career )?(summary|profile|objective|about me)$/, "summary"],
  [/^(professional |work |relevant )?(experience|employment|work history|internships?)$/, "experience"],
  [/^(education|academic background|academic qualifications|academics)$/, "education"],
  [/^(technical |core |professional )?(skills|technologies|competencies|expertise)$/, "skills"],
  [/^(personal |academic |selected )?projects$/, "projects"],
  [/^(certifications?|certificates|licenses)$/, "certifications"],
  [/^languages$/, "languages"], [/^interests|hobbies$/, "interests"], [/^courses|training$/, "courses"],
  [/^awards|honors|achievements$/, "awards"], [/^organizations|volunteering$/, "organizations"],
  [/^publications$/, "publications"], [/^references$/, "references"], [/^declaration$/, "declaration"],
];
export function importResumeText(raw: string) {
  const lines = raw.replace(/\r/g, "").split("\n").map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const first = lines.find(line => line.length > 0) || "";
  const email = raw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0] || "";
  const phone = lines.find(line => /^[+()\d][\d .()+-]{7,27}$/.test(line) && line.replace(/\D/g, "").length >= 9 && line.replace(/\D/g, "").length <= 15) || "";
  const linkedin = raw.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-z0-9_-]+\/?/i)?.[0] || "";
  const fullName = /^[\p{L} .'-]{3,80}$/u.test(first) && first.split(/\s+/).length <= 6 && !headingTypes.some(([pattern]) => pattern.test(first.toLowerCase())) ? first : "";
  const buckets = new Map<ResumeSection["type"], string[]>();
  let active: ResumeSection["type"] = "summary";
  let seenHeading = false;
  const contactLines = new Set([email, phone, linkedin].filter(Boolean));
  for (const line of lines) {
    const normalized = line.toLowerCase().replace(/[:|]/g, "").replace(/\s+/g, " ").trim();
    const heading = headingTypes.find(([pattern]) => pattern.test(normalized));
    if (heading) { active = heading[1]; seenHeading = true; if (!buckets.has(active)) buckets.set(active, []); continue; }
    if (line === fullName || contactLines.has(line) || (!seenHeading && contactLines.has(line.replace(/[|·•]/g, "").trim()))) continue;
    const bucket = buckets.get(active) || []; bucket.push(line); buckets.set(active, bucket);
  }
  const sections: ResumeSection[] = [];
  for (const [type, bucket] of buckets) {
    const text = bucket.join("\n").trim();
    if (!text) continue;
    const content = type === "summary" || type === "declaration" ? { text: bucket.join(" ").replace(/\s+/g, " ").trim() }
      : ["skills", "languages", "interests"].includes(type) ? { items: text.split(/[,|•\n]/).map(item => item.trim()).filter(Boolean) }
      : { entries: parseEntries(bucket, type) };
    sections.push({ type, order: sections.length, content });
  }
  return { sections, personalDetails: { fullName, email, phone, linkedin } };
}

const dateLine = /^(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?\d{4}(?:\s*(?:-|–|—|to)\s*(?:present|current|\d{4}))?$/i;
const bulletLine = /^(?:[•●▪◦*-]|\d+[.)])\s+/;
function parseEntries(source: string[], type: ResumeSection["type"]) {
  const entries: Array<Record<string, unknown>> = [];
  let current: Record<string, unknown> | null = null;
  const push = () => { if (current && Object.values(current).some(value => String(value || "").trim())) entries.push(current); current = null; };
  for (const rawLine of source) {
    const line = rawLine.replace(bulletLine, "").trim();
    if (!line) { push(); continue; }
    if (dateLine.test(line)) {
      if (!current) current = {};
      current.date = line;
      continue;
    }
    if (bulletLine.test(rawLine)) {
      if (!current) current = {};
      current.bullets = [...((current.bullets as string[] | undefined) || []), line];
      continue;
    }
    if (!current) { current = type === "education" ? { degree: line } : { title: line }; continue; }
    if (type === "education" && !current.institution) { current.institution = line; continue; }
    if (!current.subtitle && ["experience", "projects", "certifications", "courses", "awards", "organizations"].includes(type)) { current.subtitle = line; continue; }
    current.detail = [String(current.detail || ""), line].filter(Boolean).join(" ");
  }
  push();
  return entries;
}
