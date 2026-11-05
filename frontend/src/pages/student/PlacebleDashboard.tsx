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
  LockKeyhole,
  LogOut,
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
import { ReadinessScoreRing as ReadinessRing } from "@/components/ui/readiness-score-ring";
import { ResumeMaker } from "@/pages/student/ResumeMakerPage";
import { AptitudeTest } from "@/pages/student/AptitudeTestPage";
import { MockInterview } from "@/pages/student/MockInterviewPage";
import { JobMatching, preloadJobMatching } from "@/pages/student/JobMatchingPage";
import { CoverLetter } from "@/pages/student/CoverLetterPage";
import { GroupDiscussion } from "@/pages/student/GroupDiscussionPage";
import { AccessHistoryPanel, NotificationCentre, StudentActionPlanPanel } from "@/components/workflow/workflow-panels";
import { useWorkspaceRoute } from "@/hooks/use-workspace-route";
import { InstitutionChat } from "@/pages/chat/InstitutionChat";

type View = "Overview" | "Progress" | "Agents" | "Messages" | "Resume Maker" | "Aptitude Test" | "Mock Interview" | "Job Matching" | "Cover Letter" | "Group Discussion" | "Opportunities" | "Applications" | "Profile" | "Settings";
const studentViews: readonly View[] = ["Overview", "Progress", "Agents", "Messages", "Resume Maker", "Aptitude Test", "Mock Interview", "Job Matching", "Cover Letter", "Group Discussion", "Opportunities", "Applications", "Profile", "Settings"];

const viewLabels: Partial<Record<View, string>> = { Overview: "Home", Progress: "My progress", Agents: "Practice tools", Messages: "Messages", "Resume Maker": "Resume builder", "Aptitude Test": "Practice test", "Job Matching": "Job finder", "Cover Letter": "Letter builder", Profile: "My profile" };

const navItems: { label: View; icon: typeof LayoutDashboard }[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Progress", icon: TrendingUp },
  { label: "Agents", icon: WandSparkles },
  { label: "Messages", icon: MessageSquareText },
];

// Product flags
const SHOW_GROUP_DISCUSSION = false;
const SHOW_JOB_MATCHING = false;

type ReadinessPayload = { current: { score: number; evidenceCount?: number; components: { resume: number; aptitude: number; interview: number; groupDiscussion: number; careerActivity: number } } | null; history: Array<{ score: number; calculatedAt: string; reason?: string }> };

