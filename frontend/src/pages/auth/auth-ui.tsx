import {
  AlertCircle,
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  Mic2,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Building2,
  FileCheck2,
  type LucideIcon,
} from "lucide-react";
import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Brand, ThemeToggle } from "./auth-shared";

export type StoryVariant = "student" | "institution" | "recruiter";

const STORIES: Record<StoryVariant, { kicker: string; title: string; body: string; points: { icon: LucideIcon; title: string; text: string }[] }> = {
  student: {
    kicker: "For students",
    title: "Small steps today. A stronger start tomorrow.",
    body: "Practice what matters, see how far you’ve come, and get ready for the opportunity that fits you.",
    points: [
      { icon: Target, title: "A plan built around your goals", text: "Skills, practice, and opportunities moving in one direction." },
      { icon: Mic2, title: "Interview and aptitude practice", text: "Rehearse in a live Interview Room and get instant feedback." },
      { icon: BarChart3, title: "Readiness you can measure", text: "Track your progress and know what to work on next." },
    ],
  },
  institution: {
    kicker: "For institutions",
    title: "One workspace for your entire placement season.",
    body: "Every college receives a fully isolated tenant, configured with approved domains and a secure first-admin activation.",
    points: [
      { icon: Building2, title: "Isolated tenant per college", text: "Your data and your students stay inside your workspace." },
      { icon: Users, title: "Rosters, drives, and approvals", text: "Manage placement cells, faculty, and student access in one place." },
      { icon: ShieldCheck, title: "Role-aware by design", text: "TPOs, faculty, and recruiters each see exactly what they should." },
    ],
  },
  recruiter: {
    kicker: "For recruiters",
    title: "Verify once. Build trusted campus relationships.",
    body: "Register with your company email. Placeble verifies the organization once; each institution still controls access to every drive.",
    points: [
      { icon: FileCheck2, title: "One-time company verification", text: "Reviewed against your work-email domain." },
      { icon: BriefcaseBusiness, title: "Drive-by-drive access", text: "Colleges approve who can reach their students." },
      { icon: ShieldCheck, title: "Trusted by institutions", text: "A verified network keeps campus hiring safe." },
    ],
  },
};

export function AuthShell({ variant = "student", children }: { variant?: StoryVariant; children: ReactNode }) {
  const story = STORIES[variant];
  return (
    <main className="ax-page">
      <aside className="ax-story" aria-label="About Placeble">
        <div className="ax-story-glow" aria-hidden="true" />
        <img className="ax-story-logo" src="/placeble-logo-horizontal-reversed.svg" alt="Placeble" />
        <div className="ax-story-body">
          <span className="ax-pill"><Sparkles size={13} aria-hidden="true" /> {story.kicker}</span>
          <h1>{story.title}</h1>
          <p>{story.body}</p>
          <ul className="ax-points">
            {story.points.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <span aria-hidden="true"><Icon size={18} /></span>
                <div><strong>{title}</strong><small>{text}</small></div>
              </li>
            ))}
          </ul>
        </div>
        <footer className="ax-story-foot">
          <span><ShieldCheck size={14} aria-hidden="true" /> Secure, role-aware access</span>
          <span>© {new Date().getFullYear()} Placeble</span>
        </footer>
      </aside>

      <section className="ax-panel">
        <header className="ax-panel-top">
          <Brand />
          <ThemeToggle className="ax-theme" />
        </header>
        <div className="ax-panel-main">{children}</div>
        <p className="ax-legal">By continuing, you agree to Placeble’s <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</p>
      </section>
    </main>
  );
}

export function AuthHeading({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return <header className="ax-heading"><span className="ax-kicker">{kicker}</span><h2>{title}</h2>{children && <p>{children}</p>}</header>;
}

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label: string;
  icon?: LucideIcon;
  error?: string;
  hint?: ReactNode;
  optionalTag?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  trailing?: ReactNode;
};

