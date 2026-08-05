import { useEffect, useRef, useState } from 'react';

export function SignaturePad({ onChange }: { onChange: (image: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      const context = canvas.getContext('2d');
      if (!context) return;
      context.scale(ratio, ratio);
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.lineWidth = 2.2;
      context.strokeStyle = '#111827';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, rect.width, rect.height);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    setEmpty(true);
    hasInk.current = false;
    onChange(null);
  };

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-border bg-white">
        <canvas
          ref={canvasRef}
          aria-label="客户签名区域"
          className="block h-44 w-full touch-none"
          onPointerDown={(event) => {
            drawing.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            const context = event.currentTarget.getContext('2d');
            const at = point(event);
            context?.beginPath();
            context?.moveTo(at.x, at.y);
          }}
          onPointerMove={(event) => {
            if (!drawing.current) return;
            const context = event.currentTarget.getContext('2d');
            const at = point(event);
            context?.lineTo(at.x, at.y);
            context?.stroke();
            hasInk.current = true;
            setEmpty(false);
          }}
          onPointerUp={(event) => {
            drawing.current = false;
            event.currentTarget.releasePointerCapture(event.pointerId);
            if (hasInk.current) onChange(event.currentTarget.toDataURL('image/png'));
          }}
          onPointerCancel={() => { drawing.current = false; }}
        />
        {empty && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">请在此处签名</span>}
      </div>
      <button type="button" onClick={clear} className="mt-2 text-xs text-muted-foreground">清除重签</button>
    </div>
  );
}
