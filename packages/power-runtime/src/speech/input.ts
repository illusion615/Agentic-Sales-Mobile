export type SpeechInputMode = 'auto' | 'web-speech' | 'device-ime' | 'azure';
export type ResolvedSpeechInputMode = Exclude<SpeechInputMode, 'auto'>;

export const SPEECH_INPUT_MODE_EVENT = 'speechinputmode-changed';
export const SPEECH_INPUT_MODE_STORAGE_KEY = 'speechInputMode';

export function hasWebSpeechRecognition(): boolean {
  if (typeof window === 'undefined') return false;
  const speechWindow = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  return !!(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition);
}

export function isDeviceImeLikelyAvailable(): boolean {
  return typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0;
}

export function getSpeechInputModeOptions(azureReady: boolean): SpeechInputMode[] {
  return azureReady
    ? ['auto', 'web-speech', 'device-ime', 'azure']
    : ['auto', 'web-speech', 'device-ime'];
}

export function normalizeSpeechInputMode(
  mode: SpeechInputMode,
  azureReady: boolean,
): SpeechInputMode {
  return mode === 'azure' && !azureReady ? 'auto' : mode;
}

export function resolveSpeechInputMode(
  preferred: SpeechInputMode,
  options: {
    azureReady: boolean;
    webSpeechReady?: boolean;
    deviceImeReady?: boolean;
  },
): ResolvedSpeechInputMode {
  const webSpeechReady = options.webSpeechReady ?? hasWebSpeechRecognition();
  const deviceImeReady = options.deviceImeReady ?? isDeviceImeLikelyAvailable();

  if (preferred === 'web-speech') {
    if (webSpeechReady) return 'web-speech';
    return deviceImeReady ? 'device-ime' : options.azureReady ? 'azure' : 'device-ime';
  }
  if (preferred === 'device-ime') return 'device-ime';
  if (preferred === 'azure') {
    if (options.azureReady) return 'azure';
    return webSpeechReady ? 'web-speech' : 'device-ime';
  }
  if (webSpeechReady) return 'web-speech';
  if (deviceImeReady) return 'device-ime';
  return options.azureReady ? 'azure' : 'device-ime';
}

export function getSpeechInputMode(): SpeechInputMode {
  try {
    const value = localStorage.getItem(SPEECH_INPUT_MODE_STORAGE_KEY);
    return value === 'web-speech' || value === 'device-ime' || value === 'azure'
      ? value
      : 'auto';
  } catch {
    return 'auto';
  }
}

export function setSpeechInputMode(mode: SpeechInputMode): void {
  try {
    localStorage.setItem(SPEECH_INPUT_MODE_STORAGE_KEY, mode);
    window.dispatchEvent(new CustomEvent(SPEECH_INPUT_MODE_EVENT, { detail: mode }));
  } catch {
    // An unavailable preference store leaves automatic selection in effect.
  }
}
