import { useEffect, useState } from 'react';

export type WorkspaceLayout = 'portrait' | 'compact' | 'desktop' | 'dual';

const DUAL_QUERY = '(horizontal-viewport-segments: 2), (vertical-viewport-segments: 2)';
const DESKTOP_QUERY = '(min-width: 1200px)';
const COMPACT_QUERY = '(min-width: 768px)';

export function detectWorkspaceLayout(match: (query: string) => boolean): WorkspaceLayout {
  if (match(DUAL_QUERY)) return 'dual';
  if (match(DESKTOP_QUERY)) return 'desktop';
  if (match(COMPACT_QUERY)) return 'compact';
  return 'portrait';
}

function currentLayout(): WorkspaceLayout {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'portrait';
  return detectWorkspaceLayout((query) => window.matchMedia(query).matches);
}

export function useWorkspaceLayout(): WorkspaceLayout {
  const [layout, setLayout] = useState(currentLayout);

  useEffect(() => {
    const queries = [DUAL_QUERY, DESKTOP_QUERY, COMPACT_QUERY].map((query) => window.matchMedia(query));
    const update = () => setLayout(currentLayout());
    queries.forEach((query) => query.addEventListener('change', update));
    return () => queries.forEach((query) => query.removeEventListener('change', update));
  }, []);

  return layout;
}
