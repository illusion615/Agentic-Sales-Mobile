import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  config: { host: '', apiKey: '', ready: false },
  synthesize: vi.fn(),
}));

vi.mock('@/lib/speech-config', () => ({
  getSpeechProxyConfig: vi.fn(async () => mocks.config),
}));
vi.mock('@/generated/services/SalesCopilotSpeechService', () => ({
  SalesCopilotSpeechService: { Synthesize: mocks.synthesize },
}));

import { synthesizeSpeech } from '@/lib/azure-tts';

describe('Azure TTS optional connector invocation', () => {
  beforeEach(() => {
    mocks.config = { host: '', apiKey: '', ready: false };
    mocks.synthesize.mockReset();
  });

  it('does not invoke the connector when the endpoint is not configured', async () => {
    await expect(synthesizeSpeech('disabled deployment', 'en-US')).rejects.toThrow(
      'Azure Speech is not configured'
    );
    expect(mocks.synthesize).not.toHaveBeenCalled();
  });

  it('passes the environment-managed key only when invoking a configured connector', async () => {
    mocks.config = { host: 'speech.example.com', apiKey: 'proxy-key', ready: true };
    mocks.synthesize.mockResolvedValue({ success: true, data: { audio: 'YWJj' } });

    await expect(synthesizeSpeech('configured deployment', 'en-US')).resolves.toBe(
      'data:audio/mpeg;base64,YWJj'
    );
    expect(mocks.synthesize).toHaveBeenCalledWith({
      text: 'configured deployment',
      locale: 'en-US',
      voice: undefined,
      apiKey: 'proxy-key',
    });
  });
});
