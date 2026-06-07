/**
 * Misc handlers — queryCopilotStudio / externalKnowledgeQuery / suggestPlan
 */

import { OpportunityService } from '@/generated/services/opportunity-service';
import { ActivityService } from '@/generated/services/activity-service';
import { AccountService } from '@/generated/services/account-service';
import { buildCSQuery } from '../cs-context-builder';
import { getCopilotConfig, saveCopilotConfig, isCopilotStudioAvailable, COPILOT_STUDIO_AGENT_NAME } from '@/services/copilot-service';
import { MicrosoftCopilotStudioService } from '@/generated/services/MicrosoftCopilotStudioService';
import { registerHandlers, type FunctionHandler } from './handler-registry';

const queryCopilotStudio: FunctionHandler = async (args, ctx) => {
  const query = (args.query as string) || (ctx.conversationHistory?.filter(m => m.role === 'user').pop()?.content) || '';
  console.log('[CS] ENTER queryCopilotStudio, query=' + query);
  if (!query) return { success: false, error: '缺少 query 参数' };

  const enrichedQuery = buildCSQuery({
    userQuery: query, locale: ctx.locale, pageContext: ctx.pageContext,
    conversationHistory: ctx.conversationHistory,
    user: { id: ctx.userId, email: ctx.userEmail },
  });
  console.log('[CS] enriched query length:', enrichedQuery.length, 'preview:', enrichedQuery.slice(0, 200));

  if (!isCopilotStudioAvailable()) {
    console.log('[CS] NOT AVAILABLE - connector not ready');
    return { success: false, error: 'Copilot Studio 连接器未就绪' };
  }

  try {
    const csConfig = getCopilotConfig();
    console.log('[CS] Calling MicrosoftCopilotStudioService.ExecuteCopilotAsyncV2...');
    const result = await MicrosoftCopilotStudioService.ExecuteCopilotAsyncV2(
      csConfig?.agentName || COPILOT_STUDIO_AGENT_NAME,
      { message: enrichedQuery, notificationUrl: 'https://notificationurlplaceholder' },
    );

    if (!result.success) {
      console.error('[CS] SDK connector error:', result.error);
      return { success: false, error: result.error?.message ?? 'Copilot Studio 调用失败' };
    }

    const responseData = result.data as unknown as { lastResponse?: string; responses?: string[]; conversationId?: string } | undefined;
    const answer = responseData?.lastResponse || responseData?.responses?.join('\n\n') || '';
    const conversationId = responseData?.conversationId;
    console.log('[CS] FINAL answer length:', answer.length, 'conversationId:', conversationId);

    if (conversationId && csConfig) saveCopilotConfig({ ...csConfig, conversationId });

    return {
      success: true,
      data: { answer: answer || '(no reply)', source: 'Copilot Studio', conversationId },
    };
  } catch (sdkError: unknown) {
    console.error('[CS] Copilot Studio SDK error:', sdkError);
    return { success: false, error: sdkError instanceof Error ? sdkError.message : 'Copilot Studio 请求失败' };
  }
};

/**
 * Resolve how many days the planning window spans, from a loose `period` value.
 * Accepts: "day"/"today"/"单日" → 1; "week"/"本周"/"this week" → 7;
 * "month"/"本月" → 30; a date-range string "YYYY-MM-DD to YYYY-MM-DD" → inclusive
 * day count; or a bare number of days. Defaults to a 7-day week (a plan should
 * span more than one day). Capped at 31 to keep the prompt bounded. (Defect D8)
 */
function resolveWindowDays(period: string): number {
  const p = (period || '').toLowerCase().trim();
  if (/^(day|today|tomorrow|单日|今天|明天)$/.test(p)) return 1;
  if (/(month|本月|这个月|当月)/.test(p)) return 30;
  if (/(week|本周|这周|这个星期|一周)/.test(p)) return 7;
  // Date-range "YYYY-MM-DD ... YYYY-MM-DD" (to / – / ~ / 至).
  const dates = p.match(/\d{4}-\d{2}-\d{2}/g);
  if (dates && dates.length >= 2) {
    const a = new Date(dates[0] + 'T00:00:00');
    const b = new Date(dates[1] + 'T00:00:00');
    const days = Math.round((b.getTime() - a.getTime()) / 86400000) + 1; // inclusive
    if (days >= 1) return Math.min(days, 31);
  }
  // Bare number of days ("3", "5 days", "7天").
  const num = p.match(/(\d+)\s*(day|days|天)?/);
  if (num) {
    const n = parseInt(num[1], 10);
    if (n >= 1) return Math.min(n, 31);
  }
  return 7; // default: a week
}

