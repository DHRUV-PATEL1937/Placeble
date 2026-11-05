import { CalendarClock, CheckCircle2, FlaskConical, Handshake } from "lucide-react";
import { useState } from "react";
import { Card, errorMessage, formatDate, tpoApi, type Notify } from "@/pages/tpo/tpo-core";

export type Commercial = { type: "pilot" | "customer"; pilotStartsAt?: string | null; pilotEndsAt?: string | null; daysLeft?: number | null; expired?: boolean; convertedAt?: string | null; note?: string };
export type CommercialInput = { type: "pilot" | "customer"; pilotEndsOn?: string; note?: string };

const pad = (value: number) => String(value).padStart(2, "0");
/** A YYYY-MM-DD date in the browser's own calendar, which is what a date input expects. */
export const dateInput = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const inDays = (days: number, from = new Date()) => { const next = new Date(from); next.setDate(next.getDate() + days); return next; };

/** A small pill for lists: "Pilot · 12 days left", "Pilot ended" or nothing for a paying customer. */
export function PilotBadge({ commercial }: { commercial?: Commercial | null }) {
  if (!commercial || commercial.type !== "pilot") return null;
  const label = commercial.expired ? "Pilot ended" : `Pilot · ${commercial.daysLeft ?? 0} day${commercial.daysLeft === 1 ? "" : "s"} left`;
  return <span className={`tp-pill ${commercial.expired ? "st-at-risk" : (commercial.daysLeft ?? 0) <= 7 ? "st-stalled" : "st-on-track"}`}><FlaskConical size={12} aria-hidden="true" /> {label}</span>;
}

/** Used when creating a university or college: a customer, or a pilot that runs until a chosen day. */
export function AccountTypeFields({ value, onChange }: { value: CommercialInput; onChange: (next: CommercialInput) => void }) {
  return (
    <fieldset className="tp-fieldset">
      <div className="tp-field-row">
        <div className="tp-field">
          <label htmlFor="ct-type">Account type</label>
          <select id="ct-type" value={value.type} onChange={event => onChange(event.target.value === "pilot" ? { type: "pilot", pilotEndsOn: value.pilotEndsOn ?? dateInput(inDays(30)) } : { type: "customer" })}>
            <option value="customer">Customer</option>
            <option value="pilot">Pilot (free trial)</option>
          </select>
        </div>
        {value.type === "pilot" && (
          <div className="tp-field">
            <label htmlFor="ct-end">Pilot ends on</label>
            <input id="ct-end" type="date" value={value.pilotEndsOn ?? ""} min={dateInput(inDays(1))} max={dateInput(inDays(365))} onChange={event => onChange({ ...value, pilotEndsOn: event.target.value })} />
          </div>
        )}
      </div>
      {value.type === "pilot" && <p className="tp-field-hint"><CalendarClock size={14} aria-hidden="true" /> Access pauses after this day unless you extend it or make them a customer.</p>}
    </fieldset>
  );
}

/** Start, extend, shorten or convert a pilot. Every change is recorded in the activity history. */
export function CommercialPanel({ kind, id, name, commercial, accessToken, notify, onChanged }: {
  kind: "university" | "institution"; id: string; name: string; commercial?: Commercial | null; accessToken: string; notify: Notify; onChanged: () => void;
}) {
  const current: Commercial = commercial ?? { type: "customer" };
  const pilot = current.type === "pilot";
  const [endOn, setEndOn] = useState(() => dateInput(inDays(30)));
  const [note, setNote] = useState(current.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const path = `/platform-admin/${kind === "university" ? "universities" : "institutions"}/${id}/commercial`;

  const send = async (body: CommercialInput, done: string) => {
    setBusy(true); setError("");
    try { await tpoApi(path, accessToken, { method: "PATCH", json: { note: note.trim(), ...body } }); notify(done); onChanged(); }
    catch (cause) { setError(errorMessage(cause, "Could not save this change.")); }
    finally { setBusy(false); }
  };
  // Extending counts from the later of today and the current end, so an expired pilot restarts from today.
  const extend = (days: number) => {
    const base = current.pilotEndsAt && new Date(current.pilotEndsAt) > new Date() ? new Date(current.pilotEndsAt) : new Date();
    return send({ type: "pilot", pilotEndsOn: dateInput(inDays(days, base)) }, `Pilot extended by ${days} days.`);
  };

  return (
    <Card title="Account type" description={`Is ${name} on a free pilot or a paying customer?`}>
      <div className="cp-status">
        <span className={`cp-icon ${pilot ? (current.expired ? "ended" : "pilot") : "customer"}`} aria-hidden="true">{pilot ? <FlaskConical size={20} /> : <Handshake size={20} />}</span>
        <div>
          <b>{pilot ? (current.expired ? "Pilot ended" : "On a pilot") : "Customer"}</b>
          <p>{pilot
            ? current.expired ? `The pilot ended on ${formatDate(current.pilotEndsAt ?? "")}. Their workspace is paused until you extend it or make them a customer.` : `Ends on ${formatDate(current.pilotEndsAt ?? "")} · ${current.daysLeft} day${current.daysLeft === 1 ? "" : "s"} left.`
            : current.convertedAt ? `Became a customer on ${formatDate(current.convertedAt)}.` : "Paying customer with full access."}</p>
        </div>
        <PilotBadge commercial={current} />
      </div>

      <div className="tp-form cp-form">
        {error && <div className="tp-alert error" role="alert">{error}</div>}
        {pilot && (
          <div>
            <b className="cp-label">Extend the pilot</b>
            <div className="cp-row">
              {[7, 14, 30, 60].map(days => <button key={days} type="button" className="tp-btn secondary sm" disabled={busy} onClick={() => void extend(days)}>+{days} days</button>)}
            </div>
          </div>
        )}
        <div className="tp-field-row">
          <div className="tp-field">
            <label htmlFor={`cp-end-${id}`}>{pilot ? "Or set the last day" : "Start a pilot until"}</label>
            <input id={`cp-end-${id}`} type="date" value={endOn} min={dateInput(inDays(1))} max={dateInput(inDays(365))} onChange={event => setEndOn(event.target.value)} />
          </div>
          <div className="tp-field">
            <label htmlFor={`cp-note-${id}`}>Note <em>Optional</em></label>
            <input id={`cp-note-${id}`} value={note} maxLength={300} onChange={event => setNote(event.target.value)} placeholder="e.g. Demo agreed with the registrar" />
          </div>
        </div>
        <div className="cp-row">
          <button type="button" className="tp-btn primary" disabled={busy || !endOn} onClick={() => void send({ type: "pilot", pilotEndsOn: endOn }, pilot ? "Pilot end date updated." : "Pilot started.")}><CalendarClock size={15} aria-hidden="true" /> {pilot ? "Update end date" : "Start pilot"}</button>
          {pilot
            ? <button type="button" className="tp-btn secondary" disabled={busy} onClick={() => void send({ type: "customer" }, `${name} is now a customer.`)}><CheckCircle2 size={15} aria-hidden="true" /> Convert to customer</button>
            : null}
        </div>
      </div>
    </Card>
  );
}
