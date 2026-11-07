import { randomUUID } from "node:crypto";
import { importResumeText, importResumeWithSarvam } from "./resume-import";
import mammoth from "mammoth";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import PDFDocument from "pdfkit";
import { cosineSimilarity, embedText, EMBEDDING_PIPELINE_VERSION } from "./embedding-service";
import { cloudinaryEnabled, privateDownloadUrl, uploadPrivateRaw } from "./cloudinary-service";
import { resumeAtsScore } from "./scoring";

export type ResumeSection = {
  type: "summary" | "experience" | "education" | "skills" | "projects" | "certifications" | "languages" | "interests" | "courses" | "awards" | "organizations" | "publications" | "references" | "declaration" | "custom";
  order: number;
  content: Record<string, unknown>;
};

type JobStatus = "queued" | "processing" | "complete" | "failed";
type ResumeJob = { id: string; userId: string; kind: string; status: JobStatus; progress: number; message: string; result?: unknown; error?: string };
type ExportFile = { userId: string; filename: string; mimeType: string; buffer: Buffer };

const jobs = new Map<string, ResumeJob>();
const exportFiles = new Map<string, ExportFile>();

export function queueResumeJob(userId: string, kind: string, message: string, task: () => Promise<unknown>) {
  const id = randomUUID();
  jobs.set(id, { id, userId, kind, status: "queued", progress: 10, message });
  setTimeout(() => {
    const job = jobs.get(id);
    if (!job) return;
    Object.assign(job, { status: "processing", progress: 45 });
    void task().then(result => Object.assign(job, { status: "complete", progress: 100, message: "Ready", result }))
      .catch(error => Object.assign(job, { status: "failed", progress: 100, error: error instanceof Error ? error.message : "The job could not be completed." }));
  }, 240);
  return jobs.get(id)!;
}

export function getResumeJob(id: string, userId: string) {
  const job = jobs.get(id);
  return job?.userId === userId ? job : null;
}

export function storeExport(userId: string, filename: string, mimeType: string, buffer: Buffer) {
  const id = randomUUID();
  exportFiles.set(id, { userId, filename, mimeType, buffer });
  setTimeout(() => exportFiles.delete(id), 30 * 60 * 1000);
  return id;
}

export function getExport(id: string, userId: string) {
  const file = exportFiles.get(id);
  return file?.userId === userId ? file : null;
}

export async function storePersistentExport(userId: string, filename: string, buffer: Buffer) {
  if (!cloudinaryEnabled()) return null;
  const stored = await uploadPrivateRaw(buffer, { publicId: `${userId}/${filename.replace(/[^a-z0-9._-]+/gi, "-")}-${randomUUID()}` });
  return { fileUrl: privateDownloadUrl(stored, filename), stored };
}

