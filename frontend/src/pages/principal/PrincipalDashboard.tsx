import { AssistantWidget } from "@/components/assistant/AssistantWidget";
import { RecentUpdates } from "@/components/ui/recent-updates";
import { CalendarRange, Download, GraduationCap, LayoutDashboard, Search, Settings, Split, UsersRound, AlertTriangle, TrendingUp, UserCheck, Eye } from "lucide-react";
import { useMemo, useState } from "react";
import { OrgBrand, useLiveBranding, type UserBranding } from "@/components/ui/org-brand";
import { WorkspaceShell, type NavGroup } from "@/pages/shared/WorkspaceShell";
import { StudentReportModal } from "@/pages/shared/StudentReport";
import { useWorkspaceRoute } from "@/hooks/use-workspace-route";
import { SecuritySettings } from "@/pages/tpo/SettingsPage";
import type { Batch } from "@/pages/tpo/BranchesPage";
import { Avatar, Card, EmptyState, ErrorState, Loading, PageHeader, Pager, ScoreBar, StatCard, StatusPill, downloadFile, tpoApi, toCsv, useLoad, type Notify, type Student } from "@/pages/tpo/tpo-core";

type BatchOption = { id: string; label: string; period: string; state: string };
type Overview = { batches?: BatchOption[]; summary: { studentCount: number; average: number; placementReady: number; atRisk: number; rosterTotal: number; registered: number; signedIn?: number; invited?: number }; branches: Array<{ branchId: string | null; name: string; students: number; average: number; ready: number; atRisk: number; resume: number; aptitude: number; interview: number }> };
type Row = Student & { batchId?: string | null; batchLabel?: string; loginStatus?: "active" | "invited"; branchId: string | null; branchName: string; rollNumber: string; batchYear: number | null; components: { resume: number; aptitude: number; interview: number } };
type BranchRow = { id: string; name: string; code: string; status: string; students: number; registered: number };

const NAV: NavGroup[] = [
  { label: "Reports", items: [
    { key: "Overview", label: "Overview", icon: LayoutDashboard },
    { key: "Students", label: "Students", icon: UsersRound },
    { key: "Branches", label: "Branches", icon: Split },
    { key: "Batches", label: "Batches", icon: CalendarRange },
  ] },
  { label: "Account", items: [{ key: "Settings", label: "Settings", icon: Settings }] },
];
const KEYS = NAV.flatMap(group => group.items.map(item => item.key));

export function PrincipalDashboard({ user, accessToken, onLogout, branding }: { user: { name: string; email: string }; accessToken: string; onLogout: () => void; branding?: UserBranding }) {
  const live = useLiveBranding(branding);
  const [active, setActive] = useWorkspaceRoute("principal", KEYS, "Overview");
  const college = useLoad(() => tpoApi<{ institution: { name: string } }>("/institution/me", accessToken).then(payload => payload.institution.name), [accessToken]);

  return (
    <>
    <WorkspaceShell guideRole="principal" supportToken={accessToken} nav={NAV} active={active} onNavigate={setActive} user={user} context={college.data || "Principal view"} brand={live?.institution || live?.university ? <OrgBrand institution={live?.institution} university={live?.university} /> : undefined} onLogout={onLogout} topbar={<span className="st-crumb"><Eye size={15} aria-hidden="true" /> Read-only access</span>}>
      {({ notify }) => active === "Overview" ? <><OverviewReport accessToken={accessToken} name={user.name} go={setActive} /><RecentUpdates accessToken={accessToken} /></> : active === "Students" ? <StudentsReport accessToken={accessToken} notify={notify} /> : active === "Branches" ? <BranchesReport accessToken={accessToken} /> : active === "Batches" ? <BatchesReport accessToken={accessToken} /> : active === "Settings" ? <><PageHeader title="Settings" description="Your account." /><SecuritySettings accessToken={accessToken} notify={notify} /></> : <OverviewReport accessToken={accessToken} name={user.name} go={setActive} />}
    </WorkspaceShell>
    <AssistantWidget accessToken={accessToken} name={user.name} audience="principal" onNavigate={setActive} views={KEYS} />
    </>
  );
}

