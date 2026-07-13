import { describe, expect, it, vi } from 'vitest';

vi.mock('@/generated/services/EnvironmentvariabledefinitionsService', () => ({
  EnvironmentvariabledefinitionsService: { getAll: vi.fn() },
}));
vi.mock('@/generated/services/EnvironmentvariablevaluesService', () => ({
  EnvironmentvariablevaluesService: { getAll: vi.fn() },
}));

import { resolveSpeechProxyConfig } from '@/lib/speech-config';

describe('speech proxy optional environment configuration', () => {
  it('keeps Azure Speech disabled when the endpoint is blank', () => {
    const config = resolveSpeechProxyConfig(
      [
        { schemaname: 'biz_VoiceFunctionHost', defaultvalue: '' },
        { schemaname: 'biz_VoiceConnectorApiKey', defaultvalue: '' },
      ],
      [{ schemaname: 'biz_VoiceConnectorApiKey', value: 'proxy-key' }]
    );
    expect(config).toEqual({ host: '', apiKey: 'proxy-key', ready: false });
  });

  it('enables Azure Speech only when endpoint and proxy key are both configured', () => {
    const config = resolveSpeechProxyConfig(
      [],
      [
        { schemaname: 'biz_VoiceFunctionHost', value: 'speech.example.com' },
        { schemaname: 'biz_VoiceConnectorApiKey', value: 'proxy-key' },
      ]
    );
    expect(config.ready).toBe(true);
  });

  it('prefers current environment values over definition defaults', () => {
    const config = resolveSpeechProxyConfig(
      [
        { schemaname: 'biz_VoiceFunctionHost', defaultvalue: 'default.example.com' },
        { schemaname: 'biz_VoiceConnectorApiKey', defaultvalue: 'default-key' },
      ],
      [
        { schemaname: 'biz_VoiceFunctionHost', value: 'current.example.com' },
        { schemaname: 'biz_VoiceConnectorApiKey', value: 'current-key' },
      ]
    );
    expect(config).toEqual({ host: 'current.example.com', apiKey: 'current-key', ready: true });
  });
});
