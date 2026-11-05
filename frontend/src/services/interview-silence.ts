export const ANSWER_SILENCE_MS = 6000;

export function createAnswerActivity() {
  return { transcript: "", lastSpeechAt: null as number | null, voicedSince: null as number | null };
}

export function observeAnswerTranscript(activity: ReturnType<typeof createAnswerActivity>, text: string, now: number) {
  const transcript = text.trim();
  if (transcript && transcript !== activity.transcript) {
    activity.transcript = transcript;
    activity.lastSpeechAt = now;
  }
}

export function observeAnswerAudio(activity: ReturnType<typeof createAnswerActivity>, rms: number, now: number) {
  // Once captions work, their activity is more reliable than background mic noise.
  if (activity.transcript) return;
  if (rms > 0.018) {
    activity.voicedSince ??= now;
    if (now - activity.voicedSince >= 250) activity.lastSpeechAt = now;
  } else activity.voicedSince = null;
}

export function answerSilenceRemaining(activity: ReturnType<typeof createAnswerActivity>, now: number) {
  return activity.lastSpeechAt === null ? null : Math.max(0, ANSWER_SILENCE_MS - (now - activity.lastSpeechAt));
}
