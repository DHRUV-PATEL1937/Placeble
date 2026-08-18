"use client";

export type BrowserSpeechOptions = { rate?: number; pitch?: number; voiceHint?: string; onStart?: () => void; onEnd?: () => void; onError?: () => void };

export function stopBrowserSpeech() {
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}

export function speakBrowserText(text: string, options: BrowserSpeechOptions = {}) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return false;
  stopBrowserSpeech();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = options.rate ?? .94;
  utterance.pitch = options.pitch ?? 1;
  const voices = window.speechSynthesis.getVoices();
  if (options.voiceHint) utterance.voice = voices.find(voice => voice.name.toLowerCase().includes(options.voiceHint!.toLowerCase())) ?? null;
  utterance.onstart = () => options.onStart?.();
  utterance.onend = () => options.onEnd?.();
  utterance.onerror = () => options.onError?.();
  window.speechSynthesis.speak(utterance);
  return true;
}
