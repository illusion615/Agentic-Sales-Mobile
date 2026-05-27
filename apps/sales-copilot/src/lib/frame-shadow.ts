/**
 * Frame Shadow — multi-intent classifier
 * --------------------------------------------------------------------------
 * The Frame stage reads what the salesperson said and emits a list of
 * INTENTS. One message can produce many intents (a past visit + a discovered
 * opportunity + two future plans). This is the input to the Orchestrator,
 * which maps each intent to a skill call.
 *
 * Design:
 *   - Schema is `intents: IntentItem[]`. No more "Mixed" hack — multi-intent
 *     is naturally `intents.length > 1`.
 *   - `relatesTo` is a 0-based integer dependency between intents. Models
 *     stubbornly wrap it as `[{item:N}]` / `[{index:N}]` / `["N"]`; we coerce
 *     all three forms back to plain integers.
 *   - Frame is invoked with `responseFormat: 'json'` so the Flow forces the
 *     LLM into JSON-object mode (much fewer parse failures).
 *
 * The viewer (frame-shadow-viewer.tsx) renders the ring buffer of recent
 * runs for boss-facing inspection. Nothing in production routing depends on
 * this file yet; it runs in shadow alongside legacy.
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
  'None',
]);
export type FrameSalesObject = z.infer<typeof FrameSalesObjectSchema>;

export const FrameCognitiveTaskSchema = z.enum([
  'Log',
  'Plan',
  'Find',
  'Update',
  'Recommend',
  'Analyze',
  'Knowledge',
  'Report',
  'Chat',
]);
export type FrameCognitiveTask = z.infer<typeof FrameCognitiveTaskSchema>;

export const FrameTemporalSchema = z.enum(['past', 'future', 'none']);
export type FrameTemporal = z.infer<typeof FrameTemporalSchema>;

/**
 * Coerce relatesTo entries.
 * Models output one of:
 *   [1]                   ✓ plain integer
 *   ["1"]                 numeric string
 *   [{ item: 1 }]         object wrapping
 *   [{ index: 1 }]        object wrapping (alt key)
 *   [{ ref: 1 }]          object wrapping (alt key)
 * Anything else is dropped.
 */
const RelatesToEntrySchema = z.preprocess((raw) => {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.trunc(raw);
  if (typeof raw === 'string' && /^-?\d+$/.test(raw)) return parseInt(raw, 10);
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    for (const k of ['item', 'index', 'idx', 'ref', 'i']) {
      const v = o[k];
      if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
      if (typeof v === 'string' && /^-?\d+$/.test(v)) return parseInt(v, 10);
    }
  }
  return undefined;
}, z.number().int());

const RelatesToArraySchema = z.preprocess((raw) => {
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) return [raw];
  return raw;
}, z.array(RelatesToEntrySchema).default([]));

/** Short human-friendly per-intent label used to narrate execution. */
export const UserFacingLabelSchema = z.preprocess(
  (raw) => {
    if (typeof raw === 'string') return { zh: raw, en: raw };
    if (raw && typeof raw === 'object') {
      const o = raw as Record<string, unknown>;
      const zh = typeof o.zh === 'string' ? o.zh : typeof o['zh-Hans'] === 'string' ? (o['zh-Hans'] as string) : '';
      const en = typeof o.en === 'string' ? o.en : '';
      return { zh, en };
    }
    return { zh: '', en: '' };
  },
  z.object({ zh: z.string().default(''), en: z.string().default('') }).default({ zh: '', en: '' })
);
export type UserFacingLabel = z.infer<typeof UserFacingLabelSchema>;

export const IntentItemSchema = z.object({
  salesObject: FrameSalesObjectSchema,
  cognitiveTask: FrameCognitiveTaskSchema,
  temporal: FrameTemporalSchema.default('none'),
  summary: z.string().default(''),
  relatesTo: RelatesToArraySchema,
  /** Short narrative label for UI (≤8 chars zh / ≤4 words en). Falls back to a template if empty. */
  userFacingLabel: UserFacingLabelSchema.optional(),
});
export type IntentItem = z.infer<typeof IntentItemSchema>;

export const FrameExplicitNameSchema = z.object({
  kind: z.enum(['account', 'contact', 'opportunity', 'product']),
  text: z.string(),
});
export type FrameExplicitName = z.infer<typeof FrameExplicitNameSchema>;

