import { AlertTriangle, Check, CheckCircle2, Copy, Download, FileSpreadsheet, Mail, MailWarning, Plus, RefreshCw, Search, ShieldCheck, UploadCloud, UserPlus, X } from "lucide-react";
import { useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { type Batch, type Branch } from "./BranchesPage";
import {
  Avatar, Card, EmptyState, ErrorState, Loading, Modal, PageHeader, Pager,
  downloadFile, errorMessage, formatDate, toCsv, tpoApi, useLoad, type Notify,
} from "./tpo-core";

type LoginStatus = "not_invited" | "invited" | "active";
type RosterEntry = { branchId?: string | null; batchId?: string | null; _id: string; email: string; fullName: string; rollNumber: string; branch: string; batchYear?: number | null; status: "matched" | "unmatched"; uploadedAt: string; loginStatus: LoginStatus; firstLoginAt: string | null; lastLoginAt: string | null; invitedAt: string | null };
type RosterPayload = { entries: RosterEntry[]; summary: { total: number; invited: number; active: number; notInvited: number }; institution: { name: string; approvedEmailDomains: string[] } | null; emailConfigured: boolean };
type UploadResult = { summary: { created: number; updated: number; skipped: number; failed: number; total: number }; errorRows: Array<{ row: number; reason: string }>; invitations: { queued: number; emailConfigured: boolean } };
type Credentials = { name: string; email: string; temporaryPassword: string };

const PAGE_SIZE = 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEMPLATE_HEADERS = ["email", "fullName", "rollNumber", "branch", "batch"];
const STATUS_LABEL: Record<LoginStatus, string> = { not_invited: "Not invited", invited: "Invited", active: "Signed in" };
const STATUS_CLASS: Record<LoginStatus, string> = { not_invited: "st-neutral", invited: "st-stalled", active: "st-ready" };

function downloadCsvTemplate(domain: string) {
  const year = new Date().getFullYear() + 1;
  downloadFile("placeble-student-roster-template.csv", toCsv(TEMPLATE_HEADERS, [
    [`aarav.sharma@${domain}`, "Aarav Sharma", "21CS001", "MCA", `${year - 2}-${year}`],
    [`diya.patel@${domain}`, "Diya Patel", "21BC014", "BCA", `${year - 3}-${year}`],
  ]));
}

export function RosterPage({ accessToken, notify }: { accessToken: string; notify: Notify }) {
  const { data, loading, error, reload } = useLoad(() => tpoApi<RosterPayload>("/tenancy/roster", accessToken), [accessToken]);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | LoginStatus>("all");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState("");
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [editing, setEditing] = useState<RosterEntry | null>(null);

  const branchList = useLoad(() => tpoApi<{ branches: Branch[] }>("/branches", accessToken), [accessToken]);
  const batchList = useLoad(() => tpoApi<{ batches: Batch[] }>("/batches", accessToken), [accessToken]);
  const branches = (branchList.data?.branches ?? []).filter(item => item.status === "active");
  const batches = batchList.data?.batches ?? [];
  const batchOf = (entry: RosterEntry) => batches.find(batch => batch.id === entry.batchId);
  const domains = data?.institution?.approvedEmailDomains ?? [];

  const entries = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.entries ?? []).filter(entry => (filter === "all" || entry.loginStatus === filter) && (!term || `${entry.fullName} ${entry.email} ${entry.rollNumber} ${entry.branch}`.toLowerCase().includes(term)));
  }, [data, search, filter]);
  const missingCourse = (data?.entries ?? []).filter(entry => !entry.branchId || !entry.batchId);
  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const visible = entries.slice((Math.min(page, pages) - 1) * PAGE_SIZE, Math.min(page, pages) * PAGE_SIZE);

  const resend = async (entry: RosterEntry) => {
    setBusy(entry._id);
    try {
      const payload = await tpoApi<{ delivery: string; temporaryPassword?: string }>(`/tenancy/roster/${entry._id}/resend`, accessToken, { method: "POST" });
      if (payload.temporaryPassword) setCredentials({ name: entry.fullName, email: entry.email, temporaryPassword: payload.temporaryPassword });
      else notify(`New sign-in details sent to ${entry.email}.`);
      reload();
    } catch (cause) { notify(errorMessage(cause), "error"); }
    finally { setBusy(""); }
  };
  const inviteAll = async () => {
    setBusy("all");
    try { const payload = await tpoApi<{ queued: number }>("/tenancy/roster/invite", accessToken, { method: "POST" }); notify(`Sending sign-in details to ${payload.queued} student${payload.queued === 1 ? "" : "s"}. This can take a minute.`); window.setTimeout(reload, 4000); }
    catch (cause) { notify(errorMessage(cause), "error"); }
    finally { setBusy(""); }
  };

  return (
    <>
      <PageHeader
        title="Student roster"
        description="Add students and we’ll email each one their sign-in details. There’s no signup or approval step."
        actions={<button type="button" className="tp-btn primary" onClick={() => setAddOpen(true)}><UserPlus size={16} aria-hidden="true" /> Add student</button>}
      />

      {data && (
        <div className="tp-domain-note">
          <ShieldCheck size={18} aria-hidden="true" />
          <p>{domains.length ? <>Student emails must end with {domains.map(domain => <b key={domain}>@{domain}</b>)}.</> : <>No student email domain is set yet. Add one in <b>Settings → College</b> before adding students.</>}</p>
        </div>
      )}

      {data && data.summary.notInvited > 0 && (
        <div className="tp-banner static" role="status">
          <MailWarning size={20} aria-hidden="true" />
          <span><strong>{data.summary.notInvited} student{data.summary.notInvited === 1 ? " doesn’t" : "s don’t"} have an account yet</strong><small>{data.emailConfigured ? "Send them their sign-in details now." : "Email isn’t set up yet, so details can’t be sent in bulk. Add students one at a time to copy their credentials."}</small></span>
          <button type="button" className="tp-btn primary sm" disabled={!data.emailConfigured || busy === "all"} onClick={() => void inviteAll()}><Mail size={14} aria-hidden="true" /> {busy === "all" ? "Sending…" : "Send invitations"}</button>
        </div>
      )}

      {missingCourse.length > 0 && (
        <div className="tp-banner static" role="status">
          <AlertTriangle size={20} aria-hidden="true" />
          <span><strong>{missingCourse.length} student{missingCourse.length === 1 ? " has" : "s have"} no branch or batch</strong><small>Students no longer pick their own course, so their profile stays empty until you set it. Use Edit on {missingCourse.length === 1 ? "that row" : "each marked row"}.</small></span>
        </div>
      )}

      <BulkUpload accessToken={accessToken} domain={domains[0] ?? "college.edu"} disabled={!domains.length} notify={notify} onDone={reload} />

      <Card
        title="Roster"
        description={data ? `${data.summary.total} students · ${data.summary.active} signed in · ${data.summary.invited} invited, not signed in yet${data.summary.notInvited ? ` · ${data.summary.notInvited} not invited` : ""}` : undefined}
        actions={<>
          <label className="tp-search sm"><Search size={15} aria-hidden="true" /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search name, email, roll no." aria-label="Search roster" /></label>
          <select className="tp-select" value={filter} onChange={event => { setFilter(event.target.value as typeof filter); setPage(1); }} aria-label="Filter by sign-in status">
            <option value="all">Everyone</option><option value="active">Signed in</option><option value="invited">Invited, not signed in</option><option value="not_invited">Not invited</option>
          </select>
        </>}
        flush
      >
        {loading && !data ? <Loading label="Loading roster…" /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.entries.length ? (
          <EmptyState icon={FileSpreadsheet} title="Your roster is empty" text="Add a student, or upload a spreadsheet to add many at once." action={<button type="button" className="tp-btn primary" onClick={() => setAddOpen(true)}><Plus size={16} aria-hidden="true" /> Add first student</button>} />
        ) : !entries.length ? <EmptyState icon={Search} title="No matching students" text="Try a different search or filter." /> : (
          <>
            <div className="tp-table" role="table" aria-label="Student roster">
              <div className="tp-tr head cols-roster" role="row"><span role="columnheader">Student</span><span role="columnheader">Roll no.</span><span role="columnheader">Branch · batch</span><span role="columnheader">Sign-in</span><span role="columnheader" /></div>
              {visible.map(entry => (
                <div className="tp-tr cols-roster" role="row" key={entry._id}>
                  <span className="tp-cell-person" role="cell"><Avatar name={entry.fullName} /><b>{entry.fullName}<small>{entry.email}</small></b></span>
                  <span role="cell" data-label="Roll no.">{entry.rollNumber || "—"}</span>
                  <span role="cell" data-label="Branch">{[entry.branch, batchOf(entry)?.label ?? entry.batchYear].filter(Boolean).join(" · ") || "—"}{(!entry.branchId || !entry.batchId) && <em className="tp-pill st-stalled">Needs branch &amp; batch</em>}</span>
                  <span role="cell"><em className={`tp-pill ${STATUS_CLASS[entry.loginStatus]}`}>{STATUS_LABEL[entry.loginStatus]}</em><small className="tp-sub">{entry.loginStatus === "active" ? `since ${formatDate(entry.firstLoginAt!)}` : entry.loginStatus === "invited" && entry.invitedAt ? `sent ${formatDate(entry.invitedAt)}` : ""}</small></span>
                  <span role="cell" className="tp-cell-end"><button type="button" className="tp-btn ghost sm" onClick={() => setEditing(entry)} aria-label={`Edit ${entry.fullName}`}>Edit</button>{entry.loginStatus === "invited" && <button type="button" className="tp-btn ghost sm" disabled={busy === entry._id} onClick={() => void resend(entry)} aria-label={`Resend sign-in details to ${entry.fullName}`}><RefreshCw size={14} aria-hidden="true" /> Resend</button>}</span>
                </div>
              ))}
            </div>
            <Pager page={Math.min(page, pages)} pages={pages} total={entries.length} pageSize={PAGE_SIZE} onChange={setPage} />
          </>
        )}
      </Card>

      {addOpen && <AddStudentModal accessToken={accessToken} domains={domains} branches={branches} batches={batches} notify={notify} onClose={() => setAddOpen(false)} onAdded={reload} onCredentials={setCredentials} />}
      {editing && <EditStudentModal entry={editing} accessToken={accessToken} branches={branches} batches={batches} onClose={() => setEditing(null)} onSaved={() => { reload(); notify("Student details updated."); }} />}
      {credentials && <CredentialsModal credentials={credentials} onClose={() => setCredentials(null)} />}
    </>
  );
}

