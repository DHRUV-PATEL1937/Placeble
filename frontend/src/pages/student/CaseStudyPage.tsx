import { ArrowLeft, ArrowRight, Briefcase, Coins, Cog, RotateCcw, Target, TrendingUp, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { ThinkingBot } from "./ThinkingBot";
import "./case-study.css";

const API_URL = import.meta.env.VITE_API_URL ?? "/api/v1";

const FOCUS: Array<{ id: string; label: string; hint: string; icon: LucideIcon }> = [
  { id: "Profitability", label: "Profitability", hint: "Improve company profits", icon: TrendingUp },
  { id: "Marketing", label: "Marketing", hint: "Grow market share", icon: Target },
  { id: "Finance", label: "Finance", hint: "Investment decisions", icon: Coins },
  { id: "Operations", label: "Operations", hint: "Improve efficiency", icon: Cog },
];
const LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;
const MINUTES: Record<string, number> = { Beginner: 10, Intermediate: 15, Advanced: 25 };

type CaseStudy = { title: string; company: string; scenario: string; brief: string; keyFacts: string[]; questions: string[] };
type Criterion = { score: number; note: string };
type Evaluation = { structure: Criterion; analysis: Criterion; recommendation: Criterion; communication: Criterion; overallScore: number; summary: string; strengths: string[]; improvements: string[]; modelApproach: string };
type Stage = "choose" | "preview" | "solve" | "result";

async function api<T>(path: string, token: string, body: unknown) {
  const response = await fetch(`${API_URL}${path}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "Something went wrong. Please try again.");
  return payload as T;
}

export function CaseStudyLab({ accessToken, onBack }: { accessToken: string; onBack: () => void }) {
  const [stage, setStage] = useState<Stage>("choose");
  const [focus, setFocus] = useState(FOCUS[0].id);
  const [level, setLevel] = useState<typeof LEVELS[number]>("Intermediate");
  const [caseStudy, setCaseStudy] = useState<CaseStudy | null>(null);
  const [answers, setAnswers] = useState(["", "", ""]);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const generate = async (nextFocus: string) => {
    setFocus(nextFocus); setBusy(true); setError("");
    try {
      const { caseStudy: next } = await api<{ caseStudy: CaseStudy }>("/case-studies/generate", accessToken, { focus: nextFocus, level });
      setCaseStudy(next); setAnswers(["", "", ""]); setEvaluation(null); setStage("preview");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create a case."); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (!caseStudy) return;
    setBusy(true); setError("");
    try {
      const { evaluation: next } = await api<{ evaluation: Evaluation }>("/case-studies/evaluate", accessToken, { caseStudy, answers });
      setEvaluation(next); setStage("result");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not review your answers."); }
    finally { setBusy(false); }
  };

  const restart = () => { setStage("choose"); setCaseStudy(null); setEvaluation(null); setError(""); };
  const answered = answers.filter(answer => answer.trim().length >= 20).length;

  return (
    <div className="view-content cs-view">
      <header className="cs-top">
        <button type="button" className="tp-btn ghost sm" onClick={stage === "choose" ? onBack : restart} disabled={busy}><ArrowLeft size={16} aria-hidden="true" /> {stage === "choose" ? "All tools" : "New case"}</button>
        <div className="cs-top-title"><span><Briefcase size={16} aria-hidden="true" /></span><strong>Business Case Solver</strong></div>
      </header>

      {error && <p className="cs-error" role="alert">{error}</p>}

      {busy && stage === "choose" && <section className="cs-card"><ThinkingBot title={`Writing a ${focus.toLowerCase()} case for you`} messages={["Picking a company and a situation…", "Setting up the numbers…", "Framing the questions…", "Almost ready…"]} /></section>}
      {busy && stage === "solve" && <section className="cs-card"><ThinkingBot title="Reviewing your answers" messages={["Reading your answers carefully…", "Checking your structure and logic…", "Weighing your recommendation…", "Writing your feedback…"]} /></section>}
      {busy && stage === "preview" && <section className="cs-card"><ThinkingBot title="Writing a different case" messages={["Thinking of a new situation…", "Setting up the numbers…"]} /></section>}

      {!busy && stage === "choose" && (
        <section className="cs-card">
          <div className="cs-head"><span className="cs-badge"><Briefcase size={22} aria-hidden="true" /></span><div><h2>Business Case Solver</h2><p>Think like a management consultant</p></div></div>
          <h3>Choose your challenge</h3>
          <div className="cs-levels" role="radiogroup" aria-label="Difficulty">
            {LEVELS.map(item => <button key={item} type="button" role="radio" aria-checked={level === item} className={level === item ? "on" : ""} onClick={() => setLevel(item)}>{item}</button>)}
          </div>
          <div className="cs-grid">
            {FOCUS.map(({ id, label, hint, icon: Icon }) => (
              <button key={id} type="button" className="cs-focus" disabled={busy} onClick={() => void generate(id)}>
                <Icon size={20} aria-hidden="true" /><span><b>{label}</b><small>{hint}</small></span>
              </button>
            ))}
          </div>
          <p className="cs-note">Every case is newly written by AI, so no two attempts are the same.</p>
        </section>
      )}

      {!busy && stage === "preview" && caseStudy && (
        <section className="cs-card">
          <h3>Your challenge</h3>
          <div className="cs-challenge">
            <small>{caseStudy.company} · {focus}</small>
            <h2>{caseStudy.title}</h2>
            <p>{caseStudy.brief}</p>
            <span className="cs-pill">{level} · {MINUTES[level]} minutes</span>
            <button type="button" className="tp-btn primary" onClick={() => setStage("solve")}>Start Case Study <ArrowRight size={16} aria-hidden="true" /></button>
            <button type="button" className="tp-btn ghost" disabled={busy} onClick={() => void generate(focus)}>Give me a different case</button>
          </div>
        </section>
      )}

      {!busy && stage === "solve" && caseStudy && (
        <section className="cs-card">
          <small className="cs-eyebrow">{caseStudy.company} · {focus} · {level}</small>
          <h2>{caseStudy.title}</h2>
          <p className="cs-scenario">{caseStudy.scenario}</p>
          <h3>Key facts</h3>
          <ul className="cs-facts">{caseStudy.keyFacts.map(fact => <li key={fact}>{fact}</li>)}</ul>
          {caseStudy.questions.map((question, index) => (
            <label key={question} className="cs-q">
              <span><b>{index + 1}.</b> {question}</span>
              <textarea rows={5} maxLength={4000} value={answers[index]} placeholder="Write your answer. Use the facts above and explain your reasoning." onChange={event => setAnswers(answers.map((value, position) => position === index ? event.target.value : value))} />
            </label>
          ))}
          <button type="button" className="tp-btn primary" disabled={busy || answered === 0} onClick={() => void submit()}>Submit for review</button>
        </section>
      )}

      {stage === "result" && evaluation && (
        <section className="cs-card">
          <div className="cs-score"><strong>{Math.round(evaluation.overallScore)}</strong><span>out of 100</span></div>
          <p>{evaluation.summary}</p>
          <div className="cs-grid">
            {([["Structure", evaluation.structure], ["Analysis", evaluation.analysis], ["Recommendation", evaluation.recommendation], ["Communication", evaluation.communication]] as const).map(([label, item]) => (
              <div key={label} className="cs-crit"><b>{label} · {item.score}/10</b><small>{item.note}</small></div>
            ))}
          </div>
          <h3>What worked</h3><ul>{evaluation.strengths.map(item => <li key={item}>{item}</li>)}</ul>
          <h3>Improve next time</h3><ul>{evaluation.improvements.map(item => <li key={item}>{item}</li>)}</ul>
          <h3>How a strong answer approaches it</h3><p>{evaluation.modelApproach}</p>
          <button type="button" className="tp-btn primary" onClick={restart}><RotateCcw size={16} aria-hidden="true" /> Try another case</button>
        </section>
      )}
    </div>
  );
}
