/**
 * Intent Pipeline Orchestrator
 *
 * Architecture:  Frame (intents[])  →  Orchestrator (DAG)  →  Executor
 *
 * The Frame stage already split the user's message into a list of intents,
 * each with `salesObject`, `cognitiveTask`, `temporal`, `summary`, and
 * `relatesTo`. The Orchestrator's job is to turn that list into a DAG
 * execution plan:
 *
 *   - One intent  →  one DAG step
 *   - Each intent's relatesTo[] becomes the step's dependsOn[]
 *   - Step `function` is suggested deterministically (suggestSkillForIntent)
 *     and the LLM is asked only to fill in `arguments` per step.
 *
 * No second free-form classification call. Everything semantic is decided
 * by the Frame; the Orchestrator just structures and parameterizes.
 */

import {
  runFrame,
  suggestSkillForIntent,
  type FrameRunContext,
  type FrameResult,
  type IntentItem,
} from './frame';
import { selectSkillsForIntents, formatSkillsForPrompt } from './skills-selector';
import { invokeFlowForLLM } from '@/services/power-automate-service';
import {
  DagPlanSchema,
  SingleIntentSchema,
  isDagPlan,
  type SubPromptOutput,
  type DagStep,
} from './dag-schema';
import { getLocale } from '@/lib/i18n';

import { agentError, type AgentError } from './errors';

// ----------------------------- Types -------------------------------------

export interface PipelineResult {
  frame: FrameResult;
  frameLatencyMs: number;
  skillsCount: number;
  plan: SubPromptOutput | null;
  planLatencyMs: number;
  planRaw?: string;
  totalLatencyMs: number;
  error?: AgentError;
  /** Exact prompt text sent to the Frame LLM call (for dev inspection/copy). */
  framePrompt?: string;
  /** Exact prompt text sent to the Orchestrator LLM call (for dev inspection/copy). */
  planPrompt?: string;
  /** True if the Frame stage had to retry its LLM call (first attempt malformed). */
  frameRetried?: boolean;
  /** Reason the Frame stage retried, surfaced in the inspector. */
  frameRetryReason?: string;
  /** True if the Orchestrator stage had to retry its LLM call (first attempt malformed). */
  planRetried?: boolean;
  /** Reason the Orchestrator stage retried. */
  planRetryReason?: string;
}

export interface BenchmarkEntry {
  ts: number;
  userMessage: string;
  page?: string;
  result: PipelineResult;
}

// ----------------------------- Ring buffer -------------------------------

const BENCHMARK_KEY = 'copilot-pipeline-benchmark';
const BENCHMARK_MAX = 50;

