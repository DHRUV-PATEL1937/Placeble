"use client";

import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Eye,
  Filter,
  LayoutDashboard,
  Mail,
  Menu,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserCheck,
  UserPlus,
  UploadCloud,
  UsersRound,
  X,
} from "lucide-react";
import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Role = "tpo" | "recruiter" | "faculty";
type User = { name: string; email: string; role: Role };
type Student = {
  id: string | number;
  name: string;
  email: string;
  branch: string;
  readiness: number;
  trend: number;
  resume: number;
  aptitude: number;
  interview: number;
  status: "Ready" | "On track" | "Stalled" | "At risk";
  skills: string[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.placeble.in/api/v1";

type InvitationRow = { email: string; role: string; sent: string; status: string; activationUrl?: string };
const initialInvites: InvitationRow[] = [];

const navByRole: Record<Role, string[]> = {
  tpo: ["Overview", "Students", "Roster", "Pending students", "Access requests", "Marketplace settings", "Drives", "Invitations", "Progress"],
  recruiter: ["Overview", "My Institutes", "Marketplace", "My requests", "Candidates", "Drive access", "Shortlist", "Interviews", "Progress"],
  faculty: ["Cohort", "At risk", "Progress"],
};

const navIcons = [LayoutDashboard, UsersRound, CalendarDays, Send, BarChart3];

function Brand() {
  return <div className="prd-brand"><span><i /><i /><i /></span><strong>placeble</strong></div>;
}

function initials(name: string) {
  return name.split(" ").map(part => part[0]).slice(0, 2).join("").toUpperCase();
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const csv = [headers, ...rows].map(row => row.map(escape).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function StatusPill({ status }: { status: Student["status"] }) {
  return <span className={`prd-status status-${status.toLowerCase().replace(" ", "-")}`}>{status}</span>;
}

function StudentTable({ rows, role, onView, shortlisted, onShortlist }: {
  rows: Student[];
  role: Role;
  onView: (student: Student) => void;
  shortlisted: Array<string | number>;
  onShortlist: (student: Student) => void;
}) {
  return <div className="prd-table-wrap">
    <div className="prd-table-header"><span>Student</span><span>Readiness</span><span>Resume</span><span>Aptitude</span><span>Trend</span><span>Status</span><span /></div>
    {rows.map(student => <div className="prd-table-row" key={student.id}>
      <span className="prd-student"><i>{initials(student.name)}</i><b>{student.name}<small>{student.branch}</small></b></span>
      <span className="prd-score"><strong>{student.readiness}</strong><i><b style={{ width: `${student.readiness}%` }} /></i></span>
      <span>{student.resume}%</span><span>{student.aptitude}%</span>
      <span className={student.trend < 0 ? "down" : "up"}>{student.trend > 0 ? "+" : ""}{student.trend} {student.trend < 0 ? <TrendingDown size={13} /> : <TrendingUp size={13} />}</span>
      <span><StatusPill status={student.status} /></span>
      <span>{role === "recruiter" ? <button className={shortlisted.includes(student.id) ? "is-selected" : ""} onClick={() => onShortlist(student)}>{shortlisted.includes(student.id) ? <><Check size={14} /> Shortlisted</> : <><Plus size={14} /> Shortlist</>}</button> : <button onClick={() => onView(student)}>View <ChevronRight size={14} /></button>}</span>
    </div>)}
  </div>;
}

type CohortSummary = { studentCount: number; average: number; placementReady: number; atRisk: number; distribution: number[] };
type RecruiterSummary = { candidateCount: number; averageReadiness: number; readyCount: number; shortlistCount: number };
type RecruiterScope = { companyName?: string; institutionIds: string[]; driveIds: string[]; activeDriveId?: string };

function Overview({ role, students, summary, recruiterSummary, onView, shortlisted, onShortlist, onAction }: {
  role: Role;
  students: Student[];
  summary: CohortSummary | null;
  recruiterSummary: RecruiterSummary | null;
  onView: (student: Student) => void;
  shortlisted: Array<string | number>;
  onShortlist: (student: Student) => void;
  onAction: () => void;
}) {
  const distribution = [
    students.filter(student => student.readiness < 40).length,
    students.filter(student => student.readiness >= 40 && student.readiness < 60).length,
    students.filter(student => student.readiness >= 60 && student.readiness < 75).length,
    students.filter(student => student.readiness >= 75 && student.readiness < 90).length,
    students.filter(student => student.readiness >= 90).length,
  ];
  const stats = role === "tpo"
    ? [["Cohort readiness", String(summary?.average ?? 0), "Live cohort average"], ["Placement-ready", String(summary?.placementReady ?? 0), `${summary?.studentCount ? Math.round(summary.placementReady / summary.studentCount * 100) : 0}% of cohort`], ["Active students", String(summary?.studentCount ?? 0), "Institution-scoped"], ["At-risk students", String(summary?.atRisk ?? 0), "Needs attention"]]
    : [["Scoped candidates", String(recruiterSummary?.candidateCount ?? 0), "Granted institutions"], ["Shortlisted", String(shortlisted.length), "Saved to your account"], ["Placement-ready", String(recruiterSummary?.readyCount ?? 0), "Readiness 75+"], ["Avg. readiness", String(recruiterSummary?.averageReadiness ?? 0), "Current candidate scope"]];
  return <>
    <section className="prd-stats">{stats.map(([label, value, note], index) => <article key={label}><span className={`tone-${index}`}>{index === 0 ? <TrendingUp size={19} /> : index === 1 ? <UserCheck size={19} /> : index === 2 ? <CalendarDays size={19} /> : <AlertTriangle size={19} />}</span><div><small>{label}</small><strong>{value}</strong><p>{note}</p></div></article>)}</section>
    <section className="prd-overview-grid">
      <article className="prd-panel">
        <header className="prd-panel-head"><div><h2>{role === "tpo" ? "Cohort pulse" : "Recommended candidates"}</h2><p>Updated from today’s readiness signals</p></div><button onClick={onAction}>View all <ArrowRight size={15} /></button></header>
        <StudentTable rows={students.slice(0, 5)} role={role} onView={onView} shortlisted={shortlisted} onShortlist={onShortlist} />
      </article>
      <aside className="prd-insight"><span><Sparkles size={20} /></span><p>{role === "tpo" ? "Recommended action" : "Shortlist insight"}</p><h2>{role === "tpo" ? `${summary?.atRisk ?? 0} students currently need focused support.` : `${recruiterSummary?.readyCount ?? 0} scoped candidates are placement-ready.`}</h2><small>{role === "tpo" ? "Review their live readiness evidence and assign the next mentoring action." : "Review verified evidence and add the strongest matches to your shortlist."}</small><button onClick={onAction}>{role === "tpo" ? "Review students" : "Review candidates"}<ArrowRight size={15} /></button></aside>
    </section>
    <section className="prd-secondary-grid"><article className="prd-panel prd-drives-mini"><header className="prd-panel-head"><div><h2>Upcoming schedule</h2><p>Published placement activity</p></div></header><div className="prd-data-state"><CalendarDays size={22} /><strong>No schedule data available</strong><span>Drive records are not yet connected to this workspace.</span></div></article><article className="prd-panel prd-readiness-chart"><header className="prd-panel-head"><div><h2>Readiness distribution</h2><p>Current scoped students</p></div></header><div className="prd-bars">{[["0–39",distribution[0]],["40–59",distribution[1]],["60–74",distribution[2]],["75–89",distribution[3]],["90+",distribution[4]]].map(([label,value]) => <div key={label}><span style={{ height: `${Math.max(4, Number(value) * 6)}px` }} /><small>{label}</small><b>{value}</b></div>)}</div></article></section>
  </>;
}

function DirectoryView({ role, students, search, onView, shortlisted, onShortlist, onlyShortlisted = false, onToast }: { role: Role; students: Student[]; search: string; onView: (student: Student) => void; shortlisted: Array<string | number>; onShortlist: (student: Student) => void; onlyShortlisted?: boolean; onToast: (message: string) => void }) {
  const branches = ["All", ...new Set(students.map(student => student.branch))];
  const [branch, setBranch] = useState("All");
  const [readinessBand, setReadinessBand] = useState<"All" | "75+" | "Below 60">("All");
  const [status, setStatus] = useState<"All" | Student["status"]>("All");
  const rows = students.filter(student => (!onlyShortlisted || shortlisted.includes(student.id)) && (branch === "All" || student.branch === branch) && (readinessBand === "All" || (readinessBand === "75+" ? student.readiness >= 75 : student.readiness < 60)) && (status === "All" || student.status === status) && `${student.name} ${student.branch} ${student.skills.join(" ")}`.toLowerCase().includes(search.toLowerCase()));
  const nextBranch = () => setBranch(branches[(branches.indexOf(branch) + 1) % branches.length]);
  const nextReadiness = () => setReadinessBand(readinessBand === "All" ? "75+" : readinessBand === "75+" ? "Below 60" : "All");
  const nextStatus = () => setStatus(status === "All" ? "Ready" : status === "Ready" ? "On track" : status === "On track" ? "Stalled" : status === "Stalled" ? "At risk" : "All");
  const exportRows = () => {
    downloadCsv(`${role}-${onlyShortlisted ? "shortlist" : "directory"}.csv`, ["Name", "Email", "Programme", "Readiness", "Resume", "Aptitude", "Interview", "Status", "Skills"], rows.map(student => [student.name, student.email, student.branch, student.readiness, student.resume, student.aptitude, student.interview, student.status, student.skills.join("; ")]));
    onToast(`${rows.length} visible profile${rows.length === 1 ? "" : "s"} exported to CSV.`);
  };
  return <section className="prd-panel prd-directory"><header className="prd-panel-head"><div><h2>{onlyShortlisted ? "Your shortlist" : role === "recruiter" ? "Candidate directory" : role === "faculty" ? "Cohort directory" : "Student directory"}</h2><p>{rows.length} profiles match the current filters</p></div><button onClick={exportRows} disabled={!rows.length}><Download size={15} /> Export CSV</button></header><div className="prd-filter-row"><button onClick={nextBranch}><Filter size={14} /> Branch: {branch} <ChevronDown size={13} /></button><button onClick={nextReadiness}>Readiness: {readinessBand} <ChevronDown size={13} /></button><button onClick={nextStatus}>Status: {status} <ChevronDown size={13} /></button></div>{rows.length ? <StudentTable rows={rows} role={role} onView={onView} shortlisted={shortlisted} onShortlist={onShortlist} /> : <div className="prd-empty">No profiles match these filters.</div>}</section>;
}

function DrivesView() {
  return <section className="prd-panel prd-data-state"><CalendarDays size={26} /><h2>Drive management is not connected yet.</h2><p>No drive records are available from the backend, so create and manage controls are hidden instead of simulating changes.</p></section>;
}

function RoleProgressView({ role, summary, recruiterSummary, students, shortlisted, onAction, onToast }: { role: Role; summary: CohortSummary | null; recruiterSummary: RecruiterSummary | null; students: Student[]; shortlisted: Array<string | number>; onAction: () => void; onToast: (message: string) => void }) {
  const averageComponent = (key: "resume" | "aptitude" | "interview") => students.length ? Math.round(students.reduce((total, student) => total + student[key], 0) / students.length) : 0;
  const isRecruiter = role === "recruiter";
  const score = isRecruiter ? recruiterSummary?.averageReadiness ?? 0 : summary?.average ?? 0;
  const candidateCount = isRecruiter ? recruiterSummary?.candidateCount ?? students.length : summary?.studentCount ?? students.length;
  const readyCount = isRecruiter ? recruiterSummary?.readyCount ?? 0 : summary?.placementReady ?? 0;
  const atRiskCount = students.filter(student => student.status === "At risk").length;
  const content = {
    eyebrow: isRecruiter ? "Scoped candidate evidence" : role === "faculty" ? "Mentoring evidence" : "Institution progress",
    title: candidateCount ? "Current readiness, without estimated activity." : "No scoped readiness data yet.",
    description: "This snapshot is aggregated from persisted resume, aptitude, interview, discussion, and application evidence. Historical and scheduling claims remain hidden until those records exist.",
    score,
    cta: isRecruiter ? "Review your shortlist" : role === "faculty" ? "Open priority students" : `Review ${atRiskCount} at-risk students`,
    metrics: isRecruiter
      ? [["Scoped candidates", String(candidateCount), "Recruiter permission scope"], ["Shortlisted", String(shortlisted.length), "Persisted for this recruiter"], ["Placement-ready", String(readyCount), "Readiness 75+"]]
      : [["Active students", String(candidateCount), "Institution-scoped"], ["Placement-ready", String(readyCount), "Readiness 75+"], ["At-risk students", String(atRiskCount), "Readiness below 45"]],
    gaps: [["Resume evidence", averageComponent("resume")], ["Aptitude evidence", averageComponent("aptitude")], ["Interview evidence", averageComponent("interview")]],
    funnel: isRecruiter ? [["Scoped candidates", candidateCount], ["Shortlisted", shortlisted.length], ["Placement-ready", readyCount]] : [["Active students", candidateCount], ["Placement-ready", readyCount], ["At risk", atRiskCount]],
  };
  const exportReport = () => {
    downloadCsv(`${role}-readiness-report.csv`, ["Metric", "Value"], [...content.metrics.map(row => [row[0], row[1]]), ...content.gaps.map(row => [row[0], row[1]])]);
    onToast("Current scoped readiness report exported to CSV.");
  };

  return <div className="prd-analytics">
    <section className="prd-progress-hero">
      <div className="prd-progress-copy"><span>{content.eyebrow}</span><h2>{content.title}</h2><p>{content.description}</p><button onClick={onAction}>{content.cta} <ArrowRight size={15} /></button></div>
      <div className="prd-progress-score"><div className="prd-progress-ring" style={{ "--progress": `${content.score * 3.6}deg` } as CSSProperties}><strong>{content.score}</strong><span>current average</span></div><div><small>Data status</small><strong><ShieldCheck size={15} /> Live scoped snapshot</strong><p>Evidence policy</p><b>No estimated activity</b></div></div>
    </section>
    <section className="prd-progress-metrics">{content.metrics.map(([label, value, note], index) => <article key={label}><span>{index === 0 ? <UserCheck size={18} /> : index === 1 ? <TrendingUp size={18} /> : <CheckCircle2 size={18} />}</span><div><small>{label}</small><strong>{value}</strong><p>{note}</p></div></article>)}</section>
    <section className="prd-panel prd-wide-chart"><header className="prd-panel-head"><div><h2>Historical readiness trend</h2><p>Not available from the current aggregation response</p></div></header><div className="prd-data-state"><BarChart3 size={24} /><strong>No historical cohort series yet</strong><span>A line is intentionally not drawn from fixture points. Current evidence appears below.</span></div></section>
    <section className="prd-analytics-row"><article className="prd-panel"><header className="prd-panel-head"><div><h2>Evidence strength</h2><p>Live average by verified readiness component</p></div><button onClick={exportReport}><Download size={14} /> Export CSV</button></header><div className="prd-skill-gaps">{content.gaps.map(([skill,value]) => <div key={skill}><span>{skill}<b>{value}%</b></span><i><b style={{ width: `${value}%` }} /></i></div>)}</div></article><article className="prd-panel"><header className="prd-panel-head"><div><h2>Current outcome snapshot</h2><p>Counts from the active scope</p></div></header><div className="prd-funnel">{content.funnel.map(([label,value],index) => <div key={label} style={{ width: `${100 - index * 11}%` }}><span>{label}</span><strong>{value}</strong></div>)}</div></article></section>
  </div>;
}

function InterviewsView() {
  return <section className="prd-panel prd-data-state"><CalendarDays size={26} /><h2>No interview schedule is connected.</h2><p>Scheduling controls are hidden until an interview-booking endpoint and persisted records are available.</p></section>;
}

function InvitationsView({ invitations, onInvite, onToast }: { invitations: typeof initialInvites; onInvite: () => void; onToast: (message: string) => void }) {
  const copyInvite = async (invite: InvitationRow) => {
    if (!invite.activationUrl) return;
    await navigator.clipboard.writeText(invite.activationUrl);
    onToast(`Activation link for ${invite.email} copied.`);
  };
  return <section className="prd-panel"><header className="prd-panel-head"><div><h2>Invitations created this session</h2><p>Recruiter and faculty access tied to your institution</p></div><button onClick={onInvite}><UserPlus size={15} /> Create invitation</button></header>{invitations.length ? <div className="prd-invites"><div className="prd-invite-head"><span>Email</span><span>Role</span><span>Created</span><span>Status</span><span /></div>{invitations.map(invite => <div key={invite.email}><span><i><Mail size={15} /></i>{invite.email}</span><span>{invite.role}</span><span>{invite.sent}</span><span><em className="pending">{invite.status}</em></span><span>{invite.activationUrl && <button onClick={() => void copyInvite(invite)}>Copy link</button>}</span></div>)}</div> : <div className="prd-data-state"><Mail size={24} /><strong>No invitations created in this session</strong><span>The backend does not expose an invitation-list endpoint, so historical rows are not invented.</span></div>}</section>;
}

function FacultyProgress({ students, onView }: { students: Student[]; onView: (student: Student) => void }) {
  const priority = students.filter(student => student.status === "At risk" || student.status === "Stalled");
  return <section className="prd-progress-grid"><article className="prd-panel"><header className="prd-panel-head"><div><h2>Priority students</h2><p>Based on current persisted readiness status</p></div></header>{priority.length ? <div className="prd-followups">{priority.map(student => <button key={student.id} onClick={() => onView(student)}><span>{initials(student.name)}</span><p><strong>{student.name}</strong><small>Current status: {student.status}</small></p><em>{student.readiness}</em><ChevronRight size={16} /></button>)}</div> : <div className="prd-data-state"><UserCheck size={24} /><strong>No current priority students</strong><span>No student in scope is marked stalled or at risk.</span></div>}</article><article className="prd-panel prd-mentor-notes"><header className="prd-panel-head"><div><h2>Suggested conversation</h2><p>General mentoring prompt</p></div></header><span><MessageSquareText size={20} /></span><h3>“What is one preparation task that feels unclear right now?”</h3><p>This is a reusable coaching prompt, not a claim about student activity.</p><button onClick={() => navigator.clipboard?.writeText("What is one preparation task that feels unclear right now?")}>Copy prompt</button></article></section>;
}

function StudentModal({ student, onClose, role, shortlisted, onShortlist }: { student: Student; onClose: () => void; role: Role; shortlisted: boolean; onShortlist: (student: Student) => void }) {
  return <div className="prd-modal-layer"><button className="prd-modal-scrim" onClick={onClose} aria-label="Close profile" /><section className="prd-profile-modal" role="dialog" aria-modal="true"><header><div className="prd-profile-avatar">{initials(student.name)}</div><div><span>{student.branch}</span><h2>{student.name}</h2><p>{student.email}</p></div><button onClick={onClose} aria-label="Close profile"><X size={19} /></button></header><div className="prd-profile-score"><div className="prd-profile-ring"><span>{student.readiness}</span></div><div><small>Overall readiness</small><h3>{student.status === "Ready" ? "Strong placement readiness" : student.status === "At risk" ? "Focused support recommended" : "Current evidence snapshot"}</h3><StatusPill status={student.status} /></div></div><div className="prd-subscore-grid">{[["Resume",student.resume],["Aptitude",student.aptitude],["Interview",student.interview]].map(([label,value]) => <div key={label}><span>{label}<strong>{value}</strong></span><i><b style={{ width: `${value}%` }} /></i></div>)}</div><div className="prd-profile-section"><span>Demonstrated skills</span><div>{student.skills.length ? student.skills.map(skill => <em key={skill}>{skill}</em>) : <small>No skills recorded.</small>}</div></div><div className="prd-profile-section"><span>Activity detail</span><p><CheckCircle2 size={15} /> The cohort API provides current evidence scores, not a timestamped activity narrative.</p></div><footer>{role === "faculty" ? <button className="prd-secondary" onClick={() => window.location.href = `mailto:${student.email}`}><Mail size={15} /> Email student</button> : role === "recruiter" ? <button className="prd-primary" onClick={() => onShortlist(student)}>{shortlisted ? <><Check size={15} /> Shortlisted</> : <><Plus size={15} /> Add to shortlist</>}</button> : <button className="prd-primary" onClick={() => window.location.href = `mailto:${student.email}`}><MessageSquareText size={15} /> Contact student</button>}<button className="prd-secondary" onClick={onClose}>Close</button></footer></section></div>;
}

type RosterEntry = { _id: string; email: string; fullName: string; rollNumber: string; branch: string; batchYear?: number | null; status: "matched" | "unmatched"; uploadedAt: string };
type UploadResult = { summary: { created: number; updated: number; skipped: number; failed: number; total: number }; errorRows: Array<{ row: number; reason: string }> };

function RosterView({ accessToken, onToast }: { accessToken: string; onToast: (message: string) => void }) {
  const [entries, setEntries] = useState<RosterEntry[]>([]); const [summary, setSummary] = useState({ total: 0, matched: 0, unmatched: 0 }); const [search, setSearch] = useState(""); const [loading, setLoading] = useState(true); const [uploading, setUploading] = useState(false); const [result, setResult] = useState<UploadResult | null>(null); const [error, setError] = useState("");
  const load = async (term = search) => { setLoading(true); setError(""); try { const response = await fetch(`${API_URL}/tenancy/roster?search=${encodeURIComponent(term)}`, { credentials: "include", headers: { Authorization: `Bearer ${accessToken}` } }); const payload = await response.json(); if (!response.ok) throw new Error(payload.message); setEntries(payload.entries); setSummary(payload.summary); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load the roster."); } finally { setLoading(false); } };
  useEffect(() => { const timer = window.setTimeout(() => void load(""), 0); return () => window.clearTimeout(timer); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const uploadRoster = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const input = event.currentTarget.elements.namedItem("roster") as HTMLInputElement; const file = input.files?.[0]; if (!file) return; setUploading(true); setError(""); setResult(null); try { const body = new FormData(); body.append("file", file); const response = await fetch(`${API_URL}/tenancy/roster/upload`, { method: "POST", credentials: "include", headers: { Authorization: `Bearer ${accessToken}` }, body }); const payload = await response.json(); if (!response.ok) throw new Error(payload.message); setResult(payload); input.value = ""; await load(""); onToast("Roster processed and saved to this institution only."); } catch (cause) { setError(cause instanceof Error ? cause.message : "The roster could not be uploaded."); } finally { setUploading(false); } };
  return <div className="tenancy-stack"><section className="prd-panel roster-upload"><header className="prd-panel-head"><div><h2>Student roster</h2><p>Pre-authorize students with an institution-scoped spreadsheet</p></div><span><FileSpreadsheet size={19} /> .xlsx or .csv</span></header><form onSubmit={uploadRoster}><label><UploadCloud size={24} /><strong>{uploading ? "Validating every row…" : "Choose a roster file"}</strong><span>Required: email, fullName · Optional: rollNumber, branch, batchYear</span><input name="roster" type="file" accept=".xlsx,.csv" required disabled={uploading} /></label><button disabled={uploading}>{uploading ? <><span className="button-spinner" /> Uploading…</> : <><UploadCloud size={16} /> Upload and validate</>}</button></form>{error && <div className="tenancy-error"><AlertTriangle size={16} />{error}</div>}{result && <div className="roster-result"><div>{[["Added",result.summary.created],["Updated",result.summary.updated],["Skipped",result.summary.skipped],["Failed",result.summary.failed]].map(([label,value]) => <span key={label}><strong>{value}</strong><small>{label}</small></span>)}</div>{result.errorRows.length > 0 && <details open><summary>Review {result.errorRows.length} row issue{result.errorRows.length === 1 ? "" : "s"}</summary>{result.errorRows.map(item => <p key={`${item.row}-${item.reason}`}><b>Row {item.row}</b>{item.reason}</p>)}</details>}</div>}</section><section className="prd-panel roster-list"><header className="prd-panel-head"><div><h2>Persistent roster</h2><p>{summary.matched} matched · {summary.unmatched} awaiting signup · {summary.total} total</p></div><label><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void load(); }} placeholder="Search name, email, or roll number" /></label></header>{loading ? <div className="prd-data-state"><span className="button-spinner" /><strong>Loading institution roster…</strong></div> : entries.length ? <div className="roster-table"><div><span>Student</span><span>Academic details</span><span>Signup status</span><span>Uploaded</span></div>{entries.map(entry => <article key={entry._id}><span><strong>{entry.fullName}</strong><small>{entry.email}</small></span><span><strong>{entry.rollNumber || "No roll number"}</strong><small>{[entry.branch, entry.batchYear].filter(Boolean).join(" · ") || "Not provided"}</small></span><span><em className={entry.status}>{entry.status === "matched" ? "Account matched" : "Awaiting signup"}</em></span><span>{new Date(entry.uploadedAt).toLocaleDateString("en-IN")}</span></article>)}</div> : <div className="prd-data-state"><FileSpreadsheet size={25} /><h2>Your roster is empty.</h2><p>Upload the first spreadsheet to pre-authorize student accounts.</p></div>}</section></div>;
}

function PendingStudentsView({ accessToken, onToast }: { accessToken: string; onToast: (message: string) => void }) {
  const [students, setStudents] = useState<Array<{ _id: string; name: string; email: string; createdAt: string; roster?: { rollNumber?: string; branch?: string; batchYear?: number } | null }>>([]); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState("");
  const load = async () => { setLoading(true); const response = await fetch(`${API_URL}/tenancy/pending-students`, { credentials: "include", headers: { Authorization: `Bearer ${accessToken}` } }); const payload = await response.json(); setStudents(response.ok ? payload.students : []); setLoading(false); };
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const decide = async (id: string, action: "approve" | "reject") => { if (!window.confirm(action === "approve" ? "Approve this student for your institution?" : "Reject and suspend this account?")) return; setBusy(id); const response = await fetch(`${API_URL}/tenancy/pending-students/${id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ action }) }); const payload = await response.json(); if (response.ok) { setStudents(current => current.filter(item => item._id !== id)); onToast(action === "approve" ? "Student approved." : "Student account rejected and suspended."); } else onToast(payload.message ?? "Could not save the decision."); setBusy(""); };
  return <section className="prd-panel tenancy-queue"><header className="prd-panel-head"><div><h2>Pending students</h2><p>Roster-authorized student signups waiting for final TPO approval</p></div><button onClick={() => void load()}><RefreshCw size={15} /> Refresh</button></header>{loading ? <div className="prd-data-state"><span className="button-spinner" /><strong>Checking pending approvals…</strong></div> : students.length ? <div>{students.map(student => <article key={student._id}><span>{student.name.split(" ").map(value => value[0]).slice(0,2).join("")}</span><div><strong>{student.name}</strong><small>{student.email} · {[student.roster?.rollNumber, student.roster?.branch, student.roster?.batchYear].filter(Boolean).join(" · ") || "Roster entry confirmed"} · signed up {new Date(student.createdAt).toLocaleDateString("en-IN")}</small></div><aside><button disabled={busy === student._id} onClick={() => void decide(student._id, "reject")}>Reject</button><button className="approve" disabled={busy === student._id} onClick={() => void decide(student._id, "approve")}><Check size={15} /> Approve access</button></aside></article>)}</div> : <div className="prd-data-state"><CheckCircle2 size={26} /><h2>Nothing is waiting.</h2><p>Students appear here only after signing up with an email already added to your roster.</p></div>}</section>;
}

type MarketplaceAccessLevel = "aggregate_stats" | "candidate_access";
type MarketplaceRequestRow = { _id: string; requestedAccessLevel: MarketplaceAccessLevel; grantedAccessLevel?: MarketplaceAccessLevel | null; message?: string; status: "pending" | "approved" | "rejected"; createdAt: string; institutionId?: { _id: string; name: string }; recruiterOrgId?: { companyName: string; companyDomain: string } };
const accessLabel = (level?: MarketplaceAccessLevel | null) => level === "candidate_access" ? "Candidate access" : "Aggregate statistics";

type RecruiterInstitution = { _id: string; name: string; slug: string; accessLevel: MarketplaceAccessLevel; requestedAccessLevel: MarketplaceAccessLevel; relationshipSource: "marketplace" | "direct_tpo"; approvedAt?: string; summary: CohortSummary; drives: Array<{ grantId: string; driveId: string; title: string; companyName: string; status: string; startsAt?: string | null }> };
type AggregateInstituteDetail = { kind: "aggregate"; institution: RecruiterInstitution; branchBreakdown: Array<{ branch: string; count: number }>; skillBreakdown: Array<{ skill: string; count: number }> };
type CandidateInstituteDetail = { kind: "candidates"; institution: RecruiterInstitution; drive: RecruiterInstitution["drives"][number]; students: Student[] };

function MyInstitutesView({ accessToken, onBrowse, compact = false }: { accessToken: string; onBrowse: () => void; compact?: boolean }) {
  const recruiterRole: Role = "recruiter";
  const [institutions, setInstitutions] = useState<RecruiterInstitution[]>([]); const [loading, setLoading] = useState(true); const [detail, setDetail] = useState<AggregateInstituteDetail | CandidateInstituteDetail | null>(null); const [detailLoading, setDetailLoading] = useState(""); const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const load = useCallback(async (quiet = false) => { if (!quiet) setLoading(true); const response = await fetch(`${API_URL}/recruiter/institutions`, { credentials: "include", headers: { Authorization: `Bearer ${accessToken}` } }); const payload = await response.json(); if (response.ok) { setInstitutions(payload.institutions ?? []); setUpdatedAt(new Date()); } if (!quiet) setLoading(false); }, [accessToken]);
  useEffect(() => { const first = window.setTimeout(() => void load(), 0); const poll = window.setInterval(() => void load(true), 10000); const focus = () => void load(true); window.addEventListener("focus", focus); return () => { window.clearTimeout(first); window.clearInterval(poll); window.removeEventListener("focus", focus); }; }, [load]);
  const open = async (institution: RecruiterInstitution, drive = institution.drives[0]) => { setDetailLoading(institution._id); if (institution.accessLevel === "candidate_access" && drive) { const response = await fetch(`${API_URL}/recruiter/candidates?institutionId=${institution._id}&driveId=${drive.driveId}`, { credentials: "include", headers: { Authorization: `Bearer ${accessToken}` } }); const payload = await response.json(); if (response.ok) { const students = payload.students.map((student: { id: string; name: string; email: string; branch: string; graduationYear?: number; skills: string[]; readiness: number; trend: number; status: Student["status"]; components: { resume: number; aptitude: number; interview: number } }) => ({ id: student.id, name: student.name, email: student.email, branch: `${student.branch}${student.graduationYear ? ` · ${student.graduationYear}` : ""}`, skills: student.skills, readiness: student.readiness, trend: student.trend, status: student.status, resume: student.components.resume, aptitude: student.components.aptitude, interview: student.components.interview })); setDetail({ kind: "candidates", institution, drive, students }); } } else { const response = await fetch(`${API_URL}/recruiter/marketplace/${institution._id}/aggregate`, { credentials: "include", headers: { Authorization: `Bearer ${accessToken}` } }); const payload = await response.json(); if (response.ok) setDetail({ kind: "aggregate", institution, branchBreakdown: payload.branchBreakdown ?? [], skillBreakdown: payload.skillBreakdown ?? [] }); } setDetailLoading(""); };
  return <div className={`my-institutes ${compact ? "compact" : ""}`}><header><div><p>Approved institution network</p><h2>My Institutes</h2><span>Live access and readiness from every institution that has approved your organization.</span></div><aside>{updatedAt && <small>Updated {updatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</small>}<button onClick={() => void load()}><RefreshCw size={15} /> Refresh</button></aside></header>{loading ? <section className="prd-panel prd-data-state"><span className="button-spinner" /><strong>Syncing approved institutes…</strong></section> : institutions.length ? <div className="my-institute-grid">{institutions.slice(0, compact ? 3 : undefined).map(institution => <article className="prd-panel" key={institution._id}><header><span><Building2 size={20} /></span><em className={institution.accessLevel}>{accessLabel(institution.accessLevel)}</em></header><h3>{institution.name}</h3><p>{institution.relationshipSource === "marketplace" ? "Marketplace relationship" : "Direct institution grant"} · approved {institution.approvedAt ? new Date(institution.approvedAt).toLocaleDateString("en-IN") : "recently"}</p><div className="institute-readiness"><span style={{ "--institute-score": institution.summary.average } as CSSProperties}><strong>{institution.summary.average}</strong></span><div><small>Average cohort readiness</small><strong>{institution.summary.studentCount} students · {institution.summary.placementReady} ready</strong><p>{institution.summary.atRisk} currently need support</p></div></div>{institution.accessLevel === "candidate_access" && <div className="institute-drives"><small>{institution.drives.length ? "Candidate-enabled drives" : "No drive grant yet"}</small>{institution.drives.map(drive => <button key={drive.grantId} disabled={detailLoading === institution._id} onClick={() => void open(institution, drive)}><BriefcaseBusiness size={14} /><span>{drive.title}<small>{drive.companyName}</small></span><ChevronRight size={14} /></button>)}</div>}<button className="institute-open" disabled={detailLoading === institution._id} onClick={() => void open(institution)}>{detailLoading === institution._id ? "Loading access…" : institution.accessLevel === "candidate_access" && institution.drives.length ? "Open candidates" : "View aggregate breakdown"}<ArrowRight size={15} /></button></article>)}</div> : <section className="prd-panel my-institutes-empty"><Building2 size={28} /><h3>No approved institutes yet.</h3><p>Browse opt-in institutions and send your first relationship request. Approved institutes will appear here automatically.</p><button onClick={onBrowse}>Browse Marketplace <ArrowRight size={15} /></button></section>}{compact && institutions.length > 3 && <button className="institutes-more">View all {institutions.length} institutes <ArrowRight size={14} /></button>}{detail && <section className="prd-panel institute-detail"><header className="prd-panel-head"><div><p>{detail.kind === "aggregate" ? "Aggregate-only access" : detail.drive.title}</p><h2>{detail.institution.name}</h2></div><button onClick={() => setDetail(null)}><X size={15} /> Close</button></header>{detail.kind === "aggregate" ? <><div className="marketplace-aggregate-stats">{[["Students",detail.institution.summary.studentCount],["Average readiness",detail.institution.summary.average],["Placement-ready",detail.institution.summary.placementReady],["At risk",detail.institution.summary.atRisk]].map(([label,value]) => <article key={label}><small>{label}</small><strong>{value}</strong></article>)}</div><div className="marketplace-aggregate-breakdown"><div><h3>Branch distribution</h3>{detail.branchBreakdown.map(item => <p key={item.branch}><span>{item.branch}</span><strong>{item.count}</strong></p>)}</div><div><h3>Top skills</h3>{detail.skillBreakdown.length ? detail.skillBreakdown.map(item => <p key={item.skill}><span>{item.skill}</span><strong>{item.count}</strong></p>) : <p><span>No skill evidence yet</span></p>}</div></div><div className="aggregate-privacy"><ShieldCheck size={17} /><span>This view is server-limited to cohort aggregates. It contains no student names, emails, resumes, contacts, or individual scores.</span></div></> : <div className="institute-candidates"><div className="candidate-scope-note"><ShieldCheck size={16} /><span>Candidate data is limited to the approved <strong>{detail.drive.title}</strong> drive.</span></div>{detail.students.length ? <StudentTable rows={detail.students.slice(0, 8)} role={recruiterRole} onView={() => undefined} shortlisted={[]} onShortlist={() => undefined} /> : <div className="prd-data-state"><UsersRound size={24} /><h2>No eligible candidates yet.</h2><p>The drive grant is active, but this institution has no active candidate profiles.</p></div>}</div>}</section>}</div>;
}

function MarketplaceSettingsView({ accessToken, onToast }: { accessToken: string; onToast: (message: string) => void }) {
  const [listed, setListed] = useState(false); const [headline, setHeadline] = useState(""); const [studentCountBand, setStudentCountBand] = useState(""); const [branches, setBranches] = useState(""); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  useEffect(() => { void fetch(`${API_URL}/tenancy/marketplace/settings`, { credentials: "include", headers: { Authorization: `Bearer ${accessToken}` } }).then(response => response.json()).then(payload => { const listing = payload.institution?.marketplaceListing ?? {}; setListed(Boolean(listing.isListed)); setHeadline(listing.headline ?? ""); setStudentCountBand(listing.studentCountBand ?? ""); setBranches((listing.topBranches ?? []).join(", ")); }).finally(() => setLoading(false)); }, [accessToken]);
  const save = async (event: FormEvent) => { event.preventDefault(); setSaving(true); const response = await fetch(`${API_URL}/tenancy/marketplace/settings`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ isListed: listed, headline, studentCountBand, topBranches: branches.split(",").map(item => item.trim()).filter(Boolean) }) }); const payload = await response.json(); if (response.ok) onToast(listed ? "Marketplace listing is live." : "Marketplace discovery is off. Existing grants remain active."); else onToast(payload.message ?? "Could not update marketplace visibility."); setSaving(false); };
  if (loading) return <section className="prd-panel prd-data-state"><span className="button-spinner" /><strong>Loading marketplace settings…</strong></section>;
  return <form className="prd-panel marketplace-settings" onSubmit={save}><header><div><p>Institution-controlled discovery</p><h2>Marketplace visibility</h2><span>Off by default. Existing recruiter relationships and drive grants are never revoked by this switch.</span></div><label className="marketplace-switch"><input type="checkbox" checked={listed} onChange={event => setListed(event.target.checked)} /><span /><strong>{listed ? "Visible" : "Hidden"}</strong></label></header><div className={`marketplace-settings-grid ${listed ? "" : "muted"}`}><label><span>Listing headline <em>optional</em></span><textarea disabled={!listed} value={headline} maxLength={240} onChange={event => setHeadline(event.target.value)} placeholder="Describe the students and placement strengths recruiters can expect." /><small>{headline.length}/240</small></label><label><span>Student count band <em>coarse only</em></span><select disabled={!listed} value={studentCountBand} onChange={event => setStudentCountBand(event.target.value)}><option value="">Not specified</option>{["Under 250","250-500","500-1000","1000-2500","2500+"].map(item => <option key={item}>{item}</option>)}</select></label><label><span>Top branches <em>comma separated</em></span><input disabled={!listed} value={branches} onChange={event => setBranches(event.target.value)} placeholder="CSE, ECE, Mechanical" /></label></div><footer><div><ShieldCheck size={17} /><span>Only this coarse listing is public. Student names, exact counts, scores and contacts stay protected.</span></div><button disabled={saving}>{saving ? "Saving…" : "Save marketplace settings"}</button></footer></form>;
}

function MarketplaceRequestQueue({ accessToken, onToast }: { accessToken: string; onToast: (message: string) => void }) {
  type MarketDrive = { _id: string; title: string; companyName: string; status: string };
  const [requests, setRequests] = useState<MarketplaceRequestRow[]>([]); const [drives, setDrives] = useState<MarketDrive[]>([]); const [selectedDrive, setSelectedDrive] = useState<Record<string,string>>({}); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState("");
  const load = async () => { setLoading(true); const [requestResponse, driveResponse] = await Promise.all([fetch(`${API_URL}/tenancy/marketplace/requests`, { credentials: "include", headers: { Authorization: `Bearer ${accessToken}` } }), fetch(`${API_URL}/tenancy/marketplace/drives`, { credentials: "include", headers: { Authorization: `Bearer ${accessToken}` } })]); const [requestPayload, drivePayload] = await Promise.all([requestResponse.json(), driveResponse.json()]); setRequests(requestResponse.ok ? requestPayload.requests : []); setDrives(driveResponse.ok ? drivePayload.drives : []); setLoading(false); };
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const decide = async (id: string, action: "approve" | "reject" | "upgrade", grantedAccessLevel?: MarketplaceAccessLevel) => { setBusy(id); const response = await fetch(`${API_URL}/tenancy/marketplace/requests/${id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ action, grantedAccessLevel }) }); const payload = await response.json(); if (response.ok) { await load(); onToast(action === "reject" ? "Marketplace request rejected." : action === "upgrade" ? "Relationship upgraded to candidate access. A drive grant is still required." : `Relationship approved with ${accessLabel(grantedAccessLevel).toLowerCase()}.`); } else onToast(payload.message ?? "Could not save this decision."); setBusy(""); };
  const grantDrive = async (requestId: string) => { const driveId = selectedDrive[requestId] || drives[0]?._id; if (!driveId) return onToast("Create a drive before granting candidate access."); setBusy(requestId); const response = await fetch(`${API_URL}/tenancy/marketplace/requests/${requestId}/drives/${driveId}/grant`, { method: "POST", credentials: "include", headers: { Authorization: `Bearer ${accessToken}` } }); const payload = await response.json(); onToast(response.ok ? "Candidate access granted for the selected drive." : payload.message ?? "Could not grant this drive."); setBusy(""); };
  return <section className="prd-panel marketplace-queue"><header className="prd-panel-head"><div><h2>Institution relationship requests</h2><p>Approve as requested, begin with aggregate statistics, or reject</p></div><button onClick={() => void load()}><RefreshCw size={15} /> Refresh</button></header>{loading ? <div className="prd-data-state"><span className="button-spinner" /><strong>Loading marketplace requests…</strong></div> : requests.length ? <div>{requests.map(item => { const requestedCandidate = item.requestedAccessLevel === "candidate_access"; return <article key={item._id}><span><Building2 size={19} /></span><div><strong>{item.recruiterOrgId?.companyName}</strong><small>@{item.recruiterOrgId?.companyDomain} · Requested {accessLabel(item.requestedAccessLevel)} · {new Date(item.createdAt).toLocaleDateString("en-IN")}</small>{item.message && <p>&ldquo;{item.message}&rdquo;</p>}{item.status === "approved" && item.grantedAccessLevel !== item.requestedAccessLevel && <em className="reduced-note">Granted {accessLabel(item.grantedAccessLevel)} instead of {accessLabel(item.requestedAccessLevel)}</em>}</div><em className={item.status}>{item.status}</em><aside>{item.status === "pending" ? <><button disabled={busy === item._id} onClick={() => void decide(item._id, "reject")}>Reject</button>{requestedCandidate && <button disabled={busy === item._id} onClick={() => void decide(item._id, "approve", "aggregate_stats")}>Approve aggregate only</button>}<button className="approve" disabled={busy === item._id} onClick={() => void decide(item._id, "approve", item.requestedAccessLevel)}><Check size={15} /> Approve as requested</button></> : item.status === "approved" && item.grantedAccessLevel === "candidate_access" ? <><select value={selectedDrive[item._id] ?? drives[0]?._id ?? ""} onChange={event => setSelectedDrive(current => ({ ...current, [item._id]: event.target.value }))}>{drives.length ? drives.map(drive => <option key={drive._id} value={drive._id}>{drive.title} · {drive.companyName}</option>) : <option value="">No drives available</option>}</select><button className="approve" disabled={busy === item._id || !drives.length} onClick={() => void grantDrive(item._id)}>Grant selected drive</button></> : item.status === "approved" && requestedCandidate ? <><span>{accessLabel(item.grantedAccessLevel)}</span><button disabled={busy === item._id} onClick={() => void decide(item._id, "upgrade")}>Upgrade to candidate access</button></> : <span>{item.status === "approved" ? accessLabel(item.grantedAccessLevel) : "No access granted"}</span>}</aside></article>; })}</div> : <div className="prd-data-state"><ShieldCheck size={26} /><h2>No marketplace requests.</h2><p>Verified recruiter organizations will appear here when they request a relationship.</p></div>}</section>;
}

function RecruiterMarketplaceView({ accessToken, onToast }: { accessToken: string; onToast: (message: string) => void }) {
  type Listing = { _id: string; name: string; marketplaceListing: { headline?: string; studentCountBand?: string; topBranches?: string[] }; request?: MarketplaceRequestRow | null };
  const [institutions, setInstitutions] = useState<Listing[]>([]); const [search, setSearch] = useState(""); const [band, setBand] = useState(""); const [loading, setLoading] = useState(true); const [selected, setSelected] = useState<Listing | null>(null); const [level, setLevel] = useState<MarketplaceAccessLevel>("aggregate_stats"); const [message, setMessage] = useState(""); const [sending, setSending] = useState(false);
  const load = async () => { setLoading(true); const response = await fetch(`${API_URL}/recruiter/marketplace?search=${encodeURIComponent(search)}&studentCountBand=${encodeURIComponent(band)}`, { credentials: "include", headers: { Authorization: `Bearer ${accessToken}` } }); const payload = await response.json(); setInstitutions(response.ok ? payload.institutions : []); setLoading(false); };
  useEffect(() => { const timer = window.setTimeout(() => void load(), 180); return () => window.clearTimeout(timer); }, [search, band]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!selected) return; setSending(true); const response = await fetch(`${API_URL}/recruiter/marketplace/${selected._id}/request`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ requestedAccessLevel: level, message }) }); const payload = await response.json(); if (response.ok) { setSelected(null); setMessage(""); await load(); onToast("Relationship request sent to the institution TPO."); } else onToast(payload.message ?? "Could not send this request."); setSending(false); };
  return <section className="marketplace-browser"><header><div><p>Verified institution network</p><h2>Find the right campus relationships.</h2><span>Browse opt-in listings. Exact student data stays private until the institution grants the right level.</span></div><ShieldCheck size={32} /></header><div className="marketplace-toolbar"><label><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search institutions, headline, or branch" /></label><select value={band} onChange={event => setBand(event.target.value)}><option value="">All cohort sizes</option>{["Under 250","250-500","500-1000","1000-2500","2500+"].map(item => <option key={item}>{item}</option>)}</select></div>{loading ? <div className="prd-panel prd-data-state"><span className="button-spinner" /><strong>Searching the verified network…</strong></div> : institutions.length ? <div className="marketplace-grid">{institutions.map(item => <article className="prd-panel" key={item._id}><span className="marketplace-building"><Building2 size={22} /></span><div><small>Participating institution</small><h3>{item.name}</h3><p>{item.marketplaceListing.headline || "Open to trusted recruiter relationships on Placeble."}</p></div><dl><div><dt>Cohort band</dt><dd>{item.marketplaceListing.studentCountBand || "Not specified"}</dd></div><div><dt>Top branches</dt><dd>{item.marketplaceListing.topBranches?.length ? item.marketplaceListing.topBranches.join(" · ") : "Not specified"}</dd></div></dl>{item.request ? <div className={`marketplace-card-status ${item.request.status}`}><strong>{item.request.status === "pending" ? "Request pending" : item.request.status === "approved" ? `Approved · ${accessLabel(item.request.grantedAccessLevel)}` : "Request declined"}</strong><span>{item.request.status === "pending" ? "The institution TPO is reviewing your request." : item.request.status === "rejected" ? "Contact the institution before trying again." : "This relationship stays available even if the listing is later hidden."}</span></div> : <button onClick={() => { setSelected(item); setLevel("aggregate_stats"); }}><Send size={15} /> Request access</button>}</article>)}</div> : <div className="prd-panel prd-data-state"><Building2 size={28} /><h2>No institutions match right now.</h2><p>Listings are opt-in. Clear the filters or check back as institutions join the marketplace.</p></div>}{selected && <div className="prd-modal-layer"><button className="prd-modal-scrim" onClick={() => setSelected(null)} aria-label="Close request form" /><form className="prd-invite-modal marketplace-request-modal" onSubmit={submit}><button type="button" className="prd-close" onClick={() => setSelected(null)}><X size={19} /></button><span className="prd-modal-icon"><Building2 size={20} /></span><p>Relationship request</p><h2>{selected.name}</h2><small>Choose exactly what your organization is asking this institution to approve.</small><div className="marketplace-levels"><button type="button" className={level === "aggregate_stats" ? "selected" : ""} onClick={() => setLevel("aggregate_stats")}><BarChart3 size={18} /><span><strong>Aggregate statistics</strong><small>Cohort totals and distributions only. No identifiable students.</small></span></button><button type="button" className={level === "candidate_access" ? "selected" : ""} onClick={() => setLevel("candidate_access")}><UsersRound size={18} /><span><strong>Candidate access</strong><small>Still requires a separate grant for each specific drive.</small></span></button></div><label><span>Message <em>optional</em></span><textarea maxLength={500} value={message} onChange={event => setMessage(event.target.value)} placeholder="Share hiring focus, roles, or preferred branches." /></label><button className="prd-primary" disabled={sending}>{sending ? "Sending…" : <><Send size={15} /> Send request</>}</button></form></div>}</section>;
}