export function Field({ label, icon: Icon, error, hint, optionalTag, inputRef, trailing, id, ...rest }: FieldProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  const describedBy = [error ? `${fieldId}-err` : "", hint ? `${fieldId}-hint` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`ax-field${error ? " has-error" : ""}`}>
      <label htmlFor={fieldId}>{label}{optionalTag && <em>Optional</em>}</label>
      <div className="ax-control">
        {Icon && <Icon size={18} aria-hidden="true" className="ax-control-icon" />}
        <input id={fieldId} ref={inputRef} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest} />
        {trailing}
      </div>
      {error && <p className="ax-field-error" id={`${fieldId}-err`}><AlertCircle size={14} aria-hidden="true" />{error}</p>}
      {hint && !error && <p className="ax-field-hint" id={`${fieldId}-hint`}>{hint}</p>}
    </div>
  );
}

export function PasswordField({ label = "Password", error, rules, value, onKeyEvent, ...rest }: Omit<FieldProps, "icon" | "type" | "trailing" | "label"> & { label?: string } & { rules?: boolean; value: string; onKeyEvent?: (event: React.KeyboardEvent<HTMLInputElement>) => void }) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  return (
    <div>
      <Field
        {...rest}
        label={label}
        icon={LockKeyhole}
        value={value}
        error={error}
        type={visible ? "text" : "password"}
        onKeyDown={event => { setCapsLock(event.getModifierState?.("CapsLock") ?? false); onKeyEvent?.(event); }}
        onKeyUp={event => setCapsLock(event.getModifierState?.("CapsLock") ?? false)}
        onBlur={event => { setCapsLock(false); rest.onBlur?.(event); }}
        trailing={<button type="button" className="ax-reveal" onClick={() => setVisible(current => !current)} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>}
      />
      {capsLock && <p className="ax-caps" role="status"><AlertCircle size={13} aria-hidden="true" /> Caps Lock is on</p>}
      {rules && <PasswordRules password={value} />}
    </div>
  );
}

export const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (value: string) => value.length >= 8 },
  { label: "One uppercase letter", test: (value: string) => /[A-Z]/.test(value) },
  { label: "One lowercase letter", test: (value: string) => /[a-z]/.test(value) },
  { label: "One number", test: (value: string) => /[0-9]/.test(value) },
];

export const passwordMeetsRules = (value: string) => PASSWORD_RULES.every(rule => rule.test(value));

export function PasswordRules({ password }: { password: string }) {
  const passed = PASSWORD_RULES.filter(rule => rule.test(password)).length;
  const label = passed === 0 ? "" : passed < 3 ? "Weak" : passed < 4 ? "Almost there" : "Strong";
  return (
    <div className="ax-rules" aria-live="polite">
      <div className="ax-meter" aria-hidden="true">{PASSWORD_RULES.map((rule, index) => <i key={rule.label} className={index < passed ? `on s${passed}` : ""} />)}</div>
      <ul>
        {PASSWORD_RULES.map(rule => {
          const ok = rule.test(password);
          return <li key={rule.label} className={ok ? "ok" : ""}><span aria-hidden="true">{ok && <Check size={11} strokeWidth={3} />}</span>{rule.label}<span className="ax-sr">{ok ? " — met" : " — not met"}</span></li>;
        })}
      </ul>
      {label && <p className="ax-strength-label">Strength: <strong>{label}</strong></p>}
    </div>
  );
}

export function Alert({ tone, children, action }: { tone: "error" | "success" | "info"; children: ReactNode; action?: ReactNode }) {
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;
  return <div className={`ax-alert ${tone}`} role={tone === "error" ? "alert" : "status"}><Icon size={18} aria-hidden="true" /><div><span>{children}</span>{action}</div></div>;
}

export function SubmitButton({ loading, loadingText, children, disabled }: { loading: boolean; loadingText: string; children: ReactNode; disabled?: boolean }) {
  return <button type="submit" className="ax-submit" disabled={loading || disabled} aria-busy={loading}>{loading ? <><span className="ax-spinner" aria-hidden="true" />{loadingText}</> : children}</button>;
}