export const FrameBoundEntitySchema = z
  .object({
    id: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
  })
  .nullable();

export const FrameBoundEntitiesSchema = z
  .object({
    account: FrameBoundEntitySchema.optional(),
    opportunity: FrameBoundEntitySchema.optional(),
    contact: FrameBoundEntitySchema.optional(),
  })
  .optional();

export const FrameResultSchema = z.object({
  intents: z.array(IntentItemSchema).min(1),
  /** Page-bound entities, injected by the host (not produced by the LLM). */
  boundEntities: FrameBoundEntitiesSchema,
  explicitNames: z.array(FrameExplicitNameSchema).default([]),
  reasoning: z.string().default(''),
  confidence: z.preprocess(
    (v) => (typeof v === 'string' ? Number(v) : v),
    z.number().min(0).max(100).default(80)
  ),
});
export type FrameResult = z.infer<typeof FrameResultSchema>;

// ----------------------------- Prompt ------------------------------------

function buildFramePrompt(): string {
  // English-only system prompt. The user message preserves whatever language
  // the salesperson typed; the LLM responds with `summary` strings in the
  // user's language.
  return `You are a senior CRM sales coach. Read what a salesperson said and list every distinct thing they want the system to remember or do. Do not pick a single label — list them all.

# Definition of one "intent"
One intent = one independent fact or action the salesperson is communicating, that the CRM should either record (Log/Update), schedule (Plan), or answer (Find/Recommend/Knowledge/Report).

A single sentence often contains multiple intents:
- A past visit AND the opportunity discovered during it = 2 intents.
- A past meeting AND a follow-up they want to schedule = 2 intents.
- A question AND a record-keeping ask = 2 intents.

Split intents whenever ANY of the following is true:
- Two different time frames are mentioned (something that already happened + something to do later).
- Two different sales objects are referenced (e.g. a customer's project AND a meeting about it).
- Two different cognitive tasks are needed (e.g. record something AND ask a question).

Do NOT split intents when:
- The same fact is restated in different words.
- Modifiers describe the same underlying event ("visited Dr. Lisa at the cardiology department" = 1 intent, not 2).
- Preparation, follow-up, or implicit sub-tasks of a scheduled activity are part of that activity, not separate intents. "Meet tomorrow and prepare for it" = 1 intent (the meeting).
- Descriptions of what a customer wants, needs, or is buying are part of the Opportunity intent itself, not separate Product or Activity intents. The Opportunity's summary should absorb these details.

Language-agnostic: judge by meaning, not by keywords. The user may write in any language or mix languages. Tense and time are inferred from meaning.

# Follow-up / anaphora resolution
The conversation history is provided as prior chat turns. When the user's message contains pronouns (them, it, those, these, this) or short follow-up commands (list, show, details, more), resolve the referent from the previous turns. The salesObject of a follow-up inherits from the topic of the prior exchange — do NOT default to a different entity type.

# Sales objects (each intent picks exactly one)
- Account     — a customer organization (hospital, company, distributor)
- Contact     — a person (doctor, buyer, decision maker)
- Opportunity — a deal, project, tender, or buying interest. Customer demand and what they want to buy belongs here.
- Activity    — a sales touch that happens at a point in time (visit, call, meeting, email, demo, product introduction delivered to the customer). Anything where the salesperson is interacting with or delivering something to the customer or to internal colleagues at a specific time.
- Product     — knowledge about a product, or a request to recommend a product. ONLY used when the salesperson is asking the ASSISTANT for product information or a recommendation. Audience = the assistant, not the customer.
    CORRECT (Product):  "what's the warranty on the X200?"             → Product, Knowledge
    CORRECT (Product):  "recommend a product for this hospital"        → Product, Recommend
    WRONG   (Product):  "do a product introduction to the customer"    → this is an Activity (a meeting/demo), use Activity, Plan
    WRONG   (Product):  "I demoed the X200 yesterday"                  → Activity, Log
    WRONG   (Product):  "the customer wants new devices"               → this is the Opportunity itself, fold into the Opportunity summary
  Rule of thumb: if the audience of the action is the CUSTOMER, it's an Activity. Only when the audience is the ASSISTANT is it Product.
- None        — the intent is not about a sales record (greeting, system question, smalltalk)

# Cognitive tasks (each intent picks exactly one)
- Log        — record something that already happened or already exists
- Plan       — schedule something to happen in the future
- Find       — search for or list existing records
- Update     — change a field on an existing record
- Recommend  — ask the assistant to recommend a PRODUCT (features, specs, which model fits). salesObject MUST be Product.
- Analyze    — ask the assistant for strategic advice, next-step suggestions, deal coaching, meeting preparation, follow-up strategy, account prioritization, or any request that needs CRM data synthesis + reasoning. Use for ANY "suggest / advise / analyze / coach / prepare / prioritize" intent that is NOT about product knowledge.
- Knowledge  — ask a factual product or industry knowledge question (specs, warranty, regulations)
- Report     — ask for a status overview, summary, or statistics about any entity type (accounts, pipeline, activities, territory, engagement)
- Chat       — pure greeting / thanks / smalltalk

# Output
Return a single JSON object with this exact shape. Do not wrap in markdown.

{
  "intents": [
    {
      "salesObject": "Account|Contact|Opportunity|Activity|Product|None",
      "cognitiveTask": "Log|Plan|Find|Update|Recommend|Analyze|Knowledge|Report|Chat",
      "temporal": "past|future|none",
      "summary": "one short sentence in the user's own language describing this single intent",
      "userFacingLabel": { "zh": "≤8 字中文动作短语，例如：登记客户拜访 / 识别潜在商机 / 计划后续任务", "en": "≤4 word imperative phrase, e.g. Log customer visit / Identify opportunity / Plan follow-up" },
      "relatesTo": [<plain integer, 0-based index of another intent in this same intents array>]
    }
  ],
  "explicitNames": [
    { "kind": "account|contact|opportunity|product", "text": "name as the user said it" }
  ],
  "reasoning": "one short sentence in English on how you split the intents",
  "confidence": 0-100
}

# Field rules
- intents: always an array. Even a single intent (greeting, simple find) is one element.
- userFacingLabel: REQUIRED on every intent. Short, action-oriented, user-facing. Both zh and en MUST be filled regardless of input language — the UI may render either depending on the user's locale. No punctuation. Examples:
    Activity Log past:     {"zh":"登记客户拜访","en":"Log visit"}
    Opportunity Log past:  {"zh":"识别潜在商机","en":"Identify opportunity"}
    Activity Plan future:  {"zh":"计划后续任务","en":"Plan follow-up"}
    Account Find:          {"zh":"查找客户","en":"Find account"}
    Product Knowledge:     {"zh":"产品咨询","en":"Product question"}
- relatesTo: array of plain JSON integers (0-based) indexing into this same intents array. Use [] when independent.
    CORRECT:   "relatesTo": [1]
    CORRECT:   "relatesTo": [0, 2]
    CORRECT:   "relatesTo": []
    WRONG:     "relatesTo": [{"item": 1}]
    WRONG:     "relatesTo": ["1"]
- A relatesTo dependency means: this intent only makes sense in the context of intent N.
- explicitNames: every entity the user named in the message. [] if none.
- Do NOT extract or invent boundEntities — page-bound entities are injected by the system.
- confidence: 0-100, your overall confidence in the intent split.

# Worked examples (shape only)

User: "I visited London hospital today and talked with Lisa about their new operation room project. They're looking for new devices and want a product refresh introduction before next Wednesday. We need an internal meeting tomorrow to book resources and prepare."
Expected intents: 4
  [0] Activity,    Log,  past   — visited London hospital, met Lisa                                                  label {zh:"登记客户拜访",en:"Log visit"}
  [1] Opportunity, Log,  past   — new operation room project at London hospital, looking for new devices             label {zh:"识别潜在商机",en:"Identify opportunity"}
  [2] Activity,    Plan, future — product refresh introduction to the customer before next Wednesday   (relatesTo: [1])  label {zh:"安排产品介绍",en:"Schedule product intro"}
  [3] Activity,    Plan, future — internal meeting tomorrow to book resources   (relatesTo: [1])                      label {zh:"安排内部准备会",en:"Schedule internal prep"}
Note: "looking for new devices" folded into the Opportunity. "Product refresh introduction" is an Activity (audience = customer).

User: "show me my top opportunities"
Expected intents: 1
  [0] Opportunity, Find, none

User: "hi there"
Expected intents: 1
  [0] None, Chat, none

User: "what's the warranty on the X200?"
Expected intents: 1
  [0] Product, Knowledge, none

User: "我刚跟张总开完会，他想要个报价单，下周二再约一次"
Expected intents: 3
  [0] Activity, Log,  past   — 与张总开会
  [1] Activity, Plan, future — 准备报价单发给客户   (relatesTo: [0])
  [2] Activity, Plan, future — 下周二再约一次       (relatesTo: [0])

User: "summarize this opportunity and suggest follow up"
Expected intents: 2
  [0] Opportunity, Report,  none — summarize this opportunity                    label {zh:"商机摘要",en:"Summarize opportunity"}
  [1] Opportunity, Analyze, none — suggest follow-up actions   (relatesTo: [0])  label {zh:"建议跟进",en:"Suggest follow-up"}
Note: "suggest follow up" is Analyze (strategy advice from CRM data), NOT Recommend (product recommendation) or Knowledge.

User: "which accounts should I focus on this week"
Expected intents: 1
  [0] Account, Analyze, none — prioritize accounts for this week                 label {zh:"客户优先级分析",en:"Prioritize accounts"}

User: "how should I approach this deal"
Expected intents: 1
  [0] Opportunity, Analyze, none — deal strategy advice                          label {zh:"打单策略建议",en:"Deal strategy"}

Now classify the latest user message. Use the prior conversation turns (if any) to resolve pronouns and follow-up references.`;
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
  /** Reserved for future page-binding injection; not yet wired. */
  boundEntities?: FrameResult['boundEntities'];
  locale?: 'zh-Hans' | 'en';
}

