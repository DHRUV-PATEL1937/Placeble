import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Code2,
  FileCode2,
  Flame,
  Lightbulb,
  ListFilter,
  LoaderCircle,
  Play,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Terminal,
  Trophy,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import "./coding-library.css";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API_URL = import.meta.env.VITE_API_URL ?? "/api/v1";

type SupportedLanguage = {
  id: string;
  label: string;
  judge0Id: number;
  extension: string;
};

type ProblemSummary = {
  _id: string;
  title: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  prompt: string;
  tags: string[];
  constraints: string[];
  examples: Array<{ input: string; output: string; explanation: string }>;
  starterCodeLanguages: string[];
  testCaseCount: number;
  visibleTestCaseCount: number;
  userStatus: "solved" | "attempted" | "todo";
  source: string;
  acceptanceRate: number;
};

type VisibleTestCase = {
  caseIndex: number;
  input: string;
  expectedOutput: string;
};

type ProblemDetail = {
  _id: string;
  title: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  prompt: string;
  constraints: string[];
  examples: Array<{ input: string; output: string; explanation: string }>;
  starterCode: Record<string, string>;
  hints: string[];
  explanation: string;
  tags: string[];
  visibleTestCases: VisibleTestCase[];
  totalTestCaseCount: number;
  sourceUrl?: string;
  sourceName?: string;
  license?: string;
  userStatus?: string;
  savedSolution?: { language: string; code: string; accepted: boolean; createdAt: string } | null;
  workspace?: { language: string; codePerLanguage: Record<string, string> } | null;
  recentSubmissions: Array<{
    code: string;
    _id: string;
    language: string;
    status: string;
    passedTestCases: number;
    totalTestCases: number;
    runtimeMs: number;
    createdAt: string;
  }>;
};

type ExecutionResultItem = {
  caseIndex: number;
  input: string;
  expectedOutput: string;
  actualOutput: string;
  passed: boolean;
  status: "Accepted" | "Wrong Answer" | "Runtime Error" | "Time Limit Exceeded" | "Compilation Error";
  error?: string;
  executionTimeMs: number;
};

type ExecutionReport = {
  passed: number;
  total: number;
  allPassed: boolean;
  runtimeMs: number;
  results: ExecutionResultItem[];
};

type CatalogResponse = {
  problems: ProblemSummary[];
  archivedProblems?: ProblemSummary[];
  stats: {
    total: number;
    solved: number;
    attempted: number;
    easyCount: number;
    mediumCount: number;
    hardCount: number;
    acceptanceRate: number;
  };
  supportedLanguages: SupportedLanguage[];
};

async function apiRequest<T>(path: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...init.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { message?: string }).message || "API request failed");
  }
  return data as T;
}

const topicName = (value: string) => value.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

