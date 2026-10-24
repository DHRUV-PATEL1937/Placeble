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
  Play,
  RefreshCw,
  Send,
  SlidersHorizontal,
  Target,
  TimerReset,
  Trophy,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ReadinessScoreRing } from "@/components/ui/readiness-score-ring";

const API_URL = import.meta.env.VITE_API_URL ?? "/api/v1";
type Category = "quant" | "logical" | "verbal" | "coding";
type PracticeCategory = Exclude<Category, "coding">;
type Difficulty = "easy" | "medium" | "hard";
type Screen = "home" | "setup" | "test" | "results" | "review";
type Question = { _id: string; category: Category; topic: string; difficulty: Difficulty; prompt: string; options: string[]; starterCode: Record<string, string>; testCases: { input: string; expectedOutput: string }[]; testCaseCount: number; timeLimitSeconds: number; correctOptionIndex?: number; explanation?: string };
type AttemptResponse = { questionId: string; selectedOptionIndex?: number; codeSubmission?: { language: string; code: string }; isCorrect?: boolean; awardedFraction?: number; timeSpentSeconds: number };
type Attempt = { _id: string; sections: Category[]; questionIds: string[]; responses: AttemptResponse[]; scoreTotal: number; scoreByCategory: Record<string, number>; scoreByTopic: Record<string, number>; startedAt: string; completedAt?: string; durationSeconds: number; status: "in_progress" | "completed" | "abandoned"; mode: "balanced" | "focused"; focusTopic?: string };
type HeatmapItem = { topic: string; category: Category; score: number; attempts: number; lastPractisedAt: string };
type AttemptPayload = { attempt: Attempt; questions: Question[]; heatmap?: HeatmapItem[] };
type Summary = { attempts: Attempt[]; inProgress: Pick<Attempt, "_id" | "sections" | "startedAt" | "durationSeconds" | "questionIds" | "mode" | "focusTopic"> | null; heatmap: HeatmapItem[]; questionCounts: Record<Category, number>; topicsByCategory: Record<PracticeCategory, string[]>; dynamicQuestionCount: number; lastDynamicRefreshAt: string | null; generationBatchId: string; dynamicRefreshWarning: string };
type AnswerDraft = { selectedOptionIndex?: number; codeSubmission?: { language: string; code: string }; timeSpentSeconds: number };
type CodeRunResult = { passed: number; total: number; results: { passed: boolean; status: string; output?: string; error?: string }[]; estimatedRuntimeMs?: number; extraTests?: { input: string; expectedOutput: string }[]; aiEstimated?: boolean };
type Job = { id: string; status: "queued" | "processing" | "complete" | "failed"; result?: AttemptPayload | CodeRunResult; error?: string };

const categoryMeta: Record<Category, { label: string; description: string; icon: typeof BrainCircuit }> = {
  quant: { label: "Quantitative", description: "Arithmetic, data and applied maths", icon: BarChart3 },
  logical: { label: "Logical reasoning", description: "Patterns, deductions and constraints", icon: BrainCircuit },
  verbal: { label: "Verbal ability", description: "Grammar, vocabulary and comprehension", icon: BookOpenCheck },
  coding: { label: "Coding", description: "Isolated execution against test cases", icon: Code2 },
};
const practiceCategories: PracticeCategory[] = ["quant", "logical", "verbal"];
const fallbackTopics: Record<PracticeCategory, string[]> = {
  quant: ["percentages", "averages", "ratios", "time-speed-distance", "probability", "data-interpretation"],
  logical: ["number-series", "directions", "syllogisms", "coding-decoding", "seating-arrangement", "critical-reasoning"],
  verbal: ["grammar", "vocabulary", "sentence-correction", "para-jumbles", "reading-comprehension", "tone"],
};

async function api<T>(path: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, ...init.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fieldMessage = payload.fields ? Object.values(payload.fields as Record<string, string[]>).flat().find((messages): messages is string => Array.isArray(messages) && typeof messages[0] === "string")?.[0] : undefined;
    const error = new Error(fieldMessage ?? payload.message ?? "The request could not be completed.") as Error & { attemptId?: string };
    error.attemptId = typeof payload.attemptId === "string" ? payload.attemptId : undefined;
    throw error;
  }
  return { payload: payload as T, status: response.status };
}

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60).toString().padStart(2, "0")}:${(safe % 60).toString().padStart(2, "0")}`;
}

function attemptElapsedSeconds(attempt: Attempt) {
  const startedAt = new Date(attempt.startedAt).getTime();
  const endedAt = attempt.completedAt ? new Date(attempt.completedAt).getTime() : Date.now();
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return 0;
  return Math.min(attempt.durationSeconds, Math.max(0, Math.round((endedAt - startedAt) / 1000)));
}

function formatElapsed(seconds: number) {
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes} min`;
}

