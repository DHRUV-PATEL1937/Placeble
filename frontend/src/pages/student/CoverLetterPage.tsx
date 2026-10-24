import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCheck, ChevronDown, Clipboard, Download, FileCheck2, FileText, LoaderCircle, Mail, Plus, ShieldCheck, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./cover-letter-studio.css";

const API_URL = import.meta.env.VITE_API_URL ?? "/api/v1";
const tones = ["Professional", "Confident", "Enthusiastic", "Concise", "Formal", "Creative"] as const;
type Tone = typeof tones[number];
type Resume = { _id: string; title: string; isCurrent: boolean; versionNumber: number; updatedAt: string };
type Letter = { _id: string; resumeId: string; roleTitle?: string; companyName: string; hiringManagerName: string; targetJdText: string; tone?: Tone; bodyText: string; status: "draft" | "final"; updatedAt: string };
type Context = { resumes: Resume[]; letters: Letter[] };
type Job = { id: string; status: string; error?: string; result?: { letter: Letter } };
async function api<T>(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "Something went wrong. Please try again.");
  return payload as T;
}

export function CoverLetter({ accessToken, onBack, onOpenResume }: { accessToken: string; onBack: () => void; onOpenResume: () => void }) {
  const [context, setContext] = useState<Context | null>(null);
  const [loading, setLoading] = useState(true);
  const [resumeId, setResumeId] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [hiringManagerName, setHiringManagerName] = useState("");
  const [targetJdText, setTargetJdText] = useState("");
  const [tone, setTone] = useState<Tone>("Professional");
  const [active, setActive] = useState<Letter | null>(null);
  const [body, setBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"guide" | "review">("guide");
  const [emailOpen, setEmailOpen] = useState(false);
  const [font, setFont] = useState("modern");
  const [zoom, setZoom] = useState(100);
  const [advanced, setAdvanced] = useState(false);
  const saved = useRef("");
  const editor = useRef<HTMLTextAreaElement>(null);
  const activeId = useRef<string | null>(null);
  const revision = useRef(0);
  const payload = useMemo(() => JSON.stringify({ bodyText: body, roleTitle, companyName, hiringManagerName, targetJdText, tone }), [body, roleTitle, companyName, hiringManagerName, targetJdText, tone]);
  const [savedPayload, setSavedPayload] = useState("");
  const dirty = !!active && payload !== savedPayload;
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const paragraphs = body.trim() ? body.trim().split(/\n\s*\n/).length : 0;
  const selectedResume = context?.resumes.find(item => item._id === resumeId);

  const load = useCallback(async () => {
    const next = await api<Context>("/cover-letters/context", accessToken);
    setContext(next);
    setResumeId(previous => previous || next.resumes.find(item => item.isCurrent)?._id || next.resumes[0]?._id || "");
  }, [accessToken]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch(cause => setError(String(cause.message))).finally(() => setLoading(false)), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const open = (letter: Letter) => {
    revision.current += 1;
    activeId.current = letter._id;
    setActive(letter); setResumeId(letter.resumeId); setBody(letter.bodyText); setRoleTitle(letter.roleTitle || ""); setCompanyName(letter.companyName); setHiringManagerName(letter.hiringManagerName); setTargetJdText(letter.targetJdText); setTone(letter.tone || "Professional");
    const value = JSON.stringify({ bodyText: letter.bodyText, roleTitle: letter.roleTitle || "", companyName: letter.companyName, hiringManagerName: letter.hiringManagerName, targetJdText: letter.targetJdText, tone: letter.tone || "Professional" });
    saved.current = value; setSavedPayload(value); setError("");
  };
  const save = useCallback(async () => {
    if (!activeId.current || payload === saved.current) return;
    if (body.trim().length < 40) throw new Error("Please keep at least 40 characters in your letter before saving.");
    const id = activeId.current;
    const version = ++revision.current;
    setSaving(true);
    try {
      const { letter } = await api<{ letter: Letter }>(`/cover-letters/${id}`, accessToken, { method: "PATCH", body: payload });
      if (activeId.current === id && revision.current === version) {
        saved.current = payload; setSavedPayload(payload); setActive(letter);
        setContext(previous => previous ? { ...previous, letters: previous.letters.map(item => item._id === id ? letter : item) } : previous);
      }
    } finally { setSaving(false); }
  }, [accessToken, body, payload]);
  useEffect(() => {
    if (!dirty || body.trim().length < 40) return;
    const timer = window.setTimeout(() => void save().catch(cause => setError(cause.message)), 1000);
    return () => window.clearTimeout(timer);
  }, [dirty, body, save]);
  useEffect(() => {
    const beforeLeave = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", beforeLeave);
    return () => window.removeEventListener("beforeunload", beforeLeave);
  }, [dirty]);
  useEffect(() => {
    if (!emailOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const controls = () => Array.from(document.querySelectorAll<HTMLElement>(".ls-modal section button, .ls-modal section textarea"));
    controls()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEmailOpen(false);
      if (event.key !== "Tab") return;
      const items = controls();
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); previous?.focus(); };
  }, [emailOpen]);
  useEffect(() => {
    if (!editor.current) return;
    editor.current.style.height = "auto";
    editor.current.style.height = `${Math.max(420, editor.current.scrollHeight)}px`;
  }, [body, zoom, font]);
  const safely = async (action: () => void | Promise<void>) => { setError(""); try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Please try again."); } };
  const switchLetter = (letter: Letter) => void safely(async () => { await save(); open(letter); });
  const newLetter = () => void safely(async () => {
    await save(); revision.current += 1; activeId.current = null; setActive(null); setBody(""); setRoleTitle(""); setCompanyName(""); setHiringManagerName(""); setTargetJdText(""); setTone("Professional"); saved.current = ""; setSavedPayload(""); setNotice("");
  });
  const generate = () => void safely(async () => {
    if (!resumeId) return;
    await save(); setGenerating(true);
    try {
      const { job } = await api<{ job: Job }>("/cover-letters/generate", accessToken, { method: "POST", body: JSON.stringify({ resumeId, roleTitle, companyName, hiringManagerName, targetJdText, tone }) });
      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise(resolve => window.setTimeout(resolve, 600));
        const next = await api<{ job: Job }>(`/cover-letters/jobs/${job.id}`, accessToken);
        if (next.job.status === "failed") throw new Error(next.job.error || "Your letter could not be generated.");
        if (next.job.status === "complete" && next.job.result?.letter) { open(next.job.result.letter); await load(); setNotice("Your new draft is ready. Make it yours."); return; }
      }
      throw new Error("This is taking longer than usual. Please try again shortly.");
    } finally { setGenerating(false); }
  });
  const download = (format: "pdf" | "txt") => void safely(async () => {
    if (!active) return;
    await save();
    const response = await fetch(`${API_URL}/cover-letters/${active._id}/download/${format}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error("The export could not be prepared. Please try again.");
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${companyName || "application"}-cover-letter.${format}`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const copy = (email = false) => void safely(async () => { await navigator.clipboard.writeText(email ? `Subject: Application for ${roleTitle || "the role"}${companyName ? ` at ${companyName}` : ""}\n\n${body}` : body); setNotice("Copied to clipboard."); });
  const finalize = () => void safely(async () => {
    if (!active) return;
    await save();
    const { letter } = await api<{ letter: Letter }>(`/cover-letters/${active._id}`, accessToken, { method: "PATCH", body: JSON.stringify({ status: active.status === "final" ? "draft" : "final" }) });
    setActive(letter); await load(); setNotice(letter.status === "final" ? "Marked final. Your letter is ready to send." : "Moved back to draft.");
  });
  const checks = [
    { title: "A focused length", detail: `${words} words · aim for 260–420`, ok: words >= 260 && words <= 420 },
    { title: "Four clear paragraphs", detail: `${paragraphs} paragraph${paragraphs === 1 ? "" : "s"} in your draft`, ok: paragraphs === 4 },
    { title: "A specific destination", detail: companyName && roleTitle ? `${roleTitle} at ${companyName}` : "Add your target role and company", ok: !!companyName && !!roleTitle },
    { title: "Context for a stronger fit", detail: targetJdText ? "Job description included" : "Add a job description to guide your draft", ok: !!targetJdText.trim() },
  ];

  if (loading) return <div className="letter-studio ls-loading" role="status"><LoaderCircle size={25} /><h2>Opening your studio</h2><p>Gathering your resumes and saved letters.</p></div>;
  return <div className="view-content inner-view letter-studio">
    <header className="ls-header"><button className="ls-icon" aria-label="Back to practice tools" onClick={() => void safely(async () => { await save(); onBack(); })}><ArrowLeft size={19} /></button><div className="ls-heading"><span className="ls-eyebrow">PLACEBLE / WRITING TOOLS</span><h1>Cover Letter Studio<span className="ls-beta">AI ASSISTED</span></h1><p>Your experience. A stronger first impression.</p></div><div className="ls-header-actions"><span className="ls-save" aria-live="polite">{saving ? <LoaderCircle size={14} /> : <CheckCheck size={15} />}{!active ? "Ready to create" : saving ? "Saving…" : dirty ? "Changes pending" : "All changes saved"}</span><button className="ls-button" onClick={() => setEmailOpen(true)} disabled={!active}><Mail size={15} /> Email</button><button className="ls-button ls-primary" onClick={() => download("pdf")} disabled={!active || saving || generating}><Download size={15} /> Export PDF</button></div></header>
    {error && <div className="ls-message ls-error" role="alert"><AlertCircle size={17} /><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button></div>}
    {notice && <div className="ls-message" role="status"><Check size={17} /><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice("")}><X size={16} /></button></div>}
    {!context ? <div className="ls-unavailable"><h2>We couldn’t load your workspace.</h2><button className="ls-button" onClick={() => void safely(load)}>Try again</button></div> : !context.resumes.length ? <div className="ls-unavailable"><FileText size={36} /><h2>A great letter starts with your story.</h2><p>Create or import your resume to get started.</p><button className="ls-button ls-primary" onClick={onOpenResume}>Open resume builder <ArrowRight size={16} /></button></div> : <div className="ls-workspace">
      <aside className="ls-setup"><div className="ls-panel-title"><span>01</span><h2>Make it personal</h2><button className="ls-icon" onClick={newLetter} aria-label="Create a new letter"><Plus size={17} /></button></div><p className="ls-panel-subtitle">A few details. A letter that sounds like you.</p>
        <label className="ls-label">Your resume<div className="ls-resume"><FileText size={22} /><select value={resumeId} onChange={event => setResumeId(event.target.value)}>{context.resumes.map(item => <option key={item._id} value={item._id}>{item.title}{item.isCurrent ? " · Current" : ` · v${item.versionNumber}`}</option>)}</select><ChevronDown size={14} /></div></label><p className="ls-source"><ShieldCheck size={12} /> Grounded in your saved experience</p>
        <label className="ls-label">Target role<input value={roleTitle} onChange={event => setRoleTitle(event.target.value)} placeholder="e.g. Product Designer" maxLength={180} /></label>
        <label className="ls-label">Company<input value={companyName} onChange={event => setCompanyName(event.target.value)} placeholder="Where would you love to work?" maxLength={180} /></label>
        <label className="ls-label"><span>Job description <small>Optional, recommended</small></span><textarea value={targetJdText} onChange={event => setTargetJdText(event.target.value)} placeholder="Paste the role description. We’ll help connect your experience to what matters." maxLength={30000} /><small className="ls-character-count">{targetJdText.length.toLocaleString()} / 30,000</small></label>
        <fieldset className="ls-tones"><legend>Find your voice</legend><p>Choose how you’d like to come across.</p><div>{tones.map(item => <button key={item} aria-pressed={tone === item} className={tone === item ? "selected" : ""} onClick={() => setTone(item)}>{tone === item && <Check size={12} />}{item}</button>)}</div></fieldset>
        <button className="ls-advanced" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}><ChevronDown size={14} className={advanced ? "rotated" : ""} /> Recipient details</button>{advanced && <label className="ls-label">Hiring manager<input value={hiringManagerName} onChange={event => setHiringManagerName(event.target.value)} placeholder="Name, if known" maxLength={180} /></label>}
        <button className="ls-button ls-primary ls-generate" onClick={generate} disabled={generating || saving || !resumeId}>{generating ? <LoaderCircle size={17} /> : <Sparkles size={17} />}{generating ? "Writing your letter…" : active ? "Generate a fresh draft" : "Generate my letter"}<ArrowRight size={16} /></button><p className="ls-generation-note">{active ? "Creates a new letter. Your current draft stays saved." : "Built from your resume. Refined by you."}</p>
        <details className="ls-history"><summary>Saved letters <span>{context.letters.length}</span></summary>{context.letters.length ? context.letters.map(letter => <button key={letter._id} className={active?._id === letter._id ? "selected" : ""} onClick={() => switchLetter(letter)}><FileText size={16} /><span><strong>{letter.companyName || letter.roleTitle || "General application"}</strong><small>{letter.status === "final" ? "Final" : "Draft"} · {new Date(letter.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</small></span></button>) : <p>Your first letter will appear here.</p>}</details>
      </aside>
      <main className="ls-canvas"><div className="ls-toolbar"><div><span className={`ls-status ${active?.status || ""}`}><i />{active?.status === "final" ? "Final letter" : "Working draft"}</span><span className="ls-toolbar-rule" /><select aria-label="Preview typography" value={font} onChange={event => setFont(event.target.value)}><option value="modern">Modern</option><option value="classic">Classic</option></select></div><button className="ls-icon" onClick={() => copy()} disabled={!active} aria-label="Copy letter"><Clipboard size={16} /></button></div>
        <div className="ls-page-area"><article className={`ls-page ${font}`}>
          <div className="ls-letterhead"><div className="ls-paper-brand">P<span>PLACEBLE</span></div><span>LETTER OF INTRODUCTION</span></div>
          {active ? <><div className="ls-recipient"><span>{companyName || "Your next opportunity"}</span><h2>{roleTitle || "General application"}</h2><p>{hiringManagerName ? `For ${hiringManagerName}` : "For the hiring team"}</p></div><textarea ref={editor} aria-label="Edit your cover letter" value={body} onChange={event => setBody(event.target.value)} maxLength={12000} style={{ fontSize: `${14 * zoom / 100}px` }} spellCheck /><div className="ls-paper-end"><span />Your next chapter starts here.</div></> : <div className="ls-blank"><div className="ls-blank-icon"><PenIllustration /></div><span className="ls-eyebrow">A BLANK PAGE. A NEW POSSIBILITY.</span><h2>Let’s tell your story.</h2><p>Bring your experience to life with a letter<br />that feels considered, confident, and you.</p><div className="ls-skeleton"><i /><i /><i /><i /></div><span className="ls-blank-hint"><ArrowLeft size={14} /> Add your details to get started</span></div>}
        </article></div><footer className="ls-canvas-footer"><span>{words} words <b>·</b> {paragraphs} paragraphs</span><div><button aria-label="Decrease preview font size" disabled={zoom <= 80} onClick={() => setZoom(value => value - 10)}>−</button><span>{zoom}%</span><button aria-label="Increase preview font size" disabled={zoom >= 130} onClick={() => setZoom(value => value + 10)}>+</button></div><span className="ls-preview-note">Document preview</span></footer>
      </main>
      <aside className="ls-guide"><div className="ls-guide-tabs" role="tablist" aria-label="Writing guidance"><button role="tab" aria-selected={tab === "guide"} onClick={() => setTab("guide")}><Sparkles size={14} /> Writing guide</button><button role="tab" aria-selected={tab === "review"} onClick={() => setTab("review")}><FileCheck2 size={14} /> Review</button></div>
        {tab === "guide" ? <><div className="ls-guide-intro"><span><Sparkles size={20} /></span><h2>A little guidance.<br />A lasting impression.</h2><p>Good letters connect your story to the opportunity ahead.</p></div><ol className="ls-tips">{[["Start with intention", "Say why this role and this company matter to you."], ["Let your work speak", "Choose one or two relevant experiences. Be specific about your contribution."], ["Connect the dots", "Show how your experience relates to what the team needs."], ["Close with confidence", "Keep it warm, brief, and open to a conversation."]].map(([title, detail], index) => <li key={title}><span>0{index + 1}</span><div><h3>{title}</h3><p>{detail}</p></div></li>)}</ol></> : <div className="ls-review"><span className="ls-eyebrow">THE FINISHING TOUCHES</span><h2>Ready for a second look?</h2><p>A simple checklist based on your current draft.</p>{checks.map(check => <div className={`ls-check ${check.ok ? "complete" : ""}`} key={check.title}>{check.ok ? <Check size={15} /> : <span className="ls-check-circle" />}<div><strong>{check.title}</strong><small>{check.detail}</small></div></div>)}<button className="ls-button ls-primary" disabled={!active || dirty || saving} onClick={finalize}><FileCheck2 size={15} />{active?.status === "final" ? "Reopen draft" : "Mark as final"}</button><button className="ls-button" disabled={!active} onClick={() => download("txt")}><Download size={15} /> Download plain text</button></div>}
        <div className="ls-evidence"><ShieldCheck size={19} /><div><strong>Your experience is the source.</strong><p>{selectedResume ? `Using “${selectedResume.title}”. Always review your letter for accuracy before sending.` : "Choose a saved resume to get started."}</p></div></div>
      </aside>
    </div>}
    {emailOpen && active && <div className="ls-modal" role="dialog" aria-modal="true" aria-labelledby="ls-email-title"><button className="ls-scrim" aria-label="Close email dialog" onClick={() => setEmailOpen(false)} /><section><button className="ls-icon ls-close" aria-label="Close email dialog" onClick={() => setEmailOpen(false)}><X size={18} /></button><Mail size={24} /><h2 id="ls-email-title">Ready for their inbox.</h2><p>Copy your letter with a subject line, then add the recipient in your email app.</p><textarea readOnly aria-label="Email preview" value={`Subject: Application for ${roleTitle || "the role"}${companyName ? ` at ${companyName}` : ""}\n\n${body}`} /><button className="ls-button ls-primary" onClick={() => copy(true)}><Clipboard size={15} /> Copy email</button></section></div>}
    {generating && <div className="ls-generation-bar" role="status"><LoaderCircle size={18} /><span>Finding the words for your next chapter…</span></div>}
  </div>;
}

function PenIllustration() { return <svg width="58" height="58" viewBox="0 0 58 58" fill="none" aria-hidden="true"><rect x="9" y="5" width="35" height="46" rx="5" stroke="currentColor" strokeWidth="1.4" /><path d="M17 17h15M17 24h10M17 31h7M29 39l3-9L45 17a3 3 0 014 4L36 34l-7 5zM42 20l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
