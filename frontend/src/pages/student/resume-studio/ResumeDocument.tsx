import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { labels, type Resume } from "./types";

type Block = { kind: "heading" | "entry" | "meta" | "body" | "bullet"; text: string };
function blocksFor(resume: Resume): Block[] {
  const blocks: Block[] = [];
  for (const section of [...resume.sections].sort((a, b) => a.order - b.order)) {
    if (section.content.hidden) continue;
    const content: Block[] = [];
    if (section.content.text?.trim()) content.push({ kind: "body", text: section.content.text });
    if (section.content.items?.length) content.push({ kind: "body", text: section.content.items.join("  ·  ") });
    for (const entry of section.content.entries || []) {
      const title = entry.title || entry.degree;
      if (title) content.push({ kind: "entry", text: title });
      const meta = [entry.subtitle || entry.institution, entry.date || entry.graduationYear, entry.location].filter(Boolean).join(" · ");
      if (meta) content.push({ kind: "meta", text: meta });
      if (entry.detail) content.push({ kind: "body", text: entry.detail });
      for (const text of entry.bullets || []) if (text.trim()) content.push({ kind: "bullet", text });
    }
    if (content.length) blocks.push({ kind: "heading", text: section.content.heading || labels[section.type] }, ...content);
  }
  return blocks;
}
export function ResumeDocument({ resume, thumbnail = false }: { resume: Resume; thumbnail?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(.7);
  const [pages, setPages] = useState<Block[][]>([]);
  const blocks = useMemo(() => blocksFor(resume), [resume]);
  const pageWidth = resume.design.pageSize === "LETTER" ? 612 : 595;
  const pageHeight = resume.design.pageSize === "LETTER" ? 792 : 842;
  const { personalDetails: person, design } = resume;
  const modern = resume.template === "modern";
  const style = { "--rs-accent": design.accent, "--rs-document-font": design.font === "serif" ? "Georgia, 'Times New Roman', serif" : "Arial, sans-serif", "--rs-document-size": `${resume.template === "compact" ? Math.max(9, design.fontSize - .5) : design.fontSize}px`, "--rs-document-line": design.lineHeight, "--rs-document-margin": `${design.margin}px`, textAlign: design.headerAlign } as CSSProperties;
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setScale(Math.min(1.25, entries[0].contentRect.width / pageWidth)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [pageWidth]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const elements = Array.from(measure.current?.children || []) as HTMLElement[];
      let remaining = pageHeight - design.margin * 2 - (modern ? 0 : (head.current?.offsetHeight || 110) + 25);
      const next: Block[][] = [[]];
      for (let index = 0; index < blocks.length; index++) {
        const measuredHeight = (element?: HTMLElement) => {
          if (!element) return 20;
          const computed = getComputedStyle(element);
          return element.getBoundingClientRect().height + parseFloat(computed.marginTop || "0") + parseFloat(computed.marginBottom || "0");
        };
        const height = measuredHeight(elements[index]);
        const following = blocks[index].kind === "heading" ? measuredHeight(elements[index + 1]) : 0;
        if (height + following > remaining && next[next.length - 1].length) { next.push([]); remaining = pageHeight - design.margin * 2; }
        next[next.length - 1].push(blocks[index]); remaining -= height;
      }
      setPages(next);
    });
    return () => cancelAnimationFrame(frame);
  }, [blocks, pageHeight, design.margin, design.font, design.fontSize, design.lineHeight, design.sectionStyle, modern]);
  const contacts = [person.email, person.phone, person.location, person.linkedin, person.website].filter(Boolean);
  const header = <header className="rs-doc-header" ref={head}><h1>{person.fullName || "Your name"}</h1>{person.professionalTitle && <p>{person.professionalTitle}</p>}<div>{contacts.map((text, index) => <span key={index}>{text}</span>)}</div></header>;
  const renderBlock = (block: Block, index: number) => <div className={`rs-doc-${block.kind}`} key={index}>{block.kind === "bullet" && <span>• </span>}{block.text}</div>;
  const displayedPages = thumbnail ? [blocks] : pages.length ? pages : [blocks];
  return <div ref={host} className={`rs-doc-fit ${thumbnail ? "rs-doc-thumbnail" : ""}`} aria-label={thumbnail ? "Sample template preview" : "Live resume preview"}>
    <div className={`rs-document rs-template-${resume.template} rs-heading-${design.sectionStyle}`} style={{ ...style, position: "absolute", left: -10000, width: pageWidth, visibility: "hidden" }} aria-hidden="true"><div className="rs-doc-body" ref={measure}>{blocks.map(renderBlock)}</div></div>
    {displayedPages.map((page, pageIndex) => <div className="rs-page-frame" key={pageIndex} style={{ height: pageHeight * scale, marginBottom: thumbnail ? 0 : 20 }}><article className={`rs-document rs-template-${resume.template} rs-heading-${design.sectionStyle}`} style={{ ...style, width: pageWidth, minHeight: pageHeight, transform: `scale(${scale})`, transformOrigin: "top left" }}>
      {modern && <aside className="rs-doc-sidebar">{pageIndex === 0 ? <><h1>{person.fullName || "Your name"}</h1>{person.professionalTitle && <p>{person.professionalTitle}</p>}<div className="rs-doc-sidebar-rule" /><div className="rs-doc-contacts">{contacts.map((text, index) => <span key={index}>{text}</span>)}</div></> : <span>{person.fullName}</span>}</aside>}
      <div className="rs-doc-main">{pageIndex === 0 && !modern && header}<div className="rs-doc-body">{page.map(renderBlock)}</div>{!blocks.length && <div className="rs-doc-placeholder"><span>Your story begins here.</span><i /><i /><i /><small>Add a section to see your resume take shape.</small></div>}</div>
    </article>{!thumbnail && <span className="rs-page-number">{pageIndex + 1} / {displayedPages.length}</span>}</div>)}
  </div>;
}
