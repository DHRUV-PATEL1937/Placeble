import { AlertTriangle, Bell, CalendarClock, Mail, Megaphone, Send, Trash2, Undo2, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, EmptyState, ErrorState, Loading, Modal, PageHeader, errorMessage, formatDate, tpoApi, useLoad, type Notify } from "@/pages/tpo/tpo-core";

type Options = {
  kind: "admin" | "tpo"; variables: string[]; views: Array<{ value: string; label: string }>;
  institutions?: Array<{ id: string; name: string; universityId: string | null }>; universities?: Array<{ id: string; name: string }>; programs?: Array<{ code: string; name: string }>;
  branches?: Array<{ id: string; name: string }>; batches?: Array<{ id: string; branchId: string; label: string; period: string }>;
};
type Audience = { roles?: string[]; scope?: "all" | "institutions" | "direct"; institutionIds?: string[]; universityIds?: string[]; branchIds?: string[]; batchIds?: string[]; programCodes?: string[]; loginStatus?: "any" | "signed_in" | "not_signed_in"; plan?: "any" | "free" | "pro"; readinessMin?: number; readinessMax?: number; studentIds?: string[] };
type Preview = { count: number; sample: Array<{ name: string; email: string; role: string; branch: string; batch: string }>; rendered: { title: string; body: string; forName: string } | null };
type Sent = { id: string; title: string; body: string; priority: string; status: "scheduled" | "sending" | "sent" | "canceled" | "recalled" | "failed"; channels: { inApp: boolean; email: boolean }; recipientCount: number; emailsQueued: number; read: number; delivered: number; createdAt: string; scheduledAt: string | null; sentAt: string | null; expiresAt: string | null; error: string };

const TEMPLATES = [
  { name: "Drive reminder", title: "Placement drive on {{date}}", body: "Hi {{firstName}}, a placement drive is coming up. Please update your resume and be ready. Good luck!", priority: "important" as const },
  { name: "Finish your profile", title: "Finish setting up your profile", body: "Hi {{firstName}}, your profile is missing a few details. Completing it helps us tailor your practice and recommendations.", priority: "info" as const },
  { name: "Practice nudge", title: "Keep your streak going", body: "Hi {{firstName}}, you haven’t practised in a while. A short session in the Interview Room today keeps you sharp for placements.", priority: "info" as const },
  { name: "Urgent notice", title: "Important notice", body: "Hi {{firstName}}, please read this carefully and respond as soon as you can.", priority: "urgent" as const },
];
const ROLE_LABEL: Record<string, string> = { student: "Students", tpo: "Institute TPOs", principal: "Principals", university_admin: "University TPOs", recruiter: "Recruiters" };
const toIso = (value: string) => (value ? new Date(value).toISOString() : undefined);