/** Branch and batch dropdowns. Nobody types a branch: it comes from the institute's enabled list, and the batch from that branch's batches. */
function PlacementFields({ branches, batches, branchId, batchId, onChange, idPrefix }: { branches: Branch[]; batches: Batch[]; branchId: string; batchId: string; onChange: (next: { branchId: string; batchId: string }) => void; idPrefix: string }) {
  const options = batches.filter(batch => batch.branchId === branchId);
  return (
    <div className="tp-field-row">
      <div className="tp-field"><label htmlFor={`${idPrefix}-branch`}>Branch <em>Required</em></label>
        <select id={`${idPrefix}-branch`} value={branchId} onChange={event => { const next = event.target.value; const only = batches.filter(batch => batch.branchId === next); onChange({ branchId: next, batchId: only.length === 1 ? only[0].id : "" }); }}>
          <option value="">Select a branch…</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </div>
      <div className="tp-field"><label htmlFor={`${idPrefix}-batch`}>Batch <em>Required</em></label>
        <select id={`${idPrefix}-batch`} value={batchId} disabled={!branchId} onChange={event => onChange({ branchId, batchId: event.target.value })}>
          <option value="">{branchId ? (options.length ? "Select a batch…" : "No batches yet") : "Pick a branch first"}</option>{options.map(batch => <option key={batch.id} value={batch.id}>{batch.label} ({batch.period})</option>)}
        </select>
      </div>
    </div>
  );
}

