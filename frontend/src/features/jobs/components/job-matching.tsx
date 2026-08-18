"use client";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileText,
  Filter,
  GripVertical,
  Layers3,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  Undo2,
  Users,
  Wifi,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.placeble.in/api/v1";
type Status = "saved" | "applied" | "interviewing" | "offer" | "rejected" | "withdrawn";
type Job = { _id: string; title: string; companyName: string; description: string; requiredSkills: string[]; location: string; workMode: "remote" | "hybrid" | "onsite"; employmentType: "full_time" | "internship"; salaryLabel: string; createdAt: string };
type Match = { _id: string; jobId: string; matchPercent: number; missingSkills: string[]; matchedSkills: string[]; computedAt: string; job: Job };
type Application = { _id: string; jobId: string; status: Status; notes: string; matchPercent: number; lastChangedAt: string; daysSinceLastChange: number; job: Job };
type Dashboard = { matches: Match[]; applications: Application[]; recalculating: boolean; profileVersion: number; activeJobCount: number; computedAt: string | null };
type QueueJob = { id: string; status: "queued" | "processing" | "complete" | "failed"; progress: number; message: string; error?: string };

const statusMeta: Record<Status, { label: string; copy: string }> = {
  saved: { label: "Saved", copy: "Worth revisiting" }, applied: { label: "Applied", copy: "Application sent" }, interviewing: { label: "Interviewing", copy: "Active conversations" }, offer: { label: "Offer", copy: "Decisions to make" }, rejected: { label: "Rejected", copy: "Closed by employer" }, withdrawn: { label: "Withdrawn", copy: "Closed by you" },
};

async function api<T>(path: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, ...init.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message ?? "The request could not be completed.");
  return payload as T;
}

const dashboardCache = new Map<string, Dashboard>();
const dashboardRequests = new Map<string, Promise<Dashboard>>();

function requestDashboard(accessToken: string, fresh = false) {
  const pending = dashboardRequests.get(accessToken);
  if (pending) return pending;
  const cached = dashboardCache.get(accessToken);
  if (cached && !fresh) return Promise.resolve(cached);
  const request = api<Dashboard>("/matching/dashboard", accessToken)
    .then(next => {
      dashboardCache.set(accessToken, next);
      return next;
    })
    .finally(() => dashboardRequests.delete(accessToken));
  dashboardRequests.set(accessToken, request);
  return request;
}

export function preloadJobMatching(accessToken: string) {
  if (!accessToken) return Promise.resolve(null);
  return requestDashboard(accessToken).catch(() => null);
}

function initials(company: string) { return company.split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase(); }

