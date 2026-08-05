"use client";

import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  Filter,
  LayoutDashboard,
  Mail,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserCheck,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type Role = "tpo" | "recruiter" | "faculty";
type User = { name: string; email: string; role: Role };
type Student = {
  id: number;
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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

const students: Student[] = [
  { id: 1, name: "Ananya Rao", email: "ananya.rao@techend.edu.in", branch: "CSE · 2027", readiness: 86, trend: 6, resume: 91, aptitude: 78, interview: 84, status: "Ready", skills: ["React", "Python", "SQL"] },
  { id: 2, name: "Kabir Singh", email: "kabir.singh@techend.edu.in", branch: "IT · 2027", readiness: 79, trend: 3, resume: 82, aptitude: 76, interview: 74, status: "Ready", skills: ["Java", "Spring", "MySQL"] },
  { id: 3, name: "Ishita Das", email: "ishita.das@techend.edu.in", branch: "CSE · 2027", readiness: 71, trend: 2, resume: 77, aptitude: 68, interview: 69, status: "On track", skills: ["JavaScript", "Node.js", "MongoDB"] },
  { id: 4, name: "Rohan Patel", email: "rohan.patel@techend.edu.in", branch: "ECE · 2027", readiness: 63, trend: 0, resume: 69, aptitude: 61, interview: 57, status: "Stalled", skills: ["C++", "Embedded C", "IoT"] },
  { id: 5, name: "Megha Nair", email: "megha.nair@techend.edu.in", branch: "CSE · 2027", readiness: 58, trend: -2, resume: 64, aptitude: 52, interview: 49, status: "At risk", skills: ["Python", "Data analysis", "Excel"] },
  { id: 6, name: "Aditya Jain", email: "aditya.jain@techend.edu.in", branch: "IT · 2027", readiness: 76, trend: 4, resume: 80, aptitude: 73, interview: 71, status: "On track", skills: ["React", "TypeScript", "AWS"] },
  { id: 7, name: "Sara Khan", email: "sara.khan@techend.edu.in", branch: "CSE · 2027", readiness: 82, trend: 5, resume: 87, aptitude: 75, interview: 81, status: "Ready", skills: ["Product analytics", "SQL", "Figma"] },
  { id: 8, name: "Dev Malhotra", email: "dev.malhotra@techend.edu.in", branch: "ME · 2027", readiness: 49, trend: -3, resume: 55, aptitude: 48, interview: 42, status: "At risk", skills: ["AutoCAD", "SolidWorks", "MATLAB"] },
];

const drives = [
  { company: "Infosys", role: "Systems Engineer", date: "12 Aug 2026", applicants: 184, eligible: 146, status: "Registration open", match: 74 },
  { company: "Razorpay", role: "Product Analyst", date: "18 Aug 2026", applicants: 92, eligible: 38, status: "Screening", match: 82 },
  { company: "Freshworks", role: "Graduate Engineer", date: "25 Aug 2026", applicants: 127, eligible: 94, status: "Published", match: 78 },
  { company: "TCS", role: "Digital Cadre", date: "04 Sep 2026", applicants: 0, eligible: 212, status: "Draft", match: 69 },
];

const initialInvites = [
  { email: "nisha@razorpay.com", role: "Recruiter", sent: "02 Aug 2026", status: "Active" },
  { email: "ravi.menon@techend.edu.in", role: "Faculty", sent: "28 Jul 2026", status: "Active" },
  { email: "placements@freshworks.com", role: "Recruiter", sent: "05 Aug 2026", status: "Pending" },
];

const interviews = [
  { candidate: "Ananya Rao", role: "Product Analyst", company: "Razorpay", date: "14 Aug", time: "10:30 AM", mode: "Google Meet", status: "Confirmed" },
  { candidate: "Sara Khan", role: "Product Analyst", company: "Razorpay", date: "14 Aug", time: "11:15 AM", mode: "Google Meet", status: "Confirmed" },
  { candidate: "Kabir Singh", role: "Graduate Engineer", company: "Freshworks", date: "16 Aug", time: "02:00 PM", mode: "Campus", status: "Awaiting" },
];

const navByRole: Record<Role, string[]> = {
  tpo: ["Overview", "Students", "Drives", "Invitations", "Analytics"],
  recruiter: ["Overview", "Candidates", "Shortlist", "Interviews"],
  faculty: ["Cohort", "At risk", "Progress"],
};

const navIcons = [LayoutDashboard, UsersRound, CalendarDays, Send, BarChart3];

function Brand() {
  return <div className="prd-brand"><span><i /><i /><i /></span><strong>placeble</strong></div>;
}

function initials(name: string) {
  return name.split(" ").map(part => part[0]).slice(0, 2).join("").toUpperCase();
}

function StatusPill({ status }: { status: Student["status"] }) {
  return <span className={`prd-status status-${status.toLowerCase().replace(" ", "-")}`}>{status}</span>;
}

function StudentTable({ rows, role, onView, shortlisted, onShortlist }: {
  rows: Student[];
  role: Role;
  onView: (student: Student) => void;
  shortlisted: number[];
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

function Overview({ role, onView, shortlisted, onShortlist, onAction }: {
  role: Role;
  onView: (student: Student) => void;
  shortlisted: number[];
  onShortlist: (student: Student) => void;
  onAction: () => void;
}) {
  const stats = role === "tpo"
    ? [["Cohort readiness", "68", "+4 this month"], ["Placement-ready", "128", "42% of cohort"], ["Active drives", "4", "2 this week"], ["At-risk students", "18", "Needs attention"]]
    : [["Matched candidates", "86", "Current drive"], ["Shortlisted", String(shortlisted.length), "Your active list"], ["Interviews", "8", "Next on 14 Aug"], ["Avg. readiness", "76", "Shortlisted cohort"]];
  return <>
    <section className="prd-stats">{stats.map(([label, value, note], index) => <article key={label}><span className={`tone-${index}`}>{index === 0 ? <TrendingUp size={19} /> : index === 1 ? <UserCheck size={19} /> : index === 2 ? <CalendarDays size={19} /> : <AlertTriangle size={19} />}</span><div><small>{label}</small><strong>{value}</strong><p>{note}</p></div></article>)}</section>
    <section className="prd-overview-grid">
      <article className="prd-panel">
        <header className="prd-panel-head"><div><h2>{role === "tpo" ? "Cohort pulse" : "Recommended candidates"}</h2><p>Updated from today’s readiness signals</p></div><button onClick={onAction}>View all <ArrowRight size={15} /></button></header>
        <StudentTable rows={students.slice(0, 5)} role={role} onView={onView} shortlisted={shortlisted} onShortlist={onShortlist} />
      </article>
      <aside className="prd-insight"><span><Sparkles size={20} /></span><p>{role === "tpo" ? "Recommended action" : "Shortlist insight"}</p><h2>{role === "tpo" ? "18 students have stalled this fortnight." : "Three candidates match every core skill."}</h2><small>{role === "tpo" ? "A focused mentor review can move this group forward." : "They also score above 80 in interview readiness."}</small><button onClick={onAction}>{role === "tpo" ? "Review students" : "Add top matches"}<ArrowRight size={15} /></button></aside>
    </section>
    <section className="prd-secondary-grid"><article className="prd-panel prd-drives-mini"><header className="prd-panel-head"><div><h2>Upcoming schedule</h2><p>Key placement activity this month</p></div></header>{drives.slice(0, 3).map(drive => <div key={drive.company}><span className="prd-company">{drive.company.slice(0, 2).toUpperCase()}</span><p><strong>{drive.company}</strong><small>{drive.role} · {drive.date}</small></p><em>{drive.status}</em></div>)}</article><article className="prd-panel prd-readiness-chart"><header className="prd-panel-head"><div><h2>Readiness distribution</h2><p>Across the active 2027 cohort</p></div></header><div className="prd-bars">{[["0–39",18],["40–59",44],["60–74",86],["75–89",121],["90+",35]].map(([label,value]) => <div key={label}><span style={{ height: `${Number(value) / 1.5}px` }} /><small>{label}</small><b>{value}</b></div>)}</div></article></section>
  </>;
}

function DirectoryView({ role, search, onView, shortlisted, onShortlist, onlyShortlisted = false, onToast }: { role: Role; search: string; onView: (student: Student) => void; shortlisted: number[]; onShortlist: (student: Student) => void; onlyShortlisted?: boolean; onToast: (message: string) => void }) {
  const rows = students.filter(student => (!onlyShortlisted || shortlisted.includes(student.id)) && `${student.name} ${student.branch} ${student.skills.join(" ")}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="prd-panel prd-directory"><header className="prd-panel-head"><div><h2>{onlyShortlisted ? "Your shortlist" : role === "recruiter" ? "Candidate directory" : role === "faculty" ? "Cohort directory" : "Student directory"}</h2><p>{rows.length} profiles match the current filters</p></div><button onClick={() => window.print()}><Download size={15} /> Export</button></header><div className="prd-filter-row"><button onClick={() => onToast("Branch filter opened. All branches are selected in this demo.")}><Filter size={14} /> Branch: All <ChevronDown size={13} /></button><button onClick={() => onToast("Showing every readiness band.")}>Readiness: All <ChevronDown size={13} /></button><button onClick={() => onToast("Showing every preparation status.")}>Status: All <ChevronDown size={13} /></button></div><StudentTable rows={rows} role={role} onView={onView} shortlisted={shortlisted} onShortlist={onShortlist} /></section>;
}

function DrivesView({ onToast }: { onToast: (message: string) => void }) {
  return <section className="prd-card-grid">{drives.map(drive => <article className="prd-drive-card" key={drive.company}><header><span>{drive.company.slice(0, 2).toUpperCase()}</span><em>{drive.status}</em></header><p>{drive.company}</p><h2>{drive.role}</h2><div className="prd-drive-meta"><span><CalendarDays size={14} /> {drive.date}</span><span><UsersRound size={14} /> {drive.applicants} applicants</span></div><div className="prd-drive-numbers"><div><small>Eligible</small><strong>{drive.eligible}</strong></div><div><small>Avg. match</small><strong>{drive.match}%</strong></div></div><button onClick={() => onToast(`${drive.company} drive workspace opened.`)}>Manage drive <ArrowRight size={15} /></button></article>)}<button className="prd-add-card" onClick={() => onToast("New drive draft created. Add the role details when ready.")}><Plus size={23} /><strong>Create a drive</strong><span>Set eligibility, dates, and recruiter access.</span></button></section>;
}

function AnalyticsView() {
  const [range, setRange] = useState("Last 12 weeks");
  return <div className="prd-analytics"><section className="prd-panel prd-wide-chart"><header className="prd-panel-head"><div><h2>Readiness trend</h2><p>Weekly cohort average · May to August 2026</p></div><button onClick={() => setRange(range === "Last 12 weeks" ? "Last 6 months" : "Last 12 weeks")}>{range} <ChevronDown size={14} /></button></header><div className="prd-line-chart"><div className="line-y"><span>80</span><span>70</span><span>60</span><span>50</span></div><div className="line-plot"><i style={{ left: "3%", bottom: "22%" }} /><i style={{ left: "21%", bottom: "31%" }} /><i style={{ left: "39%", bottom: "42%" }} /><i style={{ left: "57%", bottom: "47%" }} /><i style={{ left: "75%", bottom: "62%" }} /><i style={{ left: "93%", bottom: "72%" }} /><b /></div></div></section><section className="prd-analytics-row"><article className="prd-panel"><header className="prd-panel-head"><div><h2>Skill gaps</h2><p>Most common across active applicants</p></div></header><div className="prd-skill-gaps">{[["System design",64],["Data interpretation",57],["Business communication",46],["Advanced SQL",39],["Problem solving",34]].map(([skill,value]) => <div key={skill}><span>{skill}<b>{value} students</b></span><i><b style={{ width: `${value}%` }} /></i></div>)}</div></article><article className="prd-panel"><header className="prd-panel-head"><div><h2>Placement funnel</h2><p>Current academic year</p></div></header><div className="prd-funnel">{[["Eligible",304],["Applied",246],["Shortlisted",112],["Interviewed",68],["Placed",41]].map(([label,value],index) => <div key={label} style={{ width: `${100 - index * 11}%` }}><span>{label}</span><strong>{value}</strong></div>)}</div></article></section></div>;
}

function InterviewsView({ onToast }: { onToast: (message: string) => void }) {
  return <section className="prd-panel"><header className="prd-panel-head"><div><h2>Interview schedule</h2><p>Three upcoming conversations</p></div><button onClick={() => onToast("The scheduling form is ready for a new interview.")}><Plus size={15} /> Schedule interview</button></header><div className="prd-interviews">{interviews.map(item => <article key={item.candidate}><div className="prd-date"><strong>{item.date.split(" ")[0]}</strong><span>{item.date.split(" ")[1]}</span></div><div><p>{item.candidate}</p><strong>{item.role}</strong><span>{item.company} · {item.mode}</span></div><div><Clock3 size={14} /> {item.time}</div><em>{item.status}</em><button onClick={() => onToast(`Interview details for ${item.candidate} opened.`)}><MoreHorizontal size={17} /></button></article>)}</div></section>;
}

function InvitationsView({ invitations, onInvite, onToast }: { invitations: typeof initialInvites; onInvite: () => void; onToast: (message: string) => void }) {
  return <section className="prd-panel"><header className="prd-panel-head"><div><h2>Invited accounts</h2><p>Recruiter and faculty access tied to your institution</p></div><button onClick={onInvite}><UserPlus size={15} /> Send invitation</button></header><div className="prd-invites"><div className="prd-invite-head"><span>Email</span><span>Role</span><span>Sent</span><span>Status</span><span /></div>{invitations.map(invite => <div key={invite.email}><span><i><Mail size={15} /></i>{invite.email}</span><span>{invite.role}</span><span>{invite.sent}</span><span><em className={invite.status === "Active" ? "active" : "pending"}>{invite.status}</em></span><span><button onClick={() => onToast(invite.status === "Pending" ? `Invitation resent to ${invite.email}.` : `${invite.email} access details opened.`)}>{invite.status === "Pending" ? "Resend" : "View"}</button></span></div>)}</div></section>;
}

function FacultyProgress({ onView }: { onView: (student: Student) => void }) {
  return <section className="prd-progress-grid"><article className="prd-panel"><header className="prd-panel-head"><div><h2>Mentor follow-ups</h2><p>Prioritised by stalled or declining readiness</p></div></header><div className="prd-followups">{students.filter(student => student.status === "At risk" || student.status === "Stalled").map(student => <button key={student.id} onClick={() => onView(student)}><span>{initials(student.name)}</span><p><strong>{student.name}</strong><small>{student.status === "At risk" ? "Readiness declined this week" : "No score movement in 14 days"}</small></p><em>{student.readiness}</em><ChevronRight size={16} /></button>)}</div></article><article className="prd-panel prd-mentor-notes"><header className="prd-panel-head"><div><h2>Suggested conversation</h2><p>For your next cohort check-in</p></div></header><span><MessageSquareText size={20} /></span><h3>“What is one preparation task that feels unclear right now?”</h3><p>A focused question can uncover whether the blocker is skill, confidence, or simply not knowing the next step.</p><button onClick={() => navigator.clipboard?.writeText("What is one preparation task that feels unclear right now?")}>Copy prompt</button></article></section>;
}

function StudentModal({ student, onClose, role, shortlisted, onShortlist }: { student: Student; onClose: () => void; role: Role; shortlisted: boolean; onShortlist: (student: Student) => void }) {
  return <div className="prd-modal-layer"><button className="prd-modal-scrim" onClick={onClose} aria-label="Close profile" /><section className="prd-profile-modal" role="dialog" aria-modal="true"><header><div className="prd-profile-avatar">{initials(student.name)}</div><div><span>{student.branch}</span><h2>{student.name}</h2><p>{student.email}</p></div><button onClick={onClose}><X size={19} /></button></header><div className="prd-profile-score"><div className="prd-profile-ring"><span>{student.readiness}</span></div><div><small>Overall readiness</small><h3>{student.status === "Ready" ? "Strong placement readiness" : student.status === "At risk" ? "Focused support recommended" : "Steady preparation in progress"}</h3><StatusPill status={student.status} /></div></div><div className="prd-subscore-grid">{[["Resume",student.resume],["Aptitude",student.aptitude],["Interview",student.interview]].map(([label,value]) => <div key={label}><span>{label}<strong>{value}</strong></span><i><b style={{ width: `${value}%` }} /></i></div>)}</div><div className="prd-profile-section"><span>Demonstrated skills</span><div>{student.skills.map(skill => <em key={skill}>{skill}</em>)}</div></div><div className="prd-profile-section"><span>Latest activity</span><p><CheckCircle2 size={15} /> Completed a 20-minute interview practice session yesterday.</p></div><footer>{role === "faculty" ? <button className="prd-secondary" onClick={() => window.location.href = `mailto:${student.email}`}><Mail size={15} /> Email student</button> : role === "recruiter" ? <button className="prd-primary" onClick={() => onShortlist(student)}>{shortlisted ? <><Check size={15} /> Shortlisted</> : <><Plus size={15} /> Add to shortlist</>}</button> : <button className="prd-primary" onClick={() => window.location.href = `mailto:${student.email}`}><MessageSquareText size={15} /> Contact student</button>}<button className="prd-secondary" onClick={onClose}>Close</button></footer></section></div>;
}

export function ProfessionalRoleDashboard({ user, accessToken, onLogout }: { user: User; accessToken: string; onLogout: () => void }) {
  const role = user.role;
  const navItems = navByRole[role];
  const [active, setActive] = useState(navItems[0]);
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [shortlisted, setShortlisted] = useState<number[]>([1, 7]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"recruiter" | "faculty">("recruiter");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [invitations, setInvitations] = useState(initialInvites);
  const [toast, setToast] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const title = useMemo(() => {
    if (role === "tpo") return active === "Overview" ? "Institution overview" : active;
    if (role === "recruiter") return active === "Overview" ? "August campus drive" : active;
    return active === "Cohort" ? "CSE 2027 cohort" : active;
  }, [active, role]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const toggleShortlist = (student: Student) => {
    const exists = shortlisted.includes(student.id);
    setShortlisted(exists ? shortlisted.filter(id => id !== student.id) : [...shortlisted, student.id]);
    showToast(exists ? `${student.name} removed from the shortlist.` : `${student.name} added to the shortlist.`);
  };

  const submitInvite = async (event: FormEvent) => {
    event.preventDefault();
    setInviteLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/invites`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ email: inviteEmail, role: inviteRole, driveIds: inviteRole === "recruiter" ? ["campus-drive-aug-2026"] : [] }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Could not create this invitation.");
      setInvitations([{ email: inviteEmail, role: inviteRole === "recruiter" ? "Recruiter" : "Faculty", sent: "Just now", status: "Pending" }, ...invitations]);
      setInviteOpen(false); setInviteEmail("");
      showToast("Invitation created. Email delivery will begin when the provider is configured.");
    } catch (error) { showToast(error instanceof Error ? error.message : "Could not create this invitation."); }
    finally { setInviteLoading(false); }
  };

  const renderView = () => {
    if ((role === "tpo" && active === "Overview") || (role === "recruiter" && active === "Overview")) return <Overview role={role} onView={setSelectedStudent} shortlisted={shortlisted} onShortlist={toggleShortlist} onAction={() => setActive(role === "tpo" ? "Students" : "Candidates")} />;
    if (["Students", "Candidates", "Cohort"].includes(active)) return <DirectoryView role={role} search={search} onView={setSelectedStudent} shortlisted={shortlisted} onShortlist={toggleShortlist} onToast={showToast} />;
    if (active === "Shortlist") return <DirectoryView role={role} search={search} onView={setSelectedStudent} shortlisted={shortlisted} onShortlist={toggleShortlist} onlyShortlisted onToast={showToast} />;
    if (active === "Drives") return <DrivesView onToast={showToast} />;
    if (active === "Invitations") return <InvitationsView invitations={invitations} onInvite={() => setInviteOpen(true)} onToast={showToast} />;
    if (active === "Analytics" || active === "Progress") return <AnalyticsView />;
    if (active === "Interviews") return <InterviewsView onToast={showToast} />;
    if (active === "At risk") return <FacultyProgress onView={setSelectedStudent} />;
    return null;
  };

  const subtitle = role === "tpo" ? "TechEnd Institute of Technology · Placement Office" : role === "recruiter" ? "Razorpay · Product Analyst hiring drive" : "Read-only mentor workspace · TechEnd Institute";

  return <div className="prd-shell">
    <button className={`prd-sidebar-scrim ${mobileOpen ? "show" : ""}`} onClick={() => setMobileOpen(false)} aria-label="Close navigation" />
    <aside className={`prd-sidebar ${mobileOpen ? "open" : ""}`}><div className="prd-side-head"><Brand /><button onClick={() => setMobileOpen(false)}><X size={18} /></button></div><span className="prd-nav-label">Workspace</span><nav>{navItems.map((item, index) => { const Icon = navIcons[index] ?? BarChart3; return <button key={item} className={active === item ? "active" : ""} onClick={() => { setActive(item); setMobileOpen(false); }}><Icon size={18} /><span>{item}</span>{item === "Invitations" && <em>1</em>}{item === "Shortlist" && <em>{shortlisted.length}</em>}</button>; })}</nav><div className="prd-access"><ShieldCheck size={17} /><div><strong>{role === "faculty" ? "Read-only access" : role === "recruiter" ? "Drive-scoped access" : "Institution-scoped"}</strong><span>{role === "faculty" ? "All updates are disabled at the API layer." : "Data is restricted to TechEnd Institute."}</span></div></div><button className="prd-user" onClick={onLogout}><i>{initials(user.name)}</i><span><strong>{user.name}</strong><small>{user.email}</small></span><em>Sign out</em></button></aside>
    <main className="prd-main"><header className="prd-topbar"><button className="prd-menu" onClick={() => setMobileOpen(true)}><Menu size={19} /></button><div className="prd-search"><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder={`Search ${role === "recruiter" ? "candidates and skills" : "students and activity"}`} /></div><button className="prd-icon-button" onClick={() => showToast("You’re all caught up—no unread notifications.")}><Bell size={18} /></button><button className="prd-context" onClick={() => showToast("Institution context is fixed for this demo account.")}><Building2 size={15} /><span>TechEnd Institute</span><ChevronDown size={14} /></button></header><div className="prd-content"><section className="prd-page-head"><div><p>{role === "faculty" ? "Faculty mentor" : role === "tpo" ? "Placement operations" : "Recruiter workspace"}</p><h1>{title}</h1><span>{subtitle}</span></div>{role === "tpo" && <button onClick={() => setInviteOpen(true)}><UserPlus size={16} /> Invite member</button>}{role === "recruiter" && <button onClick={() => { setActive("Shortlist"); showToast("Showing your current shortlist."); }}><UserCheck size={16} /> View shortlist</button>}</section>{role === "faculty" && <div className="prd-readonly"><Eye size={16} /><span><strong>Read-only view.</strong> You can inspect readiness and contact students, but cannot change records.</span></div>}{renderView()}</div></main>
    {selectedStudent && <StudentModal student={selectedStudent} onClose={() => setSelectedStudent(null)} role={role} shortlisted={shortlisted.includes(selectedStudent.id)} onShortlist={toggleShortlist} />}
    {inviteOpen && <div className="prd-modal-layer"><button className="prd-modal-scrim" onClick={() => setInviteOpen(false)} aria-label="Close invite" /><form className="prd-invite-modal" onSubmit={submitInvite}><button type="button" className="prd-close" onClick={() => setInviteOpen(false)}><X size={19} /></button><span className="prd-modal-icon"><UserPlus size={20} /></span><p>Institution invitation</p><h2>Invite a trusted collaborator.</h2><small>Access is tied to TechEnd Institute and enforced by the API.</small><label><span>Email address</span><input type="email" required value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="name@company.com" /></label><label><span>Account role</span><select value={inviteRole} onChange={event => setInviteRole(event.target.value as "recruiter" | "faculty")}><option value="recruiter">Recruiter — drive scoped</option><option value="faculty">Faculty — read only</option></select></label><button className="prd-primary" disabled={inviteLoading}>{inviteLoading ? "Creating invitation…" : <><Send size={15} /> Create invitation</>}</button></form></div>}
    {toast && <div className="prd-toast"><CheckCircle2 size={17} /><span>{toast}</span><button onClick={() => setToast("")}><X size={15} /></button></div>}
  </div>;
}
