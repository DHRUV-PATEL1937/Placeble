import { AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, Check, Lock, MailCheck, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Brand, ThemeToggle, apiRequest, type AuthUser } from "./auth-shared";
import { SuggestChips } from "@/components/ui/suggest-chips";
import { roleSuggestions, skillSuggestions } from "@/services/career-catalog";
import { cleanNameInput, EMAIL_RE, nameProblem } from "@/services/validation";
import "./onboarding.css";

type Program = { code: string; name: string; category: string; durationYears: number; interviewStyle: string; roles: string[] };
type Setup = {
  state: "needed" | "guardian_pending" | "guardian_declined" | "done"; isDirect: boolean; name: string;
  needs: { dateOfBirth: boolean; program: boolean; batch: boolean; goals: boolean };
  locked: { program: { code: string | null; name: string } | null; batch: { label: string; period: string } | null };
  programs: Program[];
  profile: { dateOfBirth: string; programCode: string; admissionYear: number | null; graduationYear: number | null; roles: string[]; skills: string[] };
  guardian: { status: string; name: string; email: string };
  limits: { minAge: number; adultAge: number; minYear: number; maxYear: number };
};

const ageFrom = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const dob = new Date(`${value}T00:00:00`); const now = new Date();
  if (Number.isNaN(dob.getTime()) || dob > now) return null;
  let age = now.getFullYear() - dob.getFullYear();
  if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) age -= 1;
  return age;
};