function CheckList<T extends { id: string; name: string }>({ items, value, onChange, label, searchable = false }: { items: T[]; value: string[]; onChange: (next: string[]) => void; label: string; searchable?: boolean }) {
  const [filter, setFilter] = useState("");
  const shown = items.filter(item => item.name.toLowerCase().includes(filter.toLowerCase()));
  return (
    <fieldset className="an-check"><legend>{label}{value.length > 0 && <em>{value.length} selected</em>}</legend>
      {searchable && <input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filter…" aria-label={`Filter ${label}`} />}
      <div>{shown.map(item => <label key={item.id}><input type="checkbox" checked={value.includes(item.id)} onChange={event => onChange(event.target.checked ? [...value, item.id] : value.filter(id => id !== item.id))} /><span>{item.name}</span></label>)}{!shown.length && <small>Nothing to show.</small>}</div>
    </fieldset>
  );
}

export function AnnouncementsPage({ accessToken, notify }: { accessToken: string; notify: Notify }) {
  const options = useLoad(() => tpoApi<Options>("/broadcasts/options", accessToken), [accessToken]);
  const history = useLoad(() => tpoApi<{ broadcasts: Sent[] }>("/broadcasts", accessToken).then(payload => payload.broadcasts), [accessToken]);
  const [tab, setTab] = useState<"new" | "sent">("new");

  return (
    <>
      <PageHeader title="Announcements" description="Send a notification or email to many people at once, to exactly the audience you choose." />
      <div className="tp-tabs" role="tablist" aria-label="Announcements">
        <button type="button" role="tab" aria-selected={tab === "new"} onClick={() => setTab("new")}>New announcement</button>
        <button type="button" role="tab" aria-selected={tab === "sent"} onClick={() => { setTab("sent"); history.reload(); }}>Sent &amp; scheduled</button>
      </div>
      {options.loading && !options.data ? <Card><Loading label="Loading…" /></Card> : options.error || !options.data ? <Card><ErrorState message={options.error || "Could not load announcements."} onRetry={options.reload} /></Card> : tab === "new"
        ? <Composer options={options.data} accessToken={accessToken} notify={notify} onSent={() => { history.reload(); setTab("sent"); }} />
        : <History history={history} accessToken={accessToken} notify={notify} />}
    </>
  );
}

function Composer({ options, accessToken, notify, onSent }: { options: Options; accessToken: string; notify: Notify; onSent: () => void }) {
  const admin = options.kind === "admin";
  const [form, setForm] = useState({ title: "", body: "", priority: "info" as "info" | "important" | "urgent", ctaUrl: "", ctaLabel: "", inApp: true, email: false, when: "now" as "now" | "later", sendAt: "", expiresAt: "" });
  const [audience, setAudience] = useState<Audience>(admin ? { roles: ["student"], scope: "all", loginStatus: "any", plan: "any" } : { loginStatus: "any" });
  const [people, setPeople] = useState<Array<{ id: string; name: string }>>([]);
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<Array<{ id: string; name: string }>>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const set = (patch: Partial<typeof form>) => setForm(current => ({ ...current, ...patch }));
  const aud = (patch: Partial<Audience>) => setAudience(current => ({ ...current, ...patch }));

  const students = !admin || (audience.roles ?? []).includes("student");
  const payload = useMemo<Audience>(() => {
    const next: Audience = { ...audience };
    if (!admin) next.studentIds = people.length ? people.map(person => person.id) : undefined;
    for (const key of Object.keys(next) as Array<keyof Audience>) { const value = next[key]; if (value === undefined || (Array.isArray(value) && !value.length) || value === "any") delete next[key]; }
    if (admin && audience.scope !== "institutions") { delete next.institutionIds; delete next.universityIds; }
    return next;
  }, [audience, people, admin]);

  // Live recipient count and a personalised sample.
  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      setPreviewing(true);
      tpoApi<Preview>("/broadcasts/preview", accessToken, { method: "POST", json: { audience: payload, title: form.title, body: form.body } })
        .then(result => { if (live) { setPreview(result); setError(""); } })
        .catch(cause => { if (live) { setPreview(null); setError(errorMessage(cause, "Could not check this audience.")); } })
        .finally(() => { if (live) setPreviewing(false); });
    }, 450);
    return () => { live = false; window.clearTimeout(timer); };
  }, [payload, form.title, form.body, accessToken]);

  // Find individual students (TPO).
  useEffect(() => {
    if (admin || search.trim().length < 2) return;
    let live = true;
    const timer = window.setTimeout(() => { tpoApi<{ people: Array<{ id: string; name: string }> }>(`/chat/search?q=${encodeURIComponent(search.trim())}`, accessToken).then(result => { if (live) setFound(result.people.filter(person => !people.some(chosen => chosen.id === person.id))); }).catch(() => undefined); }, 300);
    return () => { live = false; window.clearTimeout(timer); };
  }, [search, admin, accessToken, people]);

  const insert = (variable: string) => {
    const box = bodyRef.current; const token = `{{${variable}}}`;
    if (!box) { set({ body: form.body + token }); return; }
    const { selectionStart, selectionEnd } = box;
    set({ body: form.body.slice(0, selectionStart) + token + form.body.slice(selectionEnd) });
    window.setTimeout(() => { box.focus(); box.setSelectionRange(selectionStart + token.length, selectionStart + token.length); }, 0);
  };

  const batchesShown = (options.batches ?? []).filter(batch => !(audience.branchIds?.length) || audience.branchIds.includes(batch.branchId));
  const count = preview?.count ?? 0;

  const validate = () => {
    if (form.title.trim().length < 3) return "Add a title.";
    if (form.body.trim().length < 3) return "Write your message.";
    if (!form.inApp && !form.email) return "Choose at least one way to send it.";
    if (form.when === "later" && !form.sendAt) return "Pick when to send it.";
    if (form.when === "later" && new Date(form.sendAt).getTime() < Date.now() + 60_000) return "Pick a time at least a minute from now.";
    if (form.ctaUrl && form.ctaLabel.trim().length < 2) return "Add a label for the button.";
    if (!count) return "No one matches this audience yet.";
    return "";
  };
  const submit = async () => {
    setBusy(true); setError("");
    try {
      await tpoApi("/broadcasts", accessToken, { method: "POST", json: { title: form.title.trim(), body: form.body.trim(), priority: form.priority, ctaUrl: form.ctaUrl, ctaLabel: form.ctaLabel.trim(), channels: { inApp: form.inApp, email: form.email }, audience: payload, ...(form.when === "later" ? { sendAt: toIso(form.sendAt) } : {}), ...(form.expiresAt ? { expiresAt: toIso(form.expiresAt) } : {}) } });
      notify(form.when === "later" ? "Announcement scheduled." : `Sending to ${count} ${count === 1 ? "person" : "people"}.`);
      setConfirm(false); onSent();
    } catch (cause) { setError(errorMessage(cause, "Could not send this announcement.")); setConfirm(false); }
    finally { setBusy(false); }
  };
  const tryToSend = () => { const problem = validate(); if (problem) { setError(problem); return; } setError(""); setConfirm(true); };

  return (
    <div className="an-grid">
      <div className="an-main">
        <Card title="Message" description="Use placeholders to personalise it for each person.">
          <div className="tp-form">
            <div className="an-templates" role="group" aria-label="Start from a template">{TEMPLATES.map(item => <button key={item.name} type="button" onClick={() => set({ title: item.title, body: item.body, priority: item.priority })}>{item.name}</button>)}</div>
            <div className="tp-field"><label htmlFor="an-title">Title <em>{form.title.length}/140</em></label><input id="an-title" value={form.title} maxLength={140} onChange={event => set({ title: event.target.value })} placeholder="What’s this about?" autoComplete="off" /></div>
            <div className="tp-field"><label htmlFor="an-body">Message <em>{form.body.length}/2000</em></label><textarea id="an-body" ref={bodyRef} rows={6} maxLength={2000} value={form.body} onChange={event => set({ body: event.target.value })} placeholder="Write your message…" />
              <div className="an-vars" role="group" aria-label="Insert a placeholder"><small>Insert:</small>{options.variables.map(variable => <button key={variable} type="button" onClick={() => insert(variable)}>{`{{${variable}}}`}</button>)}</div>
            </div>
            <div className="tp-field"><span className="an-lbl">Priority</span>
              <div className="an-seg" role="radiogroup" aria-label="Priority">{(["info", "important", "urgent"] as const).map(level => <button key={level} type="button" role="radio" aria-checked={form.priority === level} className={`${level}${form.priority === level ? " on" : ""}`} onClick={() => set({ priority: level })}>{level === "info" ? "Normal" : level === "important" ? "Important" : "Urgent"}</button>)}</div>
            </div>
            <div className="tp-field-row">
              <div className="tp-field"><label htmlFor="an-cta">Button links to <em>Optional</em></label>
                <select id="an-cta" value={options.views.some(view => view.value === form.ctaUrl) ? form.ctaUrl : form.ctaUrl ? "__link" : ""} onChange={event => set({ ctaUrl: event.target.value === "__link" ? "https://" : event.target.value })}>
                  <option value="">No button</option>{students && options.views.map(view => <option key={view.value} value={view.value}>{view.label} (in Placeble)</option>)}<option value="__link">A web link…</option>
                </select>
              </div>
              {form.ctaUrl && <div className="tp-field"><label htmlFor="an-label">Button label</label><input id="an-label" value={form.ctaLabel} maxLength={40} onChange={event => set({ ctaLabel: event.target.value })} placeholder="Open resume builder" /></div>}
            </div>
            {form.ctaUrl && !options.views.some(view => view.value === form.ctaUrl) && <div className="tp-field"><label htmlFor="an-link">Web link</label><input id="an-link" type="url" value={form.ctaUrl} onChange={event => set({ ctaUrl: event.target.value })} placeholder="https://…" /></div>}
          </div>
        </Card>

        <Card title="Audience" description={admin ? "Pick who it goes to. Every filter narrows the list." : "Everyone here is a student at your college. Every filter narrows the list."}>
          <div className="tp-form">
            {admin && (
              <>
                <fieldset className="an-check"><legend>Who</legend><div>{Object.entries(ROLE_LABEL).map(([role, label]) => <label key={role}><input type="checkbox" checked={(audience.roles ?? []).includes(role)} onChange={event => aud({ roles: event.target.checked ? [...(audience.roles ?? []), role] : (audience.roles ?? []).filter(item => item !== role) })} /><span>{label}</span></label>)}</div></fieldset>
                <div className="tp-field"><label htmlFor="an-scope">Where from</label><select id="an-scope" value={audience.scope} onChange={event => aud({ scope: event.target.value as Audience["scope"] })}><option value="all">Everywhere</option><option value="institutions">Specific colleges or universities</option><option value="direct">Direct (B2C) students only</option></select></div>
                {audience.scope === "institutions" && <div className="tp-field-row"><CheckList label="Universities" items={options.universities ?? []} value={audience.universityIds ?? []} onChange={universityIds => aud({ universityIds })} /><CheckList label="Colleges" items={options.institutions ?? []} value={audience.institutionIds ?? []} onChange={institutionIds => aud({ institutionIds })} searchable /></div>}
                {students && audience.scope === "direct" && <div className="tp-field"><label htmlFor="an-plan">Plan</label><select id="an-plan" value={audience.plan} onChange={event => aud({ plan: event.target.value as Audience["plan"] })}><option value="any">Free and Pro</option><option value="free">Free only</option><option value="pro">Pro only</option></select></div>}
                {students && <CheckList label="Programmes" items={(options.programs ?? []).map(program => ({ id: program.code, name: program.name }))} value={audience.programCodes ?? []} onChange={programCodes => aud({ programCodes })} />}
              </>
            )}
            {!admin && (
              <>
                <div className="tp-field-row">
                  <CheckList label="Branches" items={options.branches ?? []} value={audience.branchIds ?? []} onChange={branchIds => aud({ branchIds, batchIds: (audience.batchIds ?? []).filter(id => (options.batches ?? []).some(batch => batch.id === id && (!branchIds.length || branchIds.includes(batch.branchId)))) })} />
                  <CheckList label="Batches" items={batchesShown.map(batch => ({ id: batch.id, name: batch.label }))} value={audience.batchIds ?? []} onChange={batchIds => aud({ batchIds })} />
                </div>
                <div className="tp-field"><label htmlFor="an-find">Specific students <em>Optional</em></label>
                  <div className="an-people">{people.map(person => <span key={person.id}>{person.name}<button type="button" aria-label={`Remove ${person.name}`} onClick={() => setPeople(people.filter(item => item.id !== person.id))}><X size={12} /></button></span>)}<input id="an-find" value={search} onChange={event => setSearch(event.target.value)} placeholder={people.length ? "Add another…" : "Search by name, email or roll no."} autoComplete="off" /></div>
                  {found.length > 0 && search.trim().length >= 2 && <ul className="an-found">{found.slice(0, 6).map(person => <li key={person.id}><button type="button" onClick={() => { setPeople([...people, person]); setSearch(""); setFound([]); }}>{person.name}</button></li>)}</ul>}
                </div>
              </>
            )}
            {students && (
              <div className="tp-field-row">
                <div className="tp-field"><label htmlFor="an-login">Sign-in status</label><select id="an-login" value={audience.loginStatus} onChange={event => aud({ loginStatus: event.target.value as Audience["loginStatus"] })}><option value="any">Everyone</option><option value="signed_in">Has signed in</option><option value="not_signed_in">Hasn’t signed in yet</option></select></div>
                <div className="tp-field"><span className="an-lbl">Readiness score <em>0–100</em></span><div className="an-range"><input type="number" min={0} max={100} placeholder="From" aria-label="Readiness from" value={audience.readinessMin ?? ""} onChange={event => aud({ readinessMin: event.target.value === "" ? undefined : Number(event.target.value) })} /><span>to</span><input type="number" min={0} max={100} placeholder="To" aria-label="Readiness to" value={audience.readinessMax ?? ""} onChange={event => aud({ readinessMax: event.target.value === "" ? undefined : Number(event.target.value) })} /></div></div>
              </div>
            )}
          </div>
        </Card>

        <Card title="Delivery">
          <div className="tp-form">
            <div className="an-channels">
              <label className="tp-check"><input type="checkbox" checked={form.inApp} onChange={event => set({ inApp: event.target.checked })} /><span><Bell size={15} aria-hidden="true" /> In-app notification</span></label>
              <label className="tp-check"><input type="checkbox" checked={form.email} onChange={event => set({ email: event.target.checked })} /><span><Mail size={15} aria-hidden="true" /> Email</span></label>
            </div>
            <div className="tp-field-row">
              <div className="tp-field"><label htmlFor="an-when">When</label><select id="an-when" value={form.when} onChange={event => set({ when: event.target.value as "now" | "later" })}><option value="now">Send now</option><option value="later">Schedule for later</option></select></div>
              {form.when === "later" && <div className="tp-field"><label htmlFor="an-at">Send at</label><input id="an-at" type="datetime-local" value={form.sendAt} onChange={event => set({ sendAt: event.target.value })} /></div>}
            </div>
            <div className="tp-field"><label htmlFor="an-exp">Remove from notifications on <em>Optional</em></label><input id="an-exp" type="datetime-local" value={form.expiresAt} onChange={event => set({ expiresAt: event.target.value })} /><p className="tp-field-hint">After this the notification disappears, good for deadlines.</p></div>
          </div>
        </Card>
      </div>

      <aside className="an-side">
        <Card title="Preview">
          <div className="an-count" aria-live="polite"><Users size={18} aria-hidden="true" /><div><strong>{previewing && !preview ? "…" : count.toLocaleString("en-IN")}</strong><small>{count === 1 ? "person will receive this" : "people will receive this"}</small></div></div>
          {preview?.sample.length ? <ul className="an-sample">{preview.sample.map(person => <li key={person.email}><b>{person.name}</b><small>{[person.branch, person.batch].filter(Boolean).join(" · ") || person.email}</small></li>)}{count > preview.sample.length && <li><small>…and {(count - preview.sample.length).toLocaleString("en-IN")} more</small></li>}</ul> : null}
          <div className={`an-note ${form.priority}`}>
            <small>{preview?.rendered ? `As ${preview.rendered.forName} sees it` : "How it looks"}</small>
            <strong>{(preview?.rendered?.title || form.title) || "Your title"}</strong>
            <p>{(preview?.rendered?.body || form.body) || "Your message will appear here."}</p>
            {form.ctaUrl && form.ctaLabel && <span className="an-fake-btn">{form.ctaLabel}</span>}
          </div>
          {error && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</div>}
          <button type="button" className="tp-btn primary an-send" disabled={busy} onClick={tryToSend}>{form.when === "later" ? <><CalendarClock size={16} aria-hidden="true" /> Schedule announcement</> : <><Send size={16} aria-hidden="true" /> Send announcement</>}</button>
        </Card>
      </aside>

      {confirm && (
        <Modal title={form.when === "later" ? "Schedule this announcement?" : "Send this announcement?"} description={`It will go to ${count.toLocaleString("en-IN")} ${count === 1 ? "person" : "people"} ${form.when === "later" ? `at ${new Date(form.sendAt).toLocaleString("en-IN")}` : "right away"}${form.email ? ", by email too" : ""}. You can pull a sent announcement back, but emails can’t be recalled.`} onClose={() => setConfirm(false)}>
          <footer className="tp-modal-foot"><button type="button" className="tp-btn ghost" onClick={() => setConfirm(false)}>Go back</button><button type="button" className="tp-btn primary" disabled={busy} onClick={() => void submit()}>{busy ? "Sending…" : form.when === "later" ? "Schedule" : "Send now"}</button></footer>
        </Modal>
      )}
    </div>
  );
}

