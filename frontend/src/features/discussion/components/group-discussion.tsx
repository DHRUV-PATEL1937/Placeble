import { AlertCircle, ArrowLeft, ArrowRight, BarChart3, Check, CheckCircle2, Clock3, FileText, Flag, Hand, Headphones, LoaderCircle, MessageSquareText, Mic, Pause, Play, RefreshCw, Send, ShieldCheck, Sparkles, Square, Target, TrendingUp, Trophy, UsersRound, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ReadinessScoreRing } from "@/src/components/ui/readiness-score-ring";
import { speakBrowserText, stopBrowserSpeech } from "@/src/services/speech-service";

const API_URL = import.meta.env.VITE_API_URL ?? "https://api.placeble.in/api/v1";
type PersonaKey = "persona_a" | "persona_b" | "persona_c";
type Persona = { key: PersonaKey; name: string; stance: "assertive" | "analytical" | "agreeable"; avatarKey: string; description: string; topicPosition: string };
type Turn = { turnNumber: number; speaker: "student" | PersonaKey; text: string; audioUrl?: string; timestampStart: number; timestampEnd: number; generationLatencyMs?: number };
type Session = { _id: string; topic: string; personas: Persona[]; turns: Turn[]; observerMetrics: { clarity: number; confidence: number; leadership: number; relevance: number }; heuristicFlags: { interruptionCount: number; longestSilenceSeconds: number; speakingTimeShare: number }; observerFeedback: string; observerStrengths: string[]; observerImprovements: string[]; status: "setup" | "in_progress" | "completed" | "abandoned"; startedAt: string; completedAt?: string; orchestration: { processing: boolean; currentPersonaKey: PersonaKey | ""; turnCap: number; endsAtMs: number } };
type Summary = { active: Session | null; completed: Session[]; abandoned: Session[]; topics: string[]; interruptionRule: string; voiceMode: string; transcriptionMode: string };
type Job = { id: string; kind: "gd:personaTurn" | "gd:scoreSession"; status: "queued" | "processing" | "complete" | "failed"; progress: number; message: string; speakerKey?: PersonaKey; error?: string; result?: { session?: Session; deferred?: boolean; speakerKey?: PersonaKey; latencyMs?: number; nextDelayMs?: number; shouldEnd?: boolean } };
type Screen = "home" | "setup" | "room" | "score";
type Permission = "idle" | "checking" | "ready" | "denied" | "unavailable";

async function requestUserMedia(constraints: MediaStreamConstraints, timeoutMs = 8000) {
  let timedOut = false;
  const request = navigator.mediaDevices.getUserMedia(constraints).then(stream => {
    if (timedOut) { stream.getTracks().forEach(track => track.stop()); throw new Error("Device check timed out."); }
    return stream;
  });
  const timeout = new Promise<never>((_, reject) => window.setTimeout(() => { timedOut = true; reject(new Error("Device check timed out.")); }, timeoutMs));
  return Promise.race([request, timeout]);
}

const personaPreview: Array<Pick<Persona, "key" | "name" | "stance" | "description">> = [
  { key: "persona_a", name: "Riya Malhotra", stance: "assertive", description: "Direct, decisive, and willing to challenge a weak assumption." },
  { key: "persona_b", name: "Dev Menon", stance: "analytical", description: "Measured and evidence-led; separates every argument into parts." },
  { key: "persona_c", name: "Sana Qureshi", stance: "agreeable", description: "Warm and inclusive; finds common ground without avoiding disagreement." },
];

const voiceByPersona: Record<PersonaKey, { rate: number; pitch: number }> = { persona_a: { rate: 1.04, pitch: 1.02 }, persona_b: { rate: .88, pitch: .93 }, persona_c: { rate: .96, pitch: 1.09 } };

async function api<T>(path: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, ...init.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message ?? "The request could not be completed.");
  return payload as T;
}

function initials(name: string) { return name.split(" ").map(part => part[0]).slice(0, 2).join(""); }
function formatClock(totalSeconds: number) { return `${Math.floor(Math.max(0, totalSeconds) / 60).toString().padStart(2, "0")}:${Math.max(0, totalSeconds) % 60}`.replace(/:(\d)$/, ":0$1"); }
function averageMetric(session: Session) { const values = Object.values(session.observerMetrics); return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) : 0; }