export function CodingArena({ accessToken, onBackToMcq }: { accessToken: string; onBackToMcq?: () => void }) {
  const [activeProblemId, setActiveProblemId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [status, setStatus] = useState("all");
  const [archive, setArchive] = useState(false);
  const loadCatalog = useCallback(async (signal?: AbortSignal) => {
    setError("");
    try {
      const result = await apiRequest<CatalogResponse>("/aptitude/coding/problems", accessToken, { signal });
      setCatalog(result);
    } catch (error) {
      if (!signal?.aborted) setError(error instanceof Error ? error.message : "Could not load the problem library.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [accessToken]);
  useEffect(() => { const controller = new AbortController(); void loadCatalog(controller.signal); return () => controller.abort(); }, [loadCatalog]);

  const problems = archive ? catalog?.archivedProblems ?? [] : catalog?.problems ?? [];
  const categories = useMemo(() => [...new Set(problems.map(p => p.topic))].sort(), [problems]);
  const filtered = problems.filter(p =>
    (topic === "all" || p.topic === topic) &&
    (difficulty === "all" || p.difficulty === difficulty) &&
    (status === "all" || p.userStatus === status) &&
    [p.title, topicName(p.topic), ...p.tags].join(" ").toLowerCase().includes(search.trim().toLowerCase())
  );
  const grouped = categories.map(category => ({ category, items: filtered.filter(p => p.topic === category) })).filter(group => group.items.length);
  const solved = catalog?.stats.solved ?? 0;
  const total = catalog?.stats.total ?? 0;
  const percentage = total ? Math.round(solved / total * 100) : 0;
  const reset = () => { setTopic("all"); setSearch(""); setDifficulty("all"); setStatus("all"); };
  if (activeProblemId) return <CodingIde key={activeProblemId} problemId={activeProblemId} accessToken={accessToken} onBack={() => { setActiveProblemId(null); void loadCatalog(); }} onNavigateProblem={setActiveProblemId} allProblemIds={filtered.map(p => p._id)} />;

  return <div className="coding-library">
    <header className="pg-head">
      <div><h1>Coding practice</h1><p>Curated open-source challenges. Pick a topic, build your solution in the editor and resume exactly where you left off.</p></div>
      <div className="pg-actions">{onBackToMcq && <button className="button button-secondary" onClick={onBackToMcq}><ArrowLeft size={15}/> Aptitude MCQs</button>}<button className="button button-primary" onClick={() => document.getElementById("coding-library-browser")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })}>Explore problems <ArrowRight size={16}/></button></div>
    </header>
    <section className="pg-progress" aria-label="Your progress">
      <div className="pg-progress-main"><span>Your progress</span><strong>{solved} <small>of {total} solved</small></strong><div className="pg-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}><i style={{ width: percentage + "%" }}/></div></div>
      <div className="cl-level-counts"><span><i className="easy"/>{catalog?.stats.easyCount ?? 0} easy</span><span><i className="medium"/>{catalog?.stats.mediumCount ?? 0} medium</span><span><i className="hard"/>{catalog?.stats.hardCount ?? 0} hard</span></div>
      <div className="cl-trust"><span><CheckCircle2 size={14}/> Curated, open-source problems</span><span><FileCode2 size={14}/> Your solutions, saved</span></div>
    </section>

    <div className="cl-library-heading"><div><p className="cl-eyebrow">BUILT FOR FOCUSED PRACTICE</p><h2>Your next breakthrough starts here.</h2></div><div className="cl-collection-switch" aria-label="Problem collection"><button aria-pressed={!archive} className={!archive ? "active" : ""} onClick={() => { setArchive(false); reset(); }}>Library <span>{total}</span></button><button aria-pressed={archive} className={archive ? "active" : ""} onClick={() => { setArchive(true); reset(); }}>Previous practice <span>{catalog?.archivedProblems?.length ?? 0}</span></button></div></div>

    {error && <div className="cl-error" role="alert"><AlertCircle size={18}/><span>{error}</span><button onClick={() => void loadCatalog()}>Try again</button></div>}
    <div className="cl-browser" id="coding-library-browser">
      <nav className="cl-categories" aria-label="Problem categories"><p>CATEGORIES</p><button aria-pressed={topic === "all"} className={topic === "all" ? "active" : ""} onClick={() => setTopic("all")}><span><ListFilter size={16}/> All topics</span><b>{problems.length}</b></button>
        {categories.map(category => { const list = problems.filter(p => p.topic === category); const done = list.filter(p => p.userStatus === "solved").length; return <button key={category} aria-pressed={topic === category} className={topic === category ? "active" : ""} onClick={() => setTopic(category)}><span>{topicName(category)}<small>{done} / {list.length} solved</small></span><i style={{ background: done === list.length ? "#13a47d" : undefined }}>{list.length}</i></button>; })}
        <div className="cl-category-note"><Lightbulb size={18}/><strong>Make room for progress.</strong><p>Start small. Revisit your solutions. Build the habit.</p></div>
      </nav>
      <main className="cl-results">
        <div className="cl-controls"><label className="cl-search"><Search size={17}/><input aria-label="Search coding problems" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a problem or concept…"/>{search && <button aria-label="Clear search" onClick={() => setSearch("")}><X size={14}/></button>}</label><select aria-label="Filter difficulty" value={difficulty} onChange={event => setDifficulty(event.target.value)}><option value="all">All difficulties</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select><select aria-label="Filter progress" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All progress</option><option value="todo">Not started</option><option value="attempted">In progress</option><option value="solved">Solved</option></select></div>
        <div className="cl-results-caption" aria-live="polite"><span>{filtered.length} {filtered.length === 1 ? "problem" : "problems"}{topic !== "all" ? " · " + topicName(topic) : " across " + grouped.length + " topics"}</span><span>{archive ? "Your earlier work, preserved" : "Source: Exercism · MIT license"}</span></div>
        {loading ? <div className="cl-empty"><LoaderCircle className="spin" size={28}/><h3>Opening your library…</h3></div> : filtered.length === 0 ? <div className="cl-empty"><Search size={30}/><h3>{archive ? "No previous problems here." : "A fresh perspective?"}</h3><p>{archive ? "Previously attempted problems appear here when available." : "Try another topic or adjust your filters."}</p><button onClick={reset}>Reset filters</button></div> : grouped.map(({ category, items }) => <section className="cl-topic-section" key={category}><header><div><span className="cl-topic-symbol"><Code2 size={18}/></span><h3>{topicName(category)}</h3><span className="cl-topic-count">{items.length}</span></div><small>{items.filter(p => p.userStatus === "solved").length} solved</small></header><div className="cl-problem-list">{items.map((problem, index) => <button className="cl-problem-row" key={problem._id} onClick={() => setActiveProblemId(problem._id)} style={{ animationDelay: Math.min(index, 6) * 25 + "ms" }}><span className={"cl-status " + problem.userStatus} aria-label={problem.userStatus}>{problem.userStatus === "solved" ? <CheckCircle2 size={20}/> : problem.userStatus === "attempted" ? <Clock3 size={20}/> : <Circle size={20}/>}</span><span className="cl-problem-title"><strong>{problem.title}</strong><small>{problem.userStatus === "solved" ? "Your accepted solution is ready to revisit" : problem.tags.slice(0, 3).map(topicName).join(" · ")}</small></span><span className={"cl-difficulty " + problem.difficulty}>{problem.difficulty}</span><span className="cl-case-count">{problem.testCaseCount} tests</span><span className="cl-open-label">{problem.userStatus === "solved" ? "View solution" : problem.userStatus === "attempted" ? "Continue" : "Solve"}<ArrowRight size={15}/></span></button>)}</div></section>)}
        <footer className="cl-attribution"><a href="https://github.com/exercism/problem-specifications" target="_blank" rel="noreferrer">Exercise specifications by Exercism ↗</a><span>Adapted under the MIT license. <a href="/licenses/exercism.txt" target="_blank" rel="noreferrer">View license</a></span><span>Code is evaluated against published tests; AI assists evaluation when a compiler is unavailable.</span></footer>
      </main>
    </div>
  </div>;
}

function ProblemText({ text }: { text: string }) {
  const normalized = text.replace(/~{4}exercism\/[^\n]+\n([\s\S]*?)~{4}/g, (_match, body: string) => body.split("\n").map(line => "> " + line).join("\n"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ node: _node, ...props }: any) => <a {...props} target="_blank" rel="noreferrer"/> }}>{normalized}</Markdown>;
}

function CodingIde({
  problemId,
  accessToken,
  onBack,
  onNavigateProblem,
  allProblemIds,
}: {
  problemId: string;
  accessToken: string;
  onBack: () => void;
  onNavigateProblem: (id: string) => void;
  allProblemIds: string[];
}) {
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Editor states
  const [selectedLanguage, setSelectedLanguage] = useState<string>("javascript");
  const [codePerLanguage, setCodePerLanguage] = useState<Record<string, string>>({});
  const [fontSize, setFontSize] = useState<number>(14);

  // Panels & Tabs
  const [leftTab, setLeftTab] = useState<"description" | "examples" | "hints" | "submissions" | "approach">("description");
  const [consoleTab, setConsoleTab] = useState<"cases" | "custom" | "output">("cases");
  const [selectedCaseIdx, setSelectedCaseIdx] = useState(0);
  const [customInput, setCustomInput] = useState("");

  // Execution states
  const [runningCode, setRunningCode] = useState(false);
  const [submittingCode, setSubmittingCode] = useState(false);
  const [runReport, setRunReport] = useState<ExecutionReport | null>(null);
  const [submissionResult, setSubmissionResult] = useState<{
    isAccepted: boolean;
    status: string;
    passedTestCases: number;
    totalTestCases: number;
    runtimeMs: number;
  } | null>(null);

  // Accepted Modal
  const [showAcceptedModal, setShowAcceptedModal] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const readyRef = useRef(false);
  const draftRef = useRef({ language: "javascript", codePerLanguage: {} as Record<string, string> });
  const dirtyRef = useRef(false);
  const draftRevision = useRef(0);
  const lastDraftRequest = useRef<AbortController | null>(null);
  const [saveStatus, setSaveStatus] = useState("Saved to your account");
  const [restoredLabel, setRestoredLabel] = useState("");
  draftRef.current = { language: selectedLanguage, codePerLanguage };

  // Persist unsent edits on navigation as well as during normal editing.
  useEffect(() => () => {
    lastDraftRequest.current?.abort();
    if (readyRef.current && dirtyRef.current) {
      void apiRequest(`/aptitude/coding/problems/${problemId}/workspace`, accessToken, { method: "PUT", keepalive: true, body: JSON.stringify(draftRef.current) }).catch(() => {});
    }
  }, [accessToken, problemId]);

  useEffect(() => {
    if (!readyRef.current || !dirtyRef.current) return;
    const revision = draftRevision.current;
    const timer = window.setTimeout(async () => {
      const controller = new AbortController();
      lastDraftRequest.current = controller;
      setSaveStatus("Saving…");
      try {
        await apiRequest(`/aptitude/coding/problems/${problemId}/workspace`, accessToken, { method: "PUT", signal: controller.signal, body: JSON.stringify(draftRef.current) });
        if (draftRevision.current === revision) { dirtyRef.current = false; setSaveStatus("Saved to your account"); }
      } catch { if (!controller.signal.aborted) setSaveStatus("Could not save. Your code is still in this editor."); }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [codePerLanguage, selectedLanguage, problemId, accessToken]);

  const loadProblem = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setErrorMsg("");
      const res = await apiRequest<{ problem: ProblemDetail }>(`/aptitude/coding/problems/${problemId}`, accessToken, { signal });
      if (signal?.aborted) return;
      setProblem(res.problem);

      const saved = res.problem.savedSolution;
      const workspace = res.problem.workspace;
      const initialCode = { ...res.problem.starterCode, ...workspace?.codePerLanguage };
      if (saved && (saved.accepted || !workspace)) initialCode[saved.language] = saved.code;
      setCodePerLanguage(initialCode);
      setSelectedLanguage((saved?.accepted ? saved.language : workspace?.language ?? saved?.language) ?? (initialCode.javascript ? "javascript" : Object.keys(initialCode)[0]));
      setRestoredLabel(saved?.accepted ? "Your accepted solution has been restored." : workspace ? "Your saved workspace has been restored." : saved ? "Your last submission has been restored." : "");
      readyRef.current = true;
      dirtyRef.current = false;

      // Reset run report
      setRunReport(null);
      setSubmissionResult(null);
    } catch (err) {
      if (!signal?.aborted) setErrorMsg(err instanceof Error ? err.message : "Failed to load problem");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [problemId, accessToken]);

  useEffect(() => {
    const controller = new AbortController();
    void loadProblem(controller.signal);
    return () => controller.abort();
  }, [loadProblem]);

  const currentCode = codePerLanguage[selectedLanguage] || "";

  const handleCodeChange = (newCode: string) => {
    dirtyRef.current = true;
    draftRevision.current++;
    setRestoredLabel("");
    setSaveStatus("Unsaved changes");
    setCodePerLanguage(prev => ({
      ...prev,
      [selectedLanguage]: newCode,
    }));
  };

  const handleCodeChangeForLanguage = (language: string, code: string) => {
    dirtyRef.current = true;
    draftRevision.current++;
    setCodePerLanguage(prev => ({ ...prev, [language]: code }));
    setSaveStatus("Unsaved changes");
  };

  const leaveWorkspace = async (navigate: () => void) => {
    if (dirtyRef.current) {
      setSaveStatus("Saving…");
      try {
        await apiRequest(`/aptitude/coding/problems/${problemId}/workspace`, accessToken, { method: "PUT", body: JSON.stringify(draftRef.current) });
        dirtyRef.current = false;
      } catch {
        setErrorMsg("Your draft could not be saved. Please try again before leaving this problem.");
        setConsoleTab("output");
        return;
      }
    }
    navigate();
  };

  // Keyboard shortcut handlers for code editor (Tab indentation and bracket auto-closing)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    if (e.key === "Tab") {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;
      const nextValue = value.substring(0, start) + "  " + value.substring(end);
      handleCodeChange(nextValue);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    } else if (e.key === "Enter") {
      // Auto-indent on Enter
      const start = textarea.selectionStart;
      const lines = textarea.value.substring(0, start).split("\n");
      const currentLine = lines[lines.length - 1];
      const match = currentLine.match(/^(\s+)/);
      if (match) {
        e.preventDefault();
        const indentation = match[1];
        const nextValue = textarea.value.substring(0, start) + "\n" + indentation + textarea.value.substring(start);
        handleCodeChange(nextValue);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 1 + indentation.length;
        }, 0);
      }
    }
  };

  const handleResetCode = () => {
    if (!problem) return;
    const defaultTemplate = problem.starterCode[selectedLanguage] || "";
    handleCodeChange(defaultTemplate);
  };

  const handleRunCode = async () => {
    if (!problem) return;
    try {
      setRunningCode(true);
      setErrorMsg("");
      setConsoleTab("output");
      const res = await apiRequest<{ report: ExecutionReport }>("/aptitude/coding/run", accessToken, {
        method: "POST",
        body: JSON.stringify({
          problemId: problem._id,
          language: selectedLanguage,
          code: currentCode,
          customInput: consoleTab === "custom" ? customInput : undefined,
        }),
      });
      setRunReport(res.report);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Run execution failed");
    } finally {
      setRunningCode(false);
    }
  };

  const handleSubmitSolution = async () => {
    if (!problem) return;
    try {
      setSubmittingCode(true);
      setErrorMsg("");
      setConsoleTab("output");
      const res = await apiRequest<{
        isAccepted: boolean;
        status: string;
        passedTestCases: number;
        totalTestCases: number;
        runtimeMs: number;
        report: ExecutionReport;
      }>("/aptitude/coding/submit", accessToken, {
        method: "POST",
        body: JSON.stringify({
          problemId: problem._id,
          language: selectedLanguage,
          code: currentCode,
        }),
      });
      setRunReport(res.report);
      void apiRequest<{ problem: ProblemDetail }>(`/aptitude/coding/problems/${problem._id}`, accessToken).then(refreshed => setProblem(refreshed.problem)).catch(() => {});
      setSubmissionResult({
        isAccepted: res.isAccepted,
        status: res.status,
        passedTestCases: res.passedTestCases,
        totalTestCases: res.totalTestCases,
        runtimeMs: res.runtimeMs,
      });

      if (res.isAccepted) {
        setShowAcceptedModal(true);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmittingCode(false);
    }
  };

  const currentIdx = allProblemIds.indexOf(problemId);
  const prevProblemId = currentIdx > 0 ? allProblemIds[currentIdx - 1] : null;
  const nextProblemId = currentIdx < allProblemIds.length - 1 ? allProblemIds[currentIdx + 1] : null;

  if (loading) {
    return (
      <div className="coding-ide-loading">
        <LoaderCircle size={32} className="spin" />
        <p>Opening Coding IDE...</p>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="coding-empty-state">
        <AlertCircle size={36} />
        <p>Problem could not be loaded.</p>
        <button className="button button-primary" onClick={onBack}>Back to catalog</button>
      </div>
    );
  }

  const lineCount = Math.max(1, currentCode.split("\n").length);
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  return (
    <div className="coding-ide-shell">
      {/* Top Navbar */}
      <header className="coding-ide-navbar">
        <div className="ide-nav-left">
          <button className="ide-back-btn" onClick={() => void leaveWorkspace(onBack)}>
            <ArrowLeft size={16} />
            <span>Problem List</span>
          </button>
          <div className="ide-nav-divider" />
          <div className="ide-nav-title">
            <strong>{problem.title}</strong>
            <span className={`diff-badge ${problem.difficulty}`}>{problem.difficulty}</span>
            <span className="ide-topic-pill">{problem.topic}</span>
          </div>
        </div>

        <div className="ide-nav-center">
          <button
            disabled={!prevProblemId}
            onClick={() => prevProblemId && void leaveWorkspace(() => onNavigateProblem(prevProblemId))}
            className="ide-nav-step-btn"
            title="Previous Problem"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="ide-step-indicator">{currentIdx + 1} / {allProblemIds.length}</span>
          <button
            disabled={!nextProblemId}
            onClick={() => nextProblemId && void leaveWorkspace(() => onNavigateProblem(nextProblemId))}
            className="ide-nav-step-btn"
            title="Next Problem"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="ide-nav-right">
          <button
            className={`ide-hint-btn ${leftTab === "hints" ? "active" : ""}`}
            onClick={() => setLeftTab("hints")}
          >
            <Lightbulb size={15} />
            <span>Hints ({problem.hints.length})</span>
          </button>
        </div>
      </header>

      {restoredLabel && <div className="coding-saved-banner" role="status"><CheckCircle2 size={16}/><span>{restoredLabel}</span><button onClick={() => setLeftTab("submissions")}>View submission history</button></div>}
      {/* Main Split Layout */}
      <div className="coding-ide-body">
        {/* Left Column: Problem Statement & Docs */}
        <section className="coding-pane problem-pane">
          <nav className="pane-tabs">
            <button
              className={leftTab === "description" ? "active" : ""}
              onClick={() => setLeftTab("description")}
            >
              Description
            </button>
            <button
              className={leftTab === "examples" ? "active" : ""}
              onClick={() => setLeftTab("examples")}
            >
              Use Cases ({problem.visibleTestCases.length})
            </button>
            <button
              className={leftTab === "hints" ? "active" : ""}
              onClick={() => setLeftTab("hints")}
            >
              Hints
            </button>
            <button
              className={leftTab === "submissions" ? "active" : ""}
              onClick={() => setLeftTab("submissions")}
            >
              Submissions ({problem.recentSubmissions.length})
            </button>
            <button
              className={leftTab === "approach" ? "active" : ""}
              onClick={() => setLeftTab("approach")}
            >
              Approach
            </button>
          </nav>

          <div className="pane-content">
            {leftTab === "description" && (
              <div className="problem-description-view">
                <h1>{problem.title}</h1>
                <div className="problem-tags-row">
                  <span className={`diff-pill ${problem.difficulty}`}>{problem.difficulty}</span>
                  <span className="problem-pill topic">{problem.topic}</span>
                  {problem.tags.map(t => (
                    <span key={t} className="problem-pill tag">#{t}</span>
                  ))}
                </div>

                <div className="problem-prompt-text">
                  <ProblemText text={problem.prompt}/>
                  {problem.sourceUrl && <a className="coding-source-link" href={problem.sourceUrl} target="_blank" rel="noreferrer">Source: {problem.sourceName} · {problem.license} license ↗</a>}
                </div>

                {/* Formatted Examples */}
                {problem.examples && problem.examples.length > 0 && (
                  <div className="problem-examples-section">
                    <h3>Examples</h3>
                    {problem.examples.map((ex, idx) => (
                      <div key={idx} className="example-card">
                        <header className="example-header">Example {idx + 1}:</header>
                        <div className="example-block">
                          <div className="example-row">
                            <span className="example-label">Input:</span>
                            <code>{ex.input}</code>
                          </div>
                          <div className="example-row">
                            <span className="example-label">Output:</span>
                            <code>{ex.output}</code>
                          </div>
                          {ex.explanation && (
                            <div className="example-row explanation">
                              <span className="example-label">Explanation:</span>
                              <p>{ex.explanation}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Constraints */}
                {problem.constraints && problem.constraints.length > 0 && (
                  <div className="problem-constraints-section">
                    <h3>Constraints</h3>
                    <ul>
                      {problem.constraints.map((c, idx) => (
                        <li key={idx}><code>{c}</code></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {leftTab === "examples" && (
              <div className="problem-usecases-view">
                <h3>Visible Use Cases</h3>
                <p className="usecases-subtitle">
                  These test cases are evaluated instantly when you click <strong>Run Code</strong>.
                </p>
                {problem.visibleTestCases.map(tc => (
                  <div key={tc.caseIndex} className="usecase-detail-card">
                    <header>
                      <span>Case {tc.caseIndex}</span>
                    </header>
                    <div className="usecase-fields">
                      <label>Input:</label>
                      <pre>{tc.input}</pre>
                      <label>Expected Output:</label>
                      <pre>{tc.expectedOutput}</pre>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {leftTab === "hints" && (
              <div className="problem-hints-view">
                <h3>Step-by-Step Clues</h3>
                <p className="hints-subtitle">Stuck? Reveal progressive hints without spoiling the full solution.</p>
                {problem.hints.length === 0 ? (
                  <p className="empty-sub">No hints available for this problem.</p>
                ) : (
                  problem.hints.map((hint, idx) => (
                    <details key={idx} className="hint-disclosure" open={idx === 0}>
                      <summary>
                        <Lightbulb size={16} />
                        <span>Hint {idx + 1}</span>
                      </summary>
                      <p>{hint}</p>
                    </details>
                  ))
                )}
              </div>
            )}

            {leftTab === "submissions" && (
              <div className="problem-submissions-view">
                <h3>My Recent Submissions</h3>
                {problem.recentSubmissions.length === 0 ? (
                  <p className="empty-sub">No submissions recorded yet for this challenge.</p>
                ) : (
                  <div className="submissions-list">
                    {problem.recentSubmissions.map(s => (
                      <div key={s._id} className={`submission-item ${s.status}`}>
                        <div className="submission-item-left">
                          <span className={`submission-badge ${s.status}`}>
                            {s.status === "accepted" ? "Accepted" : s.status.replace("_", " ")}
                          </span>
                          <small>{s.language} · {s.passedTestCases}/{s.totalTestCases} test cases</small>
                        </div>
                        <div className="submission-item-right">
                          <button className="submission-load-btn" onClick={() => { setSelectedLanguage(s.language); handleCodeChangeForLanguage(s.language, s.code); setRestoredLabel(s.status === "accepted" ? "Viewing your accepted submission." : "Viewing a previous submission."); }}>Open code</button>
                          <span className="submission-runtime">{s.runtimeMs} ms</span>
                          <span className="submission-time">
                            {new Date(s.createdAt).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {leftTab === "approach" && (
              <div className="problem-approach-view">
                <h3>Optimal Algorithmic Approach</h3>
                <div className="approach-card">
                  <p>{problem.explanation || "No explicit explanation provided."}</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Code Editor & Test Case Console */}
        <section className="coding-pane editor-pane">
          {/* Editor Header Toolbar */}
          <div className="editor-toolbar">
            <div className="editor-toolbar-left">
              <Code2 size={16} />
              <select
                className="language-selector"
                value={selectedLanguage}
                onChange={e => { dirtyRef.current = true; draftRevision.current++; setSelectedLanguage(e.target.value); }}
              >
                <option value="javascript">JavaScript (Node.js)</option>
                <option value="python">Python 3</option>
                <option value="java">Java (OpenJDK 17)</option>
                <option value="cpp">C++ (GCC 9.2)</option>
                <option value="typescript">TypeScript 5.0</option>
                <option value="c">C (GCC 9.2)</option>
                <option value="go">Go (1.13)</option>
              </select>
            </div>

            <div className="editor-toolbar-right">
              <button
                className="editor-btn"
                onClick={handleResetCode}
                title="Reset code to starter template"
              >
                <RotateCcw size={14} />
                <span>Reset</span>
              </button>
              <div className="font-size-picker">
                <button
                  className={fontSize === 13 ? "active" : ""}
                  onClick={() => setFontSize(13)}
                >
                  13
                </button>
                <button
                  className={fontSize === 14 ? "active" : ""}
                  onClick={() => setFontSize(14)}
                >
                  14
                </button>
                <button
                  className={fontSize === 16 ? "active" : ""}
                  onClick={() => setFontSize(16)}
                >
                  16
                </button>
              </div>
            </div>
          </div>

          <div className="coding-draft-status" role="status">{saveStatus}</div>
          {/* Code Area with Line Numbers */}
          <div className="editor-surface" style={{ fontSize: `${fontSize}px` }}>
            <div className="editor-gutter">
              {lineNumbers.map(n => (
                <span key={n}>{n}</span>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              className="editor-textarea"
              aria-label="Solution code"
              value={currentCode}
              onChange={e => handleCodeChange(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>

          {/* Bottom Console Panel */}
          <div className="ide-console-panel">
            <header className="console-header">
              <div className="console-tabs">
                <button
                  className={consoleTab === "cases" ? "active" : ""}
                  onClick={() => setConsoleTab("cases")}
                >
                  <ListFilter size={14} />
                  <span>Test Cases</span>
                </button>
                <button
                  className={consoleTab === "custom" ? "active" : ""}
                  onClick={() => setConsoleTab("custom")}
                >
                  <Terminal size={14} />
                  <span>Custom Input</span>
                </button>
                <button
                  className={consoleTab === "output" ? "active" : ""}
                  onClick={() => setConsoleTab("output")}
                >
                  <Terminal size={14} />
                  <span>
                    Output
                    {runReport && (
                      <span className={`run-dot ${runReport.allPassed ? "passed" : "failed"}`} />
                    )}
                  </span>
                </button>
              </div>

              {/* Action Buttons */}
              <div className="console-actions">
                <button
                  className="button button-run"
                  onClick={() => void handleRunCode()}
                  disabled={runningCode || submittingCode || !currentCode.trim()}
                >
                  {runningCode ? <LoaderCircle size={14} className="spin" /> : <Play size={14} />}
                  <span>Run Code</span>
                </button>

                <button
                  className="button button-submit"
                  onClick={() => void handleSubmitSolution()}
                  disabled={runningCode || submittingCode || !currentCode.trim()}
                >
                  {submittingCode ? <LoaderCircle size={14} className="spin" /> : <Send size={14} />}
                  <span>Submit</span>
                </button>
              </div>
            </header>

            {/* Console Content */}
            <div className="console-body">
              {consoleTab === "cases" && (
                <div className="console-cases-view">
                  <div className="case-pills-row">
                    {problem.visibleTestCases.map((tc, idx) => (
                      <button
                        key={tc.caseIndex}
                        className={`case-pill ${selectedCaseIdx === idx ? "active" : ""}`}
                        onClick={() => setSelectedCaseIdx(idx)}
                      >
                        Case {idx + 1}
                      </button>
                    ))}
                  </div>
                  {problem.visibleTestCases[selectedCaseIdx] && (
                    <div className="active-case-detail">
                      <div className="case-row">
                        <small>Input:</small>
                        <pre>{problem.visibleTestCases[selectedCaseIdx].input}</pre>
                      </div>
                      <div className="case-row">
                        <small>Expected Output:</small>
                        <pre>{problem.visibleTestCases[selectedCaseIdx].expectedOutput}</pre>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {consoleTab === "custom" && (
                <div className="console-custom-view">
                  <small>Enter raw stdin test input for your program:</small>
                  <textarea
                    placeholder="e.g. 9 4 2 7 11 15"
                    value={customInput}
                    onChange={e => setCustomInput(e.target.value)}
                  />
                </div>
              )}

              {consoleTab === "output" && (
                <div className="console-output-view">
                  {runningCode || submittingCode ? (
                    <div className="console-running">
                      <LoaderCircle size={22} className="spin" />
                      <p>{submittingCode ? "Evaluating against all test cases..." : "Executing visible test cases..."}</p>
                    </div>
                  ) : errorMsg ? (
                    <div className="console-error-box">
                      <AlertCircle size={16} />
                      <pre>{errorMsg}</pre>
                    </div>
                  ) : runReport ? (
                    <div className="console-results">
                      <div className="results-status-banner">
                        <div className="status-title-row">
                          <span className={`status-pill ${runReport.allPassed ? "passed" : "failed"}`}>
                            {runReport.allPassed ? "Accepted" : "Wrong Answer"}
                          </span>
                          <span className="runtime-tag">Runtime: {runReport.runtimeMs} ms</span>
                          <span className="passed-count-tag">
                            {runReport.passed} / {runReport.total} Cases Passed
                          </span>
                        </div>
                      </div>

                      <div className="results-cases-grid">
                        {runReport.results.map(r => (
                          <div key={r.caseIndex} className={`result-case-card ${r.passed ? "passed" : "failed"}`}>
                            <header>
                              <span>Case {r.caseIndex}</span>
                              <strong className={r.passed ? "text-pass" : "text-fail"}>{r.status}</strong>
                            </header>
                            <div className="case-diff-fields">
                              <div>
                                <small>Input:</small>
                                <pre>{r.input}</pre>
                              </div>
                              <div>
                                <small>Expected Output:</small>
                                <pre>{r.expectedOutput}</pre>
                              </div>
                              <div>
                                <small>Your Output:</small>
                                <pre className={r.passed ? "" : "mismatch"}>{r.actualOutput || "(No stdout)"}</pre>
                              </div>
                              {r.error && (
                                <div className="case-error-row">
                                  <small>Stderr / Error:</small>
                                  <pre className="error-text">{r.error}</pre>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="console-idle">
                      <Play size={20} />
                      <p>Click &quot;Run Code&quot; to test your solution against visible use cases, or &quot;Submit&quot; to test all cases.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* LeetCode Accepted Modal */}
      {showAcceptedModal && submissionResult && (
        <div className="coding-modal-overlay">
          <div className="coding-modal-backdrop" onClick={() => setShowAcceptedModal(false)} />
          <div className="coding-modal-card celebration-card">
            <span className="celebration-icon">
              <Trophy size={42} />
            </span>
            <p className="eyebrow-accent">Challenge Solved</p>
            <h2>Accepted! 🎉</h2>
            <p className="celebration-subtitle">
              All {submissionResult.totalTestCases} test cases passed (including hidden edge cases).
            </p>

            <div className="celebration-stats-row">
              <div className="stat-pill">
                <Clock3 size={16} />
                <div>
                  <strong>{submissionResult.runtimeMs} ms</strong>
                  <small>Runtime</small>
                </div>
              </div>
              <div className="stat-pill">
                <Check size={16} />
                <div>
                  <strong>{submissionResult.passedTestCases}/{submissionResult.totalTestCases}</strong>
                  <small>Passed</small>
                </div>
              </div>
              <div className="stat-pill">
                <Sparkles size={16} />
                <div>
                  <strong>Saved</strong>
                  <small>Your solution</small>
                </div>
              </div>
            </div>

            <div className="celebration-actions">
              <button
                className="button button-ghost"
                onClick={() => setShowAcceptedModal(false)}
              >
                Close
              </button>
              {nextProblemId ? (
                <button
                  className="button button-primary"
                  onClick={() => {
                    setShowAcceptedModal(false);
                    onNavigateProblem(nextProblemId);
                  }}
                >
                  Next Problem <ArrowRight size={15} />
                </button>
              ) : (
                <button
                  className="button button-primary"
                  onClick={() => {
                    setShowAcceptedModal(false);
                    onBack();
                  }}
                >
                  Return to Problem Catalog
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