function tokens(value: string) {
  const stop = new Set(["about", "after", "again", "also", "been", "being", "candidate", "company", "from", "have", "into", "more", "must", "role", "that", "their", "they", "this", "with", "will", "work", "years", "your"]);
  return value.toLowerCase().match(/[a-z][a-z+#.-]{2,}/g)?.filter(token => token.length > 3 && !stop.has(token)) ?? [];
}

export function resumeText(sections: ResumeSection[]) {
  const flatten = (value: unknown): string => Array.isArray(value) ? value.map(flatten).join(" ") : value && typeof value === "object" ? Object.values(value).map(flatten).join(" ") : typeof value === "string" || typeof value === "number" ? String(value) : "";
  return sections.filter(section => !section.content.hidden).map(section => Object.entries(section.content).filter(([key]) => !["hidden", "heading"].includes(key)).map(([, value]) => flatten(value)).join(" ")).join(" ").trim();
}

function withoutEmbeddingFields(profile: unknown) {
  if (!profile || typeof profile !== "object") return profile;
  const sanitized = { ...(profile as Record<string, unknown>) };
  delete sanitized.embedding;
  delete sanitized.embeddingUpdatedAt;
  delete sanitized.embeddingProfileVersion;
  return sanitized;
}

export function buildVerifiedResumeContext(input: {
  studentName: string;
  profile: unknown;
  resume: { title: string; sections: ResumeSection[]; targetJdText?: string };
  targetJdText?: string;
}) {
  return {
    studentName: input.studentName,
    verifiedProfile: withoutEmbeddingFields(input.profile),
    selectedResume: {
      title: input.resume.title,
      sections: input.resume.sections,
      plainText: resumeText(input.resume.sections),
    },
    targetJobDescription: input.targetJdText ?? input.resume.targetJdText ?? "",
  };
}

/**
 * Score for a resume with no target job: how complete and substantial it is, out of 92 (fit to a role is unknown, so it can't be perfect).
 * Core sections 70 (education, skills 15 each, summary 10, experience and projects 15 each but capped at 30 together), length 15, numbers and results 10, extras 5.
 * An empty or one-line resume scores near zero instead of getting a free floor.
 */
export function resumeCompleteness(sections: ResumeSection[], text: string) {
  const filled = (type: ResumeSection["type"]) => sections.some(section => section.type === type && !section.content.hidden && resumeText([section]).trim().length >= 25);
  const has = { education: filled("education"), skills: filled("skills"), summary: filled("summary"), experience: filled("experience"), projects: filled("projects") };
  const structure = (has.education ? 15 : 0) + (has.skills ? 15 : 0) + (has.summary ? 10 : 0) + Math.min(30, (has.experience ? 15 : 0) + (has.projects ? 15 : 0));
  const words = text.split(/\s+/).filter(Boolean).length;
  const depth = Math.min(15, Math.round(words / 20));
  const results = Math.min(10, (text.match(/\d+(?:[.,]\d+)?\s?(?:%|x|k\b|\+)?/g)?.length ?? 0) * 2);
  const extras = (["certifications", "awards", "courses", "organizations", "publications", "languages"] as const).some(filled) ? 5 : 0;
  const gaps = [
    !has.education && "Add an education section", !has.skills && "Add a skills section", !has.summary && "Add a short summary",
    !has.experience && !has.projects && "Add experience or projects", words < 150 && "Add more detail: aim for 300+ words", results < 6 && "Add numbers and results to your bullets",
  ].filter((gap): gap is string => Boolean(gap));
  return { score: Math.min(92, structure + depth + results + extras), gaps };
}

export function scoreResume(sections: ResumeSection[], targetJdText = "") {
  const text = resumeText(sections.filter(section => !section.content.hidden));
  if (!text.trim()) return { atsScore: 0, keywordOverlap: 0, semanticSimilarity: 0, missingKeywords: [] };
  if (!targetJdText.trim()) {
    const rubric = resumeCompleteness(sections, text);
    return { atsScore: rubric.score, keywordOverlap: rubric.score, semanticSimilarity: rubric.score, missingKeywords: [...rubric.gaps, "Add a target job description for role-specific gaps"].slice(0, 8) };
  }
  const jdTerms = [...new Set(tokens(targetJdText))].slice(0, 30);
  const resumeTerms = new Set(tokens(text));
  const matches = jdTerms.filter(term => resumeTerms.has(term));
  const missingKeywords = jdTerms.filter(term => !resumeTerms.has(term)).slice(0, 8);
  const keywordOverlap = jdTerms.length ? Math.round(matches.length / jdTerms.length * 100) : 0;
  const union = new Set([...jdTerms, ...resumeTerms]);
  const semanticSimilarity = union.size ? Math.round(matches.length / union.size * 100 * 2.8) : 0;
  // Fit to the job decides most of the score, but a keyword-stuffed resume with missing sections is still held back by its completeness.
  const completeness = resumeCompleteness(sections, text);
  return { atsScore: resumeAtsScore(keywordOverlap * .68 + Math.min(100, semanticSimilarity) * .32, completeness.score), keywordOverlap, semanticSimilarity: Math.min(100, semanticSimilarity), missingKeywords };
}

export async function scoreResumeWithEmbeddings(sections: ResumeSection[], targetJdText = "") {
  const lexical = scoreResume(sections, targetJdText);
  if (!targetJdText.trim()) return lexical;
  try {
    const [resumeEmbedding, jobEmbedding] = await Promise.all([
      embedText(`[${EMBEDDING_PIPELINE_VERSION}|resume-ats-v1] CANDIDATE RESUME: ${resumeText(sections)}`),
      embedText(`[${EMBEDDING_PIPELINE_VERSION}|resume-ats-v1] TARGET JOB: ${targetJdText}`),
    ]);
    const semanticSimilarity = Math.round(Math.max(0, Math.min(1, cosineSimilarity(resumeEmbedding, jobEmbedding))) * 100);
    const completeness = resumeCompleteness(sections, resumeText(sections));
    return { ...lexical, semanticSimilarity, atsScore: resumeAtsScore(lexical.keywordOverlap * .62 + semanticSimilarity * .38, completeness.score) };
  } catch {
    return lexical;
  }
}

export function generateProfileResume(profile: { degree?: string | null; graduationYear?: number | null; skills?: string[] | null; preferredRoles?: string[] | null }, studentName: string, targetJdText = "") {
  const skills = profile.skills?.filter(Boolean) ?? [];
  const roles = profile.preferredRoles?.filter(Boolean) ?? [];
  const focus = roles[0] ?? "graduate technology";
  const sections: ResumeSection[] = [
    { type: "summary", order: 0, content: { text: `${profile.degree ? `${profile.degree} student` : "Candidate"} preparing for ${focus} roles.${skills.length ? ` Skills include ${skills.slice(0, 4).join(", ")}.` : ""}` } },
    { type: "education", order: 1, content: { entries: profile.degree ? [{ institution: "", degree: profile.degree, graduationYear: profile.graduationYear || "", detail: "" }] : [] } },
    { type: "skills", order: 2, content: { items: skills } },
    { type: "projects", order: 3, content: { entries: [] } },
    { type: "experience", order: 4, content: { entries: [] } },
    { type: "certifications", order: 5, content: { entries: [] } },
  ];
  const score = scoreResume(sections, targetJdText);
  return { title: `${studentName} — ${roles[0] || "Graduate"} Resume`, sections, targetJdText, ...score };
}

export async function parseResumeUpload(file: Express.Multer.File) {
  const isDocx = file.originalname.toLowerCase().endsWith(".docx");
  const rawText = isDocx ? (await mammoth.extractRawText({ buffer: file.buffer })).value : (await pdfParse(file.buffer, { version: "v2.0.550", pagerender: layoutAwarePdfPage })).text;
  const cleaned = rawText.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned.length < 20) throw new Error("This file has too little readable text. For scanned PDFs, upload a text-based PDF or DOCX instead.");
  let parsed = importResumeText(cleaned);
  let extractionProvider = "local";
  if (process.env.SARVAM_API_KEY) {
    try {
      const aiParsed = await importResumeWithSarvam(cleaned);
      if (aiParsed?.sections.length) { parsed = aiParsed; extractionProvider = "sarvam"; }
    } catch (error) {
      console.warn("Sarvam resume extraction failed; using deterministic parser:", error instanceof Error ? error.message : error);
    }
  }
  const score = scoreResume(parsed.sections);
  return { title: file.originalname.replace(/\.(pdf|docx)$/i, ""), ...parsed, extractionProvider, rawTextLength: cleaned.length, ...score };
}

async function layoutAwarePdfPage(page: unknown) {
  const pageData = page as { getTextContent: (options: { normalizeWhitespace: boolean; disableCombineTextItems: boolean }) => Promise<{ items: Array<{ str?: string; transform?: number[] }> }> };
  const content = await pageData.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: true });
  const items = content.items.filter(item => item.str?.trim() && item.transform && item.transform.length >= 6).map(item => ({ text: item.str!.trim(), x: item.transform![4], y: item.transform![5] }));
  const rows: Array<{ y: number; items: typeof items }> = [];
  for (const item of items) {
    let row = rows.find(candidate => Math.abs(candidate.y - item.y) <= 2.5);
    if (!row) { row = { y: item.y, items: [] }; rows.push(row); }
    row.items.push(item);
  }
  const sortedRows = rows.map(row => ({ ...row, items: row.items.sort((a, b) => a.x - b.x) })).sort((a, b) => b.y - a.y);
  const xPositions = sortedRows.flatMap(row => row.items.map(item => item.x)).sort((a, b) => a - b);
  const largestGap = xPositions.reduce((best, x, index) => index ? Math.max(best, x - xPositions[index - 1]) : best, 0);
  if (largestGap < 70) return sortedRows.map(row => row.items.map(item => item.text).join(" ")).join("\n");
  const split = xPositions.find((x, index) => index && x - xPositions[index - 1] === largestGap) ?? xPositions[0];
  const left = sortedRows.filter(row => row.items.some(item => item.x < split)).map(row => row.items.filter(item => item.x < split).map(item => item.text).join(" "));
  const right = sortedRows.filter(row => row.items.some(item => item.x >= split)).map(row => row.items.filter(item => item.x >= split).map(item => item.text).join(" "));
  return [...left, ...right].filter(Boolean).join("\n");
}

export { renderResumeDocx, renderResumePdf } from "./resume-renderer";

export async function renderSimpleTextPdf(input: { studentName: string; title: string; bodyText: string }) {
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", margins: { top: 62, right: 64, bottom: 62, left: 64 } });
    const chunks: Buffer[] = [];
    document.on("data", chunk => chunks.push(Buffer.from(chunk)));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
    document.fillColor("#0B1224").font("Helvetica-Bold").fontSize(19).text(input.studentName);
    document.moveDown(.3);
    document.fillColor("#667085").font("Helvetica").fontSize(9.5).text(input.title);
    document.moveDown(2.1);
    for (const paragraph of input.bodyText.split(/\n\s*\n/).map(value => value.trim()).filter(Boolean)) {
      document.fillColor("#273043").font("Helvetica").fontSize(10.5).text(paragraph, { lineGap: 4, align: "left" });
      document.moveDown(1.15);
    }
    document.end();
  });
}
