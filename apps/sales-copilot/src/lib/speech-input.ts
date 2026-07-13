import { getSpeechProxyConfig, getSpeechProxyConfigCached } from '@/lib/speech-config';
import type { SpeechInputMode } from '@/lib/i18n';

export type ResolvedSpeechInputMode = 'web-speech' | 'device-ime' | 'azure';

export function hasWebSpeechRecognition(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function isDeviceImeLikelyAvailable(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (navigator.maxTouchPoints || 0) > 0;
}

export function getSpeechInputModeOptions(azureReady: boolean): SpeechInputMode[] {
  return azureReady
    ? ['auto', 'web-speech', 'device-ime', 'azure']
    : ['auto', 'web-speech', 'device-ime'];
}

export function normalizeSpeechInputMode(mode: SpeechInputMode, azureReady: boolean): SpeechInputMode {
  return mode === 'azure' && !azureReady ? 'auto' : mode;
}

export function resolveSpeechInputMode(
  preferred: SpeechInputMode,
  options: { azureReady: boolean; webSpeechReady?: boolean; deviceImeReady?: boolean }
): ResolvedSpeechInputMode {
  const webSpeechReady = options.webSpeechReady ?? hasWebSpeechRecognition();
  const deviceImeReady = options.deviceImeReady ?? isDeviceImeLikelyAvailable();

  if (preferred === 'web-speech') {
    if (webSpeechReady) return 'web-speech';
    return deviceImeReady ? 'device-ime' : (options.azureReady ? 'azure' : 'device-ime');
  }
  if (preferred === 'device-ime') return 'device-ime';
  if (preferred === 'azure') {
    if (options.azureReady) return 'azure';
    if (webSpeechReady) return 'web-speech';
    return 'device-ime';
  }

  if (webSpeechReady) return 'web-speech';
  if (deviceImeReady) return 'device-ime';
  return options.azureReady ? 'azure' : 'device-ime';
}

export function isAzureSpeechReadyCached(): boolean | null {
  return getSpeechProxyConfigCached()?.ready ?? null;
}

export async function isAzureSpeechReady(): Promise<boolean> {
  return (await getSpeechProxyConfig()).ready;
}