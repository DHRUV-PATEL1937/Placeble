import { AlertTriangle, Archive, CalendarRange, GraduationCap, Plus, RotateCcw, Split } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Card, EmptyState, ErrorState, Loading, Modal, PageHeader, errorMessage, formatDate, tpoApi, useLoad, type Notify } from "./tpo-core";

export type Branch = { id: string; name: string; code: string; programCode: string | null; status: "active" | "archived"; students: number; registered: number; batches: number };
export type Batch = { id: string; branchId: string; branchName: string; startMonth: string; endMonth: string; label: string; period: string; endsAt: string; state: "upcoming" | "active" | "graduated" | "closed"; graceDays: number; students: number; registered: number };
type Program = { code: string; name: string; category: string; durationYears: number; enabled: boolean; archived: boolean };

const STATE_LABEL: Record<Batch["state"], string> = { upcoming: "Upcoming", active: "Active", graduated: "Graduated · read-only", closed: "Access closed" };
const STATE_CLASS: Record<Batch["state"], string> = { upcoming: "st-neutral", active: "st-ready", graduated: "st-stalled", closed: "st-at-risk" };

/** Two calendar-month pickers give the batch's start and end. */
function MonthRange({ start, end, onStart, onEnd, idPrefix }: { start: string; end: string; onStart: (value: string) => void; onEnd: (value: string) => void; idPrefix: string }) {
  return (
    <div className="tp-field-row">
      <div className="tp-field"><label htmlFor={`${idPrefix}-start`}>Starts</label><input id={`${idPrefix}-start`} type="month" value={start} onChange={event => onStart(event.target.value)} /></div>
      <div className="tp-field"><label htmlFor={`${idPrefix}-end`}>Ends</label><input id={`${idPrefix}-end`} type="month" value={end} min={start || undefined} onChange={event => onEnd(event.target.value)} /></div>
    </div>
  );
}