export interface FrameRunOutcome {
  success: boolean;
  result?: FrameResult;
  latencyMs: number;
  error?: string;
  raw?: string;
}

export async function runFrame(ctx: FrameRunContext): Promise<FrameRunOutcome> {
  const startedAt = Date.now();

  const system = buildFramePrompt();

  // Compress page context — keep payload small.
  let pageBlock = '';
  if (ctx.pageContext) {
    const { currentPage, summary, pageData } = ctx.pageContext;
    pageBlock = `\n\n[Page] ${currentPage}`;
    if (summary) pageBlock += `\n[Summary] ${summary}`;
    if (pageData) {
      try {
        pageBlock += `\n[PageData] ${JSON.stringify(pageData).slice(0, 1500)}`;
      } catch {
        /* ignore */
      }
    }
  }

  // Build conversation context block — placed at the END of the system prompt
  // for maximum attention weight. invokeFlowForLLM serialises all messages into
  // a single string (role: content\n...), so multi-turn chat format has no
  // benefit. Instead, embed context inside the system prompt where the LLM
  // pays the most attention (recency bias).
  const tail = (ctx.conversationHistory ?? []).slice(-4);
  let contextBlock = '';
  if (tail.length > 0) {
    const turns = tail.map((m) => `${m.role}: ${m.content.slice(0, 300)}`).join('\n');
    contextBlock = `\n\n# Conversation context\n${turns}\n\nThe user's next message follows. If it contains pronouns (them/it/those/these/this) or short commands (list/show/details/more), resolve the referent from the conversation above — the salesObject MUST match what was discussed, not a default.`;
  }

  const messages: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: system + pageBlock + contextBlock },
    { role: 'user', content: ctx.userMessage },
  ];

  // First attempt: strict JSON mode. On any failure, retry once in text mode
  // — the flow's server-side Parse-JSON action sometimes throws
  // "Retrieve operation failure: JSON Parse error: Unterminated string"
  // when the model's JSON output is truncated. Text mode bypasses that
  // parser and lets our tolerant client parser handle the response.
  let resp = await invokeFlowForLLM({
    messages,
    responseFormat: 'json',
  });
  let parsed = resp.success && resp.content ? tryParseFrame(resp.content) : null;
  if (!parsed) {
    const firstError = resp.error;
    resp = await invokeFlowForLLM({
      messages,
      responseFormat: 'text',
    });
    if (resp.success && resp.content) parsed = tryParseFrame(resp.content);
    if (!resp.success && !resp.error && firstError) resp.error = firstError;
  }

  const latencyMs = Date.now() - startedAt;

  if (!resp.success || !resp.content) {
    return { success: false, error: resp.error ?? 'empty response', latencyMs, raw: resp.content };
  }
  if (!parsed) {
    return { success: false, error: 'parse/validation failed', latencyMs, raw: resp.content };
  }

  // Inject host-provided boundEntities (LLM should not invent them).
  if (ctx.boundEntities) parsed.boundEntities = ctx.boundEntities;

  // Backfill userFacingLabel for any intent the LLM forgot to label.
  for (const it of parsed.intents) {
    if (!it.userFacingLabel || (!it.userFacingLabel.zh && !it.userFacingLabel.en)) {
      it.userFacingLabel = fallbackUserFacingLabel(it);
    } else {
      if (!it.userFacingLabel.zh) it.userFacingLabel.zh = fallbackUserFacingLabel(it).zh;
      if (!it.userFacingLabel.en) it.userFacingLabel.en = fallbackUserFacingLabel(it).en;
    }
  }

  return { success: true, result: parsed, latencyMs, raw: resp.content };
}

