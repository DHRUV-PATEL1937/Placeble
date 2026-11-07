import { ArrowRight, Check, CircleDashed, PlayCircle, X } from "lucide-react";
import type { Tool, View } from "@/pages/student/home/st-core";
import "./onboarding-guide.css";

const CORE: View[] = ["Resume Maker", "Aptitude Test", "Mock Interview", "Case Study", "HR Simulator"];

/**
 * A short checklist for new students, driven by real progress: a step ticks itself the moment the student has
 * evidence for it. Shows the next step prominently, and goes away on its own once the basics are done.
 */
export function GettingStarted({ tools, go, onTour, onDismiss }: { tools: Tool[]; go: (view: View) => void; onTour: () => void; onDismiss: () => void }) {
  // Only tools whose progress we can actually measure, so a step ticks itself and the list can finish.
  const steps = tools.filter(tool => CORE.includes(tool.view));
  const done = steps.filter(step => step.done).length;
  if (!steps.length || done === steps.length) return null;
  const currentIndex = steps.findIndex(step => !step.done);
  const percent = Math.round(done / steps.length * 100);

  return (
    <section className="gs" aria-labelledby="gs-title">
      <header>
        <div>
          <h2 id="gs-title">Get started with Placeble</h2>
          <p>{done === 0 ? `${steps.length} quick steps to your first readiness score.` : done === steps.length ? "You’ve covered the basics. Nice work." : `${done} of ${steps.length} done. Keep going.`}</p>
        </div>
        <div className="gs-actions">
          <button type="button" className="tp-btn ghost sm" onClick={onTour}><PlayCircle size={15} aria-hidden="true" /> Take the tour</button>
          <button type="button" className="tp-icon-btn" onClick={onDismiss} aria-label="Hide getting started"><X size={16} /></button>
        </div>
      </header>
      <div className="gs-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Getting started progress"><i style={{ width: `${percent}%` }} /></div>
      <ol className="gs-steps">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const state = step.done ? "done" : index === currentIndex ? "current" : "todo";
          return (
            <li key={step.view} className={state}>
              <button type="button" onClick={() => go(step.view)} aria-label={`${step.name}: ${state === "done" ? "done" : step.cta}`}>
                <span className="gs-mark" aria-hidden="true">{step.done ? <Check size={15} /> : state === "current" ? <Icon size={15} /> : <CircleDashed size={15} />}</span>
                <span className="gs-text"><b>{step.name}</b><small>{step.done ? step.metric : step.description}</small></span>
                <span className="gs-cta">{step.done ? "Review" : step.cta}<ArrowRight size={14} aria-hidden="true" /></span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
