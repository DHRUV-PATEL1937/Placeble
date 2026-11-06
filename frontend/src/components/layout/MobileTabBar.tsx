import { LayoutGrid, LogOut, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSheetDrag } from "@/hooks/use-motion";

export type TabItem = { key: string; label: string; /** A shorter name for the tab itself, when the full label is too long for a phone. */ short?: string; icon: LucideIcon; badge?: number };

const MAX_TABS = 4;

/**
 * The phone navigation for the staff workspaces: four main destinations plus a "More" sheet with everything else.
 * Hidden on larger screens, where the sidebar does this job. The student workspace has its own bar with the same look.
 */
export function MobileTabBar({ items, active, onSelect, user, onSignOut }: { items: TabItem[]; active: string; onSelect: (key: string) => void; user: { name: string; email: string }; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const sheet = useRef<HTMLElement>(null);
  // Keep the current page visible in the bar: if it lives under "More", it takes the last tab's place.
  const main = items.slice(0, MAX_TABS);
  const hidden = items.slice(MAX_TABS);
  const activeInMore = hidden.some(item => item.key === active);
  const tabs = activeInMore ? [...main.slice(0, MAX_TABS - 1), hidden.find(item => item.key === active)!] : main;

  const close = () => { setClosing(true); };
  const drag = useSheetDrag(sheet, close);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const finish = () => { if (closing) { setOpen(false); setClosing(false); } };
  const choose = (key: string) => { onSelect(key); close(); };

  return (
    <>
      <nav className="mo-tabbar" aria-label="Main">
        {tabs.map(({ key, label, short, icon: Icon, badge }) => (
          <button key={key} type="button" className={active === key ? "active" : ""} aria-current={active === key ? "page" : undefined} onClick={() => onSelect(key)}>
            <i className="mo-tab-ic"><Icon size={21} strokeWidth={active === key ? 2.4 : 1.9} aria-hidden="true" />{badge ? <em aria-label={`${badge} waiting`}>{badge > 9 ? "9+" : badge}</em> : null}</i>
            <span>{short ?? label}</span>
          </button>
        ))}
        {items.length > MAX_TABS && (
          <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setClosing(false); setOpen(true); }}>
            <i className="mo-tab-ic"><LayoutGrid size={21} strokeWidth={1.9} aria-hidden="true" /></i>
            <span>More</span>
          </button>
        )}
      </nav>
      {open && (
        <div className={`mo-sheet-layer${closing ? " closing" : ""}`} role="presentation">
          <button type="button" className="mo-sheet-scrim" aria-label="Close menu" onClick={close} />
          <section className="mo-sheet" role="dialog" aria-modal="true" aria-label="More" ref={sheet} onAnimationEnd={event => { if (event.target === event.currentTarget) finish(); }}>
            <span className="mo-sheet-grab" aria-hidden="true" {...drag} />
            <div className="mo-sheet-user"><b>{user.name}</b><small>{user.email}</small><button type="button" className="tp-icon-btn" onClick={close} aria-label="Close"><X size={18} /></button></div>
            <ul>
              {items.map(({ key, label, icon: Icon, badge }) => (
                <li key={key}><button type="button" className={active === key ? "active" : ""} onClick={() => choose(key)}><Icon size={19} aria-hidden="true" /><b>{label}</b>{badge ? <em>{badge}</em> : null}</button></li>
              ))}
              <li><button type="button" className="danger" onClick={() => { close(); onSignOut(); }}><LogOut size={19} aria-hidden="true" /><b>Sign out</b></button></li>
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