/* ───────── Edit the details students can't change themselves ───────── */

function EditStudentModal({ entry, accessToken, branches, batches, onClose, onSaved }: { entry: RosterEntry; accessToken: string; branches: Branch[]; batches: Batch[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ fullName: entry.fullName, rollNumber: entry.rollNumber, branchId: entry.branchId ?? "", batchId: entry.batchId ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (form.fullName.trim().length < 2) { setError("Enter the student’s full name."); return; }
    if (!form.branchId || !form.batchId) { setError("Choose a branch and a batch."); return; }
    setBusy(true);
    try { await tpoApi(`/tenancy/roster/${entry._id}`, accessToken, { method: "PATCH", json: { fullName: form.fullName.trim(), rollNumber: form.rollNumber.trim(), branchId: form.branchId, batchId: form.batchId } }); onSaved(); onClose(); }
    catch (cause) { setError(errorMessage(cause, "Could not save these details.")); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Edit student details" description={`${entry.email}. Students can see these details but can’t change them.`} onClose={onClose}>
      <form className="tp-form" onSubmit={submit} noValidate>
        {error && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</div>}
        <div className="tp-field"><label htmlFor="es-name">Full name</label><input id="es-name" value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })} autoComplete="off" /></div>
        <div className="tp-field"><label htmlFor="es-roll">Student ID / roll number</label><input id="es-roll" value={form.rollNumber} onChange={event => setForm({ ...form, rollNumber: event.target.value })} autoComplete="off" /></div>
        <PlacementFields idPrefix="es" branches={branches} batches={batches} branchId={form.branchId} batchId={form.batchId} onChange={next => setForm({ ...form, ...next })} />
        <footer className="tp-modal-foot"><button type="button" className="tp-btn ghost" onClick={onClose}>Cancel</button><button type="submit" className="tp-btn primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></footer>
      </form>
    </Modal>
  );
}

