import { useEffect, useRef } from 'react';
import { atom, useSetAtom } from 'jotai';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * In-app navigation depth, held in memory.
 *
 * The app runs inside the Power Apps mobile player, which mishandles the URL
 * hash and hangs on load when a HashRouter is used. We therefore use a
 * MemoryRouter, which — unlike HashRouter/BrowserRouter — never writes to
 * window.history, so `window.history.state.idx` is unavailable. This atom
 * reproduces the "how deep am I" signal the header needs for its back/home
 * affordances. 0 = initial entry (home); each PUSH +1, each POP -1.
 */
export const navDepthAtom = atom(0);

/**
 * Keeps {@link navDepthAtom} in sync with router navigation. Mount exactly once,
 * inside the router, in a component that stays mounted across route changes
 * (the persistent Layout).
 */
export function useTrackNavDepth(): void {
  const navigationType = useNavigationType(); // 'PUSH' | 'POP' | 'REPLACE'
  const location = useLocation();
  const setDepth = useSetAtom(navDepthAtom);
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    // Guard against re-running for the same navigation (e.g. StrictMode).
    if (lastKey.current === location.key) return;
    lastKey.current = location.key;

    if (navigationType === 'PUSH') {
      setDepth((d) => d + 1);
    } else if (navigationType === 'POP') {
      setDepth((d) => Math.max(0, d - 1));
    }
    // REPLACE leaves the depth unchanged.
  }, [location.key, navigationType, setDepth]);
}
