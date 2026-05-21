/**
 * Frame Shadow Layer (方案 3 · Phase 1)
 * --------------------------------------------------------------------------
 * A second, independent LLM call that thinks like a senior CRM sales coach.
 * It does NOT replace the legacy intent prompt; it runs in parallel,
 * produces a structured "what is this person actually doing?" answer, and
 * gets logged to a ring buffer so we can compare against the legacy output.
 *
 * Design intent (do not enumerate keywords / verbs here):
 *   The Frame prompt asks the LLM three questions a sales coach would ask:
 *     1. Which sales object is this about? (Account / Contact / Opportunity /
 *        Activity / Product / Mixed / None)
 *     2. Which cognitive task is the user asking for? (Log / Plan / Find /
 *        Update / Recommend / Knowledge / Report / Chat)
 *     3. Which entities are already bound by the page they're on?
 *   No rule list, no verb enumeration, no regex — the model uses domain sense.
 *
 * This file is self-contained. Nothing in production reads its output yet.
 * The viewer component (frame-shadow-viewer.tsx) renders the ring buffer for
 * boss-facing inspection.
 */

import { z } from 'zod';
import { invokeFlowForLLM } from '@/services/power-automate-service';
import { getLocale } from '@/lib/i18n';

// ----------------------------- Schema ------------------------------------

export const FrameSalesObjectSchema = z.enum([
  'Account',
  'Contact',
  'Opportunity',
  'Activity',
  'Product',
  'Mixed',
  'None',
]);
export type FrameSalesObject = z.infer<typeof FrameSalesObjectSchema>;

export const FrameCognitiveTaskSchema = z.enum([
  'Log',
  'Plan',
  'Find',
  'Update',
  'Recommend',
  'Knowledge',
  'Report',
  'Chat',
]);
export type FrameCognitiveTask = z.infer<typeof FrameCognitiveTaskSchema>;

export const FrameBoundEntitySchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
  })
  .nullable();

export const FrameExplicitNameSchema = z.object({
  kind: z.enum(['account', 'contact', 'opportunity', 'product']),
  text: z.string(),
});

export const FrameResultSchema = z.object({
  salesObject: FrameSalesObjectSchema,
  cognitiveTask: FrameCognitiveTaskSchema,
  temporal: z.enum(['past', 'future', 'none']),
  boundEntities: z
    .object({
      account: FrameBoundEntitySchema.optional(),
      opportunity: FrameBoundEntitySchema.optional(),
      contact: FrameBoundEntitySchema.optional(),
    })
    .optional(),
  explicitNames: z.array(FrameExplicitNameSchema).optional(),
  reasoning: z.string(),
  confidence: z.number().min(0).max(100),
  ambiguity: z.string().optional(),
});

export type FrameResult = z.infer<typeof FrameResultSchema>;

// ----------------------------- Prompt ------------------------------------

