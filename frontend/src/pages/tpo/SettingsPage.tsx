import { DomainInput } from "@/components/ui/domain-input";
import { LogoUploader } from "@/components/ui/org-brand";
import { AlertTriangle, Building2, Check, Copy, KeyRound, Mail, ShieldCheck, Store, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { PASSWORD_RULES, passwordMeetsRules } from "@/pages/auth/auth-ui";
import { Card, ErrorState, Loading, PageHeader, errorMessage, tpoApi, useLoad, type Notify } from "./tpo-core";

export type Section = "college" | "team" | "marketplace" | "security";
const SECTIONS: Array<{ id: Section; label: string; icon: typeof Building2 }> = [
  { id: "college", label: "College", icon: Building2 },
  { id: "team", label: "Team access", icon: UserPlus },
  { id: "marketplace", label: "Marketplace", icon: Store },
  { id: "security", label: "Security", icon: KeyRound },
];

export function SettingsPage({ accessToken, notify, sections }: { accessToken: string; notify: Notify; sections?: Section[] }) {
  const available = SECTIONS.filter(item => !sections || sections.includes(item.id));
  const [section, setSection] = useState<Section>(available[0]?.id ?? "college");
  return (
    <>
      <PageHeader title="Settings" description="Manage your college, your team, and your account." />
      <div className="tp-settings">
        <nav className="tp-settings-nav" aria-label="Settings sections">
          {available.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}><Icon size={17} aria-hidden="true" />{label}</button>)}
        </nav>
        <div className="tp-settings-body">
          {section === "college" && <CollegeSettings accessToken={accessToken} notify={notify} />}
          {section === "team" && <TeamSettings accessToken={accessToken} notify={notify} />}
          {section === "marketplace" && <MarketplaceSettings accessToken={accessToken} notify={notify} />}
          {section === "security" && <SecuritySettings accessToken={accessToken} notify={notify} />}
        </div>
      </div>
    </>
  );
}

function CollegeSettings({ accessToken, notify }: { accessToken: string; notify: Notify }) {
  const { data, loading, error, reload } = useLoad(() => tpoApi<{ institution: { name: string; approvedEmailDomains: string[]; logoUrl?: string } }>("/tenancy/settings", accessToken), [accessToken]);
  const [domains, setDomains] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const parsed = domains ?? data?.institution.approvedEmailDomains ?? [];

  const save = async (event: FormEvent) => {
    event.preventDefault(); setFormError(""); setBusy(true);
    try { await tpoApi("/tenancy/settings/domains", accessToken, { method: "PATCH", json: { approvedEmailDomains: parsed } }); setDomains(null); reload(); notify("Student email domains saved."); }
    catch (cause) { setFormError(errorMessage(cause, "Could not save these domains.")); }
    finally { setBusy(false); }
  };

  if (loading) return <Card><Loading label="Loading college settings…" /></Card>;
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  return (
    <>
    <Card title="College logo" description="Shown in the sidebar for you, your students and your principal.">
      <LogoUploader name={data?.institution.name ?? "Your college"} logoUrl={data?.institution.logoUrl} accessToken={accessToken} path="/tenancy/settings/logo" notify={notify} onChanged={() => reload()} label="College logo" />
    </Card>
    <Card title="Student email domains" description={`Only emails on these domains can join ${data?.institution.name ?? "your college"}.`}>
      <form className="tp-form" onSubmit={save}>
        {formError && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{formError}</div>}
        <div className="tp-field"><label htmlFor="st-domains">Allowed domains</label><DomainInput id="st-domains" values={parsed} onChange={setDomains} placeholder="college.edu" /></div>
        <div><button type="submit" className="tp-btn primary" disabled={busy || !parsed.length}>{busy ? "Saving…" : "Save domains"}</button></div>
      </form>
    </Card>
    </>
  );
}

type Invite = { email: string; role: string; link: string };

function TeamSettings({ accessToken, notify }: { accessToken: string; notify: Notify }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"principal" | "tpo">("principal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invites, setInvites] = useState<Invite[]>([]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Enter a valid email address."); return; }
    setBusy(true);
    try {
      const payload = await tpoApi<{ activationPath: string }>("/auth/invites", accessToken, { method: "POST", json: { email: email.trim(), role, driveIds: [] } });
      setInvites(current => [{ email: email.trim(), role: role === "tpo" ? "TPO administrator" : "Principal", link: new URL(payload.activationPath, window.location.origin).toString() }, ...current]);
      setEmail(""); notify("Invitation created.");
    } catch (cause) { setError(errorMessage(cause, "Could not create this invitation.")); }
    finally { setBusy(false); }
  };
  const copy = async (invite: Invite) => { try { await navigator.clipboard.writeText(invite.link); notify(`Link for ${invite.email} copied.`); } catch { notify("Could not copy the link.", "error"); } };

  return (
    <Card title="Invite a colleague" description="Principals get read-only reports for the whole college. TPO administrators can manage everything on this page.">
      <form className="tp-form" onSubmit={submit} noValidate>
        {error && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</div>}
        <div className="tp-field-row">
          <div className="tp-field"><label htmlFor="inv-email">Work email</label><input id="inv-email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@college.edu" autoComplete="off" /></div>
          <div className="tp-field"><label htmlFor="inv-role">Role</label><select id="inv-role" value={role} onChange={event => setRole(event.target.value as typeof role)}><option value="principal">Principal (read-only reports)</option><option value="tpo">TPO administrator</option></select></div>
        </div>
        <div><button type="submit" className="tp-btn primary" disabled={busy}><Mail size={16} aria-hidden="true" /> {busy ? "Creating…" : "Create invitation"}</button></div>
      </form>
      {invites.length > 0 && (
        <ul className="tp-invites" aria-label="Invitations created this session">
          {invites.map(invite => <li key={invite.link}><span><b>{invite.email}</b><small>{invite.role} · activation link</small></span><button type="button" className="tp-btn secondary sm" onClick={() => void copy(invite)}><Copy size={14} aria-hidden="true" /> Copy link</button></li>)}
        </ul>
      )}
    </Card>
  );
}

