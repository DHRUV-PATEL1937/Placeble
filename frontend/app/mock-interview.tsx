"use client";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Camera,
  CameraOff,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  FileText,
  LoaderCircle,
  Mic,
  Mic2,
  Pause,
  Play,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Target,
  TrendingUp,
  Trophy,
  Video,
  Volume2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ReadinessScoreRing } from "./readiness-score-ring";
import { speakBrowserText, stopBrowserSpeech } from "./speech-service";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
type InterviewType = "hr" | "technical" | "behavioral" | "mixed";
type Turn = { turnNumber: number; question: string; answerTranscript: string; answerVideoUrl: string; timeSpentSeconds: number; scores: { structure: number; relevance: number; specificity: number; fillerWordRate: number }; feedback: string };
type Interview = { _id: string; type: InterviewType; targetRole: string; turns: Turn[]; totalTurns: number; currentQuestion: string; overallScore?: number; overallFeedback: string; strengths: string[]; improvements: string[]; status: "setup" | "in_progress" | "completed" | "abandoned"; startedAt: string; completedAt?: string };
type Summary = { active: Interview | null; completed: Interview[]; transcriptionMode: string; questionVoiceMode: string };
type Job = { id: string; kind: string; status: "queued" | "processing" | "complete" | "failed"; progress: number; message: string; result?: { interview: Interview; needsDebrief?: boolean; debriefJobId?: string }; error?: string };
type Screen = "home" | "setup" | "room" | "debrief";
type Permission = "idle" | "checking" | "ready" | "denied" | "unavailable";

const typeMeta: Record<InterviewType, { label: string; copy: string }> = {
  hr: { label: "HR", copy: "Motivation, self-awareness and role fit" },
  technical: { label: "Technical", copy: "Projects, decisions and problem solving" },
  behavioral: { label: "Behavioral", copy: "Evidence-led STAR-style responses" },
  mixed: { label: "Mixed", copy: "A realistic blend across interview styles" },
};

async function api<T>(path: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, ...init.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message ?? "The request could not be completed.");
  return payload as T;
}

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function scoreTone(score: number) {
  if (score >= 8) return "strong";
  if (score >= 6) return "building";
  return "focus";
}

