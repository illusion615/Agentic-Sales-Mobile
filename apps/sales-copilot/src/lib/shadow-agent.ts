/**
 * Shadow Agent Engine (Orchestrator)
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
} from './frame-shadow';
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

// ----------------------------- Types -------------------------------------

export interface ShadowResult {
  frame: FrameResult;
  frameLatencyMs: number;
  skillsCount: number;
  plan: SubPromptOutput | null;
  planLatencyMs: number;
  planRaw?: string;
  totalLatencyMs: number;
  error?: string;
}

export interface ShadowBenchmarkEntry {
  ts: number;
  userMessage: string;
  page?: string;
  shadow: ShadowResult;
  legacy?: {
    functionName: string | null;
    arguments?: Record<string, unknown>;
    additionalActions?: unknown[];
    latencyMs: number;
  };
  agreement: {
    functionMatch: boolean | null;
    argumentOverlap: number | null;
  };
}

// ----------------------------- Ring buffer -------------------------------

const BENCHMARK_KEY = 'copilot-shadow-benchmark';
const BENCHMARK_MAX = 50;

export function recordBenchmark(entry: ShadowBenchmarkEntry): void {
  try {
    const list = readBenchmarkLog();
    list.unshift(entry);
    while (list.length > BENCHMARK_MAX) list.pop();
    sessionStorage.setItem(BENCHMARK_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function readBenchmarkLog(): ShadowBenchmarkEntry[] {
  try {
    const raw = sessionStorage.getItem(BENCHMARK_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ShadowBenchmarkEntry[];
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
  const heading = locale === 'zh-Hans'
    ? `你是销售助手的执行规划器。Frame 阶段已经把用户消息拆成了若干 intent，每个 intent 都给出了 salesObject / cognitiveTask / 时态 / 摘要 / 依赖关系。你的工作只有一件：为每个 intent 生成对应的 step.arguments，把整个 DAG 填完整。不要重新分类，也不要拆并 intent。`
    : `You are the execution planner for a sales assistant. The Frame stage has already split the user's message into intents and given each one a salesObject / cognitiveTask / temporal / summary / relatesTo. Your only job is to fill in step.arguments for each intent and assemble the DAG. Do not reclassify, merge, or split intents.`;

  const skeletonLines = skeleton.map((s) => {
    const intent = s.intent;
    const deps = s.dependsOn?.length ? `, dependsOn=${JSON.stringify(s.dependsOn)}` : '';
    const fn = s.suggestedFunction ? `, suggestedFunction="${s.suggestedFunction}"` : '';
    return `  - seq=${s.seq}, outputRef="${s.outputRef}"${deps}, salesObject=${intent.salesObject}, cognitiveTask=${intent.cognitiveTask}, temporal=${intent.temporal}, summary=${JSON.stringify(intent.summary)}${fn}`;
  }).join('\n');

  return `${heading}

# Skeleton (must be preserved one-to-one)
${skeletonLines}

# Available skills
${skillsText}
${describeBoundEntities(frame)}

# Output rules
- Output ONE JSON object with shape: { "steps": [ { "seq", "outputRef"?, "dependsOn"?, "function", "arguments" }, ... ] }
- Steps array length MUST equal the skeleton length, and each step's seq / outputRef / dependsOn must match the skeleton.
- "function" should normally equal the suggestedFunction. Override only if the suggested skill is missing from the available skills list.
- "arguments" must obey the parameter schema of the chosen skill.
- For queryCopilotStudio / externalKnowledgeQuery: "query" is REQUIRED — use the intent summary as the query text.
- For getSalesSummary with Analyze/Recommend cognitive tasks: pass the intent summary in "query" if the parameter accepts it, so the response generator knows the specific question.
- For Activity steps: temporal=past → temporalMode="completed"; temporal=future → temporalMode="planned".
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
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): string {
  const lines: string[] = [];
  lines.push(`[User message]\n${userMessage}`);
  if (frame.explicitNames?.length) {
    lines.push(`[Named entities]\n${frame.explicitNames.map((e) => `${e.kind}:${e.text}`).join(', ')}`);
  }
  if (pageContext) {
    lines.push(`[Page] ${pageContext.currentPage}${pageContext.summary ? ` — ${pageContext.summary}` : ''}`);
  }
  const tail = (conversationHistory ?? []).slice(-2);
  if (tail.length) {
    lines.push(`[Recent dialogue]\n${tail.map((m) => `${m.role}: ${m.content.slice(0, 120)}`).join('\n')}`);
  }
  return lines.join('\n\n');
}

// ----------------------------- Pipeline ----------------------------------

export async function runShadowPipeline(ctx: FrameRunContext): Promise<ShadowResult> {
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
      error: `Frame failed: ${frameOutcome.error ?? 'unknown'}`,
    };
  }
  const frame = frameOutcome.result;
  const frameLatencyMs = frameOutcome.latencyMs;

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
    };
  }

  // Fast-path: single intent → deterministic skill mapping, skip Orchestrator LLM.
  // The Frame already classified the intent; suggestSkillForIntent picks the function.
  // We extract arguments from explicitNames + the intent summary.
  if (frame.intents.length === 1) {
    const singleIntent = frame.intents[0];
    const fn = suggestSkillForIntent(singleIntent);
    const args: Record<string, unknown> = {};
    // Map explicit names from the frame to function arguments
    for (const en of frame.explicitNames) {
      if (en.kind === 'account') args.accountName = en.text;
      else if (en.kind === 'contact') args.contactName = en.text;
      else if (en.kind === 'opportunity') args.opportunityName = en.text;
      else if (en.kind === 'product') args.productName = en.text;
    }
    // Add summary/title for draft intents
    if (singleIntent.cognitiveTask === 'Log' || singleIntent.cognitiveTask === 'Plan') {
      if (!args.title) args.title = singleIntent.summary;
    }
    // Add query for knowledge/recommend/analyze intents
    if (singleIntent.cognitiveTask === 'Knowledge' || singleIntent.cognitiveTask === 'Recommend' || singleIntent.cognitiveTask === 'Analyze') {
      if (!args.query) args.query = singleIntent.summary || ctx.userMessage;
    }
    const singlePlan: SubPromptOutput = {
      steps: [{
        seq: 1,
        outputRef: '$intent_0',
        function: fn ?? 'null',
        arguments: args,
        dependsOn: [],
      }],
    };
    return {
      frame,
      frameLatencyMs,
      skillsCount: skills.length,
      plan: singlePlan,
      planLatencyMs: 0,
      planRaw: JSON.stringify(singlePlan),
      totalLatencyMs: Date.now() - totalStart,
    };
  }

  // 3. Orchestrator (LLM call for multi-intent argument filling)
  const systemPrompt = buildOrchestratorPrompt(frame, skeleton, skillsText, locale);
  const userPrompt = buildUserBlock(ctx.userMessage, frame, ctx.pageContext, ctx.conversationHistory);

  const planStart = Date.now();
  let planResp = await invokeFlowForLLM({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    responseFormat: 'json',
  });
  let plan = planResp.success && planResp.content
    ? parseOrchestratorOutput(planResp.content, skeleton)
    : null;
  // Retry once in text mode on flow parse-JSON failure or client parse failure.
  if (!plan) {
    const firstError = planResp.error;
    planResp = await invokeFlowForLLM({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      responseFormat: 'text',
    });
    if (planResp.success && planResp.content) {
      plan = parseOrchestratorOutput(planResp.content, skeleton);
    }
    if (!planResp.success && !planResp.error && firstError) planResp.error = firstError;
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
      error: `Orchestrator LLM failed: ${planResp.error ?? 'empty'}`,
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
    error: plan ? undefined : 'Orchestrator output parse failed',
  };
}

function emptyFrame(): FrameResult {
  return {
    intents: [
      { salesObject: 'None', cognitiveTask: 'Chat', temporal: 'none', summary: '', relatesTo: [] },
    ],
    explicitNames: [],
    reasoning: 'frame failed',
    confidence: 0,
  };
}

/**
 * Parse the Orchestrator output. We accept either a DAG plan or a single-
 * intent shape. When the model omits seq/outputRef/dependsOn but emitted the
 * right number of steps, fall back to the skeleton's seq/outputRef.
 */
