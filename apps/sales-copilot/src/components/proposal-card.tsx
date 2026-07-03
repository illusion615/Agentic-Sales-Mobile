import { useState } from 'react';
import { motion } from 'motion/react';
import { Check, X, GitMerge, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getLocale, type Locale } from '@/lib/i18n';
import type { ChangeProposal } from '@/lib/change-proposal';
import { GenerativePreview } from '@/components/generative-preview';

/**
 * Change-proposal card. Shows a set of proposed writes (e.g. a merge = update
 * the kept record + delete the duplicate) and asks the user to confirm before
 * ANYTHING is written. This is the confirm gate for composite / destructive ops.
 */
interface ProposalCardProps {
  messageId: string;
  proposalCard: {
    proposal: ChangeProposal;
    status: 'pending' | 'applied' | 'cancelled' | 'failed';
  };
  resolved?: boolean;
  resolutionResult?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export function ProposalCard({
  proposalCard,
  resolved = false,
  resolutionResult,
  onConfirm,
  onCancel,
}: ProposalCardProps) {
  const locale: Locale = getLocale();
  const isZh = locale === 'zh-Hans';
  const [busy, setBusy] = useState(false);
  const isResolved = resolved || busy;
  const { proposal } = proposalCard;

  if (resolved) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card p-3 rounded-xl opacity-70"
      >
        <div className="flex items-center gap-2">
          <Check className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-sm text-foreground truncate">
            {resolutionResult || (isZh ? '已应用' : 'Applied')}
          </span>
        </div>
      </motion.div>
    );
  }

  const summary = proposal.summary;
  const confirm = () => { if (isResolved) return; setBusy(true); onConfirm?.(); };
  const cancel = () => { if (isResolved) return; onCancel?.(); };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn('glass-card p-4 rounded-xl', busy && 'opacity-60 pointer-events-none')}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <GitMerge className="w-4 h-4 text-primary" />
        </div>
        <h4 className="font-medium text-sm text-foreground">
          {summary || (isZh ? '待确认的修改' : 'Proposed changes')}
        </h4>
      </div>

      <GenerativePreview sections={proposal.followup} />

      {!proposal.followup?.length && (
        <ul className="space-y-2 mb-4">
          {proposal.writes.map((w, i) => {
            const isDelete = w.fn.startsWith('delete');
            return (
              <li key={i} className="flex items-start gap-2 text-sm">
                {isDelete
                  ? <Trash2 className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  : <Pencil className="w-4 h-4 text-primary mt-0.5 shrink-0" />}
                <span className="text-foreground">{w.label}</span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex gap-2">
        <Button size="sm" onClick={confirm} disabled={isResolved} className="flex-1">
          <Check className="w-4 h-4 mr-1" /> {isZh ? '确认执行' : 'Confirm'}
        </Button>
        <Button size="sm" variant="ghost" onClick={cancel} disabled={isResolved}>
          <X className="w-4 h-4 mr-1" /> {isZh ? '取消' : 'Cancel'}
        </Button>
      </div>
    </motion.div>
  );
}
