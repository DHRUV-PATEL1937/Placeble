import { ArrowLeft, ArrowRight, Building2, CircleUserRound, Mail, MailCheck } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { cleanNameInput, EMAIL_RE, nameProblem } from "@/services/validation";
import { apiRequest, type AuthUser } from "./auth-shared";
import { Alert, AuthHeading, AuthShell, Field, PasswordField, SubmitButton, passwordMeetsRules } from "./auth-ui";

const EMAIL_PATTERN = EMAIL_RE;

function friendlyError(cause: unknown) {
  if (cause instanceof DOMException && cause.name === "AbortError") return "The request timed out. Check your connection and try again.";
  if (cause instanceof TypeError) return "We couldn’t reach Placeble. Check your connection and try again.";
  return cause instanceof Error ? cause.message : "Could not submit this request.";
}

export function AccessRequestScreen({ mode, onBack, onAuthenticated, onPending }: { mode: "institution" | "recruiter"; onBack: () => void; onAuthenticated: (user: AuthUser, accessToken: string) => void; onPending: () => void }) {
  const institution = mode === "institution";
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = `${institution ? "Register your institution" : "Register your company"} | Placeble`;
    firstField.current?.focus();
  }, [institution]);

  const touch = (key: string) => setTouched(current => ({ ...current, [key]: true }));
  const nameError = touched.name ? nameProblem(name) : "";
  const orgError = touched.org && organizationName.trim().length < 2 ? `Enter your ${institution ? "institution" : "company"} name.` : "";
  const emailError = touched.email && !EMAIL_PATTERN.test(email.trim()) ? (email.trim() ? "Enter a valid work email address." : "Enter your work email.") : "";
  const passwordError = touched.password && !passwordMeetsRules(password) ? "Use at least 8 characters with an uppercase letter, a lowercase letter, and a number." : "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched({ name: true, org: true, email: true, password: true });
    setError(""); setNotice("");
    if (nameProblem(name) || organizationName.trim().length < 2 || !EMAIL_PATTERN.test(email.trim())) return;
    if (!institution && !passwordMeetsRules(password)) return;
    setLoading(true);
    try {
      if (institution) {
        const { payload } = await apiRequest("/auth/institution-leads", { method: "POST", body: JSON.stringify({ institutionName: organizationName.trim(), contactName: name.trim(), workEmail: email.trim(), note }) });
        setNotice(payload.message);
      } else {
        const { response, payload } = await apiRequest("/auth/recruiter-register", { method: "POST", body: JSON.stringify({ name: name.trim(), companyName: organizationName.trim(), email: email.trim(), password }) });
        if (response.status === 202) onPending(); else onAuthenticated(payload.user, payload.accessToken);
      }
    } catch (cause) { setError(friendlyError(cause)); }
    finally { setLoading(false); }
  };

  return (
    <AuthShell variant={mode}>
      <button type="button" className="ax-back" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> Back to sign in</button>

      {notice ? (
        <div className="ax-sent" role="status">
          <span aria-hidden="true"><MailCheck size={26} /></span>
          <h2>Request received</h2>
          <p>{notice}</p>
          <p className="ax-sent-to">We’ll reach out to <strong>{email.trim()}</strong>. Submitting this form never creates a workspace automatically.</p>
          <button type="button" className="ax-secondary" onClick={onBack}>Return to sign in</button>
        </div>
      ) : (
        <>
          <AuthHeading kicker={institution ? "Institution enquiry" : "Recruiter registration"} title={institution ? "Talk to our institution team" : "Register your company"}>
            {institution ? "Tell us about your college. This starts a conversation with our team; it never creates a workspace automatically." : "Use your work email so we can review your company domain securely. Verification happens once."}
          </AuthHeading>

          <form className="ax-form" onSubmit={submit} noValidate>
            {error && <Alert tone="error">{error}</Alert>}
            <Field label="Your full name" icon={CircleUserRound} inputRef={firstField} value={name} onChange={event => setName(cleanNameInput(event.target.value))} onBlur={() => touch("name")} error={nameError} autoComplete="name" maxLength={80} required />
            <Field label={institution ? "Institution name" : "Company name"} icon={Building2} value={organizationName} onChange={event => setOrganizationName(event.target.value.replace(/[^\p{L}\p{N} &.,'’()-]/gu, "").slice(0, 120))} onBlur={() => touch("org")} error={orgError} autoComplete="organization" required />
            <Field label="Work email" icon={Mail} type="email" inputMode="email" value={email} onChange={event => setEmail(event.target.value)} onBlur={() => touch("email")} error={emailError} placeholder={institution ? "you@college.edu" : "you@company.com"} autoComplete="email" autoCapitalize="none" spellCheck={false} required />

            {institution ? (
              <div className="ax-field">
                <label htmlFor="ax-note">What should we know?<em>Optional</em></label>
                <textarea id="ax-note" className="ax-textarea" rows={3} maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder="Student count, placement team size, or preferred timeline" />
              </div>
            ) : (
              <PasswordField label="Create password" value={password} onChange={event => setPassword(event.target.value)} onBlur={() => touch("password")} error={passwordError} autoComplete="new-password" rules required />
            )}

            <SubmitButton loading={loading} loadingText="Submitting securely…">
              {institution ? "Request onboarding" : "Submit registration"}<ArrowRight size={18} aria-hidden="true" />
            </SubmitButton>
          </form>
        </>
      )}
    </AuthShell>
  );
}
