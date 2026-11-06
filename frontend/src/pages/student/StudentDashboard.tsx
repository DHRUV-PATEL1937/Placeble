import { AssistantWidget } from "@/components/assistant/AssistantWidget";
import { OrgBrand, useLiveBranding, type UserBranding } from "@/components/ui/org-brand";
import { Crown, GraduationCap, LayoutDashboard, LogOut, Menu, MessageSquareText, Moon, Settings, Sun, TrendingUp, UserRound, WandSparkles, X, type LucideIcon, ChevronRight, House, Target, ChartNoAxesColumn, Gem, MessageCircle, LayoutGrid } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { NotificationCentre } from "@/components/workflow/workflow-panels";
import { useWorkspaceRoute } from "@/hooks/use-workspace-route";
import { API_URL } from "@/pages/auth/auth-shared";
import { InstitutionChat } from "@/pages/chat/InstitutionChat";
import { Avatar, Modal, PageHeader, Toast, type Notify } from "@/pages/tpo/tpo-core";
import "@/pages/tpo/tpo.css";
import { AptitudeTest } from "./AptitudeTestPage";
import { CaseStudyLab } from "./CaseStudyPage";
import { HRSimulator } from "./HRSimulatorPage";
import { CodingPractice } from "./CodingPracticePage";
import { CoverLetter } from "./CoverLetterPage";
import { GroupDiscussion } from "./GroupDiscussionPage";
import { JobMatching, preloadJobMatching } from "./JobMatchingPage";
import { MockInterview } from "./MockInterviewPage";
import { ResumeMaker } from "./ResumeMakerPage";
import { WelcomeTour } from "@/components/onboarding/WelcomeTour";
import { HomePage, ProfilePage, ProgressPage, SettingsPage, ToolsPage } from "./home/StudentPages";
import { LimitModal, PlanPage } from "./home/PlanPage";
import { SHOW_GROUP_DISCUSSION, SHOW_JOB_MATCHING, STUDENT_VIEWS, TOOL_VIEWS, type ReadinessPayload, type View } from "./home/st-core";
import "./home/student.css";

const STUDENT_CHAT = { role: "student" } as const;
type StudentUser = { name: string; email: string; branding?: UserBranding; studentVerificationStatus?: string | null; accountType?: "direct" | "institute" | null; plan?: { plan: "free" | "pro" } | null; graduate?: { endedAt: string; closesAt: string } | null; guidance?: { programCode: string | null; programName: string; interviewStyle: "technical" | "business" | "mixed"; roles: string[]; tools?: { coding: boolean; caseStudy?: boolean; hrSimulator?: boolean } } | null };

const NAV: Array<{ label: string; items: Array<{ view: View; label: string; icon: LucideIcon }> }> = [
  { label: "Learn", items: [
    { view: "Overview", label: "Home", icon: LayoutDashboard },
    { view: "Agents", label: "Career Studio", icon: WandSparkles },
    { view: "Progress", label: "My progress", icon: TrendingUp },
  ] },
  { label: "Connect", items: [{ view: "Messages", label: "Messages", icon: MessageSquareText }] },
  { label: "Account", items: [
    { view: "Profile", label: "Profile", icon: UserRound },
    { view: "Settings", label: "Settings", icon: Settings },
  ] },
];
const TITLES: Partial<Record<View, string>> = { Overview: "Home", Agents: "Career Studio", Progress: "My progress", Messages: "Messages", Plan: "Plan", "Coding Practice": "Coding practice", "Case Study": "Business Case Solver", "HR Simulator": "HR Manager Simulator", Profile: "Profile", Settings: "Settings", "Resume Maker": "Resume builder", "Aptitude Test": "Aptitude practice", "Mock Interview": "Interview Room", "Cover Letter": "Cover letter", "Job Matching": "Job matching", "Group Discussion": "Group discussion", Opportunities: "Opportunities", Applications: "Applications" };

function NotInProgramme({ name, onBack }: { name: string; onBack: () => void }) {
  return (
    <>
      <PageHeader title="Not part of your programme" description={`${name} is built for business programmes (MBA, BBA and related courses).`} />
      <button type="button" className="tp-btn primary" onClick={onBack}>Back to practice tools</button>
    </>
  );
}

