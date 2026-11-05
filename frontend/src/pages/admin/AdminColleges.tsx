import { DomainInput } from "@/components/ui/domain-input";
import { AlertTriangle, ArrowLeft, Building2, KeyRound, Plus, Search } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Avatar, Card, EmptyState, ErrorState, Loading, Modal, PageHeader, Pager, ScoreBar, StatCard, errorMessage, formatDate, tpoApi, useLoad, type Notify } from "@/pages/tpo/tpo-core";
import { LogoUploader } from "@/components/ui/org-brand";
import { AccountTypeFields, CommercialPanel, PilotBadge, type Commercial, type CommercialInput } from "./CommercialPanel";
import { StudentReportModal } from "@/pages/shared/StudentReport";
import { ReasonModal, SecretBox, StatusChip } from "./admin-ui";

type College = { _id: string; commercial?: Commercial; name: string; slug: string; approvedEmailDomains: string[]; officialDomains: string[]; status: "active" | "suspended" | "pending"; studentCount: number; signedInCount?: number; invitedCount?: number; tpoCount: number; rosterTotal: number; rosterMatched: number; rosterMatchRate: number; averageReadiness: number; createdAt: string };
type Detail = {
  commercial?: Commercial;
  logins: { signedIn: number; invited: number; pending: Array<{ name: string; email: string; invitedAt: string | null }> }; institution: College;
  primaryTpo?: { _id: string; name: string; email: string; status: string; lastLoginAt?: string };
  roster: { total: number; matched: number; unmatched: number; entries: Array<{ _id: string; fullName: string; email: string; rollNumber?: string; branch?: string; batchYear?: number; status: "matched" | "unmatched" }> };
  engagement: { resumes: number; aptitude: number; interviews: number; groupDiscussions: number; applications: number };
  readiness: { summary: { studentCount: number; average: number; placementReady: number; atRisk: number; distribution: number[] } };
  drives: Array<{ _id: string; title: string; companyName: string; status: string; startsAt?: string; grants: Array<{ _id: string; status: string; recruiterOrgId?: { companyName: string } }> }>;
};
const domains = (college: College) => (college.approvedEmailDomains?.length ? college.approvedEmailDomains : college.officialDomains) ?? [];
const PAGE = 12;

export function CollegesPage({ accessToken, notify }: { accessToken: string; notify: Notify }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("onboarded");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => { const timer = window.setTimeout(() => { setSearch(query); setPage(1); }, 250); return () => window.clearTimeout(timer); }, [query]);
  const list = useLoad(() => tpoApi<{ institutions: College[] }>(`/platform-admin/institutions?search=${encodeURIComponent(search)}&status=${status}&sort=${sort}&order=desc`, accessToken).then(payload => payload.institutions), [accessToken, search, status, sort]);

  if (openId) return <CollegeDetail id={openId} accessToken={accessToken} notify={notify} onBack={() => { setOpenId(null); list.reload(); }} />;
  const rows = list.data ?? [];
  const visible = rows.slice((page - 1) * PAGE, page * PAGE);

  return (
    <>
      <PageHeader title="Colleges" description="Every institute on Placeble. Open one to see how it’s doing." actions={<button type="button" className="tp-btn primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" /> Add college</button>} />
      <Card flush>
        <div className="tp-toolbar">
          <label className="tp-search"><Search size={16} aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by name or domain" aria-label="Search colleges" /></label>
          <select className="tp-select" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} aria-label="Filter by status"><option value="all">Any status</option><option value="active">Active</option><option value="suspended">Suspended</option></select>
          <select className="tp-select" value={sort} onChange={event => setSort(event.target.value)} aria-label="Sort"><option value="onboarded">Newest first</option><option value="students">Most students</option><option value="name">Name</option></select>
        </div>
        {list.loading && !list.data ? <Loading label="Loading colleges…" /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !rows.length ? <EmptyState icon={Building2} title="No colleges found" text={search || status !== "all" ? "Try a different search or filter." : "Add your first college to get started."} /> : (
          <>
            <div className="tp-table" role="table" aria-label="Colleges">
              <div className="tp-tr head cols-college" role="row"><span role="columnheader">College</span><span role="columnheader">Students</span><span role="columnheader">Readiness</span><span role="columnheader">Roster</span><span role="columnheader">Status</span><span role="columnheader" /></div>
              {visible.map(college => (
                <div className="tp-tr cols-college" role="row" key={college._id}>
                  <span className="tp-cell-person" role="cell"><Avatar name={college.name} /><b>{college.name}<small>{domains(college).map(domain => `@${domain}`).join(" ") || "No domain"}</small></b></span>
                  <span role="cell" data-label="Students">{college.studentCount}<small className="tp-sub">{college.signedInCount ?? 0} signed in · {college.invitedCount ?? 0} pending</small></span>
                  <span role="cell" data-label="Readiness"><ScoreBar value={college.averageReadiness} /></span>
                  <span role="cell" data-label="Roster">{college.rosterTotal}<small className="tp-sub">{college.rosterMatchRate}% signed up</small></span>
                  <span role="cell"><StatusChip value={college.status} /><PilotBadge commercial={college.commercial} /></span>
                  <span role="cell" className="tp-cell-end"><button type="button" className="tp-btn ghost sm" onClick={() => setOpenId(college._id)} aria-label={`Open ${college.name}`}>Open</button></span>
                </div>
              ))}
            </div>
            <Pager page={page} pages={Math.max(1, Math.ceil(rows.length / PAGE))} total={rows.length} pageSize={PAGE} onChange={setPage} />
          </>
        )}
      </Card>
      {creating && <CreateCollege accessToken={accessToken} onClose={() => setCreating(false)} onCreated={() => { list.reload(); notify("College created."); }} />}
    </>
  );
}