function buildFramePrompt(locale: 'zh-Hans' | 'en'): string {
  if (locale === 'zh-Hans') {
    return `你是一位资深的 CRM 销售教练。你的任务不是解析关键字，而是用销售常识理解销售人员的一句话，然后用极简结构把"他在说什么"输出给下游系统。

# 你的思考方式

读到销售人员的一句话时，脑子里只问三个问题：

**问题 1：他在说哪一类「销售对象」？**
销售对象的全集只有这几类：
- Account（客户/医院/公司）
- Contact（联系人/医生/采购）
- Opportunity（商机/项目/订单/招标）
- Activity（销售活动：拜访/通话/会议/邮件/演示等具体接触）
- Product（产品本身的知识/规格/功能）
- Mixed（一句话里涉及**超过一种类型的操作对象**。不要只看第一个动词。比如「记录拜访并创建一个商机」= Activity + Opportunity = Mixed。「拜访了客户，他们要建实验室，约了下周再谈」= Activity + Opportunity + Activity = Mixed。只要涉及两种以上对象，就选 Mixed。）
- None（打招呼/系统问题/闲聊）

关键：动词不是销售对象。「拜访」不是销售对象——它是 Activity 这个对象的实例。
「推荐产品」里"产品"是销售对象，"推荐"是动作。
「记录一次拜访」里 Activity 才是销售对象。
「商机页推荐产品」是 Product（用户在商机页面想让你推荐适合的产品）。

**问题 2：他要让你完成哪一类「认知任务」？**
任务的全集只有这几类：
- Log（记录已经发生的事，过去时）
- Plan（安排将要发生的事，未来时）
- Find（查找/列出已有数据）
- Update（修改已有记录的字段或状态）
- Recommend（请你根据当前情境给出销售/产品建议）
- Knowledge（问产品/行业知识，需要走知识库）
- Report（生成日报/周报/总结）
- Chat（打招呼、感谢、闲聊）

判断关键：他是在「告诉你一件已发生的事」（Log/Update）、「让你帮他做一件未来的事」（Plan）、还是「让你告诉他一件他不知道的事」（Find/Recommend/Knowledge）？

**问题 3：他当前在哪个页面？页面已经把哪些对象绑给你了？**
如果他在某客户的详情页说「加个活动」，他已经把 Account 绑好了，你不需要再让他打字。
如果他在某商机详情页说「联系人 Sarah」，他已经绑了 Opportunity 和它隶属的 Account，Sarah 是要在这个 Account 范围内去找的 Contact。

# 输出
只输出一个合法 JSON 对象，不要 markdown、不要解释、不要代码块。
{
  "salesObject": "Account|Contact|Opportunity|Activity|Product|Mixed|None",
  "cognitiveTask": "Log|Plan|Find|Update|Recommend|Knowledge|Report|Chat",
  "temporal": "past|future|none",
  "boundEntities": {
    "account": { "id": "...", "name": "..." } | null,
    "opportunity": { "id": "...", "name": "..." } | null,
    "contact": { "id": "...", "name": "..." } | null
  },
  "explicitNames": [
    { "kind": "account|contact|opportunity|product", "text": "用户原话里的名字" }
  ],
  "reasoning": "一句话写你作为销售教练为什么这么判断（不超过 30 字）",
  "confidence": 0-100,
  "ambiguity": "如果 confidence < 70 才填，一句话说不清楚在哪里"
}`;
  }

  return `You are a senior CRM sales coach. Your job is NOT to parse keywords —
it is to read what a salesperson said with domain sense, and emit a minimal
structured answer of "what they're actually doing".

# How you think

When you read one line from a salesperson, ask yourself three questions:

**Q1: Which "sales object" is this about?**
There are only seven possibilities:
- Account   (customer / hospital / company)
- Contact   (person / doctor / buyer)
- Opportunity (deal / project / tender / order)
- Activity  (a sales touch: visit / call / meeting / email / demo)
- Product   (knowledge about the product itself: specs / features)
- Mixed     (one sentence involves **more than one type of object**. Don't
            just look at the first verb. "Visited client, they want a new lab,
            schedule a follow-up next week" = Activity + Opportunity + Activity
            = Mixed. If two or more object types are involved, choose Mixed.)
- None      (greeting / system question / chitchat)

Important: verbs are NOT sales objects. "Visit" is not a sales object — it is
an instance of the Activity object. In "recommend a product", Product is the
object and "recommend" is the action. On the opportunity page, "recommend a
product" is Product (the user is on an opportunity and wants you to suggest
a fitting product).

**Q2: Which "cognitive task" is the user asking for?**
There are only eight possibilities:
- Log        (record something that already happened — past tense)
- Plan       (schedule something that will happen — future tense)
- Find       (search / list existing data)
- Update     (modify a field or status on an existing record)
- Recommend  (use sales sense to suggest products / next steps)
- Knowledge  (product or industry knowledge — needs the KB)
- Report     (generate daily / weekly summary)
- Chat       (greeting / thanks / smalltalk)

Key question: is the user "telling you something that happened" (Log/Update),
"asking you to do a future thing" (Plan), or "asking you to tell them
something they don't know" (Find / Recommend / Knowledge)?

**Q3: Which page are they on, and which entities are already bound?**
If they're on an account detail page and say "add an activity", Account is
already bound — they don't need to type it again.
If they're on an opportunity detail page and say "contact Sarah", Opportunity
and its parent Account are bound, and Sarah is a Contact to look up within
that Account's scope.

# Output
Emit one valid JSON object only. No markdown, no explanation, no code fences.
{
  "salesObject": "Account|Contact|Opportunity|Activity|Product|Mixed|None",
  "cognitiveTask": "Log|Plan|Find|Update|Recommend|Knowledge|Report|Chat",
  "temporal": "past|future|none",
  "boundEntities": {
    "account": { "id": "...", "name": "..." } | null,
    "opportunity": { "id": "...", "name": "..." } | null,
    "contact": { "id": "...", "name": "..." } | null
  },
  "explicitNames": [
    { "kind": "account|contact|opportunity|product", "text": "name as user said it" }
  ],
  "reasoning": "one sentence, why a sales coach would judge it this way (<= 30 words)",
  "confidence": 0-100,
  "ambiguity": "only fill if confidence < 70 — one sentence on what's unclear"
}`;
}

