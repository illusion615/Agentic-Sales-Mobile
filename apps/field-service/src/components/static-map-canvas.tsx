import { useEffect, useRef, useState } from 'react';
import type { BasemapTone } from '@/lib/basemap-tone';
import { drawPngDataUrl } from '@/lib/png-canvas';
import type { StaticMapLayout } from '@/lib/static-basemap';

export function StaticMapCanvas({
  dataUrl,
  layout,
  tone,
  onDecodeError,
}: {
  dataUrl: string;
  layout: StaticMapLayout;
  tone: BasemapTone;
  onDecodeError?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const success = drawPngDataUrl(canvas, dataUrl, tone);
    setReady(success);
    if (!success) onDecodeError?.();
  }, [dataUrl, tone, onDecodeError]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute ${ready ? '' : 'invisible'}`}
      style={{
        left: layout.left,
        top: layout.top,
        width: layout.width,
        height: layout.height,
      }}
    />
  );
}
