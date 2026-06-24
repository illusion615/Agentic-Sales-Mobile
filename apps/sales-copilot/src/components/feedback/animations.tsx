/**
 * Feedback animation components.
 * --------------------------------------------------------------------------
 * Each component is a self-contained, full-viewport, pointer-events-none
 * overlay. They take no props: the FeedbackHost mounts one when a scenario
 * fires and unmounts it after the style's `durationMs` (see lib/feedback.ts).
 *
 * They never block interaction and never persist — purely atmospheric.
 */
import { useEffect } from 'react';
import { motion } from 'motion/react';
import { Check, X, AlertTriangle } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Fireworks } from 'fireworks-js';

const CONFETTI_PALETTE = ['#f43f5e', '#fb7185', '#fb923c', '#fbbf24', '#facc15', '#34d399', '#22d3ee', '#60a5fa', '#a78bfa', '#f472b6'];
const SPARKLE_PALETTE = ['#FFE400', '#FFBD00', '#E89400', '#FFCA6C', '#FDFFB8', '#ffffff'];

// Shared canvas-confetti instance rendered on the MAIN thread.
// We deliberately avoid the library's default Web Worker / OffscreenCanvas path:
// inside the sandboxed Power Apps iframe the worker canvas does not paint
// reliably. A dedicated full-screen canvas with useWorker:false renders
// consistently and stays above the app (pointer-events:none, never blocks).
let confettiInstance: confetti.CreateTypes | null = null;
function getConfetti(): confetti.CreateTypes {
  if (confettiInstance) return confettiInstance;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('data-feedback-confetti', '');
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '70',
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(canvas);
  confettiInstance = confetti.create(canvas, { resize: true, useWorker: false });
  return confettiInstance;
}

function Overlay({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`fixed inset-0 pointer-events-none z-[60] overflow-hidden ${className ?? ''}`}>
      {children}
    </div>
  );
}

// ───────────────────────── Confetti (milestone / success) ──────────────────
// Powered by canvas-confetti — real per-frame particle physics (gravity, air
// drag, wobble, paper-flutter tilt). We use the library's "realistic" recipe:
// several overlaid bursts of differing spread/velocity/scalar so the spray
// pops open, fills the view, then flutters and drifts down naturally.
// canvas-confetti manages its own fixed, pointer-events-none top canvas.
export function ConfettiAnimation() {
  useEffect(() => {
    const fx = getConfetti();
    const defaults: confetti.Options = {
      origin: { y: 0.66 },
      colors: CONFETTI_PALETTE,
      ticks: 260,
      gravity: 0.9,
      disableForReducedMotion: true,
    };
    const total = 240;
    const fire = (ratio: number, opts: confetti.Options) =>
      fx({ ...defaults, ...opts, particleCount: Math.floor(total * ratio) });

    // Central burst, layered for depth.
    fire(0.25, { spread: 28, startVelocity: 58 });
    fire(0.2, { spread: 60 });
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.85 });
    fire(0.1, { spread: 120, startVelocity: 28, decay: 0.92, scalar: 1.2 });
    fire(0.1, { spread: 120, startVelocity: 48 });
    // Side cannons so colour reaches the full width of the screen.
    fx({ ...defaults, particleCount: 50, angle: 60, spread: 70, startVelocity: 55, origin: { x: 0, y: 1 } });
    fx({ ...defaults, particleCount: 50, angle: 120, spread: 70, startVelocity: 55, origin: { x: 1, y: 1 } });

    return () => {
      fx.reset();
    };
  }, []);
  return null;
}

