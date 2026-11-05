import { Check, MessageCircle, Send, Sparkles, Undo2, WandSparkles } from "lucide-react";
import { useState } from "react";
import type { useResumeStudio } from "./useResumeStudio";

export function ChatPanel({ studio }: { studio: ReturnType<typeof useResumeStudio> }) {
  const [message, setMessage] = useState("");
  if (!studio.resume) return null;
  const send = (prompt = message) => { const text = prompt.trim(); if (!text || studio.busy) return; setMessage(""); void studio.run("Thinking", () => studio.assist(text)); };
  return <div className="rs-chat-shell">
    <header className="rs-chat-header"><span><Sparkles size={18}/></span><div><h1>Resume assistant</h1><p>Writing and design help, grounded in your resume.</p></div><em><i/> Online</em></header>
    <div className="rs-chat-messages" aria-live="polite">
      {studio.conversation.map((item, index) => <div key={`${item.role}-${index}`} className={`rs-chat-message ${item.role}`}>{item.role === "assistant" && <span className="rs-chat-avatar"><Sparkles size={14}/></span>}<div><small>{item.role === "assistant" ? "Placeble" : "You"}</small><p>{item.text}</p></div></div>)}
      {!!studio.busy && <div className="rs-chat-message assistant"><span className="rs-chat-avatar"><Sparkles size={14}/></span><div><small>Placeble</small><p className="rs-chat-typing"><i/><i/><i/></p></div></div>}
    </div>
    {studio.proposal && <section className="rs-chat-proposal"><header><WandSparkles size={16}/><div><strong>Preview ready</strong><small>Review these changes in the live resume before applying.</small></div></header><ul>{studio.proposal.changeSummary.map((text, index) => <li key={index}>{text}</li>)}</ul><div><button className="rs-button" onClick={() => studio.setProposal(null)}>Keep current</button><button className="rs-button rs-primary" onClick={studio.apply}><Check size={15}/> Apply changes</button></div></section>}
    {!studio.proposal && studio.suggestedPrompts.length > 0 && <div className="rs-chat-suggestions">{studio.suggestedPrompts.map(prompt => <button key={prompt} disabled={!!studio.busy} onClick={() => send(prompt)}>{prompt}</button>)}</div>}
    <div className="rs-chat-context"><label><span>Target role context <small>Optional</small></span><textarea rows={2} value={studio.resume.targetJdText || ""} maxLength={30000} onChange={event => studio.update(resume => ({ ...resume, targetJdText: event.target.value }))} placeholder="Paste a job description to make suggestions role-specific…"/></label></div>
    <form className="rs-chat-composer" onSubmit={event => { event.preventDefault(); send(); }}><MessageCircle size={18}/><textarea rows={2} value={message} maxLength={2400} onChange={event => setMessage(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder="Ask me to rewrite content, change colors, spacing, layout, typography…"/><button type="submit" aria-label="Send message" disabled={!message.trim() || !!studio.busy}><Send size={17}/></button><small>Enter to send · Shift + Enter for a new line</small></form>
    {studio.undo && <button className="rs-text-button rs-chat-undo" onClick={studio.undoChange}><Undo2 size={15}/> Undo last AI edit</button>}
  </div>;
}