/** Deterministic fallback labels when the LLM omits userFacingLabel. */
export function fallbackUserFacingLabel(intent: Pick<IntentItem, 'salesObject' | 'cognitiveTask'>): UserFacingLabel {
  const key = `${intent.salesObject}|${intent.cognitiveTask}`;
  const table: Record<string, UserFacingLabel> = {
    'Activity|Log': { zh: '登记客户拜访', en: 'Log visit' },
    'Activity|Plan': { zh: '计划后续任务', en: 'Plan follow-up' },
    'Activity|Update': { zh: '更新拜访记录', en: 'Update activity' },
    'Activity|Find': { zh: '查找拜访记录', en: 'Find activity' },
    'Opportunity|Log': { zh: '识别潜在商机', en: 'Identify opportunity' },
    'Opportunity|Plan': { zh: '规划商机进展', en: 'Plan opportunity' },
    'Opportunity|Update': { zh: '更新商机信息', en: 'Update opportunity' },
    'Opportunity|Find': { zh: '查找商机', en: 'Find opportunity' },
    'Account|Log': { zh: '记录客户信息', en: 'Log account' },
    'Account|Update': { zh: '更新客户信息', en: 'Update account' },
    'Account|Find': { zh: '查找客户', en: 'Find account' },
    'Contact|Log': { zh: '记录联系人', en: 'Log contact' },
    'Contact|Update': { zh: '更新联系人', en: 'Update contact' },
    'Contact|Find': { zh: '查找联系人', en: 'Find contact' },
    'Product|Knowledge': { zh: '产品咨询', en: 'Product question' },
    'Product|Recommend': { zh: '推荐产品', en: 'Recommend product' },
    'Opportunity|Analyze': { zh: '商机策略分析', en: 'Analyze opportunity' },
    'Account|Analyze': { zh: '客户分析建议', en: 'Analyze account' },
    'Activity|Analyze': { zh: '活动策略建议', en: 'Activity strategy' },
    'Contact|Analyze': { zh: '联系人分析', en: 'Analyze contact' },
    'None|Analyze': { zh: '综合分析建议', en: 'Strategic analysis' },
    'Opportunity|Recommend': { zh: '商机建议', en: 'Opportunity advice' },
    'Account|Recommend': { zh: '客户建议', en: 'Account advice' },
    'Opportunity|Report': { zh: '管线概览', en: 'Pipeline overview' },
    'Account|Report': { zh: '客户概览', en: 'Account overview' },
    'Activity|Report': { zh: '活动概览', en: 'Activity overview' },
    'Contact|Report': { zh: '联系人概览', en: 'Contact overview' },
    'None|Chat': { zh: '日常对话', en: 'Chat' },
    'None|Report': { zh: '综合报告', en: 'Overview report' },
  };
  return table[key] ?? { zh: `${intent.cognitiveTask} ${intent.salesObject}`, en: `${intent.cognitiveTask} ${intent.salesObject}` };
}

