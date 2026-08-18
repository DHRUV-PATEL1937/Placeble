import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Eye,
  EyeOff,
  GraduationCap,
  LockKeyhole,
  Mail,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { PlacebleDashboard } from "@/src/features/dashboard/components/placeble-dashboard";
import { ProfessionalRoleDashboard } from "@/src/features/professional/components/professional-role-dashboard";
import { PlatformAdminConsole } from "@/src/features/admin/components/platform-admin-console";

type Role = "student" | "tpo" | "recruiter" | "faculty" | "platform_admin";
type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "pending" | "active" | "suspended";
  emailVerified: boolean;
  institutionId: string | null;
  recruiterOrgId?: string | null;
  studentVerificationStatus?: "pending_tpo_approval" | "approved" | "rejected" | "roster_matched" | "pending_domain_approval" | null;
  onboardingCompleted: boolean;
  destination: string;
};

const API_URL = import.meta.env.VITE_API_URL ?? "https://api.placeble.in/api/v1";
const DEMO_PASSWORD = "Placeble@2026";
const demoAccounts: { role: Role; label: string; email: string; icon: typeof GraduationCap }[] = [
  { role: "student", label: "Student", email: "student@placeble.local", icon: GraduationCap },
  { role: "tpo", label: "TPO / Admin", email: "tpo@placeble.local", icon: Building2 },
  { role: "recruiter", label: "Recruiter", email: "recruiter@placeble.local", icon: BriefcaseBusiness },
  { role: "faculty", label: "Faculty", email: "faculty@placeble.local", icon: BookOpenCheck },
];

function Brand() {
  return <div className="auth-brand"><span className="auth-brand-mark"><i /><i /><i /></span><strong>placeble</strong></div>;
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = window.localStorage.getItem("placeble-theme");
    const next = saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    window.localStorage.setItem("placeble-theme", next ? "dark" : "light");
  };
  return <button className="auth-theme-toggle" type="button" onClick={toggle} aria-label={dark ? "Use light mode" : "Use dark mode"} title={dark ? "Use light mode" : "Use dark mode"}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>;
}

async function apiRequest(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok && response.status !== 202) {
    const fieldMessage = Object.values(payload?.fields ?? {}).flat().find(value => typeof value === "string");
    const error = new Error(fieldMessage ?? payload?.message ?? "Something went wrong. Please try again.") as Error & { code?: string; status?: number };
    error.code = payload?.code;
    error.status = response.status;
    throw error;
  }
  return { response, payload };
}

function PasswordStrength({ password }: { password: string }) {
  const checks = [password.length >= 8, /[A-Z]/.test(password), /[a-z]/.test(password), /[0-9]/.test(password)];
  const score = checks.filter(Boolean).length;
  return <div className="password-strength"><div>{[0,1,2,3].map(index => <span key={index} className={index < score ? "filled" : ""} />)}</div><small>{score < 2 ? "Use at least 8 characters" : score < 4 ? "A little stronger" : "Strong password"}</small></div>;
}

type ActivationState = "checking" | "valid" | "expired" | "already_used" | "invalid";
type ActivationInvite = { email: string; name?: string; role: "tpo" | "faculty"; institutionId: string; institutionName: string; expiresAt: string };

