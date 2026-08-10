"use client";

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
import { useEffect, useMemo, useState } from "react";
import { ReadinessScoreRing as ReadinessRing } from "./readiness-score-ring";
import { ResumeMaker } from "./resume-maker";
import { AptitudeTest } from "./aptitude-test";
import { MockInterview } from "./mock-interview";
import { JobMatching } from "./job-matching";
import { CoverLetter } from "./cover-letter";
import { GroupDiscussion } from "./group-discussion";

type View = "Overview" | "Progress" | "Agents" | "Resume Maker" | "Aptitude Test" | "Mock Interview" | "Job Matching" | "Cover Letter" | "Group Discussion" | "Opportunities" | "Applications";

const navItems: { label: View; icon: typeof LayoutDashboard }[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Progress", icon: TrendingUp },
  { label: "Agents", icon: WandSparkles },
  { label: "Opportunities", icon: BriefcaseBusiness },
  { label: "Applications", icon: ClipboardCheck },
];

const agents = [
  {
    name: "Resume Maker",
    description: "Shape a focused, ATS-ready resume from your profile.",
    icon: FileText,
    status: "Resume at 78%",
    action: "Improve resume",
    metric: "ATS 78",
    tone: "navy",
  },
  {
    name: "Aptitude Practice",
    description: "Strengthen the topics that are holding your score back.",
    icon: BookOpenCheck,
    status: "12 questions due",
    action: "Start practice",
    metric: "64% avg.",
    tone: "amber",
  },
  {
    name: "Mock Interview",
    description: "Practise role-specific answers with measured feedback.",
    icon: Mic2,
    status: "Last session 4d ago",
    action: "Start interview",
    metric: "3 sessions",
    tone: "blue",
  },
  {
    name: "Job Matching",
    description: "Find roles where your skills and intent line up.",
    icon: UserRoundSearch,
    status: "8 new matches",
    action: "See matches",
    metric: "86% best",
    tone: "green",
  },
  {
    name: "Cover Letter",
    description: "Turn a job description into a clear, personal letter.",
    icon: MessageSquareText,
    status: "Ready when you are",
    action: "Create letter",
    metric: "2 drafts",
    tone: "violet",
  },
  {
    name: "Group Discussion",
    description: "Build clarity, confidence, and leadership in a live room.",
    icon: UsersRound,
    status: "Observer scorecard ready",
    action: "Start discussion",
    metric: "1 session",
    tone: "slate",
  },
];

const jobs = [
  {
    company: "Razorpay",
    initials: "RZ",
    role: "Associate Product Analyst",
    meta: "Bengaluru · Full-time · ₹8–10 LPA",
    match: 86,
    skills: ["SQL", "Product thinking"],
    missing: "Tableau",
  },
  {
    company: "Freshworks",
    initials: "FW",
    role: "Graduate Software Engineer",
    meta: "Chennai · Hybrid · ₹7–9 LPA",
    match: 82,
    skills: ["React", "JavaScript"],
    missing: "System design",
  },
  {
    company: "Meesho",
    initials: "ME",
    role: "Business Analyst — Campus",
    meta: "Bengaluru · Full-time · ₹9–12 LPA",
    match: 79,
    skills: ["Analytics", "Communication"],
    missing: "Advanced Excel",
  },
];

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