export function JobMatching({ accessToken, onBack, initialSurface = "feed" }: { accessToken: string; onBack: () => void; initialSurface?: "feed" | "tracker" }) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(() => dashboardCache.get(accessToken) ?? null);
  const [surface, setSurface] = useState<"feed" | "tracker">(initialSurface);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [loading, setLoading] = useState(() => !dashboardCache.has(accessToken));
  const [busy, setBusy] = useState(false);
  const [pendingApplications, setPendingApplications] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [minimumMatch, setMinimumMatch] = useState(0);
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [dragX, setDragX] = useState(0);
  const [queueJob, setQueueJob] = useState<QueueJob | null>(null);
  const pointerStartRef = useRef<number | null>(null);
  const dashboardVersionRef = useRef(0);

  const loadDashboard = useCallback(async (fresh = true) => {
    const versionAtRequest = dashboardVersionRef.current;
    const next = await requestDashboard(accessToken, fresh);
    if (versionAtRequest !== dashboardVersionRef.current) return;
    setDashboard(next);
  }, [accessToken]);

  const updateDashboard = useCallback((updater: (current: Dashboard) => Dashboard) => {
    dashboardVersionRef.current += 1;
    setDashboard(current => {
      if (!current) return current;
      const next = updater(current);
      dashboardCache.set(accessToken, next);
      return next;
    });
  }, [accessToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDashboard(Boolean(dashboardCache.get(accessToken))).catch(cause => setError(cause instanceof Error ? cause.message : "Could not load job matches.")).finally(() => setLoading(false)), 0);
    return () => window.clearTimeout(timer);
  }, [accessToken, loadDashboard]);

  useEffect(() => {
    if (!dashboard?.recalculating) return;
    const timer = window.setTimeout(() => void loadDashboard().catch(() => undefined), 2400);
    return () => window.clearTimeout(timer);
  }, [dashboard?.recalculating, loadDashboard]);

  const matches = useMemo(() => (dashboard?.matches ?? []).filter(match => match.matchPercent >= minimumMatch && `${match.job.title} ${match.job.companyName} ${match.job.requiredSkills.join(" ")}`.toLowerCase().includes(query.toLowerCase())), [dashboard?.matches, minimumMatch, query]);
  const currentMatch = matches[0] ?? null;

  const actOnMatch = async (match: Match, action: "save" | "pass" | "apply") => {
    setBusy(true); setError(""); setSelectedMatch(null); setDragX(action === "pass" ? -650 : 650);
    try {
      await api(`/matching/jobs/${match.job._id}/${action}`, accessToken, { method: "POST", body: "{}" });
      setNotice(action === "pass" ? `${match.job.title} removed from this feed.` : action === "apply" ? `${match.job.title} moved to Applied.` : `${match.job.title} saved to your tracker.`);
      await loadDashboard();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "That action could not be saved."); }
    finally { setBusy(false); window.setTimeout(() => setDragX(0), 180); }
  };

  const handlePointerUp = () => {
    if (!currentMatch) return;
    if (dragX > 75) void actOnMatch(currentMatch, "save");
    else if (dragX < -75) void actOnMatch(currentMatch, "pass");
    else setDragX(0);
    pointerStartRef.current = null;
  };

  const refreshMatches = async () => {
    setBusy(true); setError("");
    try {
      const queued = await api<{ job: QueueJob }>("/matching/recompute", accessToken, { method: "POST", body: "{}" });
      setQueueJob(queued.job);
      for (let index = 0; index < 180; index += 1) {
        await new Promise(resolve => window.setTimeout(resolve, 550));
        const response = await api<{ job: QueueJob }>(`/matching/jobs-tasks/${queued.job.id}`, accessToken);
        setQueueJob(response.job);
        if (response.job.status === "failed") throw new Error(response.job.error ?? "Matches could not be updated.");
        if (response.job.status === "complete") break;
      }
      await loadDashboard(); setNotice("Your matches now reflect the latest profile version.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Matches could not be refreshed."); }
    finally { setBusy(false); setQueueJob(null); }
  };

  const updateStatus = async (application: Application, status: Status) => {
    if (status === application.status) return;
    const previous = application;
    const optimistic = { ...application, status, lastChangedAt: new Date().toISOString(), daysSinceLastChange: 0 };
    setError("");
    setNotice(`${application.job.title} moved to ${statusMeta[status].label}.`);
    setPendingApplications(current => new Set(current).add(application._id));
    updateDashboard(current => ({ ...current, applications: current.applications.map(item => item._id === application._id ? optimistic : item) }));
    try {
      await api(`/matching/applications/${application._id}`, accessToken, { method: "PATCH", body: JSON.stringify({ status }) });
    } catch (cause) {
      updateDashboard(current => ({ ...current, applications: current.applications.map(item => item._id === application._id ? previous : item) }));
      setNotice("");
      setError(cause instanceof Error ? cause.message : "The application status could not be saved.");
    } finally {
      setPendingApplications(current => { const next = new Set(current); next.delete(application._id); return next; });
    }
  };

  const saveNotes = async () => {
    if (!selectedApplication) return;
    const application = selectedApplication;
    const previousNotes = application.notes;
    setBusy(true); setError(""); setSelectedApplication(null); setNotice("Saving your private note...");
    updateDashboard(current => ({ ...current, applications: current.applications.map(item => item._id === application._id ? { ...item, notes: notesDraft } : item) }));
    try {
      await api(`/matching/applications/${application._id}`, accessToken, { method: "PATCH", body: JSON.stringify({ notes: notesDraft }) });
      setNotice("Your private application notes were saved.");
    } catch (cause) {
      updateDashboard(current => ({ ...current, applications: current.applications.map(item => item._id === application._id ? { ...item, notes: previousNotes } : item) }));
      setSelectedApplication(application); setError(cause instanceof Error ? cause.message : "Notes could not be saved."); setNotice("");
    } finally { setBusy(false); }
  };

  const resetPassed = async () => {
    setBusy(true);
    try { await api("/matching/feed/reset", accessToken, { method: "POST", body: "{}" }); await loadDashboard(); setNotice("Passed roles are back in your feed."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Passed roles could not be restored."); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="view-content inner-view jm-loading"><LoaderCircle size={28} /><h2>Loading your job matches</h2><p>Reading cached matches and application activity.</p></div>;
  return <div className="view-content inner-view job-matching-view"><header className="jm-module-top"><button onClick={onBack}><ArrowLeft size={17} /> All agents</button><div><span><Target size={16} /></span><strong>Job Matching</strong></div></header>
    {error && <div className="jm-message error"><AlertCircle size={17} /><p>{error}</p><button onClick={() => setError("")}><X size={15} /></button></div>}{notice && <div className="jm-message"><CheckCircle2 size={17} /><p>{notice}</p><button onClick={() => setNotice("")}><X size={15} /></button></div>}
    <section className="jm-hero"><div><p className="eyebrow">Explainable opportunity matching</p><h1>See the fit. Understand the gap. Decide with confidence.</h1><p>Your match score is precomputed from the same embedding pipeline used by Resume Maker. Missing skills are a direct, deterministic comparison—not AI commentary.</p><div><button className={surface === "feed" ? "active" : ""} onClick={() => setSurface("feed")}><Layers3 size={16} /> Match feed <span>{dashboard?.matches.length ?? 0}</span></button><button className={surface === "tracker" ? "active" : ""} onClick={() => setSurface("tracker")}><BriefcaseBusiness size={16} /> Application tracker <span>{dashboard?.applications.length ?? 0}</span></button></div></div><aside><span><Sparkles size={20} /></span><strong>{dashboard?.matches[0]?.matchPercent ?? 0}%</strong><p>Best active match</p><small>Profile version {dashboard?.profileVersion ?? 1}</small></aside></section>
    {dashboard?.recalculating && <section className="jm-stale"><span><RefreshCw size={18} /></span><div><strong>Updating your matches</strong><p>A recent profile change made older scores stale. They are hidden until the queued recompute finishes.</p></div><button disabled={busy} onClick={() => void refreshMatches()}>{busy ? <LoaderCircle size={15} /> : <RefreshCw size={15} />} Check now</button></section>}
    {surface === "feed" ? <section className="jm-feed"><header><div><p className="eyebrow">Fresh matches</p><h2>One role at a time, with the reasoning visible.</h2></div><div className="jm-feed-filters"><label><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search roles or skills" /></label><select aria-label="Minimum match" value={minimumMatch} onChange={event => setMinimumMatch(Number(event.target.value))}><option value={0}>All matches</option><option value={60}>60%+</option><option value={70}>70%+</option><option value={80}>80%+</option></select></div></header>
      {currentMatch ? <div className="jm-feed-layout"><div className="jm-stack-wrap"><div className="jm-stack-card back second" /><div className="jm-stack-card back first" /><div className="jm-match-card" aria-label={`Open details for ${currentMatch.job.title} at ${currentMatch.job.companyName}`} role="button" tabIndex={0} style={{ transform: `translateX(${dragX}px) rotate(${dragX / 28}deg)` }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedMatch(currentMatch); } }} onPointerDown={event => { pointerStartRef.current = event.clientX; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (pointerStartRef.current !== null) setDragX(event.clientX - pointerStartRef.current); }} onPointerUp={handlePointerUp} onPointerCancel={() => { pointerStartRef.current = null; setDragX(0); }} onClick={() => { if (Math.abs(dragX) < 8) setSelectedMatch(currentMatch); }}><header><span className="jm-company-logo">{initials(currentMatch.job.companyName)}</span><div><p>{currentMatch.job.companyName}</p><h2>{currentMatch.job.title}</h2></div><span className="jm-match-badge"><Sparkles size={13} /> {currentMatch.matchPercent}% match</span></header><div className="jm-job-meta"><span><MapPin size={14} />{currentMatch.job.location}</span><span><Wifi size={14} />{currentMatch.job.workMode}</span><span><BriefcaseBusiness size={14} />{currentMatch.job.employmentType === "full_time" ? "Full time" : "Internship"}</span>{currentMatch.job.salaryLabel && <span><CircleDollarSign size={14} />{currentMatch.job.salaryLabel}</span>}</div><p className="jm-job-copy">{currentMatch.job.description}</p><div className="jm-skill-section"><span>What already matches</span><div>{currentMatch.matchedSkills.map(skill => <em className="matched" key={skill}><Check size={12} />{skill}</em>)}</div></div><div className="jm-skill-section missing"><span>Skills to build</span><div>{currentMatch.missingSkills.length ? currentMatch.missingSkills.map(skill => <em key={skill}>{skill}</em>) : <em className="none"><CheckCircle2 size={12} />No required-skill gaps</em>}</div></div><footer><button className="pass" disabled={busy} onClick={event => { event.stopPropagation(); void actOnMatch(currentMatch, "pass"); }}><XCircle size={18} /> Pass</button><small>Swipe left or right</small><button className="save" disabled={busy} onClick={event => { event.stopPropagation(); void actOnMatch(currentMatch, "save"); }}><Bookmark size={18} /> Save</button></footer></div></div><aside className="jm-feed-guide"><p className="eyebrow">Why this match</p><h3>{currentMatch.matchedSkills.length} of {currentMatch.job.requiredSkills.length} required skills already align.</h3><p>The percentage combines embedding similarity with direct skill coverage. Missing skills stay deterministic and easy to act on.</p><div><span><TrendingUp size={16} /><strong>{currentMatch.matchPercent >= 75 ? "Strong alignment" : currentMatch.matchPercent >= 60 ? "Promising fit" : "Stretch opportunity"}</strong></span><span><Clock3 size={16} /><strong>Computed {new Date(currentMatch.computedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</strong></span></div><button onClick={() => setSelectedMatch(currentMatch)}>View full role <ArrowRight size={15} /></button></aside></div> : <div className="jm-empty"><span><Target size={27} /></span><p className="eyebrow">You’re all caught up</p><h2>No fresh matches in this view.</h2><p>Add more skills to your profile, lower the match filter, or bring passed roles back for another look.</p><div><button onClick={() => { setQuery(""); setMinimumMatch(0); }}><Filter size={15} /> Clear filters</button><button onClick={() => void resetPassed()}><Undo2 size={15} /> Restore passed roles</button></div></div>}
    </section> : <ApplicationTracker applications={dashboard?.applications ?? []} statusFilter={statusFilter} setStatusFilter={setStatusFilter} busy={busy} pendingApplications={pendingApplications} onStatus={updateStatus} onNotes={application => { setSelectedApplication(application); setNotesDraft(application.notes ?? ""); }} />}
    {queueJob && <div className="jm-recompute"><LoaderCircle size={18} /><div><strong>{queueJob.message}</strong><span><i style={{ width: `${queueJob.progress}%` }} /></span></div><em>{queueJob.progress}%</em></div>}
    {selectedMatch && <div className="jm-modal-layer"><button className="jm-modal-scrim" aria-label="Close job details" onClick={() => setSelectedMatch(null)} /><section className="jm-detail"><button className="jm-detail-close" onClick={() => setSelectedMatch(null)}><X size={18} /></button><header><span>{initials(selectedMatch.job.companyName)}</span><div><p>{selectedMatch.job.companyName}</p><h2>{selectedMatch.job.title}</h2><em><Sparkles size={13} />{selectedMatch.matchPercent}% match</em></div></header><div className="jm-job-meta"><span><MapPin size={14} />{selectedMatch.job.location}</span><span><Wifi size={14} />{selectedMatch.job.workMode}</span><span><BriefcaseBusiness size={14} />{selectedMatch.job.employmentType === "full_time" ? "Full time" : "Internship"}</span></div><article><h3>About this role</h3><p>{selectedMatch.job.description}</p></article><article><h3>Required skills</h3><div className="jm-detail-skills">{selectedMatch.job.requiredSkills.map(skill => { const matched = selectedMatch.matchedSkills.includes(skill); return <span className={matched ? "matched" : "missing"} key={skill}>{matched ? <Check size={13} /> : <Target size={13} />}{skill}<small>{matched ? "On your profile" : "Skill gap"}</small></span>; })}</div></article><footer><button onClick={() => void actOnMatch(selectedMatch, "save")}><Bookmark size={16} /> Save for later</button><button className="button button-primary" onClick={() => void actOnMatch(selectedMatch, "apply")}><Send size={16} /> Mark as applied</button></footer></section></div>}
    {selectedApplication && <div className="jm-modal-layer"><button className="jm-modal-scrim" aria-label="Close application notes" onClick={() => setSelectedApplication(null)} /><section className="jm-notes-dialog"><button onClick={() => setSelectedApplication(null)}><X size={17} /></button><p className="eyebrow">Private notes</p><h2>{selectedApplication.job.title}</h2><span>{selectedApplication.job.companyName}</span><textarea value={notesDraft} onChange={event => setNotesDraft(event.target.value)} placeholder="Interview contacts, follow-up dates, questions to ask…" /><small>{notesDraft.length}/4000 · visible only to you</small><footer><button onClick={() => setSelectedApplication(null)}>Cancel</button><button className="button button-primary" disabled={busy} onClick={() => void saveNotes()}><Check size={15} /> Save notes</button></footer></section></div>}
  </div>;
}

function ApplicationTracker({ applications, statusFilter, setStatusFilter, busy, pendingApplications, onStatus, onNotes }: { applications: Application[]; statusFilter: Status | "all"; setStatusFilter: (status: Status | "all") => void; busy: boolean; pendingApplications: ReadonlySet<string>; onStatus: (application: Application, status: Status) => void; onNotes: (application: Application) => void }) {
  const statuses = Object.keys(statusMeta) as Status[];
  const visible = statusFilter === "all" ? applications : applications.filter(item => item.status === statusFilter);
  if (!applications.length) return <section className="jm-empty tracker"><span><BriefcaseBusiness size={27} /></span><p className="eyebrow">Application tracker</p><h2>Saved and applied roles will appear here.</h2><p>Return to the match feed, open a role, and save it when it deserves a closer look.</p></section>;
  return <section className="jm-tracker"><header><div><p className="eyebrow">Application tracker</p><h2>Keep every next step visible.</h2><p>Drag cards between columns on desktop or use the status selector anywhere.</p></div><label><Filter size={15} /><select value={statusFilter} onChange={event => setStatusFilter(event.target.value as Status | "all")}><option value="all">All statuses</option>{statuses.map(status => <option key={status} value={status}>{statusMeta[status].label}</option>)}</select></label></header><div className="jm-kanban">{statuses.filter(status => statusFilter === "all" || status === statusFilter).map(status => {
    const cards = visible.filter(item => item.status === status);
    return <section className={`jm-kanban-column ${status}`} key={status} onDragOver={event => event.preventDefault()} onDrop={event => { const id = event.dataTransfer.getData("application/id"); const application = applications.find(item => item._id === id); if (application && !pendingApplications.has(id)) onStatus(application, status); }}><header><div><strong>{statusMeta[status].label}</strong><small>{statusMeta[status].copy}</small></div><span>{cards.length}</span></header><div>{cards.map(application => { const pending = pendingApplications.has(application._id); return <article className={pending ? "is-updating" : ""} draggable={!busy && !pending} key={application._id} onDragStart={event => event.dataTransfer.setData("application/id", application._id)}><div className="jm-card-grip"><GripVertical size={15} /><span>{initials(application.job.companyName)}</span><em>{application.matchPercent}%</em></div><h3>{application.job.title}</h3><p>{application.job.companyName}</p><small className={pending ? "jm-card-sync" : ""}>{pending ? <><LoaderCircle size={12} />Syncing change...</> : <><Clock3 size={12} />{application.daysSinceLastChange === 0 ? "Updated today" : `${application.daysSinceLastChange} days in ${statusMeta[application.status].label}`}</>}</small><select aria-label={`Status for ${application.job.title}`} disabled={busy || pending} value={application.status} onChange={event => onStatus(application, event.target.value as Status)}>{statuses.map(next => <option key={next} value={next}>{statusMeta[next].label}</option>)}</select><button disabled={busy || pending} onClick={() => onNotes(application)}><FileText size={13} />{application.notes ? "Edit notes" : "Add private note"}</button></article>; })}{!cards.length && <div className="jm-column-empty"><Users size={18} /><span>No applications</span></div>}</div></section>;
  })}</div></section>;
}
