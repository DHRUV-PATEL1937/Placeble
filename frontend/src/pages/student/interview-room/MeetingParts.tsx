import { AlertTriangle, ArrowRight, Briefcase, Camera, CameraOff, CheckCircle2, Clock3, FileText, LoaderCircle, Mic, MicOff, PhoneOff, Play, RefreshCw, ShieldCheck, Sparkles, Users, Video, Volume2 } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import type { PanelSubAgent } from "../MockInterviewPage";
import { HumanAvatar, LOOKS } from "./HumanAvatar";
import type { DeviceChoice, DeviceIssue } from "./devices";

export const ROLE_LABEL: Record<PanelSubAgent["id"], string> = { hr: "HR lead", technical: "Technical lead", behavioral: "Behavioural lead" };
export const ROOM_NAME = "Interview Room";

/* ───────── Top bar ───────── */
export function MeetingHeader({ title, typeLabel, questionNumber, total, answered, seconds, participants, mode, onMode, onLeave, leaveDisabled }: {
  title: string; typeLabel: string; questionNumber: number; total: number; answered: number; seconds: number; participants: number;
  mode: "meeting" | "text"; onMode: (mode: "meeting" | "text") => void; onLeave: () => void; leaveDisabled: boolean;
}) {
  const time = `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  return (
    <header className="ir-top">
      <div className="ir-top-left">
        <span className="ir-live"><i aria-hidden="true" /> Live</span>
        <div><h2>{title}</h2><small>{typeLabel} · {ROOM_NAME}</small></div>
      </div>
      <div className="ir-top-right">
        <span className="ir-chip" title="Time in the room"><Clock3 size={14} aria-hidden="true" /> {time}</span>
        <span className="ir-chip" title="People in the room"><Users size={14} aria-hidden="true" /> {participants}</span>
        <span className="ir-chip progress" aria-label={`Question ${questionNumber} of ${total}`}>Q{questionNumber}/{total}<span aria-hidden="true">{Array.from({ length: total }, (_, index) => <i key={index} className={index < answered ? "done" : index === answered ? "now" : ""} />)}</span></span>
        <div className="ir-mode" role="group" aria-label="How you answer">
          <button type="button" aria-pressed={mode === "meeting"} onClick={() => onMode("meeting")}><Video size={14} aria-hidden="true" /> Video</button>
          <button type="button" aria-pressed={mode === "text"} onClick={() => onMode("text")}><FileText size={14} aria-hidden="true" /> Type</button>
        </div>
        <button type="button" className="ir-leave" disabled={leaveDisabled} onClick={onLeave}><PhoneOff size={15} aria-hidden="true" /> Leave</button>
      </div>
    </header>
  );
}

/* ───────── Call stage ───────── */
export type CandidateView = {
  cameraActive: boolean; permissionReady: boolean; micActive: boolean; recording: boolean; recordSeconds: number;
  audioLevel: number; countdown: number | null; caption: string; onEnableCamera: () => void;
};

function Waveform() { return <span className="ir-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>; }

function AgentTile({ agent, speaking, thinking, big }: { agent: PanelSubAgent; speaking: boolean; thinking: boolean; big?: boolean }) {
  return (
    <div className={`ir-tile agent${speaking ? " speaking" : ""}${big ? " big" : ""}`}>
      <HumanAvatar look={LOOKS[agent.id]} speaking={speaking} label={agent.name} />
      <div className="ir-nameplate"><span className={`ir-mic ${speaking ? "on" : ""}`} aria-hidden="true">{speaking ? <Mic size={12} /> : <MicOff size={12} />}</span><strong>{agent.name}</strong><small>{ROLE_LABEL[agent.id]}</small></div>
      {speaking && <Waveform />}
      {thinking && big && <div className="ir-thinking" role="status"><span aria-hidden="true"><i /><i /><i /></span>{agent.name.split(" ")[0]} is reviewing your answer…</div>}
    </div>
  );
}

export function MeetingStage({ panel, activeId, agentSpeaking, thinking, question, captionsActive, onHearAgain, hearDisabled, candidate, videoRef }: {
  videoRef: RefObject<HTMLVideoElement | null>; panel: PanelSubAgent[]; activeId: PanelSubAgent["id"]; agentSpeaking: boolean; thinking: boolean; question: string; captionsActive: boolean; onHearAgain: () => void; hearDisabled: boolean; candidate: CandidateView;
}) {
  const active = panel.find(agent => agent.id === activeId) ?? panel[0];
  const others = panel.filter(agent => agent.id !== active.id);
  const talking = candidate.recording && candidate.micActive && candidate.audioLevel > 12;
  return (
    <div className={`ir-stage people-${panel.length}`}>
      <div className="ir-spotlight">
        <AgentTile agent={active} speaking={agentSpeaking} thinking={thinking} big />
        <div key={active.id} className="ir-joined" role="status"><Sparkles size={13} aria-hidden="true" /> {active.name} · {ROLE_LABEL[active.id]} is asking</div>
        {captionsActive && (
          <div className="ir-caption">
            <div><b>{active.name.split(" ")[0]}</b><button type="button" disabled={hearDisabled} onClick={onHearAgain}><Volume2 size={13} aria-hidden="true" /> Hear again</button></div>
            <p>{question}</p>
          </div>
        )}
      </div>

      <aside className="ir-strip" aria-label="Other people in the room">
        {others.map(agent => <AgentTile key={agent.id} agent={agent} speaking={false} thinking={false} />)}
        <div className={`ir-tile me${candidate.recording ? " recording" : ""}${talking ? " speaking" : ""}`}>
          {candidate.cameraActive && candidate.permissionReady ? <video ref={videoRef} autoPlay playsInline muted className="ir-self" /> : (
            <div className="ir-self-off"><span aria-hidden="true">You</span><p>{candidate.permissionReady ? "Your camera is off" : "Camera unavailable"}</p><button type="button" onClick={candidate.onEnableCamera}><Camera size={14} aria-hidden="true" /> Turn on camera</button></div>
          )}
          <div className="ir-nameplate"><span className={`ir-mic ${candidate.micActive ? "on" : "off"}`} aria-hidden="true">{candidate.micActive ? <Mic size={12} /> : <MicOff size={12} />}</span><strong>You</strong>{!candidate.micActive && <small>Muted</small>}</div>
          {candidate.recording && <div className="ir-rec"><i aria-hidden="true" /> Answering {Math.floor(candidate.recordSeconds / 60).toString().padStart(2, "0")}:{(candidate.recordSeconds % 60).toString().padStart(2, "0")}<span aria-hidden="true"><i style={{ height: `${Math.max(4, Math.min(16, candidate.audioLevel * 0.3))}px` }} /><i style={{ height: `${Math.max(6, Math.min(20, candidate.audioLevel * 0.45))}px` }} /><i style={{ height: `${Math.max(4, Math.min(16, candidate.audioLevel * 0.3))}px` }} /></span></div>}
          {candidate.countdown !== null && <div className="ir-countdown"><Sparkles size={13} aria-hidden="true" /> Pause detected · sending in {candidate.countdown}s</div>}
          {captionsActive && candidate.recording && <div className="ir-self-caption"><small>You</small><p>{candidate.caption || "Go ahead, I’m listening…"}</p></div>}
        </div>
      </aside>
    </div>
  );
}

/* ───────── Pre-join lobby ───────── */
export type LobbyProps = {
  error: string; onDismissError: () => void; blockedInterviewId: string; busy: boolean; onResume: (id: string) => void;
  permission: "idle" | "checking" | "ready" | "denied" | "unavailable"; issue: DeviceIssue | null; cameraActive: boolean; micActive: boolean;
  cameras: DeviceChoice[]; microphones: DeviceChoice[]; cameraId: string; microphoneId: string; onPickCamera: (id: string) => void; onPickMicrophone: (id: string) => void;
  onRequest: () => void; onToggleCamera: () => void; onToggleMic: () => void; micLevel: number; onTestSpeaker: () => void; speakerTesting: boolean;
  previewRef: RefObject<HTMLVideoElement | null>; captionsOk: boolean;
  type: string; types: Array<{ id: string; label: string; copy: string; badge: string }>; onType: (id: string) => void;
  targetRole: string; onRole: (role: string) => void; roleSuggestions: string[];
  totalTurns: number; onTurns: (value: number) => void; onJoin: () => void; panel: PanelSubAgent[]; typeKey: string;
};

const LENGTHS: Array<[number, string, string]> = [[3, "Quick", "about 10 min"], [5, "Standard", "about 18 min"], [6, "Deep dive", "about 25 min"]];

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return <section className="ir-step"><h3><b>{n}</b>{title}</h3>{children}</section>;
}

export function Lobby({ previewRef, ...p }: LobbyProps) {
  const ready = p.permission === "ready";
  const levelBars = 14;
  const lit = Math.round((Math.min(100, p.micLevel) / 100) * levelBars);
  return (
    <div className="ir-lobby">
      <div className="ir-lobby-head"><span className="ir-pill"><Video size={13} aria-hidden="true" /> {ROOM_NAME}</span><h1>Join your interview</h1><p>A small panel will meet you on a call and ask role-specific questions. Check your devices, pick a round, then join.</p></div>

      {p.error && <div className="ir-alert error" role="alert"><AlertTriangle size={16} aria-hidden="true" /><span>{p.error}</span><button type="button" onClick={p.onDismissError}>Dismiss</button></div>}
      {p.blockedInterviewId && <div className="ir-alert info"><Play size={16} aria-hidden="true" /><span>You have an interview in progress. Your questions and answers are safe.</span><button type="button" disabled={p.busy} onClick={() => p.onResume(p.blockedInterviewId)}>Resume it</button></div>}

      <div className="ir-lobby-grid">
        <div className="ir-lobby-left">
          <div className="ir-preview">
            {ready && p.cameraActive ? <video ref={previewRef} autoPlay playsInline muted className="ir-self" /> : (
              <div className="ir-preview-off">{p.permission === "checking" ? <><LoaderCircle size={26} className="spin" aria-hidden="true" /><p>Waiting for your camera…<small>Choose Allow if your browser asks.</small></p></> : <><CameraOff size={28} aria-hidden="true" /><p>{ready ? "Your camera is off" : "Camera not started"}<small>{ready ? "You can still join with just your voice." : "Press “Check my devices” to preview yourself."}</small></p></>}</div>
            )}
            <div className="ir-preview-bar">
              <button type="button" className={`ir-round${ready && p.micActive ? "" : " off"}`} onClick={p.onToggleMic} disabled={!ready} aria-label={p.micActive ? "Mute microphone" : "Unmute microphone"} aria-pressed={!p.micActive}>{ready && p.micActive ? <Mic size={18} /> : <MicOff size={18} />}</button>
              <button type="button" className={`ir-round${ready && p.cameraActive ? "" : " off"}`} onClick={p.onToggleCamera} disabled={p.permission === "checking"} aria-label={p.cameraActive ? "Turn camera off" : "Turn camera on"} aria-pressed={!p.cameraActive}>{ready && p.cameraActive ? <Camera size={18} /> : <CameraOff size={18} />}</button>
            </div>
          </div>

          <div className="ir-devices">
            <button type="button" className={`ir-check${ready ? " ok" : ""}`} onClick={p.onRequest} disabled={p.permission === "checking"}>{p.permission === "checking" ? <><LoaderCircle size={16} className="spin" aria-hidden="true" /> Checking…</> : ready ? <><RefreshCw size={15} aria-hidden="true" /> Check again</> : <><CheckCircle2 size={16} aria-hidden="true" /> Check my devices</>}</button>
            {ready && (
              <>
                <label className="ir-select"><span><Camera size={14} aria-hidden="true" /> Camera</span><select value={p.cameraId} onChange={event => p.onPickCamera(event.target.value)} disabled={!p.cameras.length}>{p.cameras.length ? p.cameras.map(device => <option key={device.id} value={device.id}>{device.label}</option>) : <option>No camera found</option>}</select></label>
                <label className="ir-select"><span><Mic size={14} aria-hidden="true" /> Microphone</span><select value={p.microphoneId} onChange={event => p.onPickMicrophone(event.target.value)} disabled={!p.microphones.length}>{p.microphones.length ? p.microphones.map(device => <option key={device.id} value={device.id}>{device.label}</option>) : <option>No microphone found</option>}</select></label>
                <div className="ir-meter" aria-label="Microphone level"><span>Say something</span><div>{Array.from({ length: levelBars }, (_, index) => <i key={index} className={index < lit ? "on" : ""} />)}</div><small>{!p.micActive ? "Muted" : p.micLevel > 6 ? "I can hear you" : "Quiet…"}</small></div>
                <button type="button" className="ir-test" onClick={p.onTestSpeaker} disabled={p.speakerTesting}><Volume2 size={15} aria-hidden="true" /> {p.speakerTesting ? "Playing…" : "Test speakers"}</button>
              </>
            )}
            {!p.captionsOk && <p className="ir-note"><Sparkles size={13} aria-hidden="true" /> Live captions of your voice need Chrome or Edge. Your answer is still understood.</p>}
          </div>

          {p.issue && (
            <div className={`ir-issue ${p.issue.kind}`} role="alert">
              <h4><AlertTriangle size={16} aria-hidden="true" /> {p.issue.title}</h4>
              <ul>{p.issue.help.map(line => <li key={line}>{line}</li>)}</ul>
              <button type="button" onClick={p.onRequest} disabled={p.permission === "checking"}><RefreshCw size={14} aria-hidden="true" /> Try again</button>
            </div>
          )}
        </div>

        <div className="ir-lobby-right">
          <Step n={1} title="Pick a round">
            <div className="ir-types">{p.types.map(item => <button key={item.id} type="button" aria-pressed={p.type === item.id} onClick={() => p.onType(item.id)}><b>{item.label}</b><small>{item.copy}</small></button>)}</div>
          </Step>
          <Step n={2} title="Role you’re practising for">
            <label className="ir-role"><Briefcase size={17} aria-hidden="true" /><input value={p.targetRole} onChange={event => p.onRole(event.target.value)} placeholder="e.g. Software Engineer" maxLength={120} aria-label="Target role" /></label>
            {p.roleSuggestions.length > 0 && <div className="ir-suggest" role="group" aria-label="Suggested roles">{p.roleSuggestions.map(role => <button key={role} type="button" aria-pressed={p.targetRole === role} onClick={() => p.onRole(role)}>{role}</button>)}</div>}
          </Step>
          <Step n={3} title="How long">
            <div className="ir-lengths">{LENGTHS.map(([value, label, time]) => <button key={value} type="button" aria-pressed={p.totalTurns === value} onClick={() => p.onTurns(value)}><b>{value} questions</b><small>{label} · {time}</small></button>)}</div>
          </Step>

          <section className="ir-panel-preview">
            <h3><Users size={15} aria-hidden="true" /> Who you’ll meet</h3>
            <ul>{p.panel.map(agent => <li key={agent.id}><span className="ir-face"><HumanAvatar look={LOOKS[agent.id]} label={agent.name} /></span><div><b>{agent.name}</b><small>{ROLE_LABEL[agent.id]}</small><p>{agent.focus}</p></div></li>)}</ul>
          </section>

          <div className="ir-join">
            <button type="button" className="ir-join-btn" disabled={p.busy || p.targetRole.trim().length < 2} onClick={p.onJoin}>{p.busy ? <><LoaderCircle size={18} className="spin" aria-hidden="true" /> Joining…</> : <>Join now <ArrowRight size={18} aria-hidden="true" /></>}</button>
            <p><ShieldCheck size={14} aria-hidden="true" /> Private practice. You can switch to typing at any time{ready ? "" : ", and you can join without a camera"}.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
