import { ArrowLeft, ArrowRight, Lightbulb, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSheetDrag } from "@/hooks/use-motion";
import { PAGES, TOURS, type GuideRole } from "./guide-content";
import "./guide.css";

const read = (key: string) => { try { return window.localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string | null) => { try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); } catch { /* storage can be blocked */ } };

const tourKey = (role: GuideRole) => `pb-tour:${role}`;
const pageKey = (role: GuideRole, view: string) => `pb-guide:${role}:${view}`;

/** First-run tour state for one role: opens by itself the first time, and can be opened again from the menu. */
export function useGuide(role: GuideRole) {
  const [tourOpen, setTourOpen] = useState(() => role !== "student" && read(tourKey(role)) !== "done");
  const [tipsVersion, setTipsVersion] = useState(0);
  const closeTour = useCallback(() => { write(tourKey(role), "done"); setTourOpen(false); }, [role]);
  const openTour = useCallback(() => {
    // Replaying the tour also brings the page tips back.
    Object.keys(PAGES[role]).forEach(view => write(pageKey(role, view), null));
    setTipsVersion(version => version + 1);
    setTourOpen(true);
  }, [role]);
  return { tourOpen, openTour, closeTour, tipsVersion };
}

/** A short note at the top of a page: what it is and what to do here. Shown once per page, until dismissed. */
export function PageGuide({ role, view, version = 0 }: { role: GuideRole; view: string; version?: number }) {
  const copy = PAGES[role][view];
  const [hidden, setHidden] = useState(() => !copy || read(pageKey(role, view)) === "seen");
  useEffect(() => { setHidden(!copy || read(pageKey(role, view)) === "seen"); }, [role, view, copy, version]);
  if (!copy || hidden) return null;
  const dismiss = () => { write(pageKey(role, view), "seen"); setHidden(true); };
  return (
    <aside className="gd-card" aria-label={`How ${copy.title} works`}>
      <span className="gd-ic" aria-hidden="true"><Lightbulb size={18} /></span>
      <div>
        <small>How this page works</small>
        <p>{copy.what}</p>
        {copy.steps && <ol>{copy.steps.map(step => <li key={step}>{step}</li>)}</ol>}
      </div>
      <button type="button" className="gd-x" onClick={dismiss} aria-label="Dismiss tip"><X size={16} /></button>
    </aside>
  );
}

/** The role walkthrough: a bottom sheet on phones, a centred card on larger screens. */
export function RoleTour({ role, name, onClose }: { role: Exclude<GuideRole, "student">; name: string; onClose: () => void }) {
  const slides = TOURS[role];
  const [step, setStep] = useState(0);
  const [closing, setClosing] = useState(false);
  const sheet = useRef<HTMLElement>(null);
  const begin = () => setClosing(true);
  const drag = useSheetDrag(sheet, begin);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") begin(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const slide = slides[step];
  const last = step === slides.length - 1;
  return (
    <div className={`gd-layer${closing ? " closing" : ""}`} role="presentation">
      <button type="button" className="gd-scrim" aria-label="Close tour" onClick={begin} />
      <section className="gd-sheet" role="dialog" aria-modal="true" aria-label="Welcome tour" ref={sheet} onAnimationEnd={event => { if (closing && event.target === event.currentTarget) onClose(); }}>
        <span className="gd-grab" aria-hidden="true" {...drag} />
        <div className="gd-top"><small>{step === 0 ? `Hi ${name}` : `Step ${step + 1} of ${slides.length}`}</small><button type="button" className="gd-skip" onClick={begin}>Skip</button></div>
        <div className="gd-body" key={step}>
          <h2>{slide.title}</h2>
          <p>{slide.lead}</p>
          <ul>{slide.points.map(point => <li key={point}>{point}</li>)}</ul>
        </div>
        <div className="gd-dots" aria-hidden="true">{slides.map((_, index) => <i key={index} className={index === step ? "on" : ""} />)}</div>
        <div className="gd-actions">
          {step > 0 && <button type="button" className="gd-back" onClick={() => setStep(step - 1)} aria-label="Back"><ArrowLeft size={18} /></button>}
          <button type="button" className="gd-next" onClick={() => (last ? begin() : setStep(step + 1))}>{last ? "Get started" : <>Next <ArrowRight size={17} /></>}</button>
        </div>
      </section>
    </div>
  );
}
