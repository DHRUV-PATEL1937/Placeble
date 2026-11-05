import { ArrowRight, Bot, RotateCcw, SendHorizontal, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { errorMessage, tpoApi } from "@/pages/tpo/tpo-core";
import "./assistant.css";

export type AssistantAudience = "student" | "tpo" | "university" | "principal" | "admin";
type Action = { view: string; label: string };
type Turn = { role: "user" | "assistant"; content: string; actions?: Action[]; note?: string };

export const ASSISTANT_NAME = "Ananya";

const COPY: Record<AssistantAudience, { role: string; hello: string; starters: string[] }> = {
  student: {
    role: "Your career coach",
    hello: "I can see your profile and scores, so ask me anything: how to improve, what to practise next, or where to find something. I can also open pages for you.",
    starters: ["How can I improve my profile?", "Why is my readiness score what it is?", "What should I practise next?", "Is my skills list right for my target roles?"],
  },
  tpo: {
    role: "Your placement assistant",
    hello: "I can see how your college is doing. Ask who needs help first, how to get more students signed in, or what to announce. I can also open pages for you.",
    starters: ["Who needs my attention first?", "How is my cohort doing overall?", "How do I get more students to sign in?", "What should I announce this week?"],
  },
  university: {
    role: "Your university assistant",
    hello: "I can see all your colleges together. Ask which one needs support, how they compare, or what to do next. I can also open pages for you.",
    starters: ["Which college needs the most support?", "Compare my colleges", "What should I focus on this week?", "How do I add a new college?"],
  },
  principal: {
    role: "Your reports assistant",
    hello: "I can explain how your college is doing on placements and what the numbers mean. You have read-only access, so I’ll point you to the right report.",
    starters: ["How is our college doing?", "Which area is weakest?", "Explain these readiness numbers", "Where can I see each branch?"],
  },
  admin: {
    role: "Platform assistant",
    hello: "I can see the whole platform: colleges, universities, pilots, B2C students and companies. Ask what needs attention, or I can open any page.",
    starters: ["What needs my attention today?", "Which pilots are ending soon?", "How are student signups going?", "Any companies waiting for review?"],
  },
};

/** Safe, tiny formatting: **bold**, "- " bullets and "1." steps. Nothing the model writes is ever treated as HTML. */
function bold(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => (part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : <Fragment key={index}>{part}</Fragment>));
}
function Message({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(<Tag key={`l${blocks.length}`}>{list.items.map((item, index) => <li key={index}>{bold(item)}</li>)}</Tag>);
    list = null;
  };
  for (const line of text.split("\n")) {
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const bullet = line.match(/^\s*[-•*]\s+(.*)$/);
    const match = numbered ?? bullet;
    if (match) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flush();
      list = list ?? { ordered, items: [] };
      list.items.push(match[1]);
      continue;
    }
    flush();
    if (line.trim()) blocks.push(<p key={`p${blocks.length}`}>{bold(line.trim())}</p>);
  }
  flush();
  return <>{blocks}</>;
}

/** The Placeble mark drawn inline, so it always shows and keeps its colours. */
const Logo = ({ size = 34 }: { size?: number }) => (
  <svg className="sa-logo" viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false">
    <rect width="100" height="100" rx="24" fill="#2563EB" />
    <g transform="translate(12 16.2) scale(0.993) translate(-12 -16)">
      <rect x="12" y="62" width="13" height="22" rx="6.5" fill="#87A9F4" />
      <rect x="30" y="46" width="13" height="38" rx="6.5" fill="#C8D8FA" />
      <path fill="#fff" fillRule="evenodd" d="M54.5 16H66A22.5 22.5 0 0 1 66 61H54.5ZM61 29H66A9.5 9.5 0 0 1 66 48H61Z" />
      <rect x="48" y="16" width="13" height="68" rx="6.5" fill="#fff" />
    </g>
  </svg>
);

/**
 * A floating chat for anyone signed in. It answers questions about that person's own work, and can open pages in the app.
 * `views` lists the page keys this person can open, and `onNavigate` opens one.
 */
