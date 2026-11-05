import { AlertTriangle, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Card, EmptyState, ErrorState, Loading, Modal, errorMessage, tpoApi, useLoad } from "@/pages/tpo/tpo-core";
import "@/pages/tpo/tpo.css";

type Program = { code: string; name: string; category: string; durationYears: number; interviewStyle: "technical" | "business" | "mixed"; roles: string[]; coding: boolean; active: boolean; institutes: number; students: number };
const STYLE_LABEL = { technical: "Technical", business: "Business", mixed: "Mixed" } as const;

/** Superadmin: the list of programmes (branches) that institutes and students choose from. */
export function ProgramsScreen({ accessToken }: { accessToken: string }) {
  const { data, loading, error, reload } = useLoad(() => tpoApi<{ programs: Program[] }>("/platform-admin/programs", accessToken).then(payload => payload.programs), [accessToken]);
  const [editing, setEditing] = useState<Program | "new" | null>(null);
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");

  const toggle = async (program: Program) => {
    setBusy(program.code); setActionError("");
    try { await tpoApi(`/platform-admin/programs/${program.code}`, accessToken, { method: "PATCH", json: { active: !program.active } }); reload(); }
    catch (cause) { setActionError(errorMessage(cause)); }
    finally { setBusy(""); }
  };

  const groups = [...new Set((data ?? []).map(program => program.category))];
  return (
    <div className="pa-screen-stack">
      <div className="tp-page-actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <p className="tp-field-hint">Institutes enable these as branches, and B2C students pick one at setup. Switching one off hides it from new choices without affecting anyone already using it.</p>
        <button type="button" className="tp-btn primary" onClick={() => setEditing("new")}><Plus size={16} aria-hidden="true" /> Add programme</button>
      </div>
      {actionError && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{actionError}</div>}
      <Card flush>
        {loading && !data ? <Loading label="Loading programmes…" /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.length ? <EmptyState icon={Plus} title="No programmes" /> : groups.map(group => (
          <div key={group}>
            <h3 className="tp-group-head">{group}</h3>
            <div className="tp-table" role="table" aria-label={group}>
              {data.filter(program => program.category === group).map(program => (
                <div className={`tp-tr cols-program${program.active ? "" : " tp-off"}`} role="row" key={program.code}>
                  <span role="cell"><b>{program.name}<small>{program.code} · {program.durationYears} yr · {program.roles.length} roles</small></b></span>
                  <span role="cell" data-label="Style"><em className="tp-pill st-neutral">{STYLE_LABEL[program.interviewStyle]}</em>{program.coding && <em className="tp-pill st-on-track" style={{ marginLeft: 6 }}>Coding</em>}</span>
                  <span role="cell" data-label="In use">{program.institutes} institute{program.institutes === 1 ? "" : "s"} · {program.students} student{program.students === 1 ? "" : "s"}</span>
                  <span role="cell" className="tp-cell-actions">
                    <button type="button" className="tp-btn ghost sm" onClick={() => setEditing(program)}>Edit</button>
                    <button type="button" className={`tp-btn sm ${program.active ? "ghost danger" : "secondary"}`} disabled={busy === program.code} onClick={() => void toggle(program)}>{program.active ? "Switch off" : "Switch on"}</button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Card>
      {editing && <ProgramModal program={editing === "new" ? null : editing} categories={groups} accessToken={accessToken} onClose={() => setEditing(null)} onSaved={reload} />}
    </div>
  );
}

function ProgramModal({ program, categories, accessToken, onClose, onSaved }: { program: Program | null; categories: string[]; accessToken: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ code: program?.code ?? "", name: program?.name ?? "", category: program?.category ?? categories[0] ?? "", durationYears: String(program?.durationYears ?? 3), interviewStyle: program?.interviewStyle ?? "mixed", roles: (program?.roles ?? []).join("\n"), coding: program?.coding ?? false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editing = Boolean(program);
  const roles = [...new Set(form.roles.split("\n").map(role => role.trim()).filter(Boolean))];

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (form.name.trim().length < 2 || form.category.trim().length < 2) { setError("Enter a name and a category."); return; }
    if (!editing && !/^[A-Za-z0-9_]{2,40}$/.test(form.code.trim())) { setError("The code needs 2–40 letters, numbers or underscores."); return; }
    if (!roles.length) { setError("Add at least one suggested role."); return; }
    setBusy(true);
    const body = { name: form.name.trim(), category: form.category.trim(), durationYears: Number(form.durationYears), interviewStyle: form.interviewStyle, roles, coding: form.coding };
    try {
      if (editing) await tpoApi(`/platform-admin/programs/${program!.code}`, accessToken, { method: "PATCH", json: body });
      else await tpoApi("/platform-admin/programs", accessToken, { method: "POST", json: { code: form.code.trim(), ...body } });
      onSaved(); onClose();
    } catch (cause) { setError(errorMessage(cause, "Could not save this programme.")); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={editing ? `Edit ${program!.name}` : "Add a programme"} description={editing ? "Changes apply to new choices straight away. Existing students keep their programme." : "It will appear in every institute’s branch list and in student setup."} onClose={onClose} wide>
      <form className="tp-form" onSubmit={submit} noValidate>
        {error && <div className="tp-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</div>}
        <div className="tp-field-row">
          <div className="tp-field"><label htmlFor="pg-name">Name</label><input id="pg-name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="MCA" autoComplete="off" /></div>
          <div className="tp-field"><label htmlFor="pg-code">Code {editing && <em>Can’t change</em>}</label><input id="pg-code" value={form.code} disabled={editing} onChange={event => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="MCA" autoComplete="off" /></div>
        </div>
        <div className="tp-field-row">
          <div className="tp-field"><label htmlFor="pg-cat">Category</label><input id="pg-cat" list="pg-cats" value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} autoComplete="off" /><datalist id="pg-cats">{categories.map(item => <option key={item} value={item} />)}</datalist></div>
          <div className="tp-field"><label htmlFor="pg-years">Duration (years)</label><select id="pg-years" value={form.durationYears} onChange={event => setForm({ ...form, durationYears: event.target.value })}>{[1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>{value}</option>)}</select></div>
        </div>
        <div className="tp-field"><label htmlFor="pg-style">Practice style</label>
          <select id="pg-style" value={form.interviewStyle} onChange={event => setForm({ ...form, interviewStyle: event.target.value as typeof form.interviewStyle })}><option value="technical">Technical: aptitude and problem-solving first</option><option value="business">Business: interviews and communication first</option><option value="mixed">Mixed: a balanced blend</option></select>
        </div>
        <label className="tp-check"><input type="checkbox" checked={form.coding} onChange={event => setForm({ ...form, coding: event.target.checked })} /><span>Include the Coding practice tool for this programme</span></label>
        <div className="tp-field"><label htmlFor="pg-roles">Suggested target roles <em>One per line · {roles.length}</em></label><textarea id="pg-roles" rows={7} value={form.roles} onChange={event => setForm({ ...form, roles: event.target.value })} placeholder={"Software Engineer\nData Analyst"} /><p className="tp-field-hint">Students see these as one-tap suggestions and can add their own.</p></div>
        <footer className="tp-modal-foot"><button type="button" className="tp-btn ghost" onClick={onClose}>Cancel</button><button type="submit" className="tp-btn primary" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add programme"}</button></footer>
      </form>
    </Modal>
  );
}
