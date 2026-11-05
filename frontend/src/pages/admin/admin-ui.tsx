import { AlertTriangle, Check, Copy, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Modal } from "@/pages/tpo/tpo-core";

export const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Never";

export const ACTION_LABELS: Record<string, string> = {
  institution_created: "College created", institution_suspended: "College suspended", institution_reactivated: "College reactivated",
  recruiter_org_verified: "Company verified", recruiter_org_rejected: "Company rejected", recruiter_org_suspended: "Company suspended", recruiter_org_reactivated: "Company restored",
  tpo_credential_reissued: "TPO credentials reissued", admin_viewed_institution_detail: "College detail viewed", platform_admin_created: "Super admin added",
  university_created: "University created", university_suspended: "University suspended", university_reactivated: "University reactivated",
  b2c_plan_changed: "Student plan changed", b2c_student_suspended: "B2C student suspended", b2c_student_reactivated: "B2C student restored", program_changed: "Programme changed", student_made_b2c: "Student made B2C", account_deletion_approved: "Account deleted", account_deletion_rejected: "Deletion request declined",
};
export const actionLabel = (action: string) => ACTION_LABELS[action] ?? action.replaceAll("_", " ");

export type Tone = "ready" | "neutral" | "stalled" | "at-risk" | "on-track";
const STATUS_TONE: Record<string, Tone> = { active: "ready", verified: "ready", operational: "ready", configured: "on-track", approved: "ready", pending: "stalled", degraded: "stalled", requested: "stalled", suspended: "at-risk", rejected: "at-risk", down: "at-risk", revoked: "at-risk" };
export function StatusChip({ value }: { value: string }) {
  return <span className={`tp-pill st-${STATUS_TONE[value] ?? "neutral"}`}>{value.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase())}</span>;
}

/** Every sensitive platform action asks for a reason, which is recorded in the activity history. */
export function ReasonModal({ title, text, confirmLabel, destructive = false, onCancel, onConfirm }: { title: string; text: string; confirmLabel: string; destructive?: boolean; onCancel: () => void; onConfirm: (reason: string) => Promise<void> | void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (reason.trim().length < 3) return; setBusy(true); try { await onConfirm(reason.trim()); } finally { setBusy(false); } };
  return (
    <Modal title={title} description={text} onClose={onCancel}>
      <form className="tp-form" onSubmit={submit}>
        <div className="tp-alert warn" role="note">{destructive ? <AlertTriangle size={16} aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />}This action is recorded in the activity history with your name.</div>
        <div className="tp-field"><label htmlFor="rm-reason">Reason</label><textarea id="rm-reason" rows={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder="Why are you doing this?" /></div>
        <footer className="tp-modal-foot"><button type="button" className="tp-btn ghost" onClick={onCancel}>Cancel</button><button type="submit" className={`tp-btn ${destructive ? "danger-solid" : "primary"}`} disabled={busy || reason.trim().length < 3}>{busy ? "Saving…" : confirmLabel}</button></footer>
      </form>
    </Modal>
  );
}

/** A one-time link or password the admin must hand over, with a copy button. */
export function SecretBox({ label, value, note }: { label: string; value: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ } };
  return (
    <div className="ad-secret">
      <small>{label}</small>
      <div className="tp-linkbox"><code>{value}</code><button type="button" className="tp-btn secondary sm" onClick={() => void copy()}>{copied ? <><Check size={14} aria-hidden="true" /> Copied</> : <><Copy size={14} aria-hidden="true" /> Copy</>}</button></div>
      {note && <p className="tp-field-hint">{note}</p>}
    </div>
  );
}
