import { AssistantWidget } from "@/components/assistant/AssistantWidget";
import { RecentUpdates } from "@/components/ui/recent-updates";
import {
  AlertTriangle, FileSpreadsheet, Split, ArrowLeft, Building2, Megaphone, LayoutDashboard, LogOut, Menu, MessageSquareText,
  Landmark, Moon, Search, Settings, ShieldCheck, Sun, UsersRound, X, type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LogoUploader, OrgBrand, useLiveBranding, type UserBranding } from "@/components/ui/org-brand";
import { InterventionQueue, NotificationCentre } from "@/components/workflow/workflow-panels";
import { useWorkspaceRoute } from "@/hooks/use-workspace-route";
import { InstitutionChat } from "@/pages/chat/InstitutionChat";
import { AccessPage } from "./AccessPage";
import { OverviewPage } from "./OverviewPage";
import { RosterPage } from "./RosterPage";
import { AnnouncementsPage } from "@/pages/shared/AnnouncementsPage";
import { BranchesPage } from "./BranchesPage";
import { SettingsPage } from "./SettingsPage";
import { StudentsPage } from "./StudentsPage";
import { UniversityPages } from "@/pages/university/UniversityPages";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { Avatar, Card, Modal, Toast, errorMessage, mapStudents, tpoApi, useLoad, type CohortSummary, type Notify } from "./tpo-core";
import "./tpo.css";

type User = { name: string; email: string; role: "tpo" | "recruiter" | "faculty" };

const NAV_GROUPS: Array<{ label: string; items: Array<{ key: string; label: string; icon: LucideIcon }> }> = [
  { label: "Workspace", items: [
    { key: "Overview", label: "Overview", icon: LayoutDashboard },
    { key: "Students", label: "Students", icon: UsersRound },
    { key: "Messages", label: "Messages", icon: MessageSquareText },
    { key: "Announcements", label: "Announcements", icon: Megaphone },
    { key: "Interventions", label: "Needs support", icon: AlertTriangle },
  ] },
  { label: "Admissions", items: [
    { key: "Roster", label: "Student roster", icon: FileSpreadsheet },
    { key: "Branches", label: "Branches & batches", icon: Split },
    { key: "Access requests", label: "Access requests", icon: ShieldCheck },
  ] },
  { label: "Account", items: [{ key: "Settings", label: "Settings", icon: Settings }] },
];
const UNIVERSITY_GROUP = { label: "University", items: [
  { key: "University", label: "University overview", icon: Landmark },
  { key: "Institutes", label: "Institutes", icon: Building2 },
] };
const UNIVERSITY_KEYS = ["University", "Institutes"];
const CHAT_PROPS = { role: "tpo" } as const;
const NAV_KEYS = NAV_GROUPS.flatMap(group => group.items.map(item => item.key));
const UNIVERSITY_NAV_KEYS = [...UNIVERSITY_KEYS, ...NAV_KEYS];
const TITLES = Object.fromEntries([...UNIVERSITY_GROUP.items, ...NAV_GROUPS.flatMap(group => group.items)].map(item => [item.key, item.label]));

/**
 * The one TPO workspace. An institute TPO works inside their college. A university TPO gets the same
 * workspace plus a University section, and picks which institute they are working in.
 */
