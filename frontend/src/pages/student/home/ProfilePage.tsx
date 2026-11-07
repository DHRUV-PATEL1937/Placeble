import { AlertTriangle, Check, GraduationCap, Lock, Mail, Save, ShieldCheck, Target, UserRound, Undo2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { SuggestChips } from "@/components/ui/suggest-chips";
import { Avatar, Card, ErrorState, Loading, PageHeader, errorMessage, tpoApi, useLoad, type Notify } from "@/pages/tpo/tpo-core";
import { findProgram, roleSuggestions, skillSuggestions } from "@/services/career-catalog";
import { cleanNameInput, nameProblem } from "@/services/validation";
import { ScoreRing } from "./st-core";

type Editable = { name: string; degree: string; graduationYear: number | null; skills: string[]; preferredRoles: string[] };
type ChangeRequest = { id: string; status: "pending" | "approved" | "rejected" | "used"; fields: string[]; reason: string; reviewNote: string; requestedAt: string; decidedAt: string | null };
type ProfileForm = Editable & { email: string; rollNumber: string; locked?: string[]; courseLocked?: boolean; changeRequest?: ChangeRequest | null };
type Program = { code: string; name: string; category: string; interviewStyle: string; roles: string[] };

const THIS_YEAR = new Date().getFullYear();
/** Graduating years on offer: 5 years back (graduates looking for placement) up to 5 years ahead. The server accepts the same range. */
const YEARS = Array.from({ length: 11 }, (_, index) => THIS_YEAR - 5 + index);
const same = (a: string[], b: string[]) => a.length === b.length && a.every((item, index) => item === b[index]);

export function ProfilePage({ accessToken, notify }: { accessToken: string; notify: Notify }) {
  const { data, loading, error, reload } = useLoad(() => tpoApi<{ profile: ProfileForm }>("/auth/profile", accessToken).then(payload => payload.profile), [accessToken]);
  const catalog = useLoad(() => tpoApi<{ programs: Program[] }>("/onboarding", accessToken).then(payload => payload.programs).catch(() => [] as Program[]), [accessToken]);
  const [draft, setDraft] = useState<Partial<Editable>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [asking, setAsking] = useState(false);
  const [askFields, setAskFields] = useState<string[]>(["degree", "graduationYear"]);
  const [askReason, setAskReason] = useState("");
  const [askError, setAskError] = useState("");
  const [askBusy, setAskBusy] = useState(false);

  const programs = useMemo(() => catalog.data ?? [], [catalog.data]);
  const profile = data ? ({ ...data, ...draft } as ProfileForm) : null;
  const program = useMemo(() => findProgram(programs, profile?.degree), [programs, profile?.degree]);

  if (loading && !data) return <><PageHeader title="Profile" /><Card><Loading label="Loading your profile…" /></Card></>;
  if (error || !data || !profile) return <><PageHeader title="Profile" /><Card><ErrorState message={error || "Could not load your profile."} onRetry={reload} /></Card></>;

  const locked = Boolean(profile.locked?.includes("degree"));
  // Direct students: course and graduating year lock once set. An approved request gives exactly one edit.
  const request = data.changeRequest ?? null;
  const approved = request?.status === "approved";
  const courseFrozen = Boolean(data.courseLocked) && !approved;
  const fieldOpen = (field: string) => !data.courseLocked || (approved && Boolean(request?.fields.includes(field)));
  const set = <K extends keyof Editable>(key: K, value: Editable[K]) => setDraft(current => ({ ...current, [key]: value }));
  const touch = (key: string) => setTouched(current => ({ ...current, [key]: true }));

  const problems = {
    name: locked ? "" : nameProblem(profile.name),
    degree: locked || !fieldOpen("degree") ? "" : profile.degree.trim().length < 2 ? "Choose your programme." : "",
    graduationYear: locked || !fieldOpen("graduationYear") ? "" : !profile.graduationYear || profile.graduationYear < THIS_YEAR - 5 || profile.graduationYear > THIS_YEAR + 5 ? "Choose your graduating year." : "",
    skills: profile.skills.length ? "" : "Add at least one skill.",
    preferredRoles: profile.preferredRoles.length ? "" : "Add at least one role you’d apply for.",
  };
  const valid = Object.values(problems).every(problem => !problem);
  const dirty = (Object.keys(draft) as Array<keyof Editable>).some(key => {
    const next = draft[key]; const base = data[key];
    return Array.isArray(next) && Array.isArray(base) ? !same(next, base) : next !== base;
  });
  const shown = (key: keyof typeof problems) => (touched[key] ? problems[key] : "");
  const filled = [profile.name, profile.degree, profile.graduationYear, profile.skills.length, profile.preferredRoles.length].filter(Boolean).length;
  const completion = Math.round((filled / 5) * 100);
  const degreeKnown = programs.some(item => item.name === profile.degree);

  const save = async (event: FormEvent) => {
    event.preventDefault(); setFormError("");
    setTouched({ name: true, degree: true, graduationYear: true, skills: true, preferredRoles: true });
    if (!valid) { setFormError("Fix the highlighted fields, then save again."); return; }
    setBusy(true);
    try {
      await tpoApi("/auth/profile", accessToken, { method: "PATCH", json: locked ? { skills: profile.skills, preferredRoles: profile.preferredRoles } : { name: profile.name.trim(), ...(courseFrozen ? {} : { degree: profile.degree.trim(), graduationYear: profile.graduationYear }), skills: profile.skills, preferredRoles: profile.preferredRoles } });
      setDraft({}); setTouched({}); reload(); notify("Profile saved.");
    } catch (cause) { setFormError(errorMessage(cause, "Could not save your profile.")); }
    finally { setBusy(false); }
  };

  const sendRequest = async () => {
    setAskError("");
    if (!askFields.length) { setAskError("Choose what you want to change."); return; }
    if (askReason.trim().length < 10) { setAskError("Please explain why in at least a sentence (10+ characters)."); return; }
    setAskBusy(true);
    try {
      await tpoApi("/auth/profile/change-request", accessToken, { method: "POST", json: { fields: askFields, reason: askReason.trim() } });
      setAsking(false); setAskReason(""); reload(); notify("Request sent. We’ll notify you when it’s reviewed.");
    } catch (cause) { setAskError(errorMessage(cause, "Could not send your request.")); }
    finally { setAskBusy(false); }
  };
  const label = (field: string) => (field === "degree" ? "Programme" : "Graduating year");

  return (
    <>
      <PageHeader title="Profile" description="Accurate details help your practice, recommendations and job matching." />
      <form className="st-pf" onSubmit={save} noValidate>
        <div className="st-pf-main">
          {formError && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{formError}</div>}

          <section className="st-pf-card">
            <header><span><UserRound size={17} aria-hidden="true" /></span><div><h2>About you</h2><p>{locked ? "These come from your institute and can’t be changed here." : "Your name appears on your resume and reports."}</p></div></header>
            <div className="st-pf-identity"><Avatar name={profile.name} size={60} /><div><b>{profile.name || "Your name"}</b><small>{profile.email}</small></div><span className="tp-pill st-ready"><ShieldCheck size={13} aria-hidden="true" /> Email verified</span></div>
            {locked ? (
              <dl className="st-pf-locked">
                <div><dt>Full name</dt><dd>{profile.name}</dd></div>
                <div><dt>Student ID</dt><dd>{profile.rollNumber || <em>Not added yet</em>}</dd></div>
                <div><dt>Branch</dt><dd>{profile.degree || <em>Not added yet</em>}</dd></div>
                <div><dt>Graduating year</dt><dd>{profile.graduationYear ?? <em>Not added yet</em>}</dd></div>
              </dl>
            ) : (
              <div className="tp-form">
                <div className={`tp-field${shown("name") ? " has-error" : ""}`}>
                  <label htmlFor="pf-name">Full name</label>
                  <input id="pf-name" value={profile.name} maxLength={80} autoComplete="name" onChange={event => set("name", cleanNameInput(event.target.value))} onBlur={() => touch("name")} aria-invalid={Boolean(shown("name"))} aria-describedby="pf-name-note" />
                  {shown("name") ? <p className="tp-field-error" id="pf-name-note" role="alert">{shown("name")}</p> : <p className="tp-field-hint" id="pf-name-note">Letters only. Spaces, dots, apostrophes and hyphens are fine.</p>}
                </div>
              </div>
            )}
            <div className="st-pf-email"><Mail size={16} aria-hidden="true" /><div><b>Sign-in email</b><span>{profile.email}</span></div><Lock size={14} aria-label="Locked" /></div>
            <p className="tp-field-hint"><Lock size={12} aria-hidden="true" /> Your email is your sign-in and can’t be changed. Contact support if it’s wrong.</p>
          </section>

          {!locked && (
            <section className="st-pf-card">
              <header><span><GraduationCap size={17} aria-hidden="true" /></span><div><h2>Your course</h2><p>{data.courseLocked ? "Your programme and graduating year are locked so your reports and matching stay accurate." : "Your programme tunes the practice, interview questions and suggestions you see. Choose carefully: once saved, changing them needs admin approval."}</p></div></header>
              {approved && <div className="tp-alert" role="status"><Check size={16} aria-hidden="true" />An admin approved your request. You can change {request!.fields.map(label).join(" and ").toLowerCase()} <b>once</b>. After you save, it locks again.</div>}
              {request?.status === "pending" && <div className="tp-alert" role="status"><Lock size={16} aria-hidden="true" />Your change request is waiting for admin review.</div>}
              {request?.status === "rejected" && <div className="tp-alert error" role="status"><AlertTriangle size={16} aria-hidden="true" />Your last request was declined{request.reviewNote ? ": " + request.reviewNote : "."}</div>}
              <div className="tp-field-row">
                <div className={`tp-field${shown("degree") ? " has-error" : ""}`}>
                  <label htmlFor="pf-degree">Programme {!fieldOpen("degree") && <Lock size={12} aria-label="Locked" />}</label>
                  <select id="pf-degree" value={profile.degree} disabled={!fieldOpen("degree")} onChange={event => set("degree", event.target.value)} onBlur={() => touch("degree")} aria-invalid={Boolean(shown("degree"))}>
                    <option value="">Select your programme…</option>
                    {profile.degree && !degreeKnown && <option value={profile.degree}>{profile.degree}</option>}
                    {[...new Set(programs.map(item => item.category))].map(group => <optgroup key={group} label={group}>{programs.filter(item => item.category === group).map(item => <option key={item.code} value={item.name}>{item.name}</option>)}</optgroup>)}
                  </select>
                  {shown("degree") && <p className="tp-field-error" role="alert">{shown("degree")}</p>}
                </div>
                <div className={`tp-field${shown("graduationYear") ? " has-error" : ""}`}>
                  <label htmlFor="pf-year">Graduating year {!fieldOpen("graduationYear") && <Lock size={12} aria-label="Locked" />}</label>
                  <select id="pf-year" value={profile.graduationYear ?? ""} disabled={!fieldOpen("graduationYear")} onChange={event => set("graduationYear", event.target.value ? Number(event.target.value) : null)} onBlur={() => touch("graduationYear")} aria-invalid={Boolean(shown("graduationYear"))}>
                    <option value="">Select…</option>
                    {YEARS.map(year => <option key={year} value={year}>{year}</option>)}
                  </select>
                  {shown("graduationYear") && <p className="tp-field-error" role="alert">{shown("graduationYear")}</p>}
                </div>
              </div>
              {courseFrozen && request?.status !== "pending" && !asking && <div><button type="button" className="tp-btn secondary" onClick={() => { setAsking(true); setAskError(""); }}>Request a change</button></div>}
              {courseFrozen && asking && (
                <div className="tp-form">
                  {askError && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{askError}</div>}
                  <fieldset className="tp-field">
                    <legend>What do you want to change?</legend>
                    {["degree", "graduationYear"].map(field => <label key={field}><input type="checkbox" checked={askFields.includes(field)} onChange={event => setAskFields(current => event.target.checked ? [...current, field] : current.filter(item => item !== field))} /> {label(field)}</label>)}
                  </fieldset>
                  <div className="tp-field"><label htmlFor="pf-reason">Reason <em>Required</em></label><textarea id="pf-reason" rows={3} maxLength={500} value={askReason} onChange={event => setAskReason(event.target.value)} placeholder="e.g. I picked the wrong programme during sign-up; I am in B.Tech Mechanical." /><p className="tp-field-hint">{askReason.trim().length}/500 · An admin reviews every request.</p></div>
                  <div className="tp-inline-actions">
                    <button type="button" className="tp-btn primary" disabled={askBusy} onClick={() => void sendRequest()}>{askBusy ? "Sending…" : "Send request"}</button>
                    <button type="button" className="tp-btn ghost" disabled={askBusy} onClick={() => setAsking(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </section>
          )}

          <section className="st-pf-card">
            <header><span><Target size={17} aria-hidden="true" /></span><div><h2>Goals and skills</h2><p>We use these to match you with roles and shape your practice.</p></div></header>
            <div className="tp-form">
              <div onBlur={() => touch("preferredRoles")}>
                <SuggestChips label="Roles you’d apply for" values={profile.preferredRoles} onChange={values => set("preferredRoles", values)} pool={roleSuggestions(program)} quick={(program?.roles ?? roleSuggestions(program)).slice(0, 8)} placeholder="Type a role, e.g. Data Analyst" max={20} maxLength={80} />
                {shown("preferredRoles") && <p className="tp-field-error" role="alert">{shown("preferredRoles")}</p>}
              </div>
              <div onBlur={() => touch("skills")}>
                <SuggestChips label="Skills" values={profile.skills} onChange={values => set("skills", values)} pool={skillSuggestions(program)} quick={skillSuggestions(program).slice(0, 8)} placeholder="Type a skill, e.g. Python" max={40} />
                {shown("skills") && <p className="tp-field-error" role="alert">{shown("skills")}</p>}
              </div>
            </div>
          </section>

          <div className="st-pf-actions" role="group" aria-label="Save">
            <span aria-live="polite">{dirty ? "You have unsaved changes." : "All changes saved."}</span>
            <button type="button" className="tp-btn ghost" disabled={!dirty || busy} onClick={() => { setDraft({}); setTouched({}); setFormError(""); }}><Undo2 size={15} aria-hidden="true" /> Discard</button>
            <button type="submit" className="tp-btn primary" disabled={busy || !dirty}><Save size={15} aria-hidden="true" /> {busy ? "Saving…" : "Save changes"}</button>
          </div>
        </div>

        <aside className="st-stack">
          <Card><div className="st-complete"><ScoreRing score={completion} size={96} label="Complete" /><div><h3>{completion === 100 ? "Ready for matching" : "Finish your profile"}</h3><p>{completion === 100 ? "Your profile has everything we use for matching." : "Fill in every section to improve your matches."}</p></div></div></Card>
          <Card title="Your privacy"><ul className="st-privacy"><li><Check size={15} aria-hidden="true" /> {locked ? "Visible inside your institution" : "Visible only to you"}</li><li><Check size={15} aria-hidden="true" /> {locked ? "Recruiters see you only for drives your college approves" : "Never shared with recruiters unless you apply"}</li><li><Check size={15} aria-hidden="true" /> Used to match you with roles</li></ul></Card>
        </aside>
      </form>
    </>
  );
}