function MyMarketplaceRequestsView({ accessToken }: { accessToken: string }) {
  type Aggregate = { institutionId: string; summary: { studentCount: number; average: number; placementReady: number; atRisk: number; distribution: number[] }; branchBreakdown: Array<{ branch: string; count: number }>; skillBreakdown: Array<{ skill: string; count: number }> };
  const [requests, setRequests] = useState<MarketplaceRequestRow[]>([]); const [loading, setLoading] = useState(true); const [aggregate, setAggregate] = useState<Aggregate | null>(null); const [aggregateLoading, setAggregateLoading] = useState(false);
  useEffect(() => { void fetch(`${API_URL}/recruiter/marketplace/requests`, { credentials: "include", headers: { Authorization: `Bearer ${accessToken}` } }).then(response => response.json()).then(payload => setRequests(payload.requests ?? [])).finally(() => setLoading(false)); }, [accessToken]);
  const viewAggregate = async (institutionId: string) => { setAggregateLoading(true); const response = await fetch(`${API_URL}/recruiter/marketplace/${institutionId}/aggregate`, { credentials: "include", headers: { Authorization: `Bearer ${accessToken}` } }); const payload = await response.json(); if (response.ok) setAggregate(payload); setAggregateLoading(false); };
  return <div className="tenancy-stack"><section className="prd-panel marketplace-my-requests"><header className="prd-panel-head"><div><h2>My institution requests</h2><p>Requested and granted levels remain visibly separate</p></div></header>{loading ? <div className="prd-data-state"><span className="button-spinner" /></div> : requests.length ? <div>{requests.map(item => { const reduced = item.status === "approved" && item.grantedAccessLevel !== item.requestedAccessLevel; return <article key={item._id}><span><Building2 size={18} /></span><div><strong>{item.institutionId?.name}</strong><small>Requested {accessLabel(item.requestedAccessLevel)} · {new Date(item.createdAt).toLocaleDateString("en-IN")}</small></div><em className={item.status}>{item.status}</em><aside><strong>{item.status === "approved" ? `Granted: ${accessLabel(item.grantedAccessLevel)}` : item.status === "pending" ? "Awaiting TPO decision" : "No access granted"}</strong>{reduced && <span>Approved at a safer level than requested</span>}{item.status === "approved" && item.institutionId?._id && <button disabled={aggregateLoading} onClick={() => void viewAggregate(item.institutionId!._id)}><BarChart3 size={14} /> View cohort statistics</button>}</aside></article>; })}</div> : <div className="prd-data-state"><Send size={26} /><h2>No relationship requests yet.</h2><p>Browse the marketplace and request access to an opt-in institution.</p></div>}</section>{aggregate && <section className="prd-panel marketplace-aggregate"><header className="prd-panel-head"><div><h2>Aggregate cohort view</h2><p>No names, email addresses, IDs, resumes, or individual scores are returned by this API</p></div><button onClick={() => setAggregate(null)}><X size={15} /> Close</button></header><div className="marketplace-aggregate-stats">{[["Students",aggregate.summary.studentCount],["Average readiness",aggregate.summary.average],["Placement-ready",aggregate.summary.placementReady],["At risk",aggregate.summary.atRisk]].map(([label,value]) => <article key={label}><small>{label}</small><strong>{value}</strong></article>)}</div><div className="marketplace-aggregate-breakdown"><div><h3>Branch distribution</h3>{aggregate.branchBreakdown.map(item => <p key={item.branch}><span>{item.branch}</span><strong>{item.count}</strong></p>)}</div><div><h3>Top skills</h3>{aggregate.skillBreakdown.length ? aggregate.skillBreakdown.map(item => <p key={item.skill}><span>{item.skill}</span><strong>{item.count}</strong></p>) : <p><span>No skill evidence yet</span></p>}</div></div></section>}</div>;
}

