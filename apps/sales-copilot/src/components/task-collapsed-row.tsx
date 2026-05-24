/**
 * Task collapsed row — replaces the verbose sub-step messages of a completed
 * multi-intent task with a single one-liner.
 *
 *   ✓ 登记客户拜访 · 关联 Royal London Hospital               ›
 *
 * Click ⇢ caller toggles `collapsed=false` on all messages in this group
 * (re-expanding the full trail).
 */
import { motion } from 'framer-motion';
import { CheckCircle2, ChevronRight } from 'lucide-react';

interface TaskCollapsedRowProps {
  label: string;
  summary?: string;
  onExpand?: () => void;
}

export function TaskCollapsedRow({ label, summary, onExpand }: TaskCollapsedRowProps) {
  return (
    <motion.button
      type="button"
      onClick={onExpand}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-muted/40 transition-colors text-left"
    >
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
      <span className="text-xs text-muted-foreground truncate">
        <span className="text-foreground/80 font-medium">{label}</span>
        {summary ? <span className="text-muted-foreground/80"> · {summary}</span> : null}
      </span>
      <ChevronRight className="w-3 h-3 text-muted-foreground/60 ml-auto shrink-0" />
    </motion.button>
  );
}
