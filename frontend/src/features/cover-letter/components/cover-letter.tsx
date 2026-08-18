import { AlertCircle, ArrowLeft, BriefcaseBusiness, Check, ChevronDown, Clipboard, Download, FileText, Link2, LoaderCircle, Mail, PenLine, Plus, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "https://api.placeble.in/api/v1";
type ResumeOption = { _id: string; title: string; versionNumber: number; sourceType: string; isCurrent: boolean; targetJdText: string; updatedAt: string };
type ApplicationOption = { _id: string; status: string; job: { _id: string; title: string; companyName: string; description: string; location: string } };
type Letter = { _id: string; applicationId?: string | null; resumeId: string; targetJdText: string; companyName: string; hiringManagerName: string; bodyText: string; status: "draft" | "final"; createdAt: string; updatedAt: string };
type Context = { resumes: ResumeOption[]; applications: ApplicationOption[]; letters: Letter[] };
type QueueJob = { id: string; status: "queued" | "processing" | "complete" | "failed"; message: string; error?: string; result?: { letter?: Letter; provider?: string } };

async function api<T>(path: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, ...init.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message ?? "The request could not be completed.");
  return payload as T;
}

export function CoverLetter({ accessToken, onBack, onOpenResume }: { accessToken: string; onBack: () => void; onOpenResume: () => void }) {
  const [context, setContext] = useState<Context | null>(null);
  const [resumeId, setResumeId] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [hiringManagerName, setHiringManagerName] = useState("");
  const [targetJdText, setTargetJdText] = useState("");
  const [activeLetter, setActiveLetter] = useState<Letter | null>(null);
  const [bodyText, setBodyText] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const lastSavedBody = useRef("");

  const loadContext = useCallback(async () => {
    const next = await api<Context>("/cover-letters/context", accessToken);
    setContext(next);
    setResumeId(current => current || next.resumes.find(item => item.isCurrent)?._id || next.resumes[0]?._id || "");
  }, [accessToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadContext().catch(cause => setError(cause instanceof Error ? cause.message : "Cover letters could not be loaded.")).finally(() => setLoading(false)), 0);
    return () => window.clearTimeout(timer);
  }, [loadContext]);

  useEffect(() => {
    if (!activeLetter || bodyText === lastSavedBody.current) return;
    setSaveState("unsaved");
    const timer = window.setTimeout(() => {
      setSaveState("saving");
      void api<{ letter: Letter }>(`/cover-letters/${activeLetter._id}`, accessToken, { method: "PATCH", body: JSON.stringify({ bodyText }) })
        .then(({ letter }) => { lastSavedBody.current = letter.bodyText; setActiveLetter(letter); setSaveState("saved"); setContext(current => current ? { ...current, letters: current.letters.map(item => item._id === letter._id ? letter : item) } : current); })
        .catch(cause => { setSaveState("unsaved"); setError(cause instanceof Error ? cause.message : "This edit could not be saved."); });
    }, 850);
    return () => window.clearTimeout(timer);
  }, [accessToken, activeLetter, bodyText]);

  const applications = context?.applications.filter(item => item.job) ?? [];
  const selectedApplication = applications.find(item => item._id === applicationId);
  const attachedApplication = applications.find(item => item._id === activeLetter?.applicationId);
  const wordCount = useMemo(() => bodyText.trim() ? bodyText.trim().split(/\s+/).length : 0, [bodyText]);

  const selectApplication = (id: string) => {
    setApplicationId(id);
    const application = applications.find(item => item._id === id);
    if (application) { setCompanyName(application.job.companyName); setTargetJdText(application.job.description); }
  };

  const openLetter = (letter: Letter) => {
    setActiveLetter(letter); setBodyText(letter.bodyText); lastSavedBody.current = letter.bodyText;
    setResumeId(letter.resumeId); setApplicationId(letter.applicationId ?? ""); setCompanyName(letter.companyName ?? ""); setHiringManagerName(letter.hiringManagerName ?? ""); setTargetJdText(letter.targetJdText ?? ""); setError("");
  };

  const pollJob = async (id: string) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await new Promise(resolve => window.setTimeout(resolve, 500));
      const { job } = await api<{ job: QueueJob }>(`/cover-letters/jobs/${id}`, accessToken);
      if (job.status === "failed") throw new Error(job.error ?? "The draft could not be written.");
      if (job.status === "complete") return job;
    }
    throw new Error("The draft is taking longer than expected. Please retry.");
  };

  const generate = async () => {
    if (!resumeId) return;
    setGenerating(true); setError(""); setNotice("");
    try {
      const { job } = await api<{ job: QueueJob }>("/cover-letters/generate", accessToken, { method: "POST", body: JSON.stringify({ resumeId, applicationId: applicationId || null, companyName, hiringManagerName, targetJdText }) });
      const complete = await pollJob(job.id);
      if (!complete.result?.letter) throw new Error("The draft finished without a cover letter.");
      openLetter(complete.result.letter);
      await loadContext();
      const providerLabels: Record<string, string> = { sarvam: "Sarvam", gemini: "Gemini", openai: "OpenAI" };
      setNotice(`Draft ready${complete.result.provider ? ` · written with ${providerLabels[complete.result.provider] ?? complete.result.provider}` : ""}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The draft could not be written."); }
    finally { setGenerating(false); }
  };

  const copyLetter = async () => {
    try { await navigator.clipboard.writeText(bodyText); setNotice("Cover letter copied to your clipboard."); }
    catch { setError("Clipboard access was blocked. Select the text and copy it manually."); }
  };

  const download = async (format: "txt" | "pdf") => {
    if (!activeLetter) return;
    setDownloadOpen(false); setError("");
    try {
      const response = await fetch(`${API_URL}/cover-letters/${activeLetter._id}/download/${format}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) throw new Error("The download could not be prepared.");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${activeLetter.companyName || "target-role"}-cover-letter.${format}`; anchor.click(); URL.revokeObjectURL(url);
      setNotice(`${format.toUpperCase()} download is ready.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The download failed."); }
  };

  const attach = async () => {
    if (!activeLetter || !applicationId) return;
    try {
      const { letter } = await api<{ letter: Letter }>(`/cover-letters/${activeLetter._id}/attach`, accessToken, { method: "POST", body: JSON.stringify({ applicationId }) });
      setActiveLetter(letter); setContext(current => current ? { ...current, letters: current.letters.map(item => item._id === letter._id ? letter : item) } : current);
      setNotice(`Attached to ${selectedApplication?.job.title ?? "the selected application"}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The letter could not be attached."); }
  };

  const markFinal = async () => {
    if (!activeLetter) return;
    try {
      const status = activeLetter.status === "final" ? "draft" : "final";
      const { letter } = await api<{ letter: Letter }>(`/cover-letters/${activeLetter._id}`, accessToken, { method: "PATCH", body: JSON.stringify({ status }) });
      setActiveLetter(letter); setContext(current => current ? { ...current, letters: current.letters.map(item => item._id === letter._id ? letter : item) } : current); setNotice(status === "final" ? "Marked final and ready to send." : "Moved back to draft.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The letter status could not be updated."); }
  };

  const newDraft = () => { setActiveLetter(null); setBodyText(""); setApplicationId(""); setCompanyName(""); setHiringManagerName(""); setTargetJdText(""); setError(""); };

  if (loading) return <div className="view-content inner-view cl-loading"><LoaderCircle size={27} /><h2>Opening Cover Letter</h2><p>Loading your resumes, applications, and drafts.</p></div>;
  if (!context?.resumes.length) return <div className="view-content inner-view cover-letter-view"><button className="cl-back" onClick={onBack}><ArrowLeft size={17} /> All agents</button><section className="cl-no-resume"><span><FileText size={28} /></span><p className="eyebrow">Cover Letter</p><h1>Start with a resume you trust.</h1><p>Cover letters stay factual by using one of your saved resumes. Build or import a resume first, then come back here for a tailored draft.</p><button className="button button-primary" onClick={onOpenResume}><Sparkles size={17} /> Open Resume Maker</button></section></div>;

  return <div className="view-content inner-view cover-letter-view">
    <header className="cl-top"><div><button className="cl-back" onClick={onBack}><ArrowLeft size={17} /> All agents</button><p className="eyebrow">Cover Letter</p><h1>A tailored draft, without the blank page.</h1><p>Choose the evidence and role. Placeble writes four focused paragraphs you can edit immediately.</p></div><button className="cl-new" onClick={newDraft}><Plus size={16} /> New letter</button></header>
    {error && <div className="cl-message error"><AlertCircle size={17} /><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div>}
    {notice && <div className="cl-message"><Check size={17} /><span>{notice}</span><button onClick={() => setNotice("")}><X size={15} /></button></div>}
    <div className="cl-workspace">
      <aside className="cl-setup">
        <div className="cl-setup-heading"><span><Sparkles size={18} /></span><div><p>Draft setup</p><small>Only verified resume facts are used</small></div></div>
        <label><span>Resume <b>Required</b></span><select value={resumeId} onChange={event => setResumeId(event.target.value)}>{context.resumes.map(resume => <option key={resume._id} value={resume._id}>{resume.title}{resume.isCurrent ? " · Current" : ` · v${resume.versionNumber}`}</option>)}</select></label>
        <label><span>Application <em>Optional</em></span><select value={applicationId} onChange={event => selectApplication(event.target.value)}><option value="">Not linked to an application</option>{applications.map(application => <option key={application._id} value={application._id}>{application.job.title} · {application.job.companyName}</option>)}</select></label>
        <div className="cl-field-row"><label><span>Company <em>Optional</em></span><input value={companyName} onChange={event => setCompanyName(event.target.value)} placeholder="e.g. Razorpay" /></label><label><span>Hiring manager <em>Optional</em></span><input value={hiringManagerName} onChange={event => setHiringManagerName(event.target.value)} placeholder="e.g. Priya Shah" /></label></div>
        <label><span>Target job description <em>Optional</em></span><textarea value={targetJdText} onChange={event => setTargetJdText(event.target.value)} placeholder="Paste the job description for a more specific letter…" /></label>
        <button className="button button-primary cl-generate" disabled={generating || !resumeId} onClick={() => void generate()}>{generating ? <LoaderCircle size={17} /> : <Sparkles size={17} />}{generating ? "Writing your draft…" : activeLetter ? "Generate another draft" : "Generate cover letter"}</button>
        <p className="cl-trust"><Check size={14} /> No achievements, employers, or experience will be invented.</p>
        <div className="cl-recent"><header><span>Recent letters</span><small>{context.letters.length}</small></header>{context.letters.length ? context.letters.map(letter => <button className={activeLetter?._id === letter._id ? "active" : ""} key={letter._id} onClick={() => openLetter(letter)}><span><Mail size={15} /></span><div><strong>{letter.companyName || "Untitled role"}</strong><small>{letter.status === "final" ? "Final" : "Draft"} · {new Date(letter.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</small></div></button>) : <p>No cover letters yet. Your first draft will appear here.</p>}</div>
      </aside>
      <main className="cl-editor-shell">
        {activeLetter ? <>
          <header className="cl-editor-top"><div><span className={`cl-status ${activeLetter.status}`}>{activeLetter.status}</span><span className={`cl-save-state ${saveState}`}><i />{saveState === "saved" ? "All changes saved" : saveState === "saving" ? "Saving…" : "Unsaved changes"}</span>{attachedApplication && <span className="cl-attached"><Link2 size={13} /> {attachedApplication.job.companyName}</span>}</div><div><button onClick={() => void copyLetter()}><Clipboard size={15} /> Copy</button><div className="cl-download"><button onClick={() => setDownloadOpen(current => !current)}><Download size={15} /> Download <ChevronDown size={13} /></button>{downloadOpen && <div><button onClick={() => void download("pdf")}><FileText size={14} /> PDF document</button><button onClick={() => void download("txt")}><PenLine size={14} /> Plain text</button></div>}</div><button className="cl-final" onClick={() => void markFinal()}>{activeLetter.status === "final" ? <PenLine size={15} /> : <Check size={15} />}{activeLetter.status === "final" ? "Reopen draft" : "Mark final"}</button></div></header>
          <section className="cl-paper"><header><div><strong>{companyName || activeLetter.companyName || "Target company"}</strong><span>{hiringManagerName || activeLetter.hiringManagerName ? `For ${hiringManagerName || activeLetter.hiringManagerName}` : "Cover letter"}</span></div><small>{wordCount} words · four-paragraph format</small></header><textarea aria-label="Cover letter body" value={bodyText} onChange={event => setBodyText(event.target.value)} spellCheck /></section>
          <footer className="cl-editor-footer"><div><BriefcaseBusiness size={16} /><span>{attachedApplication ? <><strong>Attached to {attachedApplication.job.title}</strong><small>{attachedApplication.job.companyName} · {attachedApplication.status}</small></> : <><strong>Not attached yet</strong><small>Select an application in Draft setup, then attach this letter.</small></>}</span></div><button disabled={!applicationId || activeLetter.applicationId === applicationId} onClick={() => void attach()}><Link2 size={15} />{activeLetter.applicationId === applicationId && applicationId ? "Attached" : "Attach to application"}</button></footer>
        </> : <section className="cl-empty"><span><Mail size={28} /></span><p className="eyebrow">Ready when you are</p><h2>One draft. Four clear paragraphs.</h2><p>Select a resume and optionally a target application. Your editable letter will appear here in a few seconds.</p><div><span><b>1</b> Specific opening</span><span><b>2</b> Relevant evidence</span><span><b>3</b> Second point of fit</span><span><b>4</b> Confident close</span></div></section>}
      </main>
    </div>
    {generating && <div className="cl-generating" role="status"><section><span><LoaderCircle size={24} /></span><h2>Writing your draft…</h2><p>Using your selected resume and target role. This usually takes a few seconds.</p></section></div>}
  </div>;
}
