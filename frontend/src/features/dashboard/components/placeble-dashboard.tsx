import {
  ArrowRight,
  Bell,
  BookOpenCheck,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  ClipboardCheck,
  Clock3,
  FileText,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  Mic2,
  Moon,
  MoreHorizontal,
  Search,
  Settings,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  Trophy,
  UserRoundSearch,
  UsersRound,
  WandSparkles,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ReadinessScoreRing as ReadinessRing } from "@/src/components/ui/readiness-score-ring";
import { ResumeMaker } from "@/src/features/resume/components/resume-maker";
import { AptitudeTest } from "@/src/features/aptitude/components/aptitude-test";
import { MockInterview } from "@/src/features/interview/components/mock-interview";
import { JobMatching, preloadJobMatching } from "@/src/features/jobs/components/job-matching";
import { CoverLetter } from "@/src/features/cover-letter/components/cover-letter";
import { GroupDiscussion } from "@/src/features/discussion/components/group-discussion";

type View = "Overview" | "Progress" | "Agents" | "Resume Maker" | "Aptitude Test" | "Mock Interview" | "Job Matching" | "Cover Letter" | "Group Discussion" | "Opportunities" | "Applications" | "Profile" | "Settings";

const navItems: { label: View; icon: typeof LayoutDashboard }[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Progress", icon: TrendingUp },
  { label: "Agents", icon: WandSparkles },
  { label: "Opportunities", icon: BriefcaseBusiness },
  { label: "Applications", icon: ClipboardCheck },
];

type ReadinessPayload = { current: { score: number; evidenceCount?: number; components: { resume: number; aptitude: number; interview: number; groupDiscussion: number; careerActivity: number } } | null; history: Array<{ score: number; calculatedAt: string; reason?: string }> };

function buildAgents(readiness: ReadinessPayload | null) {
  const components = readiness?.current?.components;
  return [
  {
    name: "Resume Maker",
    description: "Shape a focused, ATS-ready resume from your profile.",
    icon: FileText,
    status: components?.resume ? `Latest ATS evidence: ${components.resume}` : "No resume evidence yet",
    action: "Improve resume",
    metric: components?.resume ? `ATS ${components.resume}` : "Not started",
    tone: "navy",
  },
  {
    name: "Aptitude Practice",
    description: "Strengthen the topics that are holding your score back.",
    icon: BookOpenCheck,
    status: components?.aptitude ? "Completed assessment available" : "No completed assessment",
    action: "Start practice",
    metric: components?.aptitude ? `${components.aptitude}% latest` : "Not started",
    tone: "amber",
  },
  {
    name: "Mock Interview",
    description: "Practise role-specific answers with measured feedback.",
    icon: Mic2,
    status: components?.interview ? "Completed interview evidence available" : "No completed interview",
    action: "Start interview",
    metric: components?.interview ? `${components.interview}% score` : "Not started",
    tone: "blue",
  },
  {
    name: "Job Matching",
    description: "Find roles where your skills and intent line up.",
    icon: UserRoundSearch,
    status: components?.careerActivity ? "Application activity recorded" : "No application activity",
    action: "See matches",
    metric: components?.careerActivity ? `${components.careerActivity}% activity` : "Explore roles",
    tone: "green",
  },
  {
    name: "Cover Letter",
    description: "Turn a job description into a clear, personal letter.",
    icon: MessageSquareText,
    status: "Create from a real job description",
    action: "Create letter",
    metric: "Open tool",
    tone: "violet",
  },
  {
    name: "Group Discussion",
    description: "Build clarity, confidence, and leadership in a live room.",
    icon: UsersRound,
    status: components?.groupDiscussion ? "Completed discussion evidence available" : "No completed discussion",
    action: "Start discussion",
    metric: components?.groupDiscussion ? `${components.groupDiscussion}% score` : "Not started",
    tone: "slate",
  },
  ];
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="Placeble">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {!compact && <span className="brand-name">placeble</span>}
    </div>
  );
}

