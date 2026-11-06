import { AlertTriangle, ArrowLeft, ArrowRight, Bot, Briefcase, LineChart, RotateCcw, Scale, UserPlus, Users, UsersRound, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { AgentHistory } from "./AgentHistory";
import { ThinkingBot } from "./ThinkingBot";
import "./case-study.css";
import "./hr-sim.css";

const API_URL = import.meta.env.VITE_API_URL ?? "/api/v1";
const STEPS = 4;
const LEVELS = ["Easy", "Medium", "Hard"] as const;
type Level = typeof LEVELS[number];
type GroupId = "all" | "employees" | "recruitment" | "performance" | "policies";

const GROUPS: Array<{ id: Exclude<GroupId, "all">; label: string; hint: string; icon: LucideIcon }> = [
  { id: "employees", label: "Employees", hint: "Manage your workforce", icon: Users },
  { id: "recruitment", label: "Recruitment", hint: "Hire new talent", icon: UserPlus },
  { id: "performance", label: "Performance", hint: "Review employees", icon: LineChart },
  { id: "policies", label: "HR Policies", hint: "Rules and compliance", icon: Scale },
];
const CHALLENGES: Array<{ id: string; label: string; text: string; group: Exclude<GroupId, "all"> }> = [
  { id: "recruitment", label: "Recruitment", text: "Interview and select candidates", group: "recruitment" },
  { id: "salary", label: "Salary negotiation", text: "Negotiate employee compensation", group: "recruitment" },
  { id: "conflict", label: "Employee conflict", text: "Resolve workplace disputes", group: "employees" },
  { id: "performance", label: "Performance review", text: "Evaluate employee performance", group: "performance" },
  { id: "retention", label: "Employee retention", text: "Prevent talented employees leaving", group: "employees" },
  { id: "layoff", label: "Layoff management", text: "Handle workforce restructuring", group: "policies" },
  { id: "compliance", label: "HR compliance", text: "Identify policy and legal issues", group: "policies" },
  { id: "training", label: "Training & development", text: "Design employee training", group: "performance" },
  { id: "engagement", label: "Employee engagement", text: "Improve workplace culture", group: "employees" },
  { id: "leadership", label: "Leadership decisions", text: "Handle difficult management situations", group: "employees" },
];
const SKILLS: Array<[keyof Evaluation["skills"], string]> = [["decisionMaking", "Decision making"], ["communication", "Communication"], ["problemSolving", "Problem solving"], ["empathy", "Employee empathy"], ["policyAwareness", "Policy awareness"]];

type Step = { speaker: string; speakerRole: string; outcome: string; message: string; prompt: string; options: string[] };
type HrCase = { caseNumber: string; status: string; title: string; subtitle: string; company: string; headcount: number; monthlyBudget: string; impact: Array<{ value: string; label: string }>; people: Array<{ name: string; role: string; note: string }>; responsibility: string; step: Step };
type Decision = { speaker: string; message: string; options: string[]; chosen: number };
type Evaluation = { overallScore: number; verdict: string; skills: { decisionMaking: number; communication: number; problemSolving: number; empathy: number; policyAwareness: number }; feedback: string; improve: string };
type Busy = "" | "start" | "next" | "evaluate";

async function api<T>(path: string, token: string, body: unknown) {
  const response = await fetch(`${API_URL}${path}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "Something went wrong. Please try again.");
  return payload as T;
}
const initials = (name: string) => name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
const tone = (score: number) => score >= 75 ? "good" : score >= 55 ? "mid" : "low";

export function HRSimulator({ accessToken, onBack }: { accessToken: string; onBack: () => void }) {
  const [group, setGroup] = useState<GroupId>("all");
  const [level, setLevel] = useState<Level>("Medium");
  const [hrCase, setHrCase] = useState<HrCase | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const [history, setHistory] = useState<Decision[]>([]);
  const [pick, setPick] = useState(0);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [busy, setBusy] = useState<Busy>("");
  const [challenge, setChallenge] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState(0);

  const start = async (id: string) => {
    setChallenge(id); setBusy("start"); setError("");
    try {
      const { hrCase: next } = await api<{ hrCase: HrCase }>("/hr-sim/start", accessToken, { challenge: id, level });
      setHrCase(next); setStep(next.step); setHistory([]); setPick(0); setEvaluation(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not start the simulation."); }
    finally { setBusy(""); }
  };

  const decide = async () => {
    if (!hrCase || !step) return;
    const nextHistory = [...history, { speaker: step.speaker, message: step.message, options: step.options, chosen: pick }];
    setError("");
    try {
      if (nextHistory.length < STEPS) {
        setBusy("next");
        const { step: next } = await api<{ step: Step }>("/hr-sim/next", accessToken, { hrCase, history: nextHistory });
        setHistory(nextHistory); setStep(next); setPick(0);
      } else {
        setBusy("evaluate");
        const { evaluation: next } = await api<{ evaluation: Evaluation }>("/hr-sim/evaluate", accessToken, { hrCase, history: nextHistory });
        setHistory(nextHistory); setEvaluation(next); setResults(count => count + 1);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not continue. Please try again."); }
    finally { setBusy(""); }
  };

  const reset = () => { setHrCase(null); setStep(null); setHistory([]); setEvaluation(null); setError(""); };
  const list = CHALLENGES.filter(item => group === "all" || item.group === group);

  return (
    <div className="view-content cs-view hr-view">
      <header className="cs-top">
        <button type="button" className="tp-btn ghost sm" onClick={hrCase ? reset : onBack} disabled={Boolean(busy)}><ArrowLeft size={16} aria-hidden="true" /> {hrCase ? "New challenge" : "All tools"}</button>
        <div className="cs-top-title"><span><UsersRound size={16} aria-hidden="true" /></span><strong>HR Manager Simulator</strong><em className="hr-active">Active</em></div>
      </header>

      {error && <p className="cs-error" role="alert">{error}</p>}

      {busy === "start" && <section className="cs-card"><ThinkingBot title="Setting up your HR office" messages={["Opening a new case file…", "Meeting the people involved…", "Gathering the numbers…", "Your HR Director is ready…"]} /></section>}
      {busy === "evaluate" && <section className="cs-card"><ThinkingBot title="Evaluating your decisions" messages={["Reviewing every decision you made…", "Scoring your people skills…", "Checking policy awareness…", "Writing your mentor feedback…"]} /></section>}

      {!busy && !hrCase && (
        <>
          <section className="hr-banner">
            <small>Your current position</small>
            <h2>HR Manager</h2>
            <p>Corporate training environment · every case is newly written, with different people and numbers each time.</p>
          </section>

          <h3 className="hr-h">Your HR dashboard</h3>
          <div className="hr-tiles">
            {GROUPS.map(({ id, label, hint, icon: Icon }) => (
              <button key={id} type="button" className={`hr-tile${group === id ? " on" : ""}`} aria-pressed={group === id} onClick={() => setGroup(group === id ? "all" : id)}>
                <Icon size={20} aria-hidden="true" /><b>{label}</b><small>{hint}</small>
              </button>
            ))}
          </div>

          <div className="hr-row">
            <h3 className="hr-h">Today’s challenge</h3>
            <div className="cs-levels" role="radiogroup" aria-label="Difficulty">
              {LEVELS.map(item => <button key={item} type="button" role="radio" aria-checked={level === item} className={level === item ? "on" : ""} onClick={() => setLevel(item)}>{item}</button>)}
            </div>
          </div>
          <div className="hr-challenges">
            {list.map(item => (
              <button key={item.id} type="button" className="hr-challenge" disabled={Boolean(busy)} onClick={() => void start(item.id)}>
                <span><AlertTriangle size={16} aria-hidden="true" /><b>{item.label}</b></span>
                <small>{item.text}</small>
                <em>Handle this situation <ArrowRight size={14} aria-hidden="true" /></em>
              </button>
            ))}
          </div>
        </>
      )}

      {hrCase && step && busy !== "start" && busy !== "evaluate" && !evaluation && (
        <>
          <section className="hr-banner">
            <small>Your current position</small>
            <h2>HR Manager</h2>
            <p>{hrCase.company}</p>
            <dl className="hr-stats">
              <div><dt>{hrCase.headcount}</dt><dd>Employees</dd></div>
              <div><dt>{hrCase.monthlyBudget}</dt><dd>Monthly HR budget</dd></div>
              <div><dt>01</dt><dd>Open issue</dd></div>
            </dl>
          </section>

          <div className="hr-play">
            <section className="cs-card hr-case">
              <div className="hr-case-top"><b>CASE #{hrCase.caseNumber.replace(/^#?/, "")}</b><span className="hr-status">{hrCase.status}</span></div>
              <h2>{hrCase.title}</h2>
              <small className="cs-sub">{hrCase.subtitle}</small>
              <h3>{hrCase.people.length > 1 ? "People involved" : "Person involved"}</h3>
              <ul className="hr-people">
                {hrCase.people.map(person => (
                  <li key={person.name}><span className="hr-av">{initials(person.name)}</span><div><b>{person.name}</b><small>{person.role}</small><small>{person.note}</small></div></li>
                ))}
              </ul>
              <h3>Business impact</h3>
              <dl className="hr-impact">{hrCase.impact.map(item => <div key={item.label}><dt>{item.value}</dt><dd>{item.label}</dd></div>)}</dl>
              <div className="hr-resp"><b>Your responsibility</b><p>{hrCase.responsibility}</p></div>
            </section>

            <section className="cs-card hr-room" aria-busy={busy === "next"}>
              <div className="hr-room-top"><h3>Decision Room</h3><span className="hr-step">Step {history.length + 1} of {STEPS}</span></div>
              {busy === "next" ? (
                <ThinkingBot title="They’re reacting to your decision" messages={["Seeing how the team responds…", "Things are developing…", "Preparing the next moment…"]} />
              ) : (
                <>
                  {step.outcome && <p className="hr-outcome"><b>What happened:</b> {step.outcome}</p>}
                  <div className="hr-speaker"><span><Bot size={15} aria-hidden="true" /><b>{step.speaker}</b><small>{step.speakerRole}</small></span><p>{step.message}</p></div>
                  <fieldset className="hr-options">
                    <legend>{step.prompt}</legend>
                    {step.options.map((option, index) => (
                      <label key={option} className={pick === index ? "on" : ""}><input type="radio" name="hr-option" checked={pick === index} onChange={() => setPick(index)} /><span>{option}</span></label>
                    ))}
                  </fieldset>
                  <button type="button" className="tp-btn primary" onClick={() => void decide()}>{history.length + 1 === STEPS ? "Submit final decision" : "Submit HR decision"} <ArrowRight size={16} aria-hidden="true" /></button>
                  {history.length > 0 && (
                    <ol className="hr-log" aria-label="Your earlier decisions">
                      {history.map((item, index) => <li key={index}><small>Decision {index + 1}</small><span>{item.options[item.chosen]}</span></li>)}
                    </ol>
                  )}
                </>
              )}
            </section>
          </div>
        </>
      )}

      {evaluation && hrCase && (
        <section className="cs-card">
          <h2>Your HR Manager performance</h2>
          <div className="hr-score"><strong className={tone(evaluation.overallScore)}>{Math.round(evaluation.overallScore)}<small>/100</small></strong><span className={`hr-verdict ${tone(evaluation.overallScore)}`}>{evaluation.verdict}</span></div>
          <div className="hr-bars">
            {SKILLS.map(([key, label]) => (
              <div key={key}><div><b>{label}</b><span>{Math.round(evaluation.skills[key])}/100</span></div><i className="hr-bar"><u className={tone(evaluation.skills[key])} style={{ width: `${Math.max(2, Math.min(100, evaluation.skills[key]))}%` }} /></i></div>
            ))}
          </div>
          <div className="hr-feedback"><h3>AI mentor feedback</h3><p>{evaluation.feedback}</p><p><b>Improve:</b> {evaluation.improve}</p></div>
          <div className="hr-recap"><h3>Your decisions</h3><ol>{history.map((item, index) => <li key={index}><small>{item.speaker}: “{item.message}”</small><span>{item.options[item.chosen]}</span></li>)}</ol></div>
          <button type="button" className="tp-btn primary" onClick={reset}><RotateCcw size={16} aria-hidden="true" /> Try another challenge</button>
        </section>
      )}
      {!busy && (!hrCase || evaluation) && <AgentHistory path="/hr-sim/history" accessToken={accessToken} refreshKey={results} empty="Finish your first challenge and your scores will show up here." />}
      {!hrCase && !busy && <p className="cs-note hr-foot"><Briefcase size={14} aria-hidden="true" /> Pick a situation. Four decisions, then your mentor scores you.</p>}
    </div>
  );
}
