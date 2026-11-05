import { AlertTriangle, Search, UserPlus, UserRound } from "lucide-react";
import { MoveToB2cModal } from "./MoveToB2cModal";
import { useEffect, useState, type FormEvent } from "react";
import { Avatar, Card, EmptyState, ErrorState, Loading, Modal, Pager, StatCard, errorMessage, formatDate, tpoApi, useLoad } from "@/pages/tpo/tpo-core";
import "@/pages/tpo/tpo.css";

type Summary = { total: number; verified: number; unverified: number; signups30: number; active30: number; paying: number; free: number; suspended: number };
type Row = { id: string; name: string; email: string; status: string; emailVerified: boolean; joinedAt: string; lastLoginAt: string | null; programme: string; graduationYear: number | null; plan: "free" | "pro"; interval: string | null; renewsAt: string | null; source: string | null; usedThisMonth: number };
type List = { total: number; page: number; pageSize: number; students: Row[] };
type Detail = {
  student: { id: string; name: string; email: string; status: string; emailVerified: boolean; joinedAt: string; lastLoginAt: string | null; programme: string; graduationYear: number | null; skills: string[]; preferredRoles: string[]; onboarded: boolean };
  plan: { plan: "free" | "pro"; interval: string | null; renewsAt: string | null; features: Array<{ feature: string; label: string; used: number; limit: number | null }> };
  subscription: { source: string; note: string } | null;
};

