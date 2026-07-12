import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';

/** Controllable fake VisualViewport — jsdom does not implement one. */
class FakeVisualViewport extends EventTarget {
  height = 800;
  offsetTop = 0;
}

const inset = () => document.documentElement.style.getPropertyValue('--keyboard-inset');

describe('useKeyboardInset', () => {
  const originalVV = (window as unknown as { visualViewport: unknown }).visualViewport;
  const originalRAF = window.requestAnimationFrame;
  const originalCAF = window.cancelAnimationFrame;
  let vv: FakeVisualViewport;

  beforeEach(() => {
    vv = new FakeVisualViewport();
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true, writable: true });
    // Run rAF callbacks synchronously (return 0 so the hook's in-flight guard clears).
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => { cb(0); return 0; }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = (() => {}) as typeof window.cancelAnimationFrame;
    document.documentElement.style.removeProperty('--keyboard-inset');
  });

  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', { value: originalVV, configurable: true });
    window.requestAnimationFrame = originalRAF;
    window.cancelAnimationFrame = originalCAF;
    document.documentElement.style.removeProperty('--keyboard-inset');
  });

  it('is 0px when the keyboard is closed (visual viewport fills the window)', () => {
    renderHook(() => useKeyboardInset());
    expect(inset()).toBe('0px');
  });

  it('reports the keyboard height when the visual viewport shrinks', () => {
    renderHook(() => useKeyboardInset());
    act(() => {
      vv.height = 500; // keyboard took 300px
      vv.dispatchEvent(new Event('resize'));
    });
    expect(inset()).toBe('300px');
  });

  it('accounts for host panning via offsetTop', () => {
    renderHook(() => useKeyboardInset());
    act(() => {
      vv.height = 500;
      vv.offsetTop = 50; // page panned up 50px for the keyboard
      vv.dispatchEvent(new Event('resize'));
    });
    expect(inset()).toBe('250px'); // 800 - 500 - 50
  });

  it('clears the variable on unmount and stops reacting', () => {
    const { unmount } = renderHook(() => useKeyboardInset());
    act(() => {
      vv.height = 500;
      vv.dispatchEvent(new Event('resize'));
    });
    expect(inset()).toBe('300px');
    unmount();
    expect(inset()).toBe('');
    act(() => {
      vv.height = 400;
      vv.dispatchEvent(new Event('resize'));
    });
    expect(inset()).toBe('');
  });
});
