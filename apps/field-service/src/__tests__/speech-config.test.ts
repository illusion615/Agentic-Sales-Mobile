import { describe, expect, it, vi } from 'vitest';

vi.mock('@/generated/services/EnvironmentvariabledefinitionsService', () => ({
  EnvironmentvariabledefinitionsService: { getAll: vi.fn() },
}));
vi.mock('@/generated/services/EnvironmentvariablevaluesService', () => ({
  EnvironmentvariablevaluesService: { getAll: vi.fn() },
}));

const { resolveSpeechProxyConfig } = await import('@/data/speech-config');

describe('Field speech proxy configuration', () => {
  it('uses current values before defaults, matching Sales', () => {
    expect(
      resolveSpeechProxyConfig(
        [
          { schemaname: 'biz_VoiceFunctionHost', defaultvalue: 'default-host' },
          { schemaname: 'biz_VoiceConnectorApiKey', defaultvalue: 'default-key' },
        ],
        [
          { schemaname: 'biz_VoiceFunctionHost', value: 'current-host' },
          { schemaname: 'biz_VoiceConnectorApiKey', value: 'current-key' },
        ],
      ),
    ).toEqual({ host: 'current-host', apiKey: 'current-key', ready: true });
  });

  it('fails closed when either value is absent', () => {
    expect(
      resolveSpeechProxyConfig(
        [{ schemaname: 'biz_VoiceFunctionHost', defaultvalue: 'host' }],
        [],
      ).ready,
    ).toBe(false);
  });
});
