import PDFDocument from "pdfkit";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { ResumeSection } from "./resume-service";
import { personalDetailsSchema, resumeDesignSchema, type ResumeRenderOptions } from "./resume-settings";

const labels: Record<string, string> = { summary: "Profile", experience: "Professional experience", education: "Education", skills: "Skills", projects: "Projects", certifications: "Certifications", languages: "Languages", interests: "Interests", courses: "Courses", awards: "Awards", organizations: "Organizations", publications: "Publications", references: "References", declaration: "Declaration", custom: "Additional information" };
function visibleSections(sections: ResumeSection[]) { return [...sections].filter(section => !section.content.hidden).sort((a, b) => a.order - b.order); }
function sectionTitle(section: ResumeSection) { return String(section.content.heading || labels[section.type] || section.type); }
function lines(section: ResumeSection): Array<{ text: string; bold?: boolean; bullet?: boolean }> {
  const content = section.content;
  const result: Array<{ text: string; bold?: boolean; bullet?: boolean }> = [];
  if (content.text) result.push({ text: String(content.text) });
  if (Array.isArray(content.items) && content.items.length) result.push({ text: content.items.join("  ·  ") });
  if (Array.isArray(content.entries)) for (const entry of content.entries as Array<Record<string, unknown>>) {
    const title = entry.title || entry.degree || "";
    if (title) result.push({ text: String(title), bold: true });
    const metadata = [entry.subtitle || entry.institution, entry.date || entry.graduationYear, entry.location].filter(Boolean).join(" · ");
    if (metadata) result.push({ text: metadata });
    if (entry.detail) result.push({ text: String(entry.detail) });
    if (Array.isArray(entry.bullets)) for (const bullet of entry.bullets) if (String(bullet).trim()) result.push({ text: String(bullet).replace(/^[•-]\s*/, ""), bullet: true });
  }
  return result;
}

export async function renderResumePdf(name: string, title: string, sections: ResumeSection[], options: ResumeRenderOptions = {}) {
  const details = personalDetailsSchema.parse({ fullName: name, ...options.personalDetails });
  const design = resumeDesignSchema.parse(options.design || {});
  const modern = options.template === "modern";
  const compact = options.template === "compact";
  const margin = design.margin;
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: design.pageSize, compress: false, bufferPages: true, margins: { top: margin, bottom: margin, left: modern ? 210 : margin, right: margin }, info: { Title: title, Author: details.fullName || name } });
    const chunks: Buffer[] = [];
    doc.on("data", chunk => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const normal = design.font === "serif" ? "Times-Roman" : "Helvetica";
    const bold = design.font === "serif" ? "Times-Bold" : "Helvetica-Bold";
    const x = modern ? 210 : margin;
    const width = doc.page.width - x - margin;
    const fontSize = compact ? Math.max(9, design.fontSize - .5) : design.fontSize;
    const lineGap = Math.max(1, fontSize * (design.lineHeight - 1) * .65);
    const background = () => {
      if (!modern) return;
      doc.save().rect(0, 0, 182, doc.page.height).fill(design.accent).restore();
      doc.x = x; doc.y = margin;
    };
    background(); doc.on("pageAdded", background);
    if (modern) {
      const contact = [details.email, details.phone, details.location, details.linkedin, details.website].filter(Boolean);
      // The contact block uses a bounded sidebar; long fields wrap rather than crossing columns.
      doc.fillColor("#FFFFFF").font(bold).fontSize(21).text(details.fullName || name, 24, margin, { width: 134, lineGap: 3 });
      if (details.professionalTitle) doc.font(normal).fontSize(10).text(details.professionalTitle, { width: 134, lineGap: 3 });
      doc.moveDown(1.5);
      for (const item of contact) { doc.fillColor("#FFFFFF").font(normal).fontSize(8.5).text(item, { width: 134, lineGap: 3 }); doc.moveDown(.65); }
      doc.x = x; doc.y = margin;
    } else {
      doc.fillColor(design.accent).font(bold).fontSize(25).text(details.fullName || name, x, margin, { width, align: design.headerAlign });
      if (details.professionalTitle) doc.fillColor("#465165").font(normal).fontSize(11).text(details.professionalTitle, { width, align: design.headerAlign });
      const contact = [details.email, details.phone, details.location, details.linkedin, details.website].filter(Boolean).join("  ·  ");
      if (contact) doc.moveDown(.4).font(normal).fontSize(8.5).fillColor("#566074").text(contact, { width, align: design.headerAlign, lineGap: 3 });
      doc.moveDown(1.4);
    }
    for (const section of visibleSections(sections)) {
      const content = lines(section);
      if (!content.length) continue;
      if (doc.y > doc.page.height - margin - 65) doc.addPage();
      if (design.sectionStyle === "band") doc.save().rect(x, doc.y - 3, width, 19).fill("#F0F2F5").restore();
      doc.font(bold).fontSize(fontSize + 1).fillColor(design.accent).text(sectionTitle(section).toUpperCase(), x, doc.y, { width, characterSpacing: .7, lineGap: 2 });
      if (design.sectionStyle === "rule") doc.save().moveTo(x, doc.y + 3).lineTo(x + width, doc.y + 3).strokeColor(design.accent).lineWidth(.5).stroke().restore();
      doc.moveDown(.7);
      for (const line of content) {
        doc.font(line.bold ? bold : normal).fontSize(fontSize).fillColor("#283243").text(`${line.bullet ? "• " : ""}${line.text}`, x, doc.y, { width, lineGap });
        doc.moveDown(line.bold ? .2 : .38);
      }
      doc.moveDown(compact ? .45 : .8);
    }
    doc.end();
  });
}

export async function renderResumeDocx(name: string, title: string, sections: ResumeSection[], options: ResumeRenderOptions = {}) {
  const details = personalDetailsSchema.parse({ fullName: name, ...options.personalDetails });
  const design = resumeDesignSchema.parse(options.design || {});
  const accent = design.accent.slice(1);
  const font = design.font === "serif" ? "Times New Roman" : "Arial";
  const alignment = design.headerAlign === "center" ? "center" as const : "left" as const;
  const children: Paragraph[] = [new Paragraph({ alignment, children: [new TextRun({ text: details.fullName || name, bold: true, size: 48, color: accent })] })];
  if (details.professionalTitle) children.push(new Paragraph({ text: details.professionalTitle, alignment, spacing: { after: 100 } }));
  const contact = [details.email, details.phone, details.location, details.linkedin, details.website].filter(Boolean).join(" · ");
  if (contact) children.push(new Paragraph({ text: contact, alignment, spacing: { after: 200 } }));
  for (const section of visibleSections(sections)) {
    const content = lines(section); if (!content.length) continue;
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: sectionTitle(section), bold: true, color: accent, size: 24 })], spacing: { before: 220, after: 100 }, keepNext: true }));
    for (const line of content) children.push(new Paragraph({ children: [new TextRun({ text: line.text, bold: line.bold })], bullet: line.bullet ? { level: 0 } : undefined, spacing: { after: 75, line: Math.round(240 * design.lineHeight) } }));
  }
  return Buffer.from(await Packer.toBuffer(new Document({ title, creator: details.fullName || name, styles: { default: { document: { run: { font, size: design.fontSize * 2, color: "283243" } } } }, sections: [{ properties: { page: { size: { width: design.pageSize === "A4" ? 11906 : 12240, height: design.pageSize === "A4" ? 16838 : 15840 }, margin: { top: design.margin * 20, right: design.margin * 20, bottom: design.margin * 20, left: design.margin * 20 } } }, children }] })));
}
