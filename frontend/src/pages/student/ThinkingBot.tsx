import { useEffect, useState } from "react";

/** A friendly robot face that "thinks" while the AI works: ring spins, eyes look around and blink, side arcs pulse. */
export function ThinkingBot({ title, messages }: { title: string; messages: string[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (messages.length < 2) return;
    const timer = window.setInterval(() => setIndex(value => (value + 1) % messages.length), 2400);
    return () => window.clearInterval(timer);
  }, [messages]);
  return (
    <div className="cs-thinking" role="status" aria-live="polite">
      <div className="cs-bot" aria-hidden="true">
        <i className="cs-arc l" />
        <div className="cs-bot-ring"><div className="cs-bot-face"><i className="cs-eye l" /><i className="cs-eye r" /></div></div>
        <i className="cs-arc r" />
      </div>
      <h3>{title}</h3>
      <p key={index} className="cs-think-msg">{messages[index]}</p>
      <span className="cs-dots" aria-hidden="true"><i /><i /><i /></span>
    </div>
  );
}
