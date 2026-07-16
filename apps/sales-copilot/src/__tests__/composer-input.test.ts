import { describe, expect, it } from 'vitest';
import { composerHeight, isComposerMultiline } from '@/lib/composer-input';

const base = { lineHeight: 20, padTop: 8, padBottom: 8 };
// One line = 20 + 8 + 8 = 36px.

describe('composerHeight', () => {
  it('keeps a single line at the minimum height without scrolling', () => {
    const r = composerHeight({ ...base, scrollHeight: 36, viewportHeight: 800 });
    expect(r.height).toBe(36);
    expect(r.scroll).toBe(false);
  });

  it('grows with content up to the viewport cap, then scrolls', () => {
    // 45% of 800 = 360 cap.
    const short = composerHeight({ ...base, scrollHeight: 120, viewportHeight: 800 });
    expect(short.height).toBe(120);
    expect(short.scroll).toBe(false);

    const tall = composerHeight({ ...base, scrollHeight: 900, viewportHeight: 800 });
    expect(tall.height).toBe(360);
    expect(tall.scroll).toBe(true);
  });

  it('shrinks the cap when the viewport is small (keyboard up)', () => {
    // Visual viewport shrinks to 320 when the keyboard is open → cap 144.
    const r = composerHeight({ ...base, scrollHeight: 900, viewportHeight: 320 });
    expect(r.height).toBe(Math.round(320 * 0.45));
    expect(r.scroll).toBe(true);
  });

  it('honors an absolute px ceiling on very tall viewports', () => {
    const r = composerHeight({ ...base, scrollHeight: 2000, viewportHeight: 2000, absoluteMaxPx: 320 });
    expect(r.height).toBe(320);
    expect(r.scroll).toBe(true);
  });

  it('never returns below the single-line minimum even with a tiny viewport', () => {
    const r = composerHeight({ ...base, scrollHeight: 10, viewportHeight: 50 });
    expect(r.height).toBe(36);
    expect(r.scroll).toBe(false);
  });

  it('respects a custom viewport ratio', () => {
    const r = composerHeight({ ...base, scrollHeight: 900, viewportHeight: 1000, maxViewportRatio: 0.3 });
    expect(r.height).toBe(300);
  });
});

describe('isComposerMultiline', () => {
  it('is false for a single line', () => {
    expect(isComposerMultiline({ ...base, scrollHeight: 36 })).toBe(false);
  });
  it('is true once content wraps to a second line', () => {
    expect(isComposerMultiline({ ...base, scrollHeight: 56 })).toBe(true);
  });
});
