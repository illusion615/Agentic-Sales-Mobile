import { assessSla, type SlaState } from '@/domain/scheduling';
import type { WorkOrderSummary } from '@/domain/work-order';
import { SLA_BADGE, SLA_LABEL } from '@/lib/sla-appearance';

const TONE: Record<SlaState, { label: string; className: string }> = {
  breached: { label: SLA_LABEL.breached, className: SLA_BADGE.breached },
  critical: { label: SLA_LABEL.critical, className: SLA_BADGE.critical },
  'at-risk': { label: SLA_LABEL['at-risk'], className: SLA_BADGE['at-risk'] },
  ok: { label: SLA_LABEL.ok, className: SLA_BADGE.ok },
  none: { label: SLA_LABEL.none, className: SLA_BADGE.none },
};

/** How much of the commitment is left, or how far past it the job already is. */
export function formatRemaining(minutes: number | null): string {
  if (minutes === null) return '—';
  const absolute = Math.abs(minutes);
  const text =
    absolute >= 60 ? `${Math.floor(absolute / 60)} 小时 ${absolute % 60} 分` : `${absolute} 分钟`;
  return minutes < 0 ? `已超 ${text}` : `剩余 ${text}`;
}

export function SlaBadge({
  workOrder,
  className = '',
}: {
  workOrder: Pick<WorkOrderSummary, 'slaDueBy'>;
  className?: string;
}) {
  const tone = TONE[assessSla(workOrder).state];
  return (
    <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${tone.className} ${className}`}>
      {tone.label}
    </span>
  );
}

export { TONE as SLA_TONE };
