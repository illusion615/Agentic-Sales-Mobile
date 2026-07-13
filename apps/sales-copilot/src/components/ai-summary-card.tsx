import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, RefreshCw, ChevronDown, ChevronUp, AlertCircle, Clock, CheckCircle2, Loader2, Phone, Calendar, Mail, Plus, Check, ArrowRight, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassCard } from './glass-card';
import { MarkdownContent } from './markdown-content';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import type { AISummary } from '@/generated/models/ai-summary-model';
import { getLocale, t, localeBcp47, type Locale } from '@/lib/i18n';
import { ACTIVITY_TYPE_COLORS, DEFAULT_ACTIVITY_COLOR } from '@/lib/activity-colors';
import { parseInsightActions, type InsightAction, type InsightActionType } from '@/lib/insight-actions';

const actionIcons: Record<InsightActionType, typeof Phone> = {
  visit: Calendar,
  call: Phone,
  meeting: Calendar,
  email: Mail,
};
const typeLabelKey: Record<InsightActionType, 'typeVisit' | 'typeCall' | 'typeMeeting' | 'typeEmail'> = {
  visit: 'typeVisit',
  call: 'typeCall',
  meeting: 'typeMeeting',
  email: 'typeEmail',
};

interface AISummaryCardProps {
  summary: AISummary | null;
  isLoading?: boolean;
  isGenerating?: boolean;
  isExpired?: boolean;
  isFailed?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  /** Override the card title (defaults to the localized "AI Insights"). */
  title?: string;
  className?: string;
  /** When provided, each structured action item shows a "create task" button that
   *  invokes this and returns the created activity id (or null on failure). */
  onCreateTask?: (action: InsightAction, scheduledDate: string) => Promise<string | null>;
  /** Entity id used to persist per-action "created" state across navigation. */
  entityId?: string;
}

export function AISummaryCard({
  summary,
  isLoading,
  isGenerating,
  isExpired,
  isFailed,
  onRefresh,
  isRefreshing,
  title,
  className,
  onCreateTask,
  entityId,
}: AISummaryCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [createdMap, setCreatedMap] = useState<Record<string, string>>(() => {
    if (!entityId) return {};
    try { const s = localStorage.getItem(`insight-actions-created:${entityId}`); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });
  const [creatingTitle, setCreatingTitle] = useState<string | null>(null);
  const [dateOverrides, setDateOverrides] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const locale = getLocale() as Locale;

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
              {title ?? t('aiInsights', locale)}
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
  const actions = parseInsightActions(summary.actionItems);
  const legacyActionMd = actions.length === 0 && summary.actionItems ? summary.actionItems : '';
  const toISODate = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const isoFromDue = (days: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return toISODate(d);
  };
  const effectiveIso = (action: InsightAction): string => dateOverrides[action.title] ?? isoFromDue(action.dueInDays);
  const fmtIso = (iso: string) => {
    try { return new Date(`${iso}T00:00:00`).toLocaleDateString(localeBcp47(locale), { month: 'short', day: 'numeric' }); } catch { return iso; }
  };
  const handleCreate = async (action: InsightAction) => {
    if (!onCreateTask || creatingTitle || createdMap[action.title]) return;
    setCreatingTitle(action.title);
    try {
      const id = await onCreateTask(action, effectiveIso(action));
      if (id) {
        const next = { ...createdMap, [action.title]: id };
        setCreatedMap(next);
        if (entityId) { try { localStorage.setItem(`insight-actions-created:${entityId}`, JSON.stringify(next)); } catch { /* ignore */ } }
      }
    } catch { /* parent surfaces the error; just reset busy state */ } finally {
      setCreatingTitle(null);
    }
  };

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
              {title ?? t('aiInsights', locale)}
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

              {/* Action Items — structured, explained next steps (activity insights)
                  or legacy markdown (other entities / older summaries). */}
              {actions.length > 0 ? (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    {t('suggestedActions', locale)}
                  </h4>
                  <div className="space-y-2">
                    {actions.map((action) => {
                      const Icon = actionIcons[action.type] || Calendar;
                      const color = ACTIVITY_TYPE_COLORS[action.type] || DEFAULT_ACTIVITY_COLOR;
                      const createdId = createdMap[action.title];
                      const busy = creatingTitle === action.title;
                      return (
                        <div key={action.title} className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 border border-border/40">
                          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', color.tint)}>
                            <Icon className={cn('w-4 h-4', color.text)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground leading-snug">{action.title}</p>
                            {action.explanation && (
                              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{action.explanation}</p>
                            )}
                            <div className="flex items-center gap-2 mt-1.5">
                              {(() => {
                                const iso = effectiveIso(action);
                                if (createdId) {
                                  return (
                                    <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-md', color.tint, color.text)}>
                                      <CalendarClock className="w-3 h-3" />
                                      {fmtIso(iso)}
                                    </span>
                                  );
                                }
                                return (
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button
                                        type="button"
                                        className={cn('inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-md transition-colors cursor-pointer hover:brightness-95', color.tint, color.text)}
                                      >
                                        <CalendarClock className="w-3 h-3" />
                                        <span>{fmtIso(iso)}</span>
                                        <ChevronDown className="w-3 h-3 opacity-60" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent align="start" className="w-auto p-0">
                                      <CalendarPicker
                                        mode="single"
                                        selected={new Date(`${iso}T00:00:00`)}
                                        onSelect={(d?: Date) => { if (d) setDateOverrides((prev) => ({ ...prev, [action.title]: toISODate(d) })); }}
                                        disabled={(date: Date) => {
                                          const start = new Date();
                                          start.setHours(0, 0, 0, 0);
                                          return date < start;
                                        }}
                                      />
                                    </PopoverContent>
                                  </Popover>
                                );
                              })()}
                              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                {t(typeLabelKey[action.type], locale)}
                              </span>
                            </div>
                          </div>
                          {onCreateTask && (
                            <div className="flex-shrink-0 self-center">
                              {createdId ? (
                                <button
                                  type="button"
                                  onClick={() => navigate(`/activities/${createdId}`)}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 px-2 py-1.5 rounded-lg hover:bg-emerald-500/10 transition-colors"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  {t('taskCreated', locale)}
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="gap-1 h-8"
                                  disabled={busy || creatingTitle != null}
                                  onClick={() => handleCreate(action)}
                                >
                                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                  {t('addAsTask', locale)}
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : legacyActionMd ? (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    {t('suggestedActions', locale)}
                  </h4>
                  <MarkdownContent
                    content={legacyActionMd}
                    className="text-sm text-foreground leading-relaxed"
                  />
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
