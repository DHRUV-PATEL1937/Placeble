import { Globe, X } from "lucide-react";
import { useState, type ClipboardEvent, type KeyboardEvent } from "react";
import "./suggest-chips.css";

/** The domains any number of colleges may share, because they don't point to one college. */
export const SHARED_DOMAINS = ["gmail.com"];

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;

/** Turns "@College.edu", "https://college.edu/" or "name@college.edu" into "college.edu". */
export function normalizeDomain(raw: string) {
  return raw.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^.*@/, "").replace(/\/.*$/, "").replace(/[\s,;]+$/g, "");
}
export const isDomain = (value: string) => value.length <= 120 && DOMAIN_RE.test(value);

/** Type a domain and press Enter to add it. Paste several at once, separated by commas or spaces. */
export function DomainInput({ id, values, onChange, max = 12, placeholder = "college.edu" }: { id: string; values: string[]; onChange: (values: string[]) => void; max?: number; placeholder?: string }) {
  const [text, setText] = useState("");
  const [problem, setProblem] = useState("");

  const addMany = (raw: string) => {
    const parts = raw.split(/[\s,;]+/).map(normalizeDomain).filter(Boolean);
    if (!parts.length) { setText(""); return; }
    const next = [...values];
    const bad: string[] = [];
    for (const part of parts) {
      if (!isDomain(part)) { bad.push(part); continue; }
      if (next.includes(part)) continue;
      if (next.length >= max) { setProblem(`You can add up to ${max} domains.`); break; }
      next.push(part);
    }
    if (next.length !== values.length) onChange(next);
    if (bad.length) { setProblem(`“${bad[0]}” isn’t a valid domain. Use something like college.edu.`); setText(bad.join(" ")); return; }
    if (next.length < max) setProblem("");
    setText("");
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (["Enter", ",", " ", "Tab"].includes(event.key) && text.trim()) { event.preventDefault(); addMany(text); }
    else if (event.key === "Enter") event.preventDefault();
    else if (event.key === "Backspace" && !text && values.length) onChange(values.slice(0, -1));
  };
  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text");
    if (/[\s,;]/.test(pasted.trim())) { event.preventDefault(); addMany(pasted); }
  };

  return (
    <div className="sc">
      <div className="sc-box">
        {values.map(value => (
          <span key={value} className="sc-chip"><Globe size={12} aria-hidden="true" />@{value}<button type="button" onClick={() => onChange(values.filter(item => item !== value))} aria-label={`Remove ${value}`}><X size={12} /></button></span>
        ))}
        <input id={id} value={text} onChange={event => { setText(event.target.value); if (problem) setProblem(""); }} onKeyDown={onKey} onPaste={onPaste} onBlur={() => text.trim() && addMany(text)} placeholder={values.length ? "Add another, then press Enter" : placeholder} autoComplete="off" autoCapitalize="none" spellCheck={false} inputMode="url" disabled={values.length >= max} aria-describedby={`${id}-note`} aria-invalid={Boolean(problem)} />
      </div>
      <p className="sc-hint" id={`${id}-note`} role={problem ? "alert" : undefined} style={problem ? { color: "var(--pb-danger, #c0392b)" } : undefined}>
        {problem || <>Press Enter after each domain. Common mail like <button type="button" className="sc-link" onClick={() => addMany(SHARED_DOMAINS[0])} disabled={values.includes(SHARED_DOMAINS[0]) || values.length >= max}>gmail.com</button> can be added by any college.</>}
      </p>
    </div>
  );
}