function buildAgents(readiness: ReadinessPayload | null) {
  const components = readiness?.current?.components;
  const agents = [
  {
    name: "Resume Maker",
    description: "Shape a focused, ATS-ready resume from your profile.",
    icon: FileText,
    image: "/resume.png",
    status: components?.resume ? `Latest ATS evidence: ${components.resume}` : "No resume evidence yet",
    action: "Improve resume",
    metric: components?.resume ? `ATS ${components.resume}` : "Not started",
    tone: "navy",
  },
  {
    name: "Aptitude Practice",
    description: "Strengthen the topics that are holding your score back.",
    icon: BookOpenCheck,
    image: "/aptitude.png",
    status: components?.aptitude ? "Completed assessment available" : "No completed assessment",
    action: "Start practice",
    metric: components?.aptitude ? `${components.aptitude}% latest` : "Not started",
    tone: "amber",
  },
  {
    name: "Mock Interview",
    description: "Practice role-specific answers with measured feedback.",
    icon: Mic2,
    image: "/interview.png",
    status: components?.interview ? "Completed interview evidence available" : "No completed interview",
    action: "Start interview",
    metric: components?.interview ? `${components.interview}% score` : "Not started",
    tone: "blue",
  },
  {
    name: "Job Matching",
    description: "Find roles where your skills and intent line up.",
    icon: UserRoundSearch,
    image: "/jobmatching.png",
    status: components?.careerActivity ? "Application activity recorded" : "No application activity",
    action: "See matches",
    metric: components?.careerActivity ? `${components.careerActivity}% activity` : "Explore roles",
    tone: "green",
  },
  {
    name: "Cover Letter",
    description: "Turn a job description into a clear, personal letter.",
    icon: MessageSquareText,
    image: "/coverletter.png",
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
  return agents.filter(agent =>
    (SHOW_JOB_MATCHING || agent.name !== "Job Matching") &&
    (SHOW_GROUP_DISCUSSION || agent.name !== "Group Discussion")
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="Placeble">
      <picture className={`brand-logo ${compact ? "is-compact" : ""}`} aria-hidden="true"><img className="brand-logo-light" src="/placeble-logo-horizontal-color.svg" alt="" /><img className="brand-logo-dark" src="/placeble-logo-horizontal-reversed.svg" alt="" /></picture>
    </div>
  );
}

function Sidebar({ current, setCurrent, open, setOpen, user, readiness, onProfile, onSettings, onRequestLogout }: {
  current: View;
  setCurrent: (view: View) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  user: { name: string; email: string };
  readiness: ReadinessPayload | null;
  onProfile: () => void;
  onSettings: () => void;
  onRequestLogout: () => void;
}) {
  const initials = user.name.split(" ").map(part => part[0]).slice(0, 2).join("").toUpperCase();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, setOpen]);

  const mainNav: { label: View; icon: typeof LayoutDashboard; labelText: string }[] = [
    { label: "Overview", icon: LayoutDashboard, labelText: "Overview" },
    { label: "Progress", icon: TrendingUp, labelText: "My Progress" },
    { label: "Messages", icon: MessageSquareText, labelText: "Messages" },
  ];

  const practiceNav: { label: View; icon: typeof LayoutDashboard; labelText: string }[] = [
    { label: "Resume Maker", icon: FileText, labelText: "Resume Builder" },
    { label: "Aptitude Test", icon: BookOpenCheck, labelText: "Practice Test" },
    { label: "Mock Interview", icon: Mic2, labelText: "Mock Interview" },
    ...(SHOW_JOB_MATCHING ? [{ label: "Job Matching" as View, icon: UserRoundSearch, labelText: "Job Finder" }] : []),
    { label: "Cover Letter", icon: MessageSquareText, labelText: "Cover Letter" },
  ];

  const score = readiness?.current?.score ?? 0;

  return (
    <>
      <button className={`sidebar-scrim ${open ? "is-visible" : ""}`} onClick={() => setOpen(false)} aria-label="Close navigation" />
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <div className="sidebar-top">
          <BrandMark />
          <button className="icon-button sidebar-close" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>

        <div className="sidebar-scrollable">
          <span className="nav-eyebrow">Workspace</span>
          <nav className="primary-nav" aria-label="Main navigation">
            {mainNav.map(({ label, icon: Icon, labelText }) => (
              <button
                key={label}
                className={`nav-item ${current === label ? "is-active" : ""}`}
                onClick={() => { setCurrent(label); setOpen(false); }}
              >
                <Icon size={17} strokeWidth={1.8} />
                <span>{labelText}</span>
              </button>
            ))}
          </nav>

          <span className="nav-eyebrow" style={{ marginTop: "18px" }}>Preparation</span>
          <nav className="primary-nav" aria-label="Tools navigation">
            {practiceNav.map(({ label, icon: Icon, labelText }) => (
              <button
                key={label}
                className={`nav-item ${current === label ? "is-active" : ""}`}
                onClick={() => { setCurrent(label); setOpen(false); }}
              >
                <Icon size={17} strokeWidth={1.8} />
                <span>{labelText}</span>
              </button>
            ))}
          </nav>

          <div className="sidebar-readiness-widget">
            <div className="readiness-widget-header">
              <span className="widget-label">Readiness Index</span>
              <strong className="widget-score">{score}%</strong>
            </div>
            <div className="readiness-widget-bar">
              <div className="readiness-widget-fill" style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
            </div>
            <span className="readiness-widget-meta">
              {readiness?.current ? "Verified activity evidence" : "Practice to build readiness"}
            </span>
          </div>
        </div>

        <div className="sidebar-footer">
          <nav className="secondary-nav" aria-label="Secondary navigation">
            <button className={`nav-item ${current === "Profile" ? "is-active" : ""}`} onClick={() => { setOpen(false); onProfile(); }}>
              <CircleUserRound size={17} strokeWidth={1.8} />
              <span>My Profile</span>
            </button>
            <button className={`nav-item ${current === "Settings" ? "is-active" : ""}`} onClick={() => { setOpen(false); onSettings(); }}>
              <Settings size={17} strokeWidth={1.8} />
              <span>Settings</span>
            </button>
          </nav>

          <div className="sidebar-user">
            <div className="avatar small">{initials}</div>
            <div className="sidebar-user-details">
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
            <button
              type="button"
              className="sidebar-logout-btn"
              onClick={() => { setOpen(false); onRequestLogout(); }}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function Header({ current, dark, setDark, setMenuOpen, setCurrent, user, accessToken, onProfile, onSettings }: {
  current: View;
  dark: boolean;
  setDark: (dark: boolean) => void;
  setMenuOpen: (open: boolean) => void;
  setCurrent: (view: View) => void;
  user: { name: string };
  accessToken: string;
  onProfile: () => void;
  onSettings: () => void;
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [shortcutLabel, setShortcutLabel] = useState("⌘ K");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const accountWrapRef = useRef<HTMLDivElement>(null);

  const destinations: Array<{ label: string; view: View }> = [
    ...navItems.map(item => ({ label: viewLabels[item.label] ?? item.label, view: item.label })),
    { label: "My profile", view: "Profile" },
    { label: "Settings", view: "Settings" },
    ...buildAgents(null).map(agent => ({
      label: agent.name,
      view: agent.name === "Aptitude Practice" ? "Aptitude Test" as View : agent.name as View,
    })),
  ];
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

  // Auto-close account dropdown and search box on outside click or Escape
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (accountOpen && accountWrapRef.current && !accountWrapRef.current.contains(event.target as Node)) {
        setAccountOpen(false);
      }
      if (query && searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setQuery("");
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountOpen, query]);

  return (
    <header className="topbar">
      <div className="topbar-title">
        <button className="icon-button menu-button" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
        <div>
          <span className="mobile-brand"><BrandMark compact /></span>
          <h1>{viewLabels[current] ?? current}</h1>
        </div>
      </div>
      <div className="topbar-actions">
        <div className="search-box" ref={searchBoxRef}>
          <Search size={18} />
          <input
            ref={searchInputRef}
            aria-label="Search"
            placeholder="Search Placeble"
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter" && matches[0]) openDestination(matches[0].view); }}
          />
          <kbd>{shortcutLabel}</kbd>
          {matches.length > 0 && (
            <div className="student-search-results">
              {matches.map(item => (
                <button key={`${item.label}-${item.view}`} onClick={() => openDestination(item.view)}>
                  <Search size={14} />{item.label}<ArrowRight size={14} />
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="icon-button" onClick={() => setCurrent("Messages")} aria-label="Messages" title="Messages">
          <MessageSquareText size={19} />
        </button>
        <button className="icon-button" onClick={() => setDark(!dark)} aria-label={dark ? "Use light mode" : "Use dark mode"}>
          {dark ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        <NotificationCentre accessToken={accessToken} onOpen={view => setCurrent(view as View)} />
        <div className="student-account-wrap" ref={accountWrapRef}>
          <button className="header-profile" onClick={() => setAccountOpen(!accountOpen)} aria-expanded={accountOpen} aria-label="Open account menu">
            <div className="avatar small">{initials}</div>
            <span className="header-signout">Account</span>
            <ChevronDown size={14} />
          </button>
          {accountOpen && (
            <div className="student-account-menu">
              <button onClick={() => { setAccountOpen(false); onProfile(); }}>
                <CircleUserRound size={16} /> My profile
              </button>
              <button onClick={() => { setAccountOpen(false); onSettings(); }}>
                <Settings size={16} /> Settings
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function Overview({ setCurrent, readiness, user }: { setCurrent: (view: View) => void; readiness: ReadinessPayload | null; user: { name: string }; accessToken: string }) {
  const components = readiness?.current?.components;
  const score = readiness?.current?.score ?? 0;
  const firstName = user.name.split(" ")[0];

  // Smart single primary recommendation
  const primaryAction = useMemo(() => {
    if (!components?.aptitude) {
      return {
        title: "Take your Aptitude & Coding Baseline",
        desc: "Strengthen quantitative, logical, and algorithmic problem-solving with your AI coach.",
        view: "Aptitude Test" as View,
        cta: "Start Aptitude Assessment",
        tag: "High Priority · ~15 mins",
      };
    }
    if (!components?.resume || components.resume < 60) {
      return {
        title: "Optimize Resume for ATS Scoring",
        desc: "Tailor your projects and skills to beat recruiter screening filters with the Resume Coach.",
        view: "Resume Maker" as View,
        cta: "Improve Resume",
        tag: "Recommended · ~10 mins",
      };
    }
    if (!components?.interview || components.interview < 60) {
      return {
        title: "Practice a Role-Specific Mock Interview",
        desc: "Rehearse placement questions with real-time feedback on delivery and clarity.",
        view: "Mock Interview" as View,
        cta: "Start Mock Interview",
        tag: "Interview Prep · ~12 mins",
      };
    }
    return {
      title: "Refine Your Resume for Top Placement Drives",
      desc: "Tailor your technical project bullet points and ATS keywords with your AI coach.",
      view: "Resume Maker" as View,
      cta: "Enhance Resume",
      tag: "Career Activity",
    };
  }, [components]);

  // 3 Curated Priority Pathway Tasks
  const actionItems: Array<{
    title: string;
    detail: string;
    view: View;
    icon: typeof FileText;
    tag: string;
    completed: boolean;
  }> = [
    {
      title: "Aptitude & Coding Practice",
      detail: components?.aptitude ? `Scored ${components.aptitude}% on latest test` : "Complete your first timed assessment",
      view: "Aptitude Test",
      icon: BookOpenCheck,
      tag: components?.aptitude ? "In Progress" : "Action Needed",
      completed: Boolean(components?.aptitude && components.aptitude >= 70),
    },
    {
      title: "ATS-Optimized Resume",
      detail: components?.resume ? `Current ATS score: ${components.resume}/100` : "Add skills and projects to build ATS evidence",
      view: "Resume Maker",
      icon: FileText,
      tag: components?.resume ? "In Progress" : "Action Needed",
      completed: Boolean(components?.resume && components.resume >= 75),
    },
    {
      title: "AI Mock Interview Session",
      detail: components?.interview ? `Recent interview performance: ${components.interview}%` : "Rehearse role-specific technical & HR questions",
      view: "Mock Interview",
      icon: Mic2,
      tag: components?.interview ? "Completed" : "Next Milestone",
      completed: Boolean(components?.interview && components.interview >= 60),
    },
  ];

  const coaches = buildAgents(readiness).slice(0, 5);
  const evidenceHistory = readiness?.history.filter(entry => entry.reason !== "dashboard_refresh") ?? [];

  return (
    <div className="view-content overview-clean-view">
      {/* 1. Hero Greeting Banner */}
      <section className="overview-hero-clean">
        <div className="overview-hero-content">
          <div className="overview-hero-greeting">
            <span className="overview-pill-badge">
              <Sparkles size={13} />
              <span>Placement Preparation Hub</span>
            </span>
            <h2>Welcome back, {firstName} 👋</h2>
            <p>
              Your verified readiness score is <strong>{score} / 100</strong>. Focus on high-impact coach drills to strengthen your profile.
            </p>
          </div>
          <div className="overview-hero-cta">
            <button className="button button-primary hero-action-btn" onClick={() => setCurrent(primaryAction.view)}>
              <span>{primaryAction.cta}</span>
              <ArrowRight size={16} />
            </button>
            <button className="button button-secondary" onClick={() => setCurrent("Agents")}>
              <WandSparkles size={16} />
              <span>Practice Tools</span>
            </button>
          </div>
        </div>
      </section>

      {/* 2. Top 4 Metric KPI Cards */}
      <section className="overview-kpi-grid">
        <div className="overview-kpi-card highlight" onClick={() => setCurrent("Progress")}>
          <div className="kpi-card-header">
            <span className="kpi-label">Readiness Score</span>
            <span className="kpi-tag">{score >= 75 ? "Placement Ready" : score >= 50 ? "Solid Baseline" : "Building"}</span>
          </div>
          <div className="kpi-card-body">
            <div className="kpi-score-ring">
              <ReadinessRing score={score} compact />
            </div>
            <div className="kpi-score-meta">
              <strong>{score}<em>/100</em></strong>
              <small>Verified Evidence</small>
            </div>
          </div>
          <div className="kpi-card-footer">
            <span className="kpi-trend">
              <TrendingUp size={13} />
              <span>{evidenceHistory.length} recorded updates</span>
            </span>
            <ChevronRight size={14} className="kpi-arrow" />
          </div>
        </div>

        <div className="overview-kpi-card" onClick={() => setCurrent("Resume Maker")}>
          <div className="kpi-card-header">
            <span className="kpi-label">Resume Strength</span>
            <span className={`kpi-tag ${components?.resume ? "active" : ""}`}>
              {components?.resume ? `ATS ${components.resume}` : "Draft"}
            </span>
          </div>
          <div className="kpi-card-body">
            <span className="kpi-icon-box tone-navy">
              <FileText size={20} />
            </span>
            <div className="kpi-score-meta">
              <strong>{components?.resume ? `${components.resume}%` : "-"}</strong>
              <small>{components?.resume ? "ATS Compatibility" : "No resume yet"}</small>
            </div>
          </div>
          <div className="kpi-card-footer">
            <span className="kpi-action-link">{components?.resume ? "Review Resume" : "Build Resume"}</span>
            <ChevronRight size={14} className="kpi-arrow" />
          </div>
        </div>

        <div className="overview-kpi-card" onClick={() => setCurrent("Aptitude Test")}>
          <div className="kpi-card-header">
            <span className="kpi-label">Aptitude & Coding</span>
            <span className={`kpi-tag ${components?.aptitude ? "active" : ""}`}>
              {components?.aptitude ? `${components.aptitude}% Latest` : "Untested"}
            </span>
          </div>
          <div className="kpi-card-body">
            <span className="kpi-icon-box tone-amber">
              <BookOpenCheck size={20} />
            </span>
            <div className="kpi-score-meta">
              <strong>{components?.aptitude ? `${components.aptitude}%` : "-"}</strong>
              <small>{components?.aptitude ? "Quant & Logic Score" : "Assess skills"}</small>
            </div>
          </div>
          <div className="kpi-card-footer">
            <span className="kpi-action-link">{components?.aptitude ? "Continue Drills" : "Start Practice"}</span>
            <ChevronRight size={14} className="kpi-arrow" />
          </div>
        </div>

        <div className="overview-kpi-card" onClick={() => setCurrent("Mock Interview")}>
          <div className="kpi-card-header">
            <span className="kpi-label">Mock Interview</span>
            <span className={`kpi-tag ${components?.interview ? "active" : ""}`}>
              {components?.interview ? `${components.interview}% Score` : "Untested"}
            </span>
          </div>
          <div className="kpi-card-body">
            <span className="kpi-icon-box tone-blue">
              <Mic2 size={20} />
            </span>
            <div className="kpi-score-meta">
              <strong>{components?.interview ? `${components.interview}%` : "-"}</strong>
              <small>{components?.interview ? "AI Evaluation Score" : "15m practice"}</small>
            </div>
          </div>
          <div className="kpi-card-footer">
            <span className="kpi-action-link">{components?.interview ? "Review Feedback" : "Start Mock"}</span>
            <ChevronRight size={14} className="kpi-arrow" />
          </div>
        </div>
      </section>

      {/* 3. Main Dashboard Layout (2 Clean Columns: 62% Pathway vs 38% Coaches) */}
      <div className="overview-main-layout">
        {/* Left Column: Recommended Focus + Activity Milestones */}
        <div className="overview-left-col">
          {/* Priority Focus Card */}
          <section className="overview-card-panel">
            <div className="overview-panel-head">
              <div>
                <span className="panel-eyebrow">Priority Pathway</span>
                <h3>Recommended Actions</h3>
              </div>
              <span className="panel-badge-pill">Targeting 80+ Readiness</span>
            </div>

            <div className="overview-task-list">
              {actionItems.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <button key={item.title} className={`overview-task-item ${item.completed ? "completed" : ""}`} onClick={() => setCurrent(item.view)}>
                    <span className="task-step-number">{idx + 1}</span>
                    <span className="task-icon-wrap">
                      <Icon size={18} />
                    </span>
                    <div className="task-info">
                      <div className="task-title-row">
                        <strong>{item.title}</strong>
                        <span className="task-tag">{item.tag}</span>
                      </div>
                      <p>{item.detail}</p>
                    </div>
                    <span className="task-launch-btn">
                      <span>Launch</span>
                      <ArrowRight size={14} />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Recent Milestones Timeline */}
          <section className="overview-card-panel">
            <div className="overview-panel-head">
              <div>
                <span className="panel-eyebrow">Verification Timeline</span>
                <h3>Recent Milestones</h3>
              </div>
              <button className="text-button" onClick={() => setCurrent("Progress")}>
                View Progress <ChevronRight size={14} />
              </button>
            </div>

            {evidenceHistory.length > 0 ? (
              <div className="overview-timeline">
                {evidenceHistory.slice(-3).reverse().map((entry, idx) => (
                  <div key={`${entry.calculatedAt}-${idx}`} className="timeline-row">
                    <span className="timeline-node">
                      <Check size={12} />
                    </span>
                    <div className="timeline-content">
                      <div className="timeline-title-row">
                        <strong>Readiness updated to {entry.score} pts</strong>
                        <time>{new Date(entry.calculatedAt).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</time>
                      </div>
                      <p>{entry.reason ? entry.reason.replaceAll("_", " ") : "Calculated from completed preparation assessment."}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overview-empty-timeline">
                <Target size={20} />
                <p>No activity recorded yet. Complete an aptitude test or resume review to establish your timeline.</p>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: AI Coach Launchpad */}
        <aside className="overview-right-col">
          <section className="overview-card-panel coaches-launcher-card">
            <div className="overview-panel-head">
              <div>
                <span className="panel-eyebrow">Direct Access</span>
                <h3>AI Practice Coaches</h3>
              </div>
              <button className="text-button" onClick={() => setCurrent("Agents")}>
                Library <ArrowRight size={14} />
              </button>
            </div>

            <div className="overview-coach-mini-list">
              {coaches.map(coach => {
                const Icon = coach.icon;
                return (
                  <button
                    key={coach.name}
                    className="overview-coach-item"
                    onClick={() => {
                      if (coach.name === "Resume Maker") setCurrent("Resume Maker");
                      else if (coach.name === "Aptitude Practice") setCurrent("Aptitude Test");
                      else if (coach.name === "Mock Interview") setCurrent("Mock Interview");
                      else if (coach.name === "Job Matching") setCurrent("Job Matching");
                      else if (coach.name === "Cover Letter") setCurrent("Cover Letter");
                      else setCurrent("Agents");
                    }}
                  >
                    <div className="coach-thumb-wrap">
                      {coach.image ? (
                        <img src={coach.image} alt={coach.name} className="coach-mini-avatar" />
                      ) : (
                        <span className={`coach-fallback-icon ${coach.tone}`}>
                          <Icon size={18} />
                        </span>
                      )}
                    </div>
                    <div className="coach-mini-info">
                      <strong>{coach.name}</strong>
                      <small>{coach.metric}</small>
                    </div>
                    <span className="coach-go-arrow">
                      <ArrowRight size={15} />
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="coach-banner-tip">
              <Sparkles size={16} />
              <div>
                <strong>Single Readiness Pool</strong>
                <p>Every session automatically updates your verified placement score.</p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function AgentsView({ readiness, onOpenResume, onOpenAptitude, onOpenInterview, onOpenMatching, onOpenCoverLetter, onOpenGroupDiscussion }: { readiness: ReadinessPayload | null; onOpenResume: () => void; onOpenAptitude: () => void; onOpenInterview: () => void; onOpenMatching: () => void; onOpenCoverLetter: () => void; onOpenGroupDiscussion: () => void }) {
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const agentRows = buildAgents(readiness);
  const hasAptitude = Boolean(readiness?.current?.components.aptitude);
  return (
    <div className="view-content inner-view">
      <section className="view-intro"><div><p className="eyebrow">Your preparation toolkit</p><h2>Five coaches. One clear path.</h2><p>Every session contributes to the same readiness score, so your effort stays connected.</p></div><div className="compact-score-card"><ReadinessRing score={readiness?.current?.score ?? 0} compact /><span><strong>{readiness?.current?.score ?? 0} readiness</strong><small>Based on verified activity</small></span></div></section>
      <section className="recommended-strip"><span className="recommend-icon"><Sparkles size={18} /></span><div><strong>{hasAptitude ? "Continue aptitude practice" : "Recommended next: establish an aptitude baseline"}</strong><p>{hasAptitude ? `Your latest recorded aptitude score is ${readiness?.current?.components.aptitude}.` : "No completed aptitude assessment is recorded for this account."}</p></div><button className="button button-progress" onClick={onOpenAptitude}>{hasAptitude ? "Continue practice" : "Start assessment"} <ArrowRight size={16} /></button></section>
      <section className="agent-library">
        {agentRows.map(({ name, description, icon: Icon, image, status, action, metric, tone }) => (
          <article className={`agent-card ${image ? "has-image" : ""}`} key={name}>
            {image && (
              <div className="agent-card-banner">
                <img src={image} alt="" className="agent-banner-backdrop" aria-hidden="true" />
                <div className="agent-banner-stage">
                  <img src={image} alt={name} className="agent-banner-img" />
                </div>
                <div className="agent-banner-overlay" />
                <span className="agent-card-metric-badge">{metric}</span>
              </div>
            )}
            <div className="agent-card-content">
              <div className="agent-card-header">
                <span className={`agent-icon ${tone}`}><Icon size={20} /></span>
                <div className="agent-card-title-wrap">
                  <h3>{name}</h3>
                  {!image && <span className="agent-metric">{metric}</span>}
                </div>
              </div>
              <p className="agent-description">{description}</p>
              <div className="agent-status"><span className={`status-dot ${tone}`} />{status}</div>
              <button className="agent-action" onClick={() => name === "Resume Maker" ? onOpenResume() : name === "Aptitude Practice" ? onOpenAptitude() : name === "Mock Interview" ? onOpenInterview() : name === "Job Matching" ? onOpenMatching() : name === "Cover Letter" ? onOpenCoverLetter() : name === "Group Discussion" ? onOpenGroupDiscussion() : setActiveAgent(name)}>{action}<ArrowRight size={16} /></button>
            </div>
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
  const score = readiness?.current?.score ?? 0;

  const categories = [
    {
      label: "Resume ATS Score",
      value: readinessComponents?.resume ?? 0,
      change: 0,
      icon: FileText,
      note: readinessComponents?.resume
        ? readinessComponents.resume >= 75
          ? "Strong ATS score · Ready for campus screening"
          : "Good draft · Add projects and skills"
        : "Build your resume to generate ATS score",
    },
    {
      label: "Aptitude & Coding",
      value: readinessComponents?.aptitude ?? 0,
      change: 0,
      icon: BookOpenCheck,
      note: readinessComponents?.aptitude
        ? readinessComponents.aptitude >= 70
          ? "Cleared baseline screening cut-off"
          : "Practice 10 more MCQs to improve"
        : "Complete your first timed practice test",
    },
    {
      label: "Mock Interview",
      value: readinessComponents?.interview ?? 0,
      change: 0,
      icon: Mic2,
      note: readinessComponents?.interview
        ? readinessComponents.interview >= 65
          ? "Confident delivery & good structure"
          : "Practice role questions with AI coach"
        : "Rehearse a 5-minute practice interview",
    },
    {
      label: "Practice Activity",
      value: Math.min(100, Math.round(((history.length || 1) / 10) * 100)),
      change: 0,
      icon: BriefcaseBusiness,
      note: `${history.length} verified practice sessions logged`,
    },
  ];

  const nextActions: Array<[string, string, View]> = [
    [readinessComponents?.resume ? "Boost resume keywords" : "Build your first resume", "Resume Builder", "Resume Maker"],
    [readinessComponents?.aptitude ? "Take a 10-minute quiz" : "Take a baseline test", "Practice Test", "Aptitude Test"],
    [readinessComponents?.interview ? "Rehearse an interview round" : "Try a 5-minute mock interview", "Mock Interview", "Mock Interview"],
  ];

  return (
    <div className="view-content inner-view student-progress-view">
      <section className="student-progress-head">
        <div>
          <p className="eyebrow">Your Placement Preparation</p>
          <h2>Your Preparation & Readiness Stats</h2>
          <p>A simple, clear summary of how ready you are for campus placement rounds.</p>
        </div>
        <button className="filter-chip" onClick={() => setRange(range === "8 weeks" ? "6 months" : "8 weeks")}>
          {range} <ChevronDown size={15} />
        </button>
      </section>

      <section className="student-progress-hero">
        <div className="student-progress-score">
          <ReadinessRing score={score} />
          <div>
            <span>Overall Readiness</span>
            <h3>{score >= 75 ? "Placement Ready" : score >= 50 ? "Solid Baseline · Keep Practicing" : "Getting Started"}</h3>
            <p>Calculated directly from your verified resume ATS match, aptitude practice tests, and mock interview performance.</p>
            <div className="student-progress-delta">
              <TrendingUp size={15} />
              <strong>{history.length}</strong>
              <span>practice milestones recorded</span>
            </div>
          </div>
        </div>
        <div className="student-progress-goal">
          <div>
            <Target size={19} />
            <span>
              <small>Placement Target</small>
              <strong>80 / 100 · Industry Ready</strong>
            </span>
            <em>{Math.max(0, 80 - score)} points to target</em>
          </div>
          <div className="goal-track">
            <span style={{ width: `${Math.min(100, (score / 80) * 100)}%` }} />
          </div>
          <p>Complete mock interviews and aptitude drills to steadily boost your readiness index.</p>
        </div>
      </section>

      <section className="student-progress-grid">
        <article className="panel progress-trend-card">
          <header className="panel-heading">
            <div>
              <span className="section-label">Readiness Trend</span>
              <h3>{visibleHistory.length ? `${visibleHistory.length} recorded practice sessions` : "No sessions yet"}</h3>
            </div>
            <span className="trend-summary">
              <TrendingUp size={14} /> {trendDelta >= 0 ? "+" : ""}{trendDelta} pts
            </span>
          </header>
          {visibleHistory.length ? (
            <div className="student-line-chart">
              <div className="chart-axis"><span>100</span><span>75</span><span>50</span><span>0</span></div>
              <div className="chart-plot">
                <div className="chart-grid-lines" />
                {visibleHistory.map((entry, index) => (
                  <span
                    key={entry.calculatedAt}
                    style={{
                      left: `${visibleHistory.length === 1 ? 50 : 3 + (index * 93) / (visibleHistory.length - 1)}%`,
                      bottom: `${Math.max(4, entry.score)}%`,
                    }}
                    data-label={entry.score}
                    title={new Date(entry.calculatedAt).toLocaleString("en-IN")}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="student-empty-state">
              <span className="student-empty-icon"><TrendingUp size={22} /></span>
              <strong>No readiness history yet</strong>
              <span>Take a practice test or mock interview to see your progress graph.</span>
            </div>
          )}
        </article>

        <aside className="panel weekly-consistency">
          <header className="panel-heading">
            <div>
              <span className="section-label">Practice Log</span>
              <h3>Total Sessions</h3>
            </div>
            <strong>{history.length}</strong>
          </header>
          <div className="student-empty-state">
            <span className="student-empty-icon"><ClipboardCheck size={22} /></span>
            <strong>{history.length ? `${history.length} practice milestones completed` : "No sessions logged yet"}</strong>
            <span>Every completed aptitude test and mock interview is verified and logged here.</span>
          </div>
        </aside>
      </section>

      <section className="progress-category-section">
        <div className="progress-section-title">
          <div>
            <span className="section-label">Core Scores</span>
            <h3>What makes up your score</h3>
          </div>
          <button className="text-button" onClick={() => setCurrent("Agents")}>
            Open practice tools <ArrowRight size={15} />
          </button>
        </div>
        <div className="progress-category-grid">
          {categories.map(({ label, value, change, icon: Icon, note }) => (
            <article key={label}>
              <span className="category-icon"><Icon size={19} /></span>
              <div className="category-title">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
              <div className="category-track">
                <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
              </div>
              <p>{note}</p>
              <em><TrendingUp size={12} /> {value >= 70 ? "On track" : "Needs practice"}</em>
            </article>
          ))}
        </div>
      </section>

      <section className="progress-bottom-grid">
        <article className="panel progress-milestones">
          <header className="panel-heading">
            <div>
              <span className="section-label">Milestones</span>
              <h3>Preparation Goals</h3>
            </div>
          </header>
          <div className="milestone-list">
            {readinessComponents?.resume && readinessComponents.resume >= 75 ? (
              <div className="complete">
                <i><Check size={14} /></i>
                <p><strong>Resume ATS score reached 75+</strong><span>Current score: {readinessComponents.resume}/100</span></p>
                <Trophy size={18} />
              </div>
            ) : null}
            {readinessComponents?.aptitude && readinessComponents.aptitude >= 70 ? (
              <div className="complete">
                <i><Check size={14} /></i>
                <p><strong>Aptitude test score reached 70%+</strong><span>Current score: {readinessComponents.aptitude}%</span></p>
                <Trophy size={18} />
              </div>
            ) : null}
            <div>
              <i><Target size={14} /></i>
              <p><strong>Reach overall readiness 80+</strong><span>{Math.max(0, 80 - score)} points remaining</span></p>
              <Target size={18} />
            </div>
          </div>
        </article>
        <article className="panel progress-next-actions">
          <header className="panel-heading">
            <div>
              <span className="section-label">Recommended Next Steps</span>
              <h3>Action items to boost your score</h3>
            </div>
          </header>
          {nextActions.map(([action, meta, view]) => (
            <button key={action} onClick={() => setCurrent(view)}>
              <i><Clock3 size={14} /></i>
              <p><strong>{action}</strong><span>{meta}</span></p>
              <em>Start</em>
            </button>
          ))}
        </article>
      </section>
    </div>
  );
}

type StudentProfileForm = { name: string; email: string; degree: string; graduationYear: number; skills: string[]; preferredRoles: string[] };

function StudentProfilePage({ accessToken, onSaved }: { accessToken: string; onSaved: (message: string) => void }) {
  const [profile, setProfile] = useState<StudentProfileForm | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL ?? "/api/v1"}/auth/profile`, { credentials: "include", headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async response => { const payload = await response.json(); if (!response.ok) throw new Error(payload.message ?? "Could not load your profile."); return payload.profile; })
      .then(setProfile).catch(cause => setError(cause instanceof Error ? cause.message : "Could not load your profile."));
  }, [accessToken]);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL ?? "/api/v1"}/auth/profile`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ ...profile, email: undefined }) });
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

function ChangePasswordSettings({ accessToken }: { accessToken: string }) {
  const [currentPassword, setCurrentPassword] = useState(""); const [newPassword, setNewPassword] = useState(""); const [confirmPassword, setConfirmPassword] = useState(""); const [saving, setSaving] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(""); setMessage(""); if (newPassword !== confirmPassword) { setError("Your new passwords do not match."); return; } setSaving(true); try { const response = await fetch(`${import.meta.env.VITE_API_URL ?? "/api/v1"}/auth/change-password`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ currentPassword, newPassword }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.message ?? "Could not change your password."); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setMessage("Password changed. Your other signed-in sessions have been signed out."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not change your password."); } finally { setSaving(false); } };
  return <article className="panel settings-section settings-password"><header><span className="settings-section-icon"><LockKeyhole size={20} /></span><div><h3>Password</h3><p>Update your password securely. We will sign out your other sessions.</p></div></header><form onSubmit={submit}><label><span>Current password</span><input type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label><label><span>New password</span><input type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} required /><small>At least 8 characters, with uppercase, lowercase, and a number.</small></label><label><span>Confirm new password</span><input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label>{error && <p className="settings-password-message error">{error}</p>}{message && <p className="settings-password-message success"><Check size={15} /> {message}</p>}<button className="button button-primary" disabled={saving}>{saving ? "Updating password…" : "Change password"}</button></form></article>;
}

function StudentSettingsPage({ dark, setDark, accessToken }: { dark: boolean; setDark: (dark: boolean) => void; accessToken: string }) {
  const [reducedMotion, setReducedMotion] = useState(() => window.localStorage.getItem("placeble-reduced-motion") === "true");
  const updateMotion = (value: boolean) => { setReducedMotion(value); window.localStorage.setItem("placeble-reduced-motion", String(value)); document.documentElement.dataset.reducedMotion = String(value); };
  return <div className="view-content inner-view student-account-page">
    <section className="view-intro"><div><p className="eyebrow">Preferences</p><h2>Make Placeble feel right.</h2><p>Personalise appearance and accessibility without changing your academic data.</p></div></section>
    <section className="settings-page-grid">
      <article className="panel settings-section"><header><span className="settings-section-icon"><Sun size={20} /></span><div><h3>Appearance</h3><p>Choose the theme that is easiest for you to use.</p></div></header><div className="theme-choice-grid"><button className={!dark ? "active" : ""} onClick={() => setDark(false)}><span className="theme-preview light"><i /><i /><i /></span><strong>Light</strong><small>Bright and focused</small>{!dark && <Check size={17} />}</button><button className={dark ? "active" : ""} onClick={() => setDark(true)}><span className="theme-preview dark"><i /><i /><i /></span><strong>Dark</strong><small>Comfortable in low light</small>{dark && <Check size={17} />}</button></div></article>
      <article className="panel settings-section"><header><span className="settings-section-icon"><Settings size={20} /></span><div><h3>Accessibility</h3><p>Adjust motion while keeping every feature available.</p></div></header><button className="settings-toggle-row" onClick={() => updateMotion(!reducedMotion)} aria-pressed={reducedMotion}><span><strong>Reduce motion</strong><small>Minimises decorative transitions and animated entrances.</small></span><i className={reducedMotion ? "on" : ""}><b /></i></button></article>
      <ChangePasswordSettings accessToken={accessToken} />
      <AccessHistoryPanel accessToken={accessToken} />
      <article className="panel settings-section settings-security"><header><span className="settings-section-icon"><CircleUserRound size={20} /></span><div><h3>Account & privacy</h3><p>Your account stays scoped to your verified institution.</p></div></header><div className="settings-info-row"><span>Profile visibility</span><strong>Institution only</strong></div><div className="settings-info-row"><span>Readiness evidence</span><strong>Verified activity only</strong></div><div className="settings-info-row"><span>Preference storage</span><strong>This device</strong></div></article>
    </section>
  </div>;
}

function BottomNav({ current, setCurrent }: { current: View; setCurrent: (view: View) => void }) {
  const mobileItems = [...navItems, { label: "Profile" as View, icon: CircleUserRound }, { label: "Settings" as View, icon: Settings }];
  return <nav className="bottom-nav" aria-label="Mobile navigation">{mobileItems.map(({ label, icon: Icon }) => {
    const active = current === label || (["Resume Maker", "Aptitude Test", "Mock Interview", "Job Matching", "Cover Letter", "Group Discussion"].includes(current) && label === "Agents");
    return <button key={label} type="button" className={active ? "is-active" : ""} aria-label={viewLabels[label] ?? label} aria-current={active ? "page" : undefined} onClick={() => setCurrent(label)}><Icon size={20} strokeWidth={1.9} /><span>{viewLabels[label] ?? label}</span></button>;
  })}</nav>;
}

export function PlacebleDashboard({ user = { name: "Arjun Kumar", email: "student@placeble.local" }, accessToken = "", onLogout = () => undefined }: { user?: { name: string; email: string; studentVerificationStatus?: "pending_tpo_approval" | "approved" | "rejected" | "roster_matched" | "pending_domain_approval" | null }; accessToken?: string; onLogout?: () => void }) {
  const [current, setCurrent] = useWorkspaceRoute("student", studentViews, "Overview");
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const preferred = window.localStorage.getItem("placeble-theme");
    return preferred === "dark" || (!preferred && window.matchMedia("(prefers-color-scheme: dark)").matches);
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [actionNotice, setActionNotice] = useState("");
  const [readiness, setReadiness] = useState<ReadinessPayload | null>(null);
  useEffect(() => {
    if (!accessToken || !SHOW_JOB_MATCHING) return;
    const timer = window.setTimeout(() => void preloadJobMatching(accessToken), 1200);
    return () => window.clearTimeout(timer);
  }, [accessToken]);
  useEffect(() => {
    if (!accessToken) return;
    fetch(`${import.meta.env.VITE_API_URL ?? "/api/v1"}/readiness/me`, { headers: { Authorization: `Bearer ${accessToken}` }, credentials: "include" })
      .then(response => response.ok ? response.json() : Promise.reject(new Error("Readiness unavailable")))
      .then(setReadiness).catch(() => setReadiness(null));
  }, [accessToken, current]);
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
    if (current === "Overview") return <Overview setCurrent={setCurrent} readiness={readiness} user={user} accessToken={accessToken} />;
    if (current === "Progress") return <ProgressView setCurrent={setCurrent} readiness={readiness} />;
    if (current === "Agents") return <AgentsView readiness={readiness} onOpenResume={() => setCurrent("Resume Maker")} onOpenAptitude={() => setCurrent("Aptitude Test")} onOpenInterview={() => setCurrent("Mock Interview")} onOpenMatching={() => setCurrent("Job Matching")} onOpenCoverLetter={() => setCurrent("Cover Letter")} onOpenGroupDiscussion={() => setCurrent("Group Discussion")} />;
    if (current === "Messages") return <div className="view-content inner-view"><div className="section-header"><div><span className="eyebrow">YOUR INSTITUTION</span><h1>Messages</h1><p>A direct line to your placement team.</p></div></div><InstitutionChat role="student" accessToken={accessToken} /></div>;
    if (current === "Resume Maker") return <ResumeMaker user={user} accessToken={accessToken} onBack={() => setCurrent("Agents")} />;
    if (current === "Aptitude Test") return <AptitudeTest accessToken={accessToken} onBack={() => setCurrent("Agents")} />;
    if (current === "Mock Interview") return <MockInterview accessToken={accessToken} onBack={() => setCurrent("Agents")} onOpenResume={() => setCurrent("Resume Maker")} />;
    if (current === "Job Matching") return <JobMatching accessToken={accessToken} onBack={() => setCurrent("Agents")} />;
    if (current === "Cover Letter") return <CoverLetter accessToken={accessToken} onBack={() => setCurrent("Agents")} onOpenResume={() => setCurrent("Resume Maker")} />;
    if (current === "Group Discussion") return <GroupDiscussion accessToken={accessToken} onBack={() => setCurrent("Agents")} />;
    if (current === "Opportunities") return <JobMatching accessToken={accessToken} initialSurface="feed" onBack={() => setCurrent("Overview")} />;
    if (current === "Applications") return <JobMatching accessToken={accessToken} initialSurface="tracker" onBack={() => setCurrent("Overview")} />;
    if (current === "Profile") return <StudentProfilePage accessToken={accessToken} onSaved={message => { setActionNotice(message); window.setTimeout(() => setActionNotice(""), 2600); }} />;
    if (current === "Settings") return <StudentSettingsPage dark={dark} setDark={setDark} accessToken={accessToken} />;
    return <Overview setCurrent={setCurrent} readiness={readiness} user={user} accessToken={accessToken} />;
  }, [current, accessToken, user, readiness, dark]);
  return (
    <div className="app-shell">
      <Sidebar current={current} setCurrent={setCurrent} open={menuOpen} setOpen={setMenuOpen} user={user} readiness={readiness} onProfile={() => { setCurrent("Profile"); setMenuOpen(false); }} onSettings={() => { setCurrent("Settings"); setMenuOpen(false); }} onRequestLogout={() => setSignOutOpen(true)} />
      <main className="main-shell">
        <Header current={current} dark={dark} setDark={setDark} setMenuOpen={setMenuOpen} setCurrent={setCurrent} user={user} accessToken={accessToken} onProfile={() => setCurrent("Profile")} onSettings={() => setCurrent("Settings")} />
        {view}
      </main>
      <BottomNav current={current} setCurrent={setCurrent} />
      {signOutOpen && <div className="prd-modal-layer" role="dialog" aria-modal="true" aria-labelledby="student-signout-title"><button className="prd-modal-scrim" onClick={() => setSignOutOpen(false)} aria-label="Cancel sign out" /><section className="prd-signout-dialog"><span className="prd-modal-icon"><LogOut size={20} /></span><p>Account session</p><h2 id="student-signout-title">Sign out of Placeble?</h2><small>You will need to sign in again to return to your workspace.</small><div><button type="button" onClick={() => setSignOutOpen(false)}>Stay signed in</button><button type="button" className="danger" onClick={onLogout}>Sign out</button></div></section></div>}
      {actionNotice && <div className="student-action-toast"><Check size={16} /><span>{actionNotice}</span><button onClick={() => setActionNotice("")} aria-label="Dismiss notification"><X size={14} /></button></div>}
    </div>
  );
}
