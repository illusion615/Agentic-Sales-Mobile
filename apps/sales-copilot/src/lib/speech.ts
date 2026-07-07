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

/**
 * True if the device has a usable local (Web Speech) voice for the given
 * BCP-47 lang. Drives engine selection: when a local voice exists we speak for
 * free and instantly; when it does not (e.g. GMS-less Huawei WebView returns an
 * empty voice list) the caller falls back to Azure Neural TTS via the connector.
 */
export function hasLocalVoiceFor(lang: string): boolean {
  if (!hasSpeechSynthesis) return false;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return false;
  const prefix = (lang || '').split('-')[0].toLowerCase();
  if (!prefix) return true;
  return voices.some((v: SpeechSynthesisVoice) => v.lang.toLowerCase().startsWith(prefix));
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

// ---------------------------------------------------------------------------
// Mobile gesture unlock ("priming").
//
// iOS Safari / WebView and some Android WebViews block speechSynthesis.speak()
// unless it is reached from a real user gesture. The block is per page-load:
// once ONE gesture-initiated speak fires, the engine stays unlocked for the
// rest of the session and later async speaks (after await / setTimeout) work.
//
// primeSpeech() fires a silent, throwaway utterance. Call it SYNCHRONOUSLY as
// the very first thing inside a click handler — before any await / network /
// ensureVoicesReady — so the engine is unlocked even when the real audio is
// produced later. This is why the Copilot bubble (which spoke synchronously)
// always worked while the Insight player (which spoke after awaits) did not.
// ---------------------------------------------------------------------------
let speechPrimed = false;

export function primeSpeech(): void {
  if (!hasSpeechSynthesis) return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0; // silent — never heard by the user
    u.rate = 10;  // finish instantly
    window.speechSynthesis.speak(u);
    speechPrimed = true;
  } catch {
    /* engine restricted (e.g. iframe Permissions-Policy) — ignore */
  }
}

export function isSpeechPrimed(): boolean {
  return speechPrimed;
}

/** Strip common Markdown so TTS reads clean prose instead of symbols. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '') // fenced code blocks
    .replace(/`[^`]+`/g, '')        // inline code
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/\*([^*]+)\*/g, '$1')     // italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links -> link text
    .replace(/#{1,6}\s+/g, '')      // headings
    .trim();
}

/**
 * Split text into natural TTS segments so the browser inserts breathing room
 * between thoughts. Prefers authored paragraph breaks (blank lines); falls back
 * to sentence boundaries when the text is a single block.
 */
export function splitIntoSegments(text: string): string[] {
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (paragraphs.length > 1) return paragraphs;
  return text
    .split(/(?<=[。！？.!?])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