export function OnboardingScreen({ user, accessToken, onComplete, onLogout }: { user: AuthUser; accessToken: string; onComplete: (user: AuthUser) => void; onLogout: () => void }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [loadError, setLoadError] = useState("");
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ dateOfBirth: "", programCode: "", admissionYear: "", graduationYear: "", roles: [] as string[], skills: [] as string[], guardianName: "", guardianEmail: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [note, setNote] = useState("");
  const [changingGuardian, setChangingGuardian] = useState(false);
  const loaded = useRef(false);

  const userEmail = user.email.toLowerCase();
  const headers = { Authorization: `Bearer ${accessToken}` };
  const load = async () => {
    try {
      const { payload } = await apiRequest("/onboarding", { headers });
      setSetup(payload);
      if (!loaded.current) { loaded.current = true; setForm(current => ({ ...current, dateOfBirth: payload.profile.dateOfBirth, programCode: payload.profile.programCode, admissionYear: payload.profile.admissionYear ? String(payload.profile.admissionYear) : "", graduationYear: payload.profile.graduationYear ? String(payload.profile.graduationYear) : "", roles: payload.profile.roles, skills: payload.profile.skills, guardianName: payload.guardian.name, guardianEmail: payload.guardian.email })); }
      return payload as Setup;
    } catch (cause) { setLoadError(cause instanceof Error ? cause.message : "Could not load your setup."); return null; }
  };
  useEffect(() => { let live = true; void apiRequest("/onboarding", { headers }).then(({ payload }) => { if (!live) return; setSetup(payload); if (loaded.current) return; loaded.current = true; setForm({ dateOfBirth: payload.profile.dateOfBirth, programCode: payload.profile.programCode, admissionYear: payload.profile.admissionYear ? String(payload.profile.admissionYear) : "", graduationYear: payload.profile.graduationYear ? String(payload.profile.graduationYear) : "", roles: payload.profile.roles, skills: payload.profile.skills, guardianName: payload.guardian.name, guardianEmail: payload.guardian.email }); }).catch(cause => { if (live) setLoadError(cause instanceof Error ? cause.message : "Could not load your setup."); }); return () => { live = false; }; }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (cooldown <= 0) return; const timer = window.setTimeout(() => setCooldown(value => value - 1), 1000); return () => window.clearTimeout(timer); }, [cooldown]);

  const checkAgain = async () => {
    setNote("");
    try {
      const { payload } = await apiRequest("/auth/me", { headers });
      if (payload.user?.onboardingCompleted) onComplete(payload.user); else { await load(); setNote("Still waiting for your guardian to respond."); }
    } catch { setNote("Couldn’t check just now. Try again in a moment."); }
  };
  const resend = async () => {
    setNote("");
    try { await apiRequest("/onboarding/guardian/resend", { method: "POST", headers, body: "{}" }); setNote("We’ve sent your guardian a fresh link."); setCooldown(60); }
    catch (cause) { setNote(cause instanceof Error ? cause.message : "Could not resend."); }
  };

  const program = setup ? setup.programs.find(item => item.code === (setup.locked.program?.code ?? form.programCode)) : undefined;
  const age = ageFrom(form.dateOfBirth);
  const needsGuardian = changingGuardian || Boolean(setup?.needs.dateOfBirth && age !== null && age < (setup?.limits.adultAge ?? 18));

  const steps = setup ? (changingGuardian ? ["guardian"] : [
    ...(setup.needs.dateOfBirth ? ["about"] : []),
    ...(setup.needs.program || setup.needs.batch ? ["course"] : []),
    "goals",
  ]) : [];
  const current = steps[Math.min(step, steps.length - 1)];

  const validate = (which: string) => {
    if (!setup) return "";
    if (which === "about") {
      if (age === null) return "Enter your date of birth.";
      if (age < setup.limits.minAge) return `You need to be at least ${setup.limits.minAge} to use Placeble.`;
      if (age > 100) return "Enter a valid date of birth.";
      if (age < setup.limits.adultAge) {
        const nameIssue = nameProblem(form.guardianName, "parent or guardian’s name"); if (nameIssue) return nameIssue;
        if (!EMAIL_RE.test(form.guardianEmail.trim())) return "Enter your parent or guardian’s email.";
        if (form.guardianEmail.trim().toLowerCase() === userEmail) return "Use your parent or guardian’s email, not your own.";
      }
    }
    if (which === "guardian") {
      const nameIssue = nameProblem(form.guardianName, "parent or guardian’s name"); if (nameIssue) return nameIssue;
      if (!EMAIL_RE.test(form.guardianEmail.trim())) return "Enter your parent or guardian’s email.";
      if (form.guardianEmail.trim().toLowerCase() === userEmail) return "Use your parent or guardian’s email, not your own.";
    }
    if (which === "course") {
      if (setup.needs.program && !form.programCode) return "Choose your programme.";
      if (setup.needs.batch) {
        if (!form.admissionYear || !form.graduationYear) return "Choose your admission year and graduating year.";
        if (Number(form.graduationYear) < Number(form.admissionYear)) return "Your graduating year should be after your admission year.";
      }
    }
    if (which === "goals") {
      if (!form.roles.length) return "Add at least one role you’re aiming for.";
      if (!form.skills.length) return "Add at least one skill.";
    }
    return "";
  };

  const next = () => { const problem = validate(current); if (problem) { setError(problem); return; } setError(""); setStep(value => value + 1); };
  const submit = async () => {
    const problem = changingGuardian ? validate("guardian") : [...(setup!.needs.dateOfBirth ? ["about"] : []), ...(setup!.needs.program || setup!.needs.batch ? ["course"] : []), "goals"].map(validate).find(Boolean) ?? ""; if (problem) { setError(problem); return; }
    setBusy(true); setError("");
    try {
      const { payload } = await apiRequest("/onboarding", { method: "POST", headers, body: JSON.stringify({
        ...(setup!.needs.dateOfBirth ? { dateOfBirth: form.dateOfBirth } : {}),
        ...(setup!.needs.program ? { programCode: form.programCode } : {}),
        ...(setup!.needs.batch ? { admissionYear: Number(form.admissionYear), graduationYear: Number(form.graduationYear) } : {}),
        roles: form.roles, skills: form.skills,
        ...(needsGuardian ? { guardianName: form.guardianName.trim(), guardianEmail: form.guardianEmail.trim() } : {}),
      }) });
      if (payload.user.onboardingCompleted) onComplete(payload.user);
      else { await load(); setChangingGuardian(false); setCooldown(60); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save your setup."); }
    finally { setBusy(false); }
  };

  const header = <header className="ob-top"><Brand /><div><ThemeToggle className="ax-theme" /><button type="button" className="ob-link" onClick={onLogout}>Sign out</button></div></header>;

  if (loadError) return <main className="ob-page">{header}<section className="ob-card"><div className="ob-alert" role="alert"><AlertTriangle size={16} aria-hidden="true" />{loadError}</div></section></main>;
  if (!setup) return <main className="ob-page">{header}<section className="ob-card"><p className="ob-hint" role="status">Getting things ready…</p></section></main>;

  if ((setup.state === "guardian_pending" || setup.state === "guardian_declined") && !changingGuardian) {
    const declined = setup.state === "guardian_declined";
    return (
      <main className="ob-page">{header}
        <section className="ob-card narrow" role="status">
          <span className={`ob-badge${declined ? " warn" : ""}`} aria-hidden="true">{declined ? <AlertTriangle size={26} /> : <MailCheck size={26} />}</span>
          <h1>{declined ? "Your guardian said no" : "Waiting for your guardian"}</h1>
          <p>{declined ? `${setup.guardian.name || "Your parent or guardian"} chose not to give permission, so we can’t open your account yet. You can ask someone else, or ask them again.` : <>Because you’re under 18, we need a parent or guardian’s permission. We emailed <strong>{setup.guardian.email}</strong>. As soon as they agree, you’re in.</>}</p>
          {note && <p className="ob-note">{note}</p>}
          <div className="ob-actions">
            {!declined && <button type="button" className="ob-primary" onClick={() => void checkAgain()}>I’ve asked them · check again</button>}
            <button type="button" className="ob-secondary" disabled={cooldown > 0} onClick={() => void resend()}><RefreshCw size={15} aria-hidden="true" /> {cooldown > 0 ? `Resend in ${cooldown}s` : "Send the email again"}</button>
            <button type="button" className="ob-link" onClick={() => { setChangingGuardian(true); setStep(0); }}>Use a different guardian</button>
          </div>
        </section>
      </main>
    );
  }

  const guardianBox = (
    <div className="ob-guardian">
              <h2>Your parent or guardian needs to say yes</h2>
              <p>You’re under 18, so we’ll email a parent or guardian to ask for their permission. You can use Placeble as soon as they agree.</p>
              <div className="ob-row"><div className="ob-field"><label htmlFor="ob-gname">Their name</label><input id="ob-gname" value={form.guardianName} onChange={event => setForm({ ...form, guardianName: cleanNameInput(event.target.value) })} autoComplete="off" maxLength={80} /></div><div className="ob-field"><label htmlFor="ob-gmail">Their email</label><input id="ob-gmail" type="email" value={form.guardianEmail} onChange={event => setForm({ ...form, guardianEmail: event.target.value })} autoComplete="off" /></div></div>
            </div>
  );

  const progressSteps = steps.length;
  return (
    <main className="ob-page">{header}
      <section className="ob-card">
        {progressSteps > 1 && !changingGuardian && <ol className="ob-steps" aria-label="Setup progress">{steps.map((item, index) => <li key={item} className={index === step ? "on" : index < step ? "done" : ""}><b>{index < step ? <Check size={13} aria-hidden="true" /> : index + 1}</b>{item === "about" ? "About you" : item === "course" ? "Your course" : "Your goals"}</li>)}</ol>}

        {current === "about" && (<>
          <h1>Welcome, {setup.name.split(" ")[0]}</h1>
          <p className="ob-lead">First, a little about you. We use your date of birth to make sure Placeble is right for you.</p>
          <div className="ob-field"><label htmlFor="ob-dob">Date of birth</label><div className="ob-input"><CalendarDays size={18} aria-hidden="true" /><input id="ob-dob" type="date" value={form.dateOfBirth} max={new Date().toISOString().slice(0, 10)} onChange={event => setForm({ ...form, dateOfBirth: event.target.value })} /></div></div>
          {needsGuardian && !changingGuardian && age !== null && age >= setup.limits.minAge && guardianBox}
        </>)}

        {current === "guardian" && (<>
          <h1>Use a different guardian</h1>
          <p className="ob-lead">Enter the details of the parent or guardian who should give permission. We’ll email them a fresh link.</p>
          {guardianBox}
        </>)}

        {current === "course" && (<>
          <h1>Your course</h1>
          <p className="ob-lead">This tailors your practice, interview questions and recommendations.</p>
          {setup.locked.program && <div className="ob-locked"><Lock size={14} aria-hidden="true" /><span>Programme</span><b>{setup.locked.program.name}</b><small>Set by your institute</small></div>}
          {setup.needs.program && (
            <div className="ob-field"><label htmlFor="ob-program">Programme</label>
              <select id="ob-program" value={form.programCode} onChange={event => { const code = event.target.value; const picked = setup.programs.find(item => item.code === code); setForm(current => ({ ...current, programCode: code, graduationYear: picked && current.admissionYear && !current.graduationYear ? String(Number(current.admissionYear) + picked.durationYears) : current.graduationYear })); }}>
                <option value="">Select your programme…</option>
                {[...new Set(setup.programs.map(item => item.category))].map(group => <optgroup key={group} label={group}>{setup.programs.filter(item => item.category === group).map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</optgroup>)}
              </select>
            </div>
          )}
          {setup.locked.batch && <div className="ob-locked"><Lock size={14} aria-hidden="true" /><span>Batch</span><b>{setup.locked.batch.label} · {setup.locked.batch.period}</b><small>Set by your institute</small></div>}
          {setup.needs.batch && (
            <div className="ob-row">
              <div className="ob-field"><label htmlFor="ob-adm">Admission year</label><select id="ob-adm" value={form.admissionYear} onChange={event => { const year = event.target.value; setForm(current => ({ ...current, admissionYear: year, graduationYear: !current.graduationYear && year && program ? String(Number(year) + program.durationYears) : current.graduationYear })); }}><option value="">Select…</option>{Array.from({ length: setup.limits.maxYear - setup.limits.minYear + 1 }, (_, index) => setup.limits.maxYear - index).map(year => <option key={year} value={year}>{year}</option>)}</select></div>
              <div className="ob-field"><label htmlFor="ob-grad">Graduating year</label><select id="ob-grad" value={form.graduationYear} onChange={event => setForm({ ...form, graduationYear: event.target.value })}><option value="">Select…</option>{Array.from({ length: setup.limits.maxYear - setup.limits.minYear + 1 }, (_, index) => setup.limits.maxYear - index).map(year => <option key={year} value={year}>{year}</option>)}</select></div>
            </div>
          )}
        </>)}

        {current === "goals" && (<>
          <h1>{steps.length === 1 ? `Welcome, ${setup.name.split(" ")[0]}` : "Your goals"}</h1>
          <p className="ob-lead">{program ? `Pick the roles you’re aiming for as a ${program.name} student. We’ll tailor your practice to them.` : "Tell us what you’re aiming for so we can tailor your practice."}</p>
          {(setup.locked.program || setup.locked.batch) && current === "goals" && !setup.needs.program && !setup.needs.batch && <div className="ob-locked"><Lock size={14} aria-hidden="true" /><span>Your course</span><b>{[setup.locked.program?.name, setup.locked.batch?.label].filter(Boolean).join(" · ")}</b><small>Set by your institute</small></div>}
          <SuggestChips label="Target roles" values={form.roles} onChange={roles => setForm({ ...form, roles })} pool={roleSuggestions(program)} quick={(program?.roles ?? roleSuggestions(program)).slice(0, 8)} placeholder="Type a role, e.g. Data Analyst" max={12} maxLength={80} hint={program ? `Suggestions follow your ${program.name} course. Type to search, or add your own.` : "Type to search, or add your own and press Enter."} />
          <SuggestChips label="Skills" values={form.skills} onChange={skills => setForm({ ...form, skills })} pool={skillSuggestions(program)} quick={skillSuggestions(program).slice(0, 8)} placeholder="Type a skill, e.g. Python" max={30} hint="Suggestions appear as you type. Press Enter to add your own." />
        </>)}

        {error && <div className="ob-alert" role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</div>}
        <div className="ob-nav">
          {step > 0 ? <button type="button" className="ob-secondary" onClick={() => { setError(""); setStep(value => value - 1); }}><ArrowLeft size={15} aria-hidden="true" /> Back</button> : changingGuardian ? <button type="button" className="ob-secondary" onClick={() => setChangingGuardian(false)}>Cancel</button> : <span />}
          {step < steps.length - 1 ? <button type="button" className="ob-primary" onClick={next}>Continue <ArrowRight size={16} aria-hidden="true" /></button> : <button type="button" className="ob-primary" disabled={busy} onClick={() => void submit()}>{busy ? "Saving…" : needsGuardian || changingGuardian ? "Finish & ask my guardian" : "Finish setup"}{!busy && <ArrowRight size={16} aria-hidden="true" />}</button>}
        </div>
      </section>
    </main>
  );
}
