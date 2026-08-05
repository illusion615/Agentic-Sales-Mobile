import { SalesCopilotSpeechService } from '@/generated/services/SalesCopilotSpeechService';
import { getSpeechProxyConfig } from './speech-config';

function decodeBase64Utf8(value: string): string {
  const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function transcribeSpeech(wavBase64: string, locale: string): Promise<string> {
  const config = await getSpeechProxyConfig();
  if (!config.ready) throw new Error('Azure Speech is not configured');
  const result = await SalesCopilotSpeechService.Transcribe({
    audio: wavBase64,
    locale,
    apiKey: config.apiKey,
  });
  if (!result.success || !result.data) {
    throw new Error(result.error?.message ?? '语音识别请求失败');
  }
  const text = result.data.text ? String(result.data.text) : '';
  if (!text) return '';
  try {
    return decodeBase64Utf8(text);
  } catch {
    return text;
  }
}
