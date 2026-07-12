import { useEffect } from 'react';

/**
 * Publishes the on-screen keyboard (IME) height as a CSS custom property
 * `--keyboard-inset` (in px) on the document root, so any bottom-docked fixed
 * surface can lift its content above the keyboard via the `keyboard-inset-bottom`
 * utility (see index.css).
 *
 * ── Why this is needed ────────────────────────────────────────────────────
 * `100vh` and `position: fixed; bottom: 0` are anchored to the LAYOUT viewport,
 * which on Android (and iOS with adjustPan/adjustNothing hosts) does NOT shrink
 * when the soft keyboard appears. The default `interactive-widget=resizes-visual`
 * behaviour only shrinks the VISUAL viewport, leaving a bottom-anchored input
 * drawn underneath the keyboard. `dvh` does not help either — it tracks browser
 * chrome, not the keyboard.
 *
 * The VisualViewport API is the only reliable cross-host signal for keyboard
 * occlusion. The inset is derived so it stays correct even when the host PANS
 * the page for the keyboard (offsetTop > 0):
 *
 *   inset = max(0, innerHeight - visualViewport.height - visualViewport.offsetTop)
 *
 * When a Chromium host honours `interactive-widget=resizes-content` (added to
 * the viewport meta) the layout viewport already shrinks, so `innerHeight`
 * tracks `visualViewport.height` and this inset naturally resolves to ~0 — no
 * double shift. The two mechanisms are complementary, not redundant.
 *
 * Mount once at the app shell. No-op where VisualViewport is unavailable.
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;

    const root = document.documentElement;
    let raf = 0;

    const apply = () => {
      raf = 0;
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      // Ignore sub-pixel jitter so we don't thrash the layout at rest.
      root.style.setProperty('--keyboard-inset', `${inset < 1 ? 0 : Math.round(inset)}px`);
    };

    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(apply);
    };

    apply();
    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      vv.removeEventListener('resize', schedule);
      vv.removeEventListener('scroll', schedule);
      root.style.removeProperty('--keyboard-inset');
    };
  }, []);
}