function OverviewReport({ accessToken, name, go }: { accessToken: string; name: string; go: (key: string) => void }) {
  const [batchId, setBatchId] = useState("");
  const { data, loading, error, reload } = useLoad(() => tpoApi<Overview>(`/reports/overview${batchId ? `?batchId=${batchId}` : ""}`, accessToken), [accessToken, batchId]);
  return (
    <>
      <PageHeader title={`Welcome, ${name.split(" ")[0]}`} description="How your students are preparing for placements." actions={data?.batches?.length ? <select className="tp-select" value={batchId} onChange={event => setBatchId(event.target.value)} aria-label="Filter by batch"><option value="">All batches</option>{data.batches.map(batch => <option key={batch.id} value={batch.id}>{batch.label} ({batch.period})</option>)}</select> : undefined} />
      {loading && !data ? <Card><Loading label="Preparing your reports…" /></Card> : error || !data ? <Card><ErrorState message={error || "Could not load reports."} onRetry={reload} /></Card> : (
        <>
          <div className="tp-stats">
            <StatCard icon={TrendingUp} label="Average readiness" value={data.summary.average} note="Across all students" />
            <StatCard icon={UserCheck} label="Placement-ready" value={data.summary.placementReady} note={`${data.summary.studentCount ? Math.round(data.summary.placementReady / data.summary.studentCount * 100) : 0}% of students`} tone="green" />
            <StatCard icon={GraduationCap} label="Signed in" value={data.summary.signedIn ?? data.summary.studentCount} note={data.summary.invited ? `${data.summary.invited} invited, not signed in yet` : `${data.summary.rosterTotal} on the roster`} tone="amber" />
            <StatCard icon={AlertTriangle} label="Need support" value={data.summary.atRisk} note="Readiness below 45" tone="red" />
          </div>
          <Card title="By branch" description="Average scores for each programme." actions={<button type="button" className="tp-btn secondary sm" onClick={() => go("Students")}>View students</button>} flush>
            {data.branches.length ? (
              <div className="tp-table" role="table" aria-label="Branch report">
                <div className="tp-tr head cols-branch" role="row"><span role="columnheader">Branch</span><span role="columnheader">Students</span><span role="columnheader">Readiness</span><span role="columnheader">Ready</span><span role="columnheader">Need support</span></div>
                {data.branches.map(branch => (
                  <div className="tp-tr cols-branch" role="row" key={branch.branchId ?? "none"}>
                    <span role="cell"><b>{branch.name}</b></span>
                    <span role="cell" data-label="Students">{branch.students}</span>
                    <span role="cell" data-label="Readiness"><ScoreBar value={branch.average} /></span>
                    <span role="cell" data-label="Ready">{branch.ready}</span>
                    <span role="cell" data-label="Need support">{branch.atRisk}</span>
                  </div>
                ))}
              </div>
            ) : <EmptyState icon={Split} title="No students yet" text="Branch reports appear once students register." />}
          </Card>
        </>
      )}
    </>
  );
}

const PAGE_SIZE = 12;

