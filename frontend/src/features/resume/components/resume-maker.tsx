"use client";

import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  Clock3,
  Download,
  FileText,
  GripVertical,
  History,
  LoaderCircle,
  MessageCircle,
  PenLine,
  Plus,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Target,
  Trash2,
  UploadCloud,
  Undo2,
  X,
} from "lucide-react";
import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { ReadinessScoreRing } from "@/src/components/ui/readiness-score-ring";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
type SectionType = "summary" | "experience" | "education" | "skills" | "projects" | "certifications";
type ResumeEntry = { title?: string; subtitle?: string; date?: string; institution?: string; degree?: string; graduationYear?: number | string; detail?: string; bullets?: string[] };
type ResumeSection = { _id?: string; type: SectionType; order: number; content: { text?: string; items?: string[]; entries?: ResumeEntry[] } };
type Resume = { _id: string; title: string; sections: ResumeSection[]; sourceType: "generated" | "uploaded" | "hybrid"; targetJdText: string; atsScore: number; atsBreakdown: { keywordOverlap: number; semanticSimilarity: number; missingKeywords: string[] }; template: "classic" | "modern" | "compact"; versionNumber: number; updatedAt: string };
type Version = Pick<Resume, "_id" | "title" | "sourceType" | "atsScore" | "template" | "versionNumber" | "updatedAt"> & { isCurrent: boolean };
type CopilotProposal = { sections: ResumeSection[]; changeSummary: string[] };
type CopilotResult = { reply: string; intent: "question" | "proposal" | "guidance"; suggestedPrompts: string[]; proposal: CopilotProposal | null; provider: "sarvam" | "gemini" | "openai"; model: string };
const providerLabels: Record<CopilotResult["provider"], string> = { sarvam: "Sarvam", gemini: "Gemini", openai: "OpenAI" };
type ChatMessage = { id: string; role: "user" | "assistant"; text: string };
type Job = { id: string; status: "queued" | "processing" | "complete" | "failed"; progress: number; message: string; result?: { resume?: Resume; score?: Resume["atsBreakdown"] & { atsScore: number }; fileUrl?: string; filename?: string; found?: { sections: number; characters: number } } & Partial<CopilotResult>; error?: string };

const sectionLabels: Record<SectionType, string> = { summary: "Professional summary", experience: "Experience", education: "Education", skills: "Skills", projects: "Projects", certifications: "Certifications" };
const templates = [{ id: "classic", label: "Classic", note: "Balanced" }, { id: "modern", label: "Modern", note: "Distinctive" }, { id: "compact", label: "Compact", note: "One-page" }] as const;
const initialChat: ChatMessage[] = [{ id: "welcome", role: "assistant", text: "Tell me what you want to improve, or answer naturally while I help uncover the details that make your resume stronger. I’ll preview every change before anything is applied." }];
const starterPrompts = ["Improve my professional summary", "Help me add a project", "Tailor this for my target role", "Make my bullets more concise"];

async function api<T>(path: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, { ...init, credentials: "include", headers: { ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }), Authorization: `Bearer ${accessToken}`, ...init.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message ?? "The request could not be completed.");
  return payload as T;
}

function operationCopy(operation: string | null) {
  if (operation === "generating") return ["Building your first draft", "Using your verified profile—without inventing experience."];
  if (operation === "parsing") return ["Reading your existing resume", "Finding sections and turning them into editable content."];
  if (operation === "scoring") return ["Updating your ATS match", "Comparing the latest wording with the target role."];
  if (operation === "pdf" || operation === "docx") return [`Rendering your ${operation.toUpperCase()} export`, "Using the current saved content and selected template."];
  return ["Preparing your workspace", "Loading your latest draft."];
}

function SectionPreview({ section }: { section: ResumeSection }) {
  if (section.type === "summary") return <p>{section.content.text}</p>;
  if (section.type === "skills") return <div className="rm-preview-skills">{section.content.items?.map(item => <span key={item}>{item}</span>)}</div>;
  return <div className="rm-preview-entries">{section.content.entries?.map((entry, index) => <div key={`${entry.title || entry.institution}-${index}`}><header><strong>{entry.title || entry.degree || "Untitled entry"}</strong><time>{entry.date || entry.graduationYear}</time></header><span>{entry.subtitle || entry.institution}</span>{entry.detail && <p>{entry.detail}</p>}{entry.bullets?.length ? <ul>{entry.bullets.filter(Boolean).map(bullet => <li key={bullet}>{bullet}</li>)}</ul> : null}</div>)}</div>;
}

