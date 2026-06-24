/**
 * FeedbackHost — single top-level listener that plays scenario animations.
 *
 * Mounted once in the app layout. Subscribes to the feedback bus; when a
 * scenario fires (already gated by lib/feedback's fireFeedback), it mounts the
 * chosen animation component for that style's duration, then unmounts it.
 * Multiple animations can overlap; each is keyed independently.
 *
 * Rendered through a portal to document.body so it floats above all routes
 * and is never clipped by page containers.
 */
import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { subscribeFeedback, STYLE_META, type FeedbackEvent } from '@/lib/feedback';
import { STYLE_COMPONENTS } from './style-registry';

interface ActiveAnimation {
  key: number;
  style: FeedbackEvent['style'];
}

export function FeedbackHost() {
  const [active, setActive] = useState<ActiveAnimation[]>([]);

  const remove = useCallback((key: number) => {
    setActive((prev) => prev.filter((a) => a.key !== key));
  }, []);

  useEffect(() => {
    return subscribeFeedback((event) => {
      const Component = STYLE_COMPONENTS[event.style];
      if (!Component) return;
      const duration = STYLE_META[event.style]?.durationMs ?? 1500;
      setActive((prev) => [...prev, { key: event.key, style: event.style }]);
      window.setTimeout(() => remove(event.key), duration + 200);
    });
  }, [remove]);

  if (typeof document === 'undefined' || active.length === 0) return null;

  return createPortal(
    <>
      {active.map(({ key, style }) => {
        const Component = STYLE_COMPONENTS[style];
        return Component ? <Component key={key} /> : null;
      })}
    </>,
    document.body,
  );
}
