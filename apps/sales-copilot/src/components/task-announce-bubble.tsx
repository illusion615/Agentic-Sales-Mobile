/**
 * Task announce bubble — full-width header that introduces (and gates the
 * visibility of) one task in a multi-intent execution.
 *
 *   ▾ 任务 2/4   识别潜在商机     ← expanded (substeps shown below)
 *   ▸ 任务 2/4   识别潜在商机     ← collapsed (substeps hidden)
 *
 * When `onToggle` is provided the row becomes a button: clicking it folds /
 * unfolds the task's substeps, and the chevron rotates 90° to match state.
 */
import { motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskAnnounceBubbleProps {
  index: number;   // 1-based
  total: number;
  label: string;
  locale: 'zh-Hans' | 'en';
  collapsed?: boolean;
  onToggle?: () => void;
}

export function TaskAnnounceBubble({ index, total, label, locale, collapsed, onToggle }: TaskAnnounceBubbleProps) {
  const isZh = locale === 'zh-Hans';
  const indexLabel = isZh ? `任务 ${index}/${total}` : `Task ${index}/${total}`;
  const interactive = typeof onToggle === 'function';
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
    >
      {interactive ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={collapsed ? 'false' : 'true'}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/15 text-left cursor-pointer hover:bg-primary/10 transition-colors',
          )}
        >
          <div className="flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium">
            <motion.span
              animate={{ rotate: collapsed ? 0 : 90 }}
              transition={{ duration: 0.15 }}
              className="inline-flex"
            >
              <ChevronRight className="w-3 h-3" />
            </motion.span>
            <span>{indexLabel}</span>
          </div>
          <div className="min-w-0 text-sm font-medium text-foreground truncate">{label}</div>
        </button>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/15">
          <div className="flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium">
            <ChevronRight className="w-3 h-3" />
            <span>{indexLabel}</span>
          </div>
          <div className="min-w-0 text-sm font-medium text-foreground truncate">{label}</div>
        </div>
      )}
    </motion.div>
  );
}