function CreateCollege({ accessToken, onClose, onCreated }: { accessToken: string; onClose: () => void; onCreated: () => void }) {
  const universities = useLoad(() => tpoApi<{ universities: Array<{ id: string; name: string }> }>("/platform-admin/universities", accessToken).then(payload => payload.universities), [accessToken]);
  const [form, setForm] = useState({ name: "", tpoName: "", tpoEmail: "", universityId: "" });
  const [domainList, setDomainList] = useState<string[]>([]);
  const [account, setAccount] = useState<CommercialInput>({ type: "customer" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const set = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    const list = domainList;
    if (form.name.trim().length < 2 || !list.length || form.tpoName.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.tpoEmail.trim())) { setError("Fill in every field with valid details."); return; }
    setBusy(true);
    try {
      const payload = await tpoApi<{ activationPath: string }>("/platform-admin/institutions", accessToken, { method: "POST", json: { name: form.name.trim(), approvedEmailDomains: list, tpoName: form.tpoName.trim(), tpoEmail: form.tpoEmail.trim(), commercial: account, ...(form.universityId ? { universityId: form.universityId } : {}) } });
      setLink(new URL(payload.activationPath, window.location.origin).toString()); onCreated();
    } catch (cause) { setError(errorMessage(cause, "Could not create this college.")); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Add a college" description="Creates an isolated workspace and invites its first TPO. The action is recorded." onClose={onClose} wide>
      {link ? (
        <div className="tp-form"><SecretBox label="Activation link for the first TPO (valid 48 hours)" value={link} note="We’ve also emailed it if email is set up. Share it directly otherwise." /><footer className="tp-modal-foot"><button type="button" className="tp-btn primary" onClick={onClose}>Done</button></footer></div>
      ) : (
        <form className="tp-form" onSubmit={submit} noValidate>
          {error && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</div>}
          <div className="tp-field"><label htmlFor="nc-name">College name</label><input id="nc-name" value={form.name} onChange={event => set("name", event.target.value)} placeholder="CMPICA" autoComplete="off" /></div>
          <div className="tp-field"><label htmlFor="nc-univ">University <em>Optional</em></label><select id="nc-univ" value={form.universityId} onChange={event => set("universityId", event.target.value)}><option value="">None — this college stands alone</option>{(universities.data ?? []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <div className="tp-field"><label htmlFor="nc-dom">Student email domains</label><DomainInput id="nc-dom" values={domainList} onChange={setDomainList} placeholder="cmpica.ac.in" /><p className="tp-field-hint">A college’s own domain belongs to that college only. Shared mail like gmail.com can be added by any college.</p></div>
          <div className="tp-field-row">
            <div className="tp-field"><label htmlFor="nc-tpo">First TPO’s name</label><input id="nc-tpo" value={form.tpoName} onChange={event => set("tpoName", event.target.value)} autoComplete="off" /></div>
            <div className="tp-field"><label htmlFor="nc-mail">First TPO’s email</label><input id="nc-mail" type="email" value={form.tpoEmail} onChange={event => set("tpoEmail", event.target.value)} autoComplete="off" /></div>
          </div>
          <AccountTypeFields value={account} onChange={setAccount} />
          <footer className="tp-modal-foot"><button type="button" className="tp-btn ghost" onClick={onClose}>Cancel</button><button type="submit" className="tp-btn primary" disabled={busy}>{busy ? "Creating…" : "Create college & invite TPO"}</button></footer>
        </form>
      )}
    </Modal>
  );
}

export function CollegeDetail({ id, accessToken, notify, onBack, backLabel = "All colleges" }: { id: string; accessToken: string; notify: Notify; onBack: () => void; backLabel?: string }) {
  const { data, loading, error, reload } = useLoad(() => tpoApi<Detail>(`/platform-admin/institutions/${id}`, accessToken), [id, accessToken]);
  const [dialog, setDialog] = useState<"suspend" | "reissue" | null>(null);
  const [link, setLink] = useState("");
  const [rosterPage, setRosterPage] = useState(1);

  if (loading && !data) return <><PageHeader title="College" /><Card><Loading label="Loading college…" /></Card></>;
  if (error || !data) return <><button type="button" className="tp-btn ghost" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> Back</button><Card><ErrorState message={error || "Could not load this college."} onRetry={reload} /></Card></>;
  const { institution, primaryTpo, roster, engagement, readiness, drives, logins } = data;
  const total = Math.max(1, readiness.summary.studentCount);
  const suspended = institution.status === "suspended";
  const bands = ["0–39", "40–59", "60–74", "75–89", "90+"];
  const peak = Math.max(1, ...readiness.summary.distribution);

  const confirm = async (reason: string) => {
    try {
      if (dialog === "suspend") { await tpoApi(`/platform-admin/institutions/${id}/status`, accessToken, { method: "PATCH", json: { status: suspended ? "active" : "suspended", reason } }); notify(suspended ? "College reactivated." : "College suspended."); }
      else { const payload = await tpoApi<{ activationPath: string }>(`/platform-admin/institutions/${id}/reissue-tpo`, accessToken, { method: "POST", json: { reason } }); setLink(new URL(payload.activationPath, window.location.origin).toString()); notify("A 24-hour credential reset link was issued."); }
      setDialog(null); reload();
    } catch (cause) { notify(errorMessage(cause), "error"); setDialog(null); }
  };

  return (
    <>
      <button type="button" className="tp-btn ghost" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> {backLabel}</button>
      <section className="ad-detail-hero">
        <Avatar name={institution.name} size={52} />
        <div><h1>{institution.name}</h1><p>{domains(institution).map(domain => `@${domain}`).join(" · ")} · onboarded {formatDate(institution.createdAt)}</p></div>
        <StatusChip value={institution.status} />
        <div className="tp-page-actions"><button type="button" className="tp-btn secondary" onClick={() => setDialog("reissue")}><KeyRound size={16} aria-hidden="true" /> Reissue TPO credentials</button><button type="button" className={`tp-btn ${suspended ? "primary" : "secondary danger"}`} onClick={() => setDialog("suspend")}>{suspended ? "Reactivate" : "Suspend"}</button></div>
      </section>
      <CommercialPanel kind="institution" id={id} name={institution.name} commercial={data.commercial} accessToken={accessToken} notify={notify} onChanged={reload} />
      <Card title="College logo"><LogoUploader name={institution.name} logoUrl={(institution as College & { logoUrl?: string }).logoUrl} accessToken={accessToken} path={`/platform-admin/institutions/${id}/logo`} notify={notify} onChanged={() => reload()} label="College logo" scope="university" /></Card>
      {link && <Card><SecretBox label="Credential reset link (valid 24 hours)" value={link} note="Give this to the TPO. It can be used once." /></Card>}

      <div className="tp-stats">
        <StatCard icon={Building2} label="Primary TPO" value={primaryTpo?.name ?? "Not activated"} note={primaryTpo ? `${primaryTpo.email} · last in ${primaryTpo.lastLoginAt ? formatDate(primaryTpo.lastLoginAt) : "never"}` : "No TPO account yet"} />
        <StatCard icon={Building2} tone="green" label="Student sign-ins" value={`${logins.signedIn}/${logins.signedIn + logins.invited}`} note={`${logins.invited} invited, not signed in · ${roster.unmatched} not invited`} />
        <StatCard icon={Building2} tone="amber" label="Average readiness" value={readiness.summary.average} note={`${readiness.summary.placementReady} ready · ${readiness.summary.atRisk} need support`} />
        <StatCard icon={Building2} tone="red" label="Roster" value={roster.total} note={`${roster.matched} signed up`} />
      </div>

      <div className="tp-grid two">
        <Card title="Product use" description={`How many of ${readiness.summary.studentCount} students use each tool`}>
          <div className="ad-bars">{([["Resume builder", engagement.resumes], ["Aptitude", engagement.aptitude], ["Interview Room", engagement.interviews], ["Group discussion", engagement.groupDiscussions], ["Job applications", engagement.applications]] as Array<[string, number]>).map(([label, value]) => <div key={label}><span><b>{label}</b><small>{value}</small></span><i aria-hidden="true"><u style={{ width: `${Math.min(100, (value / total) * 100)}%` }} /></i></div>)}</div>
        </Card>
        <Card title="Readiness spread" description="Students per score band">
          <div className="tp-chart" role="img" aria-label={`Readiness distribution: ${bands.map((band, index) => `${band}: ${readiness.summary.distribution[index]}`).join(", ")}`}>{bands.map((band, index) => <div key={band}><b>{readiness.summary.distribution[index]}</b><span className={index >= 3 ? "good" : index === 0 ? "low" : ""} style={{ height: `${Math.max(4, (readiness.summary.distribution[index] / peak) * 100)}%` }} /><small>{band}</small></div>)}</div>
        </Card>
      </div>

      {logins.pending.length > 0 && (
        <Card title="Invited, not signed in yet" description={`${logins.invited} student${logins.invited === 1 ? "" : "s"}`} flush>
          <ul className="tp-queue">{logins.pending.slice(0, 8).map(student => <li key={student.email}><div className="tp-queue-main"><strong>{student.name}</strong><small>{student.email}{student.invitedAt ? ` · invited ${formatDate(student.invitedAt)}` : ""}</small></div></li>)}{logins.invited > 8 && <li><small>…and {logins.invited - 8} more</small></li>}</ul>
        </Card>
      )}

      <CollegeStudents institutionId={id} accessToken={accessToken} />

      <Card title="Student roster" description="Most recent 200 entries" flush>
        {!roster.entries.length ? <EmptyState icon={Building2} title="No roster yet" text="This college hasn’t added students." /> : (
          <>
            <div className="tp-table" role="table" aria-label="Roster">
              <div className="tp-tr head cols-roster-lite" role="row"><span role="columnheader">Student</span><span role="columnheader">Roll no.</span><span role="columnheader">Branch</span><span role="columnheader">Status</span></div>
              {roster.entries.slice((rosterPage - 1) * 10, rosterPage * 10).map(entry => (
                <div className="tp-tr cols-roster-lite" role="row" key={entry._id}><span className="tp-cell-person" role="cell"><Avatar name={entry.fullName} /><b>{entry.fullName}<small>{entry.email}</small></b></span><span role="cell" data-label="Roll no.">{entry.rollNumber || "—"}</span><span role="cell" data-label="Branch">{[entry.branch, entry.batchYear].filter(Boolean).join(" · ") || "—"}</span><span role="cell"><StatusChip value={entry.status === "matched" ? "active" : "pending"} /></span></div>
              ))}
            </div>
            <Pager page={rosterPage} pages={Math.max(1, Math.ceil(roster.entries.length / 10))} total={roster.entries.length} pageSize={10} onChange={setRosterPage} />
          </>
        )}
      </Card>

      <Card title="Drives and recruiter access" description={`${drives.length} drive${drives.length === 1 ? "" : "s"}`} flush>
        {!drives.length ? <EmptyState icon={Building2} title="No drives published" text="Drive activity appears here once the college creates one." /> : (
          <ul className="tp-queue">{drives.map(drive => (
            <li key={drive._id}><div className="tp-queue-main"><strong>{drive.title}</strong><small>{drive.companyName}{drive.startsAt ? ` · ${formatDate(drive.startsAt)}` : ""}</small><small>{drive.grants.length ? drive.grants.map(grant => `${grant.recruiterOrgId?.companyName ?? "Unknown"} (${grant.status})`).join(", ") : "No recruiter access grants"}</small></div><StatusChip value={drive.status} /></li>
          ))}</ul>
        )}
      </Card>

      {dialog && <ReasonModal title={dialog === "suspend" ? `${suspended ? "Reactivate" : "Suspend"} ${institution.name}` : `Reissue TPO credentials for ${institution.name}`} text={dialog === "suspend" ? (suspended ? "Everyone at this college will be able to sign in again." : "Everyone at this college loses access until you reactivate it.") : "A single-use link is created so the TPO can set a new password. Their old password stops working."} confirmLabel={dialog === "suspend" ? (suspended ? "Reactivate" : "Suspend college") : "Issue reset link"} destructive={dialog === "suspend" && !suspended} onCancel={() => setDialog(null)} onConfirm={confirm} />}
    </>
  );
}

type StudentRow = { id: string; name: string; email: string; readiness: number; status: string; loginStatus: "active" | "invited"; branchName: string; rollNumber: string; batchYear: number | null; lastLoginAt?: string | null };
type StudentsPayload = { total: number; page: number; pageSize: number; branches: string[]; students: StudentRow[] };

/** Every student of one college, searchable, with a full read-only report for each. */
function CollegeStudents({ institutionId, accessToken }: { institutionId: string; accessToken: string }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [login, setLogin] = useState("all");
  const [branch, setBranch] = useState("");
  const [page, setPage] = useState(1);
  const [openStudent, setOpenStudent] = useState<string | null>(null);
  useEffect(() => { const timer = window.setTimeout(() => { setSearch(query); setPage(1); }, 250); return () => window.clearTimeout(timer); }, [query]);
  const { data, loading, error, reload } = useLoad(() => tpoApi<StudentsPayload>(`/platform-admin/institutions/${institutionId}/students?search=${encodeURIComponent(search)}&login=${login}&branch=${encodeURIComponent(branch)}&page=${page}`, accessToken), [institutionId, accessToken, search, login, branch, page]);

  return (
    <Card title="Students" description={data ? `${data.total} student${data.total === 1 ? "" : "s"}${search || login !== "all" || branch ? " match" : ""}. Open anyone for their full report.` : undefined} flush>
      <div className="tp-toolbar">
        <label className="tp-search"><Search size={16} aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, email or roll number" aria-label="Search students" /></label>
        <select className="tp-select" value={login} onChange={event => { setLogin(event.target.value); setPage(1); }} aria-label="Sign-in status"><option value="all">Any sign-in status</option><option value="active">Signed in</option><option value="invited">Not signed in yet</option></select>
        <select className="tp-select" value={branch} onChange={event => { setBranch(event.target.value); setPage(1); }} aria-label="Branch"><option value="">All branches</option>{(data?.branches ?? []).map(name => <option key={name} value={name}>{name}</option>)}</select>
      </div>
      {loading && !data ? <Loading label="Loading students…" /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.students.length ? <EmptyState icon={Building2} title="No students found" text={search || login !== "all" || branch ? "Try a different search or filter." : "This college has no students yet."} /> : (
        <>
          <div className="tp-table" role="table" aria-label="Students">
            <div className="tp-tr head cols-roster-lite" role="row"><span role="columnheader">Student</span><span role="columnheader">Roll no.</span><span role="columnheader">Branch</span><span role="columnheader">Readiness</span></div>
            {data.students.map(student => (
              <button type="button" className="tp-tr cols-roster-lite tp-row-button" role="row" key={student.id} onClick={() => setOpenStudent(student.id)} aria-label={`Open report for ${student.name}`}>
                <span className="tp-cell-person" role="cell"><Avatar name={student.name} /><b>{student.name}<small>{student.email}{student.loginStatus === "invited" ? " · not signed in yet" : ""}</small></b></span>
                <span role="cell" data-label="Roll no.">{student.rollNumber || "—"}</span>
                <span role="cell" data-label="Branch">{[student.branchName, student.batchYear].filter(Boolean).join(" · ") || "—"}</span>
                <span role="cell" data-label="Readiness">{student.loginStatus === "invited" ? <small className="tp-sub">Waiting</small> : <ScoreBar value={student.readiness} />}</span>
              </button>
            ))}
          </div>
          <Pager page={data.page} pages={Math.max(1, Math.ceil(data.total / data.pageSize))} total={data.total} pageSize={data.pageSize} onChange={setPage} />
        </>
      )}
      {openStudent && <StudentReportModal studentId={openStudent} accessToken={accessToken} basePath={`/platform-admin/institutions/${institutionId}/students`} onClose={() => setOpenStudent(null)} />}
    </Card>
  );
}
