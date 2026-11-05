import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleUserRound,
  Clock3,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { StudentDashboard } from "@/pages/student/StudentDashboard";
import { BlogReaderPage } from "@/pages/shared/BlogReaderPage";
import { TpoDashboard } from "@/pages/tpo/TpoDashboard";
import { UniversityDashboard } from "@/pages/university/UniversityDashboard";
import { PrincipalDashboard } from "@/pages/principal/PrincipalDashboard";
import { ProfessionalRoleDashboard } from "@/pages/professional/ProfessionalRoleDashboard";
import { AdminConsole } from "@/pages/admin/AdminConsole";
import { AuthScreen } from "@/pages/auth/AuthScreen";
import { EmailActionScreen } from "@/pages/auth/EmailActionScreen";
import { FirstLoginPasswordScreen } from "@/pages/auth/FirstLoginPasswordScreen";
import { OnboardingScreen } from "@/pages/auth/OnboardingScreen";
import { GuardianConsentScreen } from "@/pages/auth/GuardianConsentScreen";
import { LegalPage } from "@/pages/legal/LegalPage";
import { API_URL, Brand, ThemeToggle, apiRequest, type AuthUser } from "@/pages/auth/auth-shared";

function PasswordStrength({ password }: { password: string }) {
  const checks = [password.length >= 8, /[A-Z]/.test(password), /[a-z]/.test(password), /[0-9]/.test(password)];
  const score = checks.filter(Boolean).length;
  return <div className="password-strength"><div>{[0,1,2,3].map(index => <span key={index} className={index < score ? "filled" : ""} />)}</div><small>{score < 2 ? "Use at least 8 characters" : score < 4 ? "A little stronger" : "Strong password"}</small></div>;
}

