const { app } = require('@azure/functions');
const { checkApiKey } = require('../auth');

/**
 * Speech-to-text proxy.
 *
 * The Power Apps Code App runs in a `connect-src 'none'` sandbox and cannot call
 * Azure directly, so it invokes this Function through a custom connector (via the
 * Power Apps SDK). The app records the microphone with getUserMedia + Web Audio
 * and encodes 16 kHz mono 16-bit PCM WAV in the browser (deterministic format
 * Azure always accepts), base64-encodes it, and posts it here. We forward the
 * bytes to the Azure Speech short-audio REST API and return the transcript.
 *
 * POST /api/stt  { audio: <base64 wav>, locale? }  ->  { text, status, locale }
 */

const DEFAULT_LOCALE = 'zh-CN';
const SUPPORTED = ['zh-CN', 'en-US', 'de-DE', 'fr-FR', 'es-ES'];

// Short-audio REST API accepts up to ~60s / a few MB. Cap generously.
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

app.http('stt', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const denied = checkApiKey(request);
    if (denied) return denied;

    const key = process.env.SPEECH_KEY;
    const region = process.env.SPEECH_REGION || 'eastus';
    if (!key) {
      context.error('SPEECH_KEY app setting is missing');
      return { status: 500, jsonBody: { error: 'speech_key_not_configured' } };
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'invalid_json' } };
    }

    const b64 = body && body.audio ? String(body.audio) : '';
    if (!b64) {
      return { status: 400, jsonBody: { error: 'audio_required' } };
    }

    const locale = body.locale && SUPPORTED.includes(body.locale) ? body.locale : DEFAULT_LOCALE;

    let audio;
    try {
      audio = Buffer.from(b64, 'base64');
    } catch {
      return { status: 400, jsonBody: { error: 'invalid_audio' } };
    }
    if (!audio.length) {
      return { status: 400, jsonBody: { error: 'audio_required' } };
    }
    if (audio.length > MAX_AUDIO_BYTES) {
      return { status: 400, jsonBody: { error: 'audio_too_long' } };
    }

    try {
      const url =
        `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
        `?language=${encodeURIComponent(locale)}&format=simple`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
          Accept: 'application/json',
          'User-Agent': 'sales-copilot-voice',
        },
        body: audio,
      });

      if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        context.error(`STT upstream ${resp.status}: ${detail.slice(0, 200)}`);
        return { status: 502, jsonBody: { error: 'stt_failed', upstreamStatus: resp.status } };
      }

      const data = await resp.json().catch(() => ({}));
      const text = data && data.DisplayText ? String(data.DisplayText) : '';
      // Return the transcript base64-encoded (UTF-8). The Power Apps connector /
      // host layer mangles multi-byte UTF-8 in a JSON response (Chinese, and
      // accented de/fr/es chars) — it surfaces as "JSON parse error: unterminated
      // string" on the client. base64 is pure ASCII, so it always survives. The
      // app decodes it (see lib/azure-stt.ts).
      const textB64 = Buffer.from(text, 'utf8').toString('base64');
      return {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
        jsonBody: { text: textB64, status: (data && data.RecognitionStatus) || 'Unknown', locale },
      };
    } catch (err) {
      context.error('stt error', err);
      return { status: 502, jsonBody: { error: 'stt_error' } };
    }
  },
});
