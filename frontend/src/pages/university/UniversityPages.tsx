import { DomainInput } from "@/components/ui/domain-input";
import { AlertTriangle, ArrowRight, Building2, Check, Copy, GraduationCap, Mail, Plus, ShieldCheck, TrendingUp, UserCheck, UserPlus, UsersRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Avatar, Card, EmptyState, ErrorState, Loading, Modal, PageHeader, ScoreBar, StatCard, errorMessage, formatDate, tpoApi, useLoad, type Notify } from "@/pages/tpo/tpo-core";

type Institute = { id: string; name: string; status: string; domains: string[]; students: number; pendingApprovals: number; signedIn: number; invited: number; activeBatches?: number; graduatedBatches?: number; tpos: number; principals: number; average: number; ready: number; atRisk: number };
type Overview = { university: { name: string } | null; totals: { institutes: number; students: number; ready: number; atRisk: number; pendingApprovals: number; signedIn: number; invited: number; average: number }; institutes: Institute[] };
type Permissions = { roster: boolean; approvals: boolean; recruiters: boolean; settings: boolean; messaging: boolean };
type Member = { id: string; name: string; email: string; role: "tpo" | "principal"; status: string; lastLoginAt: string | null; permissions: Permissions | null };
type TeamPayload = { institution: { id: string; name: string }; members: Member[]; invites: Array<{ id: string; email: string; name: string; role: string; expiresAt: string }> };
const PERMISSION_LABELS: Array<{ key: keyof Permissions; label: string; help: string }> = [
  { key: "roster", label: "Add & invite students", help: "Add students, upload the roster, resend sign-in details" },
  { key: "recruiters", label: "Manage recruiter access", help: "Approve companies and drives" },
  { key: "settings", label: "Change college settings", help: "Email domains and marketplace" },
  { key: "messaging", label: "Message students", help: "Use the chat with students" },
];

