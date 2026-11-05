import { CheckCircle2, MailX, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Brand, ThemeToggle, apiRequest } from "./auth-shared";
import "./onboarding.css";

type Phase = "loading" | "ask" | "granted" | "declined" | "invalid";

/** Public page a parent or guardian opens from the email. No sign-in needed. */
export function GuardianConsentScreen() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [phase, setPhase] = useState<Phase>(token ? "loading" : "invalid");
  const [info, setInfo] = useState({ studentName: "", guardianName: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Guardian permission | Placeble";
    if (!token) return;
    let live = true;
    void apiRequest(`/onboarding/guardian?token=${encodeURIComponent(token)}`)
      .then(({ payload }) => { if (live) { setInfo(payload); setPhase("ask"); } })
      .catch(() => { if (live) setPhase("invalid"); });
    return () => { live = false; };
  }, [token]);

  const respond = async (decision: "grant" | "decline") => {
    setBusy(true); setError("");
    try { await apiRequest("/onboarding/guardian", { method: "POST", body: JSON.stringify({ token, decision }) }); setPhase(decision === "grant" ? "granted" : "declined"); window.history.replaceState({}, "", window.location.pathname); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  };

  return (
    <main className="ob-page">
      <header className="ob-top"><Brand /><div><ThemeToggle className="ax-theme" /></div></header>
      <section className="ob-card narrow">
        {phase === "loading" && <p className="ob-hint" role="status">One moment…</p>}
        {phase === "invalid" && (<><span className="ob-badge warn" aria-hidden="true"><MailX size={26} /></span><h1>This link isn’t valid</h1><p>It may have expired or already been used. Ask the student to send you a new one from their Placeble setup screen.</p></>)}
        {phase === "ask" && (<>
          <span className="ob-badge" aria-hidden="true"><ShieldCheck size={26} /></span>
          <h1>Permission for {info.studentName}</h1>
          <p>{info.guardianName ? `Hello ${info.guardianName}. ` : ""}<strong>{info.studentName}</strong> is under 18 and has signed up for Placeble, a career-preparation platform with resume help, mock interviews and aptitude practice.</p>
          <ul className="ob-list">
            <li>We store their name, email, profile, practice results and readiness scores.</li>
            <li>If their college uses Placeble, the placement team there can see their progress.</li>
            <li>We never sell personal information, and you can ask us to delete their account at any time.</li>
          </ul>
          <p>Do you give permission for {info.studentName} to use Placeble?</p>
          {error && <p className="ob-alert" role="alert">{error}</p>}
          <div className="ob-actions"><button type="button" className="ob-primary" disabled={busy} onClick={() => void respond("grant")}>Yes, I give permission</button><button type="button" className="ob-secondary" disabled={busy} onClick={() => void respond("decline")}>No, I don’t</button></div>
          <p className="ob-hint">By agreeing you accept Placeble’s <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a> on their behalf.</p>
        </>)}
        {phase === "granted" && (<><span className="ob-badge ok" aria-hidden="true"><CheckCircle2 size={26} /></span><h1>Thank you</h1><p>Permission recorded. {info.studentName} can now start using Placeble. You can close this page.</p></>)}
        {phase === "declined" && (<><span className="ob-badge warn" aria-hidden="true"><MailX size={26} /></span><h1>Permission declined</h1><p>We’ve recorded your answer. {info.studentName} won’t be able to use Placeble. You can close this page.</p></>)}
      </section>
    </main>
  );
}
