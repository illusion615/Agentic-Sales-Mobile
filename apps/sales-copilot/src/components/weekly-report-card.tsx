import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, RefreshCw, ChevronDown, ChevronUp, Loader2, FileText, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassCard } from './glass-card';
import { MarkdownContent } from './markdown-content';
import { getLocale } from '@/lib/i18n';
import {
  type WeeklyReportActivity,
  weeklyReportCacheKey,
  readWeeklyReport,
  weekRangeLabel,
  generateWeeklyReportMarkdown,
} from '@/lib/weekly-report';

export type { WeeklyReportActivity } from '@/lib/weekly-report';

/**
 * Weekly report shown inside the Activities week view (D16).
 *
 * The report is generated on demand from the displayed week's activities and
 * persisted per-week in localStorage, so switching weeks instantly shows that
 * week's stored report (or an empty "generate" state if none exists yet). The
 * generation + caching logic lives in `lib/weekly-report.ts` so the Copilot
 * chat short-circuit (D9) shares the exact same store.
 */

interface WeeklyReportCardProps {
  /** Start of the displayed week (used as the cache key). */
  weekStart: Date;
  /** End of the displayed week (for the report's date range). */
  weekEnd: Date;
  /** Activities scheduled within the displayed week. */
  activities: WeeklyReportActivity[];
  completedCount: number;
  totalCount: number;
  className?: string;
}

export function WeeklyReportCard({
  weekStart,
  weekEnd,
  activities,
  completedCount,
  totalCount,
  className,
}: WeeklyReportCardProps) {
  const locale = getLocale();
  const [markdown, setMarkdown] = useState<string>('');
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  // Latest inputs for generation, read at click time so the callback identity
  // stays stable across the frequent activity/count prop changes.
  const inputsRef = useRef({ weekStart, weekEnd, activities, completedCount, totalCount, locale });
  inputsRef.current = { weekStart, weekEnd, activities, completedCount, totalCount, locale };

  // Load the cached report whenever the displayed week changes.
  const weekKey = weeklyReportCacheKey(weekStart);
  useEffect(() => {
    const cached = readWeeklyReport(weekStart);
    setMarkdown(cached?.markdown ?? '');
    setGeneratedAt(cached?.ts ?? null);
    setIsExpanded(true);
    // weekStart is captured via weekKey (its stable string form).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekKey]);

  const generate = useCallback(async () => {
    const { weekStart: ws, weekEnd: we, activities: acts, completedCount: cc, totalCount: tc, locale: loc } = inputsRef.current;
    setIsGenerating(true);
    try {
      const md = await generateWeeklyReportMarkdown({
        weekStart: ws, weekEnd: we, activities: acts,
        completedCount: cc, totalCount: tc, locale: loc,
      });
      if (md) {
        setMarkdown(md);
        setGeneratedAt(Date.now());
        setIsExpanded(true);
      }
    } catch (e) {
      console.error('[WeeklyReport] generation error:', e);
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const hasReport = markdown.length > 0;

  const formatTs = (ts: number) =>
    new Date(ts).toLocaleDateString(locale === 'zh-Hans' ? 'zh-CN' : 'en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  return (
    <GlassCard className={cn('overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
            <FileText className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground">
              {locale === 'zh-Hans' ? '周报' : 'Weekly Report'}
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
              {hasReport && generatedAt ? (
                <>
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                  {locale === 'zh-Hans' ? '生成于 ' : 'Generated '}{formatTs(generatedAt)}
                </>
              ) : (
                weekRangeLabel(weekStart, weekEnd, locale)
              )}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={generate}
          disabled={isGenerating}
          aria-label={hasReport
            ? (locale === 'zh-Hans' ? '重新生成周报' : 'Regenerate weekly report')
            : (locale === 'zh-Hans' ? '生成周报' : 'Generate weekly report')}
          className="h-8 w-8 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center justify-center flex-shrink-0 disabled:opacity-60"
        >
          {isGenerating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : hasReport ? (
            <RefreshCw className="w-3.5 h-3.5" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
        </button>

        {hasReport && (
          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            aria-label={isExpanded
              ? (locale === 'zh-Hans' ? '收起' : 'Collapse')
              : (locale === 'zh-Hans' ? '展开' : 'Expand')}
            className="h-8 w-8 rounded-full hover:bg-muted/50 transition-colors flex items-center justify-center flex-shrink-0"
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        )}
      </div>

      {/* Empty hint */}
      {!hasReport && !isGenerating && (
        <p className="text-[11px] text-muted-foreground mt-3">
          {locale === 'zh-Hans'
            ? '点击右上角生成本周的工作周报，结果会保存在本周。'
            : 'Generate a report for this week — it will be saved per week.'}
        </p>
      )}

      {/* Report body */}
      <AnimatePresence initial={false}>
        {hasReport && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' as const }}
          >
            <div className="pt-4 mt-4 border-t border-border/50">
              <MarkdownContent
                content={markdown}
                className="text-sm text-foreground leading-relaxed"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