export function recordBenchmark(entry: BenchmarkEntry): void {
  try {
    const list = readBenchmarkLog();
    list.unshift(entry);
    while (list.length > BENCHMARK_MAX) list.pop();
    sessionStorage.setItem(BENCHMARK_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function readBenchmarkLog(): BenchmarkEntry[] {
  try {
    const raw = sessionStorage.getItem(BENCHMARK_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BenchmarkEntry[];
  } catch {
    return [];
  }
}

// ----------------------------- Skeleton ----------------------------------

interface SkeletonStep {
  seq: number;
  outputRef: string;          // e.g. "$intent_0"
  dependsOn?: string[];       // e.g. ["$intent_1"]
  intent: IntentItem;
  suggestedFunction: string | null;
}

function buildSkeleton(intents: IntentItem[]): SkeletonStep[] {
  return intents.map((intent, idx) => {
    const dependsOn = intent.relatesTo.map((i) => `$intent_${i}`);
    return {
      seq: idx + 1,
      outputRef: `$intent_${idx}`,
      dependsOn: dependsOn.length ? dependsOn : undefined,
      intent,
      suggestedFunction: suggestSkillForIntent(intent),
    };
  });
}

// ----------------------------- Orchestrator prompt -----------------------

function describeBoundEntities(frame: FrameResult): string {
  const b = frame.boundEntities;
  if (!b) return '';
  const lines: string[] = [];
  if (b.account) lines.push(`- Bound Account: ${b.account.name} (id=${b.account.id})`);
  if (b.opportunity) lines.push(`- Bound Opportunity: ${b.opportunity.name} (id=${b.opportunity.id})`);
  if (b.contact) lines.push(`- Bound Contact: ${b.contact.name} (id=${b.contact.id})`);
  return lines.length ? `\n# Page-bound entities (use their ids without re-asking)\n${lines.join('\n')}` : '';
}

function buildOrchestratorPrompt(
  frame: FrameResult,
  skeleton: SkeletonStep[],
  skillsText: string,
  locale: 'zh-Hans' | 'en'
): string {
  const heading = `You are the execution planner for a sales assistant. The Frame stage has already split the user's message into intents and given each one a salesObject / cognitiveTask / temporal / summary / relatesTo. Your only job is to fill in step.arguments for each intent and assemble the DAG. Do not reclassify, merge, or split intents.`;

  const skeletonLines = skeleton.map((s) => {
    const intent = s.intent;
    const deps = s.dependsOn?.length ? `, dependsOn=${JSON.stringify(s.dependsOn)}` : '';
    const fn = s.suggestedFunction ? `, suggestedFunction="${s.suggestedFunction}"` : '';
    return `  - seq=${s.seq}, outputRef="${s.outputRef}"${deps}, salesObject=${intent.salesObject}, cognitiveTask=${intent.cognitiveTask}, temporal=${intent.temporal}, summary=${JSON.stringify(intent.summary)}${fn}`;
  }).join('\n');

  // Anchor all relative-date reasoning to the real current date. Without this
  // the LLM has no idea what "today" is and fabricates dates (often years off).
  const now = new Date();
  const todayIso = now.toISOString().split('T')[0];
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });

  return `${heading}

# Current date
Today is ${todayIso} (${weekday}). ALWAYS resolve relative dates against this:
"today"=${todayIso}; "yesterday"=the day before; "tomorrow"=the day after;
"this/next week" relative to ${todayIso}. NEVER invent a year — every date you
output must be in the same year as today unless the user explicitly says otherwise.

# Fidelity (CRITICAL — data integrity)
- Keep the user's OWN wording for proper nouns (account names, contact names, departments/科室, job titles, products). Do NOT swap in a different or similar-sounding term (e.g. 设备科 must never become 检验科). The user's shorthand/abbreviation is fine — copy it as-is; matching to real records happens later.
- Extract ONLY what the user actually stated. NEVER invent purposes, agendas, background, amounts, dates, or any detail the user did not give. Leave an optional field empty rather than fabricating a plausible-sounding value.

# Composite operations (merge / deduplicate / reconcile / compare-then-change)
Some requests are NOT a single update — they must READ records, decide what to change, and CONFIRM before writing. Signals: "合并 / merge", "去重 / deduplicate", "重复 / duplicate", "reconcile", "对比这些再改/删".
For such an intent, emit a proposeChanges step INSTEAD of a plain update/delete:
  { "seq": <n>, "function": "proposeChanges", "arguments": { "goal": "<the user's request, verbatim>" } }
proposeChanges reads the in-scope records, proposes the exact update/delete operations, and asks the user to confirm — nothing is written until they do.
It needs the records in scope: if a prior step already queried/compared them, place proposeChanges AFTER it (higher seq, dependsOn that step's outputRef). If NO prior step fetched them, ADD a query step BEFORE it (e.g. queryActivities with the right filter) and give proposeChanges the higher seq. For this case you MAY output MORE steps than the skeleton.

# Skeleton (preserve one-to-one, EXCEPT composite operations above)
${skeletonLines}

# Available skills
${skillsText}
${describeBoundEntities(frame)}

# Output rules
- Output ONE JSON object with shape: { "steps": [ { "seq", "outputRef"?, "dependsOn"?, "function", "arguments", "usePageContext"? }, ... ] }
- Steps array length normally equals the skeleton length, and each step's seq / outputRef / dependsOn matches the skeleton. EXCEPTION: composite operations (see "# Composite operations") may add a query and/or a proposeChanges step beyond the skeleton.
- "function" should normally equal the suggestedFunction. Override only if the suggested skill is missing from the available skills list.
- "arguments" must obey the parameter schema of the chosen skill.
- For queryCopilotStudio / externalKnowledgeQuery: "query" is REQUIRED — use the intent summary as the query text.
- For Activity steps: temporal=past → temporalMode="completed"; temporal=future → temporalMode="planned".
- For draftActivity/updateActivity: when the user mentions a date or relative day ("today", "yesterday", "next Tuesday", "明天"), set scheduledDate to the resolved YYYY-MM-DD using the Current date above. For a past activity with no explicit date ("visited the customer", "called them"), default scheduledDate to today (${todayIso}). Omit scheduledDate only when truly unknown.
- For draftActivity: "type" is REQUIRED. Infer from context: 拜访/visit/went to/现场 → "visit", 电话/call/phoned/rang → "call", 会议/meeting/met with/讨论会 → "meeting", 邮件/email/sent mail → "email", otherwise → "meeting".
- For draftActivity/updateActivity: "title" is REQUIRED and must be NON-EMPTY, specific, and meaningful — include key info (account name, topic, and/or product), e.g. "Royal London Hospital - BeneVision N22 Demo", "Cedars-Sinai pricing follow-up". NEVER leave title blank, and never use a generic title like "Customer Visit", "Phone Call", or "Meeting". When several activity steps exist (multi-step plans), EVERY step must carry its own specific title.
- For queryActivities: always set date filters. "today" → dateRange="today" OR scheduledDate=${todayIso}. "this week" → dateRange="7days" OR dateFrom/dateTo. "completed today" → dateRange="today" + status="completed". "pending" → status="draft" or "confirmed".
- For queryOpportunities: "active/pipeline" → stage != won/lost. "at risk" → minConfidence=0 maxConfidence=49.

# Page context data reuse
- Check the [Page context] section below. If the page already has the data needed for a step (e.g., the user is on the Activities page viewing this week and the step needs this week's activities), set "usePageContext": true and omit query arguments. The executor will use the page data directly.
- If the page data does NOT cover the step's needs (e.g., step needs next week's data but page shows this week), set "usePageContext": false (or omit it) and provide proper query arguments.
- "usePageContext": true is only valid for query functions (queryActivities, queryOpportunities, queryAccounts, queryContacts), never for draft/update/delete functions.

- Use page-bound entity ids directly (no need to re-ask).
- When a step depends on another (dependsOn includes "$intent_N"), reference the upstream output via "$intent_N.id" or "$intent_N.name" inside arguments.
- Amount conversion: 200k/200K → 200000, 50万 → 500000, 1.5M → 1500000.
- If the entire plan reduces to a single non-DAG step (one intent, no deps, suitable for a single-intent shape), you may output { "function": ..., "arguments": ... } instead. Otherwise always emit the DAG shape.
- Output JSON only, no prose, no markdown.`;
}

function buildUserBlock(
  userMessage: string,
  frame: FrameResult,
  pageContext?: { currentPage: string; summary?: string; pageData?: unknown },
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  conversationStateText?: string
): string {
  const lines: string[] = [];
  lines.push(`[User message]\n${userMessage}`);
  if (frame.explicitNames?.length) {
    lines.push(`[Named entities]\n${frame.explicitNames.map((e) => `${e.kind}:${e.text}`).join(', ')}`);
  }
  if (pageContext) {
    lines.push(`[Page context] ${pageContext.currentPage}${pageContext.summary ? ` — ${pageContext.summary}` : ''}`);
    // Include page data summary so orchestrator can decide usePageContext per step
    if (pageContext.pageData) {
      const pd = pageContext.pageData as Record<string, unknown>;
      const dataKeys = Object.keys(pd);
      const dataSummary = dataKeys.map((k) => {
        const v = pd[k];
        // Skip null/undefined — never emit a placeholder string the LLM might
        // copy verbatim into an argument (this caused accountName="[object]"
        // when the page's account was unresolved/undefined).
        if (v == null) return null;
        if (Array.isArray(v)) return `${k}: ${v.length} records`;
        if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return `${k}: ${v}`;
        if (typeof v === 'object') {
          // Surface a couple of identifying fields instead of a literal placeholder.
          const o = v as Record<string, unknown>;
          const name = o.name ?? o.name1 ?? o.fullName;
          const id = o.id ?? o.Id;
          if (name != null || id != null) {
            return `${k}: ${name ?? ''}${id != null ? ` (id=${id})` : ''}`.trim();
          }
          return null;
        }
        return null;
      }).filter(Boolean).join(', ');
      if (dataSummary) lines.push(`[Page data available] ${dataSummary}`);
    }
  }
  // §9: prefer structured conversation state over raw dialogue. When present,
  // emit the state block and keep only the single most recent turn for tone/
  // detail the state may not capture; otherwise fall back to the last 2 turns.
  if (conversationStateText && conversationStateText.trim()) {
    lines.push(`[Conversation state]\n${conversationStateText.trim()}`);
    const last = (conversationHistory ?? []).slice(-1);
    if (last.length) {
      lines.push(`[Latest turn]\n${last.map((m) => `${m.role}: ${m.content}`).join('\n')}`);
    }
  } else {
    const tail = (conversationHistory ?? []).slice(-2);
    if (tail.length) {
      lines.push(`[Recent dialogue]\n${tail.map((m) => `${m.role}: ${m.content}`).join('\n')}`);
    }
  }
  return lines.join('\n\n');
}

// ----------------------------- Pipeline ----------------------------------

export async function runIntentPipeline(ctx: FrameRunContext): Promise<PipelineResult> {
  const totalStart = Date.now();

  // 1. Frame
  const frameOutcome = await runFrame(ctx);
  if (!frameOutcome.success || !frameOutcome.result) {
    return {
      frame: emptyFrame(),
      frameLatencyMs: frameOutcome.latencyMs,
      skillsCount: 0,
      plan: null,
      planLatencyMs: 0,
      totalLatencyMs: Date.now() - totalStart,
      framePrompt: frameOutcome.prompt,
      frameRetried: frameOutcome.retried,
      frameRetryReason: frameOutcome.retryReason,
      error: agentError('llm', 'frame', 'Frame classification failed', frameOutcome.error),
    };
  }
  const frame = frameOutcome.result;
  const frameLatencyMs = frameOutcome.latencyMs;
  const framePrompt = frameOutcome.prompt;
  const frameRetried = frameOutcome.retried;
  const frameRetryReason = frameOutcome.retryReason;

  // 2. Build skeleton + select skills
  const skeleton = buildSkeleton(frame.intents);
  const skills = selectSkillsForIntents(frame.intents);
  const locale = ctx.locale ?? ((getLocale() === 'zh-Hans' ? 'zh-Hans' : 'en') as 'zh-Hans' | 'en');
  const skillsText = formatSkillsForPrompt(skills, locale);

  // Short-circuit: every intent is None/Chat → no plan worth running.
  const allChat = frame.intents.every((i) => i.salesObject === 'None' && i.cognitiveTask === 'Chat');
  if (allChat) {
    return {
      frame,
      frameLatencyMs,
      skillsCount: skills.length,
      plan: { function: null as unknown as string, arguments: {} },
      planLatencyMs: 0,
      totalLatencyMs: Date.now() - totalStart,
      framePrompt,
      frameRetried,
      frameRetryReason,
    };
  }

  // 3. Orchestrator (LLM call for argument filling — all intents, single or multi)
  const systemPrompt = buildOrchestratorPrompt(frame, skeleton, skillsText, locale);
  const userPrompt = buildUserBlock(ctx.userMessage, frame, ctx.pageContext, ctx.conversationHistory, ctx.conversationStateText);
  // Exact text invokeFlowForLLM serialises and sends — captured for copy in the
  // Frame Inspector so the Orchestrator prompt can be tested offline.
  const planPrompt = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ].map((m) => `${m.role}: ${m.content}`).join('\n');

  const planStart = Date.now();
  // Call in 'text' mode (free-form) and let parseOrchestratorOutput extract the
  // { steps: [...] } object. We do NOT use AI Builder "JSON output" mode: its
  // example-based structured output only supports flat shapes and cannot
  // express our nested DAG schema, so enabling it locked the model onto AI
  // Builder's default sample schema and caused 100% parse failures + retries.
  let planResp = await invokeFlowForLLM({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    responseFormat: 'text',
  }, { label: 'Orchestrator' });
  let plan = planResp.success && planResp.content
    ? parseOrchestratorOutput(planResp.content, skeleton)
    : null;
  // Defensive non-deterministic retry only — should almost never fire.
  let planRetried = false;
  let planRetryReason: string | undefined;
  if (!plan) {
    const firstError = planResp.error;
    // Observability: a plan retry is a degradation — surface it, never silent.
    planRetried = true;
    planRetryReason = planResp.success
      ? 'parse/validation failed on first attempt'
      : `LLM call failed on first attempt: ${firstError ?? 'unknown'}`;
    console.warn(`[Orchestrator] retry fired — ${planRetryReason}`);
    planResp = await invokeFlowForLLM({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      responseFormat: 'text',
    }, { label: 'Orchestrator · retry' });
    if (planResp.success && planResp.content) {
      plan = parseOrchestratorOutput(planResp.content, skeleton);
    }
    if (!planResp.success && !planResp.error && firstError) planResp.error = firstError;
    if (plan) {
      console.warn('[Orchestrator] retry SUCCEEDED — second attempt parsed cleanly');
    } else {
      console.error('[Orchestrator] retry FAILED — both attempts unparseable');
    }
  }
  const planLatencyMs = Date.now() - planStart;

  if (!planResp.success || !planResp.content) {
    return {
      frame,
      frameLatencyMs,
      skillsCount: skills.length,
      plan: null,
      planLatencyMs,
      planRaw: planResp.content,
      totalLatencyMs: Date.now() - totalStart,
      framePrompt,
      planPrompt,
      frameRetried,
      frameRetryReason,
      planRetried,
      planRetryReason,
      error: agentError('llm', 'orchestrator', 'Orchestrator LLM call failed', planResp.error),
    };
  }

  return {
    frame,
    frameLatencyMs,
    skillsCount: skills.length,
    plan,
    planLatencyMs,
    planRaw: planResp.content,
    totalLatencyMs: Date.now() - totalStart,
    framePrompt,
    planPrompt,
    frameRetried,
    frameRetryReason,
    planRetried,
    planRetryReason,
    error: plan ? undefined : agentError('parse', 'orchestrator', 'Orchestrator output parse failed'),
  };
}

function emptyFrame(): FrameResult {
  return {
    intents: [
      { salesObject: 'None', cognitiveTask: 'Chat', temporal: 'none', summary: '', relatesTo: [] },
    ],
    explicitNames: [],
    contextSufficient: false,
    reasoning: 'frame failed',
    confidence: 0,
  };
}

/**
 * Parse the Orchestrator output. We accept either a DAG plan or a single-
 * intent shape. When the model omits seq/outputRef/dependsOn but emitted the
 * right number of steps, fall back to the skeleton's seq/outputRef.
 *
 * Exported for regression testing (composite plans that exceed the skeleton).
 */
export function parseOrchestratorOutput(text: string, skeleton: SkeletonStep[]): SubPromptOutput | null {
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

  // Patch: if the model dropped seq / outputRef / dependsOn, recover them from skeleton.
  // Also handle AI Builder schema constraints: dependsOn may be a comma-separated
  // string instead of an array, and arguments may be a JSON string instead of an object.
  if (
    candidate &&
    typeof candidate === 'object' &&
    Array.isArray((candidate as { steps?: unknown }).steps)
  ) {
    const steps = (candidate as { steps: Array<Partial<DagStep> & { dependsOn?: unknown; arguments?: unknown }> }).steps;
    // Normalize EVERY step's shape regardless of skeleton length. Composite plans
    // (merge / dedupe) legitimately add steps beyond the skeleton, and the model
    // often emits dependsOn as a string ("$intent_0") or arguments as a JSON
    // string. Coercing only inside the length-match block made those plans fail
    // to parse (the "响应解析失败" on merge requests).
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (typeof s.dependsOn === 'string') {
        s.dependsOn = (s.dependsOn as string).split(',').map(v => v.trim()).filter(Boolean) as unknown as string[];
      }
      if (typeof s.arguments === 'string') {
        try { s.arguments = JSON.parse(s.arguments as string); } catch { s.arguments = {}; }
      }
      if (!s.arguments) s.arguments = {};
    }
    // Skeleton recovery (seq / outputRef / function / dependsOn) only when the
    // plan is 1:1 with the skeleton.
    if (steps.length === skeleton.length) {
      const patched: string[] = [];
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        const sk = skeleton[i];
        if (s.seq == null) { s.seq = sk.seq; patched.push(`step${i}.seq`); }
        if (!s.outputRef) { s.outputRef = sk.outputRef; patched.push(`step${i}.outputRef`); }
        if (!s.dependsOn && sk.dependsOn) s.dependsOn = sk.dependsOn;
        if (!s.function && sk.suggestedFunction) { s.function = sk.suggestedFunction; patched.push(`step${i}.function`); }
      }
      // Observability: if we had to repair the model's output, say so — a
      // recovered-but-incomplete plan should never look like a clean one.
      if (patched.length) {
        console.warn('[Orchestrator] output had missing/invalid fields, patched from skeleton:', patched.join(', '));
      }
    }
  }

  const dag = DagPlanSchema.safeParse(candidate);
  if (dag.success) return dag.data;

  const single = SingleIntentSchema.safeParse(candidate);
  if (single.success) return single.data;

  return null;
}

// ----------------------------- Exports -----------------------------------
