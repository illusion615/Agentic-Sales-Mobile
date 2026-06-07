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

// ---------------------------------------------------------------------------
// Voice readiness — single source of truth for the async voice list.
//
// The browser populates speechSynthesis.getVoices() ASYNCHRONOUSLY. On first
// call it often returns [] (or a partial list), then fires `voiceschanged`.
// Any code that picks a voice from a synchronous getVoices() before that event
// silently falls back to the default (low-quality) voice — this is why the
// FIRST sentence of a spoken summary sounded worse than the rest.
//
// ensureVoicesReady() resolves once the list is actually populated (or after a
// short timeout, so it never hangs in restricted iframes). Every playback path
// should `await ensureVoicesReady()` before constructing the first utterance.
// ---------------------------------------------------------------------------
let voicesReadyPromise: Promise<SpeechSynthesisVoice[]> | null = null;

export function ensureVoicesReady(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (!hasSpeechSynthesis) return Promise.resolve([]);
  // Already populated — resolve immediately.
  const existing = window.speechSynthesis.getVoices();
  if (existing.length > 0) return Promise.resolve(existing);
  // Memoise the in-flight wait so concurrent callers share one listener.
  if (voicesReadyPromise) return voicesReadyPromise;
  voicesReadyPromise = new Promise<SpeechSynthesisVoice[]>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener('voiceschanged', onChange);
      voicesReadyPromise = null; // allow a fresh wait later if the list resets
      resolve(window.speechSynthesis.getVoices());
    };
    const onChange = () => {
      if (window.speechSynthesis.getVoices().length > 0) finish();
    };
    window.speechSynthesis.addEventListener('voiceschanged', onChange);
    // Nudge some engines to populate, then guarantee resolution.
    window.speechSynthesis.getVoices();
    setTimeout(finish, timeoutMs);
  });
  return voicesReadyPromise;
}