// ───────────────────────────── Fireworks (milestone) ───────────────────────
// Powered by fireworks-js — real rockets that launch from the bottom, trail
// upward, and burst into gravity-driven sparks. We run it in its own fixed,
// pointer-events-none container, let it launch for a short while, then stop
// gracefully so the last shells finish before the host unmounts us.
export function FireworksAnimation() {
  useEffect(() => {
    const container = document.createElement('div');
    container.setAttribute('data-feedback-fireworks', '');
    Object.assign(container.style, {
      position: 'fixed',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '70',
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(container);

    const fw = new Fireworks(container, {
      autoresize: true,
      opacity: 0.5,
      acceleration: 1.02,
      friction: 0.96,
      gravity: 1.4,
      particles: 70,
      traceLength: 3,
      traceSpeed: 10,
      explosion: 6,
      intensity: 32,
      flickering: 50,
      lineStyle: 'round',
      hue: { min: 0, max: 360 },
      delay: { min: 24, max: 46 },
      rocketsPoint: { min: 30, max: 70 },
      lineWidth: { explosion: { min: 1, max: 3 }, trace: { min: 1, max: 2 } },
      brightness: { min: 55, max: 85 },
      decay: { min: 0.015, max: 0.03 },
      sound: { enabled: false },
    });
    fw.start();
    // Stop launching new rockets after the show; existing ones finish first.
    const stopTimer = window.setTimeout(() => {
      void fw.waitStop(true);
    }, 1800);

    return () => {
      window.clearTimeout(stopTimer);
      try {
        fw.stop(true);
      } catch {
        /* already stopped/disposed */
      }
      container.remove();
    };
  }, []);
  return null;
}

// ────────────────────────────── Sparkle (milestone) ────────────────────────
// canvas-confetti "stars" recipe: gold/white star + circle particles with no
// gravity that fan out and twinkle away — a tasteful shimmer.
export function SparkleAnimation() {
  useEffect(() => {
    const fx = getConfetti();
    const defaults: confetti.Options = {
      spread: 360,
      ticks: 60,
      gravity: 0,
      decay: 0.94,
      startVelocity: 26,
      colors: SPARKLE_PALETTE,
      origin: { x: 0.5, y: 0.5 },
      disableForReducedMotion: true,
    };
    const shoot = () => {
      fx({ ...defaults, particleCount: 40, scalar: 1.2, shapes: ['star'] });
      fx({ ...defaults, particleCount: 14, scalar: 0.85, shapes: ['circle'] });
    };
    const timers = [0, 120, 240].map((d) => window.setTimeout(shoot, d));
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      fx.reset();
    };
  }, []);
  return null;
}

// ───────────────────────────── Check pulse (success) ───────────────────────
export function CheckPulseAnimation() {
  return (
    <Overlay>
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          className="flex items-center justify-center rounded-full bg-emerald-500/95 text-white shadow-xl"
          style={{ width: 88, height: 88 }}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: [0.4, 1.15, 1, 1, 0.9], opacity: [0, 1, 1, 1, 0] }}
          transition={{ duration: 1.2, ease: 'easeOut', times: [0, 0.25, 0.4, 0.75, 1] }}
        >
          <Check className="w-12 h-12" strokeWidth={3} />
        </motion.div>
      </div>
    </Overlay>
  );
}

// ───────────────────────────────── Glow (success) ──────────────────────────
export function GlowAnimation() {
  return (
    <Overlay>
      <motion.div
        className="absolute inset-0"
        style={{ boxShadow: 'inset 0 0 120px 24px rgba(16,185,129,0.55)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 1.2, ease: 'easeInOut', times: [0, 0.3, 1] }}
      />
    </Overlay>
  );
}

// ───────────────────────────────── Shake (failure) ─────────────────────────
export function ShakeAnimation() {
  return (
    <Overlay>
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          className="flex items-center justify-center rounded-full bg-rose-500/95 text-white shadow-xl"
          style={{ width: 84, height: 84 }}
          initial={{ x: 0, opacity: 0, scale: 0.8 }}
          animate={{ x: [0, -10, 10, -8, 8, -4, 0], opacity: [0, 1, 1, 1, 1, 1, 0], scale: 1 }}
          transition={{ duration: 0.7, ease: 'easeInOut' }}
        >
          <X className="w-11 h-11" strokeWidth={3} />
        </motion.div>
      </div>
    </Overlay>
  );
}

// ─────────────────────────────── Red pulse (failure) ───────────────────────
export function RedPulseAnimation() {
  return (
    <Overlay>
      <motion.div
        className="absolute inset-0"
        style={{ boxShadow: 'inset 0 0 110px 22px rgba(244,63,94,0.6)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0, 0.6, 0] }}
        transition={{ duration: 0.9, ease: 'easeInOut', times: [0, 0.2, 0.45, 0.65, 1] }}
      />
    </Overlay>
  );
}

// ──────────────────────────── Attention ring (warning) ─────────────────────
export function AttentionRingAnimation() {
  return (
    <Overlay>
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          className="rounded-full border-4 border-amber-400 flex items-center justify-center"
          style={{ width: 96, height: 96 }}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: [0.5, 1.1, 1.3], opacity: [0, 0.9, 0] }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        >
          <AlertTriangle className="w-10 h-10 text-amber-400" strokeWidth={2.5} />
        </motion.div>
      </div>
    </Overlay>
  );
}

// ───────────────────────────────── Blink (warning) ─────────────────────────
export function BlinkAnimation() {
  return (
    <Overlay>
      <motion.div
        className="absolute inset-0"
        style={{ boxShadow: 'inset 0 0 100px 20px rgba(251,191,36,0.55)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0, 1, 0] }}
        transition={{ duration: 0.9, ease: 'linear', times: [0, 0.2, 0.45, 0.7, 1] }}
      />
    </Overlay>
  );
}