function topicLabel(topic: string) {
  return topic.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function scoreBand(score: number) {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Building";
  return "Focus next";
}

function heatStatus(score: number) {
  if (score < 40) return "needs-focus";
  if (score < 70) return "improving";
  return "strong";
}

export function AptitudeTest({ accessToken, onBack }: { accessToken: string; onBack: () => void }) {
  const [screen, setScreen] = useState<Screen>("home");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [payload, setPayload] = useState<AttemptPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerDraft>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [selectedSections, setSelectedSections] = useState<PracticeCategory[]>(practiceCategories);
  const [advancedSettings, setAdvancedSettings] = useState(false);
  const [selectedTopics, setSelectedTopics] = useState<Partial<Record<PracticeCategory, string>>>({});
  const [questionCount, setQuestionCount] = useState(10);
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [difficulty, setDifficulty] = useState<Difficulty | "mixed">("mixed");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bankRefreshing, setBankRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [blockedAttemptId, setBlockedAttemptId] = useState("");
  const [notice, setNotice] = useState("");
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [questionElapsed, setQuestionElapsed] = useState(0);
  const [timeExpired, setTimeExpired] = useState(false);
  const [submitConfirm, setSubmitConfirm] = useState(false);
  const [codeRun, setCodeRun] = useState<{ questionId: string; running: boolean; result?: CodeRunResult; error?: string } | null>(null);
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

  useEffect(() => {
    if (payload && screen === "test") sessionStorage.setItem("placeble-active-aptitude", JSON.stringify({ attemptId: payload.attempt._id, questionIndex, answers }));
  }, [payload, screen, questionIndex, answers]);

  const openAttempt = useCallback((next: AttemptPayload, target: Screen = "test") => {
    setPayload(next);
    setAnswers(Object.fromEntries(next.attempt.responses.map(response => [response.questionId, { selectedOptionIndex: response.selectedOptionIndex, codeSubmission: response.codeSubmission, timeSpentSeconds: response.timeSpentSeconds ?? 0 }])));
    setQuestionIndex(0);
    setReviewIndex(0);
    setScreen(target);
    setTimeExpired(false);
    setError("");
    setBlockedAttemptId("");
    setQuestionElapsed(0);
  }, []);

  const resumeAttempt = async (attemptId: string) => {
    setBusy(true); setError("");
    try { const { payload: next } = await api<AttemptPayload>(`/aptitude/attempts/${attemptId}?resume=true`, accessToken); openAttempt(next); const saved = JSON.parse(sessionStorage.getItem("placeble-active-aptitude") ?? "null"); if (saved?.attemptId === attemptId && Number.isInteger(saved.questionIndex)) setQuestionIndex(Math.min(saved.questionIndex, next.questions.length - 1)); }
    catch (cause) { setBlockedAttemptId(""); setPayload(null); setScreen("home"); await loadSummary(); setError(cause instanceof Error ? cause.message : "This test is no longer available to resume."); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    const saved = JSON.parse(sessionStorage.getItem("placeble-active-aptitude") ?? "null") as { attemptId?: string } | null;
    if (!loading && saved?.attemptId && !payload) void resumeAttempt(saved.attemptId);
  }, [loading]);

  const abandonAttempt = async (attemptId: string) => {
    setBusy(true); setError("");
    try { await api(`/aptitude/attempts/${attemptId}/abandon`, accessToken, { method: "POST", body: "{}" }); await loadSummary(); setNotice("Previous attempt closed. You can start fresh now."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not close that attempt."); }
    finally { setBusy(false); }
  };

  const startAttempt = async (topic?: string, category?: Category) => {
    if (topic && category && category !== "coding") {
      setSelectedSections([category]);
      setSelectedTopics({ [category]: topic });
      setAdvancedSettings(true);
      setError("");
      setNotice("");
      setBlockedAttemptId("");
      setScreen("setup");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setBusy(true); setError(""); setNotice(""); setBlockedAttemptId("");
    try {
      const body = topic
        ? { sections: [category], questionCount: 5, durationMinutes: 8, difficulty: "mixed", topic }
        : {
          sections: selectedSections,
          questionCount,
          durationMinutes,
          difficulty,
          ...(advancedSettings ? {
            topicFilters: Object.fromEntries(selectedSections.flatMap(section => selectedTopics[section] ? [[section, [selectedTopics[section]]]] : [])),
          } : {}),
        };
      const { payload: next } = await api<AttemptPayload>("/aptitude/attempts", accessToken, { method: "POST", body: JSON.stringify(body) });
      openAttempt(next);
    } catch (cause) { const blocking = cause as Error & { attemptId?: string }; setBlockedAttemptId(blocking.attemptId ?? ""); setError(cause instanceof Error ? cause.message : "Could not start this test."); }
    finally { setBusy(false); }
  };

  const configureTopicPractice = (item: HeatmapItem) => {
    if (item.category === "coding") return;
    const category = item.category as PracticeCategory;
    setSelectedSections([category]);
    setSelectedTopics({ [category]: item.topic });
    setAdvancedSettings(true);
    setError("");
    setNotice("");
    setBlockedAttemptId("");
    setScreen("setup");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const currentQuestion = payload?.questions[questionIndex];

  const saveQuestion = useCallback(async (question: Question, draft: AnswerDraft) => {
    const nextDraft = { ...draft, timeSpentSeconds: Math.min(3600, Math.max(0, Math.floor(Math.max(draft.timeSpentSeconds ?? 0, questionElapsed)))) };
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
      setNotice("Question bank refreshed with a new AI-generated placement set.");
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
      setCodeRun({ questionId: currentQuestion._id, running: false, result: complete.result as CodeRunResult });
    } catch (cause) { setCodeRun({ questionId: currentQuestion._id, running: false, error: cause instanceof Error ? cause.message : "Code execution failed." }); }
  };

  const finishTest = useCallback(async (expired = false) => {
    if (!payload || submittingRef.current) return;
    submittingRef.current = true; setBusy(true); setSubmitConfirm(false); setError("");
    try {
      const responses = Object.entries(answers).flatMap(([questionId, draft]) => {
        if (draft.selectedOptionIndex === undefined && !draft.codeSubmission?.code.trim()) return [];
        return [{
          questionId,
          ...(draft.selectedOptionIndex !== undefined ? { selectedOptionIndex: draft.selectedOptionIndex } : {}),
          ...(draft.codeSubmission?.code.trim() ? { codeSubmission: draft.codeSubmission } : {}),
          timeSpentSeconds: Math.min(3600, Math.max(0, Math.floor(draft.timeSpentSeconds ?? 0))),
        }];
      });
      const { payload: response, status } = await api<AttemptPayload & { job?: Job }>(`/aptitude/attempts/${payload.attempt._id}/submit`, accessToken, { method: "POST", body: JSON.stringify({ responses }) });
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
    <section className="apt-setup"><header><p className="eyebrow">Build your practice set</p><h1>Choose the signal you want to strengthen.</h1><p>Questions are sampled from the active MongoDB bank, including the latest validated AI-generated batch. Scores use stored answer keys—never AI judgement.</p></header>
      {error && <AptitudeMessage type="error" text={error} onClose={() => { setError(""); setBlockedAttemptId(""); }} />}{blockedAttemptId && <section className="apt-active-attempt-action"><span><TimerReset size={19} /></span><div><strong>Continue your active test</strong><p>Your timer is still running. Resume now to continue where you left off.</p></div><button className="button button-primary" disabled={busy} onClick={() => void resumeAttempt(blockedAttemptId)}><Play size={15} /> Resume test</button></section>}
      <div className="apt-setup-grid"><div className="apt-setup-main"><section><div className="apt-section-heading"><span>1</span><div><h3>Sections</h3><p>Select one or combine them for a balanced test.</p></div></div><div className="apt-category-picker">{practiceCategories.map(category => { const meta = categoryMeta[category]; const Icon = meta.icon; return <button type="button" key={category} className={selectedSections.includes(category) ? "selected" : ""} onClick={() => setSelectedSections(current => current.includes(category) ? current.filter(item => item !== category) : [...current, category])}><span><Icon size={19} /></span><div><strong>{meta.label}</strong><small>{meta.description}</small></div><i>{selectedSections.includes(category) ? <Check size={14} /> : <Circle size={14} />}</i></button>; })}</div><label className="apt-advanced-toggle"><input type="checkbox" checked={advancedSettings} onChange={event => setAdvancedSettings(event.target.checked)} /><span><SlidersHorizontal size={16} /></span><div><strong>Advanced settings</strong><small>Choose a specific topic inside each selected section.</small></div><i>{advancedSettings ? "On" : "Off"}</i></label>{advancedSettings && <div className="apt-advanced-topics"><header><strong>Specific areas to practise</strong><small>Leave a section on “All topics” for a varied set.</small></header>{selectedSections.length ? selectedSections.map(category => { const topics = Array.from(new Set([...(summary?.topicsByCategory?.[category] ?? []), ...fallbackTopics[category]])).sort((left, right) => topicLabel(left).localeCompare(topicLabel(right))); return <label key={category}><span><b>{categoryMeta[category].label}</b></span><select value={selectedTopics[category] ?? ""} onChange={event => setSelectedTopics(current => ({ ...current, [category]: event.target.value }))}><option value="">All topics</option>{topics.map(topic => <option key={topic} value={topic}>{topicLabel(topic)}</option>)}</select></label>; }) : <p>Select at least one section to configure its topics.</p>}</div>}</section>
        <section><div className="apt-section-heading"><span>2</span><div><h3>Difficulty</h3><p>A mixed set follows a 30/50/20 easy-medium-hard distribution.</p></div></div><div className="apt-segmented">{(["mixed", "easy", "medium", "hard"] as const).map(value => <button className={difficulty === value ? "active" : ""} key={value} onClick={() => setDifficulty(value)}>{value === "mixed" ? "Balanced mix" : value}</button>)}</div></section>
        <section><div className="apt-section-heading"><span>3</span><div><h3>Length and pace</h3><p>Adjust the session to the time you have now.</p></div></div><div className="apt-number-options"><label><span>Questions</span><div>{[5, 10, 15].map(value => <button className={questionCount === value ? "active" : ""} key={value} onClick={() => setQuestionCount(value)}>{value}</button>)}</div></label><label><span>Duration</span><div>{[10, 15, 25].map(value => <button className={durationMinutes === value ? "active" : ""} key={value} onClick={() => setDurationMinutes(value)}>{value} min</button>)}</div></label></div></section></div>
        <aside className="apt-setup-summary"><span><ListChecks size={21} /></span><p>Practice summary</p><h3>{questionCount} questions · {durationMinutes} minutes</h3><ul>{selectedSections.map(category => <li key={category}><Check size={13} />{categoryMeta[category].label}</li>)}</ul><div><small>Grading method</small><strong>Deterministic answer-key lookup</strong><em>No AI call is involved in scoring.</em></div><button className="button button-primary" disabled={busy || !selectedSections.length} onClick={() => void startAttempt()}>{busy ? <LoaderCircle size={16} /> : <Play size={16} />} Start timed test</button></aside></div>
    </section>
  </div>;

  if (screen === "test" && payload && currentQuestion) {
    const currentAnswer = answers[currentQuestion._id] ?? { timeSpentSeconds: 0 };
    const CurrentIcon = categoryMeta[currentQuestion.category].icon;
    const timerState = timeRemaining <= 60 ? "danger" : timeRemaining <= 180 ? "warning" : "";
    return <div className="view-content inner-view aptitude-view apt-test-view"><header className="apt-test-top"><button onClick={() => setSubmitConfirm(true)}><X size={18} /> Exit test</button><div><span>{payload.attempt.mode === "focused" ? `${topicLabel(payload.attempt.focusTopic ?? "")} drill` : "Balanced aptitude test"}</span><strong>Question {questionIndex + 1} of {payload.questions.length}</strong></div><div className={`apt-timer ${timerState}`}><Clock3 size={17} /><span><small>Time remaining</small><strong>{formatTime(timeRemaining)}</strong></span></div></header>
      <div className="apt-test-progress"><span style={{ width: `${(questionIndex + 1) / payload.questions.length * 100}%` }} /></div>
      {error && <AptitudeMessage type="error" text={error} onClose={() => { setError(""); setBlockedAttemptId(""); }} />}{blockedAttemptId && <section className="apt-active-attempt-action"><span><TimerReset size={19} /></span><div><strong>Continue your active test</strong><p>Your timer is still running. Resume now to continue where you left off.</p></div><button className="button button-primary" disabled={busy} onClick={() => void resumeAttempt(blockedAttemptId)}><Play size={15} /> Resume test</button></section>}
      {notice && <AptitudeMessage type="notice" text={notice} onClose={() => setNotice("")} />}
      <div className="apt-test-layout"><aside className="apt-question-nav"><header><span>Questions</span><em>{answeredCount}/{payload.questions.length} answered</em></header><div>{payload.questions.map((question, index) => <button key={question._id} className={`${index === questionIndex ? "current" : ""} ${answers[question._id]?.selectedOptionIndex !== undefined || answers[question._id]?.codeSubmission?.code.trim() ? "answered" : ""}`} onClick={() => void goToQuestion(index)}>{index + 1}</button>)}</div><footer><span><i className="answered" />Answered</span><span><i />Not answered</span></footer></aside>
        <main className="apt-question-card"><header><span className={`difficulty ${currentQuestion.difficulty}`}>{currentQuestion.difficulty}</span><span><CurrentIcon size={14} />{categoryMeta[currentQuestion.category].label}</span><span>{topicLabel(currentQuestion.topic)}</span></header><h1>{currentQuestion.prompt}</h1>
          {currentQuestion.category !== "coding" ? <div className="apt-options">{currentQuestion.options.map((option, index) => <button className={currentAnswer.selectedOptionIndex === index ? "selected" : ""} key={option} onClick={() => void chooseOption(index)}><span>{String.fromCharCode(65 + index)}</span><p>{option}</p><i>{currentAnswer.selectedOptionIndex === index ? <CheckCircle2 size={20} /> : <Circle size={20} />}</i></button>)}</div> : <CodingQuestion question={currentQuestion} answer={currentAnswer} onChange={draft => setAnswers(current => ({ ...current, [currentQuestion._id]: draft }))} onRun={() => void runCode()} runState={codeRun?.questionId === currentQuestion._id ? codeRun : null} />}
          <footer><button disabled={questionIndex === 0} onClick={() => void goToQuestion(questionIndex - 1)}><ChevronLeft size={16} /> Previous</button><span>Answers save as you go</span>{questionIndex === payload.questions.length - 1 ? <button className="primary" disabled={busy} onClick={() => setSubmitConfirm(true)}>{busy ? <LoaderCircle size={15} /> : <><span>Review & submit</span><Send size={15} /></>}</button> : <button className="primary" onClick={() => void goToQuestion(questionIndex + 1)}>Next <ChevronRight size={16} /></button>}</footer></main></div>
      {submitConfirm && <div className="apt-dialog-layer"><button className="apt-dialog-scrim" aria-label="Close" onClick={() => setSubmitConfirm(false)} /><section className="apt-submit-dialog"><span><Flag size={21} /></span><p className="eyebrow">Before you finish</p><h2>Submit this practice test?</h2><p>You answered <strong>{answeredCount} of {payload.questions.length}</strong> questions. Unanswered questions will receive zero marks.</p><div><button onClick={() => setSubmitConfirm(false)}>Keep working</button><button className="button button-primary" disabled={busy} onClick={() => void finishTest(false)}>{busy ? <LoaderCircle size={16} /> : <Send size={16} />} Submit test</button></div></section></div>}
      {busy && <div className="apt-grading"><LoaderCircle size={25} /><h2>{payload.attempt.sections.includes("coding") ? "Running final test cases" : "Calculating your result"}</h2><p>Your score is being calculated from answer keys and test-case outcomes.</p></div>}
    </div>;
  }

  if (screen === "results" && payload) return <div className="view-content inner-view aptitude-view"><AptitudeTop onBack={() => { setPayload(null); setScreen("home"); void loadSummary(); }} label="Results" />
    {timeExpired && <AptitudeMessage type="notice" text="Time’s up—your saved answers were submitted automatically." onClose={() => setTimeExpired(false)} />}
    <section className="apt-results-hero"><div className="apt-result-score"><ReadinessScoreRing score={payload.attempt.scoreTotal} compact label="Aptitude score" /><span><small>Overall score</small><strong>{payload.attempt.scoreTotal}<em>/100</em></strong><p>{scoreBand(payload.attempt.scoreTotal)} · {payload.questions.length} questions completed</p></span></div><div><p className="eyebrow">Practice complete</p><h1>{payload.attempt.scoreTotal >= 80 ? "Strong work. Keep the edge sharp." : payload.attempt.scoreTotal >= 60 ? "Good foundation. Now target the gaps." : "Useful baseline. Your next step is clear."}</h1><p>Every mark came from deterministic grading. Use the topic map below to turn this attempt into focused progress.</p><div><button className="button button-secondary" onClick={() => { setReviewIndex(0); setScreen("review"); }}><BookOpenCheck size={16} /> Review answers</button><button className="button button-primary" onClick={() => setScreen("setup")}><RefreshCw size={16} /> New test</button></div></div></section>
    <section className="apt-result-grid"><article className="apt-result-panel"><header><div><p className="eyebrow">Category breakdown</p><h2>Where your score came from</h2></div><Target size={19} /></header><div className="apt-category-results">{payload.attempt.sections.map(category => <div key={category}><span>{categoryMeta[category].label}<strong>{payload.attempt.scoreByCategory?.[category] ?? 0}%</strong></span><i><b style={{ width: `${payload.attempt.scoreByCategory?.[category] ?? 0}%` }} /></i></div>)}</div></article><article className="apt-result-panel"><header><div><p className="eyebrow">Attempt detail</p><h2>Clear, explainable scoring</h2></div><ListChecks size={19} /></header><div className="apt-result-facts"><span><strong>{payload.attempt.responses.filter(response => response.isCorrect).length}</strong><small>Fully correct</small></span><span><strong>{payload.attempt.responses.length}</strong><small>Answered</small></span><span><strong>{formatElapsed(attemptElapsedSeconds(payload.attempt))}</strong><small>Time used</small></span></div></article></section>
    <Heatmap items={payload.heatmap ?? summary?.heatmap ?? []} onRetry={configureTopicPractice} busy={busy} />
  </div>;

  if (screen === "review" && payload) {
    const question = payload.questions[reviewIndex];
    const response = payload.attempt.responses.find(item => item.questionId === question._id);
    return <div className="view-content inner-view aptitude-view apt-review-view"><AptitudeTop onBack={() => setScreen("results")} label="Answer review" /><div className="apt-review-progress"><span>{reviewIndex + 1} of {payload.questions.length}</span><div><i style={{ width: `${(reviewIndex + 1) / payload.questions.length * 100}%` }} /></div><strong>{response?.isCorrect ? "Correct" : "Needs review"}</strong></div><article className="apt-review-card"><header><span>{categoryMeta[question.category].label}</span><span>{topicLabel(question.topic)}</span><span>{question.difficulty}</span></header><h1>{question.prompt}</h1>{question.category !== "coding" ? <div className="apt-review-options">{question.options.map((option, index) => { const selected = response?.selectedOptionIndex === index; const correct = question.correctOptionIndex === index; return <div className={`${selected ? "selected" : ""} ${correct ? "correct" : ""}`} key={option}><span>{String.fromCharCode(65 + index)}</span><p>{option}</p>{correct && <em><Check size={14} /> Correct answer</em>}{selected && !correct && <em>Your answer</em>}</div>; })}</div> : <pre className="apt-review-code">{response?.codeSubmission?.code ?? "No code submitted."}</pre>}<section className="apt-explanation"><span><Lightbulb size={18} /></span><div><strong>Explanation</strong><p>{question.explanation || "Review the expected output and test-case result above."}</p></div></section><footer><button disabled={reviewIndex === 0} onClick={() => setReviewIndex(index => index - 1)}><ChevronLeft size={16} /> Previous</button>{reviewIndex === payload.questions.length - 1 ? <button className="primary" onClick={() => setScreen("results")}>Back to results <ArrowRight size={16} /></button> : <button className="primary" onClick={() => setReviewIndex(index => index + 1)}>Next explanation <ChevronRight size={16} /></button>}</footer></article></div>;
  }

  return <div className="view-content inner-view aptitude-view"><AptitudeTop onBack={onBack} label="Aptitude Practice" />
    {error && <AptitudeMessage type="error" text={error} onClose={() => { setError(""); setBlockedAttemptId(""); }} />}{blockedAttemptId && <section className="apt-active-attempt-action"><span><TimerReset size={19} /></span><div><strong>Continue your active test</strong><p>Your timer is still running. Resume now to continue where you left off.</p></div><button className="button button-primary" disabled={busy} onClick={() => void resumeAttempt(blockedAttemptId)}><Play size={15} /> Resume test</button></section>}{notice && <AptitudeMessage type="notice" text={notice} onClose={() => setNotice("")} />}
    <section className="apt-home-hero"><div><p className="eyebrow">Practice with proof</p><h1>Know exactly what to strengthen next.</h1><p>Timed, current placement-style aptitude practice across quant, logic and verbal ability—with transparent scoring and guided practice for weak topics.</p><div><button className="button button-primary" onClick={() => setScreen("setup")}><Play size={17} /> Start a test</button></div><small><CheckCircle2 size={14} /> AI refreshes the bank; grading always uses stored, deterministic answer keys.</small></div><div className="apt-home-score"><div className="apt-score-coach" aria-hidden="true"><span>🤖</span><i>✦</i><small>Coach signal</small></div><div className="apt-score-readout"><ReadinessScoreRing score={latestScore || 64} label="Latest aptitude score" /><span><strong>{completedAttempts.length ? "Latest score" : "Starter benchmark"}</strong><p>{completedAttempts.length ? `${latestScore}/100 · ${scoreBand(latestScore)}` : "Take your first test to replace this benchmark."}</p></span></div></div></section>
    <section className="apt-bank-status"><span><RefreshCw size={19} /></span><div><p className="eyebrow">Live question bank</p><strong>{summary?.dynamicQuestionCount ?? 0} AI-refreshed questions plus a curated fallback</strong><small>{summary?.lastDynamicRefreshAt ? `Updated ${new Date(summary.lastDynamicRefreshAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}. Tests randomly sample the active MongoDB bank and avoid recent repeats.` : "A fresh AI batch will be generated while the curated bank keeps practice available."}</small>{summary?.dynamicRefreshWarning && <em>{summary.dynamicRefreshWarning}</em>}</div><button disabled={bankRefreshing} onClick={() => void refreshQuestionBank()}>{bankRefreshing ? <LoaderCircle size={15} /> : <RefreshCw size={15} />} {bankRefreshing ? "Refreshing..." : "Refresh questions"}</button></section>
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
  const visibleItems = items.filter(item => item.category !== "coding");
  const [activeTopic, setActiveTopic] = useState<string>(visibleItems[0]?.topic ?? "");
  const [topicFilter, setTopicFilter] = useState<"all" | "focus" | "improving" | "strong">("all");
  const [topicSearch, setTopicSearch] = useState("");
  const [topicSort, setTopicSort] = useState("readiness");
  if (!visibleItems.length) return null;
  const focus = visibleItems.filter(item => item.score < 30).sort((a, b) => a.score - b.score);
  const improving = visibleItems.filter(item => item.score >= 30 && item.score < 70);
  const strong = visibleItems.filter(item => item.score >= 70).sort((a, b) => b.score - a.score);
  const strongest = strong[0] ?? [...visibleItems].sort((a, b) => b.score - a.score)[0];
  const filteredTopics = visibleItems
    .filter(item => topicFilter === "all" || (topicFilter === "focus" ? item.score < 30 : topicFilter === "improving" ? item.score >= 30 && item.score < 70 : item.score >= 70))
    .filter(item => topicLabel(item.topic).toLowerCase().includes(topicSearch.trim().toLowerCase()))
    .sort((a, b) => topicSort === "name" ? topicLabel(a.topic).localeCompare(topicLabel(b.topic)) : topicSort === "readiness-high" ? b.score - a.score : a.score - b.score);
  const activeItem = filteredTopics.find(item => item.topic === activeTopic) ?? filteredTopics[0] ?? visibleItems.find(item => item.topic === activeTopic) ?? visibleItems[0];
  const ring = `conic-gradient(#ff4148 0 ${focus.length / visibleItems.length * 100}%, #ffbd20 0 ${(focus.length + improving.length) / visibleItems.length * 100}%, #10ae78 0 100%)`;
  return <section className="apt-readiness-dashboard">
    <header className="apt-readiness-title"><p>Topic readiness</p><h2>Choose what to <span>practise next.</span></h2><small>Select a topic to focus on. Practise the weakest areas first to get the biggest improvement in your overall score.</small></header>
    <div className="apt-readiness-summary"><div className="apt-summary-ring" style={{ background: ring }}><i><strong>{visibleItems.length}</strong><span>Topics</span></i></div><div className="apt-summary-legend"><span><i className="red"/><strong>{focus.length}</strong><em>Need attention<small>(&lt; 30%)</small></em></span><span><i className="yellow"/><strong>{improving.length}</strong><em>Improving<small>(30% – 70%)</small></em></span><span><i className="green"/><strong>{strong.length}</strong><em>Strong<small>(&gt; 70%)</small></em></span></div><div className="apt-summary-callout"><strong>{focus.length || visibleItems.length}</strong><span><b>topics need attention</b><small>Start with a red topic for the biggest improvement.</small></span><ArrowRight size={18}/></div></div>
    <div className="apt-readiness-filters"><button className={topicFilter === "all" ? "active" : ""} onClick={() => setTopicFilter("all")}>All Topics <b>{visibleItems.length}</b></button><button className={topicFilter === "focus" ? "active" : ""} onClick={() => setTopicFilter("focus")}><i className="red"/>Needs Attention <b>{focus.length}</b></button><button className={topicFilter === "improving" ? "active" : ""} onClick={() => setTopicFilter("improving")}><i className="yellow"/>Improving <b>{improving.length}</b></button><button className={topicFilter === "strong" ? "active" : ""} onClick={() => setTopicFilter("strong")}><i className="green"/>Strong <b>{strong.length}</b></button><label><span>⌕</span><input value={topicSearch} onChange={event => setTopicSearch(event.target.value)} placeholder="Search topics..." /></label><select aria-label="Sort topics" value={topicSort} onChange={event => setTopicSort(event.target.value)}><option value="readiness">Sort: Readiness (low to high)</option><option value="readiness-high">Sort: Readiness (high to low)</option><option value="name">Sort: Topic name</option></select></div>
    <div className="apt-readiness-grid"><div className="apt-topic-map"><header><h3>Topic Map</h3><p>Visualise your readiness at a glance.</p></header><div className="apt-topic-orbit" style={{ "--topic-count": filteredTopics.length } as CSSProperties}><div className="apt-orbit-center" style={{ background: ring }}><i><span className="apt-orbit-category">{categoryMeta[activeItem.category].label}</span><strong>{topicLabel(activeItem.topic)}</strong><b>{activeItem.score}%</b><span>{activeItem.attempts} questions answered</span><button className="button button-primary" disabled={busy} onClick={() => onRetry(activeItem)}>Practise topic <ArrowRight size={14}/></button></i></div>{filteredTopics.map((item, index) => <button key={`${item.category}-${item.topic}`} title={`${topicLabel(item.topic)} · ${item.score}%`} aria-label={`${index + 1}: ${topicLabel(item.topic)}, ${item.score}% readiness`} disabled={busy} className={`${heatStatus(item.score)} ${activeItem.topic === item.topic ? "selected" : ""}`} style={{ "--i": index, "--n": filteredTopics.length } as CSSProperties} onMouseEnter={() => setActiveTopic(item.topic)} onFocus={() => setActiveTopic(item.topic)} onClick={() => setActiveTopic(item.topic)}><span>{index + 1}</span></button>)}</div><p className="apt-topic-map-hint">{filteredTopics.length} of {visibleItems.length} topics · Hover or focus a point to preview · Select it to practise</p></div>
    <aside className="apt-readiness-side"><section className="apt-focus-list"><header><div><h3>Your Focus for Maximum Improvement</h3><p>Start with these topics (lowest readiness).</p></div><b>{focus.length} topics</b></header>{focus.slice(0,5).map((item,index)=><button key={item.topic} onClick={()=>onRetry(item)} disabled={busy}><i>{index+1}</i><span>{topicLabel(item.topic)}</span><em><b style={{width:`${Math.max(item.score,3)}%`}}/></em><strong>{item.score}%</strong><ChevronRight size={16}/></button>)}</section><section className="apt-strongest"><header><h3>Your Strongest Topic</h3><p>Keep up the great work!</p></header><button onClick={()=>onRetry(strongest)} disabled={busy}><Target size={23}/><span>{topicLabel(strongest.topic)}</span><em><b style={{width:`${strongest.score}%`}}/></em><strong>{strongest.score}%</strong><ArrowRight size={16}/></button></section><section className="apt-practice-cta"><div><Lightbulb size={34}/></div><span><h3>Small steps.<br/>Big results.</h3><p>Practise consistently and watch your overall score improve.</p><button onClick={()=>onRetry(focus[0] ?? visibleItems[0])}>Start Practising <ArrowRight size={16}/></button></span></section></aside></div>
  </section>;
}

function CodingQuestion({ question, answer, onChange, onRun, runState }: { question: Question; answer: AnswerDraft; onChange: (answer: AnswerDraft) => void; onRun: () => void; runState: { running: boolean; result?: CodeRunResult; error?: string } | null }) {
  const languages = Object.keys(question.starterCode);
  const language = answer.codeSubmission?.language ?? languages[0] ?? "javascript";
  const code = answer.codeSubmission?.code ?? question.starterCode[language] ?? "";
  const update = (nextLanguage: string, nextCode: string) => onChange({ ...answer, codeSubmission: { language: nextLanguage, code: nextCode } });
  return <div className="apt-code"><header><div><Code2 size={15} /><strong>Code editor</strong></div><select value={language} onChange={event => update(event.target.value, question.starterCode[event.target.value] ?? code)}>{languages.map(item => <option key={item} value={item}>{item}</option>)}</select></header><textarea spellCheck={false} value={code} onChange={event => update(language, event.target.value)} /><div className="apt-visible-cases"><header><span>Visible test cases</span><small>{question.testCases.length} shown · {question.testCaseCount - question.testCases.length} hidden</small></header>{question.testCases.map((testCase, index) => <div key={index}><span>Case {index + 1}</span><code>Input: {testCase.input}</code><code>Expected: {testCase.expectedOutput}</code></div>)}</div><button className="apt-run-code" disabled={runState?.running || !code.trim()} onClick={onRun}>{runState?.running ? <LoaderCircle size={15} /> : <Play size={15} />} Run visible tests</button>{runState?.error && <div className="apt-code-error"><AlertCircle size={15} />{runState.error}</div>}{runState?.result && <div className="apt-code-results"><strong>{runState.result.passed}/{runState.result.total} visible cases passed</strong>{runState.result.aiEstimated && <small>AI estimate · runtime about {runState.result.estimatedRuntimeMs ?? "—"} ms · not measured</small>}{runState.result.extraTests?.length ? <small>{runState.result.extraTests.length} additional edge cases suggested for final grading</small> : null}{runState.result.results.map((result, index) => <span key={index} className={result.passed ? "passed" : "failed"}>{result.passed ? <Check size={13} /> : <X size={13} />} Case {index + 1}: {result.status}</span>)}</div>}</div>;
}