function Sidebar({ current, setCurrent, open, setOpen, user, readiness, onProfile, onSettings }: {
  current: View;
  setCurrent: (view: View) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  user: { name: string; email: string };
  readiness: ReadinessPayload | null;
  onProfile: () => void;
  onSettings: () => void;
}) {
  const initials = user.name.split(" ").map(part => part[0]).slice(0, 2).join("").toUpperCase();
  return (
    <>
      <button className={`sidebar-scrim ${open ? "is-visible" : ""}`} onClick={() => setOpen(false)} aria-label="Close menu" />
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <div className="sidebar-top">
          <BrandMark />
          <button className="icon-button sidebar-close" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={20} /></button>
        </div>
        <nav className="primary-nav" aria-label="Main navigation">
          <span className="nav-eyebrow">Workspace</span>
          {navItems.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={`nav-item ${current === label || (["Resume Maker", "Aptitude Test", "Mock Interview", "Job Matching", "Cover Letter", "Group Discussion"].includes(current) && label === "Agents") ? "is-active" : ""}`}
              onClick={() => { setCurrent(label); setOpen(false); }}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <nav className="secondary-nav" aria-label="Secondary navigation">
          <button className={`nav-item ${current === "Profile" ? "is-active" : ""}`} onClick={onProfile}><CircleUserRound size={19} /><span>My profile</span></button>
          <button className={`nav-item ${current === "Settings" ? "is-active" : ""}`} onClick={onSettings}><Settings size={19} /><span>Settings</span></button>
        </nav>
        <div className="sidebar-coach">
          <div className="coach-icon"><Sparkles size={17} /></div>
          <p>Your verified readiness is <strong>{readiness?.current?.score ?? 0}</strong></p>
          <span>{readiness?.current ? "Built only from recorded preparation evidence." : "Complete a coach activity to establish your baseline."}</span>
          <button onClick={() => setCurrent("Agents")}>Open coaches <ArrowRight size={15} /></button>
        </div>
        <div className="sidebar-user">
          <div className="avatar">{initials}</div>
          <div><strong>{user.name}</strong><span>{user.email}</span></div>
          <MoreHorizontal size={18} />
        </div>
      </aside>
    </>
  );
}

function Header({ current, dark, setDark, setMenuOpen, setCurrent, user, onLogout, onProfile, onSettings }: {
  current: View;
  dark: boolean;
  setDark: (dark: boolean) => void;
  setMenuOpen: (open: boolean) => void;
  setCurrent: (view: View) => void;
  user: { name: string };
  onLogout: () => void;
  onProfile: () => void;
  onSettings: () => void;
}) {
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [shortcutLabel, setShortcutLabel] = useState("⌘ K");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const destinations: Array<{ label: string; view: View }> = [...navItems.map(item => ({ label: item.label, view: item.label })), { label: "My profile", view: "Profile" }, { label: "Settings", view: "Settings" }, ...buildAgents(null).map(agent => ({ label: agent.name, view: agent.name === "Aptitude Practice" ? "Aptitude Test" as View : agent.name as View }))];
  const matches = query.trim() ? destinations.filter(item => item.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6) : [];
  const openDestination = (view: View) => { setCurrent(view); setQuery(""); };
  const initials = user.name.split(" ").map(part => part[0]).slice(0, 2).join("").toUpperCase();
  useEffect(() => {
    const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
    const labelTimer = window.setTimeout(() => setShortcutLabel(isMac ? "⌘ K" : "Ctrl K"), 0);
    const focusSearch = (event: KeyboardEvent) => {
      if ((isMac ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => { window.clearTimeout(labelTimer); window.removeEventListener("keydown", focusSearch); };
  }, []);
  return (
    <header className="topbar">
      <div className="topbar-title">
        <button className="icon-button menu-button" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
        <div>
          <span className="mobile-brand"><BrandMark compact /></span>
          <h1>{current}</h1>
        </div>
      </div>
      <div className="topbar-actions">
        <div className="search-box"><Search size={18} /><input ref={searchInputRef} aria-label="Search" placeholder="Search Placeble" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && matches[0]) openDestination(matches[0].view); }} /><kbd>{shortcutLabel}</kbd>{matches.length > 0 && <div className="student-search-results">{matches.map(item => <button key={`${item.label}-${item.view}`} onClick={() => openDestination(item.view)}><Search size={14} />{item.label}<ArrowRight size={14} /></button>)}</div>}</div>
        <button className="icon-button" onClick={() => setDark(!dark)} aria-label={dark ? "Use light mode" : "Use dark mode"}>
          {dark ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        <div className="notification-wrap">
          <button className="icon-button" onClick={() => setNoticesOpen(!noticesOpen)} aria-label="Notifications"><Bell size={19} /></button>
          {noticesOpen && (
            <div className="notification-popover">
              <div><strong>Notifications</strong><button onClick={() => setNoticesOpen(false)}>Mark all read</button></div>
              <article><span className="notice-icon neutral"><Bell size={16} /></span><p><strong>No new notifications</strong><span>Verified updates will appear here when they are available.</span></p></article>
            </div>
          )}
        </div>
        <div className="student-account-wrap"><button className="header-profile" onClick={() => setAccountOpen(!accountOpen)} aria-expanded={accountOpen} aria-label="Open account menu"><div className="avatar small">{initials}</div><span className="header-signout">Account</span><ChevronDown size={14} /></button>{accountOpen && <div className="student-account-menu"><button onClick={() => { setAccountOpen(false); onProfile(); }}><CircleUserRound size={16} /> My profile</button><button onClick={() => { setAccountOpen(false); onSettings(); }}><Settings size={16} /> Settings</button><button onClick={onLogout}><ArrowRight size={16} /> Sign out</button></div>}</div>
      </div>
    </header>
  );
}

function Overview({ setCurrent, readiness, user }: { setCurrent: (view: View) => void; readiness: ReadinessPayload | null; user: { name: string } }) {
  const components = readiness?.current?.components;
  const recommendations: Array<{ title: string; detail: string; view: View; icon: typeof FileText; tone: string }> = [
    components?.resume
      ? { title: "Review your resume evidence", detail: `Your latest recorded ATS score is ${components.resume}.`, view: "Resume Maker", icon: FileText, tone: "amber" }
      : { title: "Create your first resume", detail: "Add real education, skills, and project evidence.", view: "Resume Maker", icon: FileText, tone: "amber" },
    components?.aptitude
      ? { title: "Continue aptitude practice", detail: `Your latest recorded aptitude score is ${components.aptitude}.`, view: "Aptitude Test", icon: BookOpenCheck, tone: "navy" }
      : { title: "Establish an aptitude baseline", detail: "Complete a scored assessment to add aptitude evidence.", view: "Aptitude Test", icon: BookOpenCheck, tone: "navy" },
    components?.interview
      ? { title: "Build on interview feedback", detail: `Your recent interview evidence scores ${components.interview}.`, view: "Mock Interview", icon: Mic2, tone: "blue" }
      : { title: "Complete a mock interview", detail: "Record a completed session to add interview evidence.", view: "Mock Interview", icon: Mic2, tone: "blue" },
  ];
  const coachRows = buildAgents(readiness).slice(0, 4);
  const evidenceHistory = readiness?.history.filter(entry => entry.reason !== "dashboard_refresh") ?? [];
  return (
    <div className="view-content overview-view">
      <section className="welcome-row">
        <div><p className="eyebrow">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p><h2>Good morning, {user.name.split(" ")[0]}.</h2><p>Here’s what will move your preparation forward today.</p></div>
        <button className="button button-secondary" onClick={() => setCurrent("Agents")}><Target size={17} /> View full plan</button>
      </section>

      <section className="readiness-card">
        <div className="readiness-main">
          <div className="score-halo"><ReadinessRing score={readiness?.current?.score ?? 0} /></div>
          <div className="readiness-copy">
            <span className="section-label">Your readiness score</span>
            <h3>{readiness?.current?.evidenceCount ? "Your evidence-based readiness." : "Your baseline starts here."}</h3>
            <p>Your score is calculated from verified preparation activity across every coach.</p>
            <div className="score-change"><TrendingUp size={16} /><strong>{readiness && readiness.history.length > 1 ? `${readiness.current!.score - readiness.history[readiness.history.length - 2].score} points` : "Baseline"}</strong><span>from recorded evidence</span></div>
          </div>
        </div>
        <div className="score-breakdown">
          <div className="breakdown-heading"><span>Score breakdown</span><button onClick={() => setCurrent("Agents")}>How it works <ChevronRight size={15} /></button></div>
          {[["Resume strength",readiness?.current?.components.resume ?? 0],["Aptitude",readiness?.current?.components.aptitude ?? 0],["Interview skills",readiness?.current?.components.interview ?? 0],["Career activity",readiness?.current?.components.careerActivity ?? 0]].map(([label,value]) => <div className="breakdown-row" key={label}><div><span>{label}</span><strong>{value}</strong></div><div className="progress-track"><span style={{ width: `${value}%` }} /></div></div>)}
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="panel today-panel">
          <div className="panel-heading"><div><span className="section-label">Recommended next</span><h3>Actions based on your evidence</h3></div></div>
          <div className="task-list">
            {recommendations.map(({ title, detail, view, icon: Icon, tone }) => <button className="task-item" key={view} onClick={() => setCurrent(view)}>
              <span className="task-check" />
              <span className={`task-icon ${tone}`}><Icon size={18} /></span>
              <span className="task-copy"><strong>{title}</strong><span>{detail}</span></span>
              <ChevronRight className="task-arrow" size={18} />
            </button>)}
          </div>
          <div className="plan-note"><Sparkles size={16} /><span>This plan adapts as your readiness changes.</span></div>
        </div>

        <aside className="panel next-event">
          <div className="panel-heading"><div><span className="section-label">Coming up</span><h3>Next event</h3></div></div>
          <div className="student-empty-state"><span className="student-empty-icon"><CalendarDays size={23} /></span><strong>No scheduled event</strong><span>Your institution has not published an upcoming drive to this account.</span><button onClick={() => setCurrent("Opportunities")}>Explore opportunities <ArrowRight size={15} /></button></div>
        </aside>
      </section>

      <section className="lower-grid">
        <div className="panel agent-glance">
          <div className="panel-heading"><div><span className="section-label">Your coaches</span><h3>Agents at a glance</h3></div><button className="text-button" onClick={() => setCurrent("Agents")}>View all <ArrowRight size={15} /></button></div>
          <div className="mini-agent-grid">
            {coachRows.map(({ name, icon: Icon, status, tone }) => <button key={name} onClick={() => setCurrent("Agents")}><span className={`mini-agent-icon ${tone}`}><Icon size={19} /></span><span><strong>{name}</strong><small>{status}</small></span><ChevronRight size={17} /></button>)}
          </div>
        </div>
        <div className="panel activity-panel">
          <div className="panel-heading"><div><span className="section-label">Progress</span><h3>Recent activity</h3></div></div>
          {evidenceHistory.length ? <div className="activity-list">{evidenceHistory.slice(-3).reverse().map((entry, index) => <div key={`${entry.calculatedAt}-${index}`}><span className="activity-dot success"><Check size={13} /></span><p><strong>Readiness evidence recalculated to {entry.score}</strong><span>{new Date(entry.calculatedAt).toLocaleString("en-IN")}{entry.reason ? ` · ${entry.reason.replaceAll("_", " ")}` : ""}</span></p></div>)}</div> : <div className="student-empty-state compact"><span className="student-empty-icon"><TrendingUp size={22} /></span><strong>No recorded activity yet</strong><span>Completed coach sessions and applications will appear here.</span></div>}
        </div>
      </section>
    </div>
  );
}

function AgentsView({ readiness, onOpenResume, onOpenAptitude, onOpenInterview, onOpenMatching, onOpenCoverLetter, onOpenGroupDiscussion }: { readiness: ReadinessPayload | null; onOpenResume: () => void; onOpenAptitude: () => void; onOpenInterview: () => void; onOpenMatching: () => void; onOpenCoverLetter: () => void; onOpenGroupDiscussion: () => void }) {
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const agentRows = buildAgents(readiness);
  const hasAptitude = Boolean(readiness?.current?.components.aptitude);
  return (
    <div className="view-content inner-view">
      <section className="view-intro"><div><p className="eyebrow">Your preparation toolkit</p><h2>Six coaches. One clear path.</h2><p>Every session contributes to the same readiness score, so your effort stays connected.</p></div><div className="compact-score-card"><ReadinessRing score={readiness?.current?.score ?? 0} compact /><span><strong>{readiness?.current?.score ?? 0} readiness</strong><small>Based on verified activity</small></span></div></section>
      <section className="recommended-strip"><span className="recommend-icon"><Sparkles size={18} /></span><div><strong>{hasAptitude ? "Continue aptitude practice" : "Recommended next: establish an aptitude baseline"}</strong><p>{hasAptitude ? `Your latest recorded aptitude score is ${readiness?.current?.components.aptitude}.` : "No completed aptitude assessment is recorded for this account."}</p></div><button className="button button-progress" onClick={onOpenAptitude}>{hasAptitude ? "Continue practice" : "Start assessment"} <ArrowRight size={16} /></button></section>
      <section className="agent-library">
        {agentRows.map(({ name, description, icon: Icon, status, action, metric, tone }) => (
          <article className="agent-card" key={name}>
            <div className="agent-card-top"><span className={`agent-icon ${tone}`}><Icon size={24} /></span><span className="agent-metric">{metric}</span></div>
            <div><h3>{name}</h3><p>{description}</p></div>
            <div className="agent-status"><span className={`status-dot ${tone}`} />{status}</div>
            <button className="agent-action" onClick={() => name === "Resume Maker" ? onOpenResume() : name === "Aptitude Practice" ? onOpenAptitude() : name === "Mock Interview" ? onOpenInterview() : name === "Job Matching" ? onOpenMatching() : name === "Cover Letter" ? onOpenCoverLetter() : name === "Group Discussion" ? onOpenGroupDiscussion() : setActiveAgent(name)}>{action}<ArrowRight size={16} /></button>
          </article>
        ))}
      </section>
      {activeAgent && <div className="modal-backdrop"><button className="modal-scrim" onClick={() => setActiveAgent(null)} aria-label="Close session dialog" /><div className="agent-modal" role="dialog" aria-modal="true" aria-labelledby="agent-session-title"><button className="modal-close" onClick={() => setActiveAgent(null)} aria-label="Close"><X size={20} /></button><span className="modal-icon"><Sparkles size={22} /></span><p className="eyebrow">Ready when you are</p><h2 id="agent-session-title">{activeAgent}</h2><p>This focused session will use your profile and recent progress to personalise the experience.</p><div className="session-meta"><span><Clock3 size={16} /> About 15 minutes</span><span><TrendingUp size={16} /> Updates readiness</span></div><button className="button button-primary full" onClick={() => setActiveAgent(null)}>Begin session <ArrowRight size={17} /></button><button className="button button-ghost full" onClick={() => setActiveAgent(null)}>Maybe later</button></div></div>}
    </div>
  );
}

function ProgressView({ setCurrent, readiness }: { setCurrent: (view: View) => void; readiness: ReadinessPayload | null }) {
  const [range, setRange] = useState<"8 weeks" | "6 months">("8 weeks");
  const history = readiness?.history.filter(entry => entry.reason !== "dashboard_refresh") ?? [];
  const visibleHistory = history.slice(range === "8 weeks" ? -8 : -12);
  const trendDelta = visibleHistory.length > 1 ? visibleHistory[visibleHistory.length - 1].score - visibleHistory[0].score : 0;
  const readinessComponents = readiness?.current?.components;
  const categories = [
    { label: "Resume strength", value: readinessComponents?.resume ?? 0, change: 0, icon: FileText, note: "Latest ATS evidence" },
    { label: "Aptitude", value: readinessComponents?.aptitude ?? 0, change: 0, icon: BookOpenCheck, note: "Latest completed assessment" },
    { label: "Interview skills", value: readinessComponents?.interview ?? 0, change: 0, icon: Mic2, note: "Average recent interviews" },
    { label: "Career activity", value: readinessComponents?.careerActivity ?? 0, change: 0, icon: BriefcaseBusiness, note: "Application pipeline activity" },
  ];
  const nextActions: Array<[string, string, View]> = [
    [readinessComponents?.resume ? "Review resume evidence" : "Create your first resume", "Resume Maker", "Resume Maker"],
    [readinessComponents?.aptitude ? "Continue aptitude practice" : "Take a baseline assessment", "Aptitude", "Aptitude Test"],
    [readinessComponents?.interview ? "Practise another interview" : "Complete a first mock interview", "Interview", "Mock Interview"],
  ];
  return <div className="view-content inner-view student-progress-view">
    <section className="student-progress-head"><div><p className="eyebrow">Your development over time</p><h2>Progress you can explain—and build on.</h2><p>See what changed your readiness, where momentum is strongest, and what to work on next.</p></div><button className="filter-chip" onClick={() => setRange(range === "8 weeks" ? "6 months" : "8 weeks")}>{range} <ChevronDown size={15} /></button></section>
    <section className="student-progress-hero">
      <div className="student-progress-score"><ReadinessRing score={readiness?.current?.score ?? 0} /><div><span>Overall readiness</span><h3>{(readiness?.current?.score ?? 0) >= 75 ? "Placement-ready momentum" : "Your evidence-based baseline"}</h3><p>This score uses your latest verified resume, aptitude, interview, discussion, and application activity.</p><div className="student-progress-delta"><TrendingUp size={15} /><strong>{readiness?.history.length ?? 0}</strong><span>recorded score updates</span></div></div></div>
      <div className="student-progress-goal"><div><Target size={19} /><span><small>Next milestone</small><strong>80 · Placement ready</strong></span><em>{Math.max(0, 80 - (readiness?.current?.score ?? 0))} points to go</em></div><div className="goal-track"><span style={{ width: `${Math.min(100, (readiness?.current?.score ?? 0) / 80 * 100)}%` }} /></div><p>Complete focused preparation activities to move this score with real evidence.</p></div>
    </section>
    <section className="student-progress-grid">
      <article className="panel progress-trend-card"><header className="panel-heading"><div><span className="section-label">Readiness trend</span><h3>{visibleHistory.length ? `${visibleHistory.length} recorded evidence updates` : "No evidence updates yet"}</h3></div><span className="trend-summary"><TrendingUp size={14} /> {trendDelta >= 0 ? "+" : ""}{trendDelta} pts</span></header>{visibleHistory.length ? <div className="student-line-chart"><div className="chart-axis"><span>100</span><span>75</span><span>50</span><span>0</span></div><div className="chart-plot"><div className="chart-grid-lines" />{visibleHistory.map((entry, index) => <span key={entry.calculatedAt} style={{ left: `${visibleHistory.length === 1 ? 50 : 3 + index * 93 / (visibleHistory.length - 1)}%`, bottom: `${Math.max(4, entry.score)}%` }} data-label={entry.score} title={new Date(entry.calculatedAt).toLocaleString("en-IN")} />)}</div></div> : <div className="student-empty-state"><span className="student-empty-icon"><TrendingUp size={22} /></span><strong>No readiness trend yet</strong><span>Complete a scored coach activity to create your first evidence point.</span></div>}</article>
      <aside className="panel weekly-consistency"><header className="panel-heading"><div><span className="section-label">Evidence</span><h3>Recorded updates</h3></div><strong>{history.length}</strong></header><div className="student-empty-state"><span className="student-empty-icon"><ClipboardCheck size={22} /></span><strong>{history.length ? `${history.length} readiness recalculations` : "No preparation evidence"}</strong><span>Placeble shows only activity saved by this account; it does not estimate streaks or hours.</span></div></aside>
    </section>
    <section className="progress-category-section"><div className="progress-section-title"><div><span className="section-label">Score composition</span><h3>What is moving your readiness</h3></div><button className="text-button" onClick={() => setCurrent("Agents")}>Open your coaches <ArrowRight size={15} /></button></div><div className="progress-category-grid">{categories.map(({ label, value, change, icon: Icon, note }) => <article key={label}><span className="category-icon"><Icon size={19} /></span><div className="category-title"><span>{label}</span><strong>{value}</strong></div><div className="category-track"><span style={{ width: `${value}%` }} /></div><p>{note}</p><em><TrendingUp size={12} /> +{change} pts</em></article>)}</div></section>
    <section className="progress-bottom-grid">
      <article className="panel progress-milestones"><header className="panel-heading"><div><span className="section-label">Milestones</span><h3>Evidence of growth</h3></div></header><div className="milestone-list">{readinessComponents?.resume && readinessComponents.resume >= 75 ? <div className="complete"><i><Check size={14} /></i><p><strong>Resume ATS evidence reached 75</strong><span>Current recorded value: {readinessComponents.resume}</span></p><Trophy size={18} /></div> : null}{readinessComponents?.aptitude && readinessComponents.aptitude >= 70 ? <div className="complete"><i><Check size={14} /></i><p><strong>Aptitude evidence reached 70</strong><span>Current recorded value: {readinessComponents.aptitude}</span></p><Trophy size={18} /></div> : null}<div><i><Target size={14} /></i><p><strong>Reach readiness 80</strong><span>{Math.max(0, 80 - (readiness?.current?.score ?? 0))} points remaining</span></p><Target size={18} /></div></div></article>
      <article className="panel progress-next-actions"><header className="panel-heading"><div><span className="section-label">Next best actions</span><h3>Turn insight into progress</h3></div></header>{nextActions.map(([action, meta, view]) => <button key={action} onClick={() => setCurrent(view)}><i><Clock3 size={14} /></i><p><strong>{action}</strong><span>{meta}</span></p><em>Open coach</em></button>)}</article>
    </section>
  </div>;
}

type StudentProfileForm = { name: string; email: string; degree: string; graduationYear: number; skills: string[]; preferredRoles: string[] };

function StudentProfilePage({ accessToken, onSaved }: { accessToken: string; onSaved: (message: string) => void }) {
  const [profile, setProfile] = useState<StudentProfileForm | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL ?? "https://api.placeble.in/api/v1"}/auth/profile`, { credentials: "include", headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async response => { const payload = await response.json(); if (!response.ok) throw new Error(payload.message ?? "Could not load your profile."); return payload.profile; })
      .then(setProfile).catch(cause => setError(cause instanceof Error ? cause.message : "Could not load your profile."));
  }, [accessToken]);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL ?? "https://api.placeble.in/api/v1"}/auth/profile`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ ...profile, email: undefined }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Could not save your profile.");
      setProfile(payload.profile ?? profile);
      onSaved("Profile changes saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save your profile."); }
    finally { setSaving(false); }
  };
  const completion = profile ? Math.round(([profile.name, profile.degree, profile.graduationYear, profile.skills.length, profile.preferredRoles.length].filter(Boolean).length / 5) * 100) : 0;
  const initials = profile?.name.split(" ").map(part => part[0]).slice(0, 2).join("").toUpperCase() ?? "";
  return <div className="view-content inner-view student-account-page">
    <section className="view-intro"><div><p className="eyebrow">Student profile</p><h2>Your placement identity.</h2><p>Keep the details used by your coaches and opportunity matching accurate.</p></div></section>
    <section className="student-account-grid">
      <form className="panel student-profile-page" onSubmit={save}>
        <header className="student-profile-header"><span className="student-profile-avatar">{initials || <CircleUserRound size={24} />}</span><div><h3>{profile?.name || "Your profile"}</h3><p>{profile?.email || "Loading your account…"}</p></div><span className="student-profile-badge"><Check size={14} /> Verified account</span></header>
        {error && <div className="auth-error">{error}</div>}
        {!profile ? !error && <div className="student-empty-state"><span className="button-spinner" /><strong>Loading profile…</strong><span>Retrieving your verified account details.</span></div> : <div className="student-profile-fields">
          <label><span>Full name</span><input value={profile.name} onChange={event => setProfile({ ...profile, name: event.target.value })} required /></label>
          <label><span>Email address</span><input value={profile.email} disabled /><small>Your sign-in email is managed by your institution.</small></label>
          <div className="student-profile-row"><label><span>Degree or programme</span><input value={profile.degree} onChange={event => setProfile({ ...profile, degree: event.target.value })} required /></label><label><span>Graduation year</span><input type="number" min="2020" max="2100" value={profile.graduationYear} onChange={event => setProfile({ ...profile, graduationYear: Number(event.target.value) })} required /></label></div>
          <label><span>Skills</span><input value={profile.skills.join(", ")} onChange={event => setProfile({ ...profile, skills: event.target.value.split(",").map(value => value.trim()).filter(Boolean) })} required /><small>Separate skills with commas so matching can recognise them.</small></label>
          <label><span>Preferred roles</span><input value={profile.preferredRoles.join(", ")} onChange={event => setProfile({ ...profile, preferredRoles: event.target.value.split(",").map(value => value.trim()).filter(Boolean) })} required /><small>Add the roles you would genuinely consider applying for.</small></label>
          <footer><span><Check size={15} /> Changes update your matching profile.</span><button className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button></footer>
        </div>}
      </form>
      <aside className="student-account-aside">
        <article className="panel profile-completion-card"><div className="profile-completion-ring" style={{ background: `conic-gradient(var(--pb-amber-500) ${completion * 3.6}deg, var(--pb-navy-100) 0deg)` }}><strong>{completion}%</strong></div><div><span className="section-label">Profile strength</span><h3>{completion === 100 ? "Ready for matching" : "Complete your profile"}</h3><p>Accurate skills and role preferences make recommendations more useful.</p></div></article>
        <article className="panel profile-guidance"><span className="student-empty-icon"><Sparkles size={20} /></span><h3>Make your evidence count</h3><p>Use specific skill names, keep your target roles focused, and update this page whenever your direction changes.</p><div><Check size={15} /> Used for job matching</div><div><Check size={15} /> Shared only inside your institution scope</div></article>
      </aside>
    </section>
  </div>;
}

