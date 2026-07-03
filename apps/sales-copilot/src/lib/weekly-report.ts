/**
 * Shared weekly-report generation + persistence (D16 + D9).
 *
 * This is the single source of truth used by BOTH:
 *  - the Activities week-view card (`weekly-report-card.tsx`), and
 *  - the Copilot chat short-circuit (`copilot-agent.ts`) that lets the user ask
 *    "generate a weekly report for <period>" and see the result in the chat.
 *
 * Reports are generated from a week's activities and cached per-week in
 * localStorage, keyed by the week's start date, so the card and the chat share
 * the exact same stored report.
 *
 * React-free on purpose so non-component callers (the agent) can use it too.
 */
import { startOfWeek } from 'date-fns/startOfWeek';
import { endOfWeek } from 'date-fns/endOfWeek';
import { addWeeks } from 'date-fns/addWeeks';
import { getWeekStartDay, localeBcp47, outputLanguageDirective, type Locale } from '@/lib/i18n';

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

export interface CachedWeeklyReport {
  ts: number;
  markdown: string;
  activityCount: number;
}

/** Resolve the [start, end] of the week containing `date`, honoring the user's week-start setting. */
export function resolveWeek(date: Date): { weekStart: Date; weekEnd: Date } {
  const wso = getWeekStartDay() === 'monday' ? 1 : 0;
  return {
    weekStart: startOfWeek(date, { weekStartsOn: wso as 0 | 1 }),
    weekEnd: endOfWeek(date, { weekStartsOn: wso as 0 | 1 }),
  };
}

export function weeklyReportCacheKey(weekStart: Date): string {
  const y = weekStart.getFullYear();
  const m = String(weekStart.getMonth() + 1).padStart(2, '0');
  const d = String(weekStart.getDate()).padStart(2, '0');
  return `${CACHE_PREFIX}${y}-${m}-${d}`;
}

export function readWeeklyReport(weekStart: Date): CachedWeeklyReport | null {
  try {
    const raw = localStorage.getItem(weeklyReportCacheKey(weekStart));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedWeeklyReport;
    if (parsed && typeof parsed.markdown === 'string' && parsed.markdown.length > 0) return parsed;
  } catch {
    /* ignore malformed cache */
  }
  return null;
}

export function writeWeeklyReport(weekStart: Date, markdown: string, activityCount: number): CachedWeeklyReport {
  const payload: CachedWeeklyReport = { ts: Date.now(), markdown, activityCount };
  try {
    localStorage.setItem(weeklyReportCacheKey(weekStart), JSON.stringify(payload));
  } catch {
    /* storage full / unavailable — caller keeps the in-memory result */
  }
  return payload;
}

export function weekRangeLabel(weekStart: Date, weekEnd: Date, locale: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const loc = localeBcp47(locale as Locale);
  return `${weekStart.toLocaleDateString(loc, opts)} – ${weekEnd.toLocaleDateString(loc, opts)}`;
}

export function buildWeeklyReportPrompt(
  weekStart: Date,
  weekEnd: Date,
  activities: WeeklyReportActivity[],
  completedCount: number,
  totalCount: number,
  locale: string,
): string {
  const lines = activities.map((a) => {
    const when = new Date(a.scheduledAt).toLocaleDateString(localeBcp47(locale as Locale), {
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

  const range = weekRangeLabel(weekStart, weekEnd, locale);

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

Requirements: reference specific account/opportunity names; use bulleted lists; no JSON or code fences; professional and concise.

${outputLanguageDirective(locale as Locale)}`;
}

/**
 * Generate the weekly-report markdown for a week and persist it under that
 * week's cache key. Returns the markdown, or null on failure.
 */
export async function generateWeeklyReportMarkdown(params: {
  weekStart: Date;
  weekEnd: Date;
  activities: WeeklyReportActivity[];
  completedCount: number;
  totalCount: number;
  locale: string;
}): Promise<string | null> {
  const { weekStart, weekEnd, activities, completedCount, totalCount, locale } = params;
  const prompt = buildWeeklyReportPrompt(weekStart, weekEnd, activities, completedCount, totalCount, locale);
  const { executeFunction } = await import('@/lib/function-executor');
  const result = await executeFunction('generateEntitySummary', {
    data: prompt,
    entityType: 'activity',
  }, { locale });

  if (result.success && typeof result.data === 'string' && result.data.trim().length > 0) {
    const md = result.data.trim();
    writeWeeklyReport(weekStart, md, activities.length);
    return md;
  }
  console.error('[WeeklyReport] generation failed:', result.error);
  return null;
}

/** Matches an explicit weekly-report request in the chat (en + zh). */
export const WEEKLY_REPORT_PATTERN =
  /weekly\s*report|week(?:ly)?\s*(?:summary|review|recap)|周报|周总结|周工作总结|本周(?:报告|总结)|上周(?:报告|总结)|这一?周的?(?:报告|总结)|上一?周的?(?:报告|总结)/i;

/**
 * Resolve which week a chat report request refers to. Defaults to the current
 * week. Supports this/last/N-weeks-ago and an explicit ISO date (yyyy-mm-dd).
 */
export function resolveReportWeekFromMessage(message: string, now: Date = new Date()): { weekStart: Date; weekEnd: Date } {
  const m = message.toLowerCase();

  // Explicit ISO date → the week containing it.
  const iso = m.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!Number.isNaN(d.getTime())) return resolveWeek(d);
  }

  // "上上周" / "two weeks ago" → 2 weeks back.
  if (/上上周|前两周|two\s+weeks\s+ago|2\s+weeks\s+ago/.test(m)) {
    return resolveWeek(addWeeks(now, -2));
  }
  // "last week" / "上周" / "上星期" → previous week.
  if (/last\s+week|previous\s+week|上周|上星期|上个星期|上一周/.test(m)) {
    return resolveWeek(addWeeks(now, -1));
  }
  // "next week" / "下周" → next week.
  if (/next\s+week|下周|下星期|下个星期|下一周/.test(m)) {
    return resolveWeek(addWeeks(now, 1));
  }

  // "this week" / "本周" / default.
  return resolveWeek(now);
}