/* ───────── Credentials (only when email isn't configured) ───────── */

function CredentialsModal({ credentials, onClose }: { credentials: Credentials; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Sign in: ${window.location.origin}/login/student\nEmail: ${credentials.email}\nTemporary password: ${credentials.temporaryPassword}`;
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ } };
  return (
    <Modal title="Share these sign-in details" description={`Email isn’t set up yet, so give ${credentials.name} these details yourself.`} onClose={onClose}>
      <div className="tp-linkbox tp-cred"><pre>{text}</pre><button type="button" className="tp-btn secondary sm" onClick={() => void copy()}>{copied ? <><Check size={14} aria-hidden="true" /> Copied</> : <><Copy size={14} aria-hidden="true" /> Copy</>}</button></div>
      <p className="tp-field-hint" style={{ marginTop: 10 }}><ShieldCheck size={14} aria-hidden="true" /> This is shown only once. They’ll choose their own password when they first sign in.</p>
      <footer className="tp-modal-foot"><button type="button" className="tp-btn primary" onClick={onClose}>Done</button></footer>
    </Modal>
  );
}

/* ───────── Single student ───────── */

function AddStudentModal({ accessToken, domains, branches, batches, notify, onClose, onAdded, onCredentials }: { accessToken: string; domains: string[]; branches: Branch[]; batches: Batch[]; notify: Notify; onClose: () => void; onAdded: () => void; onCredentials: (credentials: Credentials) => void }) {
  const blank = { fullName: "", email: "", rollNumber: "", branchId: "", batchId: "" };
  const [form, setForm] = useState(blank);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const set = (key: keyof typeof blank, value: string) => setForm(current => ({ ...current, [key]: value }));
  const touch = (key: string) => setTouched(current => ({ ...current, [key]: true }));

  const email = form.email.trim().toLowerCase();
  const domain = email.split("@")[1] ?? "";
  const nameError = touched.fullName && form.fullName.trim().length < 2 ? "Enter the student’s full name." : "";
  const emailError = touched.email && (!EMAIL_PATTERN.test(email) ? "Enter a valid email address." : domains.length && !domains.includes(domain) ? `Use an approved domain: ${domains.map(item => `@${item}`).join(", ")}.` : "");
  const setupNeeded = !branches.length || !batches.length;

  const submit = async (event: FormEvent, another = false) => {
    event.preventDefault();
    setTouched({ fullName: true, email: true });
    if (form.fullName.trim().length < 2 || !EMAIL_PATTERN.test(email) || (domains.length && !domains.includes(domain))) return;
    if (!form.branchId || !form.batchId) { setError("Choose a branch and a batch."); return; }
    setBusy(true); setError("");
    try {
      const payload = await tpoApi<{ invitation?: { delivery?: string; joined?: boolean; temporaryPassword?: string; error?: string } }>("/tenancy/roster/student", accessToken, { method: "POST", json: { fullName: form.fullName.trim(), email, rollNumber: form.rollNumber.trim(), branchId: form.branchId, batchId: form.batchId } });
      onAdded();
      if (payload.invitation?.temporaryPassword) { onCredentials({ name: form.fullName.trim(), email, temporaryPassword: payload.invitation.temporaryPassword }); onClose(); return; }
      if (payload.invitation?.error) notify(`${form.fullName.trim()} was added, but ${payload.invitation.error}`, "error");
      else if (payload.invitation?.joined) notify(`${form.fullName.trim()} already had a Placeble account. It’s now part of your institute, with their progress kept.`);
      else notify(`${form.fullName.trim()} was added and their sign-in details were emailed.`);
      if (another) { setForm({ ...blank, branchId: form.branchId, batchId: form.batchId }); setTouched({}); nameRef.current?.focus(); }
      else onClose();
    } catch (cause) { setError(errorMessage(cause, "Could not add this student.")); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Add a student" description="We’ll create their account and email them a temporary password." onClose={onClose}>
      {setupNeeded ? (
        <div className="tp-form"><div className="tp-alert warn" role="status"><AlertTriangle size={16} aria-hidden="true" />{!branches.length ? "Add a branch first" : "Add a batch for your branch first"} under Branches &amp; batches, then come back to add students.</div><footer className="tp-modal-foot"><button type="button" className="tp-btn primary" onClick={onClose}>Got it</button></footer></div>
      ) : (
        <form className="tp-form" onSubmit={submit} noValidate>
          {error && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</div>}
          <div className={`tp-field${nameError ? " has-error" : ""}`}>
            <label htmlFor="as-name">Full name <em>Required</em></label>
            <input id="as-name" ref={nameRef} value={form.fullName} onChange={event => set("fullName", event.target.value)} onBlur={() => touch("fullName")} placeholder="Aarav Sharma" autoComplete="off" aria-invalid={Boolean(nameError)} />
            {nameError && <p className="tp-field-error">{nameError}</p>}
          </div>
          <div className={`tp-field${emailError ? " has-error" : ""}`}>
            <label htmlFor="as-email">College email <em>Required</em></label>
            <input id="as-email" type="email" inputMode="email" value={form.email} onChange={event => set("email", event.target.value)} onBlur={() => touch("email")} placeholder={`name@${domains[0] ?? "college.edu"}`} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-invalid={Boolean(emailError)} />
            {emailError ? <p className="tp-field-error">{emailError}</p> : domains.length > 0 && <p className="tp-field-hint">Approved: {domains.map(item => `@${item}`).join(", ")}</p>}
          </div>
          <div className="tp-field"><label htmlFor="as-roll">Student ID / roll number</label><input id="as-roll" value={form.rollNumber} onChange={event => set("rollNumber", event.target.value)} placeholder="21CS001" autoComplete="off" /></div>
          <PlacementFields idPrefix="as" branches={branches} batches={batches} branchId={form.branchId} batchId={form.batchId} onChange={next => setForm(current => ({ ...current, ...next }))} />
          <footer className="tp-modal-foot">
            <button type="button" className="tp-btn ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="tp-btn secondary" disabled={busy} onClick={event => void submit(event, true)}>Save &amp; add another</button>
            <button type="submit" className="tp-btn primary" disabled={busy}>{busy ? "Adding…" : "Add & send details"}</button>
          </footer>
        </form>
      )}
    </Modal>
  );
}

/* ───────── Bulk upload ───────── */

function BulkUpload({ accessToken, domain, disabled, notify, onDone }: { accessToken: string; domain: string; disabled: boolean; notify: Notify; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<UploadResult | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const choose = (next: File | null | undefined) => {
    setResult(null); setError("");
    if (!next) { setFile(null); return; }
    if (!/\.(xlsx|csv)$/i.test(next.name)) { setFile(null); setError("Choose an .xlsx or .csv file."); return; }
    if (next.size > 5 * 1024 * 1024) { setFile(null); setError("The file is larger than 5 MB. Split it into smaller files."); return; }
    setFile(next);
  };
  const onDrop = (event: DragEvent<HTMLLabelElement>) => { event.preventDefault(); setDragging(false); if (!disabled) choose(event.dataTransfer.files[0]); };

  const upload = async () => {
    if (!file) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const form = new FormData(); form.append("file", file);
      const payload = await tpoApi<UploadResult>("/tenancy/roster/upload", accessToken, { method: "POST", form });
      setResult(payload); setFile(null); if (input.current) input.current.value = "";
      onDone(); window.setTimeout(onDone, 6000);
      notify(payload.summary.failed ? `Upload finished with ${payload.summary.failed} row issue${payload.summary.failed === 1 ? "" : "s"}.` : `${payload.summary.created} student${payload.summary.created === 1 ? "" : "s"} added.`, payload.summary.failed && !payload.summary.created ? "error" : "success");
    } catch (cause) { setError(errorMessage(cause, "The file could not be uploaded.")); }
    finally { setBusy(false); }
  };

  const errorReport = () => result && downloadFile("roster-upload-errors.csv", toCsv(["Row", "Issue"], result.errorRows.map(item => [item.row, item.reason])));

  return (
    <Card title="Add many students at once" description="Download the template, fill it in, and upload it. Every row is checked, then each student is emailed their sign-in details.">
      <div className="tp-bulk">
        <ol className="tp-steps">
          <li>
            <b>1</b>
            <div>
              <strong>Download the template</strong>
              <p>Keep the column headers exactly as they are.</p>
              <div className="tp-inline-actions">
                <a className="tp-btn secondary sm" href="/templates/placeble-student-roster-template.xlsx" download="placeble-student-roster-template.xlsx"><Download size={15} aria-hidden="true" /> Excel (.xlsx)</a>
                <button type="button" className="tp-btn secondary sm" onClick={() => downloadCsvTemplate(domain)}><Download size={15} aria-hidden="true" /> CSV</button>
              </div>
            </div>
          </li>
          <li>
            <b>2</b>
            <div>
              <strong>Fill in your students</strong>
              <dl className="tp-cols">
                <div><dt>email</dt><dd>Required · must use {disabled ? "an approved domain" : `@${domain}`}</dd></div>
                <div><dt>fullName</dt><dd>Required</dd></div>
                <div><dt>rollNumber</dt><dd>Optional</dd></div>
                <div><dt>branch</dt><dd>Required · must be enabled under Branches</dd></div>
                <div><dt>batch</dt><dd>Required · start-end year, e.g. {new Date().getFullYear() - 2}-{new Date().getFullYear()}</dd></div>
              </dl>
            </div>
          </li>
          <li><b>3</b><div><strong>Upload it</strong><p>Each new student gets an account and an email with a temporary password.</p></div></li>
        </ol>

        <div className="tp-drop-col">
          <label className={`tp-drop${dragging ? " dragging" : ""}${file ? " has-file" : ""}${disabled ? " disabled" : ""}`} onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
            <input ref={input} type="file" accept=".xlsx,.csv" disabled={disabled || busy} onChange={event => choose(event.target.files?.[0])} />
            <span aria-hidden="true">{file ? <FileSpreadsheet size={26} /> : <UploadCloud size={26} />}</span>
            <strong>{file ? file.name : disabled ? "Set a student email domain first" : "Drop your file here, or click to browse"}</strong>
            <small>{file ? `${Math.max(1, Math.round(file.size / 1024)).toLocaleString()} KB · ready to upload` : ".xlsx or .csv · up to 5 MB"}</small>
          </label>
          <div className="tp-inline-actions">
            <button type="button" className="tp-btn primary" disabled={!file || busy || disabled} onClick={() => void upload()}>{busy ? <><span className="tp-spinner light" aria-hidden="true" /> Checking every row…</> : <><UploadCloud size={16} aria-hidden="true" /> Upload &amp; send invitations</>}</button>
            {file && !busy && <button type="button" className="tp-btn ghost" onClick={() => { choose(null); if (input.current) input.current.value = ""; }}><X size={15} aria-hidden="true" /> Remove</button>}
          </div>
          {error && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</div>}
        </div>
      </div>

      {result && (
        <div className="tp-result" role="status">
          <div className="tp-result-stats">
            {([["Added", result.summary.created, "green"], ["Updated", result.summary.updated, "navy"], ["Skipped", result.summary.skipped, "amber"], ["Failed", result.summary.failed, "red"]] as const).map(([label, value, tone]) => <span key={label} className={`tone-${tone}`}><strong>{value}</strong><small>{label}</small></span>)}
          </div>
          <p className={result.invitations.emailConfigured ? "tp-result-ok" : "tp-field-hint"} style={{ marginTop: 12 }}>
            {result.invitations.emailConfigured ? <><Mail size={16} aria-hidden="true" /> Sending sign-in details to {result.invitations.queued} student{result.invitations.queued === 1 ? "" : "s"}. Their status updates to “Invited” as emails go out.</> : <><AlertTriangle size={14} aria-hidden="true" /> Email isn’t set up, so no sign-in details were sent. Add students one at a time to copy their credentials.</>}
          </p>
          {result.errorRows.length > 0 ? (
            <details open>
              <summary><AlertTriangle size={15} aria-hidden="true" /> {result.errorRows.length} row{result.errorRows.length === 1 ? "" : "s"} need attention <button type="button" className="tp-btn ghost sm" onClick={event => { event.preventDefault(); errorReport(); }}><Download size={14} aria-hidden="true" /> Error report</button></summary>
              <ul>{result.errorRows.map(item => <li key={`${item.row}-${item.reason}`}><b>Row {item.row}</b>{item.reason}</li>)}</ul>
            </details>
          ) : <p className="tp-result-ok"><CheckCircle2 size={16} aria-hidden="true" /> Every row was valid.</p>}
        </div>
      )}
    </Card>
  );
}
