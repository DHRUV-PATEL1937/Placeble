import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Captions,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  LoaderCircle,
  MessageSquare,
  Mic,
  Maximize2,
  Mic2,
  Minimize2,
  MicOff,
  Pause,
  PhoneOff,
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
  VideoOff,
  Volume2,
  X,
  ChevronRight,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReadinessScoreRing } from "@/components/ui/readiness-score-ring";
import { speakBrowserText, stopBrowserSpeech } from "@/services/speech-service";
import { Lobby, MeetingHeader, MeetingStage, ROOM_NAME } from "./interview-room/MeetingParts";
import { captionsSupported, describeMediaError, disconnectedIssue, listDevices, type DeviceChoice, type DeviceIssue } from "./interview-room/devices";
import "./interview-room/room.css";
import { createAnswerActivity, observeAnswerAudio, observeAnswerTranscript, answerSilenceRemaining } from "@/services/interview-silence";

const API_URL = import.meta.env.VITE_API_URL ?? "/api/v1";
type InterviewType = "hr" | "technical" | "behavioral" | "mixed";
type Turn = {
  turnNumber: number;
  question: string;
  answerTranscript: string;
  answerVideoUrl: string;
  timeSpentSeconds: number;
  scores: { structure: number; relevance: number; specificity: number; fillerWordRate: number };
  feedback: string;
};
type Interview = {
  _id: string;
  type: InterviewType;
  targetRole: string;
  turns: Turn[];
  totalTurns: number;
  currentQuestion: string;
  overallScore?: number;
  overallFeedback: string;
  strengths: string[];
  improvements: string[];
  status: "setup" | "in_progress" | "completed" | "abandoned";
  startedAt: string;
  completedAt?: string;
};
type Summary = { active: Interview | null; completed: Interview[]; transcriptionMode: string; questionVoiceMode: string };
type Job = {
  id: string;
  kind: string;
  status: "queued" | "processing" | "complete" | "failed";
  progress: number;
  message: string;
  result?: { interview: Interview; needsDebrief?: boolean; debriefJobId?: string };
  error?: string;
};
type Screen = "home" | "resume-required" | "setup" | "room" | "debrief";
type Permission = "idle" | "checking" | "ready" | "denied" | "unavailable";

export type PanelSubAgent = {
  id: "hr" | "technical" | "behavioral";
  name: string;
  title: string;
  badge: string;
  tone: "navy" | "green" | "amber";
  focus: string;
  handoverText: string;
};

const PANEL_SUB_AGENTS: PanelSubAgent[] = [
  {
    id: "hr",
    name: "Alex Vance",
    title: "HR & Cultural Fit Sub-Agent",
    badge: "Sub-Agent 01",
    tone: "navy",
    focus: "Background, role motivation, self-awareness & company values",
    handoverText: "Alex Vance (HR Lead) is conducting this stage",
  },
  {
    id: "technical",
    name: "Vikram Shenoy",
    title: "Senior Technical Lead Sub-Agent",
    badge: "Sub-Agent 02",
    tone: "green",
    focus: "Architecture, algorithms, project technical depth & tradeoffs",
    handoverText: "Vikram Shenoy (Technical Lead) has taken over the floor",
  },
  {
    id: "behavioral",
    name: "Elena Rostova",
    title: "Behavioral & STAR Execution Sub-Agent",
    badge: "Sub-Agent 03",
    tone: "amber",
    focus: "Situational conflict, ownership, teamwork & measurable outcomes",
    handoverText: "Elena Rostova (Behavioral Lead) is evaluating execution",
  },
];

function getSubAgentForTurn(turnIndex: number, totalTurns: number, interviewType: InterviewType): PanelSubAgent {
  if (interviewType === "hr") return PANEL_SUB_AGENTS[0];
  if (interviewType === "technical") return PANEL_SUB_AGENTS[1];
  if (interviewType === "behavioral") return PANEL_SUB_AGENTS[2];
  // Mixed: Turn 1 is HR, middle turns are Technical, final turns are Behavioral
  if (turnIndex === 0) return PANEL_SUB_AGENTS[0];
  if (turnIndex >= totalTurns - 2) return PANEL_SUB_AGENTS[2];
  return PANEL_SUB_AGENTS[1];
}

async function requestUserMedia(constraints: MediaStreamConstraints, timeoutMs = 30000) {
  // Generous on purpose: the browser's allow/block prompt counts towards this time.
  let timedOut = false;
  let timer = 0;
  const request = navigator.mediaDevices.getUserMedia(constraints).then(stream => {
    if (timedOut) {
      stream.getTracks().forEach(track => track.stop());
      throw new Error("Device check timed out.");
    }
    return stream;
  });
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      timedOut = true;
      reject(new Error("Device check timed out."));
    }, timeoutMs);
  });
  try {
    return await Promise.race([request, timeout]);
  } finally {
    window.clearTimeout(timer);
  }
}

/** Each interviewer sounds like a different person. */
const VOICE: Record<PanelSubAgent["id"], { gender: "male" | "female"; accent: "in" | "gb" | "us"; rate: number; pitch: number }> = {
  hr: { gender: "male", accent: "us", rate: 0.97, pitch: 0.95 },
  technical: { gender: "male", accent: "in", rate: 0.94, pitch: 0.82 },
  behavioral: { gender: "female", accent: "gb", rate: 0.97, pitch: 1.05 },
};
const FAREWELL = "Thank you. That was my last question, and you gave thoughtful answers. I'll share my notes with the panel now, and your feedback will be ready in a moment.";
const enterFullscreen = () => {
  const root = document.documentElement;
  if (!document.fullscreenElement && root.requestFullscreen) void root.requestFullscreen().catch(() => undefined);
};
const leaveFullscreen = () => {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
};
const ROLE_SUGGESTIONS = ["Software Engineer", "Frontend Developer", "Full Stack Developer", "Data Analyst"];

const typeMeta: Record<InterviewType, { label: string; copy: string; badge: string }> = {
  hr: { label: "HR round", copy: "Motivation, self-awareness and role fit", badge: "Culture & Values" },
  technical: { label: "Technical round", copy: "Projects, technical decisions and problem solving", badge: "System & DSA" },
  behavioral: { label: "Behavioural round", copy: "Evidence-led STAR-framework situational responses", badge: "STAR Competencies" },
  mixed: { label: "Full panel", copy: "All three interviewers join, one after another", badge: "Multi-Agent Panel" },
};

async function api<T>(path: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, ...init.headers },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message ?? "The request could not be completed.") as Error & { interviewId?: string };
    error.interviewId = typeof payload.interviewId === "string" ? payload.interviewId : undefined;
    throw error;
  }
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

