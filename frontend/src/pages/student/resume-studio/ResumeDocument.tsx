import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { labels, type Resume } from "./types";
import { formatResumeDate, resumeContacts } from "./formatting";

type Block = { kind: "heading" | "entry" | "meta" | "body" | "bullet"; text: string; date?: string };
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
      const date = resume.design.showDates ? formatResumeDate(entry.date || entry.graduationYear, resume.design) : "";
      const meta = [entry.subtitle === "Imported from your resume" ? "" : entry.subtitle || entry.institution, entry.location, resume.design.datePosition === "inline" ? date : ""].filter(Boolean).join(" · ");
      if (meta || date) content.push({ kind: "meta", text: meta, date: resume.design.datePosition === "right" ? date : undefined });
      if (entry.detail) content.push({ kind: "body", text: entry.detail });
      for (const text of entry.bullets || []) if (text.trim()) content.push({ kind: "bullet", text });
    }
    if (content.length) blocks.push({ kind: "heading", text: section.content.heading || labels[section.type] }, ...content);
  }
  return blocks;
}
export function ResumeDocument({ resume, thumbnail = false, onPageCount }: { resume: Resume; thumbnail?: boolean; onPageCount?:(count:number)=>void }) {
  const host = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(.7);
  const [pages, setPages] = useState<Block[][]>([]);
  const blocks = useMemo(() => blocksFor(resume), [resume]);
  const pageWidth = resume.design.pageSize === "LETTER" ? 612 : 595;
  const pageHeight = resume.design.pageSize === "LETTER" ? 792 : 842;
  const { personalDetails: person, design } = resume;
  const modern = design.layout === "auto" ? resume.template === "modern" : design.layout.startsWith("sidebar");
  const right = modern && design.layout === "sidebar-right";
  const style = { "--rs-sidebar-width": `${design.sidebarWidth}px`, "--rs-text": design.textColor, "--rs-heading-color": design.headingColor, "--rs-name-size": `${design.nameSize}px`, "--rs-heading-size": `${design.headingSize}px`, "--rs-section-gap": `${design.sectionSpacing}px`, "--rs-entry-gap": `${design.entrySpacing}px`, "--rs-header-gap": `${design.headerSpacing}px`, "--rs-entry-weight": design.boldEntries ? 700 : 400, "--rs-heading-case": design.headingCase === "uppercase" ? "uppercase" : "none", "--rs-accent": design.accent, "--rs-document-font": design.font === "serif" ? "'Times New Roman', serif" : design.font === "mono" ? "Courier New, monospace" : "Arial, sans-serif", "--rs-document-size": `${design.fontSize}px`, "--rs-document-line": design.lineHeight, "--rs-document-margin": `${design.margin}px`, textAlign: design.headerAlign } as CSSProperties;
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
      let remaining = pageHeight - design.margin * 2 - (modern ? 0 : (head.current?.offsetHeight || 70) + design.headerSpacing);
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
      setPages(next); onPageCount?.(next.length);
    });
    return () => cancelAnimationFrame(frame);
  }, [blocks, pageHeight, design, modern, onPageCount]);
  const contacts = resumeContacts(person, design);
  const portrait = person.photo && design.showPhoto ? <img className="rs-doc-photo" src={person.photo} alt="" style={{width:design.photoSize,height:design.photoSize,borderRadius:design.photoShape==="round"?"50%":0}}/> : null;
  const contact = (text:string,index:number) => <span key={index} style={{textDecoration:design.linkStyle==="underline" && [person.linkedin,person.website].includes(text)?"underline":undefined}}>{text}</span>;
  const classes = `rs-document rs-heading-${design.sectionStyle} ${modern ? "rs-layout-sidebar" : "rs-layout-single"} ${right ? "rs-layout-right" : ""}`;
  const header = <header className="rs-doc-header" ref={head}>{portrait}<h1>{person.fullName || "Your name"}</h1>{person.professionalTitle && <p>{person.professionalTitle}</p>}<div className={`rs-contact-${design.contactSeparator}`}>{contacts.map(contact)}</div></header>;
  const renderBlock = (block: Block, index: number) => <div className={`rs-doc-${block.kind}`} key={index}>{block.kind === "bullet" && <span>{design.bulletStyle === "dash" ? "– " : "• "}</span>}{block.text}{block.date&&<span className="rs-doc-date">{block.date}</span>}</div>;
  const displayedPages = thumbnail ? [blocks] : pages.length ? pages : [blocks];
  return <div ref={host} className={`rs-doc-fit ${thumbnail ? "rs-doc-thumbnail" : ""}`} aria-label={thumbnail ? "Sample template preview" : "Live resume preview"}>
    <div className={classes} style={{ ...style, position: "absolute", left: -10000, width: pageWidth, visibility: "hidden" }} aria-hidden="true"><div className="rs-doc-body" ref={measure}>{blocks.map(renderBlock)}</div></div>
    {displayedPages.map((page, pageIndex) => <div className="rs-page-frame" key={pageIndex} style={{ height: pageHeight * scale, marginBottom: thumbnail ? 0 : 20 }}><article className={classes} style={{ ...style, width: pageWidth, minHeight: pageHeight, transform: `scale(${scale})`, transformOrigin: "top left" }}>
      {modern && <aside className="rs-doc-sidebar">{pageIndex === 0 ? <><h1>{person.fullName || "Your name"}</h1>{person.professionalTitle && <p>{person.professionalTitle}</p>}<div className="rs-doc-sidebar-rule" /><div className="rs-doc-contacts">{contacts.map(contact)}</div></> : <span>{person.fullName}</span>}</aside>}
      <div className="rs-doc-main">{pageIndex === 0 && !modern && header}<div className="rs-doc-body">{page.map(renderBlock)}</div>{!blocks.length && <div className="rs-doc-placeholder"><span>Your story begins here.</span><i /><i /><i /><small>Add a section to see your resume take shape.</small></div>}</div>
    {(design.footerText||design.pageNumbers)&&<footer className="rs-doc-footer">{[design.footerText,design.pageNumbers?String(pageIndex+1):""].filter(Boolean).join(" · ")}</footer>}</article>{!thumbnail && <span className="rs-page-number">{pageIndex + 1} / {displayedPages.length}</span>}</div>)}
  </div>;
}
