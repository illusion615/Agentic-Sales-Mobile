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

export const IntentItemSchema = z.object({
  salesObject: FrameSalesObjectSchema,
  cognitiveTask: FrameCognitiveTaskSchema,
  temporal: FrameTemporalSchema.default('none'),
  summary: z.string().default(''),
  relatesTo: RelatesToArraySchema,
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
- Recommend  — ask the assistant to suggest products or next steps
- Knowledge  — ask a product or industry knowledge question
- Report     — ask for a daily / weekly / pipeline summary
- Chat       — pure greeting / thanks / smalltalk

# Output
Return a single JSON object with this exact shape. Do not wrap in markdown.

{
  "intents": [
    {
      "salesObject": "Account|Contact|Opportunity|Activity|Product|None",
      "cognitiveTask": "Log|Plan|Find|Update|Recommend|Knowledge|Report|Chat",
      "temporal": "past|future|none",
      "summary": "one short sentence in the user's own language describing this single intent",
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
  [0] Activity,    Log,  past   — visited London hospital, met Lisa
  [1] Opportunity, Log,  past   — new operation room project at London hospital, looking for new devices
  [2] Activity,    Plan, future — product refresh introduction to the customer before next Wednesday   (relatesTo: [1])
  [3] Activity,    Plan, future — internal meeting tomorrow to book resources   (relatesTo: [1])
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

Now process the user message.`;
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

  const tail = (ctx.conversationHistory ?? []).slice(-4);
  const historyBlock = tail.length
    ? `\n\n[Recent dialogue]\n${tail.map((m) => `${m.role}: ${m.content}`).join('\n')}`
    : '';

  const userBlock = `${pageBlock}${historyBlock}\n\n[User] ${ctx.userMessage}`;

  // First attempt: strict JSON mode. On any failure, retry once in text mode
  // — the flow's server-side Parse-JSON action sometimes throws
  // "Retrieve operation failure: JSON Parse error: Unterminated string"
  // when the model's JSON output is truncated. Text mode bypasses that
  // parser and lets our tolerant client parser handle the response.
  let resp = await invokeFlowForLLM({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userBlock },
    ],
    responseFormat: 'json',
  });
  let parsed = resp.success && resp.content ? tryParseFrame(resp.content) : null;
  if (!parsed) {
    const firstError = resp.error;
    resp = await invokeFlowForLLM({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userBlock },
      ],
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

  return { success: true, result: parsed, latencyMs, raw: resp.content };
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
  // batchDraft is legacy's multi-record bag — count items in arguments.items if available.
  const legacyTotal = 1 + legacyAdditionalActionCount;
  const shadowTotal = frame.intents.length;
  const intentCountMatch = legacyTotal === shadowTotal;

  const expectedObject = LEGACY_FN_OBJECT[legacyFunctionName];
  const primaryObjectMatch = expectedObject
    ? frame.intents.some((i) => i.salesObject === expectedObject)
    : null;
  return { intentCountMatch, primaryObjectMatch };
}

// ----------------------- Skill mapping helpers ---------------------------

/**
 * Suggest a default function name for an intent. The Orchestrator will refine.
 * Used only as a hint when displaying intents in the viewer.
 */
export function suggestSkillForIntent(intent: IntentItem): string | null {
  const { salesObject, cognitiveTask } = intent;
  if (salesObject === 'None') return null;
  const obj = salesObject;
  switch (cognitiveTask) {
    case 'Log':
      if (obj === 'Activity') return 'draftActivity';
      if (obj === 'Account') return 'draftAccount';
      if (obj === 'Contact') return 'draftContact';
      if (obj === 'Opportunity') return 'draftOpportunity';
      return null;
    case 'Plan':
      if (obj === 'Activity') return 'draftActivity';
      return null;
    case 'Update':
      if (obj === 'Activity') return 'updateActivity';
      if (obj === 'Account') return 'updateAccount';
      if (obj === 'Contact') return 'updateContact';
      if (obj === 'Opportunity') return 'updateOpportunity';
      return null;
    case 'Find':
      if (obj === 'Account') return 'searchAccounts';
      if (obj === 'Opportunity') return 'getMyOpportunities';
      if (obj === 'Activity') return 'getTodayActivities';
      if (obj === 'Contact') return 'getContactsByAccount';
      return null;
    case 'Knowledge':
    case 'Recommend':
      return 'queryCopilotStudio';
    case 'Report':
      return 'getSalesSummary';
    default:
      return null;
  }
}
