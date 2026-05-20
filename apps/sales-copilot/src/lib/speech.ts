/**
 * Safe wrapper around Web Speech API.
 * In some iframe environments (e.g. Power Apps Code App),
 * speechSynthesis may be restricted by Permissions-Policy.
 */

/** True if the browser exposes the Web Speech API. */
export const hasSpeechSynthesis =
  typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Cancel any in-progress speech, no-op if unavailable. */
export function cancelSpeech(): void {
  if (hasSpeechSynthesis) window.speechSynthesis.cancel();
}

/** Speak an utterance, no-op if unavailable. Returns false if skipped. */
export function speak(utterance: SpeechSynthesisUtterance): boolean {
  if (!hasSpeechSynthesis) return false;
  window.speechSynthesis.speak(utterance);
  return true;
}

/** Get available voices, returns [] if unavailable. */
export function getVoices(): SpeechSynthesisVoice[] {
  if (!hasSpeechSynthesis) return [];
  return window.speechSynthesis.getVoices();
}
