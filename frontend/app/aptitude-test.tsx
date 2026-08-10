"use client";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Code2,
  Flag,
  History,
  Lightbulb,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  Play,
  RefreshCw,
  Send,
  Target,
  TimerReset,
  Trophy,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReadinessScoreRing } from "./readiness-score-ring";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
type Category = "quant" | "logical" | "verbal" | "coding";
type Difficulty = "easy" | "medium" | "hard";
type Screen = "home" | "setup" | "test" | "results" | "review";
type Question = { _id: string; category: Category; topic: string; difficulty: Difficulty; prompt: string; options: string[]; starterCode: Record<string, string>; testCases: { input: string; expectedOutput: string }[]; testCaseCount: number; timeLimitSeconds: number; correctOptionIndex?: number; explanation?: string };
type AttemptResponse = { questionId: string; selectedOptionIndex?: number; codeSubmission?: { language: string; code: string }; isCorrect?: boolean; awardedFraction?: number; timeSpentSeconds: number };
type Attempt = { _id: string; sections: Category[]; questionIds: string[]; responses: AttemptResponse[]; scoreTotal: number; scoreByCategory: Record<string, number>; scoreByTopic: Record<string, number>; startedAt: string; completedAt?: string; durationSeconds: number; status: "in_progress" | "completed" | "abandoned"; mode: "balanced" | "focused"; focusTopic?: string };
type HeatmapItem = { topic: string; category: Category; score: number; attempts: number; lastPractisedAt: string };
type AttemptPayload = { attempt: Attempt; questions: Question[]; heatmap?: HeatmapItem[] };
type Summary = { attempts: Attempt[]; inProgress: Pick<Attempt, "_id" | "sections" | "startedAt" | "durationSeconds" | "questionIds" | "mode" | "focusTopic"> | null; heatmap: HeatmapItem[]; questionCounts: Record<Category, number>; codingAvailable: boolean; dynamicQuestionCount: number; lastDynamicRefreshAt: string | null; generationBatchId: string; dynamicRefreshWarning: string };
type AnswerDraft = { selectedOptionIndex?: number; codeSubmission?: { language: string; code: string }; timeSpentSeconds: number };
type Job = { id: string; status: "queued" | "processing" | "complete" | "failed"; result?: AttemptPayload | { passed: number; total: number; results: { passed: boolean; status: string; output?: string; error?: string }[] }; error?: string };

const categoryMeta: Record<Category, { label: string; description: string; icon: typeof BrainCircuit }> = {
  quant: { label: "Quantitative", description: "Arithmetic, data and applied maths", icon: BarChart3 },
  logical: { label: "Logical reasoning", description: "Patterns, deductions and constraints", icon: BrainCircuit },
  verbal: { label: "Verbal ability", description: "Grammar, vocabulary and comprehension", icon: BookOpenCheck },
  coding: { label: "Coding", description: "Isolated execution against test cases", icon: Code2 },
};