// ----------------------------- Runner ------------------------------------

export interface FrameRunContext {
  userMessage: string;
  pageContext?: {
    currentPage: string;
    summary?: string;
    pageData?: unknown;
  };
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  locale?: 'zh-Hans' | 'en';
}

export interface FrameRunOutcome {
  success: boolean;
  result?: FrameResult;
  raw?: string;
  error?: string;
  latencyMs: number;
}

/**
 * Run the Frame prompt. Pure function — does not write to the ring buffer.
 * Caller decides what to do with the outcome.
 */
export async function runFrame(ctx: FrameRunContext): Promise<FrameRunOutcome> {
  const startedAt = Date.now();

  const locale = ctx.locale ?? ((getLocale() === 'zh-Hans' ? 'zh-Hans' : 'en') as 'zh-Hans' | 'en');
  const system = buildFramePrompt(locale);

  // Compress page context the way the legacy prompt does — keep payload small.
  let pageBlock = '';
  if (ctx.pageContext) {
    const { currentPage, summary, pageData } = ctx.pageContext;
    pageBlock = `\n\n[页面] ${currentPage}`;
    if (summary) pageBlock += `\n[页面摘要] ${summary}`;
    if (pageData) {
      try {
        pageBlock += `\n[页面数据] ${JSON.stringify(pageData).slice(0, 1500)}`;
      } catch {
        /* ignore */
      }
    }
  }

  // Last 2 turns of history are enough for the framing decision.
  const tail = (ctx.conversationHistory ?? []).slice(-4);
  const historyBlock = tail.length
    ? `\n\n[最近对话]\n${tail.map((m) => `${m.role}: ${m.content}`).join('\n')}`
    : '';

  const userBlock = `${pageBlock}${historyBlock}\n\n[当前用户说] ${ctx.userMessage}`;

  const resp = await invokeFlowForLLM({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userBlock },
    ],
  });

  const latencyMs = Date.now() - startedAt;

  if (!resp.success || !resp.content) {
    return { success: false, error: resp.error ?? 'empty response', latencyMs, raw: resp.content };
  }

  const parsed = tryParseFrame(resp.content);
  if (!parsed) {
    return { success: false, error: 'parse/validation failed', latencyMs, raw: resp.content };
  }

  return { success: true, result: parsed, latencyMs, raw: resp.content };
}

function tryParseFrame(text: string): FrameResult | null {
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      candidate = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  const safe = FrameResultSchema.safeParse(candidate);
  return safe.success ? safe.data : null;
}

// ----------------------------- Ring buffer -------------------------------

const RING_KEY = 'copilot-frame-shadow-log';
const RING_MAX = 50;

