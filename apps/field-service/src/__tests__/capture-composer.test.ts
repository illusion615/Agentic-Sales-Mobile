import { describe, expect, it } from 'vitest';
import { captureComposerAction } from '@/domain/capture-composer';

describe('capture composer action', () => {
  it('shows busy before any other action', () => {
    expect(captureComposerAction({ hasText: true, busy: true, listening: false, speechSupported: true })).toBe('busy');
  });

  it('sends when editable text exists', () => {
    expect(captureComposerAction({ hasText: true, busy: false, listening: false, speechSupported: true })).toBe('send');
  });

  it('stops an active voice session', () => {
    expect(captureComposerAction({ hasText: false, busy: false, listening: true, speechSupported: true })).toBe('stop-voice');
  });

  it('keeps Stop visible when interim speech has populated text', () => {
    expect(captureComposerAction({ hasText: true, busy: false, listening: true, speechSupported: true })).toBe('stop-voice');
  });

  it('starts voice from an empty composer', () => {
    expect(captureComposerAction({ hasText: false, busy: false, listening: false, speechSupported: true })).toBe('start-voice');
  });

  it('disables the slot when the chosen input mode uses the device keyboard', () => {
    expect(captureComposerAction({ hasText: false, busy: false, listening: false, speechSupported: false })).toBe('disabled');
  });
});
