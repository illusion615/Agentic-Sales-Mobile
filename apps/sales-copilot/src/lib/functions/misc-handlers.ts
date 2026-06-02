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

const suggestPlan: FunctionHandler = async (args, ctx) => {
  const targetDate = args.targetDate as string || new Date().toISOString().split('T')[0];
  const period = args.period as string || 'day';
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
  const targetEnd = period === 'week'
    ? new Date(targetStart.getTime() + 7 * 24 * 60 * 60 * 1000)
    : new Date(targetStart.getTime() + 24 * 60 * 60 * 1000);
  const existingActivities = allActivities.filter((a) => {
    const d = new Date(a.scheduleddate);
    return d >= targetStart && d < targetEnd;
  });

  const allAccounts = await AccountService.getAll();
  const accountsNeedingContact = allAccounts.slice(0, 10);

  const recentHistory = (ctx.conversationHistory || []).slice(-4)
    .map((m) => `${m.role}: ${m.content.slice(0, 300)}`).join('\n');

  const isZh = (ctx.locale || 'en') === 'zh-Hans';
  const systemPrompt = isZh
    ? `你是一个资深销售教练。基于以下数据为销售代表规划 ${targetDate} ${period === 'week' ? '起一周' : '当天'}的工作计划。\n\n要求：\n- 生成最多 ${maxTasks} 个具体的、可操作的任务建议\n- 优先级排序：到期商机跟进 > 长期未联系客户回访 > 高价值商机推进 > 例行维护\n- 避免和已有活动冲突${focus ? `\n- 重点方向：${focus}` : ''}\n\n返回严格按以下 JSON schema 输出（外层是对象，suggestions 是数组）：\n{"suggestions":[{"title":"具体标题","type":"visit|call|meeting|email|other","accountName":"客户名称","scheduledDate":"YYYY-MM-DD","notes":"业务理由"}]}\n\n所有字段必填，title 不能为空，notes 必须给出具体的业务理由。只返回 JSON 对象，不要 markdown，不要解释。`
    : `You are a senior sales coach. Based on the data below, plan ${period === 'week' ? 'a week of' : ''} tasks for ${targetDate}.\n\nRequirements:\n- Generate up to ${maxTasks} specific, actionable task suggestions\n- Priority order: urgent opportunity follow-ups > long-overdue client revisits > high-value pipeline progression > routine maintenance\n- Avoid conflicts with existing activities${focus ? `\n- Focus area: ${focus}` : ''}\n\nReturn strictly: {"suggestions":[{"title":"...","type":"visit|call|meeting|email|other","accountName":"...","scheduledDate":"YYYY-MM-DD","notes":"..."}]}\n\nAll fields required. Return only JSON, no markdown.`;

  const dataPayload = `Pipeline (${activeOpps.length} active opportunities):\n${JSON.stringify(activeOpps.map((o) => ({
    name: o.name1, account: o.account?.name1, amount: o.totalamount,
    stage: o.stage, confidence: o.confidence, closeDate: o.expectedclosedate,
    blocker: o.blocker, lastAction: o.lastaction,
  })), null, 0).slice(0, 2000)}\n\nExisting activities for ${targetDate}${period === 'week' ? ' week' : ''}:\n${JSON.stringify(existingActivities.map((a) => ({
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
          scheduledDate: s.scheduledDate || targetDate, notes: s.notes || '', temporalMode: 'planned',
        },
        batchIndex: idx, reason: s.notes || '',
      })),
    },
    message: isZh
      ? `基于您的 pipeline 和客户数据，为 ${targetDate} 规划了 ${Math.min(suggestions.length, maxTasks)} 个建议任务：`
      : `Based on your pipeline and client data, ${Math.min(suggestions.length, maxTasks)} tasks suggested for ${targetDate}:`,
  };
};

registerHandlers({
  queryCopilotStudio,
  externalKnowledgeQuery: queryCopilotStudio, // alias
  suggestPlan,
});
