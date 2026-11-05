import { AlertTriangle, Clock } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Modal, errorMessage, formatDate, tpoApi } from "@/pages/tpo/tpo-core";
import "@/pages/tpo/tpo.css";

type Request = { id: string; status: "pending" | "approved" | "rejected" | "cancelled"; reason: string; reviewNote: string; requestedAt: string; decidedAt: string | null };

/**
 * "Delete my account" for every sign-in. It only sends a request: a superadmin reviews it,
 * and nothing is removed until they approve. Rendered inside each workspace's account / sign-out dialog.
 */
export function DeleteAccountRequest({ accessToken, className = "tp-btn ghost danger" }: { accessToken: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>Request account deletion</button>
      {open && <DeleteAccountDialog accessToken={accessToken} onClose={() => setOpen(false)} />}
    </>
  );
}

function DeleteAccountDialog({ accessToken, onClose }: { accessToken: string; onClose: () => void }) {
  const [current, setCurrent] = useState<Request | null | undefined>(undefined);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    tpoApi<{ request: Request | null }>("/account/deletion-request", accessToken)
      .then(payload => { if (live) setCurrent(payload.request); })
      .catch(cause => { if (live) { setCurrent(null); setError(errorMessage(cause)); } });
    return () => { live = false; };
  }, [accessToken]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    try { const payload = await tpoApi<{ request: Request }>("/account/deletion-request", accessToken, { method: "POST", json: { reason: reason.trim() } }); setCurrent(payload.request); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  const cancel = async () => {
    setBusy(true); setError("");
    try { const payload = await tpoApi<{ request: Request }>("/account/deletion-request", accessToken, { method: "DELETE" }); setCurrent(payload.request); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };

  const pending = current?.status === "pending";
  return (
    <Modal title={pending ? "Deletion request sent" : "Delete your account?"} description={pending ? undefined : "Ask us to permanently delete your Placeble account."} onClose={onClose}>
      {current === undefined ? <p className="tp-sub" role="status">Loading…</p> : pending ? (
        <div className="tp-form">
          <div className="tp-alert warn" role="status"><Clock size={16} aria-hidden="true" />Waiting for review since {formatDate(current.requestedAt)}. You can keep using Placeble until it’s approved.</div>
          {error && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</div>}
          <footer className="tp-modal-foot"><button type="button" className="tp-btn ghost" onClick={onClose}>Close</button><button type="button" className="tp-btn danger" disabled={busy} onClick={() => void cancel()}>{busy ? "Cancelling…" : "Cancel my request"}</button></footer>
        </div>
      ) : (
        <form className="tp-form" onSubmit={submit}>
          {current?.status === "rejected" && <div className="tp-alert warn" role="status"><AlertTriangle size={16} aria-hidden="true" />Your last request was declined{current.reviewNote ? `: ${current.reviewNote}` : "."}</div>}
          <div className="tp-alert warn" role="note"><AlertTriangle size={16} aria-hidden="true" />If it’s approved, you’ll be signed out, your account is closed and your name, email and profile are removed. This can’t be undone.</div>
          <div className="tp-field"><label htmlFor="del-reason">Why are you leaving? <em>Optional</em></label><textarea id="del-reason" rows={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder="Tell us so we can improve" /></div>
          {error && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</div>}
          <footer className="tp-modal-foot"><button type="button" className="tp-btn ghost" onClick={onClose}>Keep my account</button><button type="submit" className="tp-btn danger-solid" disabled={busy}>{busy ? "Sending…" : "Request deletion"}</button></footer>
        </form>
      )}
    </Modal>
  );
}