function AccessRequestsView({ accessToken, onToast }: { accessToken: string; onToast: (message: string) => void }) {
  type AccessRequest = { _id: string; status: string; requestedAt: string; recruiterOrgId: { companyName: string; companyDomain: string; verificationStatus: string }; driveId: { title: string; companyName: string } };
  const [requests, setRequests] = useState<AccessRequest[]>([]); const [loading, setLoading] = useState(true); const load = async () => { setLoading(true); const response = await fetch(`${API_URL}/tenancy/drive-access`, { credentials: "include", headers: { Authorization: `Bearer ${accessToken}` } }); const payload = await response.json(); setRequests(response.ok ? payload.requests : []); setLoading(false); }; useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const decide = async (id: string, action: "approve" | "reject" | "revoke") => { const response = await fetch(`${API_URL}/tenancy/drive-access/${id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ action }) }); const payload = await response.json(); if (response.ok) { await load(); onToast(`Drive access ${action === "approve" ? "approved" : action === "revoke" ? "revoked" : "rejected"}.`); } else onToast(payload.message ?? "Could not save the decision."); };
  return <section className="prd-panel tenancy-queue access"><header className="prd-panel-head"><div><h2>Recruiter access requests</h2><p>Your institution controls every company-to-drive relationship</p></div></header>{loading ? <div className="prd-data-state"><span className="button-spinner" /><strong>Loading access requests…</strong></div> : requests.length ? <div>{requests.map(item => <article key={item._id}><span><ShieldCheck size={18} /></span><div><strong>{item.recruiterOrgId.companyName}</strong><small>@{item.recruiterOrgId.companyDomain} · {item.driveId.title} · {item.driveId.companyName}</small></div><em className={item.status}>{item.status}</em><aside>{item.status === "requested" ? <><button onClick={() => void decide(item._id, "reject")}>Reject</button><button className="approve" onClick={() => void decide(item._id, "approve")}><Check size={15} /> Approve</button></> : item.status === "approved" ? <button onClick={() => void decide(item._id, "revoke")}>Revoke access</button> : null}</aside></article>)}</div> : <div className="prd-data-state"><ShieldCheck size={26} /><h2>No access requests.</h2><p>Verified recruiter organizations can request a specific published drive.</p></div>}</section>;
}

function RecruiterDriveAccessView({ accessToken, onToast }: { accessToken: string; onToast: (message: string) => void }) {
  type DriveAccess = { _id: string; title: string; companyName: string; startsAt?: string; institutionId: { name: string }; accessStatus: "available" | "requested" | "approved" | "revoked" };
  const [drives, setDrives] = useState<DriveAccess[]>([]); const [loading, setLoading] = useState(true); const load = async () => { setLoading(true); const response = await fetch(`${API_URL}/tenancy/recruiter/drives`, { credentials: "include", headers: { Authorization: `Bearer ${accessToken}` } }); const payload = await response.json(); setDrives(response.ok ? payload.drives : []); setLoading(false); }; useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const request = async (id: string) => { const response = await fetch(`${API_URL}/tenancy/recruiter/drives/${id}/request`, { method: "POST", credentials: "include", headers: { Authorization: `Bearer ${accessToken}` } }); const payload = await response.json(); if (response.ok) { await load(); onToast("Access request sent to the institution TPO."); } else onToast(payload.message ?? "Could not request access."); };
  return <section className="drive-market"><header><p>Institution-approved access</p><h2>Request the right drive, one relationship at a time.</h2><span>Company verification is platform-wide. Candidate visibility remains institution-controlled.</span></header>{loading ? <div className="prd-panel prd-data-state"><span className="button-spinner" /><strong>Loading published drives…</strong></div> : drives.length ? <div>{drives.map(drive => <article className="prd-panel" key={drive._id}><span><Building2 size={20} /></span><div><small>{drive.institutionId.name}</small><h3>{drive.title}</h3><p>{drive.companyName}{drive.startsAt ? ` · ${new Date(drive.startsAt).toLocaleDateString("en-IN")}` : ""}</p></div><em className={drive.accessStatus}>{drive.accessStatus === "available" ? "Open to request" : drive.accessStatus}</em><button disabled={["requested","approved"].includes(drive.accessStatus)} onClick={() => void request(drive._id)}>{drive.accessStatus === "approved" ? <><Check size={15} /> Access approved</> : drive.accessStatus === "requested" ? "Awaiting TPO" : "Request access"}</button></article>)}</div> : <div className="prd-panel prd-data-state"><CalendarDays size={26} /><h2>No published drives available.</h2><p>New institution opportunities will appear here.</p></div>}</section>;
}

export function ProfessionalRoleDashboard({ user, accessToken, onLogout }: { user: User; accessToken: string; onLogout: () => void }) {
  const role = user.role;
  const navItems = navByRole[role];
  const [active, setActive] = useState(navItems[0]);
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [shortlisted, setShortlisted] = useState<Array<string | number>>([]);
  const [cohortStudents, setCohortStudents] = useState<Student[]>([]);
  const [cohortSummary, setCohortSummary] = useState<CohortSummary | null>(null);
  const [recruiterSummary, setRecruiterSummary] = useState<RecruiterSummary | null>(null);
  const [recruiterScope, setRecruiterScope] = useState<RecruiterScope | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [shortlistBusy, setShortlistBusy] = useState<string | number | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"faculty" | "tpo">("faculty");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [invitations, setInvitations] = useState(initialInvites);
  const [toast, setToast] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [active]);
  useEffect(() => {
    const endpoint = role === "recruiter" ? "/recruiter/candidates" : "/readiness/cohort";
    fetch(`${API_URL}${endpoint}`, { credentials: "include", headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async response => { if (!response.ok) throw new Error("Could not load cohort readiness."); return response.json(); })
      .then(payload => {
        if (role === "recruiter") {
          setRecruiterSummary(payload.summary);
          setRecruiterScope(payload.scope);
          setShortlisted(payload.shortlistedCandidateIds);
        } else setCohortSummary(payload.summary);
        setCohortStudents(payload.students.map((student: { id: string; name: string; email: string; branch: string; graduationYear?: number; skills: string[]; readiness: number; trend: number; status: Student["status"]; components: { resume: number; aptitude: number; interview: number } }) => ({ id: student.id, name: student.name, email: student.email, branch: `${student.branch}${student.graduationYear ? ` · ${student.graduationYear}` : ""}`, skills: student.skills, readiness: student.readiness, trend: student.trend, status: student.status, resume: student.components.resume, aptitude: student.components.aptitude, interview: student.components.interview })));
      })
      .catch(error => { setCohortStudents([]); setCohortSummary(null); setRecruiterSummary(null); setDataError(error instanceof Error ? error.message : "Could not load this workspace."); })
      .finally(() => setDataLoading(false));
  }, [accessToken, role]);

  const title = useMemo(() => {
    if (role === "tpo") return active === "Overview" ? "Institution overview" : active;
    if (role === "recruiter") return active === "Overview" ? "Recruiter overview" : active;
    return active === "Cohort" ? "Mentor cohort" : active;
  }, [active, role]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const toggleShortlist = async (student: Student) => {
    const exists = shortlisted.includes(student.id);
    if (role !== "recruiter" || shortlistBusy !== null) return;
    setShortlistBusy(student.id);
    try {
      const response = await fetch(`${API_URL}/recruiter/shortlist/${student.id}`, { method: exists ? "DELETE" : "POST", credentials: "include", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, ...(exists ? {} : { body: JSON.stringify({ driveId: recruiterScope?.activeDriveId }) }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message ?? "Could not update the shortlist.");
      setShortlisted(current => exists ? current.filter(id => id !== student.id) : [...current, student.id]);
      setRecruiterSummary(current => current ? { ...current, shortlistCount: Math.max(0, current.shortlistCount + (exists ? -1 : 1)) } : current);
      showToast(exists ? `${student.name} removed from the shortlist.` : `${student.name} added to the shortlist.`);
    } catch (error) { showToast(error instanceof Error ? error.message : "Could not update the shortlist."); }
    finally { setShortlistBusy(null); }
  };

  const submitInvite = async (event: FormEvent) => {
    event.preventDefault();
    setInviteLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/invites`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ email: inviteEmail, role: inviteRole, driveIds: [] }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Could not create this invitation.");
      const activationUrl = new URL(payload.activationPath, window.location.origin).toString();
      setInvitations([{ email: inviteEmail, role: inviteRole === "tpo" ? "TPO administrator" : "Faculty", sent: "Just now", status: "Pending", activationUrl }, ...invitations]);
      setInviteOpen(false); setInviteEmail("");
      showToast("Invitation created. Email delivery will begin when the provider is configured.");
    } catch (error) { showToast(error instanceof Error ? error.message : "Could not create this invitation."); }
    finally { setInviteLoading(false); }
  };

  const renderView = () => {
    if (role === "tpo" && active === "Roster") return <RosterView accessToken={accessToken} onToast={showToast} />;
    if (role === "tpo" && active === "Pending students") return <PendingStudentsView accessToken={accessToken} onToast={showToast} />;
    if (role === "tpo" && active === "Access requests") return <div className="tenancy-stack"><MarketplaceRequestQueue accessToken={accessToken} onToast={showToast} /><AccessRequestsView accessToken={accessToken} onToast={showToast} /></div>;
    if (role === "tpo" && active === "Marketplace settings") return <MarketplaceSettingsView accessToken={accessToken} onToast={showToast} />;
    if (role === "recruiter" && active === "Marketplace") return <RecruiterMarketplaceView accessToken={accessToken} onToast={showToast} />;
    if (role === "recruiter" && active === "My requests") return <MyMarketplaceRequestsView accessToken={accessToken} />;
    if (role === "recruiter" && active === "My Institutes") return <MyInstitutesView accessToken={accessToken} onBrowse={() => setActive("Marketplace")} />;
    if (role === "recruiter" && active === "Drive access") return <RecruiterDriveAccessView accessToken={accessToken} onToast={showToast} />;
    if (role === "recruiter" && active === "Overview") return <><MyInstitutesView accessToken={accessToken} onBrowse={() => setActive("Marketplace")} compact />{dataLoading ? <section className="prd-panel prd-data-state"><span className="button-spinner" /><h2>Loading drive-scoped candidates…</h2></section> : dataError ? <section className="prd-panel recruiter-scope-note"><ShieldCheck size={18} /><div><strong>No candidate drive is active yet.</strong><span>Your approved institutes remain visible above. Candidate recommendations appear after a specific drive grant.</span></div></section> : <Overview role={role} students={cohortStudents} summary={cohortSummary} recruiterSummary={recruiterSummary} onView={setSelectedStudent} shortlisted={shortlisted} onShortlist={student => void toggleShortlist(student)} onAction={() => setActive("Candidates")} />}</>;
    if (dataLoading) return <section className="prd-panel prd-data-state"><span className="button-spinner" /><h2>Loading your scoped workspace…</h2><p>Checking permissions and the latest readiness evidence.</p></section>;
    if (dataError) return <section className="prd-panel prd-data-state error"><AlertTriangle size={24} /><h2>We could not load this workspace.</h2><p>{dataError}</p><button onClick={() => window.location.reload()}>Try again</button></section>;
    if (role === "tpo" && active === "Overview") return <Overview role={role} students={cohortStudents} summary={cohortSummary} recruiterSummary={recruiterSummary} onView={setSelectedStudent} shortlisted={shortlisted} onShortlist={student => void toggleShortlist(student)} onAction={() => setActive("Students")} />;
    if (["Students", "Candidates", "Cohort"].includes(active)) return <DirectoryView role={role} students={cohortStudents} search={search} onView={setSelectedStudent} shortlisted={shortlisted} onShortlist={student => void toggleShortlist(student)} onToast={showToast} />;
    if (active === "Shortlist") return <DirectoryView role={role} students={cohortStudents} search={search} onView={setSelectedStudent} shortlisted={shortlisted} onShortlist={student => void toggleShortlist(student)} onlyShortlisted onToast={showToast} />;
    if (active === "Drives") return <DrivesView />;
    if (active === "Invitations") return <InvitationsView invitations={invitations} onInvite={() => setInviteOpen(true)} onToast={showToast} />;
    if (active === "Progress") return <RoleProgressView role={role} summary={cohortSummary} recruiterSummary={recruiterSummary} students={cohortStudents} shortlisted={shortlisted} onAction={() => setActive(role === "tpo" ? "Students" : role === "recruiter" ? "Shortlist" : "At risk")} onToast={showToast} />;
    if (active === "Interviews") return <InterviewsView />;
    if (active === "At risk") return <FacultyProgress students={cohortStudents} onView={setSelectedStudent} />;
    return null;
  };

  const subtitle = role === "tpo" ? "Institution-scoped placement office" : role === "recruiter" ? `${recruiterScope?.companyName || "Recruiter"} · ${recruiterScope?.institutionIds.length ?? 0} institution scope · ${recruiterScope?.driveIds.length ?? 0} drive scope` : "Read-only institution mentor workspace";

  return <div className="prd-shell">
    <button className={`prd-sidebar-scrim ${mobileOpen ? "show" : ""}`} onClick={() => setMobileOpen(false)} aria-label="Close navigation" />
    <aside className={`prd-sidebar ${mobileOpen ? "open" : ""}`}><div className="prd-side-head"><Brand /><button onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={18} /></button></div><span className="prd-nav-label">Workspace</span><nav>{navItems.map((item, index) => { const Icon = navIcons[index] ?? BarChart3; return <button key={item} className={active === item ? "active" : ""} onClick={() => { setActive(item); setMobileOpen(false); }}><Icon size={18} /><span>{item}</span>{item === "Invitations" && invitations.length > 0 && <em>{invitations.length}</em>}{item === "Shortlist" && <em>{shortlisted.length}</em>}</button>; })}</nav><div className="prd-access"><ShieldCheck size={17} /><div><strong>{role === "faculty" ? "Read-only access" : role === "recruiter" ? "Drive-scoped access" : "Institution-scoped"}</strong><span>{role === "faculty" ? "Mutations are denied at the API layer." : "Data scope is enforced by the API."}</span></div></div><button className="prd-user" onClick={onLogout}><i>{initials(user.name)}</i><span><strong>{user.name}</strong><small>{user.email}</small></span><em>Sign out</em></button></aside>
    <main className="prd-main"><header className="prd-topbar"><button className="prd-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={19} /></button><div className="prd-search"><Search size={17} /><input value={search} onChange={event => { const value = event.target.value; setSearch(value); if (value.trim()) setActive(role === "recruiter" ? "Candidates" : role === "faculty" ? "Cohort" : "Students"); }} placeholder={`Search ${role === "recruiter" ? "candidates and skills" : "students and activity"}`} /></div><button className="prd-icon-button" onClick={() => showToast("You’re all caught up—no unread notifications.")} aria-label="Notifications"><Bell size={18} /></button><button className="prd-context" onClick={() => showToast("This context is enforced by your authenticated API scope.")}><Building2 size={15} /><span>Authorized scope</span><ChevronDown size={14} /></button></header><div className="prd-content"><section className="prd-page-head"><div><p>{role === "faculty" ? "Faculty mentor" : role === "tpo" ? "Placement operations" : "Recruiter workspace"}</p><h1>{title}</h1><span>{subtitle}</span></div>{role === "tpo" && <button onClick={() => setInviteOpen(true)}><UserPlus size={16} /> Invite member</button>}{role === "recruiter" && <button onClick={() => { setActive("Shortlist"); showToast("Showing your current shortlist."); }}><UserCheck size={16} /> View shortlist</button>}</section>{role === "faculty" && <div className="prd-readonly"><Eye size={16} /><span><strong>Read-only view.</strong> You can inspect readiness and contact students, but cannot change records.</span></div>}{renderView()}</div></main>
    {selectedStudent && <StudentModal student={selectedStudent} onClose={() => setSelectedStudent(null)} role={role} shortlisted={shortlisted.includes(selectedStudent.id)} onShortlist={student => void toggleShortlist(student)} />}
    {inviteOpen && <div className="prd-modal-layer"><button className="prd-modal-scrim" onClick={() => setInviteOpen(false)} aria-label="Close invite" /><form className="prd-invite-modal" onSubmit={submitInvite}><button type="button" className="prd-close" onClick={() => setInviteOpen(false)} aria-label="Close invitation form"><X size={19} /></button><span className="prd-modal-icon"><UserPlus size={20} /></span><p>Institution invitation</p><h2>Invite a trusted collaborator.</h2><small>Faculty and additional TPOs are tied to this institution. Recruiters request access per drive.</small><label><span>Email address</span><input type="email" required value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="name@institution.edu" /></label><label><span>Account role</span><select value={inviteRole} onChange={event => setInviteRole(event.target.value as "faculty" | "tpo")}><option value="faculty">Faculty — read only</option><option value="tpo">TPO — institution administrator</option></select></label><button className="prd-primary" disabled={inviteLoading}>{inviteLoading ? "Creating invitation…" : <><Send size={15} /> Create invitation</>}</button></form></div>}
    {toast && <div className="prd-toast"><CheckCircle2 size={17} /><span>{toast}</span><button onClick={() => setToast("")}><X size={15} /></button></div>}
  </div>;
}
