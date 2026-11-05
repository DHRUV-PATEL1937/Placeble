import { ArrowLeft, ArrowRight, BookOpenCheck, Bot, FileText, LineChart, Mic2, Sparkles, Target } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/pages/tpo/tpo-core";
import "./onboarding-guide.css";

/** Where the tour's last button can send the student. Matches the dashboard's view names. */
type TourTarget = "Resume Maker" | "Aptitude Test" | "Mock Interview" | "Agents" | "Overview";

const SLIDES = [
  {
    title: "Welcome to Placeble",
    lead: "Placeble gets you ready for placements. Practise, see exactly where you stand, and know what to do next.",
    visual: (
      <div className="wt-score" aria-hidden="true">
        <div className="wt-ring"><strong>72</strong><small>readiness</small></div>
        <ul>
          <li><i style={{ width: "88%" }} /><span>Resume</span></li>
          <li><i style={{ width: "64%" }} /><span>Aptitude</span></li>
          <li><i style={{ width: "76%" }} /><span>Interview</span></li>
        </ul>
      </div>
    ),
    points: ["One score out of 100 shows how ready you are", "It grows as you practise, so every session counts"],
  },
  {
    title: "Practise with tools that give feedback",
    lead: "Pick any tool. Each one gives instant feedback and feeds your score.",
    visual: (
      <div className="wt-tools" aria-hidden="true">
        <span><FileText size={22} /><b>Resume</b><small>ATS-ready in minutes</small></span>
        <span><BookOpenCheck size={22} /><b>Aptitude</b><small>Timed practice</small></span>
        <span><Mic2 size={22} /><b>Interview</b><small>Role-specific questions</small></span>
      </div>
    ),
    points: ["Start with your resume or an aptitude baseline", "Coding practice and group discussion are in Practice tools too"],
  },
  {
    title: "Stuck? Ask Ananya",
    lead: "Ananya is your assistant. Ask what to do next, how a score works, or to open any tool for you.",
    visual: (
      <div className="wt-chat" aria-hidden="true">
        <p className="you">What should I practise first?</p>
        <p className="bot"><Bot size={15} /> Start with a resume. It takes about 10 minutes and lifts your score right away.</p>
        <span className="wt-fab"><Bot size={16} /> Ask Ananya</span>
      </div>
    ),
    points: ["Find the Ask Ananya button at the bottom right on every page", "Ask in your own words, no commands to learn"],
  },
  {
    title: "Watch yourself improve",
    lead: "Your Progress page shows your score over time, and your action plan lists the best next step.",
    visual: (
      <div className="wt-progress" aria-hidden="true">
        <svg viewBox="0 0 220 90" role="img" aria-label="Score rising over time"><polyline points="6,78 50,62 92,66 136,40 178,28 214,12" /><circle cx="214" cy="12" r="5" /></svg>
        <span><Target size={15} /> Next step: take an aptitude test</span>
      </div>
    ),
    points: ["Come back every few days and try to beat your last score", "Your college can see your progress to support you"],
  },
] as const;

export function WelcomeTour({ firstName, onClose, onGo }: { firstName: string; onClose: () => void; onGo: (view: TourTarget) => void }) {
  const [step, setStep] = useState(0);
  const slide = SLIDES[step];
  const last = step === SLIDES.length - 1;

  return (
    <Modal title={step === 0 ? `Welcome, ${firstName}` : slide.title} onClose={onClose} wide>
      <div className="wt" role="group" aria-roledescription="tour" aria-label={`Step ${step + 1} of ${SLIDES.length}`}>
        <div className="wt-stage" key={step}>{slide.visual}</div>
        <div className="wt-copy" key={`c${step}`} aria-live="polite">
          {step === 0 && <h3>{slide.title}</h3>}
          <p className="wt-lead">{slide.lead}</p>
          <ul className="wt-points">{slide.points.map(point => <li key={point}><Sparkles size={14} aria-hidden="true" />{point}</li>)}</ul>
        </div>
        <ol className="wt-dots" aria-label="Tour progress">{SLIDES.map((item, index) => <li key={item.title}><button type="button" className={index === step ? "on" : index < step ? "seen" : ""} aria-label={`Go to step ${index + 1}: ${item.title}`} aria-current={index === step ? "step" : undefined} onClick={() => setStep(index)} /></li>)}</ol>
        <footer className="wt-foot">
          <button type="button" className="tp-btn ghost" onClick={onClose}>{last ? "Close" : "Skip tour"}</button>
          <span>
            {step > 0 && <button type="button" className="tp-btn ghost" onClick={() => setStep(step - 1)}><ArrowLeft size={15} aria-hidden="true" /> Back</button>}
            {last
              ? <button type="button" className="tp-btn primary" onClick={() => { onClose(); onGo("Agents"); }}><LineChart size={15} aria-hidden="true" /> Open practice tools</button>
              : <button type="button" className="tp-btn primary" onClick={() => setStep(step + 1)}>Next <ArrowRight size={15} aria-hidden="true" /></button>}
          </span>
        </footer>
      </div>
    </Modal>
  );
}