/** Superadmin: direct (B2C) students. They belong to Placeble, not to any institute, so we manage them here. */
export function DirectStudentsScreen({ accessToken }: { accessToken: string }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState<"all" | "free" | "pro">("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => { const timer = window.setTimeout(() => { setQuery(search); setPage(1); }, 300); return () => window.clearTimeout(timer); }, [search]);

  const summary = useLoad(() => tpoApi<Summary>("/platform-admin/direct-students/summary", accessToken), [accessToken]);
  const list = useLoad(() => tpoApi<List>(`/platform-admin/direct-students?search=${encodeURIComponent(query)}&plan=${plan}&page=${page}`, accessToken), [accessToken, query, plan, page]);
  const refresh = () => { summary.reload(); list.reload(); };

  return (
    <div className="pa-screen-stack">
      {summary.data && (
        <div className="tp-stats">
          <StatCard icon={UserRound} label="Direct students" value={summary.data.total} note={`${summary.data.signups30} joined in the last 30 days`} />
          <StatCard icon={UserRound} label="Paying (Pro)" value={summary.data.paying} note={`${summary.data.free} on the free plan`} tone="green" />
          <StatCard icon={UserRound} label="Active" value={summary.data.active30} note="Signed in within 30 days" tone="amber" />
          <StatCard icon={UserRound} label="Not verified" value={summary.data.unverified} note={summary.data.suspended ? `${summary.data.suspended} suspended` : "Email not confirmed yet"} tone="red" />
        </div>
      )}

      <div className="tp-page-actions" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="tp-btn primary" onClick={() => setMoveOpen(true)}><UserPlus size={16} aria-hidden="true" /> Make a student B2C</button>
      </div>
      {moveOpen && <MoveToB2cModal accessToken={accessToken} onClose={() => setMoveOpen(false)} onDone={name => { setMoveOpen(false); setNote(`${name} is now a B2C student.`); refresh(); }} />}
      {note && <div className="tp-alert warn" role="status" style={{ marginTop: 0 }}>{note}</div>}

      <ChangeRequests accessToken={accessToken} onChanged={refresh} />

      <Card flush>
        <div className="tp-toolbar">
          <label className="tp-search"><Search size={16} aria-hidden="true" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name or email" aria-label="Search direct students" /></label>
          <select className="tp-select" value={plan} onChange={event => { setPlan(event.target.value as typeof plan); setPage(1); }} aria-label="Filter by plan"><option value="all">All plans</option><option value="free">Free</option><option value="pro">Pro</option></select>
        </div>
        {list.loading && !list.data ? <Loading label="Loading students…" /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !list.data?.students.length ? (
          <EmptyState icon={UserRound} title="No direct students found" text={query || plan !== "all" ? "Try a different search or filter." : "Students who sign up on their own appear here."} />
        ) : (
          <>
            <div className="tp-table" role="table" aria-label="Direct students">
              <div className="tp-tr head cols-direct" role="row"><span role="columnheader">Student</span><span role="columnheader">Plan</span><span role="columnheader">Used this month</span><span role="columnheader">Last sign-in</span><span role="columnheader" /></div>
              {list.data.students.map(student => (
                <div className="tp-tr cols-direct" role="row" key={student.id}>
                  <span className="tp-cell-person" role="cell"><Avatar name={student.name} /><b>{student.name}<small>{student.email}{!student.emailVerified && " · not verified"}</small></b></span>
                  <span role="cell" data-label="Plan"><em className={`tp-pill ${student.plan === "pro" ? "st-ready" : "st-neutral"}`}>{student.plan === "pro" ? "Pro" : "Free"}</em>{student.renewsAt && <small className="tp-sub">until {formatDate(student.renewsAt)}</small>}</span>
                  <span role="cell" data-label="Used">{student.usedThisMonth}</span>
                  <span role="cell" data-label="Last sign-in">{student.lastLoginAt ? formatDate(student.lastLoginAt) : "Never"}{student.status === "suspended" && <small className="tp-sub">Suspended</small>}</span>
                  <span role="cell" className="tp-cell-end"><button type="button" className="tp-btn ghost sm" onClick={() => setOpen(student.id)} aria-label={`Manage ${student.name}`}>Manage</button></span>
                </div>
              ))}
            </div>
            <Pager page={list.data.page} pages={Math.max(1, Math.ceil(list.data.total / list.data.pageSize))} total={list.data.total} pageSize={list.data.pageSize} onChange={setPage} />
          </>
        )}
      </Card>

      {open && <ManageModal id={open} accessToken={accessToken} onClose={() => setOpen(null)} onChanged={refresh} />}
    </div>
  );
}

type ChangeRow = { id: string; name: string; email: string; fields: string[]; reason: string; previous: { degree: string; graduationYear: number | null }; requestedAt: string };

/** Students ask to unlock course / graduating year; approving gives them exactly one edit. */
function ChangeRequests({ accessToken, onChanged }: { accessToken: string; onChanged: () => void }) {
  const { data, loading, error, reload } = useLoad(() => tpoApi<{ requests: ChangeRow[] }>("/platform-admin/direct-students/profile-changes?status=pending", accessToken), [accessToken]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [formError, setFormError] = useState("");
  const decide = async (row: ChangeRow, decision: "approve" | "reject") => {
    setBusy(row.id); setFormError("");
    try { await tpoApi(`/platform-admin/direct-students/profile-changes/${row.id}`, accessToken, { method: "PATCH", json: { decision, note: (notes[row.id] ?? "").trim() } }); reload(); onChanged(); }
    catch (cause) { setFormError(errorMessage(cause)); }
    finally { setBusy(""); }
  };
  if (loading && !data) return null;
  if (error) return <Card title="Profile change requests"><ErrorState message={error} onRetry={reload} /></Card>;
  if (!data?.requests.length) return null;
  return (
    <Card title={`Profile change requests (${data.requests.length})`}>
      {formError && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{formError}</div>}
      <ul className="st-usage">
        {data.requests.map(row => (
          <li key={row.id} style={{ display: "block" }}>
            <b>{row.name}</b> <small>{row.email} · {formatDate(row.requestedAt)}</small>
            <p>Wants to change {row.fields.map(field => (field === "degree" ? "programme" : "graduating year")).join(" and ")}. Currently {row.previous.degree || "—"}{row.previous.graduationYear ? ` · ${row.previous.graduationYear}` : ""}.</p>
            <p><em>“{row.reason}”</em></p>
            <div className="tp-inline-actions">
              <input aria-label={`Note for ${row.name}`} value={notes[row.id] ?? ""} onChange={event => setNotes(current => ({ ...current, [row.id]: event.target.value }))} placeholder="Note to student (required if declining)" maxLength={500} />
              <button type="button" className="tp-btn primary sm" disabled={Boolean(busy)} onClick={() => void decide(row, "approve")}>{busy === row.id ? "Saving…" : "Approve (one edit)"}</button>
              <button type="button" className="tp-btn ghost danger sm" disabled={Boolean(busy) || (notes[row.id] ?? "").trim().length < 3} onClick={() => void decide(row, "reject")}>Decline</button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ManageModal({ id, accessToken, onClose, onChanged }: { id: string; accessToken: string; onClose: () => void; onChanged: () => void }) {
  const { data, loading, error, reload } = useLoad(() => tpoApi<Detail>(`/platform-admin/direct-students/${id}`, accessToken), [id, accessToken]);
  const [grant, setGrant] = useState<"monthly" | "yearly" | "custom">("monthly");
  const [months, setMonths] = useState("3");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [formError, setFormError] = useState("");

  const run = async (label: string, path: string, json: unknown) => {
    setBusy(label); setFormError("");
    try { await tpoApi(`/platform-admin/direct-students/${id}/${path}`, accessToken, { method: "PATCH", json }); reload(); onChanged(); setNote(""); setReason(""); }
    catch (cause) { setFormError(errorMessage(cause)); }
    finally { setBusy(""); }
  };
  const submitGrant = (event: FormEvent) => {
    event.preventDefault();
    void run("grant", "plan", { plan: "pro", note, ...(grant === "custom" ? { months: Number(months) } : { interval: grant }) });
  };

  return (
    <Modal title={data?.student.name ?? "Direct student"} description={data?.student.email} onClose={onClose} wide>
      {loading && !data ? <Loading /> : error || !data ? <ErrorState message={error || "Could not load this student."} onRetry={reload} /> : (
        <div className="tp-form">
          {formError && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{formError}</div>}
          <dl className="st-locked-dl">
            <div><dt>Joined</dt><dd>{formatDate(data.student.joinedAt)}</dd></div>
            <div><dt>Last sign-in</dt><dd>{data.student.lastLoginAt ? formatDate(data.student.lastLoginAt) : "Never"}</dd></div>
            <div><dt>Email</dt><dd>{data.student.emailVerified ? "Verified" : "Not verified"}</dd></div>
            <div><dt>Account</dt><dd>{data.student.status === "active" ? "Active" : "Suspended"}</dd></div>
            <div><dt>Programme</dt><dd>{data.student.programme || "—"}{data.student.graduationYear ? ` · ${data.student.graduationYear}` : ""}</dd></div>
            <div><dt>Profile set up</dt><dd>{data.student.onboarded ? "Yes" : "Not yet"}</dd></div>
          </dl>

          <section>
            <h4 className="sr-h">Plan · {data.plan.plan === "pro" ? `Pro${data.plan.interval ? ` (${data.plan.interval})` : ""}` : "Free"}{data.plan.renewsAt && ` · until ${formatDate(data.plan.renewsAt)}`}</h4>
            <ul className="st-usage">{data.plan.features.map(item => <li key={item.feature}><span>{item.label.charAt(0).toUpperCase() + item.label.slice(1)}</span><b>{item.used}{item.limit !== null ? ` / ${item.limit}` : ""}</b></li>)}</ul>
          </section>

          <form onSubmit={submitGrant} className="tp-form">
            <h4 className="sr-h">{data.plan.plan === "pro" ? "Extend Pro" : "Grant Pro"}</h4>
            <div className="tp-field-row">
              <div className="tp-field"><label htmlFor="gr-len">Length</label><select id="gr-len" value={grant} onChange={event => setGrant(event.target.value as typeof grant)}><option value="monthly">1 month</option><option value="yearly">1 year</option><option value="custom">Custom months</option></select></div>
              {grant === "custom" && <div className="tp-field"><label htmlFor="gr-m">Months</label><input id="gr-m" type="number" min={1} max={36} value={months} onChange={event => setMonths(event.target.value)} /></div>}
            </div>
            <div className="tp-field"><label htmlFor="gr-note">Note <em>Optional</em></label><input id="gr-note" value={note} onChange={event => setNote(event.target.value)} placeholder="e.g. Paid by bank transfer, trial, goodwill" /></div>
            <div className="tp-inline-actions">
              <button type="submit" className="tp-btn primary" disabled={Boolean(busy)}>{busy === "grant" ? "Saving…" : data.plan.plan === "pro" ? "Extend plan" : "Grant Pro"}</button>
              {data.plan.plan === "pro" && <button type="button" className="tp-btn secondary" disabled={Boolean(busy)} onClick={() => void run("free", "plan", { plan: "free", note })}>{busy === "free" ? "Saving…" : "Move to Free"}</button>}
            </div>
          </form>

          <section className="tp-form">
            <h4 className="sr-h">{data.student.status === "active" ? "Suspend account" : "Restore account"}</h4>
            <div className="tp-field"><label htmlFor="st-reason">Reason <em>Required</em></label><input id="st-reason" value={reason} onChange={event => setReason(event.target.value)} placeholder="Recorded in the activity history" /></div>
            <div><button type="button" className={`tp-btn ${data.student.status === "active" ? "ghost danger" : "secondary"}`} disabled={Boolean(busy) || reason.trim().length < 3} onClick={() => void run("status", "status", { status: data.student.status === "active" ? "suspended" : "active", reason: reason.trim() })}>{data.student.status === "active" ? "Suspend" : "Restore"}</button></div>
          </section>
        </div>
      )}
    </Modal>
  );
}
