import { ArrowRight, CheckCircle2, MailCheck, MailX } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiRequest } from "./auth-shared";
import { Alert, AuthHeading, AuthShell, PasswordField, SubmitButton, passwordMeetsRules } from "./auth-ui";

/** Landing page for the links in verification and password-reset emails. */
export function EmailActionScreen({ verify, onReturn }: { verify: boolean; onReturn: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [touched, setTouched] = useState(false);
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const tokenValid = token.length >= 20;
  const autoStarted = useRef(false);

  const run = async (extra: Record<string, string> = {}) => {
    setBusy(true); setError("");
    try {
      const { payload } = await apiRequest(`/auth/${verify ? "verify-email" : "reset-password"}`, { method: "POST", body: JSON.stringify({ token, ...extra }) });
      setNotice(payload.message);
      window.history.replaceState({}, "", window.location.pathname);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Please try again."); }
    finally { setBusy(false); }
  };

  // Verification links confirm automatically; no extra click needed.
  useEffect(() => {
    document.title = `${verify ? "Verify your email" : "Reset your password"} | Placeble`;
    if (verify && tokenValid && !autoStarted.current) { autoStarted.current = true; void run(); }
  }, [verify]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitReset = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!passwordMeetsRules(password)) return;
    if (password !== confirmation) { setError("Passwords do not match."); return; }
    void run({ password });
  };

  if (verify) {
    return (
      <AuthShell>
        <div className="ax-sent" role="status" aria-live="polite">
          <span aria-hidden="true" style={error || !tokenValid ? { background: "var(--ax-danger-bg)", color: "var(--ax-danger)" } : undefined}>{error || !tokenValid ? <MailX size={26} /> : notice ? <CheckCircle2 size={26} /> : <MailCheck size={26} />}</span>
          <h2>{notice ? "Email verified" : error || !tokenValid ? "Link not valid" : "Verifying your email…"}</h2>
          <p>{notice ? notice : error ? error : !tokenValid ? "This verification link is incomplete. Open the full link from your email, or request a new one from the sign-in page." : "One moment while we confirm your address."}</p>
          {(notice || error || !tokenValid) && <button type="button" className="ax-submit" onClick={onReturn}>Continue to sign in <ArrowRight size={18} aria-hidden="true" /></button>}
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      {notice ? (
        <div className="ax-sent" role="status">
          <span aria-hidden="true"><CheckCircle2 size={26} /></span>
          <h2>Password updated</h2>
          <p>{notice}</p>
          <button type="button" className="ax-submit" onClick={onReturn}>Continue to sign in <ArrowRight size={18} aria-hidden="true" /></button>
        </div>
      ) : (
        <>
          <AuthHeading kicker="Account security" title="Choose a new password">Pick a strong, unique password for your Placeble account.</AuthHeading>
          <form className="ax-form" onSubmit={submitReset} noValidate>
            {!tokenValid && <Alert tone="error">This reset link is incomplete. Request a new one from the sign-in page.</Alert>}
            {error && <Alert tone="error">{error}</Alert>}
            <PasswordField label="New password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" error={touched && !passwordMeetsRules(password) ? "Use at least 8 characters with an uppercase letter, a lowercase letter, and a number." : ""} rules required />
            <PasswordField label="Confirm password" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="new-password" required />
            <SubmitButton loading={busy} loadingText="Updating…" disabled={!tokenValid}>Update password<ArrowRight size={18} aria-hidden="true" /></SubmitButton>
            <button type="button" className="ax-link" onClick={onReturn}>Back to sign in</button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
