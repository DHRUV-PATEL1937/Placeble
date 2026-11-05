import { Check, Plus, X } from "lucide-react";
import { useId, useMemo, useState, type KeyboardEvent } from "react";
import "./suggest-chips.css";

type Props = {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  /** Everything we can suggest while the person types. */
  pool: string[];
  /** A short list shown as one-tap chips before they type anything. */
  quick?: string[];
  placeholder: string;
  max: number;
  hint?: string;
  /** Allowed characters. Anything else is removed as they type. */
  allowed?: RegExp;
  maxLength?: number;
};

const DEFAULT_ALLOWED = /[^\p{L}\p{N} +#./&()'’-]/gu;

/** Chips with suggestions that narrow as you type. Arrow keys and Enter pick one; Enter on your own words adds them. */
export function SuggestChips({ label, values, onChange, pool, quick = [], placeholder, max, hint, allowed = DEFAULT_ALLOWED, maxLength = 60 }: Props) {
  const id = useId();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const has = (value: string) => values.some(item => item.toLowerCase() === value.toLowerCase());
  const full = values.length >= max;

  const matches = useMemo(() => {
    const query = text.trim().toLowerCase();
    if (!query) return [];
    const free = pool.filter(item => !values.some(value => value.toLowerCase() === item.toLowerCase()));
    const starts = free.filter(item => item.toLowerCase().startsWith(query));
    const words = free.filter(item => !item.toLowerCase().startsWith(query) && item.toLowerCase().split(/[\s/-]+/).some(word => word.startsWith(query)));
    const inside = free.filter(item => !starts.includes(item) && !words.includes(item) && item.toLowerCase().includes(query));
    return [...starts, ...words, ...inside].slice(0, 8);
  }, [text, pool, values]);

  const add = (raw: string) => {
    const value = raw.replace(allowed, "").trim().replace(/\s+/g, " ").slice(0, maxLength);
    setText(""); setOpen(false); setActive(0);
    if (value.length < 2 || has(value) || full) return;
    // Prefer the catalogue's spelling ("javascript" becomes "JavaScript").
    onChange([...values, pool.find(item => item.toLowerCase() === value.toLowerCase()) ?? value]);
  };
  const remove = (value: string) => onChange(values.filter(item => item !== value));

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive(index => Math.min(index + 1, Math.max(0, matches.length - 1))); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive(index => Math.max(0, index - 1)); }
    else if (event.key === "Enter" || event.key === ",") { event.preventDefault(); add(open && matches[active] ? matches[active] : text); }
    else if (event.key === "Escape") setOpen(false);
    else if (event.key === "Backspace" && !text && values.length) remove(values[values.length - 1]);
  };

  const showList = open && matches.length > 0 && !full;
  // Picked suggestions move into the box and the next ones from the pool take their place, so the list never runs dry.
  const quickLeft = [...new Set([...quick, ...pool])].filter(item => !has(item)).slice(0, 10);

  return (
    <div className="sc">
      <label className="sc-label" htmlFor={id}>{label}<small>{values.length}/{max}</small></label>
      {quickLeft.length > 0 && !text && !full && (
        <div className="sc-quick" role="group" aria-label={`Suggested ${label.toLowerCase()}`}>
          {quickLeft.map(item => <button key={item} type="button" onClick={() => add(item)} disabled={full}><Plus size={12} aria-hidden="true" />{item}</button>)}
        </div>
      )}
      <div className="sc-box">
        {values.map(value => <span className="sc-chip" key={value}>{value}<button type="button" onClick={() => remove(value)} aria-label={`Remove ${value}`}><X size={12} /></button></span>)}
        <input
          id={id} value={text} disabled={full} autoComplete="off" spellCheck={false} maxLength={maxLength}
          role="combobox" aria-expanded={showList} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={showList ? `${id}-${active}` : undefined}
          placeholder={values.length ? (full ? "Limit reached" : "Add another…") : placeholder}
          onChange={event => { setText(event.target.value.replace(allowed, "")); setOpen(true); setActive(0); }}
          onKeyDown={onKey} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => { setOpen(false); }, 120)}
        />
        {text.trim().length >= 2 && !full && <button type="button" className="sc-add" onMouseDown={event => event.preventDefault()} onClick={() => add(text)} aria-label={`Add ${text.trim()}`}><Plus size={15} /></button>}
        {showList && (
          <ul className="sc-list" id={`${id}-list`} role="listbox" aria-label={`${label} suggestions`}>
            {matches.map((item, index) => (
              <li key={item} id={`${id}-${index}`} role="option" aria-selected={index === active} className={index === active ? "on" : ""} onMouseDown={event => { event.preventDefault(); add(item); }} onMouseEnter={() => setActive(index)}>{item}</li>
            ))}
          </ul>
        )}
      </div>
      <p className="sc-hint">{hint ?? "Start typing to see suggestions, or add your own and press Enter."}{text.trim().length >= 2 && !matches.length && !full && <> <Check size={12} aria-hidden="true" /> Press Enter to add “{text.trim()}”.</>}</p>
    </div>
  );
}
