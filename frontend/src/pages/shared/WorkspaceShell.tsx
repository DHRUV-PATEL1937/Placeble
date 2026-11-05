import { LogOut, Menu, Moon, Sun, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Avatar, Modal, Toast, type Notify } from "@/pages/tpo/tpo-core";
import "@/pages/tpo/tpo.css";

export type NavGroup = { label: string; items: Array<{ key: string; label: string; icon: LucideIcon; badge?: number }> };

/** Sidebar + top bar + theme + sign-out + toasts shared by the university and principal workspaces. */
export function WorkspaceShell({ nav, active, onNavigate, user, context, brand, onLogout, topbar, banner, children }: {
  nav: NavGroup[];
  active: string;
  onNavigate: (key: string) => void;
  user: { name: string; email: string };
  /** Shown under the logo, e.g. the university or institute name. */
  context?: string;
  /** A logo block that replaces the plain context text. */
  brand?: ReactNode;
  onLogout: () => void;
  topbar?: ReactNode;
  banner?: ReactNode;
  children: (tools: { notify: Notify }) => ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [dark, setDark] = useState(() => { const saved = window.localStorage.getItem("placeble-theme"); return saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches); });

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    window.localStorage.setItem("placeble-theme", dark ? "dark" : "light");
  }, [dark]);

  const notify: Notify = useCallback((message, tone = "success") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3600);
  }, []);
  const go = (key: string) => { onNavigate(key); setMenuOpen(false); };

  return (
    <div className="tp-shell">
      <a className="tp-skip" href="#ws-main">Skip to content</a>
      <div className={`tp-scrim${menuOpen ? " show" : ""}`} onClick={() => setMenuOpen(false)} aria-hidden="true" />

      <aside className={`tp-sidebar${menuOpen ? " open" : ""}`} aria-label="Primary">
        <div className="tp-side-top">
          <picture><img className="tp-logo light" src="/placeble-logo-horizontal-color.svg" alt="Placeble" /><img className="tp-logo dark" src="/placeble-logo-horizontal-reversed.svg" alt="" /></picture>
          <button type="button" className="tp-icon-btn tp-only-mobile" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        {brand ?? (context && <p className="tp-college">{context}</p>)}
        <nav>
          {nav.map(group => (
            <div key={group.label} className="tp-nav-group">
              <span>{group.label}</span>
              {group.items.map(({ key, label, icon: Icon, badge }) => (
                <button key={key} type="button" className={active === key ? "active" : ""} aria-current={active === key ? "page" : undefined} onClick={() => go(key)}>
                  <Icon size={18} aria-hidden="true" /><b>{label}</b>
                  {badge ? <em aria-label={`${badge} waiting`}>{badge}</em> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <button type="button" className="tp-user" onClick={() => setSignOutOpen(true)} aria-label={`Sign out ${user.name}`}>
          <Avatar name={user.name} size={36} />
          <span><b>{user.name}</b><small>{user.email}</small></span>
          <LogOut size={17} aria-hidden="true" />
        </button>
      </aside>

      <div className="tp-main">
        {banner}
        <header className="tp-topbar">
          <button type="button" className="tp-icon-btn tp-only-mobile" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={19} /></button>
          <div className="tp-topbar-slot">{topbar}</div>
          <div className="tp-top-actions">
            <button type="button" className="tp-icon-btn" onClick={() => setDark(value => !value)} aria-label={dark ? "Use light mode" : "Use dark mode"} title={dark ? "Use light mode" : "Use dark mode"}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
          </div>
        </header>
        <main id="ws-main" className="tp-content">{children({ notify })}</main>
      </div>

      {signOutOpen && (
        <Modal title="Sign out of Placeble?" description="You’ll need to sign in again to return to this workspace." onClose={() => setSignOutOpen(false)}>
          <footer className="tp-modal-foot"><button type="button" className="tp-btn ghost" onClick={() => setSignOutOpen(false)}>Stay signed in</button><button type="button" className="tp-btn danger-solid" onClick={onLogout}>Sign out</button></footer>
        </Modal>
      )}
      {toast && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}
    </div>
  );
}