export function MockInterview({ accessToken, onBack }: { accessToken: string; onBack: () => void }) {
  const [screen, setScreen] = useState<Screen>("home");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [interview, setInterview] = useState<Interview | null>(null);
  const [type, setType] = useState<InterviewType>("mixed");
  const [targetRole, setTargetRole] = useState("Software Engineer");
  const [totalTurns, setTotalTurns] = useState(5);
  const [permission, setPermission] = useState<Permission>("idle");
  const [typedMode, setTypedMode] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [voiceState, setVoiceState] = useState<"preparing" | "speaking" | "ready" | "off">("off");
  const [lastBlob, setLastBlob] = useState<Blob | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const questionStartedAtRef = useRef(0);

  const loadSummary = useCallback(async () => {
    const next = await api<Summary>("/interview/summary", accessToken);
    setSummary(next);
  }, [accessToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSummary().catch(cause => setError(cause instanceof Error ? cause.message : "Could not load interview practice.")).finally(() => setLoading(false)), 0);
    return () => window.clearTimeout(timer);
  }, [loadSummary]);

  useEffect(() => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [screen, permission]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    stopBrowserSpeech();
  }, []);

  const speakQuestion = useCallback((question: string) => {
    if (!question) { setVoiceState("off"); return; }
    stopBrowserSpeech();
    setVoiceState("preparing");
    window.setTimeout(() => {
      if (!speakBrowserText(question, { rate: .92, pitch: .94, onStart: () => setVoiceState("speaking"), onEnd: () => setVoiceState("ready"), onError: () => setVoiceState("off") })) setVoiceState("off");
    }, 260);
  }, []);

  useEffect(() => {
    if (screen === "room" && interview?.currentQuestion) {
      questionStartedAtRef.current = Date.now();
      const timer = window.setTimeout(() => speakQuestion(interview.currentQuestion), 0);
      return () => window.clearTimeout(timer);
    }
  }, [screen, interview?.currentQuestion, speakQuestion]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordSeconds(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  const requestMedia = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setPermission("unavailable"); return; }
    setPermission("checking"); setError("");
    try {
      streamRef.current?.getTracks().forEach(track => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } });
      streamRef.current = stream; setPermission("ready"); setTypedMode(false);
      window.setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play().catch(() => undefined); } }, 0);
    } catch { setPermission("denied"); }
  };

  const pollJob = useCallback(async (jobId: string) => {
    for (let index = 0; index < 300; index += 1) {
      await new Promise(resolve => window.setTimeout(resolve, 550));
      const response = await api<{ job: Job }>(`/interview/jobs/${jobId}`, accessToken);
      setJob(response.job);
      if (response.job.status === "failed") throw new Error(response.job.error ?? "The interview response could not be reviewed.");
      if (response.job.status === "complete") return response.job;
    }
    throw new Error("Reviewing this answer took too long. Your recording is safe—please retry.");
  }, [accessToken]);

  const openInterview = (next: Interview, destination: Screen = next.status === "completed" ? "debrief" : "room") => {
    setInterview(next); setScreen(destination); setError(""); setNotice(""); setTypedAnswer(""); setLastBlob(null); setUploadProgress(0); setJob(null);
  };

  const startSession = async () => {
    setBusy(true); setError("");
    try {
      const response = await api<{ interview: Interview }>("/interview/sessions", accessToken, { method: "POST", body: JSON.stringify({ type, targetRole, totalTurns }) });
      openInterview(response.interview, "room");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start this interview."); }
    finally { setBusy(false); }
  };

  const resumeSession = async (id: string) => {
    setBusy(true); setError("");
    try { const response = await api<{ interview: Interview }>(`/interview/sessions/${id}`, accessToken); openInterview(response.interview); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not resume this interview."); }
    finally { setBusy(false); }
  };

  const finishDebriefJob = useCallback(async (jobId: string) => {
    const completed = await pollJob(jobId);
    const next = completed.result?.interview;
    if (!next) throw new Error("The debrief finished without an interview result.");
    openInterview(next, "debrief");
    await loadSummary();
  }, [loadSummary, pollJob]);

  const uploadTurn = useCallback(async (blob: Blob | null, manualTranscript: string) => {
    if (!interview) return;
    setBusy(true); setError(""); setUploadProgress(1); setJob({ id: "upload", kind: "upload", status: "processing", progress: 1, message: "Uploading your answer" });
    try {
      const form = new FormData();
      if (blob) form.append("recording", blob, `answer-${interview.turns.length + 1}.webm`);
      form.append("manualTranscript", manualTranscript);
      form.append("timeSpentSeconds", String(Math.max(recordSeconds, Math.round((Date.now() - questionStartedAtRef.current) / 1000))));
      const queued = await new Promise<{ job: Job }>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("POST", `${API_URL}/interview/sessions/${interview._id}/turns`);
        request.setRequestHeader("Authorization", `Bearer ${accessToken}`);
        request.withCredentials = true;
        request.upload.onprogress = event => { if (event.lengthComputable) { const progress = Math.max(1, Math.round(event.loaded / event.total * 100)); setUploadProgress(progress); setJob(current => current ? { ...current, progress, message: `Uploading your answer · ${progress}%` } : current); } };
        request.onerror = () => reject(new Error("The upload was interrupted. Your recording is still available to retry."));
        request.onload = () => { const payload = JSON.parse(request.responseText || "{}"); if (request.status >= 200 && request.status < 300) resolve(payload); else reject(new Error(payload.message ?? "The answer could not be uploaded.")); };
        request.send(form);
      });
      setUploadProgress(100);
      const scored = await pollJob(queued.job.id);
      if (scored.result?.debriefJobId) { await finishDebriefJob(scored.result.debriefJobId); return; }
      if (!scored.result?.interview) throw new Error("The next question could not be loaded.");
      openInterview(scored.result.interview, "room");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not review this answer."); }
    finally { setBusy(false); }
  }, [accessToken, finishDebriefJob, interview, pollJob, recordSeconds]);

  const startRecording = () => {
    if (!streamRef.current) { void requestMedia(); return; }
    const preferred = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
    const recorder = new MediaRecorder(streamRef.current, { mimeType: preferred });
    chunksRef.current = []; recorderRef.current = recorder;
    recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
    recorder.onstop = () => { const blob = new Blob(chunksRef.current, { type: recorder.mimeType }); setLastBlob(blob); setRecording(false); void uploadTurn(blob, ""); };
    setRecordSeconds(0); setLastBlob(null); setError(""); stopBrowserSpeech(); setVoiceState("ready"); recorder.start(1000); setRecording(true);
  };

  const stopRecording = () => { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); };

  const endEarly = async () => {
    if (!interview) return;
    setBusy(true); setError(""); setJob({ id: "early", kind: "interview:debrief", status: "processing", progress: 8, message: "Preparing your early-session debrief" });
    try { const queued = await api<{ job: Job }>(`/interview/sessions/${interview._id}/complete`, accessToken, { method: "POST", body: "{}" }); await finishDebriefJob(queued.job.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not finish this interview."); }
    finally { setBusy(false); }
  };

  const abandon = async () => {
    if (!summary?.active) return;
    setBusy(true);
    try { await api(`/interview/sessions/${summary.active._id}/abandon`, accessToken, { method: "POST", body: "{}" }); await loadSummary(); setNotice("The unfinished session was closed. You can start fresh when ready."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not close this interview."); }
    finally { setBusy(false); }
  };

  const completed = summary?.completed ?? [];
  const averageScore = completed.length ? Math.round(completed.reduce((sum, item) => sum + (item.overallScore ?? 0), 0) / completed.length) : 0;
  const latestScore = completed[0]?.overallScore ?? 0;

  if (loading) return <div className="view-content inner-view mi-loading"><LoaderCircle size={28} /><h2>Opening Mock Interview</h2><p>Preparing your interview history and coaching room.</p></div>;

  if (screen === "setup") return <div className="view-content inner-view mock-interview-view"><InterviewTop label="Interview setup" onBack={() => setScreen("home")} />
    {error && <InterviewMessage type="error" text={error} onClose={() => setError("")} />}
    <section className="mi-setup-intro"><div><p className="eyebrow">Before you walk into the room</p><h1>Settle in. This is practice, not performance.</h1><p>Your question appears as text first, so you are never waiting on audio. Take a breath before you answer; silence is allowed here.</p></div><span><ShieldCheck size={22} /><strong>Private local session</strong><small>Recordings stay on your Placeble backend.</small></span></section>
    <div className="mi-setup-grid"><section className="mi-device-card"><header><div><p className="eyebrow">Camera and microphone</p><h2>Check how you’ll appear</h2></div><span className={`mi-permission ${permission}`}>{permission === "ready" ? <CheckCircle2 size={15} /> : permission === "checking" ? <LoaderCircle size={15} /> : <Camera size={15} />}{permission === "ready" ? "Ready" : permission === "checking" ? "Checking" : "Not checked"}</span></header><div className="mi-camera-preview">{permission === "ready" && !typedMode ? <video ref={videoRef} muted playsInline /> : <div>{typedMode ? <FileText size={30} /> : <CameraOff size={30} />}<strong>{typedMode ? "Typed-answer practice is ready" : permission === "denied" ? "Camera or microphone is blocked" : permission === "unavailable" ? "Recording is unavailable here" : "Your preview will appear here"}</strong><p>{typedMode ? "You can switch back to camera practice at any time." : permission === "denied" ? "Enable camera and microphone in your browser’s site settings, then retry." : "Nothing is recorded during this check."}</p></div>}<span className="mi-preview-name">Preview · only you can see this</span></div><div className="mi-device-actions"><button onClick={() => void requestMedia()} disabled={permission === "checking"}>{permission === "ready" ? <RefreshCw size={15} /> : <Video size={15} />}{permission === "ready" ? "Use camera practice" : "Enable camera & mic"}</button>{!typedMode && <button className="quiet" onClick={() => setTypedMode(true)}><FileText size={15} /> Use typed answers</button>}</div>{typedMode && <p className="mi-access-note"><Check size={14} /> Typed practice enabled. You’ll still receive the same fixed-rubric coaching.</p>}</section>
      <section className="mi-config-card"><p className="eyebrow">Session design</p><h2>What should the interviewer focus on?</h2><label><span>Interview type</span><div className="mi-type-grid">{(Object.keys(typeMeta) as InterviewType[]).map(item => <button key={item} className={type === item ? "selected" : ""} onClick={() => setType(item)}><i>{type === item ? <Check size={14} /> : <Circle size={14} />}</i><strong>{typeMeta[item].label}</strong><small>{typeMeta[item].copy}</small></button>)}</div></label><label><span>Target role <em>optional</em></span><div className="mi-role-input"><BriefcaseBusiness size={17} /><input value={targetRole} onChange={event => setTargetRole(event.target.value)} placeholder="e.g. Product Analyst" maxLength={120} /></div></label><label><span>Number of questions</span><div className="mi-length-picker">{[3, 5, 6].map(value => <button key={value} className={totalTurns === value ? "selected" : ""} onClick={() => setTotalTurns(value)}>{value}<small>{value === 3 ? "Quick" : value === 5 ? "Standard" : "Deep"}</small></button>)}</div></label><button className="button button-primary mi-enter-room" disabled={busy || (!typedMode && permission !== "ready")} onClick={() => void startSession()}>{busy ? <LoaderCircle size={17} /> : <ArrowRight size={17} />} Enter interview room</button>{!typedMode && permission !== "ready" && <small className="mi-start-hint">Complete the device check or choose typed answers to continue.</small>}</section></div>
  </div>;

  if (screen === "room" && interview) {
    const questionNumber = interview.turns.length + 1;
    return <div className="view-content inner-view mock-interview-view mi-room-view"><InterviewTop label="Interview room" onBack={() => { stopBrowserSpeech(); setScreen("home"); setNotice("Your interview is saved. Resume whenever you are ready."); void loadSummary(); }} />
      {error && <InterviewMessage type="error" text={error} onClose={() => setError("")} />}{notice && <InterviewMessage type="notice" text={notice} onClose={() => setNotice("")} />}
      <div className="mi-room-progress"><span>Question {questionNumber} of {interview.totalTurns}</span><div>{Array.from({ length: interview.totalTurns }, (_, index) => <i key={index} className={index < interview.turns.length ? "done" : index === interview.turns.length ? "current" : ""} />)}</div><button disabled={busy || recording || !interview.turns.length} onClick={() => void endEarly()}>End session early</button></div>
      <div className="mi-room-grid"><section className="mi-room-camera"><div className="mi-live-preview">{typedMode ? <div className="mi-typed-visual"><FileText size={32} /><strong>Typed-answer mode</strong><p>Use the editor below when you are ready.</p></div> : permission === "ready" ? <video ref={videoRef} muted playsInline /> : <div className="mi-typed-visual"><CameraOff size={32} /><strong>Camera is not connected</strong><p>Reconnect your devices or continue without recording.</p><div><button onClick={() => void requestMedia()}>Enable camera & mic</button><button onClick={() => setTypedMode(true)}>Use typed answers</button></div></div>}{recording && <div className="mi-recording-badge"><i /> Recording · {formatDuration(recordSeconds)}</div>}<span className="mi-room-name">{interview.targetRole || "General interview"} · {typeMeta[interview.type].label}</span></div><div className="mi-room-reassurance"><ShieldCheck size={15} /><span><strong>Your answer is private.</strong> It uploads only after you stop recording.</span></div></section>
        <section className="mi-question-panel"><header><p className="eyebrow">Current question</p><span className={`mi-voice ${voiceState}`}><Volume2 size={14} />{voiceState === "preparing" ? "Voice preparing" : voiceState === "speaking" ? "Reading aloud" : voiceState === "ready" ? "Voice complete" : "Text ready"}</span></header><h1>{interview.currentQuestion}</h1><p className="mi-thinking-copy">Take a moment to think. Start when your answer has a clear beginning, middle and end.</p>{typedMode ? <div className="mi-typed-answer"><textarea value={typedAnswer} onChange={event => setTypedAnswer(event.target.value)} placeholder="Type your practice answer naturally…" disabled={busy} /><span>{typedAnswer.trim().split(/\s+/).filter(Boolean).length} words</span><button className="button button-primary" disabled={busy || typedAnswer.trim().length < 20} onClick={() => void uploadTurn(null, typedAnswer)}><Send size={16} /> Submit answer</button></div> : <div className="mi-record-controls">{!recording ? <button className="mi-record-button" disabled={busy || permission !== "ready"} onClick={startRecording}><Mic size={20} /><span><strong>Start answering</strong><small>Camera and microphone will record</small></span></button> : <button className="mi-stop-button" onClick={stopRecording}><Square size={18} /><span><strong>Stop and submit</strong><small>{formatDuration(recordSeconds)} recorded</small></span></button>}<button className="mi-repeat-question" disabled={recording || busy} onClick={() => speakQuestion(interview.currentQuestion)}><Volume2 size={16} /> Hear question again</button></div>}{lastBlob && error && <button className="mi-retry-upload" disabled={busy} onClick={() => void uploadTurn(lastBlob, "")}><RefreshCw size={15} /> Retry saved recording</button>}</section></div>
      {busy && <InterviewTransition job={job} uploadProgress={uploadProgress} />}
    </div>;
  }

  if (screen === "debrief" && interview) return <div className="view-content inner-view mock-interview-view mi-debrief"><InterviewTop label="Interview debrief" onBack={() => { setScreen("home"); void loadSummary(); }} />
    <section className="mi-debrief-hero"><div className="mi-debrief-score"><ReadinessScoreRing score={interview.overallScore ?? 0} label="Interview score" /></div><div><p className="eyebrow">Session complete</p><h1>{(interview.overallScore ?? 0) >= 80 ? "Interview-ready habits are taking shape." : (interview.overallScore ?? 0) >= 60 ? "A useful performance with clear next steps." : "A baseline you can build on quickly."}</h1><p>{interview.overallFeedback}</p><div><span><Target size={16} />{typeMeta[interview.type].label}</span><span><BriefcaseBusiness size={16} />{interview.targetRole || "General role"}</span><span><Clock3 size={16} />{interview.turns.length} questions</span></div><button className="button button-primary" onClick={() => setScreen("setup")}><RefreshCw size={16} /> Practise again</button></div></section>
    <section className="mi-coaching-grid"><article><header><CheckCircle2 size={18} /><h2>What worked</h2></header>{interview.strengths.map(item => <p key={item}><Check size={14} />{item}</p>)}</article><article><header><TrendingUp size={18} /><h2>What to practise next</h2></header>{interview.improvements.map(item => <p key={item}><ArrowRight size={14} />{item}</p>)}</article></section>
    <section className="mi-turn-breakdown"><header><div><p className="eyebrow">Question-by-question</p><h2>See exactly where each answer landed.</h2></div><span>Fixed rubric · deterministic filler count</span></header>{interview.turns.map(turn => <article key={turn.turnNumber}><div className="mi-turn-number">{turn.turnNumber}</div><div className="mi-turn-content"><h3>{turn.question}</h3><blockquote>“{turn.answerTranscript.length > 300 ? `${turn.answerTranscript.slice(0, 300)}…` : turn.answerTranscript}”</blockquote><p><Sparkles size={15} />{turn.feedback}</p></div><div className="mi-rubric-grid"><Rubric label="Structure" value={turn.scores.structure} /><Rubric label="Relevance" value={turn.scores.relevance} /><Rubric label="Specificity" value={turn.scores.specificity} /><div className="mi-rubric filler"><span>Filler words</span><strong>{turn.scores.fillerWordRate}<em>/100 words</em></strong><small>Counted directly from transcript</small></div></div></article>)}</section>
  </div>;

  return <div className="view-content inner-view mock-interview-view"><InterviewTop label="Mock Interview" onBack={onBack} />
    {error && <InterviewMessage type="error" text={error} onClose={() => setError("")} />}{notice && <InterviewMessage type="notice" text={notice} onClose={() => setNotice("")} />}
    <section className="mi-home-hero"><div><p className="eyebrow">Practice the room, not a script</p><h1>Build answers that sound clear, specific and genuinely yours.</h1><p>A calm, turn-by-turn interview with real recording, server-side transcription, measured feedback and follow-up questions that respond to what you said.</p><div><button className="button button-primary" onClick={() => setScreen("setup")}><Mic2 size={17} /> Start mock interview</button>{completed[0] && <button className="button button-secondary" onClick={() => openInterview(completed[0], "debrief")}><Trophy size={17} /> View latest debrief</button>}</div><small><ShieldCheck size={14} /> Your question appears immediately. Voice playback never blocks the session.</small></div><aside><span><Mic2 size={24} /></span><p>Current interview signal</p><strong>{latestScore || 71}</strong><small>{completed.length ? "Latest completed session" : "Starter benchmark"}</small></aside></section>
    {summary?.active && <section className="mi-resume-session"><span><Pause size={19} /></span><div><strong>Your interview is saved and ready to resume</strong><p>{typeMeta[summary.active.type].label} · {summary.active.targetRole || "General role"} · {summary.active.turns.length}/{summary.active.totalTurns} answers complete. Closing the tab never discards it.</p></div><button disabled={busy} onClick={() => void abandon()}>Close session</button><button className="button button-primary" disabled={busy} onClick={() => void resumeSession(summary.active!._id)}><Play size={15} /> Resume</button></section>}
    <section className="mi-home-stats"><article><span><Trophy size={18} /></span><div><small>Average score</small><strong>{completed.length ? averageScore : "—"}</strong><p>{completed.length ? "Across completed interviews" : "Complete your first session"}</p></div></article><article><span><Video size={18} /></span><div><small>Sessions completed</small><strong>{completed.length}</strong><p>Every session keeps its full debrief</p></div></article><article><span><Target size={18} /></span><div><small>Coaching method</small><strong>3-part rubric</strong><p>Structure, relevance and specificity</p></div></article></section>
    <section className="mi-how-it-works"><header><p className="eyebrow">A steady interview loop</p><h2>Know what is happening at every step.</h2></header><div>{[["01","Question first","Read immediately while voice prepares."],["02","Answer naturally","Record on camera or use typed practice."],["03","Measured review","Transcript, rubric score and adaptive follow-up."],["04","Full debrief","Patterns and practical next steps across the session."]].map(([number,title,copy]) => <article key={number}><span>{number}</span><strong>{title}</strong><p>{copy}</p></article>)}</div></section>
    {completed.length > 0 && <section className="mi-history"><header><div><p className="eyebrow">Session history</p><h2>Your recent interviews</h2></div><span>{completed.length} completed</span></header><div>{completed.map(item => <button key={item._id} onClick={() => openInterview(item, "debrief")}><span className="mi-history-score">{item.overallScore}</span><div><strong>{typeMeta[item.type].label} interview · {item.targetRole || "General role"}</strong><small>{new Date(item.completedAt ?? item.startedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {item.turns.length} questions</small></div><em>Open debrief</em><ChevronRight size={17} /></button>)}</div></section>}
  </div>;
}

function InterviewTop({ label, onBack }: { label: string; onBack: () => void }) { return <header className="mi-module-top"><button onClick={onBack}><ArrowLeft size={17} /> All agents</button><div><span><Mic2 size={16} /></span><strong>{label}</strong></div></header>; }
function InterviewMessage({ type, text, onClose }: { type: "error" | "notice"; text: string; onClose: () => void }) { return <div className={`mi-message ${type}`}><span>{type === "error" ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}</span><p>{text}</p><button onClick={onClose}><X size={15} /></button></div>; }
function InterviewTransition({ job, uploadProgress }: { job: Job | null; uploadProgress: number }) { const isUpload = job?.kind === "upload"; return <div className="mi-transition"><section><span>{isUpload ? <Send size={22} /> : <Sparkles size={22} />}</span><p className="eyebrow">{isUpload ? "Sending securely" : "Purposeful pause"}</p><h2>{job?.message ?? "Reviewing your answer"}</h2><p>{isUpload ? "Your recording is moving to the local Placeble backend." : "Your transcript is being checked against the same fixed rubric used for every answer, while the next question is prepared."}</p><div><i style={{ width: `${isUpload ? uploadProgress : job?.progress ?? 12}%` }} /></div><small>{isUpload ? `${uploadProgress}% uploaded` : `${job?.progress ?? 12}% complete`}</small></section></div>; }
function Rubric({ label, value }: { label: string; value: number }) { return <div className={`mi-rubric ${scoreTone(value)}`}><span>{label}</span><strong>{value}<em>/10</em></strong><div><i style={{ width: `${value * 10}%` }} /></div><small>{value >= 8 ? "Strong evidence" : value >= 6 ? "Building well" : "Focus next"}</small></div>; }
