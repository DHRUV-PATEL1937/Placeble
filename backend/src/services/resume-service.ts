import { randomUUID } from "node:crypto";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import mammoth from "mammoth";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import PDFDocument from "pdfkit";
import { cosineSimilarity, embedText, EMBEDDING_PIPELINE_VERSION } from "./embedding-service";

export type ResumeSection = {
  type: "summary" | "experience" | "education" | "skills" | "projects" | "certifications";
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

function tokens(value: string) {
  const stop = new Set(["about", "after", "again", "also", "been", "being", "candidate", "company", "from", "have", "into", "more", "must", "role", "that", "their", "they", "this", "with", "will", "work", "years", "your"]);
  return value.toLowerCase().match(/[a-z][a-z+#.-]{2,}/g)?.filter(token => token.length > 3 && !stop.has(token)) ?? [];
}

export function resumeText(sections: ResumeSection[]) {
  return sections.map(section => Object.values(section.content).flatMap(value => Array.isArray(value) ? value.map(item => typeof item === "object" ? Object.values(item ?? {}).join(" ") : String(item)) : typeof value === "object" ? Object.values(value ?? {}).join(" ") : String(value)).join(" ")).join(" ");
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

export function scoreResume(sections: ResumeSection[], targetJdText = "") {
  const text = resumeText(sections);
  if (!targetJdText.trim()) {
    const present = new Set(sections.filter(section => resumeText([section]).trim().length > 10).map(section => section.type));
    const score = Math.min(92, 46 + present.size * 7 + Math.min(12, new Set(tokens(text)).size / 3));
    return { atsScore: Math.round(score), keywordOverlap: Math.round(score - 4), semanticSimilarity: Math.round(score + 3), missingKeywords: ["Add a target job description for role-specific gaps"] };
  }
  const jdTerms = [...new Set(tokens(targetJdText))].slice(0, 30);
  const resumeTerms = new Set(tokens(text));
  const matches = jdTerms.filter(term => resumeTerms.has(term));
  const missingKeywords = jdTerms.filter(term => !resumeTerms.has(term)).slice(0, 8);
  const keywordOverlap = jdTerms.length ? Math.round(matches.length / jdTerms.length * 100) : 0;
  const union = new Set([...jdTerms, ...resumeTerms]);
  const semanticSimilarity = union.size ? Math.round(matches.length / union.size * 100 * 2.8) : 0;
  return { atsScore: Math.min(98, Math.round(keywordOverlap * .68 + semanticSimilarity * .32)), keywordOverlap, semanticSimilarity: Math.min(100, semanticSimilarity), missingKeywords };
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
    return { ...lexical, semanticSimilarity, atsScore: Math.min(98, Math.round(lexical.keywordOverlap * .62 + semanticSimilarity * .38)) };
  } catch {
    return lexical;
  }
}

export function generateProfileResume(profile: { degree?: string | null; graduationYear?: number | null; skills?: string[] | null; preferredRoles?: string[] | null }, studentName: string, targetJdText = "") {
  const skills = profile.skills?.filter(Boolean) ?? [];
  const roles = profile.preferredRoles?.filter(Boolean) ?? [];
  const focus = roles[0] ?? "graduate technology";
  const sections: ResumeSection[] = [
    { type: "summary", order: 0, content: { text: `${profile.degree || "Technology"} student preparing for ${focus} roles, with demonstrated skills in ${skills.slice(0, 4).join(", ") || "problem solving and collaborative delivery"}. Brings a structured learning mindset and a focus on clear, dependable work.` } },
    { type: "education", order: 1, content: { entries: [{ institution: "TechEnd Institute of Technology", degree: profile.degree || "Bachelor's degree", graduationYear: profile.graduationYear || 2027, detail: "Relevant learning and practical coursework" }] } },
    { type: "skills", order: 2, content: { items: skills.length ? skills : ["Problem solving", "Communication", "Team collaboration"] } },
    { type: "projects", order: 3, content: { entries: [] } },
    { type: "experience", order: 4, content: { entries: [] } },
    { type: "certifications", order: 5, content: { entries: [] } },
  ];
  const score = scoreResume(sections, targetJdText);
  return { title: `${studentName} — ${roles[0] || "Graduate"} Resume`, sections, targetJdText, ...score };
}

function sectionFromLines(type: ResumeSection["type"], order: number, lines: string[]): ResumeSection {
  if (type === "summary") return { type, order, content: { text: lines.slice(0, 4).join(" ").slice(0, 700) } };
  if (type === "skills") return { type, order, content: { items: lines.join(",").split(/[,|•]/).map(item => item.trim()).filter(Boolean).slice(0, 24) } };
  return { type, order, content: { entries: lines.filter(Boolean).slice(0, 8).map(line => ({ title: line, subtitle: "Imported from your resume", date: "", bullets: [] })) } };
}

export async function parseResumeUpload(file: Express.Multer.File) {
  const lower = file.originalname.toLowerCase();
  const rawText = lower.endsWith(".docx") ? (await mammoth.extractRawText({ buffer: file.buffer })).value : (await pdfParse(file.buffer)).text;
  const cleaned = rawText.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) throw new Error("We could not find readable text in that file.");
  const buckets: Record<string, string[]> = { summary: [], experience: [], education: [], skills: [], projects: [], certifications: [] };
  let active = "summary";
  for (const line of cleaned.split("\n").map(value => value.trim()).filter(Boolean)) {
    const heading = line.toLowerCase().replace(/[^a-z ]/g, "");
    if (/^(professional )?summary|profile|objective$/.test(heading)) active = "summary";
    else if (/experience|employment|internships?/.test(heading)) active = "experience";
    else if (/education|academics?/.test(heading)) active = "education";
    else if (/skills|technologies|competencies/.test(heading)) active = "skills";
    else if (/projects?/.test(heading)) active = "projects";
    else if (/certifications?|courses?/.test(heading)) active = "certifications";
    else buckets[active].push(line);
  }
  const ordered = ["summary", "experience", "education", "skills", "projects", "certifications"] as const;
  const sections = ordered.map((type, index) => sectionFromLines(type, index, buckets[type]));
  const score = scoreResume(sections);
  return { title: file.originalname.replace(/\.(pdf|docx)$/i, ""), sections, rawTextLength: cleaned.length, ...score };
}

function displaySectionTitle(type: ResumeSection["type"]) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function contentLines(section: ResumeSection) {
  const content = section.content;
  if (section.type === "summary") return [String(content.text ?? "")];
  if (section.type === "skills") return [(content.items as unknown[] ?? []).join(" • ")];
  const entries = (content.entries as Array<Record<string, unknown>> ?? []);
  return entries.flatMap(entry => [String(entry.title ?? entry.institution ?? ""), [entry.subtitle ?? entry.degree, entry.date ?? entry.graduationYear].filter(Boolean).join(" · "), ...(Array.isArray(entry.bullets) ? entry.bullets.map(bullet => `• ${bullet}`) : [])].filter(Boolean));
}

export async function renderResumeDocx(name: string, title: string, sections: ResumeSection[]) {
  const children: Paragraph[] = [
    new Paragraph({ text: name, heading: HeadingLevel.TITLE, spacing: { after: 80 } }),
    new Paragraph({ children: [new TextRun({ text: title, color: "4A5688", size: 20 })], spacing: { after: 220 } }),
  ];
  for (const section of [...sections].sort((a, b) => a.order - b.order)) {
    children.push(new Paragraph({ text: displaySectionTitle(section.type), heading: HeadingLevel.HEADING_1, spacing: { before: 220, after: 80 } }));
    for (const line of contentLines(section)) children.push(new Paragraph({ text: line, bullet: line.startsWith("•") ? { level: 0 } : undefined, spacing: { after: 70 } }));
  }
  return Buffer.from(await Packer.toBuffer(new Document({ sections: [{ properties: {}, children }] })));
}

export async function renderResumePdf(name: string, title: string, sections: ResumeSection[]) {
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", margins: { top: 48, right: 52, bottom: 48, left: 52 } });
    const chunks: Buffer[] = [];
    document.on("data", chunk => chunks.push(Buffer.from(chunk)));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
    document.fillColor("#0B1224").font("Helvetica-Bold").fontSize(22).text(name);
    document.fillColor("#4A5688").font("Helvetica").fontSize(10).text(title, { lineGap: 3 });
    document.moveDown(1.2);
    for (const section of [...sections].sort((a, b) => a.order - b.order)) {
      document.fillColor("#0B1224").font("Helvetica-Bold").fontSize(11).text(displaySectionTitle(section.type).toUpperCase(), { characterSpacing: 1.2 });
      document.moveTo(document.x, document.y + 3).lineTo(543, document.y + 3).strokeColor("#D9DEEA").lineWidth(.6).stroke();
      document.moveDown(.55);
      for (const line of contentLines(section)) {
        document.fillColor("#3E4658").font(line.startsWith("•") ? "Helvetica" : "Helvetica").fontSize(9.5).text(line, { lineGap: 2, indent: line.startsWith("•") ? 8 : 0 });
        document.moveDown(.3);
      }
      document.moveDown(.7);
    }
    document.end();
  });
}

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