export function tryParseFrame(text: string): FrameResult | null {
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
  // Some models wrap relatesTo indices as objects across the whole intents array
  // — Zod's preprocess inside the schema handles each entry.
  const safe = FrameResultSchema.safeParse(candidate);
  if (!safe.success) {
    console.warn(
      '[FrameShadow] Zod validation failed:',
      safe.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')
    );
    return null;
  }
  // Drop relatesTo indices that point outside the array (defensive).
  const n = safe.data.intents.length;
  for (const intent of safe.data.intents) {
    intent.relatesTo = intent.relatesTo.filter((idx) => idx >= 0 && idx < n);
  }
  return safe.data;
}

// ----------------------------- Ring buffer -------------------------------

const RING_KEY = 'copilot-frame-shadow-log';
const RING_MAX = 50;

export interface ShadowLogEntry {
  ts: number;
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
  intentCountMatch: boolean | null;
  /** Whether legacy's primary function maps to one of the shadow intents. */
  primaryObjectMatch: boolean | null;
  note?: string;
}

export function recordShadow(entry: ShadowLogEntry): void {
  try {
    const list = readShadowLog();
    list.unshift(entry);
    while (list.length > RING_MAX) list.pop();
    sessionStorage.setItem(RING_KEY, JSON.stringify(list));
  } catch {
    /* sessionStorage may be unavailable in some embeddings */
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

const LEGACY_FN_OBJECT: Record<string, FrameSalesObject> = {
  draftActivity: 'Activity',
  updateActivity: 'Activity',
  draftAccount: 'Account',
  updateAccount: 'Account',
  draftContact: 'Contact',
  updateContact: 'Contact',
  draftOpportunity: 'Opportunity',
  updateOpportunity: 'Opportunity',
  queryCopilotStudio: 'Product',
  externalKnowledgeQuery: 'None',
};

/**
 * Coarse comparison signal for the viewer only. Not used by production code.
 *  - intentCountMatch: do shadow intent count and legacy (1 + additionalActions) agree?
 *  - primaryObjectMatch: is legacy's main function's sales object present in shadow intents?
 */
export function compareFrameVsLegacy(
  frame: FrameResult,
  legacyFunctionName: string | null | undefined,
  legacyAdditionalActionCount = 0
): ShadowAgreement {
  // Legacy chose to chat (function = null)
  if (legacyFunctionName == null) {
    const shadowIsChat =
      frame.intents.length === 1 &&
      (frame.intents[0].cognitiveTask === 'Chat' || frame.intents[0].salesObject === 'None');
    return {
      intentCountMatch: shadowIsChat,
      primaryObjectMatch: shadowIsChat ? true : null,
      note: shadowIsChat ? 'both → chat/none' : 'legacy null vs shadow action',
    };
  }
  // Non-chat: do basic count/object comparison
  const legacyTotal = 1 + legacyAdditionalActionCount;
  const intentCountMatch = legacyTotal === frame.intents.length;
  return { intentCountMatch, primaryObjectMatch: null };
}

// ----------------------- Skill mapping helpers ---------------------------

/**
 * Suggest a default function name for an intent. The Orchestrator will refine.
 * Used only as a hint when displaying intents in the viewer.
 */
export function suggestSkillForIntent(intent: IntentItem): string | null {
  const { salesObject, cognitiveTask } = intent;
  // For Chat/None, return null so the LLM generates a direct response.
  // But for Report/Find/Analyze on None, fall through to the default query.
  if (salesObject === 'None' && cognitiveTask !== 'Report' && cognitiveTask !== 'Find' && cognitiveTask !== 'Analyze') return null;
  const obj = salesObject;
  switch (cognitiveTask) {
    case 'Log':
      if (obj === 'Activity') return 'draftActivity';
      if (obj === 'Account') return 'draftAccount';
      if (obj === 'Contact') return 'draftContact';
      if (obj === 'Opportunity') return 'draftOpportunity';
      return null;
    case 'Plan':
      if (obj === 'Activity') return 'suggestPlan';
      return 'suggestPlan';
    case 'Update':
      if (obj === 'Activity') return 'updateActivity';
      if (obj === 'Account') return 'updateAccount';
      if (obj === 'Contact') return 'updateContact';
      if (obj === 'Opportunity') return 'updateOpportunity';
      return null;
    case 'Find':
    case 'Report':
    case 'Analyze':
      if (obj === 'Account') return 'queryAccounts';
      if (obj === 'Opportunity') return 'queryOpportunities';
      if (obj === 'Activity') return 'queryActivities';
      if (obj === 'Contact') return 'queryContacts';
      return 'queryOpportunities';
    case 'Knowledge':
      return 'queryCopilotStudio';
    case 'Recommend':
      return obj === 'Product' ? 'queryCopilotStudio' : 'queryOpportunities';
    default:
      return null;
  }
}