async function api<T>(path: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, ...init.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message ?? "The request could not be completed.");
  return { payload: payload as T, status: response.status };
}

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60).toString().padStart(2, "0")}:${(safe % 60).toString().padStart(2, "0")}`;
}

function topicLabel(topic: string) {
  return topic.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function scoreBand(score: number) {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Building";
  return "Focus next";
}

function heatColor(score: number) {
  if (score < 25) return "#182958";
  if (score < 45) return "#304478";
  if (score < 65) return "#5b5d7f";
  if (score < 80) return "#9b744f";
  return "#d29038";
}

export function AptitudeTest({ accessToken, onBack }: { accessToken: string; onBack: () => void }) {
  const [screen, setScreen] = useState<Screen>("home");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [payload, setPayload] = useState<AttemptPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerDraft>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [selectedSections, setSelectedSections] = useState<Category[]>(["quant", "logical", "verbal"]);
  const [questionCount, setQuestionCount] = useState(10);
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [difficulty, setDifficulty] = useState<Difficulty | "mixed">("mixed");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bankRefreshing, setBankRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [questionElapsed, setQuestionElapsed] = useState(0);
  const [timeExpired, setTimeExpired] = useState(false);
  const [submitConfirm, setSubmitConfirm] = useState(false);
  const [codeRun, setCodeRun] = useState<{ questionId: string; running: boolean; result?: { passed: number; total: number; results: { passed: boolean; status: string; output?: string; error?: string }[] }; error?: string } | null>(null);
  const submittingRef = useRef(false);

  const loadSummary = useCallback(async () => {
    const { payload: next } = await api<Summary>("/aptitude/summary", accessToken);
    setSummary(next);
  }, [accessToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSummary().catch(cause => setError(cause instanceof Error ? cause.message : "Could not load aptitude practice.")).finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSummary]);

  const openAttempt = useCallback((next: AttemptPayload, target: Screen = "test") => {
    setPayload(next);
    setAnswers(Object.fromEntries(next.attempt.responses.map(response => [response.questionId, { selectedOptionIndex: response.selectedOptionIndex, codeSubmission: response.codeSubmission, timeSpentSeconds: response.timeSpentSeconds ?? 0 }])));
    setQuestionIndex(0);
    setReviewIndex(0);
    setScreen(target);
    setTimeExpired(false);
    setError("");
    setQuestionElapsed(0);
  }, []);

  const resumeAttempt = async (attemptId: string) => {
    setBusy(true); setError("");
    try { const { payload: next } = await api<AttemptPayload>(`/aptitude/attempts/${attemptId}`, accessToken); openAttempt(next); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not resume this attempt."); }
    finally { setBusy(false); }
  };

  const abandonAttempt = async (attemptId: string) => {
    setBusy(true); setError("");
    try { await api(`/aptitude/attempts/${attemptId}/abandon`, accessToken, { method: "POST", body: "{}" }); await loadSummary(); setNotice("Previous attempt closed. You can start fresh now."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not close that attempt."); }
    finally { setBusy(false); }
  };

  const startAttempt = async (topic?: string, category?: Category) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const body = topic
        ? { sections: [category], questionCount: 5, durationMinutes: 8, difficulty: "mixed", topic }
        : { sections: selectedSections, questionCount, durationMinutes, difficulty };
      const { payload: next } = await api<AttemptPayload>("/aptitude/attempts", accessToken, { method: "POST", body: JSON.stringify(body) });
      openAttempt(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start this test."); }
    finally { setBusy(false); }
  };

  const currentQuestion = payload?.questions[questionIndex];

  const saveQuestion = useCallback(async (question: Question, draft: AnswerDraft) => {
    const nextDraft = { ...draft, timeSpentSeconds: Math.max(draft.timeSpentSeconds ?? 0, questionElapsed) };
    setAnswers(current => ({ ...current, [question._id]: nextDraft }));
    await api(`/aptitude/attempts/${payload!.attempt._id}/response`, accessToken, { method: "PATCH", body: JSON.stringify({ questionId: question._id, ...nextDraft }) });
  }, [accessToken, payload, questionElapsed]);

  const chooseOption = async (optionIndex: number) => {
    if (!currentQuestion) return;
    const draft = { ...(answers[currentQuestion._id] ?? { timeSpentSeconds: 0 }), selectedOptionIndex: optionIndex };
    setAnswers(current => ({ ...current, [currentQuestion._id]: draft }));
    try { await saveQuestion(currentQuestion, draft); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Your answer could not be saved."); }
  };

  const goToQuestion = async (index: number) => {
    if (!payload || !currentQuestion || index < 0 || index >= payload.questions.length) return;
    const draft = answers[currentQuestion._id];
    if (draft && (draft.selectedOptionIndex !== undefined || draft.codeSubmission)) {
      try { await saveQuestion(currentQuestion, draft); } catch { setNotice("We’ll retry saving that answer when you submit."); }
    }
    setQuestionIndex(index);
    setQuestionElapsed(0);
  };

  const pollJob = useCallback(async (jobId: string) => {
    for (let attempt = 0; attempt < 260; attempt += 1) {
      await new Promise(resolve => window.setTimeout(resolve, 450));
      const { payload: response } = await api<{ job: Job }>(`/aptitude/jobs/${jobId}`, accessToken);
      if (response.job.status === "failed") throw new Error(response.job.error ?? "The background task failed.");
      if (response.job.status === "complete") return response.job;
    }
    throw new Error("The background task took too long. Please try again.");
  }, [accessToken]);

  const refreshQuestionBank = async () => {
    setBankRefreshing(true); setError(""); setNotice("");
    try {
      const { payload: queued } = await api<{ job: Job }>("/aptitude/question-bank/refresh", accessToken, { method: "POST", body: "{}" });
      await pollJob(queued.job.id);
      await loadSummary();
      setNotice("Question bank refreshed with a new Gemini-generated placement set.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not refresh the question bank."); }
    finally { setBankRefreshing(false); }
  };

  const runCode = async () => {
    if (!payload || !currentQuestion) return;
    const submission = answers[currentQuestion._id]?.codeSubmission;
    if (!submission?.code.trim()) return;
    setCodeRun({ questionId: currentQuestion._id, running: true });
    try {
      await saveQuestion(currentQuestion, answers[currentQuestion._id]);
      const { payload: queued } = await api<{ job: Job }>(`/aptitude/attempts/${payload.attempt._id}/run-code`, accessToken, { method: "POST", body: JSON.stringify({ questionId: currentQuestion._id, ...submission }) });
      const complete = await pollJob(queued.job.id);
      setCodeRun({ questionId: currentQuestion._id, running: false, result: complete.result as { passed: number; total: number; results: { passed: boolean; status: string; output?: string; error?: string }[] } });
    } catch (cause) { setCodeRun({ questionId: currentQuestion._id, running: false, error: cause instanceof Error ? cause.message : "Code execution failed." }); }
  };

  const finishTest = useCallback(async (expired = false) => {
    if (!payload || submittingRef.current) return;
    submittingRef.current = true; setBusy(true); setSubmitConfirm(false); setError("");
    try {
      const question = payload.questions[questionIndex];
      const draft = question ? answers[question._id] : undefined;
      if (question && draft && (draft.selectedOptionIndex !== undefined || draft.codeSubmission)) await saveQuestion(question, draft);
      const { payload: response, status } = await api<AttemptPayload & { job?: Job }>(`/aptitude/attempts/${payload.attempt._id}/submit`, accessToken, { method: "POST", body: "{}" });
      let result = response;
      if (status === 202 && response.job) {
        const complete = await pollJob(response.job.id);
        result = complete.result as AttemptPayload;
      }
      openAttempt(result, "results");
      setTimeExpired(expired);
      await loadSummary();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit this test."); }
    finally { submittingRef.current = false; setBusy(false); }
  }, [payload, questionIndex, answers, saveQuestion, accessToken, openAttempt, loadSummary, pollJob]);

  useEffect(() => {
    if (screen !== "test" || !payload) return;
    const tick = () => {
      const end = new Date(payload.attempt.startedAt).getTime() + payload.attempt.durationSeconds * 1000;
      const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setTimeRemaining(remaining);
      setQuestionElapsed(current => current + 1);
      if (remaining === 0 && !submittingRef.current) void finishTest(true);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [screen, payload, finishTest]);

  const reviewAttempt = async (attemptId: string) => {
    setBusy(true); setError("");
    try { const { payload: next } = await api<AttemptPayload>(`/aptitude/attempts/${attemptId}`, accessToken); openAttempt(next, "review"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open review mode."); }
    finally { setBusy(false); }
  };

  const answeredCount = useMemo(() => Object.values(answers).filter(answer => answer.selectedOptionIndex !== undefined || answer.codeSubmission?.code.trim()).length, [answers]);
  const completedAttempts = summary?.attempts ?? [];
  const latestScore = completedAttempts[0]?.scoreTotal ?? 0;
  const averageScore = completedAttempts.length ? Math.round(completedAttempts.reduce((sum, attempt) => sum + attempt.scoreTotal, 0) / completedAttempts.length) : 0;

  if (loading) return <div className="view-content inner-view apt-loading"><LoaderCircle size={28} /><h2>Opening Aptitude Practice</h2><p>Preparing your question bank and recent progress.</p></div>;

  if (screen === "setup") return <div className="view-content inner-view aptitude-view"><AptitudeTop onBack={() => setScreen("home")} label="Test setup" />
    <section className="apt-setup"><header><p className="eyebrow">Build your practice set</p><h1>Choose the signal you want to strengthen.</h1><p>Questions are sampled from the active MongoDB bank, including the latest validated Gemini batch. Scores use stored answer keys—never AI judgement.</p></header>
      {error && <AptitudeMessage type="error" text={error} onClose={() => setError("")} />}
      <div className="apt-setup-grid"><div className="apt-setup-main"><section><div className="apt-section-heading"><span>1</span><div><h3>Sections</h3><p>Select one or combine them for a balanced test.</p></div></div><div className="apt-category-picker">{(Object.keys(categoryMeta) as Category[]).map(category => { const meta = categoryMeta[category]; const Icon = meta.icon; const disabled = category === "coding" && !summary?.codingAvailable; return <button key={category} disabled={disabled} className={selectedSections.includes(category) ? "selected" : ""} onClick={() => setSelectedSections(current => current.includes(category) ? current.filter(item => item !== category) : [...current, category])}><span><Icon size={19} /></span><div><strong>{meta.label}</strong><small>{meta.description}</small>{disabled && <em><LockKeyhole size={11} /> Judge0 required</em>}</div><i>{selectedSections.includes(category) ? <Check size={14} /> : <Circle size={14} />}</i></button>; })}</div></section>
        <section><div className="apt-section-heading"><span>2</span><div><h3>Difficulty</h3><p>A mixed set follows a 30/50/20 easy-medium-hard distribution.</p></div></div><div className="apt-segmented">{(["mixed", "easy", "medium", "hard"] as const).map(value => <button className={difficulty === value ? "active" : ""} key={value} onClick={() => setDifficulty(value)}>{value === "mixed" ? "Balanced mix" : value}</button>)}</div></section>
        <section><div className="apt-section-heading"><span>3</span><div><h3>Length and pace</h3><p>Adjust the session to the time you have now.</p></div></div><div className="apt-number-options"><label><span>Questions</span><div>{[5, 10, 15].map(value => <button className={questionCount === value ? "active" : ""} key={value} onClick={() => setQuestionCount(value)}>{value}</button>)}</div></label><label><span>Duration</span><div>{[10, 15, 25].map(value => <button className={durationMinutes === value ? "active" : ""} key={value} onClick={() => setDurationMinutes(value)}>{value} min</button>)}</div></label></div></section></div>
        <aside className="apt-setup-summary"><span><ListChecks size={21} /></span><p>Practice summary</p><h3>{questionCount} questions · {durationMinutes} minutes</h3><ul>{selectedSections.map(category => <li key={category}><Check size={13} />{categoryMeta[category].label}</li>)}</ul><div><small>Grading method</small><strong>Deterministic answer-key lookup</strong><em>No Gemini call is involved in scoring.</em></div><button className="button button-primary" disabled={busy || !selectedSections.length} onClick={() => void startAttempt()}>{busy ? <LoaderCircle size={16} /> : <Play size={16} />} Start timed test</button></aside></div>
    </section>
  </div>;

  if (screen === "test" && payload && currentQuestion) {
    const currentAnswer = answers[currentQuestion._id] ?? { timeSpentSeconds: 0 };
    const CurrentIcon = categoryMeta[currentQuestion.category].icon;
    const timerState = timeRemaining <= 60 ? "danger" : timeRemaining <= 180 ? "warning" : "";
    return <div className="view-content inner-view aptitude-view apt-test-view"><header className="apt-test-top"><button onClick={() => setSubmitConfirm(true)}><X size={18} /> Exit test</button><div><span>{payload.attempt.mode === "focused" ? `${topicLabel(payload.attempt.focusTopic ?? "")} drill` : "Balanced aptitude test"}</span><strong>Question {questionIndex + 1} of {payload.questions.length}</strong></div><div className={`apt-timer ${timerState}`}><Clock3 size={17} /><span><small>Time remaining</small><strong>{formatTime(timeRemaining)}</strong></span></div></header>
      <div className="apt-test-progress"><span style={{ width: `${(questionIndex + 1) / payload.questions.length * 100}%` }} /></div>
      {error && <AptitudeMessage type="error" text={error} onClose={() => setError("")} />}
      {notice && <AptitudeMessage type="notice" text={notice} onClose={() => setNotice("")} />}
      <div className="apt-test-layout"><aside className="apt-question-nav"><header><span>Questions</span><em>{answeredCount}/{payload.questions.length} answered</em></header><div>{payload.questions.map((question, index) => <button key={question._id} className={`${index === questionIndex ? "current" : ""} ${answers[question._id]?.selectedOptionIndex !== undefined || answers[question._id]?.codeSubmission?.code.trim() ? "answered" : ""}`} onClick={() => void goToQuestion(index)}>{index + 1}</button>)}</div><footer><span><i className="answered" />Answered</span><span><i />Not answered</span></footer></aside>
        <main className="apt-question-card"><header><span className={`difficulty ${currentQuestion.difficulty}`}>{currentQuestion.difficulty}</span><span><CurrentIcon size={14} />{categoryMeta[currentQuestion.category].label}</span><span>{topicLabel(currentQuestion.topic)}</span></header><h1>{currentQuestion.prompt}</h1>
          {currentQuestion.category !== "coding" ? <div className="apt-options">{currentQuestion.options.map((option, index) => <button className={currentAnswer.selectedOptionIndex === index ? "selected" : ""} key={option} onClick={() => void chooseOption(index)}><span>{String.fromCharCode(65 + index)}</span><p>{option}</p><i>{currentAnswer.selectedOptionIndex === index ? <CheckCircle2 size={20} /> : <Circle size={20} />}</i></button>)}</div> : <CodingQuestion question={currentQuestion} answer={currentAnswer} onChange={draft => setAnswers(current => ({ ...current, [currentQuestion._id]: draft }))} onRun={() => void runCode()} runState={codeRun?.questionId === currentQuestion._id ? codeRun : null} />}
          <footer><button disabled={questionIndex === 0} onClick={() => void goToQuestion(questionIndex - 1)}><ChevronLeft size={16} /> Previous</button><span>Answers save as you go</span>{questionIndex === payload.questions.length - 1 ? <button className="primary" onClick={() => setSubmitConfirm(true)}>Review & submit <Send size={15} /></button> : <button className="primary" onClick={() => void goToQuestion(questionIndex + 1)}>Next <ChevronRight size={16} /></button>}</footer></main></div>
      {submitConfirm && <div className="apt-dialog-layer"><button className="apt-dialog-scrim" aria-label="Close" onClick={() => setSubmitConfirm(false)} /><section className="apt-submit-dialog"><span><Flag size={21} /></span><p className="eyebrow">Before you finish</p><h2>Submit this practice test?</h2><p>You answered <strong>{answeredCount} of {payload.questions.length}</strong> questions. Unanswered questions will receive zero marks.</p><div><button onClick={() => setSubmitConfirm(false)}>Keep working</button><button className="button button-primary" disabled={busy} onClick={() => void finishTest(false)}>{busy ? <LoaderCircle size={16} /> : <Send size={16} />} Submit test</button></div></section></div>}
      {busy && <div className="apt-grading"><LoaderCircle size={25} /><h2>{payload.attempt.sections.includes("coding") ? "Running final test cases" : "Calculating your result"}</h2><p>Your score is being calculated from answer keys and test-case outcomes.</p></div>}
    </div>;
  }

  if (screen === "results" && payload) return <div className="view-content inner-view aptitude-view"><AptitudeTop onBack={() => { setScreen("home"); void loadSummary(); }} label="Results" />
    {timeExpired && <AptitudeMessage type="notice" text="Time’s up—your saved answers were submitted automatically." onClose={() => setTimeExpired(false)} />}
    <section className="apt-results-hero"><div className="apt-result-score"><ReadinessScoreRing score={payload.attempt.scoreTotal} compact label="Aptitude score" /><span><small>Overall score</small><strong>{payload.attempt.scoreTotal}<em>/100</em></strong><p>{scoreBand(payload.attempt.scoreTotal)} · {payload.questions.length} questions completed</p></span></div><div><p className="eyebrow">Practice complete</p><h1>{payload.attempt.scoreTotal >= 80 ? "Strong work. Keep the edge sharp." : payload.attempt.scoreTotal >= 60 ? "Good foundation. Now target the gaps." : "Useful baseline. Your next step is clear."}</h1><p>Every mark came from deterministic grading. Use the topic map below to turn this attempt into focused progress.</p><div><button className="button button-secondary" onClick={() => { setReviewIndex(0); setScreen("review"); }}><BookOpenCheck size={16} /> Review answers</button><button className="button button-primary" onClick={() => setScreen("setup")}><RefreshCw size={16} /> New test</button></div></div></section>
    <section className="apt-result-grid"><article className="apt-result-panel"><header><div><p className="eyebrow">Category breakdown</p><h2>Where your score came from</h2></div><Target size={19} /></header><div className="apt-category-results">{payload.attempt.sections.map(category => <div key={category}><span>{categoryMeta[category].label}<strong>{payload.attempt.scoreByCategory?.[category] ?? 0}%</strong></span><i><b style={{ width: `${payload.attempt.scoreByCategory?.[category] ?? 0}%` }} /></i></div>)}</div></article><article className="apt-result-panel"><header><div><p className="eyebrow">Attempt detail</p><h2>Clear, explainable scoring</h2></div><ListChecks size={19} /></header><div className="apt-result-facts"><span><strong>{payload.attempt.responses.filter(response => response.isCorrect).length}</strong><small>Fully correct</small></span><span><strong>{payload.attempt.responses.length}</strong><small>Answered</small></span><span><strong>{Math.round(payload.attempt.responses.reduce((sum, response) => sum + (response.timeSpentSeconds ?? 0), 0) / 60)}</strong><small>Minutes used</small></span></div></article></section>
    <Heatmap items={payload.heatmap ?? summary?.heatmap ?? []} onRetry={(item) => void startAttempt(item.topic, item.category)} busy={busy} />
  </div>;

  if (screen === "review" && payload) {
    const question = payload.questions[reviewIndex];
    const response = payload.attempt.responses.find(item => item.questionId === question._id);
    return <div className="view-content inner-view aptitude-view apt-review-view"><AptitudeTop onBack={() => setScreen("results")} label="Answer review" /><div className="apt-review-progress"><span>{reviewIndex + 1} of {payload.questions.length}</span><div><i style={{ width: `${(reviewIndex + 1) / payload.questions.length * 100}%` }} /></div><strong>{response?.isCorrect ? "Correct" : "Needs review"}</strong></div><article className="apt-review-card"><header><span>{categoryMeta[question.category].label}</span><span>{topicLabel(question.topic)}</span><span>{question.difficulty}</span></header><h1>{question.prompt}</h1>{question.category !== "coding" ? <div className="apt-review-options">{question.options.map((option, index) => { const selected = response?.selectedOptionIndex === index; const correct = question.correctOptionIndex === index; return <div className={`${selected ? "selected" : ""} ${correct ? "correct" : ""}`} key={option}><span>{String.fromCharCode(65 + index)}</span><p>{option}</p>{correct && <em><Check size={14} /> Correct answer</em>}{selected && !correct && <em>Your answer</em>}</div>; })}</div> : <pre className="apt-review-code">{response?.codeSubmission?.code ?? "No code submitted."}</pre>}<section className="apt-explanation"><span><Lightbulb size={18} /></span><div><strong>Explanation</strong><p>{question.explanation || "Review the expected output and test-case result above."}</p></div></section><footer><button disabled={reviewIndex === 0} onClick={() => setReviewIndex(index => index - 1)}><ChevronLeft size={16} /> Previous</button>{reviewIndex === payload.questions.length - 1 ? <button className="primary" onClick={() => setScreen("results")}>Back to results <ArrowRight size={16} /></button> : <button className="primary" onClick={() => setReviewIndex(index => index + 1)}>Next explanation <ChevronRight size={16} /></button>}</footer></article></div>;
  }

  return <div className="view-content inner-view aptitude-view"><AptitudeTop onBack={onBack} label="Aptitude Practice" />
    {error && <AptitudeMessage type="error" text={error} onClose={() => setError("")} />}{notice && <AptitudeMessage type="notice" text={notice} onClose={() => setNotice("")} />}
    <section className="apt-home-hero"><div><p className="eyebrow">Practice with proof</p><h1>Know exactly what to strengthen next.</h1><p>Timed, current placement-style aptitude practice across quant, logic and verbal ability—with transparent scoring and one-tap drills for weak topics.</p><div><button className="button button-primary" onClick={() => setScreen("setup")}><Play size={17} /> Start a test</button>{summary?.heatmap?.[0] && <button className="button button-secondary" disabled={busy} onClick={() => void startAttempt(summary.heatmap[0].topic, summary.heatmap[0].category)}><Target size={17} /> Drill {topicLabel(summary.heatmap[0].topic)}</button>}</div><small><CheckCircle2 size={14} /> Gemini refreshes the bank; grading always uses stored, deterministic answer keys.</small></div><div className="apt-home-score"><ReadinessScoreRing score={latestScore || 64} label="Latest aptitude score" /><span><strong>{completedAttempts.length ? "Latest score" : "Starter benchmark"}</strong><p>{completedAttempts.length ? `${latestScore}/100 · ${scoreBand(latestScore)}` : "Take your first test to replace this benchmark."}</p></span></div></section>
    <section className="apt-bank-status"><span><RefreshCw size={19} /></span><div><p className="eyebrow">Live question bank</p><strong>{summary?.dynamicQuestionCount ?? 0} Gemini-refreshed questions plus a curated fallback</strong><small>{summary?.lastDynamicRefreshAt ? `Updated ${new Date(summary.lastDynamicRefreshAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}. Tests randomly sample the active MongoDB bank and avoid recent repeats.` : "A fresh Gemini batch will be generated while the curated bank keeps practice available."}</small>{summary?.dynamicRefreshWarning && <em>{summary.dynamicRefreshWarning}</em>}</div><button disabled={bankRefreshing} onClick={() => void refreshQuestionBank()}>{bankRefreshing ? <LoaderCircle size={15} /> : <RefreshCw size={15} />} {bankRefreshing ? "Refreshing..." : "Refresh questions"}</button></section>
    {summary?.inProgress && <section className="apt-resume-banner"><span><TimerReset size={20} /></span><div><strong>You have an unfinished test</strong><p>{summary.inProgress.questionIds.length} questions · started {new Date(summary.inProgress.startedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}. Resume with the original timer or close it and start fresh.</p></div><button disabled={busy} onClick={() => void abandonAttempt(summary.inProgress!._id)}>Abandon</button><button className="button button-primary" disabled={busy} onClick={() => void resumeAttempt(summary.inProgress!._id)}><Play size={15} /> Resume</button></section>}
    <section className="apt-home-stats"><article><span><Trophy size={18} /></span><div><small>Average score</small><strong>{completedAttempts.length ? averageScore : "—"}</strong><p>Across completed tests</p></div></article><article><span><History size={18} /></span><div><small>Tests completed</small><strong>{completedAttempts.length}</strong><p>{completedAttempts.length ? "Building a reliable signal" : "Your history starts here"}</p></div></article><article><span><Target size={18} /></span><div><small>Next focus</small><strong>{summary?.heatmap?.[0] ? topicLabel(summary.heatmap[0].topic) : "Baseline"}</strong><p>{summary?.heatmap?.[0] ? `${summary.heatmap[0].score}% across ${summary.heatmap[0].attempts} questions` : "Complete one mixed test"}</p></div></article></section>
    {completedAttempts.length ? <><Heatmap items={summary?.heatmap ?? []} onRetry={item => void startAttempt(item.topic, item.category)} busy={busy} /><section className="apt-history"><header><div><p className="eyebrow">Attempt history</p><h2>Your recent practice</h2></div><span>{completedAttempts.length} completed</span></header><div>{completedAttempts.map((attempt, index) => <article key={attempt._id}><span className="apt-history-score">{attempt.scoreTotal}</span><div><strong>{attempt.mode === "focused" ? `${topicLabel(attempt.focusTopic ?? "Focused")} drill` : "Balanced aptitude test"}</strong><small>{new Date(attempt.completedAt ?? attempt.startedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {attempt.questionIds.length} questions · {attempt.sections.map(category => categoryMeta[category].label).join(", ")}</small></div><em>{index === 0 ? "Latest" : scoreBand(attempt.scoreTotal)}</em><button onClick={() => void reviewAttempt(attempt._id)}>Review <ArrowRight size={15} /></button></article>)}</div></section></> : <section className="apt-empty"><span><BrainCircuit size={26} /></span><p className="eyebrow">No attempts yet</p><h2>Your first result will become the baseline.</h2><p>Start with a balanced 10-question test. You’ll get explanations for every answer and a topic map that makes the next practice choice obvious.</p><button className="button button-primary" onClick={() => setScreen("setup")}><Play size={16} /> Take your first test</button></section>}
  </div>;
}

function AptitudeTop({ onBack, label }: { onBack: () => void; label: string }) {
  return <header className="apt-module-top"><button onClick={onBack}><ArrowLeft size={17} /> All agents</button><div><span><BrainCircuit size={16} /></span><strong>{label}</strong></div></header>;
}

function AptitudeMessage({ type, text, onClose }: { type: "error" | "notice"; text: string; onClose: () => void }) {
  return <div className={`apt-message ${type}`}><span>{type === "error" ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}</span><p>{text}</p><button onClick={onClose}><X size={15} /></button></div>;
}

function Heatmap({ items, onRetry, busy }: { items: HeatmapItem[]; onRetry: (item: HeatmapItem) => void; busy: boolean }) {
  if (!items.length) return null;
  return <section className="apt-heatmap"><header><div><p className="eyebrow">Weak-area map</p><h2>Turn insight into the next drill.</h2><span>Lower scores use deeper navy; stronger topics move toward amber. Tap any topic to practise it.</span></div><div className="apt-heat-legend"><span>Needs focus</span><i /><i /><i /><i /><span>Strong</span></div></header><div>{items.map(item => <button disabled={busy} key={`${item.category}-${item.topic}`} style={{ backgroundColor: heatColor(item.score) }} onClick={() => onRetry(item)}><span>{categoryMeta[item.category].label}</span><strong>{topicLabel(item.topic)}</strong><div><em>{item.score}%</em><small>{item.attempts} answered</small><RefreshCw size={14} /></div></button>)}</div></section>;
}

function CodingQuestion({ question, answer, onChange, onRun, runState }: { question: Question; answer: AnswerDraft; onChange: (answer: AnswerDraft) => void; onRun: () => void; runState: { running: boolean; result?: { passed: number; total: number; results: { passed: boolean; status: string; output?: string; error?: string }[] }; error?: string } | null }) {
  const languages = Object.keys(question.starterCode);
  const language = answer.codeSubmission?.language ?? languages[0] ?? "javascript";
  const code = answer.codeSubmission?.code ?? question.starterCode[language] ?? "";
  const update = (nextLanguage: string, nextCode: string) => onChange({ ...answer, codeSubmission: { language: nextLanguage, code: nextCode } });
  return <div className="apt-code"><header><div><Code2 size={15} /><strong>Code editor</strong></div><select value={language} onChange={event => update(event.target.value, question.starterCode[event.target.value] ?? code)}>{languages.map(item => <option key={item} value={item}>{item}</option>)}</select></header><textarea spellCheck={false} value={code} onChange={event => update(language, event.target.value)} /><div className="apt-visible-cases"><header><span>Visible test cases</span><small>{question.testCases.length} shown · {question.testCaseCount - question.testCases.length} hidden</small></header>{question.testCases.map((testCase, index) => <div key={index}><span>Case {index + 1}</span><code>Input: {testCase.input}</code><code>Expected: {testCase.expectedOutput}</code></div>)}</div><button className="apt-run-code" disabled={runState?.running || !code.trim()} onClick={onRun}>{runState?.running ? <LoaderCircle size={15} /> : <Play size={15} />} Run visible tests</button>{runState?.error && <div className="apt-code-error"><AlertCircle size={15} />{runState.error}</div>}{runState?.result && <div className="apt-code-results"><strong>{runState.result.passed}/{runState.result.total} visible cases passed</strong>{runState.result.results.map((result, index) => <span key={index} className={result.passed ? "passed" : "failed"}>{result.passed ? <Check size={13} /> : <X size={13} />} Case {index + 1}: {result.status}</span>)}</div>}</div>;
}