export function BranchesPage({ accessToken, notify }: { accessToken: string; notify: Notify }) {
  const branches = useLoad(() => tpoApi<{ branches: Branch[] }>("/branches", accessToken).then(payload => payload.branches), [accessToken]);
  const batches = useLoad(() => tpoApi<{ batches: Batch[] }>("/batches", accessToken).then(payload => payload.batches), [accessToken]);
  const [addBranch, setAddBranch] = useState(false);
  const [batchModal, setBatchModal] = useState<Batch | "new" | null>(null);
  const refresh = () => { branches.reload(); batches.reload(); };

  const setStatus = async (branch: Branch, status: "active" | "archived") => {
    try { await tpoApi(`/branches/${branch.id}`, accessToken, { method: "PATCH", json: { status } }); refresh(); notify(status === "archived" ? `${branch.name} archived.` : `${branch.name} restored.`); }
    catch (cause) { notify(errorMessage(cause), "error"); }
  };
  const active = (branches.data ?? []).filter(branch => branch.status === "active");

  return (
    <>
      <PageHeader title="Branches & batches" description="Switch on the programmes you run, then add each intake as a batch. Students are placed in a batch, and their access follows its dates." actions={<>
        <button type="button" className="tp-btn secondary" onClick={() => setAddBranch(true)}><Plus size={16} aria-hidden="true" /> Add branch</button>
        <button type="button" className="tp-btn primary" disabled={!active.length} onClick={() => setBatchModal("new")}><CalendarRange size={16} aria-hidden="true" /> Add batch</button>
      </>} />

      <Card title="Branches" description="Chosen from our list of programmes, so names stay consistent." flush>
        {branches.loading && !branches.data ? <Loading /> : branches.error ? <ErrorState message={branches.error} onRetry={branches.reload} /> : !branches.data?.length ? (
          <EmptyState icon={Split} title="No branches yet" text="Add the programmes your institute runs, like BCA, MCA or MBA." action={<button type="button" className="tp-btn primary" onClick={() => setAddBranch(true)}><Plus size={16} aria-hidden="true" /> Add a branch</button>} />
        ) : (
          <ul className="tp-queue">{branches.data.map(branch => (
            <li key={branch.id} className={branch.status === "archived" ? "tp-off" : ""}>
              <span className="tp-icon-tile"><Split size={20} aria-hidden="true" /></span>
              <div className="tp-queue-main"><strong>{branch.name}</strong><small>{branch.batches} batch{branch.batches === 1 ? "" : "es"} · {branch.students} on roster · {branch.registered} signed up</small></div>
              <span className={`tp-pill ${branch.status === "active" ? "st-ready" : "st-neutral"}`}>{branch.status === "active" ? "Active" : "Archived"}</span>
              <div className="tp-queue-actions"><button type="button" className="tp-btn ghost sm" onClick={() => void setStatus(branch, branch.status === "active" ? "archived" : "active")}>{branch.status === "active" ? <><Archive size={14} aria-hidden="true" /> Archive</> : <><RotateCcw size={14} aria-hidden="true" /> Restore</>}</button></div>
            </li>
          ))}</ul>
        )}
      </Card>

      <Card title="Batches" description="Each batch has a start and end month. When it ends, students get a graduate notice, then lose access after 30 days." flush>
        {batches.loading && !batches.data ? <Loading /> : batches.error ? <ErrorState message={batches.error} onRetry={batches.reload} /> : !batches.data?.length ? (
          <EmptyState icon={GraduationCap} title="No batches yet" text={active.length ? "Add a batch, like MCA 2025–2027, to start adding students." : "Add a branch first, then create its batches."} action={active.length ? <button type="button" className="tp-btn primary" onClick={() => setBatchModal("new")}><CalendarRange size={16} aria-hidden="true" /> Add a batch</button> : undefined} />
        ) : (
          <div className="tp-table" role="table" aria-label="Batches">
            <div className="tp-tr head cols-batch" role="row"><span role="columnheader">Batch</span><span role="columnheader">Duration</span><span role="columnheader">Students</span><span role="columnheader">Status</span><span role="columnheader" /></div>
            {batches.data.map(batch => (
              <div className="tp-tr cols-batch" role="row" key={batch.id}>
                <span role="cell"><b>{batch.branchName} · {batch.label}</b></span>
                <span role="cell" data-label="Duration">{batch.period}</span>
                <span role="cell" data-label="Students">{batch.students}<small className="tp-sub">{batch.registered} signed up</small></span>
                <span role="cell"><em className={`tp-pill ${STATE_CLASS[batch.state]}`}>{STATE_LABEL[batch.state]}</em>{batch.state !== "upcoming" && <small className="tp-sub">{batch.state === "active" ? "ends" : "ended"} {formatDate(batch.endsAt)}</small>}</span>
                <span role="cell" className="tp-cell-end"><button type="button" className="tp-btn ghost sm" onClick={() => setBatchModal(batch)}>Edit dates</button></span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {addBranch && <AddBranchModal accessToken={accessToken} onClose={() => setAddBranch(false)} onAdded={() => { refresh(); notify("Branch added."); }} />}
      {batchModal && <BatchModal batch={batchModal === "new" ? null : batchModal} branches={active} accessToken={accessToken} onClose={() => setBatchModal(null)} onSaved={message => { refresh(); notify(message); }} />}
    </>
  );
}

function AddBranchModal({ accessToken, onClose, onAdded }: { accessToken: string; onClose: () => void; onAdded: () => void }) {
  const { data, loading, error, reload } = useLoad(() => tpoApi<{ programs: Program[] }>("/branches/catalog", accessToken).then(payload => payload.programs), [accessToken]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const options = (data ?? []).filter(program => !program.enabled);
  const groups = [...new Set(options.map(program => program.category))];

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setFormError("");
    if (!code) { setFormError("Choose a branch from the list."); return; }
    setBusy(true);
    try { await tpoApi("/branches", accessToken, { method: "POST", json: { programCode: code } }); onAdded(); onClose(); }
    catch (cause) { setFormError(errorMessage(cause, "Could not add this branch.")); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Add a branch" description="Choose a programme from our list. Names are fixed so reports stay consistent." onClose={onClose}>
      {loading && !data ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : (
        <form className="tp-form" onSubmit={submit} noValidate>
          {formError && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{formError}</div>}
          <div className="tp-field"><label htmlFor="ab-code">Branch</label>
            <select id="ab-code" value={code} onChange={event => setCode(event.target.value)}>
              <option value="">Select a branch…</option>
              {groups.map(group => <optgroup key={group} label={group}>{options.filter(program => program.category === group).map(program => <option key={program.code} value={program.code}>{program.name} · {program.durationYears} yr</option>)}</optgroup>)}
            </select>
            {!options.length && <p className="tp-field-hint">Every programme is already added.</p>}
          </div>
          <footer className="tp-modal-foot"><button type="button" className="tp-btn ghost" onClick={onClose}>Cancel</button><button type="submit" className="tp-btn primary" disabled={busy || !code}>{busy ? "Adding…" : "Add branch"}</button></footer>
        </form>
      )}
    </Modal>
  );
}

function BatchModal({ batch, branches, accessToken, onClose, onSaved }: { batch: Batch | null; branches: Branch[]; accessToken: string; onClose: () => void; onSaved: (message: string) => void }) {
  const [branchId, setBranchId] = useState(batch?.branchId ?? "");
  const [start, setStart] = useState(batch?.startMonth ?? "");
  const [end, setEnd] = useState(batch?.endMonth ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editing = Boolean(batch);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!editing && !branchId) { setError("Choose a branch."); return; }
    if (!start || !end) { setError("Pick both a start and an end month."); return; }
    if (end <= start) { setError("The end month must be after the start month."); return; }
    setBusy(true);
    try {
      if (editing) await tpoApi(`/batches/${batch!.id}`, accessToken, { method: "PATCH", json: { startMonth: start, endMonth: end } });
      else await tpoApi("/batches", accessToken, { method: "POST", json: { branchId, startMonth: start, endMonth: end } });
      onSaved(editing ? "Batch dates updated. Everyone in the batch follows the new end date." : "Batch added."); onClose();
    } catch (cause) { setError(errorMessage(cause, "Could not save this batch.")); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={editing ? `${batch!.branchName} · ${batch!.label}` : "Add a batch"} description={editing ? "Extend the end month to give students more time. Access follows the new date straight away." : "Pick the branch and the calendar months this intake starts and ends."} onClose={onClose}>
      <form className="tp-form" onSubmit={submit} noValidate>
        {error && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</div>}
        {!editing && <div className="tp-field"><label htmlFor="bm-branch">Branch</label><select id="bm-branch" value={branchId} onChange={event => setBranchId(event.target.value)}><option value="">Select a branch…</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>}
        <MonthRange idPrefix="bm" start={start} end={end} onStart={setStart} onEnd={setEnd} />
        {editing && batch!.state === "closed" && <div className="tp-alert warn" role="status"><AlertTriangle size={16} aria-hidden="true" />This batch’s access has closed. Extending the end month turns it back on for its students.</div>}
        <footer className="tp-modal-foot"><button type="button" className="tp-btn ghost" onClick={onClose}>Cancel</button><button type="submit" className="tp-btn primary" disabled={busy}>{busy ? "Saving…" : editing ? "Save dates" : "Add batch"}</button></footer>
      </form>
    </Modal>
  );
}
