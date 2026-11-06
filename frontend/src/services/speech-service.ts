export type VoiceGender = "female" | "male";
export type BrowserSpeechOptions = {
  rate?: number; pitch?: number; voiceHint?: string;
  /** Picks a voice of this kind so each interviewer sounds like a different person. */
  gender?: VoiceGender;
  /** Preferred accent: Indian, British or American English. */
  accent?: "in" | "gb" | "us";
  onStart?: () => void; onEnd?: () => void; onError?: () => void;
};

let speakToken = 0;

/**
 * Inside the Placeble Android app (a WebView) the browser's speechSynthesis often stays silent.
 * The app sets `__PLACEBLE_NATIVE_TTS__` and reads the interviewer's voice with the phone's own text-to-speech instead.
 * Older app builds don't set the flag, so they keep using the browser voice.
 */
type AppWindow = Window & { __PLACEBLE_NATIVE_TTS__?: boolean; ReactNativeWebView?: { postMessage: (data: string) => void } };
const nativeTts = () => typeof window !== "undefined" && Boolean((window as AppWindow).__PLACEBLE_NATIVE_TTS__ && (window as AppWindow).ReactNativeWebView);
const postNative = (message: object) => (window as AppWindow).ReactNativeWebView?.postMessage(JSON.stringify(message));
let detachNative: (() => void) | null = null;

export function stopBrowserSpeech() {
  speakToken += 1;
  if (typeof window === "undefined") return;
  detachNative?.(); detachNative = null;
  if (nativeTts()) postNative({ type: "stop-speech" });
  window.speechSynthesis?.cancel();
}

export const speechSupported = () => typeof window !== "undefined" && (nativeTts() || "speechSynthesis" in window);

const NATIVE_LANG = { in: "en-IN", gb: "en-GB", us: "en-US" } as const;
function speakNative(text: string, options: BrowserSpeechOptions) {
  stopBrowserSpeech();
  const id = speakToken;
  const onEvent = (event: Event) => {
    const detail = (event as CustomEvent<{ id: number; event: "start" | "end" | "error" }>).detail;
    if (!detail || detail.id !== id) return;
    if (detail.event === "start") options.onStart?.();
    else { detachNative?.(); detachNative = null; if (detail.event === "end") options.onEnd?.(); else options.onError?.(); }
  };
  window.addEventListener("placeble-speech", onEvent);
  detachNative = () => window.removeEventListener("placeble-speech", onEvent);
  // The phone's voices don't say whether they are male or female, so each interviewer gets a different pitch.
  const pitch = (options.pitch ?? 1) * (options.gender === "female" ? 1.12 : options.gender === "male" ? 0.82 : 1);
  postNative({ type: "speak", id, text, rate: options.rate ?? 0.96, pitch, lang: NATIVE_LANG[options.accent ?? "in"] });
  return true;
}

/** Chrome returns no voices until they've loaded, so wait briefly for them instead of falling back to the default robot voice. */
function voicesReady(): Promise<SpeechSynthesisVoice[]> {
  const now = window.speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise(resolve => {
    const done = () => { window.speechSynthesis.removeEventListener("voiceschanged", done); resolve(window.speechSynthesis.getVoices()); };
    window.speechSynthesis.addEventListener("voiceschanged", done);
    window.setTimeout(done, 1500);
  });
}

const FEMALE = /female|zira|samantha|aria|jenny|heera|neerja|susan|hazel|libby|sonia|karen|moira|tessa|victoria|serena|kalpana|swara|natasha|michelle|emma/i;
const MALE = /\bmale\b|david|mark|guy|ryan|ravi|prabhat|daniel|george|thomas|rishi|madhur|christopher|eric|james|arthur|prabhas/i;
const ACCENT_LANG = { in: "en-in", gb: "en-gb", us: "en-us" } as const;

function pickVoice(voices: SpeechSynthesisVoice[], options: BrowserSpeechOptions) {
  const english = voices.filter(voice => voice.lang.toLowerCase().startsWith("en"));
  if (options.voiceHint) { const hinted = english.find(voice => voice.name.toLowerCase().includes(options.voiceHint!.toLowerCase())); if (hinted) return hinted; }
  const scored = english.map(voice => {
    const name = voice.name;
    const isFemale = FEMALE.test(name);
    const isMale = !isFemale && MALE.test(name);
    let score = 0;
    if (options.gender === "female" && isFemale) score += 6;
    if (options.gender === "male" && isMale) score += 6;
    if (options.gender && ((options.gender === "female" && isMale) || (options.gender === "male" && isFemale))) score -= 8;
    if (options.accent && voice.lang.toLowerCase() === ACCENT_LANG[options.accent]) score += 3;
    if (/natural|neural|online|enhanced|premium/i.test(name)) score += 4;   // these sound far more human than the basic ones
    if (voice.localService === false) score += 1;
    return { voice, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.voice ?? null;
}

/** Splits into sentences so long questions aren't cut off (Chrome stops speaking after ~15 seconds of one utterance). */
const sentences = (text: string) => (text.match(/[^.!?]+[.!?]*\s*/g) ?? [text]).map(part => part.trim()).filter(Boolean);

export function speakBrowserText(text: string, options: BrowserSpeechOptions = {}) {
  if (!speechSupported() || !text.trim()) return false;
  if (nativeTts()) return speakNative(text, options);
  stopBrowserSpeech();
  const token = speakToken;
  void voicesReady().then(voices => {
    if (token !== speakToken) return;
    const voice = pickVoice(voices, options);
    const parts = sentences(text);
    parts.forEach((part, index) => {
      const utterance = new SpeechSynthesisUtterance(part);
      utterance.rate = options.rate ?? 0.96;
      utterance.pitch = options.pitch ?? 1;
      if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
      if (index === 0) utterance.onstart = () => { if (token === speakToken) options.onStart?.(); };
      if (index === parts.length - 1) utterance.onend = () => { if (token === speakToken) options.onEnd?.(); };
      utterance.onerror = event => { if (token === speakToken && event.error !== "canceled" && event.error !== "interrupted") options.onError?.(); };
      window.speechSynthesis.speak(utterance);
    });
  });
  return true;
}