function ActivationScreen({ token, onAuthenticated, onReturnToSignIn }: { token: string; onAuthenticated: (user: AuthUser, accessToken: string) => void; onReturnToSignIn: () => void }) {
  const [state, setState] = useState<ActivationState>(() => token.length < 20 ? "invalid" : "checking");
  const [invite, setInvite] = useState<ActivationInvite | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Activate account | Placeble";
    if (token.length < 20) return;
    let active = true;
    apiRequest(`/auth/activate?token=${encodeURIComponent(token)}`)
      .then(({ payload }) => { if (active) { setInvite(payload.invite); setName(payload.invite.name ?? ""); setState("valid"); } })
      .catch((cause: Error & { code?: string }) => {
        if (!active) return;
        setState(cause.code === "INVITE_EXPIRED" ? "expired" : cause.code === "INVITE_ALREADY_USED" ? "already_used" : "invalid");
      });
    return () => { active = false; };
  }, [token]);

  const activate = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) { setError("The passwords do not match."); return; }
    setLoading(true);
    try {
      const { payload } = await apiRequest("/auth/activate", { method: "POST", body: JSON.stringify({ token, name, password }) });
      window.history.replaceState({}, "", "/");
      onAuthenticated(payload.user, payload.accessToken);
    } catch (cause) {
      const activationError = cause as Error & { code?: string };
      if (activationError.code === "INVITE_EXPIRED") setState("expired");
      else if (["INVITE_ALREADY_USED", "INVITE_ACCOUNT_EXISTS"].includes(activationError.code ?? "")) setState("already_used");
      else if (activationError.code === "INVITE_INVALID") setState("invalid");
      else setError(activationError.message || "The account could not be activated.");
    } finally { setLoading(false); }
  };

  const stateCopy = state === "expired" ? {
    icon: <Clock3 size={25} />,
    kicker: "Invite expired",
    title: "This invite is no longer active.",
    body: "For your security, invitation links expire after 48 hours. Ask your institution administrator to send a new invite.",
  } : state === "already_used" ? {
    icon: <CheckCircle2 size={25} />,
    kicker: "Invite already used",
    title: "This account has already been activated.",
    body: "An invite can create only one account. Sign in with the email and password used during activation.",
  } : {
    icon: <AlertCircle size={25} />,
    kicker: "Invalid invite",
    title: "We could not verify this link.",
    body: "The activation token is missing, malformed, or revoked. Check that you opened the complete link, or request a new invite.",
  };

  return <main className="activation-page"><ThemeToggle />
    <section className="activation-story">
      <Brand />
      <div><span className="auth-kicker"><ShieldCheck size={14} /> Secure institution access</span><h1>Join the right workspace with the right permissions.</h1><p>Your role and institution are taken directly from the invitation. They cannot be changed from this screen.</p><div className="activation-security"><ShieldCheck size={20} /><span><strong>Role-aware from the first session</strong><small>Placeble verifies the token before collecting account details.</small></span></div></div>
      <p>© 2026 Placeble</p>
    </section>
    <section className="activation-form-side">
      <div className="activation-mobile-brand"><Brand /></div>
      {state === "checking" ? <div className="activation-loading" aria-live="polite"><span className="button-spinner" /><p className="auth-form-kicker">Checking invitation</p><h2>Verifying your secure link…</h2><p>This should take only a moment.</p></div> : state === "valid" && invite ? <div className="activation-form-wrap">
        <header className="auth-heading"><span className="auth-form-kicker">{invite.role} invitation</span><h2>Activate your account.</h2><p>Create the credentials you will use for {invite.institutionName}.</p></header>
        <div className="activation-context"><Building2 size={19} /><div><strong>{invite.institutionName}</strong><span>{invite.email}</span></div><em>{invite.role === "faculty" ? "Read-only faculty" : "Institution administrator"}</em></div>
        <form className="auth-form" onSubmit={activate}>
          <label><span>Full name</span><div className="auth-input"><CircleUserRound size={18} /><input value={name} onChange={event => setName(event.target.value)} placeholder="Your full name" required autoComplete="name" /></div></label>
          <label><span>Create password</span><div className="auth-input"><LockKeyhole size={18} /><input type={showPassword ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 8 characters" required autoComplete="new-password" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div><PasswordStrength password={password} /></label>
          <label><span>Confirm password</span><div className="auth-input"><LockKeyhole size={18} /><input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Repeat your password" required autoComplete="new-password" /></div></label>
          {error && <div className="auth-message error"><AlertCircle size={17} /><span>{error}</span></div>}
          <button className="auth-submit" disabled={loading}>{loading ? <><span className="button-spinner" /> Activating securely…</> : <>Activate and continue <ArrowRight size={17} /></>}</button>
        </form>
        <p className="activation-expiry"><Clock3 size={14} /> Link valid until {new Date(invite.expiresAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
      </div> : <div className={`activation-state ${state}`}><span>{stateCopy.icon}</span><p className="auth-form-kicker">{stateCopy.kicker}</p><h2>{stateCopy.title}</h2><p>{stateCopy.body}</p><button className="button button-primary" onClick={onReturnToSignIn}>{state === "already_used" ? "Go to sign in" : "Return to sign in"}<ArrowRight size={16} /></button></div>}
    </section>
  </main>;
}

function AccessRequestScreen({ mode, onBack, onAuthenticated, onPending }: { mode: "institution" | "recruiter"; onBack: () => void; onAuthenticated: (user: AuthUser, accessToken: string) => void; onPending: () => void }) {
  const [name, setName] = useState(""); const [organizationName, setOrganizationName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [note, setNote] = useState(""); const [showPassword, setShowPassword] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); setLoading(true); setError(""); setNotice(""); try { if (mode === "institution") { const { payload } = await apiRequest("/auth/institution-leads", { method: "POST", body: JSON.stringify({ institutionName: organizationName, contactName: name, workEmail: email, note }) }); setNotice(payload.message); } else { const { response, payload } = await apiRequest("/auth/recruiter-register", { method: "POST", body: JSON.stringify({ name, companyName: organizationName, email, password }) }); if (response.status === 202) onPending(); else onAuthenticated(payload.user, payload.accessToken); } } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit this request."); } finally { setLoading(false); } };
  return <main className="auth-page"><section className="auth-story"><Brand /><div className="auth-story-copy"><span className="auth-kicker"><ShieldCheck size={14} /> {mode === "institution" ? "Manual tenant onboarding" : "Verified recruiter network"}</span><h1>{mode === "institution" ? "Bring your institution into a workspace of its own." : "Verify once. Build trusted campus relationships."}</h1><p>{mode === "institution" ? "Every college receives a fully isolated tenant, configured with approved domains and a secure first-admin activation." : "Register with your company email. Placeble verifies the organization once; each institution still controls access to every drive."}</p></div><div className="auth-story-footer"><span><ShieldCheck size={15} /> Tenant-safe by design</span><span>© 2026 Placeble</span></div></section><section className="auth-form-side"><div className="auth-mobile-head"><Brand /></div><div className="auth-form-wrap"><button className="auth-back" onClick={onBack}><ArrowLeft size={16} /> Back to sign in</button><header className="auth-heading"><span className="auth-form-kicker">{mode === "institution" ? "Institution enquiry" : "Recruiter registration"}</span><h2>{mode === "institution" ? "Talk to our institution team." : "Register your company."}</h2><p>{mode === "institution" ? "This form starts a conversation; it never creates a tenant automatically." : "Use your work email so the company domain can be reviewed securely."}</p></header><form className="auth-form" onSubmit={submit}><label><span>Your full name</span><div className="auth-input"><CircleUserRound size={18} /><input required value={name} onChange={event => setName(event.target.value)} /></div></label><label><span>{mode === "institution" ? "Institution name" : "Company name"}</span><div className="auth-input"><Building2 size={18} /><input required value={organizationName} onChange={event => setOrganizationName(event.target.value)} /></div></label><label><span>Work email</span><div className="auth-input"><Mail size={18} /><input required type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder={mode === "institution" ? "you@college.edu" : "you@company.com"} /></div></label>{mode === "institution" ? <label><span>What should we know? <em>optional</em></span><textarea className="access-note" value={note} onChange={event => setNote(event.target.value)} placeholder="Student count, placement team size, or preferred timeline" /></label> : <label><span>Create password</span><div className="auth-input"><LockKeyhole size={18} /><input required type={showPassword ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" /><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div><PasswordStrength password={password} /></label>}{error && <div className="auth-message error"><AlertCircle size={17} /><span>{error}</span></div>}{notice && <div className="auth-message success"><CheckCircle2 size={17} /><span>{notice}</span></div>}<button className="auth-submit" disabled={loading || Boolean(notice)}>{loading ? <><span className="button-spinner" /> Submitting securely</> : <>{mode === "institution" ? "Request institution onboarding" : "Submit company registration"}<ArrowRight size={17} /></>}</button></form></div></section></main>;
}

function AuthScreen({ onAuthenticated, onCompanyPending, onStudentPending }: { onAuthenticated: (user: AuthUser, accessToken: string) => void; onCompanyPending: () => void; onStudentPending: () => void }) {
  const [view, setView] = useState<"login" | "signup" | "forgot">("login");
  const [portal, setPortal] = useState<"student" | "institution">("student");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [accessMode, setAccessMode] = useState<"institution" | "recruiter" | null>(null);

  const title = view === "signup" ? "Start building your readiness." : view === "forgot" ? "Reset your password." : portal === "student" ? "Welcome back." : "Institution access.";
  const helper = view === "signup" ? "Use the exact email your TPO added to the institution roster. Dashboard access starts after TPO approval." : view === "forgot" ? "Enter your account email and we’ll send recovery instructions." : portal === "student" ? "Sign in to continue your placement preparation." : "Sign in with the email invited by your institution.";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true); setError(""); setErrorCode(""); setNotice("");
    try {
      if (view === "forgot") {
        const { payload } = await apiRequest("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
        setNotice(payload.message + (payload.delivery === "provider_not_configured" ? " Email delivery will activate when a provider is configured." : ""));
      } else {
        const path = view === "signup" ? "/auth/register" : "/auth/login";
        const body = view === "signup" ? { name, email, password } : { email, password, portal };
        const { response, payload } = await apiRequest(path, { method: "POST", body: JSON.stringify(body) });
        if (response.status === 202 && payload.code === "ACCOUNT_PENDING") {
          onStudentPending();
          return;
        }
        onAuthenticated(payload.user, payload.accessToken);
      }
    } catch (submitError) {
      setErrorCode((submitError as Error & { code?: string }).code ?? "");
      setError(submitError instanceof Error ? submitError.message : "Something went wrong. Please try again.");
    } finally { setLoading(false); }
  };

  const fillDemo = (account: typeof demoAccounts[number]) => {
    setView("login");
    setPortal(account.role === "student" ? "student" : "institution");
    setEmail(account.email);
    setPassword(DEMO_PASSWORD);
    setError("");
  };

  if (accessMode) return <AccessRequestScreen mode={accessMode} onBack={() => setAccessMode(null)} onAuthenticated={onAuthenticated} onPending={onCompanyPending} />;
  return <main className="auth-page">
    <ThemeToggle />
    <section className="auth-story">
      <Brand />
      <div className="auth-story-copy">
        <span className="auth-kicker"><Sparkles size={14} /> One profile. Six focused coaches.</span>
        <h1>Preparation and placement, finally connected.</h1>
        <p>Build practical skills, understand your readiness, and move toward the right opportunity with a steady plan.</p>
        <div className="auth-score-preview">
          <div className="auth-score-ring"><span>72</span></div>
          <div><small>Readiness score</small><strong>Clear progress you can act on.</strong><p>Resume, aptitude, interviews, and applications—measured together.</p></div>
        </div>
      </div>
      <div className="auth-story-footer"><span><ShieldCheck size={15} /> Secure, role-aware access</span><span>© 2026 Placeble</span></div>
    </section>

    <section className="auth-form-side">
      <div className="auth-mobile-head"><Brand /></div>
      <div className="auth-form-wrap">
        {view !== "login" && <button className="auth-back" onClick={() => { setView("login"); setError(""); setNotice(""); }}><ArrowLeft size={16} /> Back to sign in</button>}
        <header className="auth-heading"><span className="auth-form-kicker">{view === "signup" ? "Student account" : view === "forgot" ? "Account recovery" : portal === "student" ? "Student workspace" : "Invited accounts"}</span><h2>{title}</h2><p>{helper}</p></header>
        <form className="auth-form" onSubmit={submit}>
          {view === "signup" && <label><span>Full name</span><div className="auth-input"><CircleUserRound size={18} /><input value={name} onChange={event => setName(event.target.value)} placeholder="Your full name" required autoComplete="name" /></div></label>}
          <label><span>Email address</span><div className="auth-input"><Mail size={18} /><input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder={portal === "student" ? "you@example.com" : "you@institution.edu"} required autoComplete="email" /></div></label>
          {view !== "forgot" && <label><span>Password</span><div className="auth-input"><LockKeyhole size={18} /><input type={showPassword ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" required autoComplete={view === "signup" ? "new-password" : "current-password"} /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>{view === "signup" && <PasswordStrength password={password} />}</label>}
          {view === "login" && <div className="auth-row"><label className="remember"><input type="checkbox" /> <span>Keep me signed in</span></label><button type="button" className="auth-link" onClick={() => { setView("forgot"); setError(""); }}>Forgot password?</button></div>}
          {error && <div className="auth-message error"><AlertCircle size={17} /><span>{error}</span></div>}
          {errorCode === "DOMAIN_NOT_RECOGNIZED" && <button type="button" className="auth-domain-help" onClick={() => setAccessMode("institution")}><Building2 size={15} /> Ask your institution to contact Placeble</button>}
          {notice && <div className="auth-message success"><CheckCircle2 size={17} /><span>{notice}</span></div>}
          <button className="auth-submit" disabled={loading}>{loading ? <><span className="button-spinner" /> Please wait</> : <>{view === "signup" ? "Create student account" : view === "forgot" ? "Send recovery email" : "Sign in securely"}<ArrowRight size={17} /></>}</button>
        </form>

        {view === "login" && <button className="portal-toggle" onClick={() => { setPortal(portal === "student" ? "institution" : "student"); setError(""); }}>
          {portal === "student" ? <><Building2 size={16} /> Sign in as institution, recruiter, or faculty</> : <><GraduationCap size={16} /> Return to student sign in</>}<ChevronRight size={15} />
        </button>}

        {view === "login" && portal === "student" && <p className="auth-switch">Added to your institution roster? <button onClick={() => { setView("signup"); setError(""); }}>Create a student account</button></p>}

        {view === "login" && <div className="access-entry-grid"><button onClick={() => setAccessMode("institution")}><Building2 size={17} /><span><strong>New institution?</strong><small>Contact our onboarding team</small></span><ChevronRight size={15} /></button><button onClick={() => setAccessMode("recruiter")}><BriefcaseBusiness size={17} /><span><strong>Recruiter company?</strong><small>Register for verification</small></span><ChevronRight size={15} /></button></div>}

        {view === "login" && <div className="demo-access"><div><strong>Local demo access</strong><span>Choose a role to fill the login safely.</span></div><div className="demo-grid">{demoAccounts.map(account => { const Icon = account.icon; return <button key={account.role} onClick={() => fillDemo(account)} className={email === account.email ? "selected" : ""}><Icon size={16} /><span>{account.label}</span></button>; })}</div></div>}
      </div>
      <p className="auth-terms">By continuing, you agree to Placeble’s Terms and Privacy Policy.</p>
    </section>
  </main>;
}

function Onboarding({ user, accessToken, onComplete, onLogout }: { user: AuthUser; accessToken: string; onComplete: (user: AuthUser) => void; onLogout: () => void }) {
  const [step, setStep] = useState(1);
  const [degree, setDegree] = useState("");
  const [year, setYear] = useState("2027");
  const [skills, setSkills] = useState("React, JavaScript, SQL");
  const [roles, setRoles] = useState("Software Engineer, Product Analyst");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const complete = async () => {
    setLoading(true); setError("");
    try {
      const { payload } = await apiRequest("/auth/onboarding", { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ degree, graduationYear: Number(year), skills: skills.split(",").map(item => item.trim()).filter(Boolean), preferredRoles: roles.split(",").map(item => item.trim()).filter(Boolean) }) });
      onComplete(payload.user);
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Could not save your profile."); }
    finally { setLoading(false); }
  };
  return <main className="onboarding-page"><header><Brand /><button onClick={onLogout}>Sign out</button></header><section className="onboarding-shell"><div className="onboarding-progress"><span>Step {step} of 3</span><div>{[1,2,3].map(item => <i key={item} className={item <= step ? "active" : ""} />)}</div></div><div className="onboarding-copy"><span className="auth-form-kicker">Welcome, {user.name.split(" ")[0]}</span><h1>{step === 1 ? "Start with your education." : step === 2 ? "Add the skills you can show." : "What kind of work interests you?"}</h1><p>{step === 1 ? "This helps Placeble set the right preparation level." : step === 2 ? "Use commas to separate skills. You can refine these later." : "Your preferences shape job matches and interview practice."}</p></div><div className="onboarding-fields">{step === 1 && <><label><span>Degree or programme</span><input value={degree} onChange={event => setDegree(event.target.value)} placeholder="B.Tech Computer Science" /></label><label><span>Graduation year</span><input type="number" value={year} onChange={event => setYear(event.target.value)} /></label></>}{step === 2 && <label><span>Your current skills</span><textarea value={skills} onChange={event => setSkills(event.target.value)} /></label>}{step === 3 && <label><span>Preferred roles</span><textarea value={roles} onChange={event => setRoles(event.target.value)} /></label>}</div>{error && <div className="auth-message error"><AlertCircle size={17} />{error}</div>}<div className="onboarding-actions">{step > 1 && <button className="button button-secondary" onClick={() => setStep(step - 1)}>Back</button>}<button className="button button-primary" disabled={(step === 1 && !degree) || loading} onClick={() => step < 3 ? setStep(step + 1) : complete()}>{loading ? "Saving…" : step < 3 ? "Continue" : "Complete profile"}<ArrowRight size={16} /></button></div></section></main>;
}

function SessionScreen({ type, pendingReason, onLogout }: { type: "pending" | "suspended"; pendingReason: "institution" | "company"; onLogout: () => void }) {
  return <main className="session-state"><Brand /><section><span className={type}><Clock3 size={24} /></span><p className="auth-form-kicker">{type === "pending" && pendingReason === "company" ? "Company verification" : "TPO approval required"}</p><h1>{type === "pending" ? pendingReason === "company" ? "Your company registration is under review." : "Your signup is waiting for TPO approval." : "This account is suspended."}</h1><p>{type === "pending" ? pendingReason === "company" ? "Placeble is confirming your organization and work-email domain. This is a one-time platform review; colleges still approve access drive by drive." : "Your roster email was recognized and your account was created safely. You cannot access the student dashboard until your institution placement officer approves it from Pending students." : "Contact your Placeble administrator or support team to review your account status."}</p><button className="button button-secondary" onClick={onLogout}>Return to sign in</button></section></main>;
}

export function PlacebleApp() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [checking, setChecking] = useState(true);
  const [sessionState, setSessionState] = useState<"pending" | "suspended" | null>(null);
  const [pendingReason, setPendingReason] = useState<"institution" | "company">("institution");
  const [activationRoute, setActivationRoute] = useState<{ active: boolean; token: string }>({ active: false, token: "" });

  useEffect(() => {
    const saved = window.localStorage.getItem("placeble-theme");
    const dark = saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, []);

  useEffect(() => {
    if (window.location.pathname === "/activate") {
      const timer = window.setTimeout(() => {
        setActivationRoute({ active: true, token: new URLSearchParams(window.location.search).get("token")?.trim() ?? "" });
        setChecking(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    let active = true;
    apiRequest("/auth/refresh", { method: "POST", body: "{}" })
      .then(({ payload }) => { if (active) { setUser(payload.user); setAccessToken(payload.accessToken); } })
      .catch(() => undefined)
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  const logout = () => {
    setUser(null); setAccessToken(""); setSessionState(null);
    void apiRequest("/auth/logout", { method: "POST", body: "{}" }).catch(() => undefined);
  };
  const authenticated = (nextUser: AuthUser, token: string) => {
    if (nextUser.status === "pending") { setPendingReason(nextUser.role === "recruiter" ? "company" : "institution"); setSessionState("pending"); return; }
    if (nextUser.status === "suspended") { setSessionState("suspended"); return; }
    setUser(nextUser); setAccessToken(token);
  };
  const returnToSignIn = () => {
    window.history.replaceState({}, "", "/");
    document.title = "Dashboard | Placeble";
    setActivationRoute({ active: false, token: "" });
  };

  if (checking) return <main className="auth-loading"><Brand /><span /><p>Preparing your workspace…</p></main>;
  if (activationRoute.active) return <ActivationScreen token={activationRoute.token} onAuthenticated={(nextUser, token) => { setActivationRoute({ active: false, token: "" }); authenticated(nextUser, token); }} onReturnToSignIn={returnToSignIn} />;
  if (sessionState) return <SessionScreen type={sessionState} pendingReason={pendingReason} onLogout={logout} />;
  if (!user) return <AuthScreen onAuthenticated={authenticated} onCompanyPending={() => { setPendingReason("company"); setSessionState("pending"); }} onStudentPending={() => { setPendingReason("institution"); setSessionState("pending"); }} />;
  if (user.role === "student" && !user.onboardingCompleted) return <Onboarding user={user} accessToken={accessToken} onComplete={setUser} onLogout={logout} />;
  if (user.role === "student") return <PlacebleDashboard user={user} accessToken={accessToken} onLogout={logout} />;
  if (user.role === "platform_admin") return <PlatformAdminConsole user={user} accessToken={accessToken} onLogout={logout} />;
  return <ProfessionalRoleDashboard user={{ name: user.name, email: user.email, role: user.role }} accessToken={accessToken} onLogout={logout} />;
}
