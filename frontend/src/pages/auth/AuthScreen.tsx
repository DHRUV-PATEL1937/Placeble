import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  GraduationCap,
  Landmark,
  Mail,
  MailCheck,
  RefreshCw,
  School,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AccessRequestScreen } from "./AccessRequestScreen";
import { apiRequest, type AuthUser, type Role } from "./auth-shared";
import { Alert, AuthHeading, AuthShell, Field, PasswordField, SubmitButton, passwordMeetsRules } from "./auth-ui";
import { cleanNameInput, EMAIL_RE, nameProblem } from "@/services/validation";

type View = "login" | "signup" | "forgot";
type Portal = "student" | "institution";

const DEMO_PASSWORD = "Placeble@2026";
const demoAccounts: { role: Role; label: string; email: string; icon: typeof GraduationCap }[] = [
  { role: "student", label: "Student", email: "student@placeble.local", icon: GraduationCap },
  { role: "tpo", label: "Institute TPO", email: "tpo@placeble.local", icon: Building2 },
  { role: "principal", label: "Principal", email: "principal@placeble.local", icon: School },
  { role: "university_admin", label: "University TPO", email: "university@placeble.local", icon: Landmark },
  { role: "recruiter", label: "Recruiter", email: "recruiter@placeble.local", icon: BriefcaseBusiness },
  { role: "faculty", label: "Faculty", email: "faculty@placeble.local", icon: BookOpenCheck },
];

const EMAIL_PATTERN = EMAIL_RE;

// Students from a college are added by their placement office. Anyone else can create a free account here.
const viewFromPath = (path: string): View => path === "/forgot-password" ? "forgot" : path === "/signup/student" ? "signup" : "login";
const portalFromPath = (path: string): Portal => path === "/login/staff" ? "institution" : "student";
const accessFromPath = (path: string) => path === "/request/institution" ? "institution" : path === "/register/recruiter" ? "recruiter" : null;

function friendlyError(cause: unknown) {
  if (cause instanceof DOMException && cause.name === "AbortError") return "The request timed out. Check your connection and try again.";
  if (cause instanceof TypeError) return "We couldn’t reach Placeble. Check your connection and try again.";
  return cause instanceof Error ? cause.message : "Something went wrong. Please try again.";
}

