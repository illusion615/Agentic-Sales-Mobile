/**
 * Style registry — maps each FeedbackStyleId to its visual component.
 * Kept separate from lib/feedback.ts so that module stays framework-free.
 *
 * To add a new animation: add a component in ./animations.tsx, register it
 * here, then declare the id in lib/feedback.ts (STYLE_META + scenario styles).
 */
import type { FeedbackStyleId } from '@/lib/feedback';
import {
  ConfettiAnimation,
  FireworksAnimation,
  SparkleAnimation,
  CheckPulseAnimation,
  GlowAnimation,
  ShakeAnimation,
  RedPulseAnimation,
  AttentionRingAnimation,
  BlinkAnimation,
} from './animations';

export const STYLE_COMPONENTS: Record<FeedbackStyleId, React.FC | null> = {
  'none': null,
  'check-pulse': CheckPulseAnimation,
  'glow': GlowAnimation,
  'confetti': ConfettiAnimation,
  'fireworks': FireworksAnimation,
  'sparkle': SparkleAnimation,
  'shake': ShakeAnimation,
  'red-pulse': RedPulseAnimation,
  'attention-ring': AttentionRingAnimation,
  'blink': BlinkAnimation,
};