function StudentSettingsPage({ dark, setDark }: { dark: boolean; setDark: (dark: boolean) => void }) {
  const [reducedMotion, setReducedMotion] = useState(() => window.localStorage.getItem("placeble-reduced-motion") === "true");
  const updateMotion = (value: boolean) => { setReducedMotion(value); window.localStorage.setItem("placeble-reduced-motion", String(value)); document.documentElement.dataset.reducedMotion = String(value); };
  return <div className="view-content inner-view student-account-page">
    <section className="view-intro"><div><p className="eyebrow">Preferences</p><h2>Make Placeble feel right.</h2><p>Personalise appearance and accessibility without changing your academic data.</p></div></section>
    <section className="settings-page-grid">
      <article className="panel settings-section"><header><span className="settings-section-icon"><Sun size={20} /></span><div><h3>Appearance</h3><p>Choose the theme that is easiest for you to use.</p></div></header><div className="theme-choice-grid"><button className={!dark ? "active" : ""} onClick={() => setDark(false)}><span className="theme-preview light"><i /><i /><i /></span><strong>Light</strong><small>Bright and focused</small>{!dark && <Check size={17} />}</button><button className={dark ? "active" : ""} onClick={() => setDark(true)}><span className="theme-preview dark"><i /><i /><i /></span><strong>Dark</strong><small>Comfortable in low light</small>{dark && <Check size={17} />}</button></div></article>
      <article className="panel settings-section"><header><span className="settings-section-icon"><Settings size={20} /></span><div><h3>Accessibility</h3><p>Adjust motion while keeping every feature available.</p></div></header><button className="settings-toggle-row" onClick={() => updateMotion(!reducedMotion)} aria-pressed={reducedMotion}><span><strong>Reduce motion</strong><small>Minimises decorative transitions and animated entrances.</small></span><i className={reducedMotion ? "on" : ""}><b /></i></button></article>
      <article className="panel settings-section settings-security"><header><span className="settings-section-icon"><CircleUserRound size={20} /></span><div><h3>Account & privacy</h3><p>Your account stays scoped to your verified institution.</p></div></header><div className="settings-info-row"><span>Profile visibility</span><strong>Institution only</strong></div><div className="settings-info-row"><span>Readiness evidence</span><strong>Verified activity only</strong></div><div className="settings-info-row"><span>Preference storage</span><strong>This device</strong></div></article>
    </section>
  </div>;
}

