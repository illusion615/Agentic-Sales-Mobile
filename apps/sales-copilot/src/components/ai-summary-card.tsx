import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, RefreshCw, ChevronDown, ChevronUp, AlertCircle, Clock, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassCard } from './glass-card';
import { MarkdownContent } from './markdown-content';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { AISummary } from '@/generated/models/ai-summary-model';
import { getLocale, t } from '@/lib/i18n';

interface AISummaryCardProps {
  summary: AISummary | null;
  isLoading?: boolean;
  isGenerating?: boolean;
  isExpired?: boolean;
  isFailed?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  className?: string;
}

export function AISummaryCard({
  summary,
  isLoading,
  isGenerating,
  isExpired,
  isFailed,
  onRefresh,
  isRefreshing,
  className,
}: AISummaryCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const locale = getLocale();

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Loading state
  if (isLoading) {
    return (
      <GlassCard className={cn('animate-pulse', className)}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-3 bg-muted rounded w-2/3" />
          </div>
        </div>
      </GlassCard>
    );
  }

  // Generating state (either from prop or local refreshing state)
  if (isGenerating || isRefreshing) {
    return (
      <GlassCard className={cn('border-primary/30', className)}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              {t('aiAnalyzing', locale)}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t('generatingInsightsWait', locale)}
            </p>
          </div>
        </div>
      </GlassCard>
    );
  }

  // No summary state
  if (!summary) {
    return (
      <GlassCard className={cn('border-dashed', className)}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-foreground">
              {t('aiInsights', locale)}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t('aiAnalysisAfterUpdate', locale)}
            </p>
          </div>
          {onRefresh && (
            <Button variant="ghost" size="icon-sm" onClick={onRefresh}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          )}
        </div>
      </GlassCard>
    );
  }

  // Failed state
  if (isFailed) {
    return (
      <GlassCard className={cn('border-destructive/30', className)}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-destructive" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              {t('aiAnalysisFailed', locale)}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {summary.summary}
            </p>
          </div>
          {onRefresh && (
            <Button variant="ghost" size="icon-sm" onClick={onRefresh}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          )}
        </div>
      </GlassCard>
    );
  }

  // Success state with expandable content
  return (
    <GlassCard className={cn('overflow-hidden', isExpired && 'border-amber-500/30', className)}>
      {/* Header */}
      <div
        className="w-full flex items-center gap-3 text-left cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">
              {t('aiInsights', locale)}
            </h3>
            {isExpired && (
              <Badge variant="outline" className="text-[10px] gap-1 text-amber-600 border-amber-200 dark:border-amber-900">
                <Clock className="w-3 h-3" />
                {t('expiredLabel', locale)}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            {formatDate(summary.generatedOn)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onRefresh();
              }}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expandable Content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' as const }}
          >
            <div className="pt-4 mt-4 border-t border-border/50 space-y-4">
              {/* Summary */}
              <div>
                <MarkdownContent
                  content={summary.summary || ''}
                  className="text-sm text-foreground leading-relaxed"
                />
              </div>

              {/* Action Items */}
              {summary.actionItems && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    {t('suggestedActions', locale)}
                  </h4>
                  <MarkdownContent
                    content={summary.actionItems || ''}
                    className="text-sm text-foreground leading-relaxed"
                  />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
