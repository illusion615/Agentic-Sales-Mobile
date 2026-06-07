import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, RefreshCw, ChevronDown, ChevronUp, Loader2, FileText, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassCard } from './glass-card';
import { MarkdownContent } from './markdown-content';
import { getLocale } from '@/lib/i18n';

/**
 * Weekly report shown inside the Activities week view (D16).
 *
 * The report is generated on demand from the displayed week's activities and
 * persisted per-week in localStorage, so switching weeks instantly shows that
 * week's stored report (or an empty "generate" state if none exists yet). It is
 * intentionally NOT routed through the Copilot conversation.
 *
 * Cache contract: key `weekly-report:v1:<weekStart yyyy-MM-dd>` →
 * `{ ts, markdown, activityCount }`. No TTL — reports persist until the user
 * regenerates them.
 */
const CACHE_PREFIX = 'weekly-report:v1:';

export interface WeeklyReportActivity {
  title: string;
  type: string;
  status: string;
  scheduledAt: string;
  accountName?: string;
  opportunityName?: string;
  notes?: string;
}

interface CachedReport {
  ts: number;
  markdown: string;
  activityCount: number;
}

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

function cacheKey(weekStart: Date): string {
  const y = weekStart.getFullYear();
  const m = String(weekStart.getMonth() + 1).padStart(2, '0');
  const d = String(weekStart.getDate()).padStart(2, '0');
  return `${CACHE_PREFIX}${y}-${m}-${d}`;
}

function readCache(weekStart: Date): CachedReport | null {
  try {
    const raw = localStorage.getItem(cacheKey(weekStart));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedReport;
    if (parsed && typeof parsed.markdown === 'string' && parsed.markdown.length > 0) return parsed;
  } catch {
    /* ignore malformed cache */
  }
  return null;
}

function rangeLabel(weekStart: Date, weekEnd: Date, locale: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const loc = locale === 'zh-Hans' ? 'zh-CN' : 'en-US';
  return `${weekStart.toLocaleDateString(loc, opts)} – ${weekEnd.toLocaleDateString(loc, opts)}`;
}

function buildPrompt(
  weekStart: Date,
  weekEnd: Date,
  activities: WeeklyReportActivity[],
  completedCount: number,
  totalCount: number,
  locale: string,
): string {
  const lines = activities.map((a) => {
    const when = new Date(a.scheduledAt).toLocaleDateString(locale === 'zh-Hans' ? 'zh-CN' : 'en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
    const parts = [
      `- [${a.status}] ${a.type} · ${a.title} (${when})`,
      a.accountName ? `account: ${a.accountName}` : '',
      a.opportunityName ? `opportunity: ${a.opportunityName}` : '',
      a.notes ? `notes: ${a.notes}` : '',
    ].filter(Boolean);
    return parts.join(' · ');
  }).join('\n');

  const range = rangeLabel(weekStart, weekEnd, locale);

  if (locale === 'zh-Hans') {
    return `根据下面这一周（${range}）的活动列表，生成一份简洁的销售周报。共 ${totalCount} 个活动，已完成 ${completedCount} 个。

活动列表：
${lines || '（本周暂无活动）'}

请用纯 Markdown 输出，包含以下小节（用 ### 标题）：
### 本周概况
### 关键成果
### 未完成与逾期
### 下周建议

要求：提到具体客户/商机名称；条目用无序列表；不要输出 JSON 或代码块；语气专业简洁。`;
  }

  return `Using the activity list for this week (${range}), write a concise sales weekly report. ${totalCount} activities total, ${completedCount} completed.

Activities:
${lines || '(no activities this week)'}

Respond in plain Markdown with these sections (use ### headings):
### Overview
### Key Wins
### Pending & Overdue
### Next Week

Requirements: reference specific account/opportunity names; use bulleted lists; no JSON or code fences; professional and concise.`;
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
  const weekKey = cacheKey(weekStart);
  useEffect(() => {
    const cached = readCache(weekStart);
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
      const prompt = buildPrompt(ws, we, acts, cc, tc, loc);
      const { executeFunction } = await import('@/lib/function-executor');
      const result = await executeFunction('generateEntitySummary', {
        data: prompt,
        entityType: 'activity',
      }, { locale: loc });

      if (result.success && typeof result.data === 'string' && result.data.trim().length > 0) {
        const md = result.data.trim();
        const ts = Date.now();
        setMarkdown(md);
        setGeneratedAt(ts);
        setIsExpanded(true);
        try {
          const payload: CachedReport = { ts, markdown: md, activityCount: acts.length };
          localStorage.setItem(cacheKey(ws), JSON.stringify(payload));
        } catch {
          /* storage full / unavailable — keep in-memory result */
        }
      } else {
        console.error('[WeeklyReport] generation failed:', result.error);
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
                rangeLabel(weekStart, weekEnd, locale)
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
