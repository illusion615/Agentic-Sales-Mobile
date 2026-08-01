/**
 * How SLA state looks and reads.
 *
 * The map pin, the badge and the legend must agree, or the legend teaches the
 * wrong thing. Colour and wording therefore live here once rather than being
 * restated by each component that renders them.
 */
import type { SlaState } from '@/domain/scheduling';

export const SLA_LABEL: Record<SlaState, string> = {
  breached: '已超时',
  critical: '紧急',
  'at-risk': '有风险',
  ok: '正常',
  none: '无 SLA',
};

/** Solid pin fill. */
export const SLA_FILL: Record<SlaState, string> = {
  breached: 'bg-rose-500',
  critical: 'bg-orange-500',
  'at-risk': 'bg-amber-500',
  ok: 'bg-emerald-500',
  none: 'bg-slate-400',
};

/** Tinted badge, for text set on the app's own surfaces. */
export const SLA_BADGE: Record<SlaState, string> = {
  breached: 'bg-rose-500/12 text-rose-600 dark:text-rose-300',
  critical: 'bg-orange-500/12 text-orange-600 dark:text-orange-300',
  'at-risk': 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
  ok: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  none: 'bg-muted text-muted-foreground',
};

/** Legend order: most urgent first, so the eye lands on trouble. */
export const SLA_ORDER: readonly SlaState[] = ['breached', 'critical', 'at-risk', 'ok', 'none'];