function StudentsReport({ accessToken, notify }: { accessToken: string; notify: Notify }) {
  const { data, loading, error, reload } = useLoad(() => tpoApi<{ students: Row[] }>("/reports/students", accessToken).then(payload => payload.students), [accessToken]);
  const [search, setSearch] = useState("");
  const [branch, setBranch] = useState("all");
  const [status, setStatus] = useState("all");
  const [login, setLogin] = useState("all");
  const [batch, setBatch] = useState("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);

  const branches = useMemo(() => [...new Set((data ?? []).map(row => row.branchName).filter(Boolean))].sort(), [data]);
  const batchOptions = useMemo(() => [...new Map((data ?? []).filter(row => row.batchId).map(row => [row.batchId!, `${row.branchName} ${row.batchLabel}`.trim()])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [data]);
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? []).filter(row => (branch === "all" || row.branchName === branch) && (batch === "all" || row.batchId === batch) && (status === "all" || row.status === status) && (login === "all" || (login === "invited" ? row.loginStatus === "invited" : row.loginStatus !== "invited")) && (!term || `${row.name} ${row.email} ${row.rollNumber}`.toLowerCase().includes(term)));
  }, [data, search, branch, batch, status, login]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visible = rows.slice((Math.min(page, pages) - 1) * PAGE_SIZE, Math.min(page, pages) * PAGE_SIZE);

  const exportRows = () => { downloadFile("students-report.csv", toCsv(["Name", "Email", "Roll number", "Branch", "Batch", "Readiness", "Resume", "Aptitude", "Interview", "Status", "Signed in"], rows.map(r => [r.name, r.email, r.rollNumber, r.branchName, r.batchLabel || r.batchYear || "", r.readiness, r.components.resume, r.components.aptitude, r.components.interview, r.status, r.loginStatus === "invited" ? "No" : "Yes"]))); notify(`${rows.length} students exported.`); };

  return (
    <>
      <PageHeader title="Students" description="Open any student for their full report." actions={<button type="button" className="tp-btn secondary" onClick={exportRows} disabled={!rows.length}><Download size={16} aria-hidden="true" /> Export CSV</button>} />
      <Card flush>
        <div className="tp-toolbar">
          <label className="tp-search"><Search size={16} aria-hidden="true" /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search name, email or roll number" aria-label="Search students" /></label>
          <select className="tp-select" value={branch} onChange={event => { setBranch(event.target.value); setPage(1); }} aria-label="Filter by branch"><option value="all">All branches</option>{branches.map(item => <option key={item}>{item}</option>)}</select>
          <select className="tp-select" value={batch} onChange={event => { setBatch(event.target.value); setPage(1); }} aria-label="Filter by batch"><option value="all">All batches</option>{batchOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
          <select className="tp-select" value={login} onChange={event => { setLogin(event.target.value); setPage(1); }} aria-label="Filter by sign-in"><option value="all">Everyone</option><option value="active">Signed in</option><option value="invited">Not signed in yet</option></select>
          <select className="tp-select" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} aria-label="Filter by status"><option value="all">Any status</option>{["Ready", "On track", "Stalled", "At risk"].map(item => <option key={item}>{item}</option>)}</select>
        </div>
        {loading && !data ? <Loading label="Loading students…" /> : error ? <ErrorState message={error} onRetry={reload} /> : !rows.length ? <EmptyState icon={UsersRound} title="No students match" text="Try a different search or filter." /> : (
          <>
            <div className="tp-table" role="table" aria-label="Students">
              <div className="tp-tr head cols-report" role="row"><span role="columnheader">Student</span><span role="columnheader">Branch</span><span role="columnheader">Readiness</span><span role="columnheader">Status</span><span role="columnheader" /></div>
              {visible.map(row => (
                <div className="tp-tr cols-report" role="row" key={row.id}>
                  <span className="tp-cell-person" role="cell"><Avatar name={row.name} /><b>{row.name}<small>{row.rollNumber || row.email}</small></b></span>
                  <span role="cell" data-label="Branch">{[row.branchName, row.batchLabel || row.batchYear].filter(Boolean).join(" · ") || "—"}</span>
                  <span role="cell" data-label="Readiness"><ScoreBar value={row.readiness} /></span>
                  <span role="cell">{row.loginStatus === "invited" ? <span className="tp-pill st-neutral">Invited</span> : <StatusPill status={row.status} />}</span>
                  <span role="cell" className="tp-cell-end"><button type="button" className="tp-btn ghost sm" onClick={() => setOpen(row.id)} aria-label={`Open report for ${row.name}`}>Report</button></span>
                </div>
              ))}
            </div>
            <Pager page={Math.min(page, pages)} pages={pages} total={rows.length} pageSize={PAGE_SIZE} onChange={setPage} />
          </>
        )}
      </Card>
      {open && <StudentReportModal studentId={open} accessToken={accessToken} onClose={() => setOpen(null)} />}
    </>
  );
}

function BranchesReport({ accessToken }: { accessToken: string }) {
  const { data, loading, error, reload } = useLoad(() => tpoApi<{ branches: BranchRow[] }>("/branches", accessToken).then(payload => payload.branches), [accessToken]);
  return (
    <>
      <PageHeader title="Branches" description="Programmes at your institute." />
      <Card flush>
        {loading && !data ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.length ? <EmptyState icon={Split} title="No branches yet" text="Your placement office adds branches, or they’re created from the student roster." /> : (
          <ul className="tp-queue">{data.map(branch => (
            <li key={branch.id}>
              <span className="tp-icon-tile"><Split size={20} aria-hidden="true" /></span>
              <div className="tp-queue-main"><strong>{branch.name}{branch.code && <small> · {branch.code}</small>}</strong><small>{branch.students} on roster · {branch.registered} registered</small></div>
              <span className={`tp-pill ${branch.status === "active" ? "st-ready" : "st-neutral"}`}>{branch.status === "active" ? "Active" : "Archived"}</span>
            </li>
          ))}</ul>
        )}
      </Card>
    </>
  );
}

const STATE_LABEL: Record<Batch["state"], string> = { upcoming: "Upcoming", active: "Active", graduated: "Graduated · read-only", closed: "Access closed" };
const STATE_CLASS: Record<Batch["state"], string> = { upcoming: "st-neutral", active: "st-ready", graduated: "st-stalled", closed: "st-at-risk" };

/** Every batch at the institute with its dates and how many students it has. Read-only: only the TPO changes dates. */
function BatchesReport({ accessToken }: { accessToken: string }) {
  const { data, loading, error, reload } = useLoad(() => tpoApi<{ batches: Batch[] }>("/batches", accessToken).then(payload => payload.batches), [accessToken]);
  return (
    <>
      <PageHeader title="Batches" description="Each intake at your institute, with its dates and students. The placement office manages the dates." />
      <Card flush>
        {loading && !data ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.length ? <EmptyState icon={CalendarRange} title="No batches yet" text="Your placement office adds batches, like MCA 2025–2027." /> : (
          <div className="tp-table" role="table" aria-label="Batches">
            <div className="tp-tr head cols-batch-ro" role="row"><span role="columnheader">Batch</span><span role="columnheader">Duration</span><span role="columnheader">Students</span><span role="columnheader">Status</span></div>
            {data.map(batch => (
              <div className="tp-tr cols-batch-ro" role="row" key={batch.id}>
                <span role="cell"><b>{batch.branchName} · {batch.label}</b></span>
                <span role="cell" data-label="Duration">{batch.period}</span>
                <span role="cell" data-label="Students">{batch.students}<small className="tp-sub">{batch.registered} signed up</small></span>
                <span role="cell"><em className={`tp-pill ${STATE_CLASS[batch.state]}`}>{STATE_LABEL[batch.state]}</em></span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
