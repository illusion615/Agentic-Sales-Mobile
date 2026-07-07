/**
 * Speech token client (front-end side of the token broker).
 *
 * The Azure Speech subscription key never reaches the browser. Instead this
 * module fetches a SHORT-LIVED (~10 minute) authorization token from the
 * server-side broker Function and caches it, refreshing at 9 minutes. The
 * Speech SDK is later initialised with `fromAuthorizationToken(token, region)`.
 *
 * Broker: azure/speech-token-broker (Azure Function, holds SPEECH_KEY server-side).
 */

// Server-side broker endpoint. Not a secret; it only returns short-lived tokens.
export const SPEECH_TOKEN_ENDPOINT =
  'https://sales-copilot-token.azurewebsites.net/api/token';

// Azure Speech authorization tokens are valid for ~10 minutes; refresh at 9.
const TOKEN_TTL_MS = 9 * 60 * 1000;

export interface SpeechCredential {
  token: string;
  region: string;
}

interface CachedCredential extends SpeechCredential {
  fetchedAt: number;
}

let cached: CachedCredential | null = null;
let inflight: Promise<SpeechCredential> | null = null;

/**
 * Return a valid Speech credential, using the in-memory cache when it is still
 * fresh. Concurrent callers share a single in-flight request. Pass force=true
 * to bypass the cache (e.g. after an upstream 401).
 */
export async function getSpeechToken(force = false): Promise<SpeechCredential> {
  if (!force && cached && Date.now() - cached.fetchedAt < TOKEN_TTL_MS) {
    return { token: cached.token, region: cached.region };
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const resp = await fetch(SPEECH_TOKEN_ENDPOINT, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!resp.ok) {
        throw new Error(`token endpoint returned ${resp.status}`);
      }
      const data = (await resp.json()) as Partial<SpeechCredential>;
      if (!data?.token || !data?.region) {
        throw new Error('malformed token response');
      }
      cached = { token: data.token, region: data.region, fetchedAt: Date.now() };
      return { token: data.token, region: data.region };
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Drop the cached token (e.g. on sign-out or an auth error). */
export function clearSpeechTokenCache(): void {
  cached = null;
}

/**
 * Warm the token ahead of first use — call when the copilot panel opens so the
 * press-to-talk / read-aloud paths do not pay the fetch latency on first use.
 */
export function prewarmSpeechToken(): void {
  void getSpeechToken().catch(() => {
    /* best-effort warm-up; real errors surface at actual use */
  });
}