export function UniversityPages({ page, accessToken, notify, go, enter, entering, enterError }: { page: string; accessToken: string; notify: Notify; go: (key: string) => void; enter: (id: string) => void; entering: string; enterError: string }) {
  const { data, loading, error, reload } = useLoad(() => tpoApi<Overview>("/university/overview", accessToken), [accessToken]);
  const [createOpen, setCreateOpen] = useState(false);
  const [teamFor, setTeamFor] = useState<Institute | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const title = page === "Institutes" ? "Institutes" : data?.university?.name ?? "University";
  return (
    <>
      <PageHeader title={title} description={page === "Institutes" ? "Every college in your university. Open one to work inside it." : "How your colleges are doing across placements."}
        actions={<><button type="button" className="tp-btn secondary" onClick={() => setInviteOpen(true)}><UserPlus size={16} aria-hidden="true" /> Invite university TPO</button><button type="button" className="tp-btn primary" onClick={() => setCreateOpen(true)}><Plus size={16} aria-hidden="true" /> Add institute</button></>} />
      {enterError && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{enterError}</div>}

      {loading && !data ? <Card><Loading label="Loading your university…" /></Card> : error || !data ? <Card><ErrorState message={error || "Could not load your university."} onRetry={reload} /></Card> : (
        <>
          {page !== "Institutes" && (
            <div className="tp-stats">
              <StatCard icon={Building2} label="Institutes" value={data.totals.institutes} note="In your university" />
              <StatCard icon={GraduationCap} label="Students" value={data.totals.students} note={`${data.totals.signedIn} signed in · ${data.totals.invited} not yet`} tone="amber" />
              <StatCard icon={TrendingUp} label="Average readiness" value={data.totals.average} note="Across all colleges" tone="green" />
              <StatCard icon={UserCheck} label="Placement-ready" value={data.totals.ready} note={`${data.totals.atRisk} need support`} tone="red" />
            </div>
          )}

          <Card title={page === "Institutes" ? undefined : "Institutes"} description={page === "Institutes" ? undefined : "Compare colleges and open any one."} flush>
            {!data.institutes.length ? <EmptyState icon={Building2} title="No institutes yet" text="Add your first college. We’ll invite its TPO to set up their workspace." action={<button type="button" className="tp-btn primary" onClick={() => setCreateOpen(true)}><Plus size={16} aria-hidden="true" /> Add institute</button>} /> : (
              <div className="tp-table" role="table" aria-label="Institutes">
                <div className="tp-tr head cols-uni" role="row"><span role="columnheader">Institute</span><span role="columnheader">Students</span><span role="columnheader">Readiness</span><span role="columnheader">Team</span><span role="columnheader" /></div>
                {data.institutes.map(institute => (
                  <div className="tp-tr cols-uni" role="row" key={institute.id}>
                    <span className="tp-cell-person" role="cell"><Avatar name={institute.name} /><b>{institute.name}<small>{institute.status === "active" ? institute.domains.map(domain => `@${domain}`).join(" ") : "Suspended"}{institute.invited > 0 && ` · ${institute.invited} not signed in`}</small></b></span>
                    <span role="cell" data-label="Students">{institute.students}</span>
                    <span role="cell" data-label="Readiness"><ScoreBar value={institute.average} /></span>
                    <span role="cell" data-label="Team">{institute.tpos} TPO · {institute.principals} principal<small className="tp-sub">{institute.activeBatches ?? 0} active batch{institute.activeBatches === 1 ? "" : "es"}{institute.graduatedBatches ? ` · ${institute.graduatedBatches} graduated` : ""}</small></span>
                    <span role="cell" className="tp-cell-actions">
                      <button type="button" className="tp-btn ghost sm" onClick={() => setTeamFor(institute)}>Team</button>
                      <button type="button" className="tp-btn primary sm" disabled={institute.status !== "active" || entering === institute.id} onClick={() => enter(institute.id)}>{entering === institute.id ? "Opening…" : <>Open <ArrowRight size={14} aria-hidden="true" /></>}</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
          {page !== "Institutes" && data.institutes.length > 0 && <p className="tp-field-hint"><ShieldCheck size={14} aria-hidden="true" /> Opening an institute lets you work in it with full TPO rights. <button type="button" className="ax-link" onClick={() => go("Institutes")}>Manage institutes</button></p>}
        </>
      )}

      {createOpen && <CreateInstituteModal accessToken={accessToken} onClose={() => setCreateOpen(false)} onCreated={() => { reload(); notify("Institute created."); }} />}
      {teamFor && <TeamModal institute={teamFor} accessToken={accessToken} notify={notify} onClose={() => { setTeamFor(null); reload(); }} />}
      {inviteOpen && <InviteUniversityTpoModal accessToken={accessToken} notify={notify} onClose={() => setInviteOpen(false)} />}
    </>
  );
}

function ActivationLink({ path, email }: { path: string; email: string }) {
  const link = new URL(path, window.location.origin).toString();
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ } };
  return (
    <div className="tp-sent">
      <span aria-hidden="true"><Mail size={24} /></span>
      <h3>Invitation created</h3>
      <p>We’ve emailed <b>{email}</b> a link to set up their account. If email isn’t configured yet, share this link with them directly:</p>
      <div className="tp-linkbox"><code>{link}</code><button type="button" className="tp-btn secondary sm" onClick={() => void copy()}>{copied ? <><Check size={14} aria-hidden="true" /> Copied</> : <><Copy size={14} aria-hidden="true" /> Copy</>}</button></div>
    </div>
  );
}

function CreateInstituteModal({ accessToken, onClose, onCreated }: { accessToken: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", tpoName: "", tpoEmail: "" });
  const [domains, setDomains] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ path: string; email: string } | null>(null);
  const set = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (form.name.trim().length < 2 || !domains.length || form.tpoName.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.tpoEmail.trim())) { setError("Fill in every field with valid details."); return; }
    setBusy(true);
    try {
      const payload = await tpoApi<{ activationPath: string }>("/university/institutes", accessToken, { method: "POST", json: { name: form.name.trim(), approvedEmailDomains: domains, tpoName: form.tpoName.trim(), tpoEmail: form.tpoEmail.trim() } });
      setCreated({ path: payload.activationPath, email: form.tpoEmail.trim() }); onCreated();
    } catch (cause) { setError(errorMessage(cause, "Could not create this institute.")); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Add an institute" description="Creates the college workspace and invites its first TPO." onClose={onClose}>
      {created ? <><ActivationLink path={created.path} email={created.email} /><footer className="tp-modal-foot"><button type="button" className="tp-btn primary" onClick={onClose}>Done</button></footer></> : (
        <form className="tp-form" onSubmit={submit} noValidate>
          {error && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</div>}
          <div className="tp-field"><label htmlFor="ci-name">Institute name</label><input id="ci-name" value={form.name} onChange={event => set("name", event.target.value)} placeholder="CMPICA" autoComplete="off" /></div>
          <div className="tp-field"><label htmlFor="ci-domains">Student email domains</label><DomainInput id="ci-domains" values={domains} onChange={setDomains} placeholder="cmpica.ac.in" /></div>
          <div className="tp-field-row">
            <div className="tp-field"><label htmlFor="ci-tpo">First TPO’s name</label><input id="ci-tpo" value={form.tpoName} onChange={event => set("tpoName", event.target.value)} autoComplete="off" /></div>
            <div className="tp-field"><label htmlFor="ci-email">First TPO’s email</label><input id="ci-email" type="email" value={form.tpoEmail} onChange={event => set("tpoEmail", event.target.value)} autoComplete="off" /></div>
          </div>
          <footer className="tp-modal-foot"><button type="button" className="tp-btn ghost" onClick={onClose}>Cancel</button><button type="submit" className="tp-btn primary" disabled={busy}>{busy ? "Creating…" : "Create institute"}</button></footer>
        </form>
      )}
    </Modal>
  );
}

function InviteUniversityTpoModal({ accessToken, notify, onClose }: { accessToken: string; notify: Notify; onClose: () => void }) {
  const [form, setForm] = useState({ name: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ path: string; email: string } | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (form.name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setError("Enter a name and a valid email."); return; }
    setBusy(true);
    try { const payload = await tpoApi<{ activationPath: string }>("/university/team", accessToken, { method: "POST", json: { name: form.name.trim(), email: form.email.trim() } }); setCreated({ path: payload.activationPath, email: form.email.trim() }); notify("Invitation created."); }
    catch (cause) { setError(errorMessage(cause, "Could not create this invitation.")); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Invite a university TPO" description="They’ll have the same rights as you across every institute." onClose={onClose}>
      {created ? <><ActivationLink path={created.path} email={created.email} /><footer className="tp-modal-foot"><button type="button" className="tp-btn primary" onClick={onClose}>Done</button></footer></> : (
        <form className="tp-form" onSubmit={submit} noValidate>
          {error && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</div>}
          <div className="tp-field"><label htmlFor="iu-name">Full name</label><input id="iu-name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} autoComplete="off" /></div>
          <div className="tp-field"><label htmlFor="iu-email">Work email</label><input id="iu-email" type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} autoComplete="off" /></div>
          <footer className="tp-modal-foot"><button type="button" className="tp-btn ghost" onClick={onClose}>Cancel</button><button type="submit" className="tp-btn primary" disabled={busy}>{busy ? "Creating…" : "Create invitation"}</button></footer>
        </form>
      )}
    </Modal>
  );
}

function TeamModal({ institute, accessToken, notify, onClose }: { institute: Institute; accessToken: string; notify: Notify; onClose: () => void }) {
  const { data, loading, error, reload } = useLoad(() => tpoApi<TeamPayload>(`/university/institutes/${institute.id}/team`, accessToken), [institute.id, accessToken]);
  const [busy, setBusy] = useState("");
  const [invite, setInvite] = useState({ name: "", email: "", role: "tpo" as "tpo" | "principal" });
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [created, setCreated] = useState<{ path: string; email: string } | null>(null);

  const patch = async (member: Member, body: { status?: string; permissions?: Partial<Permissions> }, done: string) => {
    setBusy(member.id);
    try { await tpoApi(`/university/institutes/${institute.id}/team/${member.id}`, accessToken, { method: "PATCH", json: body }); reload(); notify(done); }
    catch (cause) { notify(errorMessage(cause), "error"); }
    finally { setBusy(""); }
  };
  const sendInvite = async (event: FormEvent) => {
    event.preventDefault(); setInviteError("");
    if (invite.name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invite.email.trim())) { setInviteError("Enter a name and a valid email."); return; }
    setInviting(true);
    try { const payload = await tpoApi<{ activationPath: string }>(`/university/institutes/${institute.id}/team`, accessToken, { method: "POST", json: { name: invite.name.trim(), email: invite.email.trim(), role: invite.role } }); setCreated({ path: payload.activationPath, email: invite.email.trim() }); setInvite({ name: "", email: "", role: invite.role }); reload(); }
    catch (cause) { setInviteError(errorMessage(cause, "Could not create this invitation.")); }
    finally { setInviting(false); }
  };

  return (
    <Modal title={`${institute.name} · Team`} description="Control what each person at this institute can do." onClose={onClose} wide>
      {loading && !data ? <Loading label="Loading team…" /> : error || !data ? <ErrorState message={error || "Could not load the team."} onRetry={reload} /> : (
        <div className="tp-team">
          {data.members.map(member => (
            <article key={member.id} className={member.status === "suspended" ? "off" : ""}>
              <header>
                <Avatar name={member.name} size={38} />
                <div><b>{member.name}</b><small>{member.email}{member.lastLoginAt ? ` · last in ${formatDate(member.lastLoginAt)}` : " · never signed in"}</small></div>
                <em className="tp-pill st-on-track">{member.role === "tpo" ? "Institute TPO" : "Principal · read-only"}</em>
                <button type="button" className={`tp-btn sm ${member.status === "active" ? "ghost danger" : "secondary"}`} disabled={busy === member.id} onClick={() => void patch(member, { status: member.status === "active" ? "suspended" : "active" }, member.status === "active" ? "Access turned off." : "Access restored.")}>{member.status === "active" ? "Turn off access" : "Restore access"}</button>
              </header>
              {member.permissions && (
                <ul className="tp-perms" aria-label={`Permissions for ${member.name}`}>
                  {PERMISSION_LABELS.map(({ key, label, help }) => (
                    <li key={key}>
                      <label className="tp-switch"><input type="checkbox" role="switch" checked={member.permissions![key]} disabled={busy === member.id || member.status !== "active"} onChange={event => void patch(member, { permissions: { [key]: event.target.checked } }, `${label} ${event.target.checked ? "allowed" : "turned off"}.`)} /><span aria-hidden="true" /><b>{label}<small>{help}</small></b></label>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
          {data.invites.length > 0 && <div className="tp-pending"><b>Waiting to join</b>{data.invites.map(item => <span key={item.id}>{item.email} · {item.role === "tpo" ? "TPO" : "Principal"} · expires {formatDate(item.expiresAt)}</span>)}</div>}

          <form className="tp-invite-form" onSubmit={sendInvite} noValidate>
            <h4>Add someone</h4>
            {inviteError && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{inviteError}</div>}
            {created ? <ActivationLink path={created.path} email={created.email} /> : (
              <div className="tp-invite-row">
                <input aria-label="Name" placeholder="Full name" value={invite.name} onChange={event => setInvite({ ...invite, name: event.target.value })} autoComplete="off" />
                <input aria-label="Email" type="email" placeholder="Work email" value={invite.email} onChange={event => setInvite({ ...invite, email: event.target.value })} autoComplete="off" />
                <select aria-label="Role" value={invite.role} onChange={event => setInvite({ ...invite, role: event.target.value as "tpo" | "principal" })}><option value="tpo">Institute TPO</option><option value="principal">Principal (read-only)</option></select>
                <button type="submit" className="tp-btn primary" disabled={inviting}>{inviting ? "Creating…" : "Invite"}</button>
              </div>
            )}
            {created && <button type="button" className="tp-btn ghost sm" onClick={() => setCreated(null)}>Invite another</button>}
          </form>
          <p className="tp-field-hint"><UsersRound size={14} aria-hidden="true" /> Permissions only limit institute TPOs. You always keep full access.</p>
        </div>
      )}
    </Modal>
  );
}