export function AssistantWidget({ accessToken, name, audience, views, onNavigate }: { accessToken: string; name: string; audience: AssistantAudience; views: string[]; onNavigate: (view: string) => void }) {
  const copy = COPY[audience];
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [turns, busy, open]);
  useEffect(() => { if (open) window.setTimeout(() => field.current?.focus(), 60); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const openPage = (action: Action) => {
    onNavigate(action.view);
    // On a phone the chat covers the page, so tuck it away once the page has changed.
    if (window.matchMedia("(max-width: 560px)").matches) setOpen(false);
  };

  const send = async (raw: string, retry = false) => {
    const question = raw.trim();
    if (!question || busy) return;
    // Trying again re-sends the same question without adding it to the chat a second time.
    const next: Turn[] = retry ? turns : [...turns, { role: "user", content: question.slice(0, 1000) }];
    setTurns(next); setText(""); setError(""); setBusy(true);
    try {
      const payload = await tpoApi<{ reply: string; actions?: Action[]; go?: string | null }>("/assistant/chat", accessToken, {
        method: "POST", json: { messages: next.slice(-12).map(({ role, content }) => ({ role, content: content.slice(0, 2900) })), views },
      });
      const actions = (payload.actions ?? []).filter(action => views.includes(action.view));
      const target = payload.go && views.includes(payload.go) ? actions.find(action => action.view === payload.go) : undefined;
      setTurns([...next, { role: "assistant", content: payload.reply, actions: target ? actions.filter(action => action !== target) : actions, note: target ? `Opened ${target.label}` : undefined }]);
      if (target) openPage(target);
    } catch (cause) { setError(errorMessage(cause, `${ASSISTANT_NAME} couldn’t answer just now.`)); }
    finally { setBusy(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void send(text); };
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(text); } };
  const lastIsUser = turns.length > 0 && turns[turns.length - 1].role === "user";

  return (
    <>
      {!open && (
        <button type="button" className="sa-fab" onClick={() => setOpen(true)} aria-label={`Ask ${ASSISTANT_NAME}, your Placeble assistant`} aria-haspopup="dialog">
          <span className="sa-fab-icon"><Bot size={20} aria-hidden="true" /></span><span className="sa-fab-label">Ask {ASSISTANT_NAME}</span>
        </button>
      )}
      {open && (
        <section className="sa-panel" role="dialog" aria-label={`${ASSISTANT_NAME}, Placeble assistant`} aria-modal="false">
          <header>
            <span className="sa-avatar"><Logo size={40} /><i aria-hidden="true" /></span>
            <div><b>{ASSISTANT_NAME}</b><small>{copy.role} · Online</small></div>
            {turns.length > 0 && <button type="button" className="sa-icon" onClick={() => { setTurns([]); setError(""); }} aria-label="Start a new chat" title="New chat"><RotateCcw size={16} /></button>}
            <button type="button" className="sa-icon" onClick={() => setOpen(false)} aria-label="Close assistant"><X size={18} /></button>
          </header>

          <div className="sa-scroll" ref={scroller} aria-live="polite">
            <div className="sa-row"><Logo size={26} /><div className="sa-msg bot"><p>Hi {name.split(" ").filter(word => !/^(dr|mr|mrs|ms|prof)\.?$/i.test(word))[0] ?? name}, I’m <strong>{ASSISTANT_NAME}</strong>.</p><p>{copy.hello}</p></div></div>
            {turns.length === 0 && (
              <div className="sa-starters" role="group" aria-label="Suggested questions">
                {copy.starters.map(item => <button key={item} type="button" onClick={() => void send(item)}>{item}<ArrowRight size={14} aria-hidden="true" /></button>)}
              </div>
            )}
            {turns.map((turn, index) => turn.role === "user" ? (
              <div key={index} className="sa-msg me"><p>{turn.content}</p></div>
            ) : (
              <div key={index} className="sa-row">
                <Logo size={26} />
                <div className="sa-col">
                  <div className="sa-msg bot"><Message text={turn.content} /></div>
                  {turn.note && <p className="sa-note-line">{turn.note}</p>}
                  {!!turn.actions?.length && (
                    <div className="sa-actions" role="group" aria-label="Open a page">
                      {turn.actions.map(action => <button key={action.view} type="button" onClick={() => openPage(action)}>Open {action.label}<ArrowRight size={14} aria-hidden="true" /></button>)}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && <div className="sa-row"><Logo size={26} /><div className="sa-msg bot sa-typing" role="status" aria-label={`${ASSISTANT_NAME} is typing`}><i /><i /><i /></div></div>}
            {error && (
              <div className="sa-error" role="alert">
                <span>{error}</span>
                {lastIsUser && !busy && <button type="button" onClick={() => void send(turns[turns.length - 1].content, true)}>Try again</button>}
              </div>
            )}
          </div>

          <form onSubmit={submit}>
            <textarea ref={field} value={text} onChange={event => setText(event.target.value)} onKeyDown={onKey} placeholder={`Message ${ASSISTANT_NAME}…`} rows={1} maxLength={1000} aria-label="Your message" />
            <button type="submit" disabled={busy || !text.trim()} aria-label="Send"><SendHorizontal size={18} aria-hidden="true" /></button>
          </form>
          <p className="sa-note">AI can make mistakes. Check important details.</p>
        </section>
      )}
    </>
  );
}
