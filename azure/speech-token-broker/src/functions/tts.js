const { app } = require('@azure/functions');
const { checkApiKey } = require('../auth');

/**
 * Text-to-speech proxy.
 *
 * The Power Apps Code App runs in a `connect-src 'none'` sandbox and cannot call
 * Azure directly, so it invokes this Function through a custom connector (via the
 * Power Apps SDK). This endpoint synthesises speech server-side with the Speech
 * key (held in app settings) and returns base64 MP3 for the app to play.
 *
 * POST /api/tts  { text, locale?, voice?, apiKey }  ->  { audio: <base64 mp3>, format, voice, locale }
 */

const DEFAULT_VOICE = {
  'zh-CN': 'zh-CN-XiaoxiaoNeural',
  'en-US': 'en-US-AvaNeural',
  'de-DE': 'de-DE-KatjaNeural',
  'fr-FR': 'fr-FR-DeniseNeural',
  'es-ES': 'es-ES-ElviraNeural',
};

function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

app.http('tts', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
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

    const denied = checkApiKey(request, body);
    if (denied) return denied;

    const text = body && body.text ? String(body.text).trim() : '';
    if (!text) {
      return { status: 400, jsonBody: { error: 'text_required' } };
    }
    if (text.length > 5000) {
      return { status: 400, jsonBody: { error: 'text_too_long' } };
    }

    const locale = body.locale && DEFAULT_VOICE[body.locale] ? body.locale : 'zh-CN';
    const voice = body.voice ? String(body.voice) : DEFAULT_VOICE[locale];
    const ssml =
      `<speak version='1.0' xml:lang='${locale}'>` +
      `<voice name='${voice}'>${escapeXml(text)}</voice></speak>`;

    try {
      const resp = await fetch(
        `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
        {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': key,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
            'User-Agent': 'sales-copilot-voice',
          },
          body: ssml,
        }
      );

      if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        context.error(`TTS upstream ${resp.status}: ${detail.slice(0, 200)}`);
        return { status: 502, jsonBody: { error: 'tts_failed', upstreamStatus: resp.status } };
      }

      const audio = Buffer.from(await resp.arrayBuffer()).toString('base64');
      return {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
        jsonBody: { audio, format: 'mp3', voice, locale },
      };
    } catch (err) {
      context.error('tts error', err);
      return { status: 502, jsonBody: { error: 'tts_error' } };
    }
  },
});
