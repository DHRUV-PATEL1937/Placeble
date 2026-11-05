import { AlertTriangle, ArrowLeft, ArrowRight, Building2, Check, Copy, GraduationCap, Mail, Plus, TrendingUp, UserCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Avatar, Card, EmptyState, ErrorState, Loading, Modal, ScoreBar, StatCard, errorMessage, formatDate, tpoApi, useLoad, type Notify } from "@/pages/tpo/tpo-core";
import { LogoUploader } from "@/components/ui/org-brand";
import { AccountTypeFields, CommercialPanel, PilotBadge, type Commercial, type CommercialInput } from "./CommercialPanel";
import { CollegeDetail } from "./AdminColleges";
import { StatusChip } from "./admin-ui";
import { cleanNameInput, EMAIL_RE, nameProblem } from "@/services/validation";
import "@/pages/tpo/tpo.css";

type University = { id: string; name: string; commercial?: Commercial; status: "active" | "suspended"; institutes: number; admins: Array<{ id: string; name: string; email: string; status: string }> };

/** Platform admin: universities and their university TPOs. Rendered inside the existing platform console. */
export function UniversitiesScreen({ accessToken, notify }: { accessToken: string; notify?: Notify }) {
  const { data, loading, error, reload } = useLoad(() => tpoApi<{ universities: University[] }>("/platform-admin/universities", accessToken).then(payload => payload.universities), [accessToken]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const toggle = async (university: University) => {
    const next = university.status === "active" ? "suspended" : "active";
    const reason = window.prompt(`Reason for ${next === "suspended" ? "suspending" : "reactivating"} ${university.name}?`);
    if (!reason || reason.trim().length < 3) return;
    setBusy(university.id); setActionError("");
    try { await tpoApi(`/platform-admin/universities/${university.id}/status`, accessToken, { method: "PATCH", json: { status: next, reason: reason.trim() } }); reload(); }
    catch (cause) { setActionError(errorMessage(cause)); }
    finally { setBusy(""); }
  };

  if (openId) return <UniversityDetail id={openId} accessToken={accessToken} notify={notify ?? (() => undefined)} onBack={() => { setOpenId(null); reload(); }} />;

  return (
    <div className="tp-shell" style={{ minHeight: 0, background: "transparent" }}>
      <div className="tp-page-head" style={{ marginBottom: 16 }}>
        <div><p style={{ marginTop: 0 }}>A university groups several colleges under one university TPO. Colleges can also exist without one.</p></div>
        <div className="tp-page-actions"><button type="button" className="tp-btn primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" /> New university</button></div>
      </div>
      {actionError && <div className="tp-alert error" role="alert" style={{ marginBottom: 16 }}><AlertTriangle size={16} aria-hidden="true" />{actionError}</div>}
      <Card flush>
        {loading && !data ? <Loading label="Loading universities…" /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.length ? (
          <EmptyState icon={Building2} title="No universities yet" text="Create a university and invite its TPO. They can then add their own colleges." action={<button type="button" className="tp-btn primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" /> New university</button>} />
        ) : (
          <ul className="tp-queue">
            {data.map(university => (
              <li key={university.id}>
                <span className="tp-icon-tile"><Building2 size={20} aria-hidden="true" /></span>
                <div className="tp-queue-main">
                  <strong>{university.name}</strong>
                  <small>{university.institutes} {university.institutes === 1 ? "college" : "colleges"} · {university.admins.length ? university.admins.map(admin => `${admin.name} (${admin.email})`).join(", ") : "University TPO hasn’t activated yet"}</small>
                </div>
                <PilotBadge commercial={university.commercial} /><span className={`tp-pill ${university.status === "active" ? "st-ready" : "st-at-risk"}`}>{university.status === "active" ? "Active" : "Suspended"}</span>
                <div className="tp-queue-actions"><button type="button" className="tp-btn secondary sm" onClick={() => setOpenId(university.id)}>Open <ArrowRight size={14} aria-hidden="true" /></button><button type="button" className={`tp-btn sm ${university.status === "active" ? "ghost danger" : "secondary"}`} disabled={busy === university.id} onClick={() => void toggle(university)}>{university.status === "active" ? "Suspend" : "Reactivate"}</button></div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {creating && <CreateUniversity accessToken={accessToken} onClose={() => setCreating(false)} onCreated={reload} />}
    </div>
  );
}

function CreateUniversity({ accessToken, onClose, onCreated }: { accessToken: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", tpoName: "", tpoEmail: "" });
  const [account, setAccount] = useState<CommercialInput>({ type: "customer" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (form.name.trim().length < 2) { setError("Enter the university name."); return; }
    const nameIssue = nameProblem(form.tpoName, "TPO’s name"); if (nameIssue) { setError(nameIssue); return; }
    if (!EMAIL_RE.test(form.tpoEmail.trim())) { setError("Enter a valid email for the university TPO."); return; }
    setBusy(true);
    try { const payload = await tpoApi<{ activationPath: string }>("/platform-admin/universities", accessToken, { method: "POST", json: { name: form.name.trim(), tpoName: form.tpoName.trim(), tpoEmail: form.tpoEmail.trim(), commercial: account } }); setLink(new URL(payload.activationPath, window.location.origin).toString()); onCreated(); }
    catch (cause) { setError(errorMessage(cause, "Could not create this university.")); }
    finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ } };

  return (
    <Modal title="New university" description="Creates the university and a 48-hour activation link for its first university TPO." onClose={onClose}>
      {link ? (
        <>
          <div className="tp-sent"><span aria-hidden="true"><Mail size={24} /></span><h3>University created</h3><p>We’ve emailed <b>{form.tpoEmail}</b> their activation link. If email isn’t configured yet, share this link directly:</p>
            <div className="tp-linkbox"><code>{link}</code><button type="button" className="tp-btn secondary sm" onClick={() => void copy()}>{copied ? <><Check size={14} aria-hidden="true" /> Copied</> : <><Copy size={14} aria-hidden="true" /> Copy</>}</button></div></div>
          <footer className="tp-modal-foot"><button type="button" className="tp-btn primary" onClick={onClose}>Done</button></footer>
        </>
      ) : (
        <form className="tp-form" onSubmit={submit} noValidate>
          {error && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</div>}
          <div className="tp-field"><label htmlFor="nu-name">University name</label><input id="nu-name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Charusat University" autoComplete="off" /></div>
          <div className="tp-field-row">
            <div className="tp-field"><label htmlFor="nu-tpo">University TPO’s name</label><input id="nu-tpo" value={form.tpoName} onChange={event => setForm({ ...form, tpoName: cleanNameInput(event.target.value) })} autoComplete="off" /></div>
            <div className="tp-field"><label htmlFor="nu-email">University TPO’s email</label><input id="nu-email" type="email" value={form.tpoEmail} onChange={event => setForm({ ...form, tpoEmail: event.target.value })} autoComplete="off" /></div>
          </div>
          <AccountTypeFields value={account} onChange={setAccount} />
          <footer className="tp-modal-foot"><button type="button" className="tp-btn ghost" onClick={onClose}>Cancel</button><button type="submit" className="tp-btn primary" disabled={busy}>{busy ? "Creating…" : "Create university"}</button></footer>
        </form>
      )}
    </Modal>
  );
}

type UniversityPayload = {
  university: { name: string; status: string; logoUrl?: string; commercial?: Commercial } | null;
  totals: { institutes: number; students: number; ready: number; atRisk: number; signedIn: number; invited: number; average: number };
  institutes: Array<{ id: string; name: string; status: string; domains: string[]; students: number; signedIn: number; invited: number; tpos: number; principals: number; average: number; ready: number; atRisk: number }>;
  tpos: Array<{ id: string; name: string; email: string; status: string; lastLoginAt: string | null }>;
};

/** Superadmin view of one university: how it is doing, its colleges and its TPOs. Open a college for its students. */
function UniversityDetail({ id, accessToken, notify, onBack }: { id: string; accessToken: string; notify: Notify; onBack: () => void }) {
  const { data, loading, error, reload } = useLoad(() => tpoApi<UniversityPayload>(`/platform-admin/universities/${id}`, accessToken), [id, accessToken]);
  const [collegeId, setCollegeId] = useState<string | null>(null);

  if (collegeId) return <CollegeDetail id={collegeId} accessToken={accessToken} notify={notify} backLabel={data?.university?.name ?? "University"} onBack={() => { setCollegeId(null); reload(); }} />;
  if (loading && !data) return <Card><Loading label="Loading university…" /></Card>;
  if (error || !data) return <><button type="button" className="tp-btn ghost" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> All universities</button><Card><ErrorState message={error || "Could not load this university."} onRetry={reload} /></Card></>;

  return (
    <>
      <button type="button" className="tp-btn ghost" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> All universities</button>
      <section className="ad-detail-hero">
        <Avatar name={data.university?.name ?? "University"} size={52} />
        <div><h1>{data.university?.name}</h1><p>{data.totals.institutes} {data.totals.institutes === 1 ? "college" : "colleges"} · {data.totals.students} students</p></div>
        <StatusChip value={data.university?.status ?? "active"} />
      </section>

      <CommercialPanel kind="university" id={id} name={data.university?.name ?? "This university"} commercial={data.university?.commercial} accessToken={accessToken} notify={notify} onChanged={reload} />

      <Card title="University logo"><LogoUploader name={data.university?.name ?? "University"} logoUrl={data.university?.logoUrl} accessToken={accessToken} path={`/platform-admin/universities/${id}/logo`} notify={notify} onChanged={() => reload()} label="University logo" scope="university" /></Card>

      <div className="tp-stats">
        <StatCard icon={Building2} label="Colleges" value={data.totals.institutes} note="In this university" />
        <StatCard icon={GraduationCap} tone="amber" label="Students" value={data.totals.students} note={`${data.totals.signedIn} signed in · ${data.totals.invited} not yet`} />
        <StatCard icon={TrendingUp} tone="green" label="Average readiness" value={data.totals.average} note="Across all colleges" />
        <StatCard icon={UserCheck} tone="red" label="Placement-ready" value={data.totals.ready} note={`${data.totals.atRisk} need support`} />
      </div>

      <Card title="Colleges" description="Open a college to see its students and reports." flush>
        {!data.institutes.length ? <EmptyState icon={Building2} title="No colleges yet" text="The university TPO hasn’t added a college." /> : (
          <div className="tp-table" role="table" aria-label="Colleges in this university">
            <div className="tp-tr head cols-college" role="row"><span role="columnheader">College</span><span role="columnheader">Students</span><span role="columnheader">Readiness</span><span role="columnheader">Team</span><span role="columnheader" /></div>
            {data.institutes.map(college => (
              <div className="tp-tr cols-college" role="row" key={college.id}>
                <span className="tp-cell-person" role="cell"><Avatar name={college.name} /><b>{college.name}<small>{college.domains.map(domain => `@${domain}`).join(" ") || "No domain"}</small></b></span>
                <span role="cell" data-label="Students">{college.students}<small className="tp-sub">{college.signedIn} signed in · {college.invited} pending</small></span>
                <span role="cell" data-label="Readiness"><ScoreBar value={college.average} /></span>
                <span role="cell" data-label="Team">{college.tpos} TPO · {college.principals} principal</span>
                <span role="cell" className="tp-cell-end"><button type="button" className="tp-btn ghost sm" onClick={() => setCollegeId(college.id)} aria-label={`Open ${college.name}`}>Open</button></span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="University TPOs" flush>
        {!data.tpos.length ? <EmptyState icon={Building2} title="No TPO yet" text="Nobody has activated a university TPO account." /> : (
          <ul className="tp-queue">{data.tpos.map(tpo => <li key={tpo.id}><div className="tp-queue-main"><strong>{tpo.name}</strong><small>{tpo.email} · {tpo.lastLoginAt ? `last in ${formatDate(tpo.lastLoginAt)}` : "never signed in"}</small></div><StatusChip value={tpo.status === "active" ? "active" : "pending"} /></li>)}</ul>
        )}
      </Card>
    </>
  );
}
