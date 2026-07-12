import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// isAzureSpeechReady() reads Dataverse env-var tables — stub them so it resolves
// false without touching the SDK; the Web Speech path under test is independent.
vi.mock('@/generated/services/EnvironmentvariabledefinitionsService', () => ({
  EnvironmentvariabledefinitionsService: { getAll: vi.fn().mockResolvedValue({ data: [] }) },
}));
vi.mock('@/generated/services/EnvironmentvariablevaluesService', () => ({
  EnvironmentvariablevaluesService: { getAll: vi.fn().mockResolvedValue({ data: [] }) },
}));
vi.mock('@/lib/toast-utils', () => {
  const fn = vi.fn();
  return { toast: Object.assign(fn, { error: vi.fn(), success: vi.fn(), info: vi.fn() }) };
});

import { toast } from '@/lib/toast-utils';
import { useSpeechInput } from '@/hooks/use-speech-input';

/** Controllable fake SpeechRecognition — lets a test fire lifecycle callbacks. */
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = '';
  continuous = false;
  interimResults = false;
  onstart: (() => void) | null = null;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  stopped = false;
  aborted = false;
  constructor() { FakeRecognition.instances.push(this); }
  start() { this.started = true; this.onstart?.(); }
  stop() { this.stopped = true; }
  abort() { this.aborted = true; }
}

const downEvent = () => ({ preventDefault() {} }) as unknown as React.PointerEvent;

beforeEach(() => {
  FakeRecognition.instances = [];
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
  (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition;
  vi.clearAllMocks();
});

function mountHook() {
  let text = '';
  return renderHook(() => useSpeechInput({ locale: 'en-US', inputValue: text, setInputValue: (v) => { text = v; } }));
}

describe('useSpeechInput — Web Speech lifecycle robustness', () => {
  it('never opens a second recognition over a live one', () => {
    const { result } = mountHook();
    act(() => { result.current.onMicPointerDown(downEvent()); });
    // A second tap while the first instance is still live must be a no-op.
    act(() => { result.current.onMicPointerDown(downEvent()); });
    expect(FakeRecognition.instances.length).toBe(1);
    expect(result.current.isListening).toBe(true);
  });

  it('ignores a stale instance callback so the current session is not corrupted', () => {
    const { result } = mountHook();

    // Session A starts and is listening.
    act(() => { result.current.onMicPointerDown(downEvent()); });
    const a = FakeRecognition.instances[0];
    expect(result.current.isListening).toBe(true);

    // A ends on its own; the ref is released.
    act(() => { a.onend?.(); });
    expect(result.current.isListening).toBe(false);

    // Session B starts fresh.
    act(() => { result.current.onMicPointerDown(downEvent()); });
    const b = FakeRecognition.instances[1];
    expect(b).toBeTruthy();
    expect(result.current.isListening).toBe(true);

    // A's LATE 'aborted' + onend arrive after B is active. The old code would
    // flip isListening off and block Web Speech; the identity guard makes them
    // no-ops for the current session.
    act(() => {
      a.onerror?.({ error: 'aborted' });
      a.onend?.();
    });

    expect(result.current.isListening).toBe(true); // B untouched
    expect(result.current.showMic).toBe(true);      // Web Speech NOT blocked
    expect(toast.error).not.toHaveBeenCalled();     // no error surfaced
  });

  it('a transient abort on the current instance resets cleanly without blocking or toasting', () => {
    const { result } = mountHook();
    act(() => { result.current.onMicPointerDown(downEvent()); });
    const a = FakeRecognition.instances[0];

    act(() => { a.onerror?.({ error: 'aborted' }); });

    expect(result.current.isListening).toBe(false); // reset
    expect(result.current.showMic).toBe(true);       // still available (retryable)
    expect(toast.error).not.toHaveBeenCalled();      // not surfaced as an error

    // The next tap starts a clean new instance.
    act(() => { result.current.onMicPointerDown(downEvent()); });
    expect(FakeRecognition.instances.length).toBe(2);
    expect(result.current.isListening).toBe(true);
  });
});