function parseOrchestratorOutput(text: string, skeleton: SkeletonStep[]): SubPromptOutput | null {
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
  if (
    candidate &&
    typeof candidate === 'object' &&
    Array.isArray((candidate as { steps?: unknown }).steps)
  ) {
    const steps = (candidate as { steps: Array<Partial<DagStep>> }).steps;
    if (steps.length === skeleton.length) {
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        const sk = skeleton[i];
        if (s.seq == null) s.seq = sk.seq;
        if (!s.outputRef) s.outputRef = sk.outputRef;
        if (!s.dependsOn && sk.dependsOn) s.dependsOn = sk.dependsOn;
        if (!s.function && sk.suggestedFunction) s.function = sk.suggestedFunction;
        if (!s.arguments) s.arguments = {};
      }
    }
  }

  const dag = DagPlanSchema.safeParse(candidate);
  if (dag.success) return dag.data;

  const single = SingleIntentSchema.safeParse(candidate);
  if (single.success) return single.data;

  return null;
}

// ----------------------------- Comparison --------------------------------

/**
 * Coarse comparison of shadow plan vs legacy intent. Used by the viewer for
 * KPI dashboards. Not used for production routing.
 */
export function compareShadowVsLegacy(
  shadow: ShadowResult,
  legacyFunction: string | null,
  legacyArgs?: Record<string, unknown>
): ShadowBenchmarkEntry['agreement'] {
  if (!shadow.plan) {
    return { functionMatch: null, argumentOverlap: null };
  }

  let shadowFunctions: string[] = [];
  let firstArgs: Record<string, unknown> = {};

  if (isDagPlan(shadow.plan)) {
    shadowFunctions = shadow.plan.steps.map((s) => s.function);
    firstArgs = shadow.plan.steps[0]?.arguments ?? {};
  } else {
    shadowFunctions = shadow.plan.function ? [shadow.plan.function] : [];
    firstArgs = shadow.plan.arguments ?? {};
  }

  const functionMatch = legacyFunction ? shadowFunctions.includes(legacyFunction) : shadowFunctions.length === 0;

  let argumentOverlap: number | null = null;
  if (legacyArgs && Object.keys(legacyArgs).length > 0) {
    const legacyKeys = new Set(Object.keys(legacyArgs));
    const shadowKeys = new Set(Object.keys(firstArgs));
    const intersection = [...legacyKeys].filter((k) => shadowKeys.has(k));
    const union = new Set([...legacyKeys, ...shadowKeys]);
    argumentOverlap = union.size > 0 ? intersection.length / union.size : 1;
  }

  return { functionMatch, argumentOverlap };
}