export interface ShadowLogEntry {
  ts: number; // epoch ms
  userMessage: string;
  page?: string;
  frame: FrameRunOutcome;
  legacy?: {
    functionName: string | null;
    requiresMatching?: boolean;
    matchTargetEntity?: string;
    resolutionsCount?: number;
    additionalActionsCount?: number;
    confidence?: number;
    raw?: string;
  };
  agreement?: ShadowAgreement;
}

export interface ShadowAgreement {
  objectMatch: boolean | null; // null when we can't decide
  taskMatch: boolean | null;
  note?: string;
}

export function recordShadow(entry: ShadowLogEntry): void {
  try {
    const list = readShadowLog();
    list.unshift(entry);
    while (list.length > RING_MAX) list.pop();
    sessionStorage.setItem(RING_KEY, JSON.stringify(list));
  } catch {
    // sessionStorage may be unavailable in some embeddings — swallow.
  }
}

export function readShadowLog(): ShadowLogEntry[] {
  try {
    const raw = sessionStorage.getItem(RING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ShadowLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearShadowLog(): void {
  try {
    sessionStorage.removeItem(RING_KEY);
  } catch {
    /* noop */
  }
}

// ------------------------ Frame ↔ Legacy compare -------------------------

// Map legacy function names into the Frame's sales-object family. We use this
// only to compute a coarse agreement signal for the viewer — it is NOT used
// by production code paths.
const LEGACY_FN_OBJECT: Record<string, FrameSalesObject> = {
  draftActivity: 'Activity',
  updateActivity: 'Activity',
  batchDraft: 'Mixed',
  draftAccount: 'Account',
  updateAccount: 'Account',
  draftContact: 'Contact',
  updateContact: 'Contact',
  draftOpportunity: 'Opportunity',
  updateOpportunity: 'Opportunity',
  queryCopilotStudio: 'Product',
  externalKnowledgeQuery: 'None',
};

const LEGACY_FN_TASK: Record<string, FrameCognitiveTask> = {
  draftActivity: 'Log',
  updateActivity: 'Update',
  batchDraft: 'Log',
  draftAccount: 'Log',
  updateAccount: 'Update',
  draftContact: 'Log',
  updateContact: 'Update',
  draftOpportunity: 'Log',
  updateOpportunity: 'Update',
  queryCopilotStudio: 'Knowledge',
  externalKnowledgeQuery: 'Knowledge',
};

export function compareFrameVsLegacy(
  frame: FrameResult,
  legacyFunctionName: string | null | undefined
): ShadowAgreement {
  if (legacyFunctionName == null) {
    // Legacy chose Chat (null function). Agreement only if Frame also says Chat/None.
    const chatLike = frame.cognitiveTask === 'Chat' || frame.salesObject === 'None';
    return {
      objectMatch: frame.salesObject === 'None' ? true : null,
      taskMatch: chatLike,
      note: chatLike ? 'both → chat/none' : 'legacy null vs frame action',
    };
  }
  const expectedObject = LEGACY_FN_OBJECT[legacyFunctionName];
  const expectedTask = LEGACY_FN_TASK[legacyFunctionName];
  // For "Find" queries, function names start with getXxx / fuzzyMatchXxx — treat as Find.
  const isFind = /^(get|list|fuzzyMatch|search)/i.test(legacyFunctionName);
  const objectMatch = expectedObject
    ? frame.salesObject === expectedObject || frame.salesObject === 'Mixed'
    : null;
  const taskMatch = isFind
    ? frame.cognitiveTask === 'Find'
    : expectedTask
      ? frame.cognitiveTask === expectedTask
      : null;
  return { objectMatch, taskMatch };
}

// ----------------------- Sub-prompt dispatch key -------------------------

/**
 * Compute the routing key for the Layer 2 sub-prompt.
 * Format: "Activity_Log", "Product_Knowledge", "Mixed_Log", "None_Chat", etc.
 */
export function getSubPromptKey(frame: FrameResult): string {
  return `${frame.salesObject}_${frame.cognitiveTask}`;
}