const suggestPlan: FunctionHandler = async (args, ctx) => {
  // Default the planning window to start TOMORROW (not today) — a plan of
  // today-only tasks is not a plan. Users can still reschedule per-card.
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const isoDay = (d: Date) => d.toISOString().split('T')[0];
  const targetDate = args.targetDate as string || isoDay(tomorrow);
  const period = args.period as string || 'week';
  const focus = args.focus as string || '';
  const maxTasks = (args.maxTasks as number) || 5;

  const allOpps = await OpportunityService.getAll();
  const activeOpps = allOpps
    .filter((o) => o.stage !== 'won' && o.stage !== 'lost')
    .sort((a, b) => {
      const da = a.expectedclosedate ? new Date(a.expectedclosedate).getTime() : Infinity;
      const db = b.expectedclosedate ? new Date(b.expectedclosedate).getTime() : Infinity;
      return da - db;
    })
    .slice(0, 15);

  const allActivities = await ActivityService.getAll();
  const targetStart = new Date(targetDate + 'T00:00:00');
  // Resolve the planning window length (Defect D8). The Orchestrator no longer
  // always passes the literal "week"/"day" — it often sends a date-range string
  // like "2026-06-07 to 2026-06-13" or a localized phrase. The old check
  // `period === 'week' ? 7 : 1` collapsed every non-"week" value to a SINGLE day,
  // so the plan produced only one activity. Parse robustly and default to a week.
  const windowDays = resolveWindowDays(period);
  const targetEnd = new Date(targetStart.getTime() + windowDays * 24 * 60 * 60 * 1000);
  const existingActivities = allActivities.filter((a) => {
    const d = new Date(a.scheduleddate);
    return d >= targetStart && d < targetEnd;
  });

  // Per-day schedule load (existing activities ≈ the user's calendar) so the LLM
  // can spread suggestions onto lighter days and avoid double-booking.
  const dayLoad: Record<string, number> = {};
  const windowDates: string[] = [];
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(targetStart.getTime() + i * 24 * 60 * 60 * 1000);
    const key = isoDay(d);
    windowDates.push(key);
    dayLoad[key] = 0;
  }
  for (const a of existingActivities) {
    const key = isoDay(new Date(a.scheduleddate));
    if (key in dayLoad) dayLoad[key] += 1;
  }
  const weekdayName = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString(ctx.locale === 'zh-Hans' ? 'zh-CN' : 'en-US', { weekday: 'short' });
  const scheduleLoadStr = windowDates
    .map((d) => `${d} (${weekdayName(d)}): ${dayLoad[d]} booked`)
    .join('; ');

  const allAccounts = await AccountService.getAll();
  const accountsNeedingContact = allAccounts.slice(0, 10);

  const recentHistory = (ctx.conversationHistory || []).slice(-4)
    .map((m) => `${m.role}: ${m.content.slice(0, 300)}`).join('\n');

  const isZh = (ctx.locale || 'en') === 'zh-Hans';
  const firstDate = windowDates[0];
  const lastDate = windowDates[windowDates.length - 1];
  const systemPrompt = isZh
    ? `你是一个资深销售教练。今天是 ${isoDay(today)}（${weekdayName(isoDay(today))}）。请基于以下数据，为销售代表在 ${firstDate} 到 ${lastDate} 这个区间内规划工作计划。\n\n排程要求（重要）：\n- 生成最多 ${maxTasks} 个具体、可操作的任务，并把它们**分散到区间内的不同日期**，不要全部排在同一天。\n- 排期依据：(1) 商机紧迫度——expectedclosedate 越近、金额越大、信心度越低或有 blocker 的，越要尽早安排；(2) 日程负载——优先安排到 booked 数量较少的日期，避免与已有活动冲突。\n- 每天的现有日程负载见下方 [Schedule load]。已经很满的日期尽量少排或不排。\n- 每个任务的 notes 必须用一句话解释**为什么排这一天**（结合商机进度/紧迫度/日程空档），例如"协和招标 6/12 截止，且本周三日程较空，故安排周二谈判会议"。\n\n优先级：到期商机跟进 > 长期未联系客户回访 > 高价值商机推进 > 例行维护${focus ? `\n- 重点方向：${focus}` : ''}\n\n返回严格按以下 JSON：\n{"suggestions":[{"title":"具体标题","type":"visit|call|meeting|email|other","accountName":"客户名称","scheduledDate":"YYYY-MM-DD","notes":"包含排程理由的业务说明"}]}\n\n所有字段必填，scheduledDate 必须落在 ${firstDate} 到 ${lastDate} 之间，notes 必须包含排程理由。只返回 JSON，不要 markdown。`
    : `You are a senior sales coach. Today is ${isoDay(today)} (${weekdayName(isoDay(today))}). Plan tasks for the rep across the window ${firstDate} to ${lastDate}.\n\nScheduling requirements (important):\n- Generate up to ${maxTasks} specific, actionable tasks and **spread them across different dates** in the window — do NOT pile everything on one day.\n- Date assignment is based on: (1) opportunity urgency — sooner expectedclosedate, larger amount, lower confidence, or named blocker → schedule earlier; (2) schedule load — prefer days with fewer booked activities to avoid conflicts.\n- The current per-day load is in [Schedule load] below. Avoid days that are already busy.\n- Each task's notes MUST include one sentence explaining **why that date** (tying it to deal progress / urgency / an open slot), e.g. "Peking Union tender closes 6/12 and Wed is light, so the negotiation meeting is set for Tue".\n\nPriority: urgent opportunity follow-ups > long-overdue client revisits > high-value pipeline progression > routine maintenance${focus ? `\n- Focus area: ${focus}` : ''}\n\nReturn strictly: {"suggestions":[{"title":"...","type":"visit|call|meeting|email|other","accountName":"...","scheduledDate":"YYYY-MM-DD","notes":"business note that includes the scheduling rationale"}]}\n\nAll fields required. scheduledDate MUST fall within ${firstDate}..${lastDate}. notes MUST include the scheduling rationale. Return only JSON, no markdown.`;

  const dataPayload = `Pipeline (${activeOpps.length} active opportunities):\n${JSON.stringify(activeOpps.map((o) => ({
    name: o.name1, account: o.account?.name1, amount: o.totalamount,
    stage: o.stage, confidence: o.confidence, closeDate: o.expectedclosedate,
    blocker: o.blocker, lastAction: o.lastaction,
  })), null, 0).slice(0, 2000)}\n\n[Schedule load] existing activities per day in the window (avoid busy days):\n${scheduleLoadStr}\n\nExisting activities (${firstDate}..${lastDate}):\n${JSON.stringify(existingActivities.map((a) => ({
    title: a.title, type: a.type, account: a.account?.name1, date: a.scheduleddate,
  })), null, 0).slice(0, 1000)}\n\nAccounts needing contact:\n${JSON.stringify(accountsNeedingContact.map((a) => ({
    name: a.name1, industry: a.industry,
  })), null, 0).slice(0, 800)}\n\nRecent conversation:\n${recentHistory.slice(0, 500)}`;

  const { invokeFlowForLLM } = await import('@/services/power-automate-service');
  const llmResp = await invokeFlowForLLM({
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: dataPayload }],
    responseFormat: 'text',
  });

  if (!llmResp.success || !llmResp.content) return { success: false, error: llmResp.error || 'LLM failed to generate plan' };

  type Suggestion = { title: string; type: string; accountName: string; scheduledDate: string; notes: string };
  const extractArray = (parsed: unknown): Suggestion[] | null => {
    if (Array.isArray(parsed)) return parsed as Suggestion[];
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      for (const key of ['suggestions', 'tasks', 'items', 'plan', 'data', 'result', 'results']) {
        const v = obj[key];
        if (Array.isArray(v)) return v as Suggestion[];
      }
      for (const v of Object.values(obj)) {
        if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null) return v as Suggestion[];
      }
    }
    return null;
  };

  let suggestions: Suggestion[] | null = null;
  try { suggestions = extractArray(JSON.parse(llmResp.content)); } catch {
    const jsonMatch = llmResp.content.match(/\[[\s\S]*\]/);
    if (jsonMatch) try { suggestions = JSON.parse(jsonMatch[0]) as Suggestion[]; } catch { /* fall through */ }
  }
  if (!suggestions || suggestions.length === 0) {
    console.warn('[suggestPlan] Failed to extract suggestions:', llmResp.content.slice(0, 500));
    return { success: false, error: 'Failed to parse plan suggestions' };
  }
  suggestions = suggestions.filter((s) => s && typeof s.title === 'string' && s.title.trim().length > 0);
  if (suggestions.length === 0) return { success: false, error: 'LLM returned suggestions but none had a title' };

  return {
    success: true,
    data: {
      type: 'batch' as const,
      items: suggestions.slice(0, maxTasks).map((s, idx) => ({
        type: 'activity' as const, isNew: true,
        data: {
          title: s.title, type: s.type || 'visit', accountName: s.accountName || '',
          // Fallback: if the LLM omits a date, spread tasks across the window
          // (one per day) instead of dumping them all on the first day.
          scheduledDate: s.scheduledDate || windowDates[Math.min(idx, windowDates.length - 1)],
          notes: s.notes || '', temporalMode: 'planned',
        },
        batchIndex: idx, reason: s.notes || '',
      })),
    },
    message: isZh
      ? `基于您的 pipeline 进度和现有日程，为 ${firstDate} 至 ${lastDate} 规划了 ${Math.min(suggestions.length, maxTasks)} 个建议任务：`
      : `Based on your pipeline progress and existing schedule, ${Math.min(suggestions.length, maxTasks)} tasks planned for ${firstDate}–${lastDate}:`,
  };
};

registerHandlers({
  queryCopilotStudio,
  externalKnowledgeQuery: queryCopilotStudio, // alias
  suggestPlan,
});