function History({ history, accessToken, notify }: { history: ReturnType<typeof useLoad<Sent[]>>; accessToken: string; notify: Notify }) {
  const [busy, setBusy] = useState("");
  const act = async (item: Sent) => {
    setBusy(item.id);
    try { const result = await tpoApi<{ status: string; note?: string }>(`/broadcasts/${item.id}`, accessToken, { method: "DELETE" }); notify(result.note ?? (result.status === "canceled" ? "Scheduled announcement canceled." : "Announcement recalled.")); history.reload(); }
    catch (cause) { notify(errorMessage(cause), "error"); }
    finally { setBusy(""); }
  };
  return (
    <Card flush>
      {history.loading && !history.data ? <Loading /> : history.error ? <ErrorState message={history.error} onRetry={history.reload} /> : !history.data?.length ? <EmptyState icon={Megaphone} title="Nothing sent yet" text="Announcements you send or schedule will show up here, with how many people opened them." /> : (
        <ul className="tp-queue">{history.data.map(item => {
          const pct = item.delivered ? Math.round((item.read / item.delivered) * 100) : 0;
          return (
            <li key={item.id}>
              <span className="tp-icon-tile"><Megaphone size={20} aria-hidden="true" /></span>
              <div className="tp-queue-main"><strong>{item.title}</strong><small>{item.recipientCount.toLocaleString("en-IN")} recipients · {item.channels.inApp ? "In-app" : ""}{item.channels.inApp && item.channels.email ? " + " : ""}{item.channels.email ? "Email" : ""} · {item.status === "scheduled" && item.scheduledAt ? `scheduled for ${new Date(item.scheduledAt).toLocaleString("en-IN")}` : item.sentAt ? `sent ${formatDate(item.sentAt)}` : formatDate(item.createdAt)}</small>
                {item.status === "sent" && item.channels.inApp && <small>{item.read} of {item.delivered} opened ({pct}%)</small>}{item.error && <small className="tp-note">{item.error}</small>}</div>
              <span className={`tp-pill ${item.status === "sent" ? "st-ready" : item.status === "scheduled" || item.status === "sending" ? "st-stalled" : item.status === "failed" ? "st-at-risk" : "st-neutral"}`}>{item.status === "sent" ? "Sent" : item.status === "scheduled" ? "Scheduled" : item.status === "sending" ? "Sending…" : item.status === "failed" ? "Failed" : item.status === "recalled" ? "Recalled" : "Canceled"}</span>
              <div className="tp-queue-actions">
                {item.status === "scheduled" && <button type="button" className="tp-btn ghost sm danger" disabled={busy === item.id} onClick={() => void act(item)}><Trash2 size={14} aria-hidden="true" /> Cancel</button>}
                {item.status === "sent" && <button type="button" className="tp-btn ghost sm" disabled={busy === item.id} onClick={() => void act(item)}><Undo2 size={14} aria-hidden="true" /> Recall</button>}
              </div>
            </li>
          );
        })}</ul>
      )}
    </Card>
  );
}
