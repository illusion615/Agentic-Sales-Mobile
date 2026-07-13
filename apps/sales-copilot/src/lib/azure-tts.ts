/**
 * Azure Neural TTS via the "Sales Copilot Speech" custom connector.
 *
 * WHY a connector and not a direct fetch: the Power Apps Code App runs in a
 * host iframe whose CSP is `connect-src 'none'`, so app JS cannot open any
 * fetch / XHR / WebSocket to an external domain. The ONLY egress is the Power
 * Apps SDK channel — `getClient().executeAsync({ connectorOperation })` — which
 * posts the request to the host, which makes the real call to our Azure
 * Function, which calls Azure Speech and returns base64 MP3. See the generated
 * `SalesCopilotSpeechService`.
 *
 * This module is the single place that talks to that connector for speech. It
 * exposes one synthesis primitive plus a tiny promise cache so repeated /
 * prefetched segments are only synthesized once.
 */
import { SalesCopilotSpeechService } from '@/generated/services/SalesCopilotSpeechService';
import { getSpeechProxyConfig } from '@/lib/speech-config';

const DATA_URL_PREFIX = 'data:audio/mpeg;base64,';

// A segment should return in ~1-2s warm, ~5s on a Function cold start. The
// deployed host resolves executeAsync; on a plain browser with no host (e.g.
// `pnpm dev` on localhost) the call never resolves, so cap it so callers can
// fail over instead of hanging forever.
const SYNTH_TIMEOUT_MS = 12_000;

// Bounded promise cache keyed by voice|locale|text. Backs prefetch() and
// de-dupes identical segments (e.g. re-listening to the same insight).
const cache = new Map<string, Promise<string>>();
const MAX_CACHE = 24;

function keyOf(text: string, locale: string, voice: string | undefined): string {
  return `${voice ?? ''}|${locale}|${text}`;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Azure TTS timed out')), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/**
 * Synthesize one text segment to a playable `data:` URL (base64 MP3) via the
 * connector. Rejects on connector failure, empty audio, or timeout. Identical
 * (text, locale, voice) requests share one in-flight promise.
 */
export function synthesizeSpeech(
  text: string,
  locale: string,
  voice?: string
): Promise<string> {
  const key = keyOf(text, locale, voice);
  const hit = cache.get(key);
  if (hit) return hit;

  const p = withTimeout(
    (async () => {
      const config = await getSpeechProxyConfig();
      if (!config.ready) throw new Error('Azure Speech is not configured');
      const res = await SalesCopilotSpeechService.Synthesize({ text, locale, voice, apiKey: config.apiKey });
      if (!res.success || !res.data?.audio) {
        throw new Error(res.error?.message || 'Azure TTS: no audio returned');
      }
      return DATA_URL_PREFIX + res.data.audio;
    })(),
    SYNTH_TIMEOUT_MS
  );

  // Evict failures so a later attempt can retry rather than replaying the error.
  p.catch(() => {
    if (cache.get(key) === p) cache.delete(key);
  });

  cache.set(key, p);
  if (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return p;
}

/**
 * Warm the cache for a segment that is about to be needed (e.g. the next
 * segment while the current one plays) so playback starts without a network
 * gap. Fire-and-forget; failures are swallowed and retried at real play time.
 */
export function prefetchSpeech(text: string, locale: string, voice?: string): void {
  if (!text.trim()) return;
  void synthesizeSpeech(text, locale, voice).catch(() => {
    /* prefetch is best-effort */
  });
}
