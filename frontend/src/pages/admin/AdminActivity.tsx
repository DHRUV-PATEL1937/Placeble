import { AlertTriangle, ClipboardList, ShieldCheck, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { SecuritySettings } from "@/pages/tpo/SettingsPage";
import { Avatar, Card, EmptyState, ErrorState, Loading, PageHeader, Pager, errorMessage, tpoApi, useLoad, type Notify } from "@/pages/tpo/tpo-core";
import { actionLabel, dateTime, SecretBox, StatusChip } from "./admin-ui";

type Entry = { _id: string; action: string; targetType: string; targetId: string; metadata?: Record<string, string>; createdAt: string; platformAdminId?: { _id: string; name: string; email: string } };
type AuditPayload = { entries: Entry[]; admins: Array<{ _id: string; name: string }>; actions: string[]; pages: number };

export function ActivityPage({ accessToken }: { accessToken: string }) {
  const [filters, setFilters] = useState({ adminId: "", action: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useLoad(() => tpoApi<AuditPayload>(`/platform-admin/audit-log?${new URLSearchParams({ ...filters, page: String(page), limit: "25" })}`, accessToken), [accessToken, filters, page]);
  const set = (key: keyof typeof filters, value: string) => { setPage(1); setFilters(current => ({ ...current, [key]: value })); };
  const clear = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader title="Activity history" description="Every sensitive action taken by a super admin, with who did it and why." />
      <Card flush>
        <div className="tp-toolbar">
          <select className="tp-select" value={filters.adminId} onChange={event => set("adminId", event.target.value)} aria-label="Administrator"><option value="">All administrators</option>{(data?.admins ?? []).map(admin => <option key={admin._id} value={admin._id}>{admin.name}</option>)}</select>
          <select className="tp-select" value={filters.action} onChange={event => set("action", event.target.value)} aria-label="Action"><option value="">All actions</option>{(data?.actions ?? []).map(action => <option key={action} value={action}>{actionLabel(action)}</option>)}</select>
          <label className="ad-date"><span>From</span><input type="date" value={filters.from} onChange={event => set("from", event.target.value)} /></label>
          <label className="ad-date"><span>To</span><input type="date" value={filters.to} onChange={event => set("to", event.target.value)} /></label>
          {clear && <button type="button" className="tp-btn ghost sm" onClick={() => { setPage(1); setFilters({ adminId: "", action: "", from: "", to: "" }); }}>Clear</button>}
        </div>
        {loading && !data ? <Loading label="Loading history…" /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.entries.length ? <EmptyState icon={ClipboardList} title="No activity found" text={clear ? "Try different filters." : "Actions will be recorded here as the platform is run."} /> : (
          <>
            <div className="tp-table" role="table" aria-label="Activity history">
              <div className="tp-tr head cols-activity" role="row"><span role="columnheader">When</span><span role="columnheader">Who</span><span role="columnheader">Action</span><span role="columnheader">Details</span></div>
              {data.entries.map(entry => (
                <div className="tp-tr cols-activity" role="row" key={entry._id}>
                  <span role="cell" data-label="When">{dateTime(entry.createdAt)}</span>
                  <span className="tp-cell-person" role="cell"><Avatar name={entry.platformAdminId?.name ?? "?"} size={30} /><b>{entry.platformAdminId?.name ?? "Unknown"}<small>{entry.platformAdminId?.email}</small></b></span>
                  <span role="cell"><b>{actionLabel(entry.action)}</b></span>
                  <span role="cell" data-label="Details" className="ad-detail-cell">{[entry.metadata?.name, entry.metadata?.email, entry.metadata?.code].filter(Boolean).join(" · ")}{entry.metadata?.reason && <small className="tp-sub">Reason: {entry.metadata.reason}</small>}</span>
                </div>
              ))}
            </div>
            <Pager page={page} pages={data.pages} total={data.pages * 25} pageSize={25} onChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}

type Admin = { _id: string; name: string; email: string; status: string; lastLoginAt?: string; createdAt: string };

export function AdminSettingsPage({ accessToken, notify }: { accessToken: string; notify: Notify }) {
  const admins = useLoad(() => tpoApi<{ admins: Admin[] }>("/platform-admin/super-admins", accessToken).then(payload => payload.admins), [accessToken]);
  const [form, setForm] = useState({ name: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  const add = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (form.name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setError("Enter a name and a valid email."); return; }
    setBusy(true);
    try { const payload = await tpoApi<{ temporaryPassword: string }>("/platform-admin/super-admins", accessToken, { method: "POST", json: { name: form.name.trim(), email: form.email.trim() } }); setCreated({ email: form.email.trim(), password: payload.temporaryPassword }); setForm({ name: "", email: "" }); admins.reload(); notify("Super admin added."); }
    catch (cause) { setError(errorMessage(cause, "Could not add this super admin.")); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Settings" description="Your password, and who else can run the platform." />
      <div className="ad-settings">
        <SecuritySettings accessToken={accessToken} notify={notify} />
        <Card title="Super admins" description="People who can manage everything on Placeble. Be careful who you add." flush>
          {admins.loading && !admins.data ? <Loading /> : admins.error ? <ErrorState message={admins.error} onRetry={admins.reload} /> : (
            <ul className="tp-queue">{(admins.data ?? []).map(admin => <li key={admin._id}><Avatar name={admin.name} /><div className="tp-queue-main"><strong>{admin.name}</strong><small>{admin.email} · last in {admin.lastLoginAt ? dateTime(admin.lastLoginAt) : "never"}</small></div><StatusChip value={admin.status} /></li>)}</ul>
          )}
          <form className="tp-form ad-add-admin" onSubmit={add} noValidate>
            <h3><UserPlus size={16} aria-hidden="true" /> Add a super admin</h3>
            {error && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</div>}
            <div className="tp-field-row">
              <div className="tp-field"><label htmlFor="sa-name">Full name</label><input id="sa-name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} autoComplete="off" /></div>
              <div className="tp-field"><label htmlFor="sa-email">Email</label><input id="sa-email" type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} autoComplete="off" /></div>
            </div>
            <div><button type="submit" className="tp-btn primary" disabled={busy}><ShieldCheck size={16} aria-hidden="true" /> {busy ? "Adding…" : "Add super admin"}</button></div>
            {created && <SecretBox label={`Temporary password for ${created.email}`} value={created.password} note="Shown once. Share it securely; they should change it after signing in." />}
          </form>
        </Card>
      </div>
    </>
  );
}
