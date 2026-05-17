/**
 * Copilot Studio context builder.
 *
 * Boss directive: ALL product-knowledge queries must route through Copilot
 * Studio (never Dataverse), and the payload sent to CS must carry enough
 * context for the bot to disambiguate intent. This module produces a single
 * self-contained string that prefixes the user's question with the relevant
 * page / account / product / conversation context.
 *
 * The output is intentionally plain text (not JSON) so any Copilot Studio
 * topic / generative-AI node can consume it without parser changes.
 */

export interface CSContextInput {
  /** Original user question, verbatim. */
  userQuery: string;
  /** Locale for the context header (defaults to en-US). */
  locale?: string;
  /** Page context (currentPage, summary, pageData) from copilot-context. */
  pageContext?: {
    currentPage?: string;
    summary?: string;
    pageData?: unknown;
  };
  /** Recent conversation turns; we include up to the last 3 user/assistant pairs. */
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Current user, if known. */
  user?: { id?: string; email?: string };
}

/**
 * Pick the most useful fields from pageData for CS context. We avoid dumping
 * the entire object (it can be many KB) — Copilot Studio token budget is
 * limited and noisy context hurts intent recognition.
 */
function summarizePageData(pageData: unknown): string {
  if (!pageData || typeof pageData !== 'object') return '';
  const data = pageData as Record<string, unknown>;
  const interesting: Array<[string, unknown]> = [];

  const keys = [
    'productName', 'productId', 'productCategory', 'productLine',
    'accountName', 'accountId',
    'opportunityName', 'opportunityId',
    'contactName', 'contactId',
    'activityTitle', 'activityType',
  ];
  for (const k of keys) {
    const v = data[k];
    if (v !== undefined && v !== null && v !== '') {
      interesting.push([k, v]);
    }
  }
  if (interesting.length === 0) return '';
  return interesting.map(([k, v]) => `${k}=${String(v)}`).join('; ');
}

/**
 * Trim a single turn's content so the context block stays compact.
 */
function clip(text: string, max: number): string {
  if (!text) return '';
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

/**
 * Build a CS-ready query string.
 *
 * Format (en-US):
 *   [Context]
 *   Locale: en-US
 *   Page: Product Detail (productName=UltraVision X1; productId=...)
 *   Account in focus: King's College Hospital
 *   Recent dialog:
 *     - user: tell me about its specs
 *     - assistant: ...
 *   [User question]
 *   <verbatim user query>
 */
export function buildCSQuery(input: CSContextInput): string {
  const isZh = (input.locale || 'en-US') === 'zh-Hans';
  const lines: string[] = [];

  lines.push(isZh ? '[上下文]' : '[Context]');
  lines.push(`${isZh ? '语言' : 'Locale'}: ${input.locale || 'en-US'}`);

  if (input.pageContext) {
    const { currentPage, summary, pageData } = input.pageContext;
    if (currentPage) {
      const pd = summarizePageData(pageData);
      lines.push(`${isZh ? '当前页面' : 'Page'}: ${currentPage}${pd ? ` (${pd})` : ''}`);
    }
    if (summary) {
      lines.push(`${isZh ? '页面摘要' : 'Page summary'}: ${clip(summary, 200)}`);
    }
  }

  if (input.user?.email) {
    lines.push(`${isZh ? '当前用户' : 'User'}: ${input.user.email}`);
  }

  // Recent dialog: last 3 turns (max), each trimmed to 160 chars.
  // This gives CS enough context to resolve pronouns like "it" or "that one"
  // without exploding the token budget.
  const history = input.conversationHistory || [];
  if (history.length > 0) {
    const tail = history.slice(-3);
    lines.push(isZh ? '最近对话:' : 'Recent dialog:');
    for (const turn of tail) {
      lines.push(`  - ${turn.role}: ${clip(turn.content, 160)}`);
    }
  }

  lines.push('');
  lines.push(isZh ? '[用户问题]' : '[User question]');
  lines.push(input.userQuery);

  return lines.join('\n');
}