type ActivationState = "checking" | "valid" | "expired" | "already_used" | "invalid";
const ROLE_NAME = { tpo: "Institute TPO", faculty: "Faculty", principal: "Principal", university_admin: "University TPO" } as const;
const ROLE_BADGE = { tpo: "Institution administrator", faculty: "Read-only faculty", principal: "Read-only reports", university_admin: "University administrator" } as const;
type ActivationInvite = { email: string; name?: string; role: "tpo" | "faculty" | "principal" | "university_admin"; institutionId: string | null; institutionName: string; expiresAt: string };

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
        <header className="auth-heading"><span className="auth-form-kicker">{ROLE_NAME[invite.role]} invitation</span><h2>Activate your account.</h2><p>Create the credentials you will use for {invite.institutionName}.</p></header>
        <div className="activation-context"><Building2 size={19} /><div><strong>{invite.institutionName}</strong><span>{invite.email}</span></div><em>{ROLE_BADGE[invite.role]}</em></div>
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
  const [sessionExpired, setSessionExpired] = useState(false);

  const accessTokenRef = useRef("");
  const refreshInFlight = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("placeble-theme");
    document.documentElement.dataset.theme = savedTheme === "dark" || (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  }, []);

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  const endExpiredSession = useCallback(() => {
    accessTokenRef.current = "";
    setAccessToken("");
    setUser(null);
    setSessionState(null);
    setSessionExpired(true);
  }, []);

  const renewAccessToken = useCallback(async () => {
    if (!refreshInFlight.current) {
      refreshInFlight.current = apiRequest("/auth/refresh", { method: "POST", body: "{}" })
        .then(({ payload }) => {
          const nextToken = typeof payload?.accessToken === "string" ? payload.accessToken : null;
          if (!nextToken) return null;
          accessTokenRef.current = nextToken;
          setUser(payload.user);
          setAccessToken(nextToken);
          return nextToken;
        })
        .catch(() => null)
        .finally(() => { refreshInFlight.current = null; });
    }
    return refreshInFlight.current;
  }, []);

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
    const safetyTimer = window.setTimeout(() => {
      if (active) setChecking(false);
    }, 10000);
    apiRequest("/auth/refresh", { method: "POST", body: "{}" })
      .then(({ payload }) => { if (active) { setUser(payload.user); setAccessToken(payload.accessToken); } })
      .catch(() => undefined)
      .finally(() => {
        window.clearTimeout(safetyTimer);
        if (active) setChecking(false);
      });
    return () => {
      active = false;
      window.clearTimeout(safetyTimer);
    };
  }, []);

  useEffect(() => {
    if (!accessToken) return;

    const refreshSession = () => { void renewAccessToken(); };

    // Renew the existing httpOnly session before the access token expires and
    // whenever the user returns to a backgrounded workspace.
    const interval = window.setInterval(refreshSession, 10 * 60 * 1000);
    window.addEventListener("focus", refreshSession);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshSession);
    };
  }, [accessToken, renewAccessToken]);

  // Inside the Android app the shell exposes its push token; hand it to the API so this user gets phone notifications.
  useEffect(() => {
    if (!accessToken) return;
    const register = (info?: { token?: string | null; platform?: string }) => {
      if (!info?.token) return;
      void apiRequest("/push/register", { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ token: info.token, platform: info.platform === "ios" ? "ios" : "android" }) }).catch(() => undefined);
    };
    const app = (window as unknown as { __PLACEBLE_APP__?: { token?: string | null; platform?: string } }).__PLACEBLE_APP__;
    register(app);
    const onReady = (event: Event) => register((event as CustomEvent).detail);
    window.addEventListener("placeble-app-ready", onReady);
    return () => window.removeEventListener("placeble-app-ready", onReady);
  }, [accessToken]);

  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);
    const isApiRequest = (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return url.startsWith("/api/") || url.startsWith(API_URL);
    };

    window.fetch = async (input, init) => {
      const response = await nativeFetch(input, init);
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      // A free-plan limit was hit: let the student dashboard show the upgrade prompt, wherever the request came from.
      if (response.status === 402 && isApiRequest(input)) void response.clone().json().then(payload => { if (payload?.code === "LIMIT_REACHED") window.dispatchEvent(new CustomEvent("placeble:limit", { detail: payload })); }).catch(() => undefined);
      if (!isApiRequest(input) || url.includes("/auth/refresh") || response.status !== 401) return response;
      const payload = await response.clone().json().catch(() => null);
      if (payload?.code !== "ACCESS_EXPIRED") return response;

      const nextToken = await renewAccessToken();
      if (!nextToken) { endExpiredSession(); return response; }
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.set("Authorization", `Bearer ${nextToken}`);
      return nativeFetch(input, { ...init, headers });
    };

    return () => { window.fetch = nativeFetch; };
  }, [endExpiredSession, renewAccessToken]);
  const logout = () => {
    accessTokenRef.current = ""; setUser(null); setAccessToken(""); setSessionState(null); setSessionExpired(false);
    window.history.replaceState({}, "", "/login/student");
    void apiRequest("/auth/logout", { method: "POST", body: "{}" }).catch(() => undefined);
  };
  const authenticated = (nextUser: AuthUser, token: string) => {
    if (nextUser.status === "pending") { setPendingReason(nextUser.role === "recruiter" ? "company" : "institution"); setSessionState("pending"); return; }
    if (nextUser.status === "suspended") { setSessionState("suspended"); return; }
    setSessionExpired(false); setUser(nextUser); setAccessToken(token);
  };
  const returnToSignIn = () => {
    window.history.replaceState({}, "", "/login/student");
    document.title = "Dashboard | Placeble";
    setActivationRoute({ active: false, token: "" });
  };

  if (window.location.pathname === "/guardian-consent") return <GuardianConsentScreen />;
  if (window.location.pathname === "/terms" || window.location.pathname === "/privacy") return <LegalPage kind={window.location.pathname === "/terms" ? "terms" : "privacy"} />;
  if (checking) return <main className="auth-loading"><Brand /><span /><p>Preparing your workspace…</p></main>;
  if (["/reset-password", "/verify-email"].includes(window.location.pathname)) return <EmailActionScreen verify={window.location.pathname === "/verify-email"} onReturn={returnToSignIn} />;
  if (activationRoute.active) return <ActivationScreen token={activationRoute.token} onAuthenticated={(nextUser, token) => { setActivationRoute({ active: false, token: "" }); authenticated(nextUser, token); }} onReturnToSignIn={returnToSignIn} />;
  if (sessionState) return <SessionScreen type={sessionState} pendingReason={pendingReason} onLogout={logout} />;
  if (!user) return <AuthScreen sessionExpired={sessionExpired} onAuthenticated={authenticated} onCompanyPending={() => { setPendingReason("company"); setSessionState("pending"); }} onStudentPending={() => { setPendingReason("institution"); setSessionState("pending"); }} />;
  if (user.mustChangePassword) return <FirstLoginPasswordScreen user={user} accessToken={accessToken} onDone={authenticated} onLogout={logout} />;
  if (window.location.pathname === "/blog" || window.location.pathname.startsWith("/blog/")) return <BlogReaderPage accessToken={accessToken} />;
  if (user.role === "student" && !user.onboardingCompleted) return <OnboardingScreen user={user} accessToken={accessToken} onComplete={setUser} onLogout={logout} />;
  if (user.role === "student") return <StudentDashboard user={user} accessToken={accessToken} onLogout={logout} />;
  if (user.role === "platform_admin") return <AdminConsole user={user} accessToken={accessToken} onLogout={logout} />;
  if (user.role === "university_admin") return <UniversityDashboard user={{ name: user.name, email: user.email }} accessToken={accessToken} onLogout={logout} branding={user.branding} />;
  if (user.role === "principal") return <PrincipalDashboard user={{ name: user.name, email: user.email }} accessToken={accessToken} onLogout={logout} branding={user.branding} />;
  if (user.role === "tpo") return <TpoDashboard user={{ name: user.name, email: user.email, role: user.role }} accessToken={accessToken} onLogout={logout} branding={user.branding} />;
  return <ProfessionalRoleDashboard user={{ name: user.name, email: user.email, role: user.role }} accessToken={accessToken} onLogout={logout} />;
}
