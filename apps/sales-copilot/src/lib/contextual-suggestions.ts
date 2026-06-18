import type { Locale } from '@/lib/i18n';

/**
 * A tappable suggestion pill shown above the copilot composer.
 *
 * `text`  — SHORT label (≤6 Chinese chars / ≤3 English words). What the user sees.
 * `query` — the FULL natural-language intent sent to the agent on tap. Keeping the
 *           long instruction here (not in the label) is the UX trade-off that lets
 *           pills stay one line on mobile while still carrying a precise request.
 * `action`— optional direct-execute hook; when present the pill runs the function
 *           immediately instead of round-tripping the query through the LLM.
 */
export interface SuggestionPill {
  text: string;
  query: string;
  action?: { function: string; arguments: Record<string, unknown> };
}

const isZh = (l: Locale) => l === 'zh-Hans';

/** Empty-conversation starter pills (panel just opened, no messages yet). */
function starterPills(locale: Locale): SuggestionPill[] {
  const zh = isZh(locale);
  return [
    { text: zh ? '今日待办' : "Today's tasks", query: zh ? '今天有哪些待办事项？' : 'What are my tasks for today?' },
    { text: zh ? '商机总览' : 'Pipeline', query: zh ? '我的商机总览' : 'Show my pipeline overview' },
    { text: zh ? '新建拜访' : 'New visit', query: zh ? '帮我新建一条拜访记录' : 'Create a new visit record for me' },
    { text: zh ? '客户跟进' : 'Follow-ups', query: zh ? '哪些客户需要跟进？' : 'Which customers need follow-up?' },
  ];
}

/** Generic fallback when the last turn wasn't a recognizable query. */
function fallbackPills(locale: Locale): SuggestionPill[] {
  const zh = isZh(locale);
  return [
    { text: zh ? '更多详情' : 'More details', query: zh ? '告诉我更多详情' : 'Tell me more details' },
    { text: zh ? '今日待办' : "Today's tasks", query: zh ? '今天有哪些待办事项？' : 'What are my tasks for today?' },
    { text: zh ? '帮助' : 'Help', query: zh ? '你能帮我做什么？' : 'What can you help me with?' },
  ];
}

/**
 * Follow-up pills keyed by the function the last agent turn executed. These are
 * the contextual focus-dimensions a salesperson most likely wants next after
 * seeing a list — e.g. after listing opportunities: prioritize by value, what's
 * closing soon, hot negotiations, records needing attention.
 */
function followupsByFunction(fn: string, locale: Locale): SuggestionPill[] | null {
  const zh = isZh(locale);
  switch (fn) {
    case 'queryOpportunities':
      return [
        { text: zh ? '高价值优先' : 'Top value', query: zh ? '按金额从高到低排列我的商机' : 'List my opportunities by amount, highest first' },
        { text: zh ? '临近成交' : 'Closing soon', query: zh ? '哪些商机预计30天内成交？' : 'Which opportunities are expected to close within 30 days?' },
        { text: zh ? '高信心谈判' : 'Hot deals', query: zh ? '列出谈判阶段且信心度高于70%的商机' : 'List negotiation-stage opportunities with confidence above 70%' },
        { text: zh ? '待补全' : 'Needs attention', query: zh ? '列出缺少预计成交日期或信心度的商机' : 'List opportunities missing a close date or confidence' },
      ];
    case 'queryAccounts':
      return [
        { text: zh ? '需跟进' : 'Follow-ups', query: zh ? '哪些客户需要跟进？' : 'Which clients need follow-up?' },
        { text: zh ? '本周未联系' : 'Not contacted', query: zh ? '本周还没联系过的客户' : 'Clients not contacted this week' },
        { text: zh ? '重点客户' : 'Key accounts', query: zh ? '按商机金额列出最重要的客户' : 'List top clients by opportunity value' },
      ];
    case 'queryActivities':
      return [
        { text: zh ? '今日安排' : 'Today', query: zh ? '今天有哪些活动安排？' : "What's on my schedule today?" },
        { text: zh ? '逾期未办' : 'Overdue', query: zh ? '列出逾期未完成的活动' : 'List overdue, incomplete activities' },
        { text: zh ? '本周拜访' : 'This week', query: zh ? '本周的拜访活动' : 'Visits scheduled this week' },
      ];
    case 'queryContacts':
      return [
        { text: zh ? '缺联系方式' : 'Missing info', query: zh ? '哪些联系人缺少邮箱或电话？' : 'Which contacts are missing an email or phone?' },
        { text: zh ? '按客户看' : 'By account', query: zh ? '按客户分组显示联系人' : 'Group contacts by client' },
        { text: zh ? '最近新增' : 'Recent', query: zh ? '最近新增的联系人' : 'Recently added contacts' },
      ];
    default:
      return null;
  }
}

/**
 * Single source of truth for the composer suggestion pills.
 *
 * Priority:
 *   1. No messages yet → starter pills.
 *   2. Last agent turn called a recognizable query function → contextual
 *      follow-ups for that entity (the "based on the latest message state"
 *      behaviour the business wants).
 *   3. Otherwise → generic fallback.
 *
 * Pure + synchronous so it can be called directly from render.
 */
export function getContextualSuggestions(opts: {
  hasMessages: boolean;
  lastFunctionCalled?: string;
  locale: Locale;
}): SuggestionPill[] {
  const { hasMessages, lastFunctionCalled, locale } = opts;
  if (!hasMessages) return starterPills(locale);
  if (lastFunctionCalled) {
    const followups = followupsByFunction(lastFunctionCalled, locale);
    if (followups) return followups;
  }
  return fallbackPills(locale);
}