export function AuthScreen({ onAuthenticated, onCompanyPending, onStudentPending, sessionExpired = false }: { onAuthenticated: (user: AuthUser, accessToken: string) => void; onCompanyPending: () => void; onStudentPending: () => void; sessionExpired?: boolean }) {
  const initialPath = window.location.pathname;
  const [view, setView] = useState<View>(() => viewFromPath(initialPath));
  const [portal, setPortal] = useState<Portal>(() => portalFromPath(initialPath));
  const [accessMode, setAccessMode] = useState<"institution" | "recruiter" | null>(() => accessFromPath(initialPath));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [errorCode, setErrorCode] = useState("");
  const [verifyEmail, setVerifyEmail] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [resendNote, setResendNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(() => sessionExpired ? "Your session ended due to inactivity. Please sign in again." : "");
  const [sentTo, setSentTo] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(current => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const resendVerification = async (address: string) => {
    setResendNote("");
    try {
      await apiRequest("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email: address }) });
      setResendNote("A new verification link is on its way. Check your inbox and spam folder.");
      setCooldown(45);
    } catch (cause) { setResendNote(friendlyError(cause)); }
  };

  const resetFeedback = () => { setError(""); setErrorCode(""); setNotice(""); setSentTo(""); setTouched({}); setVerifyEmail(""); setResendNote(""); };

  const navigateAccess = (mode: "institution" | "recruiter" | null) => {
    const path = mode === "institution" ? "/request/institution" : mode === "recruiter" ? "/register/recruiter" : portal === "institution" ? "/login/staff" : "/login/student";
    window.history.pushState({ accessMode: mode }, "", path);
    setAccessMode(mode);
    resetFeedback();
  };
  const navigateAuth = (nextView: View, nextPortal: Portal = portal) => {
    const path = nextView === "forgot" ? "/forgot-password" : nextView === "signup" ? "/signup/student" : nextPortal === "institution" ? "/login/staff" : "/login/student";
    window.history.pushState({ view: nextView, portal: nextPortal }, "", path);
    setView(nextView);
    setPortal(nextPortal);
    resetFeedback();
  };

  useEffect(() => {
    const path = window.location.pathname;
    if (path === "/") window.history.replaceState({}, "", "/login/student");
    const onPopState = () => {
      const next = window.location.pathname;
      setView(viewFromPath(next));
      setPortal(portalFromPath(next));
      setAccessMode(accessFromPath(next));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    document.title = `${view === "forgot" ? "Reset your password" : view === "signup" ? "Create your account" : "Sign in"} | Placeble`;
    firstField.current?.focus();
  }, [view, portal, accessMode]);

  const gmailOnly = view === "signup" && EMAIL_PATTERN.test(email.trim()) && !email.trim().toLowerCase().endsWith("@gmail.com");
  const emailError = touched.email && !EMAIL_PATTERN.test(email.trim()) ? (email.trim() ? "Enter a valid email address, like you@example.com." : "Enter your email address.") : touched.email && gmailOnly ? "Sign up with a Gmail address, like you@gmail.com. If your college added you, sign in instead." : "";
  const passwordError = touched.password && !password ? "Enter your password." : "";
  const nameError = view === "signup" && touched.name ? nameProblem(name) : "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched({ email: true, password: true, name: true });
    setError(""); setErrorCode(""); setNotice("");
    if (!EMAIL_PATTERN.test(email.trim())) return;
    if (view === "signup" && nameProblem(name)) return;
    if (gmailOnly) return;
    if (view !== "forgot" && !password) return;
    if (view === "signup" && !passwordMeetsRules(password)) { setError("Your password doesn’t meet all the requirements yet."); return; }
    if (view === "signup" && !consent) { setError("Please agree to the Terms of Service and Privacy Policy to create an account."); return; }

    setLoading(true);
    try {
      const cleanEmail = email.trim();
      if (view === "forgot") {
        const { payload } = await apiRequest("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: cleanEmail }) });
        setSentTo(cleanEmail);
        setNotice(payload.message + (payload.delivery === "provider_not_configured" ? " Email delivery will activate when a provider is configured." : ""));
      } else if (view === "signup") {
        const { payload } = await apiRequest("/auth/register", { method: "POST", body: JSON.stringify({ name: name.trim(), email: cleanEmail, password, acceptTerms: true }) });
        setPassword("");
        if (payload.emailVerificationRequired) { setVerifyEmail(cleanEmail); setCooldown(45); }
        else { navigateAuth("login", "student"); setNotice(payload.message); }
      } else {
        const { response, payload } = await apiRequest("/auth/login", { method: "POST", body: JSON.stringify({ email: cleanEmail, password, portal }) });
        if (response.status === 202 && payload.code === "ACCOUNT_PENDING") { onStudentPending(); return; }
        onAuthenticated(payload.user, payload.accessToken);
      }
    } catch (cause) {
      setErrorCode((cause as Error & { code?: string }).code ?? "");
      setError(friendlyError(cause));
    } finally { setLoading(false); }
  };

  const fillDemo = (account: typeof demoAccounts[number]) => {
    navigateAuth("login", account.role === "student" ? "student" : "institution");
    setEmail(account.email);
    setPassword(DEMO_PASSWORD);
  };

  if (accessMode) return <AccessRequestScreen mode={accessMode} onBack={() => navigateAccess(null)} onAuthenticated={onAuthenticated} onPending={onCompanyPending} />;

  const staff = portal === "institution";
  const heading = view === "signup"
    ? { kicker: "Free student account", title: "Create your account", text: "Practise interviews, build your resume and track your readiness. Free to start, no college needed." }
    : view === "forgot"
    ? { kicker: "Account recovery", title: "Reset your password", text: "Enter the email on your account and we’ll send you a secure reset link." }
    : staff
      ? { kicker: "Staff & recruiter access", title: "Welcome back", text: "Sign in with the email your university, institute or company registered with Placeble." }
      : { kicker: "Student workspace", title: "Welcome back", text: "Sign in with your email and password. Added by your college? Use the details they sent." };

  return (
    <AuthShell variant={staff ? "institution" : "student"}>
      {view !== "login" && !verifyEmail && <button type="button" className="ax-back" onClick={() => navigateAuth("login", portal)}><ArrowLeft size={16} aria-hidden="true" /> Back to sign in</button>}

      {verifyEmail ? (
        <div className="ax-sent" role="status">
          <span aria-hidden="true"><MailCheck size={26} /></span>
          <h2>Verify your email</h2>
          <p>We sent a verification link to <strong>{verifyEmail}</strong>. Open it to confirm your address, then sign in.</p>
          <p className="ax-sent-to">The link expires in 24 hours. Not there? Check your spam folder.</p>
          {resendNote && <Alert tone="info">{resendNote}</Alert>}
          <div className="ax-sent-actions">
            <button type="button" className="ax-secondary" disabled={cooldown > 0} onClick={() => void resendVerification(verifyEmail)}><RefreshCw size={15} aria-hidden="true" /> {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}</button>
            <button type="button" className="ax-link" onClick={() => navigateAuth("login", "student")}>Go to sign in</button>
          </div>
        </div>
      ) : view === "forgot" && sentTo ? (
        <div className="ax-sent" role="status">
          <span aria-hidden="true"><MailCheck size={26} /></span>
          <h2>Check your inbox</h2>
          <p>{notice}</p>
          <p className="ax-sent-to">Sent to <strong>{sentTo}</strong>. The link expires in 30 minutes. Not there? Check your spam folder.</p>
          <button type="button" className="ax-secondary" onClick={() => { setSentTo(""); setNotice(""); }}>Use a different email</button>
        </div>
      ) : (
        <>
          <AuthHeading kicker={heading.kicker} title={heading.title}>{heading.text}</AuthHeading>

          {view === "login" && (
            <div className="ax-segment" role="group" aria-label="Account type">
              <button type="button" aria-pressed={!staff} onClick={() => navigateAuth("login", "student")}><GraduationCap size={16} aria-hidden="true" /> Student</button>
              <button type="button" aria-pressed={staff} onClick={() => navigateAuth("login", "institution")}><Building2 size={16} aria-hidden="true" /> Staff &amp; recruiter</button>
            </div>
          )}

          <form className="ax-form" onSubmit={submit} noValidate>
            {notice && <Alert tone={sessionExpired && view === "login" ? "info" : "success"}>{notice}</Alert>}
            {error && <Alert tone="error" action={errorCode === "EMAIL_NOT_VERIFIED" ? <button type="button" className="ax-inline-action" disabled={cooldown > 0} onClick={() => void resendVerification(email.trim())}>{cooldown > 0 ? `Resend available in ${cooldown}s` : "Resend verification email"}</button> : undefined}>{error}</Alert>}
            {resendNote && !verifyEmail && <Alert tone="info">{resendNote}</Alert>}

            {view === "signup" && <Field label="Full name" icon={CircleUserRound} inputRef={firstField} value={name} onChange={event => setName(cleanNameInput(event.target.value))} onBlur={() => setTouched(current => ({ ...current, name: true }))} error={nameError} placeholder="Your full name" autoComplete="name" maxLength={80} required />}

            <Field label="Email" icon={Mail} inputRef={view === "signup" ? undefined : firstField} type="email" inputMode="email" value={email} onChange={event => setEmail(event.target.value)} onBlur={() => setTouched(current => ({ ...current, email: true }))} error={emailError} placeholder={view === "signup" ? "you@gmail.com" : staff ? "you@institution.edu" : "you@college.edu"} autoComplete="email" autoCapitalize="none" spellCheck={false} required />

            {view !== "forgot" && (
              <div className="ax-pw-block">
                <PasswordField value={password} onChange={event => setPassword(event.target.value)} onBlur={() => setTouched(current => ({ ...current, password: true }))} error={passwordError} placeholder={view === "signup" ? "Create a strong password" : "Enter your password"} autoComplete={view === "signup" ? "new-password" : "current-password"} rules={view === "signup"} required />
                {view === "login" && <button type="button" className="ax-link ax-forgot" onClick={() => navigateAuth("forgot")}>Forgot password?</button>}
              </div>
            )}

            {view === "signup" && (
              <label className="ax-consent">
                <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />
                <span>I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</span>
              </label>
            )}

            <SubmitButton loading={loading} loadingText={view === "forgot" ? "Sending link…" : view === "signup" ? "Creating account…" : "Signing in…"}>
              {view === "forgot" ? "Send reset link" : view === "signup" ? "Create account" : "Sign in"}<ArrowRight size={18} aria-hidden="true" />
            </SubmitButton>
          </form>

          {view === "login" && !staff && <p className="ax-switch">New here? <button type="button" onClick={() => navigateAuth("signup", "student")}>Create a free account</button></p>}
          {view === "login" && !staff && <p className="ax-note">Added by your college? Use the email and password they sent you.</p>}
          {view === "signup" && <p className="ax-switch">Already have an account? <button type="button" onClick={() => navigateAuth("login", "student")}>Sign in</button></p>}

          {view === "login" && staff && (
            <div className="ax-org">
              <div className="ax-divider"><span>For organizations</span></div>
              <div className="ax-org-grid">
                <button type="button" onClick={() => navigateAccess("institution")}><Building2 size={18} aria-hidden="true" /><span><strong>Register institution</strong><small>Talk to our onboarding team</small></span><ChevronRight size={16} aria-hidden="true" /></button>
                <button type="button" onClick={() => navigateAccess("recruiter")}><BriefcaseBusiness size={18} aria-hidden="true" /><span><strong>Register company</strong><small>Hire from verified campuses</small></span><ChevronRight size={16} aria-hidden="true" /></button>
              </div>
            </div>
          )}

          {view === "login" && import.meta.env.DEV && (
            <details className="ax-demo">
              <summary><CheckCircle2 size={15} aria-hidden="true" /> Local demo access <em>dev only</em></summary>
              <div>
                {demoAccounts.map(account => { const Icon = account.icon; return <button type="button" key={account.role} onClick={() => fillDemo(account)} className={email === account.email ? "selected" : ""}><Icon size={15} aria-hidden="true" />{account.label}</button>; })}
              </div>
            </details>
          )}
        </>
      )}
    </AuthShell>
  );
}
