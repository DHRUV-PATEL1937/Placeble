"use client";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Eye,
  EyeOff,
  GraduationCap,
  LockKeyhole,
  Mail,
  Menu,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { PlacebleDashboard } from "./placeble-dashboard";
import { ProfessionalRoleDashboard } from "./professional-role-dashboard";

type Role = "student" | "tpo" | "recruiter" | "faculty";
type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "pending" | "active" | "suspended";
  emailVerified: boolean;
  institutionId: string | null;
  onboardingCompleted: boolean;
  destination: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
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

async function apiRequest(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok && response.status !== 202) {
    const error = new Error(payload?.message ?? "Something went wrong. Please try again.") as Error & { code?: string; status?: number };
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

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: AuthUser, accessToken: string) => void }) {
  const [view, setView] = useState<"login" | "signup" | "forgot">("login");
  const [portal, setPortal] = useState<"student" | "institution">("student");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const title = view === "signup" ? "Start building your readiness." : view === "forgot" ? "Reset your password." : portal === "student" ? "Welcome back." : "Institution access.";
  const helper = view === "signup" ? "Create your student account. You’ll complete your profile next." : view === "forgot" ? "Enter your account email and we’ll send recovery instructions." : portal === "student" ? "Sign in to continue your placement preparation." : "Sign in with the email invited by your institution.";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true); setError(""); setNotice("");
    try {
      if (view === "forgot") {
        const { payload } = await apiRequest("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
        setNotice(payload.message + (payload.delivery === "provider_not_configured" ? " Email delivery will activate when a provider is configured." : ""));
      } else {
        const path = view === "signup" ? "/auth/register" : "/auth/login";
        const body = view === "signup" ? { name, email, password } : { email, password, portal };
        const { response, payload } = await apiRequest(path, { method: "POST", body: JSON.stringify(body) });
        if (response.status === 202 && payload.code === "ACCOUNT_PENDING") {
          throw Object.assign(new Error("Your account is awaiting institution verification. We’ll notify you when access is approved."), { code: "ACCOUNT_PENDING" });
        }
        onAuthenticated(payload.user, payload.accessToken);
      }
    } catch (submitError) {
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

  return <main className="auth-page">
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
          {notice && <div className="auth-message success"><CheckCircle2 size={17} /><span>{notice}</span></div>}
          <button className="auth-submit" disabled={loading}>{loading ? <><span className="button-spinner" /> Please wait</> : <>{view === "signup" ? "Create student account" : view === "forgot" ? "Send recovery email" : "Sign in securely"}<ArrowRight size={17} /></>}</button>
        </form>

        {view !== "forgot" && <>
          <div className="auth-divider"><span>or</span></div>
          <button type="button" className="google-button" onClick={() => setNotice("Google sign-in is ready for provider credentials. Use email and password for the local demo.")} title="Add Google OAuth credentials to enable"><span>G</span> Continue with Google <small>Setup needed</small></button>
        </>}

        {view === "login" && <button className="portal-toggle" onClick={() => { setPortal(portal === "student" ? "institution" : "student"); setError(""); }}>
          {portal === "student" ? <><Building2 size={16} /> Sign in as institution, recruiter, or faculty</> : <><GraduationCap size={16} /> Return to student sign in</>}<ChevronRight size={15} />
        </button>}

        {view === "login" && portal === "student" && <p className="auth-switch">New to Placeble? <button onClick={() => { setView("signup"); setError(""); }}>Create a student account</button></p>}

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

const roleContent = {
  tpo: {
    eyebrow: "Institution command centre", title: "Good morning, Dr. Meera.", subtitle: "Your 2027 cohort is moving steadily toward placement readiness.", nav: ["Overview", "Students", "Drives", "Invitations", "Analytics"], stats: [["Cohort readiness", "68", "+4 this month"], ["Placement-ready", "128", "42% of cohort"], ["Active drives", "4", "2 this week"], ["At-risk students", "18", "Needs attention"]],
  },
  recruiter: {
    eyebrow: "Drive workspace", title: "Welcome back, Nisha.", subtitle: "Review the strongest candidates for the August campus drive.", nav: ["Overview", "Candidates", "Shortlist", "Interviews"], stats: [["Matched candidates", "86", "For this drive"], ["Shortlisted", "18", "6 awaiting review"], ["Interviews", "8", "Next on 14 Aug"], ["Avg. readiness", "76", "Shortlisted cohort"]],
  },
  faculty: {
    eyebrow: "Read-only cohort view", title: "Your cohort, clearly in view.", subtitle: "Spot stalled progress early and guide students toward the right support.", nav: ["Cohort", "At-risk", "Progress"], stats: [["Students", "64", "CSE 2027"], ["On track", "46", "72% of cohort"], ["Needs support", "12", "3 newly flagged"], ["No activity", "6", "Past 14 days"]],
  },
};

export function LegacyRoleDashboard({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const role = user.role as "tpo" | "recruiter" | "faculty";
  const content = roleContent[role];
  const [nav, setNav] = useState(content.nav[0]);
  return <div className="role-shell">
    <aside className="role-sidebar"><Brand /><nav>{content.nav.map((item, index) => <button key={item} className={nav === item ? "active" : ""} onClick={() => setNav(item)}>{index === 0 ? <BarChart3 size={18} /> : index === 1 ? <UsersRound size={18} /> : index === 2 ? <CalendarDays size={18} /> : <Send size={18} />}{item}</button>)}</nav><div className="role-scope"><ShieldCheck size={17} /><div><strong>{role === "recruiter" ? "Drive-scoped access" : role === "faculty" ? "Read-only access" : "Institution-scoped"}</strong><span>TechEnd Institute of Technology</span></div></div><button className="role-user" onClick={onLogout}><span>{user.name.split(" ").map(item => item[0]).slice(0,2).join("")}</span><div><strong>{user.name}</strong><small>Sign out</small></div></button></aside>
    <main className="role-main"><header className="role-topbar"><button className="role-menu"><Menu size={19} /></button><div className="role-search"><Search size={17} /><span>Search {role === "tpo" ? "students and drives" : role === "recruiter" ? "candidates" : "cohort"}</span></div><div className="role-context"><Building2 size={16} /><span>TechEnd Institute</span></div></header><div className="role-content"><section className="role-hero"><div><p>{content.eyebrow}</p><h1>{content.title}</h1><span>{content.subtitle}</span></div>{role !== "faculty" && <button><UserPlus size={17} />{role === "tpo" ? "Invite member" : "Build shortlist"}</button>}</section>{role === "faculty" && <div className="read-only-banner"><Eye size={17} /><span><strong>Read-only mentor view.</strong> Your account can review progress but cannot change student or drive data.</span></div>}<section className="role-stats">{content.stats.map(([label,value,detail], index) => <article key={label}><span className={`role-stat-icon tone-${index}`}>{index === 0 ? <TrendingUp size={19} /> : index === 1 ? <UsersRound size={19} /> : index === 2 ? <CalendarDays size={19} /> : <AlertCircle size={19} />}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>)}</section><section className="role-grid"><article className="role-panel role-table"><header><div><p>{role === "recruiter" ? "Recommended candidates" : role === "faculty" ? "Students needing support" : "Cohort overview"}</p><span>Updated from the latest readiness signals</span></div><button>View all <ArrowRight size={15} /></button></header><div className="role-table-head"><span>Student</span><span>Readiness</span><span>Trend</span><span>Status</span></div>{[["Ananya Rao","82","+6","Ready"],["Kabir Singh","71","+2","On track"],["Ishita Das","58","0","Stalled"],["Rohan Patel","46","-2","At risk"]].map(([name,score,trend,status]) => <div className="role-table-row" key={name}><span><i>{name.split(" ").map(part => part[0]).join("")}</i><b>{name}<small>CSE · 2027</small></b></span><span><strong>{score}</strong><i className="tiny-progress"><b style={{ width: `${score}%` }} /></i></span><span className={trend.startsWith("-") ? "negative" : "positive"}>{trend}</span><span><em className={`status-${status.toLowerCase().replace(" ", "-")}`}>{status}</em></span></div>)}</article><aside className="role-panel role-action"><span className="role-action-icon"><Sparkles size={20} /></span><p>{role === "tpo" ? "Recommended action" : role === "recruiter" ? "Shortlist insight" : "Mentor focus"}</p><h3>{role === "tpo" ? "18 students have stalled this fortnight." : role === "recruiter" ? "12 candidates meet every core skill." : "Check in with six inactive students."}</h3><span>{role === "faculty" ? "Their preparation activity has been quiet for 14 days." : "A focused review can help move the cohort forward."}</span><button>{role === "faculty" ? "View students" : "Review now"}<ArrowRight size={15} /></button></aside></section></div></main>
  </div>;
}

function SessionScreen({ type, onLogout }: { type: "pending" | "suspended"; onLogout: () => void }) {
  return <main className="session-state"><Brand /><section><span className={type}><Clock3 size={24} /></span><p className="auth-form-kicker">Account status</p><h1>{type === "pending" ? "Your account is awaiting verification." : "This account is suspended."}</h1><p>{type === "pending" ? "Your institution details are being reviewed. You’ll receive access as soon as verification is complete." : "Contact your Placeble administrator or support team to review your account status."}</p><button className="button button-secondary" onClick={onLogout}>Return to sign in</button></section></main>;
}

export function PlacebleApp() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [checking, setChecking] = useState(true);
  const [sessionState, setSessionState] = useState<"pending" | "suspended" | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest("/auth/refresh", { method: "POST", body: "{}" })
      .then(({ payload }) => { if (active) { setUser(payload.user); setAccessToken(payload.accessToken); } })
      .catch(() => undefined)
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  const logout = async () => {
    await apiRequest("/auth/logout", { method: "POST", body: "{}" }).catch(() => undefined);
    setUser(null); setAccessToken(""); setSessionState(null);
  };
  const authenticated = (nextUser: AuthUser, token: string) => {
    if (nextUser.status === "pending") { setSessionState("pending"); return; }
    if (nextUser.status === "suspended") { setSessionState("suspended"); return; }
    setUser(nextUser); setAccessToken(token);
  };

  if (checking) return <main className="auth-loading"><Brand /><span /><p>Preparing your workspace…</p></main>;
  if (sessionState) return <SessionScreen type={sessionState} onLogout={logout} />;
  if (!user) return <AuthScreen onAuthenticated={authenticated} />;
  if (user.role === "student" && !user.onboardingCompleted) return <Onboarding user={user} accessToken={accessToken} onComplete={setUser} onLogout={logout} />;
  if (user.role === "student") return <PlacebleDashboard user={user} onLogout={logout} />;
  return <ProfessionalRoleDashboard user={{ name: user.name, email: user.email, role: user.role }} accessToken={accessToken} onLogout={logout} />;
}