export function StudentDashboard({ user, accessToken, onLogout }: { user: StudentUser; accessToken: string; onLogout: () => void }) {
  const branding = useLiveBranding(user.branding);
  const [current, setCurrent] = useWorkspaceRoute("student", STUDENT_VIEWS, "Overview");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = window.localStorage.getItem("placeble-theme");
    return saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [readiness, setReadiness] = useState<ReadinessPayload | null>(null);
  const [loaded, setLoaded] = useState(false);
  // New-student guidance. The tour opens once, only for someone with no practice yet; the checklist hides itself when done or dismissed.
  const tourKey = `placeble-tour-v1:${user.email}`;
  const guideKey = `placeble-guide-hidden:${user.email}`;
  const flag = (key: string) => { try { return window.localStorage.getItem(key) === "1"; } catch { return false; } };
  const setFlag = (key: string) => { try { window.localStorage.setItem(key, "1"); } catch { /* storage blocked */ } };
  const [tourOpen, setTourOpen] = useState(false);
  const [guideHidden, setGuideHidden] = useState(() => flag(guideKey));
  // A student who signed up on their own has no college: no messages, and a plan with free-tier limits.
  const direct = user.accountType === "direct";
  const navGroups = NAV.filter(group => !direct || group.label !== "Connect").map(group => group.label === "Account" && direct ? { ...group, items: [{ view: "Plan" as View, label: "Plan", icon: Crown }, ...group.items] } : group);

  // Phones get a bottom bar with the four places students use most; the rest live under "More".
  const bottomItems: Array<{ view: View; label: string; icon: LucideIcon }> = [
    { view: "Overview", label: "Home", icon: House }, { view: "Agents", label: "Studio", icon: Target }, { view: "Progress", label: "Progress", icon: ChartNoAxesColumn },
    direct ? { view: "Plan", label: "Plan", icon: Gem } : { view: "Messages", label: "Messages", icon: MessageCircle },
  ];
  const moreItems: Array<{ view: View; label: string; icon: LucideIcon }> = [{ view: "Profile", label: "Profile", icon: UserRound }, { view: "Settings", label: "Settings", icon: Settings }];
  const moreViews: View[] = moreItems.map(item => item.view);

  const notify: Notify = useCallback((message, tone = "success") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3600);
  }, []);
  const go = useCallback((view: View) => { setCurrent(view); setMenuOpen(false); }, [setCurrent]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("placeble-theme", theme);
  }, [theme]);
  useEffect(() => { document.documentElement.dataset.reducedMotion = window.localStorage.getItem("placeble-reduced-motion") === "true" ? "true" : "false"; }, []);
  useEffect(() => { document.title = `${TITLES[current] ?? "Dashboard"} | Placeble`; }, [current]);
  useEffect(() => {
    if (!accessToken || !SHOW_JOB_MATCHING) return;
    const timer = window.setTimeout(() => void preloadJobMatching(accessToken), 1200);
    return () => window.clearTimeout(timer);
  }, [accessToken]);
  useEffect(() => {
    if (!accessToken) return;
    let live = true;
    fetch(`${API_URL}/readiness/me`, { headers: { Authorization: `Bearer ${accessToken}` }, credentials: "include" })
      .then(response => response.ok ? response.json() : Promise.reject(new Error("Readiness unavailable")))
      .then(payload => { if (live) setReadiness(payload); })
      .catch(() => { if (live) setReadiness(null); })
      .finally(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, [accessToken, current]);

  useEffect(() => {
    if (!loaded || flag(tourKey)) return;
    const evidence = readiness?.current?.evidenceCount ?? 0;
    setFlag(tourKey);
    if (evidence === 0) setTourOpen(true);
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  const guide = { show: !guideHidden, onTour: () => setTourOpen(true), onDismiss: () => { setGuideHidden(true); setFlag(guideKey); } };

  const isTool = TOOL_VIEWS.includes(current) || current === "Opportunities" || current === "Applications";
  const activeNav: View = isTool ? "Agents" : current;
  const toolBack = () => go("Agents");

  const page = (() => {
    switch (current) {
      case "Overview": return <HomePage name={user.name} readiness={readiness} loaded={loaded} accessToken={accessToken} go={go} guidance={user.guidance} guide={guide} />;
      case "Agents": return <ToolsPage readiness={readiness} go={go} guidance={user.guidance} />;
      case "Progress": return <ProgressPage readiness={readiness} loaded={loaded} go={go} />;
      case "Messages": return <><PageHeader title="Messages" description="A direct line to your placement team." /><InstitutionChat {...STUDENT_CHAT} accessToken={accessToken} /></>;
      case "Plan": return <PlanPage accessToken={accessToken} notify={notify} />;
      case "Profile": return <ProfilePage accessToken={accessToken} notify={notify} />;
      case "Settings": return <SettingsPage theme={theme} setTheme={setTheme} accessToken={accessToken} notify={notify} direct={direct} />;
      case "Resume Maker": return <ResumeMaker user={user} accessToken={accessToken} onBack={toolBack} />;
      case "Aptitude Test": return <AptitudeTest accessToken={accessToken} onBack={toolBack} />;
      case "Mock Interview": return <MockInterview accessToken={accessToken} onBack={toolBack} onOpenResume={() => go("Resume Maker")} />;
      case "Cover Letter": return <CoverLetter accessToken={accessToken} onBack={toolBack} onOpenResume={() => go("Resume Maker")} />;
      case "Coding Practice": return <CodingPractice accessToken={accessToken} onBack={toolBack} available={user.guidance?.tools?.coding !== false} />;
      // Business tools belong to business programmes (MBA, BBA, ...). Anyone else who lands here by a stale link is sent back.
      case "Case Study": return user.guidance?.tools?.caseStudy ? <CaseStudyLab accessToken={accessToken} onBack={toolBack} /> : <NotInProgramme name="The Business Case Solver" onBack={toolBack} />;
      case "HR Simulator": return user.guidance?.tools?.hrSimulator ? <HRSimulator accessToken={accessToken} onBack={toolBack} /> : <NotInProgramme name="The HR Manager Simulator" onBack={toolBack} />;
      case "Group Discussion": return <GroupDiscussion accessToken={accessToken} onBack={toolBack} />;
      case "Job Matching": return <JobMatching accessToken={accessToken} onBack={toolBack} />;
      case "Opportunities": return <JobMatching accessToken={accessToken} initialSurface="feed" onBack={() => go("Overview")} />;
      case "Applications": return <JobMatching accessToken={accessToken} initialSurface="tracker" onBack={() => go("Overview")} />;
      default: return <HomePage name={user.name} readiness={readiness} loaded={loaded} accessToken={accessToken} go={go} guidance={user.guidance} guide={guide} />;
    }
  })();

  return (
    <div className={`tp-shell st-shell${moreOpen ? " st-more-open" : ""}`}>
      <a className="tp-skip" href="#st-main">Skip to content</a>
      <div className={`tp-scrim${menuOpen ? " show" : ""}`} onClick={() => setMenuOpen(false)} aria-hidden="true" />

      <aside className={`tp-sidebar${menuOpen ? " open" : ""}`} aria-label="Primary">
        <div className="tp-side-top">
          <picture><img className="tp-logo light" src="/placeble-logo-horizontal-color.svg" alt="Placeble" /><img className="tp-logo dark" src="/placeble-logo-horizontal-reversed.svg" alt="" /></picture>
          <button type="button" className="tp-icon-btn tp-only-mobile" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        {branding && (branding.institution || branding.university) && <OrgBrand institution={branding.institution} university={branding.university} />}
        <nav>
          {navGroups.map(group => (
            <div key={group.label} className="tp-nav-group">
              <span>{group.label}</span>
              {group.items.map(({ view, label, icon: Icon }) => (
                <button key={view} type="button" className={activeNav === view ? "active" : ""} aria-current={activeNav === view ? "page" : undefined} onClick={() => go(view)}><Icon size={18} aria-hidden="true" /><b>{label}</b></button>
              ))}
            </div>
          ))}
        </nav>
        {direct && user.plan?.plan !== "pro" && <button type="button" className="st-upgrade" onClick={() => go("Plan")}><Crown size={16} aria-hidden="true" /><span><b>Free plan</b><small>Upgrade for unlimited practice</small></span></button>}
        <button type="button" className="tp-user" onClick={() => setSignOutOpen(true)} aria-label={`Sign out ${user.name}`}>
          <Avatar name={user.name} size={36} />
          <span><b>{user.name}</b><small>{user.email}</small></span>
          <LogOut size={17} aria-hidden="true" />
        </button>
      </aside>

      <div className="tp-main">
        {user.graduate && <div className="st-graduate" role="status"><GraduationCap size={18} aria-hidden="true" /><span><b>Congratulations, you’ve graduated!</b> Your workspace is now read-only. You can still view and download your resume and reports until {new Date(user.graduate.closesAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.</span></div>}
        <header className="tp-topbar">
          <button type="button" className="tp-icon-btn tp-only-mobile st-menu-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={19} /></button>
          <img className="st-top-logo" src="/placeble-favicon.svg" alt="Placeble" width={30} height={30} />
          <strong className="st-crumb">{TITLES[current]}</strong>
          <div className="tp-top-actions">
            <NotificationCentre accessToken={accessToken} onOpen={view => go(view as View)} />
            <button type="button" className="tp-icon-btn" onClick={() => setTheme(value => value === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Use light mode" : "Use dark mode"} title={theme === "dark" ? "Use light mode" : "Use dark mode"}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
          </div>
        </header>
        <main key={current} id="st-main" className={`tp-content${isTool ? " st-tool-host" : ""}${current === "Messages" ? " st-chat-host" : ""}`}>{page}</main>
      </div>

      <nav className="st-bottomnav" aria-label="Main">
        {bottomItems.map(({ view, label, icon: Icon }) => (
          <button key={view} type="button" className={activeNav === view ? "active" : ""} aria-current={activeNav === view ? "page" : undefined} onClick={() => go(view)}><i className="st-nav-ic"><Icon size={21} strokeWidth={activeNav === view ? 2.4 : 1.9} aria-hidden="true" /></i><span>{label}</span></button>
        ))}
        <button type="button" className={moreOpen || moreViews.includes(activeNav) ? "active" : ""} aria-haspopup="dialog" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)}><i className="st-nav-ic"><LayoutGrid size={21} strokeWidth={moreOpen || moreViews.includes(activeNav) ? 2.4 : 1.9} aria-hidden="true" /></i><span>More</span></button>
      </nav>
      {moreOpen && (
        <div className="st-sheet-layer" role="presentation">
          <button type="button" className="st-sheet-scrim" aria-label="Close menu" onClick={() => setMoreOpen(false)} />
          <section className="st-sheet" role="dialog" aria-label="More">
            <span className="st-sheet-grab" aria-hidden="true" />
            <div className="st-sheet-user"><Avatar name={user.name} size={44} /><span><b>{user.name}</b><small>{user.email}</small></span></div>
            {branding && (branding.institution || branding.university) && <OrgBrand institution={branding.institution} university={branding.university} />}
            <ul>
              {moreItems.map(({ view, label, icon: Icon }) => (
                <li key={view}><button type="button" className={activeNav === view ? "active" : ""} onClick={() => { setMoreOpen(false); go(view); }}><Icon size={19} aria-hidden="true" /><b>{label}</b><ChevronRight size={16} aria-hidden="true" /></button></li>
              ))}
              <li><button type="button" className="danger" onClick={() => { setMoreOpen(false); setSignOutOpen(true); }}><LogOut size={19} aria-hidden="true" /><b>Sign out</b></button></li>
            </ul>
          </section>
        </div>
      )}
      {direct && <LimitModal accessToken={accessToken} onSeePlans={() => go("Plan")} />}
      <AssistantWidget accessToken={accessToken} name={user.name} audience="student" onNavigate={view => go(view as View)}
        views={["Overview", "Profile", "Progress", "Agents", "Resume Maker", "Aptitude Test", "Mock Interview", "Cover Letter", "Settings", ...(user.guidance?.tools?.coding ? ["Coding Practice"] : []), ...(user.guidance?.tools?.caseStudy ? ["Case Study"] : []), ...(user.guidance?.tools?.hrSimulator ? ["HR Simulator"] : []), ...(direct ? ["Plan"] : ["Messages"]), ...(SHOW_JOB_MATCHING ? ["Job Matching"] : []), ...(SHOW_GROUP_DISCUSSION ? ["Group Discussion"] : [])]} />
      {signOutOpen && (
        <Modal title="Sign out of Placeble?" description="You’ll need to sign in again to return to your workspace." onClose={() => setSignOutOpen(false)}>
          <footer className="tp-modal-foot"><button type="button" className="tp-btn ghost" onClick={() => setSignOutOpen(false)}>Stay signed in</button><button type="button" className="tp-btn danger-solid" onClick={onLogout}>Sign out</button></footer>
        </Modal>
      )}
      {tourOpen && <WelcomeTour firstName={user.name.split(" ")[0]} onClose={() => setTourOpen(false)} onGo={view => go(view as View)} />}
      {toast && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}
    </div>
  );
}
