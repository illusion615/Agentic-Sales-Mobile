/**
 * Task section header — a lightweight divider that introduces one step in a
 * multi-intent queue. Not a bubble; just a subtle line + step label so that
 * the content below it (cards, results) feels visually nested.
 *
 *   ── Step 1/4 · Log visit — Log "London hospital visit"
 *       [match card / form card / result — all indented via CSS in copilot-panel]
 */
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { getLocale, t } from '@/lib/i18n';

interface TaskAnnounceBubbleProps {
  index: number;   // 1-based
  total: number;
  label: string;
  locale: 'zh-Hans' | 'en';
  collapsed?: boolean;
  onToggle?: () => void;
}

export function TaskAnnounceBubble({ index, total, label }: TaskAnnounceBubbleProps) {
  const indexLabel = t('stepLabel', getLocale(), { index, total });
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'flex items-center gap-2 pt-3 pb-1',
        index > 1 && 'mt-1 border-t border-border/40',
      )}
    >
      <span className="shrink-0 text-[11px] font-semibold text-primary/70 tracking-wide uppercase">
        {indexLabel}
      </span>
      <span className="text-xs text-muted-foreground truncate">{label}</span>
    </motion.div>
  );
}
