export type CaptureComposerAction = 'busy' | 'send' | 'stop-voice' | 'start-voice' | 'disabled';

export function captureComposerAction(input: {
  hasText: boolean;
  busy: boolean;
  listening: boolean;
  speechSupported: boolean;
}): CaptureComposerAction {
  if (input.busy) return 'busy';
  if (input.listening) return 'stop-voice';
  if (input.hasText) return 'send';
  if (input.speechSupported) return 'start-voice';
  return 'disabled';
}
