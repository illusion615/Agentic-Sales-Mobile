import { getSpeechProxyConfig, getSpeechProxyConfigCached } from '@/lib/speech-config';

export {
  getSpeechInputModeOptions,
  hasWebSpeechRecognition,
  isDeviceImeLikelyAvailable,
  normalizeSpeechInputMode,
  resolveSpeechInputMode,
  type ResolvedSpeechInputMode,
} from '@agentic/power-runtime';

export function isAzureSpeechReadyCached(): boolean | null {
  return getSpeechProxyConfigCached()?.ready ?? null;
}

export async function isAzureSpeechReady(): Promise<boolean> {
  return (await getSpeechProxyConfig()).ready;
}