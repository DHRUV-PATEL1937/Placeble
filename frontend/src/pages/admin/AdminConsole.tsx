import { AssistantWidget } from "@/components/assistant/AssistantWidget";
import { RecentUpdates } from "@/components/ui/recent-updates";
import { BlogPage } from "./BlogPage";
import { Activity, BarChart3, Newspaper, Building2, Trash2, ClipboardList, GraduationCap, HeartPulse, Landmark, Megaphone, Settings, ShieldAlert, UsersRound } from "lucide-react";
import { useWorkspaceRoute } from "@/hooks/use-workspace-route";
import { AnnouncementsPage } from "@/pages/shared/AnnouncementsPage";
import { WorkspaceShell, type NavGroup } from "@/pages/shared/WorkspaceShell";
import { PageHeader } from "@/pages/tpo/tpo-core";
import { ActivityPage, AdminSettingsPage } from "./AdminActivity";
import { CollegesPage } from "./AdminColleges";
import { CompaniesPage } from "./AdminCompanies";
import { AlertsPage, HealthPage, OverviewPage } from "./AdminHome";
import { DeletionRequestsPage } from "./DeletionRequestsPage";
import { DirectStudentsScreen } from "./DirectStudentsScreen";
import { ProgramsScreen } from "./ProgramsScreen";
import { UniversitiesScreen } from "./UniversitiesScreen";
import "./admin.css";

const NAV: NavGroup[] = [
  { label: "Platform", items: [
    { key: "Overview", label: "Overview", icon: BarChart3 },
    { key: "System status", label: "System status", icon: HeartPulse },
    { key: "Alerts", label: "Alerts", icon: ShieldAlert },
  ] },
  { label: "Customers", items: [
    { key: "Colleges", label: "Colleges", icon: Building2 },
    { key: "Universities", label: "Universities", icon: Landmark },
    { key: "B2C students", label: "B2C students", icon: GraduationCap },
    { key: "Companies", label: "Companies", icon: UsersRound },
  ] },
  { label: "Content", items: [
    { key: "Programmes", label: "Programmes", icon: ClipboardList },
    { key: "Announcements", label: "Announcements", icon: Megaphone },
    { key: "Blog", label: "Blog", icon: Newspaper },
  ] },
  { label: "Admin", items: [
    { key: "Deletion requests", label: "Deletion requests", icon: Trash2 },
    { key: "Activity", label: "Activity history", icon: Activity },
    { key: "Settings", label: "Settings", icon: Settings },
  ] },
];
const KEYS = NAV.flatMap(group => group.items.map(item => item.key));

export function AdminConsole({ user, accessToken, onLogout }: { user: { name: string; email: string }; accessToken: string; onLogout: () => void }) {
  const [active, setActive] = useWorkspaceRoute("admin", KEYS, "Overview");
  return (
    <>
    <WorkspaceShell guideRole="platform_admin" nav={NAV} active={active} onNavigate={setActive} user={user} context="Platform admin" onLogout={onLogout} topbar={<strong className="st-crumb">{active}</strong>}>
      {({ notify }) => {
        switch (active) {
          case "System status": return <HealthPage accessToken={accessToken} />;
          case "Alerts": return <AlertsPage accessToken={accessToken} />;
          case "Colleges": return <CollegesPage accessToken={accessToken} notify={notify} />;
          case "Universities": return <><PageHeader title="Universities" description="Groups of colleges, each with its own university TPO." /><UniversitiesScreen accessToken={accessToken} notify={notify} /></>;
          case "B2C students": return <><PageHeader title="B2C students" description="People who signed up on their own. Manage their plans and access." /><DirectStudentsScreen accessToken={accessToken} /></>;
          case "Companies": return <CompaniesPage accessToken={accessToken} notify={notify} />;
          case "Programmes": return <><PageHeader title="Programmes" description="The list institutes and students choose their branch from." /><ProgramsScreen accessToken={accessToken} /></>;
          case "Announcements": return <AnnouncementsPage accessToken={accessToken} notify={notify} />;
          case "Blog": return <BlogPage accessToken={accessToken} notify={notify} />;
          case "Deletion requests": return <DeletionRequestsPage accessToken={accessToken} notify={notify} />;
          case "Activity": return <ActivityPage accessToken={accessToken} />;
          case "Settings": return <AdminSettingsPage accessToken={accessToken} notify={notify} />;
          default: return <><OverviewPage accessToken={accessToken} go={setActive} /><RecentUpdates accessToken={accessToken} /></>;
        }
      }}
    </WorkspaceShell>
    <AssistantWidget accessToken={accessToken} name={user.name} audience="admin" onNavigate={setActive} views={KEYS} />
    </>
  );
}