export function TpoDashboard({ user, accessToken: baseToken, onLogout, university = false, branding }: { user: User; accessToken: string; onLogout: () => void; university?: boolean; branding?: UserBranding }) {
  const liveBranding = useLiveBranding(branding);
  const navGroups = useMemo(() => university ? [UNIVERSITY_GROUP, ...NAV_GROUPS] : NAV_GROUPS, [university]);
  const [active, setActive] = useWorkspaceRoute("tpo", university ? UNIVERSITY_NAV_KEYS : NAV_KEYS, university ? "University" : "Overview");
  const [acting, setActing] = useState<{ id: string; name: string; token: string } | null>(null);
  const [entering, setEntering] = useState("");
  const [enterError, setEnterError] = useState("");
  const latestBase = useRef(baseToken);
  useEffect(() => { latestBase.current = baseToken; }, [baseToken]);
  // Institute TPOs always work in their own college. University TPOs work in whichever institute they opened.
  const accessToken = university ? acting?.token ?? "" : baseToken;
  const needsInstitute = university && !acting;
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [dark, setDark] = useState(() => { const saved = window.localStorage.getItem("placeble-theme"); return saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches); });

  const cohort = useLoad(async () => {
    if (!accessToken) return { summary: null as CohortSummary | null, students: [] as ReturnType<typeof mapStudents> };
    const payload = await tpoApi<{ summary: CohortSummary; students: Parameters<typeof mapStudents>[0] }>("/readiness/cohort", accessToken);
    return { summary: payload.summary, students: mapStudents(payload.students) };
  }, [accessToken]);
  const college = useLoad(() => accessToken ? tpoApi<{ institution: { name: string; logoUrl?: string } }>("/tenancy/settings", accessToken) : Promise.resolve(null), [accessToken]);
  const invitedCount = cohort.data?.summary?.invited ?? 0;

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    window.localStorage.setItem("placeble-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => { document.title = `${TITLES[active] ?? "Dashboard"} | Placeble`; }, [active]);

  const notify: Notify = useCallback((message, tone = "success") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3600);
  }, []);
  const [chatWith, setChatWith] = useState<{ id: string; name: string; email: string; branch?: string } | null>(null);
  const goto = (page: string) => { setActive(page); setMenuOpen(false); if (page !== "Messages") setChatWith(null); };

  const enter = useCallback(async (id: string) => {
    setEntering(id); setEnterError("");
    try {
      const payload = await tpoApi<{ accessToken: string; institution: { name: string } }>(`/university/institutes/${id}/enter`, latestBase.current, { method: "POST" });
      setActing({ id, name: payload.institution.name, token: payload.accessToken });
      setSearch("");
      setActive("Overview");
    } catch (cause) { setEnterError(errorMessage(cause, "Could not open this institute.")); }
    finally { setEntering(""); }
  }, [setActive]);

  // The institute token lives as long as a normal one, so quietly renew it while the institute stays open.
  const actingId = acting?.id;
  useEffect(() => {
    if (!actingId) return;
    const timer = window.setInterval(() => {
      tpoApi<{ accessToken: string }>(`/university/institutes/${actingId}/enter`, latestBase.current, { method: "POST" })
        .then(payload => setActing(current => current && current.id === actingId ? { ...current, token: payload.accessToken } : current)).catch(() => undefined);
    }, 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [actingId]);

  const page = (() => {
    if (university && UNIVERSITY_KEYS.includes(active)) {
      return <UniversityPages page={active} accessToken={baseToken} notify={notify} go={goto} enter={id => void enter(id)} entering={entering} enterError={enterError} />;
    }
    if (needsInstitute) {
      return (
        <>
          <div className="tp-alert info" role="status"><Building2 size={16} aria-hidden="true" />{active === "Settings" ? "Choose an institute to change its settings. Your own password and security options are below." : `Choose an institute to open ${TITLES[active]?.toLowerCase() ?? "this page"}.`}</div>
          {active === "Settings" && liveBranding?.university && <Card title="University logo" description="Shown in the sidebar for you and the TPOs of your colleges."><LogoUploader name={liveBranding.university.name} logoUrl={liveBranding.university.logoUrl} accessToken={baseToken} path="/university/logo" notify={notify} scope="university" label="University logo" /></Card>}
          {active === "Settings" && <SettingsPage accessToken={baseToken} notify={notify} sections={["security"]} />}
          <UniversityPages page="Institutes" accessToken={baseToken} notify={notify} go={goto} enter={id => void enter(id)} entering={entering} enterError={enterError} />
        </>
      );
    }
    switch (active) {
      case "Messages": return <InstitutionChat key={chatWith?.id ?? "all"} {...CHAT_PROPS} accessToken={accessToken} openStudent={chatWith} onOpenStudents={() => goto("Students")} />;
      case "Interventions": return <><div className="tp-page-head"><div><h1>Students needing support</h1><p>Follow up with students whose readiness is falling behind.</p></div></div><InterventionQueue accessToken={accessToken} /></>;
      case "Students": return <StudentsPage students={cohort.data?.students ?? []} loading={cohort.loading} error={cohort.error} search={search} onSearch={setSearch} notify={notify} goto={goto} onMessage={student => { setChatWith({ id: student.id, name: student.name, email: student.email, branch: student.branch }); setActive("Messages"); setMenuOpen(false); }} />;
      case "Roster": return <RosterPage accessToken={accessToken} notify={notify} />;
      case "Announcements": return <AnnouncementsPage accessToken={accessToken} notify={notify} />;
      case "Branches": return <BranchesPage accessToken={accessToken} notify={notify} />;
      case "Access requests": return <AccessPage accessToken={accessToken} notify={notify} />;
      case "Settings": return <SettingsPage accessToken={accessToken} notify={notify} />;
      default: return <OverviewPage name={user.name} institution={college.data?.institution.name ?? ""} students={cohort.data?.students ?? []} summary={cohort.data?.summary ?? null} invitedCount={invitedCount} accessToken={accessToken} goto={goto} />;
    }
  })();

  return (
    <div className="tp-shell has-tabbar">
      <a className="tp-skip" href="#tp-main">Skip to content</a>
      <div className={`tp-scrim${menuOpen ? " show" : ""}`} onClick={() => setMenuOpen(false)} aria-hidden="true" />

      <aside className={`tp-sidebar${menuOpen ? " open" : ""}`} aria-label="Primary">
        <div className="tp-side-top">
          <picture><img className="tp-logo light" src="/placeble-logo-horizontal-color.svg" alt="Placeble" /><img className="tp-logo dark" src="/placeble-logo-horizontal-reversed.svg" alt="" /></picture>
          <button type="button" className="tp-icon-btn tp-only-mobile" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        {(() => {
            const instituteName = university ? acting?.name : college.data?.institution.name;
            const institution = instituteName ? { name: instituteName, logoUrl: liveBranding?.institution?.logoUrl ?? college.data?.institution.logoUrl ?? "" } : null;
            if (!institution && !liveBranding?.university) return <p className="tp-college">{university ? "University TPO" : ""}</p>;
            return <OrgBrand institution={institution} university={liveBranding?.university} />;
          })()}
        <nav>
          {navGroups.map(group => (
            <div key={group.label} className="tp-nav-group">
              <span>{group.label}</span>
              {group.items.map(({ key, label, icon: Icon }) => (
                <button key={key} type="button" className={active === key ? "active" : ""} aria-current={active === key ? "page" : undefined} onClick={() => goto(key)}>
                  <Icon size={18} aria-hidden="true" /><b>{label}</b>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <button type="button" className="tp-user" onClick={() => setSignOutOpen(true)}>
          <Avatar name={user.name} size={36} />
          <span><b>{user.name}</b><small>{user.email}</small></span>
          <LogOut size={17} aria-label="Sign out" />
        </button>
      </aside>

      <div className="tp-main">
        {acting && <div className="tp-acting" role="status"><Building2 size={16} aria-hidden="true" /><span>Working inside <b>{acting.name}</b> as university TPO</span><button type="button" onClick={() => { setActing(null); setSearch(""); setActive("Institutes"); }}><ArrowLeft size={14} aria-hidden="true" /> Switch institute</button></div>}
        <header className="tp-topbar">
          <button type="button" className="tp-icon-btn tp-only-mobile" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={19} /></button>
          <label className="tp-search"><Search size={16} aria-hidden="true" /><input value={search} onChange={event => { setSearch(event.target.value); if (event.target.value.trim() && active !== "Students") setActive("Students"); }} disabled={needsInstitute} placeholder={needsInstitute ? "Open an institute to search students" : "Search students"} aria-label="Search students" /></label>
          <div className="tp-top-actions">
            {accessToken && <NotificationCentre accessToken={accessToken} onOpen={goto} />}
            <button type="button" className="tp-icon-btn" onClick={() => setDark(value => !value)} aria-label={dark ? "Use light mode" : "Use dark mode"} title={dark ? "Use light mode" : "Use dark mode"}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
          </div>
        </header>
        <main key={active} id="tp-main" className={`tp-content${active === "Messages" ? " flush" : ""}`}>{page}{accessToken && (active === "Overview" || active === "University") && <RecentUpdates accessToken={baseToken} />}</main>
      </div>

      <MobileTabBar items={navGroups.flatMap(group => group.items)} active={active} onSelect={goto} user={user} onSignOut={() => setSignOutOpen(true)} />

      {signOutOpen && (
        <Modal title="Sign out of Placeble?" description="You’ll need to sign in again to return to this workspace." onClose={() => setSignOutOpen(false)}>
          <footer className="tp-modal-foot"><button type="button" className="tp-btn ghost" onClick={() => setSignOutOpen(false)}>Stay signed in</button><button type="button" className="tp-btn danger-solid" onClick={onLogout}>Sign out</button></footer>
        </Modal>
      )}
      {toast && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}
      <AssistantWidget accessToken={accessToken || baseToken} name={user.name} audience={university && !acting ? "university" : "tpo"} onNavigate={goto}
        views={needsInstitute ? [...UNIVERSITY_KEYS, "Settings"] : university ? UNIVERSITY_NAV_KEYS : NAV_KEYS} />
    </div>
  );
}
