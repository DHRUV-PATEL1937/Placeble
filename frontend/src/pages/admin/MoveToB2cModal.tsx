import { AlertTriangle, Search } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Avatar, Modal, errorMessage, tpoApi } from "@/pages/tpo/tpo-core";
import "@/pages/tpo/tpo.css";

type Found = { id: string; name: string; email: string; status: string; institution: string };

/** Superadmin: pick any institute student, from any college or university, and make them a direct (B2C) student. */
export function MoveToB2cModal({ accessToken, onClose, onDone }: { accessToken: string; onClose: () => void; onDone: (name: string) => void }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Found | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2 || picked) { setResults([]); return; }
    let live = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      tpoApi<{ students: Found[] }>(`/platform-admin/direct-students/institute-students?search=${encodeURIComponent(term)}`, accessToken)
        .then(payload => { if (live) setResults(payload.students); })
        .catch(cause => { if (live) setError(errorMessage(cause)); })
        .finally(() => { if (live) setSearching(false); });
    }, 300);
    return () => { live = false; window.clearTimeout(timer); };
  }, [search, picked, accessToken]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!picked || reason.trim().length < 3) return;
    setBusy(true); setError("");
    try { await tpoApi("/platform-admin/direct-students/convert", accessToken, { method: "POST", json: { studentId: picked.id, reason: reason.trim() } }); onDone(picked.name); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Make a student B2C" description="Move a student out of their college so Placeble manages them directly." onClose={onClose}>
      <form className="tp-form" onSubmit={submit}>
        {!picked ? (
          <>
            <div className="tp-field"><label htmlFor="b2c-search">Find a student</label>
              <label className="tp-search"><Search size={16} aria-hidden="true" /><input id="b2c-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or email, from any college" autoComplete="off" /></label>
            </div>
            {searching && <p className="tp-sub" role="status">Searching…</p>}
            {!searching && search.trim().length >= 2 && !results.length && <p className="tp-sub">No institute student matches that.</p>}
            {results.length > 0 && (
              <ul className="st-usage" aria-label="Matching students">
                {results.map(item => (
                  <li key={item.id} style={{ padding: 0 }}><button type="button" className="tp-btn ghost" style={{ width: "100%", justifyContent: "flex-start", gap: 12, minHeight: 56 }} onClick={() => setPicked(item)}>
                    <Avatar name={item.name} size={32} /><span style={{ textAlign: "left" }}><b>{item.name}</b><br /><small>{item.email} · {item.institution}</small></span>
                  </button></li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <div className="tp-cell-person"><Avatar name={picked.name} /><b>{picked.name}<small>{picked.email} · {picked.institution}</small></b></div>
            <div className="tp-alert warn" role="note"><AlertTriangle size={16} aria-hidden="true" />They leave {picked.institution}: the college can no longer see them or their progress. They keep their account, resume and practice history, get the free plan, and must sign in again.</div>
            <div className="tp-field"><label htmlFor="b2c-reason">Reason</label><textarea id="b2c-reason" rows={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder="Recorded in the activity history" /></div>
          </>
        )}
        {error && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</div>}
        <footer className="tp-modal-foot">
          {picked ? <button type="button" className="tp-btn ghost" onClick={() => { setPicked(null); setReason(""); setError(""); }}>Choose someone else</button> : <button type="button" className="tp-btn ghost" onClick={onClose}>Cancel</button>}
          {picked && <button type="submit" className="tp-btn primary" disabled={busy || reason.trim().length < 3}>{busy ? "Moving…" : "Make B2C"}</button>}
        </footer>
      </form>
    </Modal>
  );
}
