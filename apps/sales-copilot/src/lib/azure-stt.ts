/**
 * Speech-to-text via the "Sales Copilot Speech" custom connector.
 *
 * Mirrors azure-tts: the Code App sandbox (`connect-src 'none'`) blocks direct
 * calls, so we go through the Power Apps SDK connector. The app records a WAV
 * (see lib/audio-recorder) and sends it here; the Function forwards it to Azure
 * Speech and returns the transcript.
 */
import { SalesCopilotSpeechService } from '@/generated/services/SalesCopilotSpeechService';
import { getSpeechProxyConfig } from '@/lib/speech-config';

/** Decode a base64 (UTF-8) string in the browser. */
function decodeBase64Utf8(b64: string): string {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Transcribe a base64 WAV (16 kHz mono PCM) to text via the connector.
 * Returns the recognized text (empty string when nothing was recognized).
 *
 * The Function returns the transcript base64-encoded because the Power Apps
 * connector/host layer corrupts multi-byte UTF-8 (Chinese, accented chars) in a
 * JSON response ("JSON parse error: unterminated string"). base64 is ASCII and
 * always survives, so we decode it here.
 */
export async function transcribeSpeech(wavBase64: string, locale: string): Promise<string> {
  const config = await getSpeechProxyConfig();
  if (!config.ready) throw new Error('Azure Speech is not configured');
  const res = await SalesCopilotSpeechService.Transcribe({ audio: wavBase64, locale, apiKey: config.apiKey });
  if (!res.success || !res.data) {
    throw new Error(res.error?.message || 'Azure STT: request failed');
  }
  const raw = res.data.text ? String(res.data.text) : '';
  if (!raw) return '';
  try {
    return decodeBase64Utf8(raw);
  } catch {
    // Fallback for a non-base64 payload (e.g. an older Function build).
    return raw;
  }
}

