import { describe, expect, it, vi } from 'vitest';

vi.mock('@/generated/services/EnvironmentvariabledefinitionsService', () => ({
  EnvironmentvariabledefinitionsService: { getAll: vi.fn() },
}));

vi.mock('@/generated/services/EnvironmentvariablevaluesService', () => ({
  EnvironmentvariablevaluesService: { getAll: vi.fn() },
}));

import {
  getSpeechInputModeOptions,
  normalizeSpeechInputMode,
  resolveSpeechInputMode,
} from '@/lib/speech-input';

describe('speech input mode resolution', () => {
  it('hides Azure when the voice function endpoint is not configured', () => {
    expect(getSpeechInputModeOptions(false)).toEqual(['auto', 'web-speech', 'device-ime']);
    expect(normalizeSpeechInputMode('azure', false)).toBe('auto');
  });

  it('shows Azure when the voice function endpoint is configured', () => {
    expect(getSpeechInputModeOptions(true)).toEqual(['auto', 'web-speech', 'device-ime', 'azure']);
    expect(normalizeSpeechInputMode('azure', true)).toBe('azure');
  });

  it('resolves auto as Web Speech, then device keyboard, then Azure', () => {
    expect(resolveSpeechInputMode('auto', {
      azureReady: true,
      webSpeechReady: true,
      deviceImeReady: true,
    })).toBe('web-speech');

    expect(resolveSpeechInputMode('auto', {
      azureReady: true,
      webSpeechReady: false,
      deviceImeReady: true,
    })).toBe('device-ime');

    expect(resolveSpeechInputMode('auto', {
      azureReady: true,
      webSpeechReady: false,
      deviceImeReady: false,
    })).toBe('azure');
  });
});