function MarketplaceSettings({ accessToken, notify }: { accessToken: string; notify: Notify }) {
  type Listing = { isListed?: boolean; headline?: string; studentCountBand?: string; topBranches?: string[] };
  const { data, loading, error, reload } = useLoad(() => tpoApi<{ institution: { marketplaceListing?: Listing } }>("/tenancy/marketplace/settings", accessToken), [accessToken]);
  const [draft, setDraft] = useState<{ listed: boolean; headline: string; band: string; branches: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const listing = data?.institution.marketplaceListing ?? {};
  const current = draft ?? (data ? { listed: Boolean(listing.isListed), headline: listing.headline ?? "", band: listing.studentCountBand ?? "", branches: (listing.topBranches ?? []).join(", ") } : null);

  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!current) return; setBusy(true);
    try { await tpoApi("/tenancy/marketplace/settings", accessToken, { method: "PATCH", json: { isListed: current.listed, headline: current.headline, studentCountBand: current.band, topBranches: current.branches.split(",").map(item => item.trim()).filter(Boolean) } }); notify(current.listed ? "Your college is now visible to verified recruiters." : "Marketplace listing is hidden. Existing access stays active."); setDraft(null); reload(); }
    catch (cause) { notify(errorMessage(cause), "error"); }
    finally { setBusy(false); }
  };

  if (loading && !current) return <Card><Loading label="Loading marketplace settings…" /></Card>;
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  if (!current) return null;
  const draftValue = current;
  const set = (patch: Partial<typeof draftValue>) => setDraft({ ...draftValue, ...patch });
  return (
    <Card title="Marketplace visibility" description="Let verified recruiters discover your college. Off by default; existing relationships are never affected.">
      <form className="tp-form" onSubmit={save}>
        <label className="tp-switch"><input type="checkbox" role="switch" checked={draftValue.listed} onChange={event => set({ listed: event.target.checked })} /><span aria-hidden="true" /><b>{draftValue.listed ? "Visible to recruiters" : "Hidden"}</b></label>
        <fieldset disabled={!draftValue.listed} className="tp-fieldset">
          <div className="tp-field"><label htmlFor="mk-head">Headline <em>Optional</em></label><textarea id="mk-head" maxLength={240} rows={3} value={draftValue.headline} onChange={event => set({ headline: event.target.value })} placeholder="Describe your students and placement strengths." /><p className="tp-field-hint">{draftValue.headline.length}/240</p></div>
          <div className="tp-field-row">
            <div className="tp-field"><label htmlFor="mk-band">Student count</label><select id="mk-band" value={draftValue.band} onChange={event => set({ band: event.target.value })}><option value="">Not specified</option>{["Under 250", "250-500", "500-1000", "1000-2500", "2500+"].map(item => <option key={item}>{item}</option>)}</select></div>
            <div className="tp-field"><label htmlFor="mk-br">Top branches</label><input id="mk-br" value={draftValue.branches} onChange={event => set({ branches: event.target.value })} placeholder="CSE, ECE, Mechanical" /></div>
          </div>
        </fieldset>
        <p className="tp-field-hint"><ShieldCheck size={14} aria-hidden="true" /> Only this coarse listing is public. Names, exact counts, scores and contacts stay private.</p>
        <div><button type="submit" className="tp-btn primary" disabled={busy}>{busy ? "Saving…" : "Save marketplace settings"}</button></div>
      </form>
    </Card>
  );
}

export function SecuritySettings({ accessToken, notify }: { accessToken: string; notify: Notify }) {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!passwordMeetsRules(form.newPassword)) { setError("Your new password doesn’t meet all the requirements."); return; }
    if (form.newPassword !== form.confirmPassword) { setError("Your new passwords do not match."); return; }
    setBusy(true);
    try { await tpoApi("/auth/change-password", accessToken, { method: "POST", json: { currentPassword: form.currentPassword, newPassword: form.newPassword } }); setForm({ currentPassword: "", newPassword: "", confirmPassword: "" }); notify("Password changed. Other devices were signed out."); }
    catch (cause) { setError(errorMessage(cause, "Could not change your password.")); }
    finally { setBusy(false); }
  };

  return (
    <Card title="Change password" description="Updating your password signs you out on other devices.">
      <form className="tp-form" onSubmit={submit} noValidate>
        {error && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</div>}
        <div className="tp-field"><label htmlFor="pw-cur">Current password</label><input id="pw-cur" type="password" autoComplete="current-password" value={form.currentPassword} onChange={event => set("currentPassword", event.target.value)} /></div>
        <div className="tp-field"><label htmlFor="pw-new">New password</label><input id="pw-new" type="password" autoComplete="new-password" value={form.newPassword} onChange={event => set("newPassword", event.target.value)} /></div>
        <ul className="tp-rules">{PASSWORD_RULES.map(rule => <li key={rule.label} className={rule.test(form.newPassword) ? "ok" : ""}><span aria-hidden="true">{rule.test(form.newPassword) && <Check size={11} strokeWidth={3} />}</span>{rule.label}</li>)}</ul>
        <div className="tp-field"><label htmlFor="pw-conf">Confirm new password</label><input id="pw-conf" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={event => set("confirmPassword", event.target.value)} /></div>
        <div><button type="submit" className="tp-btn primary" disabled={busy || !form.currentPassword}>{busy ? "Updating…" : "Update password"}</button></div>
      </form>
    </Card>
  );
}
