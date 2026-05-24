/**
 * Task announce bubble — full-width emphasis message that introduces the
 * next task in a multi-intent execution.
 *
 *   ▸ 任务 2/4   识别潜在商机
 *
 * Visual: rounded card, accent-tinted border, small index pill on the left,
 * label as primary text. Sits in the chat flow above the task's sub-steps.
 */
import { motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';

interface TaskAnnounceBubbleProps {
  index: number;   // 1-based
  total: number;
  label: string;
  locale: 'zh-Hans' | 'en';
}

export function TaskAnnounceBubble({ index, total, label, locale }: TaskAnnounceBubbleProps) {
  const isZh = locale === 'zh-Hans';
  const indexLabel = isZh ? `任务 ${index}/${total}` : `Task ${index}/${total}`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/15"
    >
      <div className="flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium">
        <ChevronRight className="w-3 h-3" />
        <span>{indexLabel}</span>
      </div>
      <div className="min-w-0 text-sm font-medium text-foreground truncate">{label}</div>
    </motion.div>
  );
}