export function MockInterview({
  accessToken,
  onBack,
  onOpenResume,
}: {
  accessToken: string;
  onBack: () => void;
  onOpenResume: () => void;
}) {
  const [screen, setScreen] = useState<Screen>("home");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [resumeAvailable, setResumeAvailable] = useState<boolean | null>(null);
  const [interview, setInterview] = useState<Interview | null>(null);
  const [type, setType] = useState<InterviewType>("mixed");
  const [targetRole, setTargetRole] = useState("Software Engineer");
  const [totalTurns, setTotalTurns] = useState(5);

  // Device & Meeting Mode States
  const [permission, setPermission] = useState<Permission>("idle");
  const [cameraActive, setCameraActive] = useState(true);
  const [micActive, setMicActive] = useState(true);
  const [meetingMode, setMeetingMode] = useState<"meeting" | "text">("meeting");
  const [sideDrawerOpen, setSideDrawerOpen] = useState(false);
  const [captionsActive, setCaptionsActive] = useState(true);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [meetingSeconds, setMeetingSeconds] = useState(0);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [blockedInterviewId, setBlockedInterviewId] = useState("");
  const [notice, setNotice] = useState("");
  const [voiceState, setVoiceState] = useState<"preparing" | "speaking" | "ready" | "off">("off");
  const [lastBlob, setLastBlob] = useState<Blob | null>(null);
  const [deviceIssue, setDeviceIssue] = useState<DeviceIssue | null>(null);
  const [cameras, setCameras] = useState<DeviceChoice[]>([]);
  const [microphones, setMicrophones] = useState<DeviceChoice[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [microphoneId, setMicrophoneId] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [speakerTesting, setSpeakerTesting] = useState(false);
  const [streamVersion, setStreamVersion] = useState(0);
  const [closingLine, setClosingLine] = useState("");
  const [fullscreen, setFullscreen] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const setupVideoRef = useRef<HTMLVideoElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const uploadingTurnRef = useRef(false);
  const chunksRef = useRef<Blob[]>([]);
  const questionStartedAtRef = useRef(0);

  const loadSummary = useCallback(async () => {
    const [next, resume] = await Promise.all([
      api<Summary>("/interview/summary", accessToken),
      api<{ resume: { _id: string } | null }>("/resume/current", accessToken),
    ]);
    setSummary(next);
    setResumeAvailable(Boolean(resume.resume));
  }, [accessToken]);

  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        void loadSummary()
          .catch(cause => setError(cause instanceof Error ? cause.message : "Could not load interview practice."))
          .finally(() => setLoading(false)),
      0
    );
    return () => window.clearTimeout(timer);
  }, [loadSummary]);

  // Audio analysis & Voice Activity Detection (VAD)
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadAnimRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const answerActivityRef = useRef(createAnswerActivity());
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [autoSubmitCountdown, setAutoSubmitCountdown] = useState<number | null>(null);
  const startRecordingRef = useRef<(() => void) | null>(null);

  // Live Speech Recognition & Real-time Captions
  const [liveSpeechCaption, setLiveSpeechCaption] = useState("");
  const liveSpeechCaptionRef = useRef("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const speechRecognitionRef = useRef<any>(null);

  const stopSpeechRecognition = useCallback(() => {
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.onresult = null;
        speechRecognitionRef.current.onerror = null;
        speechRecognitionRef.current.onend = null;
        speechRecognitionRef.current.stop();
      } catch {}
      speechRecognitionRef.current = null;
    }
  }, []);

  const startSpeechRecognition = useCallback(() => {
    stopSpeechRecognition();
    const SpeechRecognitionClass =
      (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any }).SpeechRecognition ||
      (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any }).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) return;

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      let transcriptPrefix = "";

      recognition.onresult = (event: any) => {
        let transcript = transcriptPrefix;
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript + " ";
        }
        const clean = transcript.trim();
        if (clean) {
          observeAnswerTranscript(answerActivityRef.current, clean, performance.now());
          liveSpeechCaptionRef.current = clean;
          setLiveSpeechCaption(clean);
          setTypedAnswer(clean);
        }
      };

      recognition.onerror = (event: { error?: string }) => {
        if (event.error === "not-allowed" || event.error === "audio-capture") recognition.onend = null;
      };
      recognition.onend = () => {
        if (recorderRef.current?.state !== "recording" || speechRecognitionRef.current !== recognition) return;
        transcriptPrefix = liveSpeechCaptionRef.current ? liveSpeechCaptionRef.current + " " : "";
        try { recognition.start(); } catch { /* Audio detection remains available. */ }
      };

      recognition.start();
      speechRecognitionRef.current = recognition;
    } catch {
      // Browser speech recognition fallback
    }
  }, [stopSpeechRecognition]);

  const cleanupAudioAnalysis = useCallback(() => {
    stopSpeechRecognition();
    if (silenceTimerRef.current !== null) {
      window.clearInterval(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (vadAnimRef.current) {
      cancelAnimationFrame(vadAnimRef.current);
      vadAnimRef.current = null;
    }
    if (audioContextRef.current) {
      try { void audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
    setAutoSubmitCountdown(null);
  }, [stopSpeechRecognition]);

  const dropMedia = useCallback(() => {
    cleanupAudioAnalysis();
    stopSpeechRecognition();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try { track.stop(); } catch {}
      });
      streamRef.current = null;
    }
    if (setupVideoRef.current) setupVideoRef.current.srcObject = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setMicActive(false);
  }, [cleanupAudioAnalysis, stopSpeechRecognition]);

  // Handle Video Element Stream Binding
  useEffect(() => {
    if (setupVideoRef.current && streamRef.current && cameraActive) {
      setupVideoRef.current.srcObject = streamRef.current;
      void setupVideoRef.current.play().catch(() => undefined);
    }
    if (videoRef.current && streamRef.current && cameraActive) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [screen, permission, cameraActive, streamVersion]);

  // Global cleanup on unmount
  useEffect(() => () => {
    dropMedia();
    stopBrowserSpeech();
    leaveFullscreen();
  }, [dropMedia]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  useEffect(() => { if (screen !== "room") leaveFullscreen(); }, [screen]);

  // In-room timer
  useEffect(() => {
    if (screen !== "room") {
      setMeetingSeconds(0);
      return;
    }
    const timer = window.setInterval(() => setMeetingSeconds(s => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [screen]);

  const speakQuestion = useCallback((question: string, agentId: PanelSubAgent["id"]) => {
    if (!question) {
      setVoiceState("off");
      return;
    }
    stopBrowserSpeech();
    setVoiceState("preparing");
    const startAnswering = (delay: number) => window.setTimeout(() => startRecordingRef.current?.(), delay);
    window.setTimeout(() => {
      const started = speakBrowserText(question, {
        ...VOICE[agentId],
        onStart: () => setVoiceState("speaking"),
        onEnd: () => {
          setVoiceState("ready");
          // Auto-start the microphone so the candidate can answer directly.
          startAnswering(500);
        },
        onError: () => {
          setVoiceState("off");
          startAnswering(1200);
        },
      });
      if (!started) {
        setVoiceState("off");
        startAnswering(1200);
      }
    }, 260);
  }, []);

  useEffect(() => {
    if (screen === "room" && interview?.currentQuestion) {
      questionStartedAtRef.current = Date.now();
      const question = interview.currentQuestion;
      const agentId = getSubAgentForTurn(interview.turns.length, interview.totalTurns, interview.type).id;
      const timer = window.setTimeout(() => speakQuestion(question, agentId), 0);
      return () => window.clearTimeout(timer);
    }
  }, [screen, interview?._id, interview?.turns.length, interview?.totalTurns, interview?.type, interview?.currentQuestion, speakQuestion]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordSeconds(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  const releaseStream = () => {
    const current = streamRef.current;
    streamRef.current = null; // cleared first so the "ended" handlers below ignore tracks we stop on purpose
    current?.getTracks().forEach(track => { try { track.stop(); } catch { /* already stopped */ } });
  };

  const refreshDevices = useCallback(async () => {
    try {
      const next = await listDevices();
      setCameras(next.cameras);
      setMicrophones(next.microphones);
    } catch { /* the pickers just stay empty */ }
  }, []);

  const attachStream = (stream: MediaStream, withVideo: boolean) => {
    streamRef.current = stream;
    stream.getTracks().forEach(track => {
      track.onended = () => {
        if (streamRef.current !== stream) return;
        if (track.kind === "audio") { setMicActive(false); setDeviceIssue(disconnectedIssue("microphone")); }
        else { setCameraActive(false); setDeviceIssue(disconnectedIssue("camera")); }
      };
    });
    setCameraId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? "");
    setMicrophoneId(stream.getAudioTracks()[0]?.getSettings().deviceId ?? "");
    setPermission("ready");
    setCameraActive(withVideo && stream.getVideoTracks().length > 0);
    setMicActive(true);
    setStreamVersion(version => version + 1);
    void refreshDevices();
  };

  const requestMedia = async (withVideo = true, pick: { camera?: string; microphone?: string } = {}): Promise<void> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setDeviceIssue(describeMediaError(null, "both"));
      setPermission("unavailable");
      return;
    }
    setPermission("checking");
    setError("");
    setDeviceIssue(null);
    releaseStream();
    const cameraChoice = pick.camera ?? cameraId;
    const microphoneChoice = pick.microphone ?? microphoneId;
    const audio: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(microphoneChoice ? { deviceId: { exact: microphoneChoice } } : {}) };
    const video: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, ...(cameraChoice ? { deviceId: { exact: cameraChoice } } : { facingMode: "user" }) };
    try {
      attachStream(await requestUserMedia({ audio, video: withVideo ? video : false }), withVideo);
    } catch (first) {
      const name = (first as { name?: string })?.name ?? "";
      if (name === "OverconstrainedError" && (cameraChoice || microphoneChoice)) {
        // A remembered device was unplugged, so fall back to whatever is available now.
        setCameraId("");
        setMicrophoneId("");
        return requestMedia(withVideo, { camera: "", microphone: "" });
      }
      const refused = name === "NotAllowedError" || name === "PermissionDeniedError" || (first instanceof Error && first.message.includes("timed out"));
      if (withVideo && !refused) {
        // The camera is the usual culprit, so keep the microphone and let them join with voice only.
        try {
          attachStream(await requestUserMedia({ audio, video: false }), false);
          setDeviceIssue(describeMediaError(first, "camera"));
          return;
        } catch (second) {
          setDeviceIssue(describeMediaError(second, "both"));
        }
      } else {
        setDeviceIssue(describeMediaError(first, "both"));
      }
      setPermission(refused ? "idle" : "denied");
      setCameraActive(false);
      setMicActive(false);
    }
  };

  const toggleCamera = async () => {
    if (cameraActive) {
      // Stop the track (not just disable it) so the camera light really goes off.
      streamRef.current?.getVideoTracks().forEach(track => {
        try { track.stop(); streamRef.current?.removeTrack(track); } catch { /* already stopped */ }
      });
      if (videoRef.current) videoRef.current.srcObject = null;
      if (setupVideoRef.current) setupVideoRef.current.srcObject = null;
      setCameraActive(false);
      return;
    }
    if (!streamRef.current) { await requestMedia(true); return; }
    setDeviceIssue(null);
    try {
      const videoStream = await requestUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, ...(cameraId ? { deviceId: { exact: cameraId } } : { facingMode: "user" }) } });
      const track = videoStream.getVideoTracks()[0];
      const stream = streamRef.current;
      if (!track || !stream) { videoStream.getTracks().forEach(item => item.stop()); return; }
      track.onended = () => {
        if (streamRef.current !== stream) return;
        setCameraActive(false);
        setDeviceIssue(disconnectedIssue("camera"));
      };
      stream.addTrack(track);
      setCameraId(track.getSettings().deviceId ?? cameraId);
      setCameraActive(true);
      setStreamVersion(version => version + 1);
      void refreshDevices();
    } catch (cause) {
      setCameraActive(false);
      setDeviceIssue(describeMediaError(cause, "camera"));
    }
  };

  const toggleMic = () => {
    const tracks = streamRef.current?.getAudioTracks() ?? [];
    if (!tracks.length || tracks.every(track => track.readyState === "ended")) { void requestMedia(cameraActive); return; }
    const next = !micActive;
    tracks.forEach(track => { track.enabled = next; });
    setMicActive(next);
  };

  const testSpeaker = () => {
    setSpeakerTesting(true);
    const finish = () => setSpeakerTesting(false);
    const started = speakBrowserText("Hi, this is a quick sound check. If you can hear me clearly, your speakers are working.", { ...VOICE.hr, onEnd: finish, onError: finish });
    if (!started) {
      finish();
      setError("This browser can’t play the interviewers’ voices. You can still read every question on screen.");
    }
    window.setTimeout(finish, 12000);
  };

  // Live microphone level in the lobby, so a dead or muted mic is obvious before joining.
  useEffect(() => {
    if (screen !== "setup" || permission !== "ready" || !micActive) return;
    const tracks = streamRef.current?.getAudioTracks() ?? [];
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!tracks.length || !AudioCtx) return;
    const context = new AudioCtx();
    void context.resume().catch(() => undefined);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    context.createMediaStreamSource(new MediaStream(tracks)).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let frame = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let energy = 0;
      for (const value of samples) energy += ((value - 128) / 128) ** 2;
      setMicLevel(Math.min(100, Math.round(Math.sqrt(energy / samples.length) * 400)));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(frame); void context.close().catch(() => undefined); setMicLevel(0); };
  }, [screen, permission, micActive, streamVersion]);

  // Plugging in or removing a headset or camera updates the pickers straight away.
  useEffect(() => {
    const media = navigator.mediaDevices;
    if (!media?.addEventListener) return;
    const onChange = () => { if (streamRef.current) void refreshDevices(); };
    media.addEventListener("devicechange", onChange);
    return () => media.removeEventListener("devicechange", onChange);
  }, [refreshDevices]);

  const pollJob = useCallback(
    async (jobId: string) => {
      for (let index = 0; index < 300; index += 1) {
        await new Promise(resolve => window.setTimeout(resolve, 550));
        const response = await api<{ job: Job }>(`/interview/jobs/${jobId}`, accessToken);
        setJob(response.job);
        if (response.job.status === "failed") {
          throw new Error(response.job.error ?? "The interview response could not be reviewed.");
        }
        if (response.job.status === "complete") return response.job;
      }
      throw new Error("Reviewing this answer took too long. Your recording is safe - please retry.");
    },
    [accessToken]
  );

  const openInterview = (next: Interview, destination: Screen = next.status === "completed" ? "debrief" : "room") => {
    setInterview(next);
    setScreen(destination);
    setError("");
    setNotice("");
    setTypedAnswer("");
    setLiveSpeechCaption("");
    setLastBlob(null);
    setUploadProgress(0);
    setJob(null);
  };

  const startSession = async () => {
    if (!resumeAvailable) {
      setScreen("resume-required");
      return;
    }
    enterFullscreen();
    setBusy(true);
    setError("");
    try {
      const response = await api<{ interview: Interview }>("/interview/sessions", accessToken, {
        method: "POST",
        body: JSON.stringify({ type, targetRole, totalTurns }),
      });
      openInterview(response.interview, "room");
      // If permission is idle, attempt media initialization
      if (permission === "idle") {
        void requestMedia(true);
      }
    } catch (cause) {
      const blocking = cause as Error & { interviewId?: string };
      setBlockedInterviewId(blocking.interviewId ?? "");
      setError(cause instanceof Error ? cause.message : "Could not start this interview.");
      leaveFullscreen();
    } finally {
      setBusy(false);
    }
  };

  const resumeSession = async (id: string) => {
    enterFullscreen();
    setBusy(true);
    setError("");
    try {
      const response = await api<{ interview: Interview }>(`/interview/sessions/${id}`, accessToken);
      openInterview(response.interview);
      if (permission === "idle") {
        void requestMedia(true);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resume this interview.");
    } finally {
      setBusy(false);
    }
  };

  const finishDebriefJob = useCallback(
    async (jobId: string) => {
      const completedJob = await pollJob(jobId);
      const next = completedJob.result?.interview;
      if (!next) throw new Error("The debrief finished without an interview result.");
      openInterview(next, "debrief");
      await loadSummary();
    },
    [loadSummary, pollJob]
  );

  /** After the final answer the interviewer thanks the candidate out loud, then the answer is sent. */
  const thankCandidate = useCallback((agentId: PanelSubAgent["id"]) => new Promise<void>(resolve => {
    let cap = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(cap);
      setVoiceState("ready");
      setClosingLine("");
      resolve();
    };
    setClosingLine(FAREWELL);
    cap = window.setTimeout(finish, 15000);
    const started = speakBrowserText(FAREWELL, { ...VOICE[agentId], onStart: () => setVoiceState("speaking"), onEnd: finish, onError: finish });
    // No voice in this browser: leave the message up long enough to read.
    if (!started) window.setTimeout(finish, 3500);
  }), []);

  const uploadTurn = useCallback(
    async (blob: Blob | null, manualTranscript: string) => {
      if (!interview || uploadingTurnRef.current || interview.turns.length >= interview.totalTurns) return;
      uploadingTurnRef.current = true;
      setBusy(true);
      setError("");
      if (interview.turns.length + 1 >= interview.totalTurns) await thankCandidate(getSubAgentForTurn(interview.turns.length, interview.totalTurns, interview.type).id);
      setUploadProgress(1);
      setJob({ id: "upload", kind: "upload", status: "processing", progress: 1, message: "Analyzing answer with Sub-Agent" });
      try {
        const form = new FormData();
        if (blob) form.append("recording", blob, `answer-${interview.turns.length + 1}.webm`);
        const effectiveTranscript = (manualTranscript || liveSpeechCaptionRef.current || typedAnswer || liveSpeechCaption || "").trim();
        form.append("manualTranscript", effectiveTranscript);
        form.append("timeSpentSeconds", String(Math.max(recordSeconds, Math.round((Date.now() - questionStartedAtRef.current) / 1000))));

        const queued = await new Promise<{ job: Job }>((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open("POST", `${API_URL}/interview/sessions/${interview._id}/turns`);
          request.setRequestHeader("Authorization", `Bearer ${accessToken}`);
          request.withCredentials = true;
          request.upload.onprogress = event => {
            if (event.lengthComputable) {
              const progress = Math.max(1, Math.round((event.loaded / event.total) * 100));
              setUploadProgress(progress);
              setJob(current => (current ? { ...current, progress, message: `Uploading answer · ${progress}%` } : current));
            }
          };
          request.onerror = () => reject(new Error("The upload was interrupted. Your recording is still available to retry."));
          request.onload = () => {
            try {
              const payload = JSON.parse(request.responseText || "{}");
              if (request.status >= 200 && request.status < 300 && payload.job?.id) resolve(payload);
              else reject(new Error(payload.message ?? "The server response was incomplete. Your recording is preserved; retry your saved answer."));
            } catch {
              reject(new Error("The server response was interrupted. Your recording is preserved; retry your saved answer."));
            }
          };
          request.send(form);
        });

        setUploadProgress(100);
        const scored = await pollJob(queued.job.id);
        if (scored.result?.needsDebrief || scored.result?.debriefJobId) {
          // The final answer is saved even if the subsequent debrief needs retrying.
          if (scored.result.interview) setInterview(scored.result.interview);
          liveSpeechCaptionRef.current = "";
          stopBrowserSpeech();
          const debriefJobId = scored.result.debriefJobId ?? (await api<{ job: Job }>(`/interview/sessions/${interview._id}/complete`, accessToken, { method: "POST", body: "{}" })).job.id;
          await finishDebriefJob(debriefJobId);
          return;
        }
        if (!scored.result?.interview) throw new Error("The next question could not be loaded.");
        openInterview(scored.result.interview, "room");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not review this answer.");
      } finally {
        uploadingTurnRef.current = false;
        setBusy(false);
      }
    },
    [accessToken, finishDebriefJob, interview, pollJob, recordSeconds, thankCandidate]
  );

  const startRecording = useCallback(() => {
    if (busy || uploadingTurnRef.current || screen !== "room" || !interview?.currentQuestion || interview.turns.length >= interview.totalTurns || recorderRef.current?.state === "recording" || recorderRef.current?.state === "paused") return;
    if (!streamRef.current) {
      void requestMedia(true);
      return;
    }
    const audioTracks = streamRef.current.getAudioTracks();
    if (!audioTracks.length) {
      setError("Microphone track is missing. Please check your mic permissions.");
      return;
    }
    // Ensure tracks are unmuted
    audioTracks.forEach(t => { t.enabled = true; });
    setMicActive(true);

    // CRITICAL FIX: Extract audio-only stream so MediaRecorder doesn't break with video tracks!
    const audioOnlyStream = new MediaStream(audioTracks);

    let preferred = "";
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
      preferred = "audio/webm;codecs=opus";
    } else if (MediaRecorder.isTypeSupported("audio/webm")) {
      preferred = "audio/webm";
    } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
      preferred = "audio/mp4";
    }

    try {
      const recorder = preferred ? new MediaRecorder(audioOnlyStream, { mimeType: preferred }) : new MediaRecorder(audioOnlyStream);
      chunksRef.current = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = event => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        cleanupAudioAnalysis();
        stopSpeechRecognition();
        const blob = chunksRef.current.length ? new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }) : null;
        setLastBlob(blob);
        setRecording(false);
        const transcriptToSend = (liveSpeechCaptionRef.current || "").trim();
        void uploadTurn(blob, transcriptToSend);
      };
      setRecordSeconds(0);
      setLastBlob(null);
      setError("");
      liveSpeechCaptionRef.current = "";
      setLiveSpeechCaption("");
      stopBrowserSpeech();
      setVoiceState("ready");
      answerActivityRef.current = createAnswerActivity();
      recorder.start(500);
      silenceTimerRef.current = window.setInterval(() => {
        if (recorder.state !== "recording") return;
        // Keep the silence watchdog working even when animation frames pause.
        if (analyserRef.current && !answerActivityRef.current.transcript) {
          const waveform = new Uint8Array(analyserRef.current.fftSize);
          analyserRef.current.getByteTimeDomainData(waveform);
          let energy = 0;
          for (const value of waveform) energy += ((value - 128) / 128) ** 2;
          observeAnswerAudio(answerActivityRef.current, Math.sqrt(energy / waveform.length), performance.now());
        }
        const remaining = answerSilenceRemaining(answerActivityRef.current, performance.now());
        setAutoSubmitCountdown(remaining !== null && remaining <= 3000 ? Math.max(1, Math.ceil(remaining / 1000)) : null);
        if (remaining === 0) {
          // Clearing first makes automatic/manual stop races submit exactly once.
          if (silenceTimerRef.current !== null) window.clearInterval(silenceTimerRef.current);
          silenceTimerRef.current = null;
          setAutoSubmitCountdown(null);
          recorder.stop();
        }
      }, 200);
      setRecording(true);
      startSpeechRecognition();

      // Start live voice activity detection (VAD) & audio analysis
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          void ctx.resume().catch(() => {});
          const source = ctx.createMediaStreamSource(audioOnlyStream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.4;
          source.connect(analyser);

          audioContextRef.current = ctx;
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const waveform = new Uint8Array(analyser.fftSize);

          const checkLevel = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            const normalizedLevel = Math.min(100, Math.round((average / 128) * 100));
            setAudioLevel(normalizedLevel);

            analyserRef.current.getByteTimeDomainData(waveform);
            let energy = 0;
            for (const value of waveform) energy += ((value - 128) / 128) ** 2;
            observeAnswerAudio(answerActivityRef.current, Math.sqrt(energy / waveform.length), performance.now());

            vadAnimRef.current = requestAnimationFrame(checkLevel);
          };

          vadAnimRef.current = requestAnimationFrame(checkLevel);
        }
      } catch { /* AudioContext fallback */ }
    } catch (recorderError) {
      setError(recorderError instanceof Error ? recorderError.message : "Could not start audio recorder.");
    }
  }, [busy, screen, interview, cleanupAudioAnalysis, startSpeechRecognition, stopSpeechRecognition, uploadTurn]);

  // Keep ref up to date for speech completion trigger
  useEffect(() => {
    startRecordingRef.current = startRecording;
  }, [startRecording]);

  const stopRecording = () => {
    cleanupAudioAnalysis();
    stopSpeechRecognition();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const endEarly = async () => {
    dropMedia();
    if (!interview) return;
    setBusy(true);
    setError("");
    try {
      if (!interview.turns.length) {
        await api(`/interview/sessions/${interview._id}/abandon`, accessToken, { method: "POST", body: "{}" });
        stopBrowserSpeech();
        await loadSummary();
        setNotice("This interview session was closed.");
        setScreen("home");
        return;
      }
      setJob({ id: "early", kind: "interview:debrief", status: "processing", progress: 8, message: "Synthesizing panel debrief" });
      const queued = await api<{ job: Job }>(`/interview/sessions/${interview._id}/complete`, accessToken, {
        method: "POST",
        body: "{}",
      });
      await finishDebriefJob(queued.job.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not finish this interview.");
    } finally {
      setBusy(false);
    }
  };

  const abandon = async () => {
    if (!summary?.active) return;
    setBusy(true);
    try {
      await api(`/interview/sessions/${summary.active._id}/abandon`, accessToken, { method: "POST", body: "{}" });
      await loadSummary();
      setNotice("The unfinished session was closed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not close this interview.");
    } finally {
      setBusy(false);
    }
  };

  const completed = summary?.completed ?? [];
  const averageScore = completed.length
    ? Math.round(completed.reduce((sum, item) => sum + (item.overallScore ?? 0), 0) / completed.length)
    : 0;
  const latestScore = completed[0]?.overallScore ?? 0;

  // Active sub-agent for the current turn
  const currentSubAgent = useMemo(() => {
    const turnIdx = interview?.turns.length ?? 0;
    const totTurns = interview?.totalTurns ?? totalTurns;
    const itype = interview?.type ?? type;
    return getSubAgentForTurn(turnIdx, totTurns, itype);
  }, [interview?.turns.length, interview?.totalTurns, interview?.type, totalTurns, type]);

  if (loading) {
    return (
      <div className="view-content inner-view mi-loading">
        <LoaderCircle size={28} className="spin" />
        <h2>Opening the Interview Room</h2>
        <p>Getting your interview panel ready.</p>
      </div>
    );
  }

  if (screen === "resume-required") {
    return (
      <div className="view-content inner-view mock-interview-view">
        <InterviewTop label="Resume needed" onBack={() => setScreen("home")} />
        <section className="mi-resume-required">
          <span><FileText size={30} /></span>
          <p className="eyebrow">Before your interview</p>
          <h1>Create your resume first.</h1>
          <p>
            The 3 AI interviewers tailor their questions directly to your actual projects, tech stack, and experience. Build or upload your resume first so the panel can conduct a realistic session.
          </p>
          <button className="button button-primary" onClick={onOpenResume}>
            <FileText size={17} /> Create your resume
          </button>
        </section>
      </div>
    );
  }

  /* ========================================================================
     1. NEW REDESIGNED GREEN ROOM / SETUP LOBBY
     ======================================================================== */
  if (screen === "setup") {
    return (
      <div className="view-content inner-view mock-interview-view ir-lobby-view">
        <InterviewTop label={ROOM_NAME} onBack={() => { dropMedia(); setPermission("idle"); setDeviceIssue(null); setScreen("home"); }} />
        <Lobby
          error={error}
          onDismissError={() => { setError(""); setBlockedInterviewId(""); }}
          blockedInterviewId={blockedInterviewId}
          busy={busy}
          onResume={id => void resumeSession(id)}
          permission={permission}
          issue={deviceIssue}
          cameraActive={cameraActive}
          micActive={micActive}
          cameras={cameras}
          microphones={microphones}
          cameraId={cameraId}
          microphoneId={microphoneId}
          onPickCamera={id => { setCameraId(id); void requestMedia(true, { camera: id }); }}
          onPickMicrophone={id => { setMicrophoneId(id); void requestMedia(cameraActive, { microphone: id }); }}
          onRequest={() => void requestMedia(true)}
          onToggleCamera={() => void toggleCamera()}
          onToggleMic={toggleMic}
          micLevel={permission === "ready" && micActive ? micLevel : 0}
          onTestSpeaker={testSpeaker}
          speakerTesting={speakerTesting}
          previewRef={setupVideoRef}
          captionsOk={captionsSupported()}
          type={type}
          types={(Object.keys(typeMeta) as InterviewType[]).map(id => ({ id, ...typeMeta[id] }))}
          onType={id => setType(id as InterviewType)}
          targetRole={targetRole}
          onRole={value => setTargetRole(value.replace(/[^\p{L}\p{N} &/.,()+#'’-]/gu, "").slice(0, 120))}
          roleSuggestions={ROLE_SUGGESTIONS}
          totalTurns={totalTurns}
          onTurns={setTotalTurns}
          onJoin={() => void startSession()}
          panel={PANEL_SUB_AGENTS}
          typeKey={type}
        />
      </div>
    );
  }

  /* ========================================================================
     2. IMMERSIVE SUB-AGENT VIRTUAL MEETING ROOM
     ======================================================================== */
  if (screen === "room" && interview) {
    const allAnswersSubmitted = interview.turns.length >= interview.totalTurns;
    const questionNumber = Math.min(interview.turns.length + 1, interview.totalTurns);
    const roomPanel = interview.type === "mixed" ? PANEL_SUB_AGENTS : [currentSubAgent];

    return (
      <div className="view-content inner-view mock-interview-view ir-room-view">
        <div className="ir-room">
          <MeetingHeader
            title={`${interview.targetRole || "General placement"} interview`}
            typeLabel={typeMeta[interview.type].label}
            questionNumber={questionNumber}
            total={interview.totalTurns}
            answered={interview.turns.length}
            seconds={meetingSeconds}
            participants={roomPanel.length + 1}
            mode={meetingMode}
            onMode={setMeetingMode}
            onLeave={() => void endEarly()}
            leaveDisabled={busy || recording}
          />
          {deviceIssue && (
            <div className="ir-alert-bar" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span><b>{deviceIssue.title}.</b> {deviceIssue.help[0]}</span>
              <button type="button" onClick={() => void requestMedia(true)}>Try again</button>
            </div>
          )}
          {error && (
            <div className="ir-alert-bar" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{error}</span>
              {!busy && !recording && !allAnswersSubmitted && (lastBlob || typedAnswer.trim()) && <button type="button" onClick={() => void uploadTurn(lastBlob, typedAnswer)}>Retry saved answer</button>}
              <button type="button" onClick={() => setError("")}>Dismiss</button>
            </div>
          )}
          {allAnswersSubmitted && (
            <div className="ir-alert-bar notice" role="status">
              <CheckCircle2 size={16} aria-hidden="true" />
              <span>All answers submitted. {busy ? "Preparing your interview review…" : "Your final answer is saved. Open your review to finish."}</span>
              {!busy && <button type="button" onClick={() => void endEarly()}>Open interview review</button>}
            </div>
          )}
          {busy && meetingMode === "meeting" && job && (
            <div className="ir-alert-bar notice" role="status">
              <LoaderCircle size={16} className="spin" aria-hidden="true" />
              <span>{job.message}{uploadProgress > 0 && uploadProgress < 100 ? ` · ${uploadProgress}%` : ""}</span>
            </div>
          )}

        <div className="ir-body">
          <div className="ir-main">
            {meetingMode === "meeting" ? (
              <MeetingStage
                panel={roomPanel}
                activeId={currentSubAgent.id}
                agentSpeaking={voiceState === "speaking"}
                thinking={busy && uploadProgress > 0}
                question={closingLine || interview.currentQuestion}
                captionsActive={captionsActive}
                onHearAgain={() => speakQuestion(interview.currentQuestion, currentSubAgent.id)}
                hearDisabled={recording || busy}
                videoRef={videoRef}
                candidate={{
                  cameraActive, permissionReady: permission === "ready", micActive, recording, recordSeconds, audioLevel,
                  countdown: autoSubmitCountdown, caption: liveSpeechCaption,
                  onEnableCamera: () => void (permission === "ready" ? toggleCamera() : requestMedia(true)),
                }}
              />
            ) : (
              /* --- Full Text-Based Interview Mode --- */
              <div className="meeting-text-arena ir-textwrap">
                <div className="text-arena-conversation">
                  {interview.turns.map(turn => {
                    const agent = getSubAgentForTurn(turn.turnNumber - 1, interview.totalTurns, interview.type);
                    return (
                      <div key={turn.turnNumber} className="conversation-turn-block">
                        <div className="message-bubble interviewer-msg">
                          <div className="bubble-header">
                            <span className="bubble-avatar"><img src="/interview.png" alt="Coach" /></span>
                            <div>
                              <strong>{agent.name}</strong>
                              <small>{agent.title}</small>
                            </div>
                            <span className="bubble-turn-tag">Question {turn.turnNumber}</span>
                          </div>
                          <p className="bubble-question">{turn.question}</p>
                        </div>

                        <div className="message-bubble candidate-msg">
                          <div className="bubble-header">
                            <strong>Your Response</strong>
                            <span className="bubble-time">{turn.timeSpentSeconds}s</span>
                          </div>
                          <p className="bubble-answer">“{turn.answerTranscript}”</p>
                          <div className="bubble-scores-row">
                            <span className="rubric-pill">Structure: {turn.scores.structure}/10</span>
                            <span className="rubric-pill">Relevance: {turn.scores.relevance}/10</span>
                            <span className="rubric-pill">Specificity: {turn.scores.specificity}/10</span>
                          </div>
                          <div className="bubble-feedback">
                            <Sparkles size={14} />
                            <span>{turn.feedback}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Current Active Question */}
                  <div className="message-bubble interviewer-msg active-current">
                    <div className="bubble-header">
                      <span className="bubble-avatar"><img src="/interview.png" alt="Coach" /></span>
                      <div>
                        <strong>{currentSubAgent.name}</strong>
                        <small>{currentSubAgent.title}</small>
                      </div>
                      <span className="bubble-turn-tag">Question {questionNumber} (Current)</span>
                    </div>
                    <p className="bubble-question large">{interview.currentQuestion}</p>
                    <button type="button" className="text-speak-btn" onClick={() => speakQuestion(interview.currentQuestion, currentSubAgent.id)}>
                      <Volume2 size={14} />
                      <span>Hear Sub-Agent Voice</span>
                    </button>
                  </div>

                  {/* Interactive Text Interview Response Composer */}
                  <div className="text-arena-response-box">
                    <div className="text-response-header">
                      <div className="text-response-title">
                        <MessageSquare size={15} />
                        <strong>Your Response (Question {questionNumber})</strong>
                        {liveSpeechCaption && (
                          <span className="live-transcribed-pill">
                            <Sparkles size={12} /> Auto-transcribed from speech
                          </span>
                        )}
                      </div>
                      <div className="text-response-meta">
                        <button
                          type="button"
                          className={`btn-dictate-pill ${recording ? "is-recording" : ""}`}
                          onClick={recording ? stopRecording : startRecording}
                          disabled={busy}
                          title={recording ? "Stop speech dictation" : "Dictate your answer using microphone"}
                        >
                          <Mic size={13} />
                          <span>{recording ? `Listening (${formatDuration(recordSeconds)})` : "Dictate via Mic"}</span>
                        </button>
                        <span className="text-word-counter">
                          {typedAnswer.trim().split(/\s+/).filter(Boolean).length} words
                        </span>
                      </div>
                    </div>

                    <textarea
                      className="text-arena-textarea"
                      value={typedAnswer}
                      onChange={e => setTypedAnswer(e.target.value)}
                      placeholder="Type or dictate your response using STAR method (Situation, Task, Action, Measurable Result)…"
                      rows={5}
                      disabled={busy}
                    />

                    <div className="text-response-actions">
                      <span className="text-response-hint">
                        💡 Whatever you speak or type is preserved when you switch between Video and Text modes.
                      </span>
                      <div className="text-buttons-group">
                        <button
                          type="button"
                          className="button button-ghost btn-clear-text"
                          onClick={() => {
                            setTypedAnswer("");
                            setLiveSpeechCaption("");
                          }}
                          disabled={busy || (!typedAnswer && !liveSpeechCaption)}
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          className="button button-primary btn-submit-text"
                          disabled={busy || (!typedAnswer.trim() && !lastBlob)}
                          onClick={() => {
                            if (recording) stopRecording();
                            else void uploadTurn(lastBlob, typedAnswer);
                          }}
                        >
                          <Send size={14} />
                          <span>{busy ? "Submitting Answer…" : "Submit Answer"}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

        <footer className="ir-dock">
          {!recording ? (
            <button type="button" className="ir-btn is-answer" disabled={busy || allAnswersSubmitted} onClick={startRecording} title="Start speaking your answer">
              <Mic size={18} aria-hidden="true" />
              <span>Answer</span>
            </button>
          ) : (
            <button type="button" className="ir-btn is-stop" onClick={stopRecording} title="Finish and send your answer">
              <Square size={16} aria-hidden="true" />
              <span>Done · {formatDuration(recordSeconds)}</span>
            </button>
          )}
          <button type="button" className={`ir-btn ${micActive ? "is-on" : "is-off"}`} onClick={toggleMic} title={micActive ? "Mute microphone" : "Unmute microphone"} aria-pressed={!micActive}>
            {micActive ? <Mic size={18} aria-hidden="true" /> : <MicOff size={18} aria-hidden="true" />}
            <span>{micActive ? "Mic" : "Muted"}</span>
          </button>
          <button type="button" className={`ir-btn ${cameraActive ? "is-on" : "is-off"}`} onClick={() => void (permission === "ready" ? toggleCamera() : requestMedia(true))} title={cameraActive ? "Turn camera off" : "Turn camera on"} aria-pressed={!cameraActive}>
            {cameraActive ? <Video size={18} aria-hidden="true" /> : <VideoOff size={18} aria-hidden="true" />}
            <span>{cameraActive ? "Camera" : "Camera off"}</span>
          </button>
          <button type="button" className={`ir-btn ${captionsActive ? "is-on" : ""}`} onClick={() => setCaptionsActive(!captionsActive)} title="Show or hide captions" aria-pressed={captionsActive}>
            <Captions size={18} aria-hidden="true" />
            <span>Captions</span>
          </button>
          <button type="button" className={`ir-btn ${sideDrawerOpen ? "is-on" : ""}`} onClick={() => setSideDrawerOpen(!sideDrawerOpen)} title="Open the chat panel to type your answer" aria-pressed={sideDrawerOpen}>
            <MessageSquare size={18} aria-hidden="true" />
            <span>Chat</span>
          </button>
          <button type="button" className={`ir-btn ${fullscreen ? "is-on" : ""}`} onClick={() => (fullscreen ? leaveFullscreen() : enterFullscreen())} title={fullscreen ? "Exit full screen" : "Full screen"} aria-pressed={fullscreen}>
            {fullscreen ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}
            <span>{fullscreen ? "Exit full screen" : "Full screen"}</span>
          </button>
          <button type="button" className="ir-btn" disabled={recording || busy} onClick={() => speakQuestion(interview.currentQuestion, currentSubAgent.id)} title="Hear the question again">
            <Volume2 size={18} aria-hidden="true" />
            <span>Repeat</span>
          </button>
          <button type="button" className="ir-btn is-leave" disabled={busy || recording} onClick={() => void endEarly()} title="Leave the interview">
            <PhoneOff size={18} aria-hidden="true" />
            <span>Leave</span>
          </button>
        </footer>
      </div>

      {sideDrawerOpen && (
        <aside className="ir-drawer" aria-label="Chat and written answer">
          <header className="ir-d-header">
            <div className="ir-d-title-row">
              <MessageSquare size={16} aria-hidden="true" />
              <h3>Chat · written answer</h3>
            </div>
            <button type="button" className="ir-d-close-btn" onClick={() => setSideDrawerOpen(false)} aria-label="Close chat panel">
              <X size={16} />
            </button>
          </header>
          <div className="ir-d-body">
            <div className="ir-d-question-box">
              <div className="ir-d-q-meta">
                <span>Question {questionNumber}</span>
                <span>{currentSubAgent.name}</span>
              </div>
              <p>{interview.currentQuestion}</p>
            </div>
            <div>
              <div className="ir-d-input-header">
                <span>Your answer{liveSpeechCaption ? " · from your voice" : ""}</span>
                <span>{typedAnswer.trim().split(/\s+/).filter(Boolean).length} words</span>
              </div>
              <textarea
                className="ir-d-textarea"
                value={typedAnswer}
                onChange={e => setTypedAnswer(e.target.value)}
                placeholder="Type your answer. Situation, task, action and result works well."
                disabled={busy || recording}
                rows={6}
                aria-label="Your written answer"
              />
              <div className="ir-d-action-row">
                <button type="button" className="ir-d-submit-btn" disabled={busy || recording || !typedAnswer.trim()} onClick={() => void uploadTurn(null, typedAnswer)}>
                  <Send size={15} aria-hidden="true" />
                  <span>Send answer</span>
                </button>
              </div>
            </div>
            <div className="ir-d-star-helper">
              <strong>A simple way to structure it (STAR)</strong>
              <ul>
                <li><b>S</b>ituation: set the scene briefly</li>
                <li><b>T</b>ask: what you were responsible for</li>
                <li><b>A</b>ction: what you personally did</li>
                <li><b>R</b>esult: the outcome, with numbers if you can</li>
              </ul>
            </div>
          </div>
        </aside>
      )}
    </div>
  </div>

  {busy && meetingMode === "text" && <InterviewTransition job={job} uploadProgress={uploadProgress} />}
</div>
    );
  }

  /* ========================================================================
     3. DEBRIEF SCREEN
     ======================================================================== */
  if (screen === "debrief" && interview) {
    return (
      <div className="view-content inner-view mock-interview-view mi-debrief">
        <InterviewTop label="Interview debrief" onBack={() => { setScreen("home"); void loadSummary(); }} />
        <header className="pg-head">
          <div>
            <h1>
              {(interview.overallScore ?? 0) >= 80
                ? "Interview-ready habits are taking shape."
                : (interview.overallScore ?? 0) >= 60
                ? "A useful performance with clear next steps."
                : "A baseline you can build on quickly."}
            </h1>
            <ul className="mi-debrief-meta">
              <li><Target size={14} />{typeMeta[interview.type].label}</li>
              <li><BriefcaseBusiness size={14} />{interview.targetRole || "General role"}</li>
              <li><Clock3 size={14} />{interview.turns.length} questions completed</li>
            </ul>
          </div>
          <div className="pg-actions">
            <button className="button button-primary" onClick={() => setScreen("setup")}>
              <RefreshCw size={16} /> Practice again
            </button>
          </div>
        </header>

        <dl className="pg-stats">
          <div><dt>Overall score</dt><dd>{interview.overallScore ?? 0}<span> / 100</span></dd><small>{scoreBandLabel(interview.overallScore ?? 0)}</small></div>
          {(["structure", "relevance", "specificity"] as const).map(key => {
            const average = interview.turns.length ? Math.round(interview.turns.reduce((sum, turn) => sum + turn.scores[key], 0) / interview.turns.length * 10) / 10 : 0;
            return <div key={key}><dt>{key.charAt(0).toUpperCase() + key.slice(1)}</dt><dd>{average}<span> / 10</span></dd><small>Average across turns</small></div>;
          })}
        </dl>

        <section className="pg-panel mi-debrief-summary">
          <header><div><h2>Panel summary</h2><p>Overall feedback from your interview panel.</p></div></header>
          <p>{interview.overallFeedback}</p>
        </section>

        <section className="mi-coaching-grid">
          <article>
            <header>
              <CheckCircle2 size={18} />
              <h2>What worked</h2>
            </header>
            {interview.strengths.map(item => (
              <p key={item}><Check size={14} />{item}</p>
            ))}
          </article>
          <article>
            <header>
              <TrendingUp size={18} />
              <h2>What to practice next</h2>
            </header>
            {interview.improvements.map(item => (
              <p key={item}><ArrowRight size={14} />{item}</p>
            ))}
          </article>
        </section>

        <section className="mi-turn-breakdown">
          <header>
            <div>
              <p className="eyebrow">Question-by-question breakdown</p>
              <h2>Panel evaluation across all turns.</h2>
            </div>
            <span>Fixed rubric · deterministic filler count</span>
          </header>
          {interview.turns.map(turn => {
            const agent = getSubAgentForTurn(turn.turnNumber - 1, interview.totalTurns, interview.type);
            return (
              <article key={turn.turnNumber}>
                <div className="mi-turn-number">{turn.turnNumber}</div>
                <div className="mi-turn-content">
                  <span className="subagent-turn-badge">{agent.name} · {agent.badge}</span>
                  <h3>{turn.question}</h3>
                  <blockquote>“{turn.answerTranscript.length > 300 ? `${turn.answerTranscript.slice(0, 300)}…` : turn.answerTranscript}”</blockquote>
                  <p><Sparkles size={15} />{turn.feedback}</p>
                </div>
                <div className="mi-rubric-grid">
                  <Rubric label="Structure" value={turn.scores.structure} />
                  <Rubric label="Relevance" value={turn.scores.relevance} />
                  <Rubric label="Specificity" value={turn.scores.specificity} />
                  <div className="mi-rubric filler">
                    <span>Filler words</span>
                    <strong>{turn.scores.fillerWordRate}<em>/100 words</em></strong>
                    <small>Counted directly from transcript</small>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    );
  }

  /* ========================================================================
     4. HOME SCREEN
     ======================================================================== */
  return (
    <div className="view-content inner-view mock-interview-view">
      <InterviewTop label="Interview Room" onBack={onBack} />
      {error && <InterviewMessage type="error" text={error} onClose={() => setError("")} />}
      {notice && <InterviewMessage type="notice" text={notice} onClose={() => setNotice("")} />}

      <header className="pg-head">
        <div>
          <h1>Interview Room</h1>
          <p>Practise with an AI panel of HR, Technical Lead and Behavioral Evaluator. Answer by video or text and get rubric feedback on every answer.</p>
        </div>
        <div className="pg-actions">
          {completed[0] && (
            <button className="button button-secondary" onClick={() => openInterview(completed[0], "debrief")}>
              <Trophy size={16} /> View latest debrief
            </button>
          )}
          <button
            className="button button-primary"
            onClick={() => {
              if (resumeAvailable === false) setScreen("resume-required");
              else setScreen("setup");
            }}
          >
            <Mic2 size={16} /> Enter the Interview Room
          </button>
        </div>
      </header>

      {summary?.active && (
        <section className="mi-resume-session">
          <span><Pause size={19} /></span>
          <div>
            <strong>Your interview session is saved and ready to resume</strong>
            <p>
              {typeMeta[summary.active.type].label} · {summary.active.targetRole || "General role"} · {summary.active.turns.length}/{summary.active.totalTurns} answers completed.
            </p>
          </div>
          <button disabled={busy} onClick={() => void abandon()}>Close session</button>
          <button className="button button-primary" disabled={busy} onClick={() => void resumeSession(summary.active!._id)}>
            <Play size={15} /> Resume meeting
          </button>
        </section>
      )}

      <dl className="pg-stats">
        <div><dt>Latest score</dt><dd>{completed.length ? latestScore : "-"}</dd><small>{completed.length ? "Most recent session" : "No sessions yet"}</small></div>
        <div><dt>Average score</dt><dd>{completed.length ? averageScore : "-"}</dd><small>{completed.length ? "Across completed interviews" : "Complete your first session"}</small></div>
        <div><dt>Sessions completed</dt><dd>{completed.length}</dd><small>Every session keeps its full debrief</small></div>
        <div><dt>Panel</dt><dd>3 agents</dd><small>HR, Tech Lead and STAR evaluation</small></div>
      </dl>

      <section className="pg-panel">
        <header>
          <div>
            <h2>How your panel meeting works</h2>
            <p>Four stages, about 20 minutes end to end.</p>
          </div>
          <span className="pg-note"><ShieldCheck size={14} /> Live video call. You can also answer by typing.</span>
        </header>
        <ol className="pg-steps">
          {[
            ["Green Room Lobby", "Test your camera and mic before joining the interview."],
            ["Alex Vance (HR)", "Opening questions on motivation and fit."],
            ["Vikram Shenoy (Tech)", "Technical depth, architecture and coding decisions."],
            ["Elena Rostova (STAR)", "Behavioral leadership and outcome evaluation."],
          ].map(([title, copy], index) => (
            <li key={title}>
              <span>{index + 1}</span>
              <div><strong>{title}</strong><p>{copy}</p></div>
            </li>
          ))}
        </ol>
      </section>

      {completed.length > 0 && (
        <section className="mi-history">
          <header>
            <div>
              <p className="eyebrow">Session history</p>
              <h2>Your recent interviews</h2>
            </div>
            <span>{completed.length} completed</span>
          </header>
          <div>
            {completed.map(item => (
              <button key={item._id} onClick={() => openInterview(item, "debrief")}>
                <span className="mi-history-score">{item.overallScore}</span>
                <div>
                  <strong>{typeMeta[item.type].label} · {item.targetRole || "General role"}</strong>
                  <small>
                    {new Date(item.completedAt ?? item.startedAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })} · {item.turns.length} questions
                  </small>
                </div>
                <em>Open debrief</em>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function InterviewTop({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <header className="mi-module-top">
      <button onClick={onBack}>
        <ArrowLeft size={17} /> All agents
      </button>
      <div>
        <span><Mic2 size={16} /></span>
        <strong>{label}</strong>
      </div>
    </header>
  );
}

function InterviewMessage({ type, text, onClose }: { type: "error" | "notice"; text: string; onClose: () => void }) {
  return (
    <div className={`mi-message ${type}`}>
      <span>{type === "error" ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}</span>
      <p>{text}</p>
      <button onClick={onClose}><X size={15} /></button>
    </div>
  );
}

function InterviewTransition({ job, uploadProgress }: { job: Job | null; uploadProgress: number }) {
  const isUpload = job?.kind === "upload";
  return (
    <div className="mi-transition">
      <section>
        <span>{isUpload ? <Send size={22} /> : <Sparkles size={22} />}</span>
        <p className="eyebrow">{isUpload ? "Transmitting audio/video" : "Panel assessment"}</p>
        <h2>{job?.message ?? "Analyzing your response"}</h2>
        <p>
          {isUpload
            ? "Your answer is uploading to the secure evaluation pipeline."
            : "The panel sub-agent is grading structure, relevance, and specificity against industry benchmarks."}
        </p>
        <div>
          <i style={{ width: `${isUpload ? uploadProgress : job?.progress ?? 12}%` }} />
        </div>
        <small>{isUpload ? `${uploadProgress}% uploaded` : `${job?.progress ?? 12}% analyzed`}</small>
      </section>
    </div>
  );
}

function scoreBandLabel(score: number) {
  return score >= 80 ? "Strong" : score >= 60 ? "Building" : "Focus next";
}

function Rubric({ label, value }: { label: string; value: number }) {
  return (
    <div className={`mi-rubric ${scoreTone(value)}`}>
      <span>{label}</span>
      <strong>{value}<em>/10</em></strong>
      <div>
        <i style={{ width: `${value * 10}%` }} />
      </div>
      <small>{value >= 8 ? "Strong evidence" : value >= 6 ? "Building well" : "Focus next"}</small>
    </div>
  );
}