function ResumePreview({ resume, user }: { resume: Resume; user: { name: string; email: string } }) {
  return <article className={`rm-paper template-${resume.template}`}><header><h1>{user.name}</h1><p>{resume.title}</p><span>{user.email} · Bengaluru, India</span></header>{[...resume.sections].sort((a, b) => a.order - b.order).map(section => <section key={section._id || section.type}><h2>{sectionLabels[section.type]}</h2><SectionPreview section={section} /></section>)}</article>;
}

export function ResumeMaker({ user, accessToken, onBack }: { user: { name: string; email: string }; accessToken: string; onBack: () => void }) {
  const [resume, setResume] = useState<Resume | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"edit" | "preview">("edit");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [uploadFound, setUploadFound] = useState<{ sections: number; characters: number } | null>(null);
  const [editRevision, setEditRevision] = useState(0);
  const [editorMode, setEditorMode] = useState<"editor" | "copilot">("editor");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(initialChat);
  const [chatInput, setChatInput] = useState("");
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotProposal, setCopilotProposal] = useState<CopilotProposal | null>(null);
  const [copilotPrompts, setCopilotPrompts] = useState(starterPrompts);
  const [copilotProvider, setCopilotProvider] = useState("Sarvam");
  const [undoResume, setUndoResume] = useState<Resume | null>(null);
  const loaded = useRef(false);
  const latestResume = useRef<Resume | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadVersions = useCallback(async () => {
    const payload = await api<{ versions: Version[] }>("/resume/versions", accessToken);
    setVersions(payload.versions);
  }, [accessToken]);

  useEffect(() => {
    void Promise.all([api<{ resume: Resume | null }>("/resume/current", accessToken), api<{ versions: Version[] }>("/resume/versions", accessToken)])
      .then(([current, history]) => { setResume(current.resume); setVersions(history.versions); loaded.current = true; })
      .catch(cause => setError(cause instanceof Error ? cause.message : "Could not load your resume."))
      .finally(() => setLoading(false));
  }, [accessToken]);

  useEffect(() => { latestResume.current = resume; }, [resume]);

  const pollJob = useCallback(async (jobId: string) => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      await new Promise(resolve => window.setTimeout(resolve, 350));
      const { job } = await api<{ job: Job }>(`/resume/jobs/${jobId}`, accessToken);
      if (job.status === "failed") throw new Error(job.error ?? "The resume task failed.");
      if (job.status === "complete") return job;
    }
    throw new Error("This is taking longer than expected. Please retry.");
  }, [accessToken]);

  useEffect(() => {
    if (!loaded.current || !resume || saveState !== "unsaved") return;
    const timer = window.setTimeout(() => {
      setSaveState("saving");
      void api<{ resume: Resume }>("/resume/current", accessToken, { method: "PATCH", body: JSON.stringify({ title: resume.title, sections: resume.sections, targetJdText: resume.targetJdText, template: resume.template }) })
        .then(payload => { setResume(payload.resume); setSaveState("saved"); })
        .catch(cause => { setSaveState("unsaved"); setError(cause instanceof Error ? cause.message : "Autosave failed."); });
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [resume, saveState, accessToken]);

  useEffect(() => {
    if (!loaded.current || editRevision === 0) return;
    const timer = window.setTimeout(() => {
      const draft = latestResume.current;
      if (!draft) return;
      setOperation("scoring");
      void api<{ job: Job }>("/resume/score", accessToken, { method: "POST", body: JSON.stringify({ sections: draft.sections, targetJdText: draft.targetJdText }) })
        .then(({ job }) => pollJob(job.id)).then(job => {
          const score = job.result?.score;
          if (score) setResume(current => current ? { ...current, atsScore: score.atsScore, atsBreakdown: score } : current);
        }).catch(() => undefined).finally(() => setOperation(current => current === "scoring" ? null : current));
    }, 2100);
    return () => window.clearTimeout(timer);
  }, [editRevision, accessToken, pollJob]);

  const updateResume = (updater: (current: Resume) => Resume) => {
    setResume(current => current ? updater(current) : current);
    setSaveState("unsaved");
    setEditRevision(current => current + 1);
    setError("");
  };

  const runGenerate = async () => {
    setOperation("generating"); setError("");
    try {
      const { job } = await api<{ job: Job }>("/resume/generate", accessToken, { method: "POST", body: JSON.stringify({ targetJdText: resume?.targetJdText ?? "" }) });
      const complete = await pollJob(job.id);
      if (complete.result?.resume) { setResume(complete.result.resume); loaded.current = true; setSaveState("saved"); setNotice(resume ? "A new enhanced version is ready for your review." : "Here’s a first draft based on your verified profile. Review every section before exporting."); await loadVersions(); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Generation failed."); }
    finally { setOperation(null); }
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setOperation("parsing"); setError(""); setUploadFound(null);
    try {
      const form = new FormData(); form.append("resume", file);
      const { job } = await api<{ job: Job }>("/resume/upload", accessToken, { method: "POST", body: form });
      const complete = await pollJob(job.id);
      if (complete.result?.resume) { setResume(complete.result.resume); setUploadFound(complete.result.found ?? null); loaded.current = true; setSaveState("saved"); await loadVersions(); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "We could not parse that file."); }
    finally { setOperation(null); event.target.value = ""; }
  };

  const saveVersion = async () => {
    if (!resume) return;
    setOperation("saving-version"); setError("");
    try {
      if (saveState !== "saved") await api<{ resume: Resume }>("/resume/current", accessToken, { method: "PATCH", body: JSON.stringify({ title: resume.title, sections: resume.sections, targetJdText: resume.targetJdText, template: resume.template }) });
      const payload = await api<{ resume: Resume }>("/resume/versions", accessToken, { method: "POST", body: "{}" });
      setResume(payload.resume); setSaveState("saved"); setNotice(`Version ${payload.resume.versionNumber} saved.`); await loadVersions(); setVersionsOpen(true);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this version."); }
    finally { setOperation(null); }
  };

  const restoreVersion = async (id: string) => {
    setOperation("restoring"); setError("");
    try { const payload = await api<{ resume: Resume }>(`/resume/versions/${id}/restore`, accessToken, { method: "POST", body: "{}" }); setResume(payload.resume); setSaveState("saved"); setNotice(`Version restored as v${payload.resume.versionNumber}.`); await loadVersions(); setVersionsOpen(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not restore that version."); }
    finally { setOperation(null); }
  };

  const exportResume = async (format: "pdf" | "docx") => {
    setExportOpen(false); setOperation(format); setError("");
    try {
      const { job } = await api<{ job: Job }>(`/resume/export/${format}`, accessToken, { method: "POST", body: "{}" });
      const complete = await pollJob(job.id);
      if (!complete.result?.fileUrl) throw new Error("The export finished without a file.");
      const response = await fetch(`${API_URL.replace(/\/api\/v1$/, "")}${complete.result.fileUrl}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) throw new Error("The export could not be downloaded.");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = complete.result.filename ?? `resume.${format}`; anchor.click(); URL.revokeObjectURL(url); setNotice(`${format.toUpperCase()} export is ready and downloading.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Export failed."); }
    finally { setOperation(null); }
  };

  const moveSection = (from: number, to: number) => {
    if (!resume || to < 0 || to >= resume.sections.length) return;
    updateResume(current => { const sections = [...current.sections].sort((a, b) => a.order - b.order); const [item] = sections.splice(from, 1); sections.splice(to, 0, item); return { ...current, sections: sections.map((section, order) => ({ ...section, order })) }; });
  };

  const updateSection = (type: SectionType, content: ResumeSection["content"]) => updateResume(current => ({ ...current, sections: current.sections.map(section => section.type === type ? { ...section, content } : section) }));
  const updateEntry = (section: ResumeSection, index: number, patch: Partial<ResumeEntry>) => { const entries = [...(section.content.entries ?? [])]; entries[index] = { ...entries[index], ...patch }; updateSection(section.type, { ...section.content, entries }); };
  const addEntry = (section: ResumeSection) => updateSection(section.type, { ...section.content, entries: [...(section.content.entries ?? []), section.type === "education" ? { degree: "New qualification", institution: "Institution", graduationYear: "2027", detail: "" } : { title: "New entry", subtitle: "Organisation or context", date: "", bullets: [] }] });
  const removeEntry = (section: ResumeSection, index: number) => updateSection(section.type, { ...section.content, entries: (section.content.entries ?? []).filter((_, itemIndex) => itemIndex !== index) });

  const sendCopilotMessage = async (suggestedMessage?: string) => {
    if (!resume || copilotLoading) return;
    const message = (suggestedMessage ?? chatInput).trim();
    if (!message) return;
    const history = chatMessages.map(({ role, text }) => ({ role, text }));
    setChatMessages(current => [...current, { id: crypto.randomUUID(), role: "user", text: message }]);
    setChatInput("");
    setCopilotLoading(true);
    setCopilotProposal(null);
    setError("");
    try {
      const { job } = await api<{ job: Job }>("/resume/copilot", accessToken, {
        method: "POST",
        body: JSON.stringify({ message, conversation: history, resume: { title: resume.title, sections: resume.sections, targetJdText: resume.targetJdText } }),
      });
      const complete = await pollJob(job.id);
      const result = complete.result;
      if (!result?.reply) throw new Error("The copilot finished without a response.");
      setChatMessages(current => [...current, { id: crypto.randomUUID(), role: "assistant", text: result.reply! }]);
      setCopilotProposal(result.proposal ?? null);
      setCopilotPrompts(result.suggestedPrompts?.length ? result.suggestedPrompts : starterPrompts);
      setCopilotProvider((result.provider && providerLabels[result.provider]) ?? "Sarvam");
      if (result.proposal && window.innerWidth <= 760) setMobileTab("preview");
    } catch (cause) {
      const messageText = cause instanceof Error ? cause.message : "The copilot could not respond.";
      setError(messageText);
      setChatMessages(current => [...current, { id: crypto.randomUUID(), role: "assistant", text: "I couldn’t prepare that change. Please try again in a moment." }]);
    } finally {
      setCopilotLoading(false);
    }
  };

  const applyCopilotProposal = () => {
    if (!resume || !copilotProposal) return;
    setUndoResume(structuredClone(resume));
    const summary = copilotProposal.changeSummary.join(" ");
    updateResume(current => ({ ...current, sections: copilotProposal.sections }));
    setCopilotProposal(null);
    setChatMessages(current => [...current, { id: crypto.randomUUID(), role: "assistant", text: `Applied. ${summary}` }]);
    setNotice("Copilot changes applied. Autosave and ATS scoring are updating now.");
  };

  const rejectCopilotProposal = () => {
    setCopilotProposal(null);
    setChatMessages(current => [...current, { id: crypto.randomUUID(), role: "assistant", text: "No problem — I kept your current draft unchanged." }]);
  };

  const undoCopilotChange = () => {
    if (!undoResume) return;
    const previous = undoResume;
    setUndoResume(null);
    updateResume(() => previous);
    setChatMessages(current => [...current, { id: crypto.randomUUID(), role: "assistant", text: "The last applied copilot change has been undone." }]);
    setNotice("Last copilot change undone.");
  };

  if (loading) return <div className="view-content inner-view rm-loading"><LoaderCircle size={28} /><h2>Opening Resume Maker</h2><p>Loading your latest draft and version history.</p></div>;
  if (!resume) return <div className="view-content inner-view resume-maker"><button className="rm-back" onClick={onBack}><ArrowLeft size={17} /> All agents</button><section className="rm-empty"><span><FileText size={28} /></span><p className="eyebrow">Resume Maker</p><h2>Start from what Placeble already knows.</h2><p>Generate a clean first draft from your profile, or upload an existing PDF/DOCX and review what we find before editing.</p>{error && <div className="rm-error"><AlertCircle size={17} />{error}</div>}<div><button className="button button-primary" onClick={() => void runGenerate()}><Sparkles size={17} /> Generate from my profile</button><button className="button button-secondary" onClick={() => fileInput.current?.click()}><UploadCloud size={17} /> Upload existing resume</button></div><small>No employers, dates, or achievements will be invented.</small><input ref={fileInput} type="file" accept=".pdf,.docx" hidden onChange={event => void handleUpload(event)} /></section>{operation && <OperationOverlay operation={operation} />}</div>;

  const orderedSections = [...resume.sections].sort((a, b) => a.order - b.order);
  const previewResume = copilotProposal ? { ...resume, sections: copilotProposal.sections } : resume;
  return <div className="view-content inner-view resume-maker">
    <header className="rm-top"><div><button className="rm-back" onClick={onBack}><ArrowLeft size={17} /> All agents</button><p className="eyebrow">Resume Maker</p><input aria-label="Resume title" value={resume.title} onChange={event => updateResume(current => ({ ...current, title: event.target.value }))} /></div><div className="rm-top-actions"><span className={`rm-save-state ${saveState}`}><i />{saveState === "saved" ? "All changes saved" : saveState === "saving" ? "Saving…" : "Unsaved changes"}</span><button onClick={() => void runGenerate()}><Sparkles size={16} /> Enhance draft</button><button onClick={() => setVersionsOpen(true)}><History size={16} /> Versions</button><button onClick={() => void saveVersion()}><Save size={16} /> Save version</button><div className="rm-export"><button className="button button-primary" onClick={() => setExportOpen(!exportOpen)}><Download size={16} /> Export <ChevronDown size={14} /></button>{exportOpen && <div><button onClick={() => void exportResume("pdf")}><FileText size={15} /><span><strong>PDF document</strong><small>Ready to submit</small></span></button><button onClick={() => void exportResume("docx")}><FileText size={15} /><span><strong>Word document</strong><small>Easy to edit</small></span></button></div>}</div></div></header>
    {error && <div className="rm-error"><AlertCircle size={17} /><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div>}
    {notice && <div className="rm-upload-success"><Check size={17} /><span>{notice}</span><button onClick={() => setNotice("")}><X size={15} /></button></div>}
    {uploadFound && <div className="rm-upload-success"><Check size={17} /><span><strong>Import complete.</strong> We found {uploadFound.sections} editable sections from {uploadFound.characters.toLocaleString()} characters. Review them before exporting.</span><button onClick={() => setUploadFound(null)}><X size={15} /></button></div>}
    <div className="rm-mobile-tabs"><button className={mobileTab === "edit" ? "active" : ""} onClick={() => setMobileTab("edit")}>Edit</button><button className={mobileTab === "preview" ? "active" : ""} onClick={() => setMobileTab("preview")}>Preview</button></div>
    <div className="rm-workspace">
      <section className={`rm-editor ${mobileTab === "edit" ? "mobile-active" : ""}`}>
        <div className="rm-mode-switch" aria-label="Resume editing mode">
          <button className={editorMode === "editor" ? "active" : ""} onClick={() => setEditorMode("editor")}><PenLine size={16} /><span><strong>Manual editor</strong><small>Edit each section directly</small></span></button>
          <button className={editorMode === "copilot" ? "active" : ""} onClick={() => setEditorMode("copilot")}><MessageCircle size={16} /><span><strong>Ask Placeble</strong><small>Chat naturally with AI</small></span></button>
        </div>
        <div className="rm-ats-card"><div className="rm-ats-score"><ReadinessScoreRing score={resume.atsScore} compact label="ATS score" /><span><small>Live ATS score</small><strong>{resume.atsScore >= 80 ? "Strong match" : resume.atsScore >= 65 ? "Good foundation" : "Needs targeting"}</strong><p>{operation === "scoring" ? <span className="rm-scoring"><LoaderCircle size={12} /> Re-scoring this draft…</span> : resume.targetJdText ? "Updated as you edit this draft." : "Add a target role for a specific match."}</p></span></div><div className="rm-score-bars"><div><span>Keywords <b>{resume.atsBreakdown?.keywordOverlap ?? 0}%</b></span><i><b style={{ width: `${resume.atsBreakdown?.keywordOverlap ?? 0}%` }} /></i></div><div><span>Role similarity <b>{resume.atsBreakdown?.semanticSimilarity ?? 0}%</b></span><i><b style={{ width: `${resume.atsBreakdown?.semanticSimilarity ?? 0}%` }} /></i></div></div><label><span><Target size={15} /> Target job description</span><textarea value={resume.targetJdText ?? ""} onChange={event => updateResume(current => ({ ...current, targetJdText: event.target.value }))} placeholder="Paste a job description to see role-specific keyword gaps…" /></label><div className="rm-keywords"><span>Missing keywords</span><div>{resume.atsBreakdown?.missingKeywords?.map(keyword => <button key={keyword} onClick={() => updateResume(current => ({ ...current, sections: current.sections.map(section => section.type === "skills" ? { ...section, content: { ...section.content, items: [...new Set([...(section.content.items ?? []), keyword])] } } : section) }))}>+ {keyword}</button>)}</div></div></div>
        <div className={`rm-manual-content ${editorMode === "editor" ? "active" : ""}`}>
        <div className="rm-editor-heading"><div><h2>Edit your content</h2><p>Drag sections into the order that tells your story best.</p></div><button onClick={() => fileInput.current?.click()}><UploadCloud size={15} /> Import</button><input ref={fileInput} type="file" accept=".pdf,.docx" hidden onChange={event => void handleUpload(event)} /></div>
        {orderedSections.map((section, index) => <article className="rm-section-card" key={section._id || section.type} draggable onDragStart={() => setDragIndex(index)} onDragOver={event => event.preventDefault()} onDrop={(event: DragEvent<HTMLElement>) => { event.preventDefault(); if (dragIndex !== null) moveSection(dragIndex, index); setDragIndex(null); }}><header><GripVertical size={17} /><div><h3>{sectionLabels[section.type]}</h3><span>{section.type === "summary" ? "Keep it specific and evidence-led." : `${section.content.entries?.length ?? section.content.items?.length ?? 0} items`}</span></div><button onClick={() => moveSection(index, index - 1)} disabled={index === 0} aria-label={`Move ${sectionLabels[section.type]} up`}><ArrowUp size={15} /></button><button onClick={() => moveSection(index, index + 1)} disabled={index === orderedSections.length - 1} aria-label={`Move ${sectionLabels[section.type]} down`}><ArrowDown size={15} /></button></header>{section.type === "summary" && <textarea value={section.content.text ?? ""} onChange={event => updateSection(section.type, { ...section.content, text: event.target.value })} />}{section.type === "skills" && <label className="rm-skills-input"><span>Comma-separated skills</span><textarea value={(section.content.items ?? []).join(", ")} onChange={event => updateSection(section.type, { ...section.content, items: event.target.value.split(",").map(item => item.trim()).filter(Boolean) })} /></label>}{!["summary", "skills"].includes(section.type) && <div className="rm-entry-list">{(section.content.entries ?? []).map((entry, entryIndex) => <div className="rm-entry" key={entryIndex}><div className="rm-entry-fields"><label><span>{section.type === "education" ? "Degree" : "Title"}</span><input value={section.type === "education" ? entry.degree ?? "" : entry.title ?? ""} onChange={event => updateEntry(section, entryIndex, section.type === "education" ? { degree: event.target.value } : { title: event.target.value })} /></label><label><span>{section.type === "education" ? "Institution" : "Organisation / context"}</span><input value={section.type === "education" ? entry.institution ?? "" : entry.subtitle ?? ""} onChange={event => updateEntry(section, entryIndex, section.type === "education" ? { institution: event.target.value } : { subtitle: event.target.value })} /></label><label><span>Date</span><input value={section.type === "education" ? entry.graduationYear ?? "" : entry.date ?? ""} onChange={event => updateEntry(section, entryIndex, section.type === "education" ? { graduationYear: event.target.value } : { date: event.target.value })} /></label></div><label><span>{section.type === "education" ? "Detail" : "Impact points (one per line)"}</span><textarea value={section.type === "education" ? entry.detail ?? "" : (entry.bullets ?? []).join("\n")} onChange={event => updateEntry(section, entryIndex, section.type === "education" ? { detail: event.target.value } : { bullets: event.target.value.split("\n") })} /></label><button className="rm-remove-entry" onClick={() => removeEntry(section, entryIndex)}><Trash2 size={14} /> Remove</button></div>)}<button className="rm-add-entry" onClick={() => addEntry(section)}><Plus size={15} /> Add {section.type === "experience" ? "experience" : section.type.slice(0, -1)}</button></div>}</article>)}
        </div>
        {editorMode === "copilot" && <section className="rm-copilot">
          <header><span><Bot size={18} /></span><div><h2>Resume Copilot</h2><p>Powered by {copilotProvider} · every edit stays in preview until you approve it</p></div>{undoResume && <button onClick={undoCopilotChange}><Undo2 size={15} /> Undo last</button>}</header>
          <div className="rm-copilot-safety"><Sparkles size={15} /><span><strong>Write naturally.</strong> I’ll ask for missing facts instead of inventing them.</span></div>
          <div className="rm-chat-log" aria-live="polite">
            {chatMessages.map(message => <article className={message.role} key={message.id}><span>{message.role === "assistant" ? <Bot size={14} /> : user.name.split(" ").map(part => part[0]).join("").slice(0, 2)}</span><p>{message.text}</p></article>)}
            {copilotLoading && <article className="assistant thinking"><span><Bot size={14} /></span><p><i /><i /><i /> Thinking about the strongest factual edit…</p></article>}
          </div>
          {copilotProposal && <div className="rm-proposal-card"><header><span><Check size={15} /></span><div><strong>Changes ready to preview</strong><small>Nothing has been saved yet</small></div></header><ul>{copilotProposal.changeSummary.map(item => <li key={item}>{item}</li>)}</ul><div><button onClick={rejectCopilotProposal}>Keep current</button><button className="button button-primary" onClick={applyCopilotProposal}><Check size={15} /> Apply changes</button></div></div>}
          {!copilotProposal && <div className="rm-prompt-chips">{copilotPrompts.map(prompt => <button disabled={copilotLoading} key={prompt} onClick={() => void sendCopilotMessage(prompt)}>{prompt}</button>)}</div>}
          <form className="rm-chat-composer" onSubmit={event => { event.preventDefault(); void sendCopilotMessage(); }}><textarea value={chatInput} disabled={copilotLoading} onChange={event => setChatInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendCopilotMessage(); } }} placeholder="Tell me about a project, ask for a stronger summary, or answer a follow-up…" /><footer><span>Enter to send · Shift + Enter for a new line</span><button className="button button-primary" disabled={!chatInput.trim() || copilotLoading} type="submit"><Send size={16} /> Send</button></footer></form>
        </section>}
      </section>
      <aside className={`rm-preview-panel ${mobileTab === "preview" ? "mobile-active" : ""}`}>
        <header><div><span>Live preview</span><small>{copilotProposal ? "Reviewing AI suggestions · not saved" : "A4 · updates as you type"}</small></div><div className="rm-template-picker">{templates.map(template => <button key={template.id} className={resume.template === template.id ? "active" : ""} onClick={() => updateResume(current => ({ ...current, template: template.id }))}><strong>{template.label}</strong><small>{template.note}</small></button>)}</div></header>
        {copilotProposal && <div className="rm-preview-proposal"><span><Sparkles size={14} /> Suggested changes are live in this preview</span><div><button onClick={rejectCopilotProposal}>Reject</button><button onClick={applyCopilotProposal}><Check size={14} /> Apply</button></div></div>}
        <div className={`rm-paper-stage ${copilotProposal ? "is-previewing" : ""}`}><ResumePreview resume={previewResume} user={user} /></div>
      </aside>
    </div>
    {operation && !["scoring", "saving-version"].includes(operation) && <OperationOverlay operation={operation} />}
    {versionsOpen && <div className="rm-drawer-layer"><button className="rm-drawer-scrim" onClick={() => setVersionsOpen(false)} aria-label="Close version history" /><aside className="rm-versions"><header><div><p className="eyebrow">Version history</p><h2>Saved milestones</h2><span>Autosave updates your draft. Saved versions remain restorable.</span></div><button onClick={() => setVersionsOpen(false)}><X size={18} /></button></header><div>{versions.map(version => <article key={version._id} className={version.isCurrent ? "current" : ""}><span>v{version.versionNumber}</span><div><strong>{version.title}</strong><small>{new Date(version.updatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · ATS {version.atsScore}</small></div>{version.isCurrent ? <em>Current</em> : <button onClick={() => void restoreVersion(version._id)}><RefreshCw size={14} /> Restore</button>}</article>)}</div></aside></div>}
  </div>;
}

function OperationOverlay({ operation }: { operation: string }) {
  const [title, detail] = operationCopy(operation);
  return <div className="rm-operation" role="status"><section><span><LoaderCircle size={25} /></span><p className="eyebrow">Resume Maker is working</p><h2>{title}</h2><p>{detail}</p><div><i /><i /><i /></div><small><Clock3 size={14} /> This usually takes a few seconds.</small></section></div>;
}