function Sidebar({ current, setCurrent, open, setOpen, user }: {
  current: View;
  setCurrent: (view: View) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  user: { name: string; email: string };
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
              {label === "Opportunities" && <span className="nav-count">8</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <nav className="secondary-nav" aria-label="Secondary navigation">
          <button className="nav-item"><CircleUserRound size={19} /><span>My profile</span><span className="profile-completion">84%</span></button>
          <button className="nav-item"><Settings size={19} /><span>Settings</span></button>
        </nav>
        <div className="sidebar-coach">
          <div className="coach-icon"><Sparkles size={17} /></div>
          <p>Your profile is <strong>84% complete</strong></p>
          <span>Add one project to improve your matches.</span>
          <button onClick={() => setCurrent("Agents")}>Complete profile <ArrowRight size={15} /></button>
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

function Header({ current, dark, setDark, setMenuOpen, user, onLogout }: {
  current: View;
  dark: boolean;
  setDark: (dark: boolean) => void;
  setMenuOpen: (open: boolean) => void;
  user: { name: string };
  onLogout: () => void;
}) {
  const [noticesOpen, setNoticesOpen] = useState(false);
  const initials = user.name.split(" ").map(part => part[0]).slice(0, 2).join("").toUpperCase();
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
        <div className="search-box"><Search size={18} /><input aria-label="Search" placeholder="Search Placeble" /><kbd>⌘ K</kbd></div>
        <button className="icon-button" onClick={() => setDark(!dark)} aria-label={dark ? "Use light mode" : "Use dark mode"}>
          {dark ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        <div className="notification-wrap">
          <button className="icon-button" onClick={() => setNoticesOpen(!noticesOpen)} aria-label="Notifications"><Bell size={19} /><span className="notification-dot" /></button>
          {noticesOpen && (
            <div className="notification-popover">
              <div><strong>Notifications</strong><button onClick={() => setNoticesOpen(false)}>Mark all read</button></div>
              <article><span className="notice-icon"><TrendingUp size={16} /></span><p><strong>Your readiness moved up 4 points</strong><span>Resume improvements made the difference.</span><time>2h ago</time></p></article>
              <article><span className="notice-icon neutral"><BriefcaseBusiness size={16} /></span><p><strong>8 new roles match your profile</strong><span>Three have an 80%+ match.</span><time>Yesterday</time></p></article>
            </div>
          )}
        </div>
        <button className="header-profile" onClick={onLogout} title="Sign out"><div className="avatar small">{initials}</div><span className="header-signout">Sign out</span></button>
      </div>
    </header>
  );
}

function Overview({ setCurrent }: { setCurrent: (view: View) => void }) {
  const [tasks, setTasks] = useState([false, false, false]);
  const completed = tasks.filter(Boolean).length;
  const toggleTask = (index: number) => setTasks(tasks.map((task, i) => i === index ? !task : task));
  return (
    <div className="view-content overview-view">
      <section className="welcome-row">
        <div><p className="eyebrow">Wednesday, 5 August</p><h2>Good morning, Arjun.</h2><p>Here’s what will move your preparation forward today.</p></div>
        <button className="button button-secondary" onClick={() => setCurrent("Agents")}><Target size={17} /> View full plan</button>
      </section>

      <section className="readiness-card">
        <div className="readiness-main">
          <div className="score-halo"><ReadinessRing score={72 + completed} /></div>
          <div className="readiness-copy">
            <span className="section-label">Your readiness score</span>
            <h3>You’re building strong momentum.</h3>
            <p>Complete today’s plan to reach <strong>{75 + completed}</strong> and move into the interview-ready band.</p>
            <div className="score-change"><TrendingUp size={16} /><strong>+4 points</strong><span>in the last 14 days</span></div>
          </div>
        </div>
        <div className="score-breakdown">
          <div className="breakdown-heading"><span>Score breakdown</span><button onClick={() => setCurrent("Agents")}>How it works <ChevronRight size={15} /></button></div>
          <div className="breakdown-row"><div><span>Resume strength</span><strong>78</strong></div><div className="progress-track"><span style={{ width: "78%" }} /></div></div>
          <div className="breakdown-row"><div><span>Aptitude</span><strong>64</strong></div><div className="progress-track"><span style={{ width: "64%" }} /></div></div>
          <div className="breakdown-row"><div><span>Interview skills</span><strong>71</strong></div><div className="progress-track"><span style={{ width: "71%" }} /></div></div>
          <div className="breakdown-row"><div><span>Career activity</span><strong>75</strong></div><div className="progress-track"><span style={{ width: "75%" }} /></div></div>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="panel today-panel">
          <div className="panel-heading"><div><span className="section-label">Focus for today</span><h3>Your next three steps</h3></div><span className="task-count">{completed}/3 complete</span></div>
          <div className="task-list">
            <button className={`task-item ${tasks[0] ? "is-complete" : ""}`} onClick={() => toggleTask(0)}>
              <span className="task-check">{tasks[0] && <Check size={15} />}</span>
              <span className="task-icon amber"><FileText size={18} /></span>
              <span className="task-copy"><strong>Sharpen your project impact</strong><span>Add measurable outcomes to your second project.</span></span>
              <span className="task-time"><Clock3 size={14} /> 8 min</span><ChevronRight className="task-arrow" size={18} />
            </button>
            <button className={`task-item ${tasks[1] ? "is-complete" : ""}`} onClick={() => toggleTask(1)}>
              <span className="task-check">{tasks[1] && <Check size={15} />}</span>
              <span className="task-icon navy"><BookOpenCheck size={18} /></span>
              <span className="task-copy"><strong>Practise data interpretation</strong><span>12 questions selected from your weak areas.</span></span>
              <span className="task-time"><Clock3 size={14} /> 15 min</span><ChevronRight className="task-arrow" size={18} />
            </button>
            <button className={`task-item ${tasks[2] ? "is-complete" : ""}`} onClick={() => toggleTask(2)}>
              <span className="task-check">{tasks[2] && <Check size={15} />}</span>
              <span className="task-icon blue"><Mic2 size={18} /></span>
              <span className="task-copy"><strong>Answer one interview prompt</strong><span>Tell me about a challenging team project.</span></span>
              <span className="task-time"><Clock3 size={14} /> 10 min</span><ChevronRight className="task-arrow" size={18} />
            </button>
          </div>
          <div className="plan-note"><Sparkles size={16} /><span>This plan adapts as your readiness changes.</span></div>
        </div>

        <aside className="panel next-event">
          <div className="panel-heading"><div><span className="section-label">Coming up</span><h3>Next event</h3></div><button className="text-button">View calendar</button></div>
          <div className="event-date"><span>12</span><small>AUG</small></div>
          <div className="event-details"><span className="event-type">Campus drive</span><h4>Infosys hiring briefing</h4><p><CalendarDays size={15} /> Tuesday · 3:00 PM</p><p><UsersRound size={15} /> Main seminar hall</p></div>
          <div className="event-readiness"><div><span>Your drive readiness</span><strong>68%</strong></div><div className="progress-track"><span style={{ width: "68%" }} /></div><p>Finish two recommendations before the drive.</p></div>
          <button className="button button-primary full">Prepare for this drive <ArrowRight size={17} /></button>
        </aside>
      </section>

      <section className="lower-grid">
        <div className="panel agent-glance">
          <div className="panel-heading"><div><span className="section-label">Your coaches</span><h3>Agents at a glance</h3></div><button className="text-button" onClick={() => setCurrent("Agents")}>View all <ArrowRight size={15} /></button></div>
          <div className="mini-agent-grid">
            {agents.slice(0, 4).map(({ name, icon: Icon, status, tone }) => <button key={name} onClick={() => setCurrent("Agents")}><span className={`mini-agent-icon ${tone}`}><Icon size={19} /></span><span><strong>{name}</strong><small>{status}</small></span><ChevronRight size={17} /></button>)}
          </div>
        </div>
        <div className="panel activity-panel">
          <div className="panel-heading"><div><span className="section-label">Progress</span><h3>Recent activity</h3></div></div>
          <div className="activity-list">
            <div><span className="activity-dot success"><Check size={13} /></span><p><strong>Resume score improved to 78</strong><span>Today · Resume Maker</span></p><b>+3</b></div>
            <div><span className="activity-dot"><BookOpenCheck size={14} /></span><p><strong>Quantitative practice completed</strong><span>Yesterday · Aptitude</span></p><b>+1</b></div>
            <div><span className="activity-dot muted"><BriefcaseBusiness size={14} /></span><p><strong>Applied to Product Analyst</strong><span>2 days ago · Razorpay</span></p></div>
          </div>
        </div>
      </section>
    </div>
  );
}

function AgentsView({ onOpenResume, onOpenAptitude, onOpenInterview, onOpenMatching, onOpenCoverLetter, onOpenGroupDiscussion }: { onOpenResume: () => void; onOpenAptitude: () => void; onOpenInterview: () => void; onOpenMatching: () => void; onOpenCoverLetter: () => void; onOpenGroupDiscussion: () => void }) {
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  return (
    <div className="view-content inner-view">
      <section className="view-intro"><div><p className="eyebrow">Your preparation toolkit</p><h2>Six coaches. One clear path.</h2><p>Every session contributes to the same readiness score, so your effort stays connected.</p></div><div className="compact-score-card"><ReadinessRing score={72} compact /><span><strong>72 readiness</strong><small>4 points this fortnight</small></span></div></section>
      <section className="recommended-strip"><span className="recommend-icon"><Sparkles size={18} /></span><div><strong>Recommended next: Aptitude Practice</strong><p>Data interpretation is your clearest opportunity to improve this week.</p></div><button className="button button-progress" onClick={onOpenAptitude}>Start 15-min practice <ArrowRight size={16} /></button></section>
      <section className="agent-library">
        {agents.map(({ name, description, icon: Icon, status, action, metric, tone }) => (
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

function OpportunitiesView({ setCurrent }: { setCurrent: (view: View) => void }) {
  const [saved, setSaved] = useState<string[]>([]);
  return (
    <div className="view-content inner-view">
      <section className="view-intro"><div><p className="eyebrow">Matched to your profile</p><h2>Roles worth your attention.</h2><p>Clear matches, honest gaps, and no black-box recommendations.</p></div><div className="opportunity-summary"><strong>21</strong><span>active matches<br/><small>8 added this week</small></span></div></section>
      <div className="filter-bar"><div className="search-box wide"><Search size={18} /><input placeholder="Search roles or companies" /></div><button className="filter-chip">Location <ChevronDown size={15} /></button><button className="filter-chip">Role type <ChevronDown size={15} /></button><button className="filter-chip">Match: 70%+ <ChevronDown size={15} /></button></div>
      <section className="jobs-list">
        {jobs.map(job => (
          <article className="job-card" key={job.company}>
            <div className="job-brand">{job.initials}</div>
            <div className="job-main"><span className="job-company">{job.company}</span><h3>{job.role}</h3><p>{job.meta}</p><div className="skill-row">{job.skills.map(skill => <span key={skill} className="skill matched"><Check size={13} /> {skill}</span>)}<span className="skill missing">Build: {job.missing}</span></div></div>
            <div className="job-match"><ReadinessRing score={job.match} compact /><span><strong>{job.match}% match</strong><small>Strong fit</small></span></div>
            <div className="job-actions"><button className={`save-button ${saved.includes(job.company) ? "is-saved" : ""}`} onClick={() => setSaved(saved.includes(job.company) ? saved.filter(item => item !== job.company) : [...saved, job.company])}>{saved.includes(job.company) ? "Saved" : "Save"}</button><button className="button button-primary" onClick={() => setCurrent("Applications")}>View role <ArrowRight size={16} /></button></div>
          </article>
        ))}
      </section>
    </div>
  );
}

function ProgressView({ setCurrent }: { setCurrent: (view: View) => void }) {
  const [range, setRange] = useState<"8 weeks" | "6 months">("8 weeks");
  const [completedActions, setCompletedActions] = useState<string[]>([]);
  const categories = [
    { label: "Resume strength", value: 78, change: 8, icon: FileText, note: "Impact statements improved" },
    { label: "Aptitude", value: 64, change: 5, icon: BookOpenCheck, note: "Quant accuracy is rising" },
    { label: "Interview skills", value: 71, change: 11, icon: Mic2, note: "Stronger answer structure" },
    { label: "Career activity", value: 75, change: 6, icon: BriefcaseBusiness, note: "Four focused applications" },
  ];
  const toggleAction = (action: string) => setCompletedActions(completedActions.includes(action) ? completedActions.filter(item => item !== action) : [...completedActions, action]);
  return <div className="view-content inner-view student-progress-view">
    <section className="student-progress-head"><div><p className="eyebrow">Your development over time</p><h2>Progress you can explain—and build on.</h2><p>See what changed your readiness, where momentum is strongest, and what to work on next.</p></div><button className="filter-chip" onClick={() => setRange(range === "8 weeks" ? "6 months" : "8 weeks")}>{range} <ChevronDown size={15} /></button></section>
    <section className="student-progress-hero">
      <div className="student-progress-score"><ReadinessRing score={72 + completedActions.length} /><div><span>Overall readiness</span><h3>Interview-ready momentum</h3><p>You’ve gained <strong>9 points</strong> since your baseline assessment. Keep this pace and you’re on track to reach 80 before the September drive window.</p><div className="student-progress-delta"><TrendingUp size={15} /><strong>+4</strong><span>this fortnight</span></div></div></div>
      <div className="student-progress-goal"><div><Target size={19} /><span><small>Next milestone</small><strong>80 · Placement ready</strong></span><em>8 points to go</em></div><div className="goal-track"><span style={{ width: `${(72 + completedActions.length) / 80 * 100}%` }} /></div><p>At your recent pace, you’ll reach this milestone in approximately four weeks.</p></div>
    </section>
    <section className="student-progress-grid">
      <article className="panel progress-trend-card"><header className="panel-heading"><div><span className="section-label">Readiness trend</span><h3>{range} of steady improvement</h3></div><span className="trend-summary"><TrendingUp size={14} /> +14.3%</span></header><div className="student-line-chart"><div className="chart-axis"><span>80</span><span>70</span><span>60</span><span>50</span></div><div className="chart-plot"><div className="chart-grid-lines" /><div className="chart-growth-area" /><span style={{ left: "3%", bottom: "20%" }} data-label="58" /><span style={{ left: "18%", bottom: "27%" }} data-label="61" /><span style={{ left: "34%", bottom: "34%" }} data-label="64" /><span style={{ left: "50%", bottom: "43%" }} data-label="67" /><span style={{ left: "66%", bottom: "47%" }} data-label="68" /><span style={{ left: "82%", bottom: "55%" }} data-label="70" /><span style={{ left: "96%", bottom: "63%" }} data-label="72" /></div></div><div className="chart-foot"><span>Baseline</span><span>Resume v2</span><span>Aptitude test</span><span>Interview #3</span><span>Today</span></div></article>
      <aside className="panel weekly-consistency"><header className="panel-heading"><div><span className="section-label">Consistency</span><h3>Weekly activity</h3></div><strong>5-day run</strong></header><div className="activity-calendar">{[2,3,1,4,3,0,2,4,3,5,4,2,0,3,4,5,3,4,2,1,4,5,4,3,2,4,5,3].map((level,index) => <span key={index} className={`level-${level}`} title={`${level} preparation activities`} />)}</div><div className="consistency-stats"><div><strong>14</strong><span>active days</span></div><div><strong>9.4h</strong><span>focused work</span></div><div><strong>23</strong><span>tasks finished</span></div></div><p><Sparkles size={14} /> Your strongest preparation window is Tuesday–Thursday.</p></aside>
    </section>
    <section className="progress-category-section"><div className="progress-section-title"><div><span className="section-label">Score composition</span><h3>What is moving your readiness</h3></div><button className="text-button" onClick={() => setCurrent("Agents")}>Open your coaches <ArrowRight size={15} /></button></div><div className="progress-category-grid">{categories.map(({ label, value, change, icon: Icon, note }) => <article key={label}><span className="category-icon"><Icon size={19} /></span><div className="category-title"><span>{label}</span><strong>{value}</strong></div><div className="category-track"><span style={{ width: `${value}%` }} /></div><p>{note}</p><em><TrendingUp size={12} /> +{change} pts</em></article>)}</div></section>
    <section className="progress-bottom-grid">
      <article className="panel progress-milestones"><header className="panel-heading"><div><span className="section-label">Milestones</span><h3>Evidence of growth</h3></div><span>3 of 5 this term</span></header><div className="milestone-list"><div className="complete"><i><Check size={14} /></i><p><strong>Resume crossed ATS 75</strong><span>Completed 2 Aug · +3 readiness points</span></p><Trophy size={18} /></div><div className="complete"><i><Check size={14} /></i><p><strong>Three mock interviews completed</strong><span>Completed 29 Jul · Stronger specificity</span></p><Trophy size={18} /></div><div className="complete"><i><Check size={14} /></i><p><strong>Quant accuracy above 70%</strong><span>Completed 24 Jul · 120 questions practised</span></p><Trophy size={18} /></div><div><i>4</i><p><strong>Reach readiness 80</strong><span>8 points remaining</span></p><Target size={18} /></div></div></article>
      <article className="panel progress-next-actions"><header className="panel-heading"><div><span className="section-label">Next best actions</span><h3>Turn insight into progress</h3></div><span>{completedActions.length}/3 done</span></header>{[["Complete a timed data set","Aptitude · 15 min","+1 readiness"],["Refine your second project","Resume · 10 min","+1 readiness"],["Practise a product case","Interview · 20 min","Build confidence"]].map(([action,meta,impact]) => <button key={action} className={completedActions.includes(action) ? "done" : ""} onClick={() => toggleAction(action)}><i>{completedActions.includes(action) ? <Check size={14} /> : <Clock3 size={14} />}</i><p><strong>{action}</strong><span>{meta}</span></p><em>{completedActions.includes(action) ? "Completed" : impact}</em></button>)}</article>
    </section>
  </div>;
}

function ApplicationsView() {
  const columns = [
    { name: "Saved", count: 4, cards: [{ company: "Atlassian", role: "Associate Engineer", meta: "84% match" }, { company: "Zoho", role: "Product Support Engineer", meta: "76% match" }] },
    { name: "Applied", count: 3, cards: [{ company: "Razorpay", role: "Product Analyst", meta: "Applied 2 days ago" }, { company: "Freshworks", role: "Graduate Engineer", meta: "Applied 5 days ago" }] },
    { name: "Interview", count: 1, cards: [{ company: "CRED", role: "Business Analyst", meta: "Interview · 14 Aug" }] },
    { name: "Decision", count: 0, cards: [] as { company: string; role: string; meta: string }[] },
  ];
  return (
    <div className="view-content inner-view applications-view">
      <section className="view-intro"><div><p className="eyebrow">Application tracker</p><h2>Every opportunity, in one place.</h2><p>Stay prepared for what’s next without losing sight of where you stand.</p></div><button className="button button-primary"><BriefcaseBusiness size={17} /> Add application</button></section>
      <section className="pipeline-summary"><div><span>Active applications</span><strong>4</strong><small>Across 3 companies</small></div><div><span>Next interview</span><strong>14 Aug</strong><small>CRED · Business Analyst</small></div><div><span>Response rate</span><strong>33%</strong><small>1 response from 3 applications</small></div><div className="pipeline-tip"><Sparkles size={18} /><span><strong>Preparation tip</strong><small>Practise one product case before your CRED interview.</small></span></div></section>
      <section className="kanban" aria-label="Application pipeline">
        {columns.map(column => <div className="kanban-column" key={column.name}><div className="kanban-heading"><span>{column.name}</span><b>{column.count}</b><MoreHorizontal size={17} /></div><div className="kanban-cards">{column.cards.map(card => <article key={card.company}><div className="company-mini">{card.company.slice(0, 2).toUpperCase()}</div><div><span>{card.company}</span><h3>{card.role}</h3><small>{card.meta}</small></div><button aria-label={`Open ${card.company} application`}><ChevronRight size={17} /></button></article>)}{!column.cards.length && <div className="empty-column"><Trophy size={23} /><strong>Nothing here yet</strong><span>Keep preparing—the right decision will land here.</span></div>}</div></div>)}
      </section>
    </div>
  );
}

function BottomNav({ current, setCurrent }: { current: View; setCurrent: (view: View) => void }) {
  return <nav className="bottom-nav" aria-label="Mobile navigation">{navItems.map(({ label, icon: Icon }) => <button key={label} className={current === label || (["Resume Maker", "Aptitude Test", "Mock Interview", "Job Matching", "Cover Letter", "Group Discussion"].includes(current) && label === "Agents") ? "is-active" : ""} onClick={() => setCurrent(label)}><Icon size={20} /><span>{label === "Opportunities" ? "Jobs" : label}</span></button>)}</nav>;
}

export function PlacebleDashboard({ user = { name: "Arjun Kumar", email: "student@placeble.local" }, accessToken = "", onLogout = () => undefined }: { user?: { name: string; email: string }; accessToken?: string; onLogout?: () => void }) {
  const [current, setCurrent] = useState<View>("Overview");
  const [dark, setDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionNotice, setActionNotice] = useState("");
  useEffect(() => {
    const handleStudentAction = (event: Event) => {
      const button = (event.target as HTMLElement).closest("button");
      if (!button) return;
      const label = (button.textContent ?? "").replace(/\s+/g, " ").trim();
      const ariaLabel = button.getAttribute("aria-label") ?? "";
      const messages: Record<string, string> = {
        "My profile": "Your profile workspace is ready—84% complete with one project recommended.",
        "Settings": "Settings opened. Theme and notification preferences are saved on this device.",
        "View calendar": "Calendar opened with the Infosys briefing on 12 August.",
        "Prepare for this drive": "A focused Infosys preparation plan has been added to today’s tasks.",
        "Add application": "A new application draft is ready in the Saved column.",
        "Mark all read": "All notifications marked as read.",
      };
      const message = messages[label] ?? (ariaLabel.startsWith("Open ") ? `${ariaLabel.replace("Open ", "")} details opened.` : "");
      if (message) {
        setActionNotice(message);
        window.setTimeout(() => setActionNotice(""), 2600);
      }
    };
    document.addEventListener("click", handleStudentAction);
    return () => document.removeEventListener("click", handleStudentAction);
  }, []);
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
  const view = useMemo(() => {
    if (current === "Overview") return <Overview setCurrent={setCurrent} />;
    if (current === "Progress") return <ProgressView setCurrent={setCurrent} />;
    if (current === "Agents") return <AgentsView onOpenResume={() => setCurrent("Resume Maker")} onOpenAptitude={() => setCurrent("Aptitude Test")} onOpenInterview={() => setCurrent("Mock Interview")} onOpenMatching={() => setCurrent("Job Matching")} onOpenCoverLetter={() => setCurrent("Cover Letter")} onOpenGroupDiscussion={() => setCurrent("Group Discussion")} />;
    if (current === "Resume Maker") return <ResumeMaker user={user} accessToken={accessToken} onBack={() => setCurrent("Agents")} />;
    if (current === "Aptitude Test") return <AptitudeTest accessToken={accessToken} onBack={() => setCurrent("Agents")} />;
    if (current === "Mock Interview") return <MockInterview accessToken={accessToken} onBack={() => setCurrent("Agents")} />;
    if (current === "Job Matching") return <JobMatching accessToken={accessToken} onBack={() => setCurrent("Agents")} />;
    if (current === "Cover Letter") return <CoverLetter accessToken={accessToken} onBack={() => setCurrent("Agents")} onOpenResume={() => setCurrent("Resume Maker")} />;
    if (current === "Group Discussion") return <GroupDiscussion accessToken={accessToken} onBack={() => setCurrent("Agents")} />;
    if (current === "Opportunities") return <OpportunitiesView setCurrent={setCurrent} />;
    return <ApplicationsView />;
  }, [current, accessToken, user]);
  return (
    <div className="app-shell">
      <Sidebar current={current} setCurrent={setCurrent} open={menuOpen} setOpen={setMenuOpen} user={user} />
      <main className="main-shell">
        <Header current={current} dark={dark} setDark={setDark} setMenuOpen={setMenuOpen} user={user} onLogout={onLogout} />
        {view}
      </main>
      <BottomNav current={current} setCurrent={setCurrent} />
      {actionNotice && <div className="student-action-toast"><Check size={16} /><span>{actionNotice}</span><button onClick={() => setActionNotice("")} aria-label="Dismiss notification"><X size={14} /></button></div>}
    </div>
  );
}
