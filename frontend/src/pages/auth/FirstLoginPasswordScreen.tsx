import { ArrowRight, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { apiRequest, type AuthUser } from "./auth-shared";
import { Alert, AuthHeading, AuthShell, PasswordField, SubmitButton, passwordMeetsRules } from "./auth-ui";

/** Shown once, right after a student first signs in with the temporary password from their invitation email. */
export function FirstLoginPasswordScreen({ user, accessToken, onDone, onLogout }: { user: AuthUser; accessToken: string; onDone: (user: AuthUser, accessToken: string) => void; onLogout: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { document.title = "Choose your password | Placeble"; }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setTouched(true); setError("");
    if (!current) { setError("Enter the temporary password from your email."); return; }
    if (!passwordMeetsRules(next)) return;
    if (next !== confirm) { setError("The new passwords don’t match."); return; }
    if (next === current) { setError("Choose a password different from the temporary one."); return; }
    setBusy(true);
    try {
      const { payload } = await apiRequest("/auth/change-password", { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      onDone(payload.user, payload.accessToken);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not change your password."); }
    finally { setBusy(false); }
  };

  return (
    <AuthShell variant="student">
      <AuthHeading kicker="One quick step" title={`Welcome, ${user.name.split(" ")[0]}`}>Choose your own password to finish setting up your account. You’ll use it every time you sign in.</AuthHeading>
      <form className="ax-form" onSubmit={submit} noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <PasswordField label="Temporary password" value={current} onChange={event => setCurrent(event.target.value)} autoComplete="current-password" placeholder="From your invitation email" required />
        <PasswordField label="New password" value={next} onChange={event => setNext(event.target.value)} autoComplete="new-password" error={touched && !passwordMeetsRules(next) ? "Use at least 8 characters with an uppercase letter, a lowercase letter, and a number." : ""} rules required />
        <PasswordField label="Confirm new password" value={confirm} onChange={event => setConfirm(event.target.value)} autoComplete="new-password" required />
        <SubmitButton loading={busy} loadingText="Saving…">Save password &amp; continue<ArrowRight size={18} aria-hidden="true" /></SubmitButton>
        <button type="button" className="ax-link" onClick={onLogout} style={{ justifySelf: "center" }}>Sign out</button>
      </form>
      <p className="ax-switch"><ShieldCheck size={14} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> Your temporary password stops working once you save a new one.</p>
    </AuthShell>
  );
}
