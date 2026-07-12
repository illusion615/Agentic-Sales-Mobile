import { EnvironmentvariabledefinitionsService } from '@/generated/services/EnvironmentvariabledefinitionsService';
import { EnvironmentvariablevaluesService } from '@/generated/services/EnvironmentvariablevaluesService';
import { withTimeout } from '@/lib/retry';
import type { SpeechInputMode } from '@/lib/i18n';

export type ResolvedSpeechInputMode = 'web-speech' | 'device-ime' | 'azure';

const VOICE_FUNCTION_HOST_SCHEMA = 'biz_VoiceFunctionHost';
const READY_CHECK_TIMEOUT_MS = 3500;

let azureReadyPromise: Promise<boolean> | null = null;
let azureReadyCache: boolean | null = null;

function hasValue(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

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

async function readVoiceFunctionHost(): Promise<string> {
  const definitions = await EnvironmentvariabledefinitionsService.getAll({
    filter: `schemaname eq '${VOICE_FUNCTION_HOST_SCHEMA}'`,
    select: ['environmentvariabledefinitionid', 'schemaname', 'defaultvalue'],
    top: 1,
  });
  const definition = definitions.data?.[0];
  if (!definition) return '';

  const values = await EnvironmentvariablevaluesService.getAll({
    filter: `schemaname eq '${VOICE_FUNCTION_HOST_SCHEMA}'`,
    select: ['value', 'schemaname'],
    top: 1,
  });
  const currentValue = values.data?.find((row) => hasValue(row.value))?.value;
  return hasValue(currentValue) ? String(currentValue).trim() : (definition.defaultvalue || '').trim();
}

export function isAzureSpeechReadyCached(): boolean | null {
  return azureReadyCache;
}

export async function isAzureSpeechReady(): Promise<boolean> {
  if (azureReadyCache !== null) return azureReadyCache;
  if (!azureReadyPromise) {
    azureReadyPromise = withTimeout(readVoiceFunctionHost(), READY_CHECK_TIMEOUT_MS, 'voice function host lookup')
      .then((host) => hasValue(host))
      .catch(() => false)
      .then((ready) => {
        azureReadyCache = ready;
        azureReadyPromise = null;
        return ready;
      });
  }
  return azureReadyPromise;
}