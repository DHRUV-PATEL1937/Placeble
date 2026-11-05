import { Download, MessageSquareText, Search, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar, Card, EmptyState, ErrorState, Loading, Modal, PageHeader, Pager, ReadinessCell, StatusPill, downloadFile, toCsv, type Notify, type Student } from "./tpo-core";

const PAGE_SIZE = 10;

export function StudentsPage({ students, loading, error, search, onSearch, notify, goto, onMessage }: { students: Student[]; loading: boolean; error: string; search: string; onSearch: (value: string) => void; notify: Notify; goto: (page: string) => void; onMessage?: (student: Student) => void }) {
  const [branch, setBranch] = useState("all");
  const [status, setStatus] = useState("all");
  const [band, setBand] = useState("all");
  const [batch, setBatch] = useState("all");
  const [login, setLogin] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Student | null>(null);

  const branches = useMemo(() => [...new Set(students.map(student => student.branch))].sort(), [students]);
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return students.filter(student =>
      (branch === "all" || student.branch === branch) &&
      (status === "all" || student.status === status) &&
      (login === "all" || (login === "invited" ? student.loginStatus === "invited" : student.loginStatus !== "invited")) &&
      (band === "all" || (band === "75" ? student.readiness >= 75 : student.readiness < 60)) &&
      (batch === "all" || student.batchId === batch) &&
      (!term || `${student.name} ${student.email} ${student.branch} ${student.skills.join(" ")}`.toLowerCase().includes(term)));
  }, [students, branch, batch, status, band, login, search]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visible = rows.slice((Math.min(page, pages) - 1) * PAGE_SIZE, Math.min(page, pages) * PAGE_SIZE);
  const batches = useMemo(() => [...new Map(students.filter(student => student.batchId).map(student => [student.batchId!, `${student.branch.split(" · ")[0]} ${student.batchLabel ?? ""}`.trim()])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [students]);
  const filtered = branch !== "all" || batch !== "all" || status !== "all" || band !== "all" || login !== "all" || Boolean(search.trim());

  const exportRows = () => {
    downloadFile("students.csv", toCsv(["Name", "Email", "Programme", "Batch", "Readiness", "Resume", "Aptitude", "Interview", "Status", "Skills"], rows.map(s => [s.name, s.email, s.branch.split(" · ")[0], s.batchLabel ?? "", s.readiness, s.resume, s.aptitude, s.interview, s.status, s.skills.join("; ")])));
    notify(`${rows.length} student${rows.length === 1 ? "" : "s"} exported.`);
  };

  return (
    <>
      <PageHeader title="Students" description="Everyone with an approved account at your college, and how they’re progressing." actions={<button type="button" className="tp-btn secondary" onClick={exportRows} disabled={!rows.length}><Download size={16} aria-hidden="true" /> Export CSV</button>} />
      <Card flush>
        <div className="tp-toolbar">
          <label className="tp-search"><Search size={16} aria-hidden="true" /><input value={search} onChange={event => { onSearch(event.target.value); setPage(1); }} placeholder="Search by name, email, branch or skill" aria-label="Search students" /></label>
          <select className="tp-select" value={branch} onChange={event => { setBranch(event.target.value); setPage(1); }} aria-label="Filter by branch"><option value="all">All branches</option>{branches.map(item => <option key={item}>{item}</option>)}</select>
          <select className="tp-select" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} aria-label="Filter by status"><option value="all">Any status</option>{["Ready", "On track", "Stalled", "At risk", "In progress"].map(item => <option key={item}>{item}</option>)}</select>
          <select className="tp-select" value={login} onChange={event => { setLogin(event.target.value); setPage(1); }} aria-label="Filter by sign-in"><option value="all">Everyone</option><option value="active">Signed in</option><option value="invited">Not signed in yet</option></select>
          <select className="tp-select" value={batch} onChange={event => { setBatch(event.target.value); setPage(1); }} aria-label="Filter by batch"><option value="all">All batches</option>{batches.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
          <select className="tp-select" value={band} onChange={event => { setBand(event.target.value); setPage(1); }} aria-label="Filter by readiness"><option value="all">Any readiness</option><option value="75">75 and above</option><option value="60">Below 60</option></select>
          {filtered && <button type="button" className="tp-btn ghost sm" onClick={() => { setBranch("all"); setStatus("all"); setBand("all"); setBatch("all"); setLogin("all"); onSearch(""); setPage(1); }}>Clear</button>}
        </div>

        {loading ? <Loading label="Loading students…" /> : error ? <ErrorState message={error} /> : !students.length ? (
          <EmptyState icon={UsersRound} title="No students yet" text="Students appear here once they register and you approve them." action={<button type="button" className="tp-btn primary" onClick={() => goto("Roster")}>Go to roster</button>} />
        ) : !rows.length ? <EmptyState icon={Search} title="No students match" text="Try changing or clearing your filters." /> : (
          <>
            <div className="tp-table" role="table" aria-label="Students">
              <div className="tp-tr head cols-students" role="row"><span role="columnheader">Student</span><span role="columnheader">Readiness</span><span role="columnheader">Resume</span><span role="columnheader">Aptitude</span><span role="columnheader">Status</span><span role="columnheader" /></div>
              {visible.map(student => (
                <div className="tp-tr cols-students" role="row" key={student.id}>
                  <span className="tp-cell-person" role="cell"><Avatar name={student.name} /><b>{student.name}<small>{[student.branch.split(" · ")[0], student.batchLabel].filter(Boolean).join(" · ") || student.branch}</small></b></span>
                  <span role="cell" data-label="Readiness"><ReadinessCell student={student} /></span>
                  <span role="cell" data-label="Resume">{student.resume}%</span>
                  <span role="cell" data-label="Aptitude">{student.aptitude}%</span>
                  <span role="cell">{student.loginStatus === "invited" ? <span className="tp-pill st-neutral">Invited</span> : <StatusPill status={student.status} />}</span>
                  <span role="cell" className="tp-cell-end"><button type="button" className="tp-btn ghost sm" onClick={() => setSelected(student)} aria-label={`View ${student.name}`}>View</button></span>
                </div>
              ))}
            </div>
            <Pager page={Math.min(page, pages)} pages={pages} total={rows.length} pageSize={PAGE_SIZE} onChange={setPage} />
          </>
        )}
      </Card>

      {selected && (
        <Modal title={selected.name} description={`${selected.email} · ${selected.branch}`} onClose={() => setSelected(null)}>
          <div className="tp-profile">
            <div className="tp-profile-score"><strong>{selected.complete === false ? "—" : selected.readiness}</strong><span>{selected.complete === false ? `Overall readiness unlocks after all ${selected.agentsTotal ?? 0} agents are used (${selected.agentsUsed ?? 0} so far)` : "Overall readiness"}<StatusPill status={selected.status} /></span></div>
            <div className="tp-profile-bars">{([["Resume", selected.resume], ["Aptitude", selected.aptitude], ["Interview", selected.interview]] as const).map(([label, value]) => <div key={label}><span>{label}<b>{value}%</b></span><i><u style={{ width: `${value}%` }} /></i></div>)}</div>
            <div className="tp-profile-skills"><small>Skills</small>{selected.skills.length ? <div>{selected.skills.map(skill => <em key={skill}>{skill}</em>)}</div> : <p>No skills recorded yet.</p>}</div>
          </div>
          <footer className="tp-modal-foot"><button type="button" className="tp-btn ghost" onClick={() => setSelected(null)}>Close</button><button type="button" className="tp-btn primary" onClick={() => { const student = selected; setSelected(null); if (onMessage) onMessage(student); else goto("Messages"); }}><MessageSquareText size={16} aria-hidden="true" /> Message student</button></footer>
        </Modal>
      )}
    </>
  );
}
