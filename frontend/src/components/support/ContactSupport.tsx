import { AlertTriangle, CheckCircle2, LifeBuoy } from "lucide-react";
import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Modal, errorMessage, tpoApi } from "@/pages/tpo/tpo-core";
import "@/pages/tpo/tpo.css";

const TOPICS = [
  { id: "technical", label: "Something isn't working" },
  { id: "account", label: "Account and sign-in" },
  { id: "practice", label: "Practice agents and scores" },
  { id: "billing", label: "Plan and payments" },
  { id: "feedback", label: "Feedback or an idea" },
  { id: "other", label: "Something else" },
] as const;
const SUPPORT_EMAIL = "support@placeble.in";

/**
 * "Contact support" for any signed-in user: a sidebar button that opens a short form. The message goes to the Placeble team
 * by email (with the sender's name, email, role and college) and is kept on record. `page` is the screen they were on.
 */
export function ContactSupportButton({ accessToken, email, page = "", className = "tp-support" }: { accessToken: string; email: string; page?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <LifeBuoy size={18} aria-hidden="true" /><b>Contact support</b>
      </button>
      {open && createPortal(<div className="tp-support-scope"><ContactSupportDialog accessToken={accessToken} email={email} page={page} onClose={() => setOpen(false)} /></div>, document.body)}
    </>
  );
}

function ContactSupportDialog({ accessToken, email, page, onClose }: { accessToken: string; email: string; page: string; onClose: () => void }) {
  const [form, setForm] = useState({ topic: "technical", subject: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<{ reference: string } | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (form.subject.trim().length < 3) { setError("Add a short subject."); return; }
    if (form.message.trim().length < 15) { setError("Tell us a little more, at least a sentence."); return; }
    setBusy(true);
    try {
      const result = await tpoApi<{ reference: string }>("/support", accessToken, { method: "POST", json: { ...form, subject: form.subject.trim(), message: form.message.trim(), page } });
      setSent({ reference: result.reference });
    } catch (cause) { setError(errorMessage(cause, `We couldn't send that. Please try again, or email ${SUPPORT_EMAIL}.`)); }
    finally { setBusy(false); }
  };

  if (sent) return (
    <Modal title="Message sent" onClose={onClose}>
      <div className="tp-support-done">
        <CheckCircle2 size={36} aria-hidden="true" />
        <p>Thanks for writing to us. Our team will reply to <b>{email}</b>, usually within one working day.</p>
        <p className="tp-field-hint">Your reference is <b>#{sent.reference}</b>. Mention it if you write again.</p>
        <footer className="tp-modal-foot"><button type="button" className="tp-btn primary" onClick={onClose}>Done</button></footer>
      </div>
    </Modal>
  );

  return (
    <Modal title="Contact support" description={`Tell us what you need and our team will reply to ${email}.`} onClose={onClose}>
      <form className="tp-form" onSubmit={submit} noValidate>
        {error && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</div>}
        <div className="tp-field"><label htmlFor="sup-topic">What is it about?</label>
          <select id="sup-topic" value={form.topic} onChange={event => setForm({ ...form, topic: event.target.value })}>{TOPICS.map(topic => <option key={topic.id} value={topic.id}>{topic.label}</option>)}</select>
        </div>
        <div className="tp-field"><label htmlFor="sup-subject">Subject</label><input id="sup-subject" value={form.subject} maxLength={140} onChange={event => { setError(""); setForm({ ...form, subject: event.target.value }); }} placeholder="e.g. My interview score didn't save" autoComplete="off" /></div>
        <div className="tp-field"><label htmlFor="sup-message">Message <em>{form.message.trim().length}/3000</em></label><textarea id="sup-message" rows={6} maxLength={3000} value={form.message} onChange={event => { setError(""); setForm({ ...form, message: event.target.value }); }} placeholder="What happened, and what were you trying to do? The more detail, the faster we can help." /></div>
        <p className="tp-field-hint">Prefer email? Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
        <footer className="tp-modal-foot"><button type="button" className="tp-btn ghost" onClick={onClose}>Cancel</button><button type="submit" className="tp-btn primary" disabled={busy}>{busy ? "Sending…" : "Send message"}</button></footer>
      </form>
    </Modal>
  );
}