export function GroupDiscussion({ accessToken, onBack }: { accessToken: string; onBack: () => void }) {
  const [screen, setScreen] = useState<Screen>("home");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [topic, setTopic] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(6);
  const [permission, setPermission] = useState<Permission>("idle");
  const [typedMode, setTypedMode] = useState(false);
  const [typedPoint, setTypedPoint] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [speakingKey, setSpeakingKey] = useState<PersonaKey | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef(0);
  const nextTimerRef = useRef<number | null>(null);
  const flowTokenRef = useRef(0);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const loadSummary = useCallback(async () => {
    const next = await api<Summary>("/gd/summary", accessToken);
    setSummary(next); setTopic(current => current || next.topics[0] || "");
  }, [accessToken]);

  useEffect(() => { const timer = window.setTimeout(() => void loadSummary().catch(cause => setError(cause instanceof Error ? cause.message : "Discussion practice could not be loaded.")).finally(() => setLoading(false)), 0); return () => window.clearTimeout(timer); }, [loadSummary]);
  useEffect(() => () => { streamRef.current?.getTracks().forEach(track => track.stop()); stopBrowserSpeech(); if (nextTimerRef.current) window.clearTimeout(nextTimerRef.current); }, []);
  useEffect(() => { transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [session?.turns.length, job?.status]);
  useEffect(() => {
    if (screen !== "room" || !session) return;
    const update = () => setTimeLeft(Math.max(0, Math.ceil((session.orchestration.endsAtMs - (Date.now() - new Date(session.startedAt).getTime())) / 1000)));
    update(); const timer = window.setInterval(update, 1000); return () => window.clearInterval(timer);
  }, [screen, session]);
  useEffect(() => { if (!recording) return; const timer = window.setInterval(() => setRecordSeconds(value => value + 1), 1000); return () => window.clearInterval(timer); }, [recording]);

  const requestMicrophone = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setPermission("unavailable"); setTypedMode(true); return; }
    setPermission("checking"); setError("");
    try { streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = await requestUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); setPermission("ready"); setTypedMode(false); }
    catch { setPermission("denied"); setTypedMode(true); }
  };

  const clearNext = () => { if (nextTimerRef.current) window.clearTimeout(nextTimerRef.current); nextTimerRef.current = null; };

  const queueNext = async (sessionId: string) => {
    try { const response = await api<{ job: Job }>(`/gd/sessions/${sessionId}/next`, accessToken, { method: "POST", body: "{}" }); void pollJob(response.job); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The next participant could not respond."); }
  };

  const playPersona = (nextSession: Session, result: NonNullable<Job["result"]>) => {
    const key = result.speakerKey; if (!key) return;
    const latestTurn = [...nextSession.turns].reverse().find(turn => turn.speaker === key); if (!latestTurn) return;
    const token = flowTokenRef.current; setSpeakingKey(key);
    const afterSpeech = () => {
      if (flowTokenRef.current !== token) return;
      setSpeakingKey(null);
      if (result.shouldEnd) { void endSession(nextSession._id); return; }
      nextTimerRef.current = window.setTimeout(() => { if (flowTokenRef.current === token) void queueNext(nextSession._id); }, result.nextDelayMs ?? 2200);
    };
    const voice = voiceByPersona[key];
    if (!speakBrowserText(latestTurn.text, { ...voice, onEnd: afterSpeech, onError: afterSpeech })) nextTimerRef.current = window.setTimeout(afterSpeech, Math.min(12_000, Math.max(2500, latestTurn.text.split(/\s+/).length * 350)));
  };

  const pollJob = async (initial: Job) => {
    const token = flowTokenRef.current;
    setJob(initial);
    try {
      let current = initial;
      for (let attempt = 0; attempt < 160; attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, 350));
        current = (await api<{ job: Job }>(`/gd/jobs/${initial.id}`, accessToken)).job; if (flowTokenRef.current === token) setJob(current);
        if (current.status === "failed") throw new Error(current.error ?? "The discussion task failed.");
        if (current.status === "complete") break;
      }
      if (current.status !== "complete") throw new Error("The discussion is taking longer than expected. Please retry.");
      if (flowTokenRef.current !== token && current.kind === "gd:personaTurn") return;
      if (current.result?.session) setSession(current.result.session);
      if (current.kind === "gd:scoreSession" && current.result?.session) { setScreen("score"); setNotice("Your Observer scorecard is ready."); await loadSummary(); }
      else if (!current.result?.deferred && current.result?.session) playPersona(current.result.session, current.result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The discussion task failed."); }
    finally { if (flowTokenRef.current === token) { setJob(null); setBusy(false); } }
  };

  const startSession = async () => {
    const selectedTopic = topic === "custom" ? customTopic.trim() : topic;
    if (selectedTopic.length < 12) { setError("Enter a clear discussion topic before starting."); return; }
    setBusy(true); setError("");
    try { const response = await api<{ session: Session; job: Job }>("/gd/sessions", accessToken, { method: "POST", body: JSON.stringify({ topic: selectedTopic, durationMinutes, turnCap: durationMinutes <= 4 ? 8 : durationMinutes <= 7 ? 10 : 14 }) }); setSession(response.session); setScreen("room"); setBusy(false); void pollJob(response.job); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The discussion could not begin."); setBusy(false); }
  };

  const resumeSession = async (active: Session) => {
    setBusy(true); setError(""); flowTokenRef.current += 1;
    try { const response = await api<{ session: Session; job: Job | null }>(`/gd/sessions/${active._id}/resume`, accessToken, { method: "POST", body: "{}" }); setSession(response.session); setScreen("room"); if (response.job) void pollJob(response.job); else nextTimerRef.current = window.setTimeout(() => void queueNext(active._id), 1200); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The discussion could not be resumed."); }
    finally { setBusy(false); }
  };

  const interrupt = (sessionId: string) => {
    const duringPersonaPlayback = Boolean(speakingKey || job?.kind === "gd:personaTurn");
    flowTokenRef.current += 1; clearNext(); stopBrowserSpeech(); setSpeakingKey(null);
    void api(`/gd/sessions/${sessionId}/interrupt`, accessToken, { method: "POST", body: JSON.stringify({ duringPersonaPlayback }) }).catch(() => undefined);
  };

  const submitStudentTurn = async (blob: Blob | null, transcript: string, timestampStart: number, timestampEnd: number) => {
    if (!session) return;
    setBusy(true); setError("");
    try {
      const form = new FormData(); form.append("manualTranscript", transcript); form.append("timestampStart", String(timestampStart)); form.append("timestampEnd", String(timestampEnd)); if (blob) form.append("recording", blob, "gd-point.webm");
      const response = await fetch(`${API_URL}/gd/sessions/${session._id}/student-turns`, { method: "POST", credentials: "include", headers: { Authorization: `Bearer ${accessToken}` }, body: form });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.message ?? "Your point could not be submitted.");
      setSession(payload.session); setTypedPoint(""); setRecordSeconds(0); setBusy(false); void pollJob(payload.job);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your point could not be submitted."); setBusy(false); }
  };

  const beginTalking = () => {
    if (!session || recording || busy) return;
    interrupt(session._id);
    if (typedMode || permission !== "ready" || !streamRef.current) { setTypedMode(true); return; }
    const preferred = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    const recorder = new MediaRecorder(streamRef.current, { mimeType: preferred }); recorderRef.current = recorder; chunksRef.current = []; recordStartRef.current = Math.max(0, Date.now() - new Date(session.startedAt).getTime());
    recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
    recorder.onstop = () => { const end = Math.max(recordStartRef.current + 300, Date.now() - new Date(session.startedAt).getTime()); const blob = new Blob(chunksRef.current, { type: recorder.mimeType }); setRecording(false); void submitStudentTurn(blob, "", recordStartRef.current, end); };
    recorder.start(250); setRecordSeconds(0); setRecording(true);
  };

  const stopTalking = () => { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); };
  const submitTyped = async () => { if (!session || typedPoint.trim().length < 8) return; interrupt(session._id); await new Promise(resolve => window.setTimeout(resolve, 120)); const end = Date.now() - new Date(session.startedAt).getTime(); const estimated = Math.max(1500, typedPoint.trim().split(/\s+/).length / 2.4 * 1000); void submitStudentTurn(null, typedPoint.trim(), Math.max(0, end - estimated), end); };

  async function endSession(sessionId = session?._id) {
    if (!sessionId || busy) return; flowTokenRef.current += 1; clearNext(); stopBrowserSpeech(); setSpeakingKey(null); setBusy(true); setError("");
    try { const response = await api<{ job: Job }>(`/gd/sessions/${sessionId}/end`, accessToken, { method: "POST", body: "{}" }); void pollJob(response.job); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The scorecard could not be prepared."); setBusy(false); }
  }

  const leaveRoom = () => { flowTokenRef.current += 1; clearNext(); stopBrowserSpeech(); setSpeakingKey(null); setScreen("home"); setNotice("Discussion paused. You can resume it from this page."); void loadSummary(); };
  const abandon = async () => { if (!session) return; flowTokenRef.current += 1; clearNext(); stopBrowserSpeech(); try { await api(`/gd/sessions/${session._id}/abandon`, accessToken, { method: "POST", body: "{}" }); setSession(null); setScreen("home"); setConfirmAbandon(false); setNotice("The unfinished discussion was marked abandoned."); await loadSummary(); } catch (cause) { setError(cause instanceof Error ? cause.message : "The session could not be abandoned."); } };

  const speakerLabel = (speaker: Turn["speaker"]) => speaker === "student" ? "You" : session?.personas.find(persona => persona.key === speaker)?.name ?? speaker;
  const studentTurns = session?.turns.filter(turn => turn.speaker === "student").length ?? 0;

  if (loading) return <div className="view-content inner-view gd-loading"><LoaderCircle size={28} /><h2>Opening Group Discussion</h2><p>Preparing the room and your recent sessions.</p></div>;
  if (screen === "setup") return <div className="view-content inner-view gd-view"><GdTop label="Session setup" onBack={() => setScreen("home")} /><section className="gd-setup-hero"><div><p className="eyebrow">Meet the room before you enter</p><h1>Three real viewpoints. One discussion you have to navigate.</h1><p>They will disagree, reframe, and invite you in. You can interrupt naturally with push-to-talk at any moment.</p></div><span><ShieldCheck size={20} /><strong>Resumable practice</strong><small>Leave safely or explicitly abandon.</small></span></section><div className="gd-setup-grid"><section className="gd-setup-form"><header><span><Target size={18} /></span><div><h2>Choose the discussion</h2><p>A clear topic creates sharper disagreement.</p></div></header><label><span>Topic</span><select value={topic} onChange={event => setTopic(event.target.value)}>{summary?.topics.map(item => <option key={item} value={item}>{item}</option>)}<option value="custom">Write my own topic</option></select></label>{topic === "custom" && <label><span>Custom topic</span><textarea value={customTopic} onChange={event => setCustomTopic(event.target.value)} placeholder="e.g. Should college placements use skills-based screening instead of degree cut-offs?" /></label>}<label><span>Session length</span><div className="gd-duration-options">{[4, 6, 9].map(minutes => <button key={minutes} className={durationMinutes === minutes ? "active" : ""} onClick={() => setDurationMinutes(minutes)}><strong>{minutes} min</strong><small>{minutes === 4 ? "Quick round" : minutes === 6 ? "Recommended" : "Deep practice"}</small></button>)}</div></label><div className="gd-mic-check"><span className={permission}><Mic size={18} /></span><div><strong>{permission === "ready" ? "Microphone ready" : typedMode ? "Typed practice enabled" : "Check your microphone"}</strong><small>{permission === "ready" ? "Hold the button to speak in the room." : "You can always use typed points instead."}</small></div><button onClick={() => void requestMicrophone()}>{permission === "ready" ? <RefreshCw size={14} /> : <Headphones size={14} />}{permission === "ready" ? "Recheck" : "Enable mic"}</button></div><button className="gd-typed-toggle" onClick={() => setTypedMode(value => !value)}><FileText size={14} />{typedMode ? "Use microphone practice" : "Use typed contributions"}</button><button className="button button-primary gd-enter" disabled={busy} onClick={() => void startSession()}>{busy ? <LoaderCircle size={17} /> : <UsersRound size={17} />}{busy ? "Opening the room…" : "Enter discussion room"}</button>{error && <GdError message={error} onClose={() => setError("")} />}</section><section className="gd-persona-intro"><header><p className="eyebrow">Your group</p><h2>Distinct people, not three name tags.</h2></header>{personaPreview.map((persona, index) => <article className={persona.stance} key={persona.key}><span>{initials(persona.name)}</span><div><small>Participant {index + 1} · {persona.stance}</small><h3>{persona.name}</h3><p>{persona.description}</p></div></article>)}<div className="gd-observer-note"><BarChart3 size={17} /><span><strong>The Observer stays silent.</strong><small>Scoring happens once, only after the discussion ends.</small></span></div></section></div></div>;

  if (screen === "room" && session) return <div className="view-content inner-view gd-view gd-room-view"><GdTop label="Discussion room" onBack={leaveRoom} /><div className="gd-room-status"><div><span><i className={timeLeft < 60 ? "ending" : ""} /> Live practice</span><strong>{formatClock(timeLeft)}</strong><small>{session.turns.length} contributions</small></div><p>{session.topic}</p><div><button disabled={busy || !studentTurns} onClick={() => void endSession()}><Flag size={14} /> End & score</button><button className="quiet" onClick={() => setConfirmAbandon(true)}><X size={14} /> Abandon</button></div></div>{error && <GdError message={error} onClose={() => setError("")} />}<section className="gd-persona-row">{session.personas.map(persona => { const isSpeaking = speakingKey === persona.key; const isThinking = job?.kind === "gd:personaTurn" && job.speakerKey === persona.key; return <article key={persona.key} className={`${persona.stance} ${isSpeaking ? "speaking" : ""} ${isThinking ? "thinking" : ""}`}><span className="gd-avatar">{initials(persona.name)}{isSpeaking && <i />}</span><div><small>{persona.stance}</small><strong>{persona.name}</strong><p>{isSpeaking ? <><Volume2 size={12} /> Speaking now</> : isThinking ? <><i /><i /><i /> Forming a point</> : persona.description}</p></div></article>; })}</section><div className="gd-room-grid"><section className="gd-transcript"><header><div><p className="eyebrow">Live transcript</p><h2>Follow the thread, not a script.</h2></div><span><MessageSquareText size={14} /> {session.turns.length} turns</span></header><div className="gd-transcript-feed">{!session.turns.length && <div className="gd-transcript-empty"><LoaderCircle size={20} /><strong>The room is settling in…</strong><p>The first participant will open with a clear position.</p></div>}{session.turns.map(turn => <article className={turn.speaker === "student" ? "student" : turn.speaker} key={`${turn.turnNumber}-${turn.timestampStart}`}><span>{turn.speaker === "student" ? "You" : initials(speakerLabel(turn.speaker))}</span><div><header><strong>{speakerLabel(turn.speaker)}</strong><small>{Math.round(turn.timestampStart / 1000)}s</small></header><p>{turn.text}</p></div></article>)}{job?.kind === "gd:personaTurn" && <article className={`typing ${job.speakerKey ?? ""}`}><span>…</span><div><header><strong>{session.personas.find(persona => persona.key === job.speakerKey)?.name ?? "A participant"}</strong></header><p>{job.message}<i /><i /><i /></p></div></article>}<div ref={transcriptEndRef} /></div></section><aside className="gd-contribute"><header><span><Hand size={18} /></span><div><p className="eyebrow">Your contribution</p><h2>Jump in when the point matters.</h2></div></header>{typedMode ? <div className="gd-typed-point"><textarea value={typedPoint} onChange={event => setTypedPoint(event.target.value)} disabled={busy} placeholder="Type your point naturally. Address someone by name if you want their response…" /><span>{typedPoint.trim().split(/\s+/).filter(Boolean).length} words</span><button className="button button-primary" disabled={busy || typedPoint.trim().length < 8} onClick={() => void submitTyped()}><Send size={16} /> Add to discussion</button></div> : <div className="gd-ptt"><button className={recording ? "active" : ""} disabled={busy || permission !== "ready"} onPointerDown={beginTalking} onPointerUp={stopTalking} onPointerCancel={stopTalking} onKeyDown={event => { if ((event.key === " " || event.key === "Enter") && !recording) { event.preventDefault(); beginTalking(); } }} onKeyUp={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); stopTalking(); } }}><span>{recording ? <Square size={23} /> : <Mic size={25} />}</span><strong>{recording ? "Release to send" : "Hold to talk"}</strong><small>{recording ? `${formatClock(recordSeconds)} · recording` : permission === "ready" ? "You can interrupt at any time" : "Enable microphone in setup"}</small></button><p><i className={recording ? "active" : ""} />{recording ? "Your microphone is live" : "Microphone is inactive"}</p></div>}<button className="gd-mode-switch" onClick={() => setTypedMode(value => !value)}>{typedMode ? <Mic size={14} /> : <FileText size={14} />}{typedMode ? "Switch to push-to-talk" : "Type instead"}</button><div className="gd-interruption-rule"><ShieldCheck size={15} /><p><strong>Natural interruption rule</strong>{summary?.interruptionRule}</p></div><div className="gd-room-tip"><Sparkles size={15} /><p><strong>Try this</strong>Build on one point, challenge one assumption, or bring the group back to the topic.</p></div></aside></div>{job?.kind === "gd:scoreSession" && <ScoreLoading job={job} />}{confirmAbandon && <div className="gd-modal-layer"><button aria-label="Close abandon dialog" className="gd-modal-scrim" onClick={() => setConfirmAbandon(false)} /><section><span><Pause size={21} /></span><h2>Abandon this discussion?</h2><p>Leaving with the back button is safe and resumable. Abandoning closes this session without an Observer score.</p><div><button onClick={() => setConfirmAbandon(false)}>Keep practising</button><button className="danger" onClick={() => void abandon()}>Abandon session</button></div></section></div>}</div>;

  if (screen === "score" && session) { const share = Math.round(session.heuristicFlags.speakingTimeShare * 100); return <div className="view-content inner-view gd-view"><GdTop label="Observer scorecard" onBack={() => { setScreen("home"); setSession(null); void loadSummary(); }} /><section className="gd-score-hero"><div><p className="eyebrow">Discussion complete</p><h1>Your strongest point is only useful if the room can follow it.</h1><p>{session.topic}</p></div><ReadinessScoreRing score={averageMetric(session)} label="GD score" /></section><section className="gd-observer-feedback"><span><BarChart3 size={20} /></span><div><p className="eyebrow">Silent Observer</p><h2>What changed the room</h2><p>{session.observerFeedback}</p></div></section><section className="gd-metric-grid">{Object.entries(session.observerMetrics).map(([label, value]) => <article key={label}><header><span>{label}</span><strong>{value.toFixed(1)}<small>/10</small></strong></header><i><b style={{ width: `${value * 10}%` }} /></i><p>{label === "clarity" ? "Could the group follow your reasoning?" : label === "confidence" ? "Did your points sound direct and owned?" : label === "leadership" ? "Did you advance or organise the room?" : "Did each contribution serve the topic?"}</p></article>)}</section><section className="gd-heuristics"><header><p className="eyebrow">Measured from session timing</p><h2>Participation patterns, in plain language.</h2></header><div><article><span><UsersRound size={18} /></span><p><strong>You spoke for about {share}% of the discussion.</strong><small>In a group of four, an even share is around 25%. {share < 18 ? "Look for one earlier entry point next time." : share > 38 ? "Leave a little more room for others to develop their points." : "Your share stayed within a constructive range."}</small></p></article><article><span><Hand size={18} /></span><p><strong>{session.heuristicFlags.interruptionCount ? `${session.heuristicFlags.interruptionCount} overlapping contribution${session.heuristicFlags.interruptionCount === 1 ? "" : "s"}.` : "No overlapping contributions."}</strong><small>{session.heuristicFlags.interruptionCount ? "Overlap can show confidence; use names and a short bridge so it stays constructive." : "You waited for clear space before speaking."}</small></p></article><article><span><Clock3 size={18} /></span><p><strong>Your longest quiet gap was {session.heuristicFlags.longestSilenceSeconds.toFixed(1)} seconds.</strong><small>{session.heuristicFlags.longestSilenceSeconds > 14 ? "Prepare one compact entry phrase so long pauses do not become missed opportunities." : "You stayed available to the discussion without forcing every pause."}</small></p></article></div></section><div className="gd-coaching-grid"><section><header><CheckCircle2 size={17} /><h2>Keep doing</h2></header>{session.observerStrengths.map(item => <p key={item}><Check size={13} />{item}</p>)}</section><section><header><TrendingUp size={17} /><h2>Practise next</h2></header>{session.observerImprovements.map(item => <p key={item}><ArrowRight size={13} />{item}</p>)}</section></div><footer className="gd-score-actions"><button className="button button-primary" onClick={() => { setSession(null); setScreen("setup"); }}><RefreshCw size={16} /> Practise another topic</button><button className="button button-secondary" onClick={() => { setSession(null); setScreen("home"); void loadSummary(); }}><Trophy size={16} /> Session history</button></footer></div>; }

  const completed = summary?.completed ?? []; const active = summary?.active ?? null; return <div className="view-content inner-view gd-view"><GdTop label="Group Discussion" onBack={onBack} />{notice && <div className="gd-notice"><Check size={15} />{notice}<button onClick={() => setNotice("")}><X size={14} /></button></div>}{error && <GdError message={error} onClose={() => setError("")} />}<section className="gd-home-hero"><div><p className="eyebrow">Practise the room, not a monologue</p><h1>Learn to enter, challenge, and move a live discussion forward.</h1><p>Three distinct AI participants hold real positions. A silent Observer scores your contribution only when the session ends.</p><div><button className="button button-primary" onClick={() => setScreen("setup")}><UsersRound size={17} /> Start group discussion</button>{completed[0] && <button className="button button-secondary" onClick={() => { setSession(completed[0]); setScreen("score"); }}><Trophy size={17} /> Latest scorecard</button>}</div><small><ShieldCheck size={14} /> Shared Gemini transcription · browser voice playback · private student session</small></div><aside><span><MessageSquareText size={24} /></span><p>Discussion signal</p><strong>{completed[0] ? averageMetric(completed[0]) : "—"}</strong><small>{completed.length ? "Latest Observer score" : "No scored discussion yet"}</small></aside></section>{active && <section className="gd-resume-card"><span><Play size={20} /></span><div><p className="eyebrow">Discussion in progress</p><h2>{active.topic}</h2><small>{active.turns.length} contributions · safely resumable</small></div><button disabled={busy} onClick={() => void resumeSession(active)}><Play size={15} /> Resume room</button></section>}<section className="gd-how"><header><p className="eyebrow">How the room behaves</p><h2>Designed to feel social, not scripted.</h2></header><div><article><span>01</span><h3>Different positions</h3><p>Each participant carries a separate personality prompt and topic stance.</p></article><article><span>02</span><h3>Dynamic pacing</h3><p>The server chooses who responds based on recency, direct address, and timing.</p></article><article><span>03</span><h3>You can interrupt</h3><p>Push-to-talk stops playback and defers that speaker until after your point.</p></article><article><span>04</span><h3>One final Observer</h3><p>Scoring happens once at the end, separate from every persona response.</p></article></div></section><section className="gd-history"><header><div><p className="eyebrow">Recent practice</p><h2>Your discussion scorecards</h2></div><span>{completed.length} completed</span></header>{completed.length ? <div>{completed.map(item => <button key={item._id} onClick={() => { setSession(item); setScreen("score"); }}><span><UsersRound size={17} /></span><div><strong>{item.topic}</strong><small>{item.turns.length} contributions · {new Date(item.completedAt ?? item.startedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</small></div><b>{averageMetric(item)}</b><ArrowRight size={15} /></button>)}</div> : <section><MessageSquareText size={25} /><h3>No completed discussions yet.</h3><p>Your first Observer scorecard will appear here.</p></section>}</section></div>;
}

function GdTop({ label, onBack }: { label: string; onBack: () => void }) { return <header className="gd-top"><button onClick={onBack}><ArrowLeft size={17} /> Back</button><div><span><UsersRound size={16} /></span><strong>{label}</strong></div></header>; }
function GdError({ message, onClose }: { message: string; onClose: () => void }) { return <div className="gd-error"><AlertCircle size={16} /><span>{message}</span><button onClick={onClose}><X size={14} /></button></div>; }
function ScoreLoading({ job }: { job: Job }) { return <div className="gd-score-loading" role="status"><section><span><BarChart3 size={23} /></span><p className="eyebrow">The room is quiet now</p><h2>{job.message}</h2><p>Timing patterns are calculated directly. The Observer reads the transcript once for your coaching scorecard.</p><div><i style={{ width: `${job.progress}%` }} /></div><small>{job.progress}% complete</small></section></div>; }