function BottomNav({ current, setCurrent }: { current: View; setCurrent: (view: View) => void }) {
  return <nav className="bottom-nav" aria-label="Mobile navigation">{navItems.map(({ label, icon: Icon }) => <button key={label} className={current === label || (["Resume Maker", "Aptitude Test", "Mock Interview", "Job Matching", "Cover Letter", "Group Discussion"].includes(current) && label === "Agents") ? "is-active" : ""} onClick={() => setCurrent(label)}><Icon size={20} /><span>{label === "Opportunities" ? "Jobs" : label}</span></button>)}</nav>;
}

export function PlacebleDashboard({ user = { name: "Arjun Kumar", email: "student@placeble.local" }, accessToken = "", onLogout = () => undefined }: { user?: { name: string; email: string; studentVerificationStatus?: "pending_tpo_approval" | "approved" | "rejected" | "roster_matched" | "pending_domain_approval" | null }; accessToken?: string; onLogout?: () => void }) {
  const [current, setCurrent] = useState<View>("Overview");
  const [dark, setDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionNotice, setActionNotice] = useState("");
  const [readiness, setReadiness] = useState<ReadinessPayload | null>(null);
  useEffect(() => {
    if (!accessToken) return;
    const timer = window.setTimeout(() => void preloadJobMatching(accessToken), 350);
    return () => window.clearTimeout(timer);
  }, [accessToken]);
  useEffect(() => {
    if (!accessToken) return;
    fetch(`${import.meta.env.VITE_API_URL ?? "https://api.placeble.in/api/v1"}/readiness/me`, { headers: { Authorization: `Bearer ${accessToken}` }, credentials: "include" })
      .then(response => response.ok ? response.json() : Promise.reject(new Error("Readiness unavailable")))
      .then(setReadiness).catch(() => setReadiness(null));
  }, [accessToken, current]);
  useEffect(() => {
    const preferred = window.localStorage.getItem("placeble-theme");
    const shouldUseDark = preferred === "dark" || (!preferred && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const timer = window.setTimeout(() => setDark(shouldUseDark), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    window.localStorage.setItem("placeble-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = window.localStorage.getItem("placeble-reduced-motion") === "true" ? "true" : "false";
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [current]);
  const view = useMemo(() => {
    if (current === "Overview") return <Overview setCurrent={setCurrent} readiness={readiness} user={user} />;
    if (current === "Progress") return <ProgressView setCurrent={setCurrent} readiness={readiness} />;
    if (current === "Agents") return <AgentsView readiness={readiness} onOpenResume={() => setCurrent("Resume Maker")} onOpenAptitude={() => setCurrent("Aptitude Test")} onOpenInterview={() => setCurrent("Mock Interview")} onOpenMatching={() => setCurrent("Job Matching")} onOpenCoverLetter={() => setCurrent("Cover Letter")} onOpenGroupDiscussion={() => setCurrent("Group Discussion")} />;
    if (current === "Resume Maker") return <ResumeMaker user={user} accessToken={accessToken} onBack={() => setCurrent("Agents")} />;
    if (current === "Aptitude Test") return <AptitudeTest accessToken={accessToken} onBack={() => setCurrent("Agents")} />;
    if (current === "Mock Interview") return <MockInterview accessToken={accessToken} onBack={() => setCurrent("Agents")} />;
    if (current === "Job Matching") return <JobMatching accessToken={accessToken} onBack={() => setCurrent("Agents")} />;
    if (current === "Cover Letter") return <CoverLetter accessToken={accessToken} onBack={() => setCurrent("Agents")} onOpenResume={() => setCurrent("Resume Maker")} />;
    if (current === "Group Discussion") return <GroupDiscussion accessToken={accessToken} onBack={() => setCurrent("Agents")} />;
    if (current === "Opportunities") return <JobMatching accessToken={accessToken} initialSurface="feed" onBack={() => setCurrent("Overview")} />;
    if (current === "Applications") return <JobMatching accessToken={accessToken} initialSurface="tracker" onBack={() => setCurrent("Overview")} />;
    if (current === "Profile") return <StudentProfilePage accessToken={accessToken} onSaved={message => { setActionNotice(message); window.setTimeout(() => setActionNotice(""), 2600); }} />;
    if (current === "Settings") return <StudentSettingsPage dark={dark} setDark={setDark} />;
    return <Overview setCurrent={setCurrent} readiness={readiness} user={user} />;
  }, [current, accessToken, user, readiness, dark]);
  return (
    <div className="app-shell">
      <Sidebar current={current} setCurrent={setCurrent} open={menuOpen} setOpen={setMenuOpen} user={user} readiness={readiness} onProfile={() => { setCurrent("Profile"); setMenuOpen(false); }} onSettings={() => { setCurrent("Settings"); setMenuOpen(false); }} />
      <main className="main-shell">
        <Header current={current} dark={dark} setDark={setDark} setMenuOpen={setMenuOpen} setCurrent={setCurrent} user={user} onLogout={onLogout} onProfile={() => setCurrent("Profile")} onSettings={() => setCurrent("Settings")} />
        {view}
      </main>
      <BottomNav current={current} setCurrent={setCurrent} />
      {actionNotice && <div className="student-action-toast"><Check size={16} /><span>{actionNotice}</span><button onClick={() => setActionNotice("")} aria-label="Dismiss notification"><X size={14} /></button></div>}
    </div>
  );
}
