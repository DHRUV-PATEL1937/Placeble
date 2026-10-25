import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeResume, type Resume, type Section, type Version, type Design } from "./types";
const API = import.meta.env.VITE_API_URL || "/api/v1";
type Proposal = { sections: Section[]; changeSummary: string[] };
type Job = { id: string; status: string; error?: string; result?: { resume?: Resume; fileUrl?: string; filename?: string; reply?: string; proposal?: Proposal } };
const editable = (r: Resume) => JSON.stringify({ title: r.title, sections: r.sections, template: r.template, design: r.design, personalDetails: r.personalDetails, targetJdText: r.targetJdText });
export function useResumeStudio(token: string, user: { name: string; email: string }) {
  const [resume, setResume] = useState<Resume | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [saveState, setSaveState] = useState("saved");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [reply, setReply] = useState("");
  const [undo, setUndo] = useState<Resume | null>(null);
  const latest = useRef<Resume | null>(null);
  const saved = useRef("");
  const failedSnapshot = useRef("");
  const inFlight = useRef<Promise<void> | null>(null);
  const request = useCallback(async <T,>(path: string, init: RequestInit = {}) => {
    const response = await fetch(`${API}${path}`, { ...init, credentials: "include", headers: { ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }), Authorization: `Bearer ${token}` } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "This request could not be completed.");
    return payload as T;
  }, [token]);
  const accept = useCallback((r: Resume) => {
    const normalized = normalizeResume(r, user);
    latest.current = normalized; saved.current = editable(normalized);
    setResume(normalized); setSaveState("saved"); setProposal(null);
  }, [user]);
  const refreshVersions = useCallback(async () => { const data = await request<{ versions: Version[] }>("/resume/versions"); setVersions(data.versions); }, [request]);
  useEffect(() => {
    let mounted = true;
    void Promise.all([request<{ resume: Resume | null }>("/resume/current"), request<{ versions: Version[] }>("/resume/versions")]).then(([current, history]) => {
      if (!mounted) return;
      if (current.resume) accept(current.resume);
      setVersions(history.versions);
    }).catch(cause => { if (mounted) setError(cause.message); }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [request, accept]);
  const update = (change: (r: Resume) => Resume) => {
    if (!latest.current) return;
    const next = change(latest.current); latest.current = next; failedSnapshot.current = "";
    setResume(next); setSaveState("unsaved"); setError("");
  };
  const save = useCallback(async function persist(): Promise<void> {
    if (inFlight.current) await inFlight.current;
    const draft = latest.current;
    if (!draft || editable(draft) === saved.current) return;
    if (draft.title.trim().length < 2) throw new Error("Give your resume a title of at least two characters.");
    const snapshot = editable(draft); setSaveState("saving");
    const promise = request<{ resume: Resume }>("/resume/current", { method: "PATCH", body: snapshot }).then(({ resume: result }) => {
      saved.current = snapshot;
      if (latest.current?._id === draft._id) {
        const next = { ...latest.current, atsScore: result.atsScore, atsBreakdown: result.atsBreakdown };
        latest.current = next; setResume(next); setSaveState(editable(next) === snapshot ? "saved" : "unsaved");
      }
    }).catch(cause => { failedSnapshot.current = snapshot; setSaveState("unsaved"); throw cause; }).finally(() => { inFlight.current = null; });
    inFlight.current = promise;
    await promise;
    if (latest.current?._id === draft._id && editable(latest.current) !== saved.current) await persist();
  }, [request]);
  useEffect(() => {
    if (saveState !== "unsaved") return;
    if (latest.current && editable(latest.current) === failedSnapshot.current) return;
    const timer = window.setTimeout(() => void save().catch(cause => setError(cause.message)), 1000);
    return () => window.clearTimeout(timer);
  }, [resume, saveState, save]);
  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => { if (latest.current && editable(latest.current) !== saved.current) event.preventDefault(); };
    window.addEventListener("beforeunload", listener); return () => window.removeEventListener("beforeunload", listener);
  }, []);
  const run = async (label: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(label); setError(""); setNotice("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Please try again."); } finally { setBusy(""); }
  };
  const poll = async (id: string) => {
    for (let i = 0; i < 180; i++) {
      await new Promise(resolve => window.setTimeout(resolve, 600));
      const { job } = await request<{ job: Job }>(`/resume/jobs/${id}`);
      if (job.status === "failed") throw new Error(job.error || "This task could not finish.");
      if (job.status === "complete") return job.result;
    }
    throw new Error("This task is taking longer than usual. Please try again shortly.");
  };
  const create = async (template: Resume["template"], design: Design) => {
    await save(); const data = await request<{ resume: Resume }>("/resume/draft", { method: "POST", body: JSON.stringify({ template, design }) }); accept(data.resume); await refreshVersions();
  };
  const upload = async (file: File, template: Resume["template"], design: Design) => {
    if (!/\.(pdf|docx)$/i.test(file.name)) throw new Error("Choose a PDF or DOCX resume.");
    if (file.size > 8 * 1024 * 1024) throw new Error("Choose a file smaller than 8 MB.");
    await save(); const form = new FormData(); form.append("resume", file);
    const { job } = await request<{ job: Job }>("/resume/upload", { method: "POST", body: form });
    const result = await poll(job.id);
    if (!result?.resume) throw new Error("The import did not return an editable resume.");
    accept({ ...result.resume, template, design });
    // Persist the chosen design after import rather than overwriting it with defaults.
    saved.current = ""; await save(); await refreshVersions(); setNotice("Import complete. Review the extracted details and sections before downloading.");
  };
  const generate = async () => {
    await save(); const { job } = await request<{ job: Job }>("/resume/generate", { method: "POST", body: JSON.stringify({ targetJdText: latest.current?.targetJdText || "" }) });
    const result = await poll(job.id); if (!result?.resume) throw new Error("Your draft could not be created."); accept(result.resume); await refreshVersions();
  };
  const exportFile = async (format: "pdf" | "docx") => {
    await save(); const { job } = await request<{ job: Job }>(`/resume/export/${format}`, { method: "POST", body: "{}" });
    const result = await poll(job.id); if (!result?.fileUrl) throw new Error("The export did not return a file.");
    const path = new URL(result.fileUrl, new URL(API, window.location.origin));
    const response = await fetch(path, { credentials: "include", headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error("The file could not be downloaded.");
    const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = result.filename || `resume.${format}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const saveVersion = async () => { await save(); const data = await request<{ resume: Resume }>("/resume/versions", { method: "POST", body: "{}" }); accept(data.resume); await refreshVersions(); setNotice("A new version has been saved."); };
  const restore = async (id: string) => { await save(); const data = await request<{ resume: Resume }>(`/resume/versions/${id}/restore`, { method: "POST", body: "{}" }); accept(data.resume); await refreshVersions(); setNotice("Saved version restored."); };
  const assist = async (message: string) => {
    const current = latest.current; if (!current) return;
    if (!current.sections.length) throw new Error("Add some resume content first so the writing assistant has facts to work with.");
    const { job } = await request<{ job: Job }>("/resume/copilot", { method: "POST", body: JSON.stringify({ message, conversation: [], resume: { title: current.title, sections: current.sections, targetJdText: current.targetJdText } }) });
    const result = await poll(job.id); if (!result?.reply) throw new Error("The writing assistant could not respond.");
    if (latest.current?._id !== current._id || JSON.stringify(latest.current.sections) !== JSON.stringify(current.sections)) throw new Error("Your resume changed while the review was running. Please request a fresh review of the latest content.");
    setReply(result.reply); setProposal(result.proposal || null);
  };
  const apply = () => { if (!latest.current || !proposal) return; setUndo(structuredClone(latest.current)); update(r => ({ ...r, sections: proposal.sections })); setProposal(null); setNotice("Writing changes applied. You can undo this edit."); };
  const undoChange = () => { if (undo) { update(() => undo); setUndo(null); setProposal(null); } };
  return { resume, versions, loading, busy, saveState, error, notice, proposal, reply, undo, update, run, save, create, upload, generate, exportFile, saveVersion, restore, assist, apply, undoChange, setProposal, setError, setNotice };
}
