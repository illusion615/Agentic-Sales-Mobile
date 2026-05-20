/**
 * Shadow Agent Orchestrator
 *
 * Runs the hierarchical intent recognition pipeline in parallel with Legacy:
 *   Layer 1: Frame Shadow classifier → (object, task)
 *   Layer 2: Sub-prompt → function + arguments (or DAG plan)
 *
 * Results are logged to the shadow ring buffer for benchmark comparison.
 * This module does NOT affect production routing.
 */

import { runFrame, type FrameRunContext, type FrameResult } from './frame-shadow';
import { getSubPrompt, type SubPromptContext } from './sub-prompts/index';
import { invokeFlowForLLM } from '@/services/power-automate-service';
import { DagPlanSchema, SingleIntentSchema, isDagPlan, resolveRefs, type SubPromptOutput, type DagStep } from './sub-prompts/dag-schema';
import { getLocale } from '@/lib/i18n';

// ----------------------------- Types ------------------------------------

export interface ShadowResult {
  /** Layer 1: Frame classification */
  frame: FrameResult;
  frameLatencyMs: number;
  /** Layer 2: Sub-prompt extraction */
  subPromptKey: string;
  subPromptOutput: SubPromptOutput | null;
  subPromptLatencyMs: number;
  subPromptRaw?: string;
  /** Combined */
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
    argumentOverlap: number | null; // 0-1 ratio of matching arg keys
  };
}

// ----------------------------- Ring Buffer --------------------------------

const BENCHMARK_KEY = 'copilot-shadow-benchmark';
const BENCHMARK_MAX = 50;

export function recordBenchmark(entry: ShadowBenchmarkEntry): void {
  try {
    const list = readBenchmarkLog();
    list.unshift(entry);
    while (list.length > BENCHMARK_MAX) list.pop();
    sessionStorage.setItem(BENCHMARK_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
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

// ----------------------------- Orchestrator --------------------------------

/**
 * Run the full shadow pipeline: Frame → Sub-prompt → Parse.
 * Does NOT execute any functions — only produces the intent plan.
 */
export async function runShadowPipeline(ctx: FrameRunContext): Promise<ShadowResult> {
  const totalStart = Date.now();

  // Layer 1: Frame classification
  const frameOutcome = await runFrame(ctx);

  if (!frameOutcome.success || !frameOutcome.result) {
    return {
      frame: { salesObject: 'None', cognitiveTask: 'Chat', temporal: 'none', reasoning: 'frame failed', confidence: 0 },
      frameLatencyMs: frameOutcome.latencyMs,
      subPromptKey: 'None_Chat',
      subPromptOutput: null,
      subPromptLatencyMs: 0,
      totalLatencyMs: Date.now() - totalStart,
      error: `Frame failed: ${frameOutcome.error}`,
    };
  }

  const frame = frameOutcome.result;
  const frameLatencyMs = frameOutcome.latencyMs;

  // Layer 2: Sub-prompt dispatch
  const subPromptDef = getSubPrompt(frame);
  const subPromptKey = `${frame.salesObject}_${frame.cognitiveTask}`;

  if (!subPromptDef) {
    return {
      frame,
      frameLatencyMs,
      subPromptKey,
      subPromptOutput: null,
      subPromptLatencyMs: 0,
      totalLatencyMs: Date.now() - totalStart,
      error: `No sub-prompt registered for ${subPromptKey}`,
    };
  }

  const locale = ctx.locale ?? ((getLocale() === 'zh-Hans' ? 'zh-Hans' : 'en') as 'zh-Hans' | 'en');
  const subCtx: SubPromptContext = {
    userMessage: ctx.userMessage,
    locale,
    frame,
    pageContext: ctx.pageContext ? {
      currentPage: ctx.pageContext.currentPage,
      summary: ctx.pageContext.summary,
      pageData: ctx.pageContext.pageData,
    } : undefined,
    conversationHistory: ctx.conversationHistory,
  };

  const systemPrompt = subPromptDef.buildSystemPrompt(subCtx);
  const userPrompt = subPromptDef.buildUserPrompt(subCtx);

  const subStart = Date.now();
  const subResp = await invokeFlowForLLM({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });
  const subPromptLatencyMs = Date.now() - subStart;

  if (!subResp.success || !subResp.content) {
    return {
      frame,
      frameLatencyMs,
      subPromptKey,
      subPromptOutput: null,
      subPromptLatencyMs,
      subPromptRaw: subResp.content,
      totalLatencyMs: Date.now() - totalStart,
      error: `Sub-prompt LLM failed: ${subResp.error}`,
    };
  }

  // Parse sub-prompt output
  const parsed = parseSubPromptOutput(subResp.content);

  return {
    frame,
    frameLatencyMs,
    subPromptKey,
    subPromptOutput: parsed,
    subPromptLatencyMs,
    subPromptRaw: subResp.content,
    totalLatencyMs: Date.now() - totalStart,
    error: parsed ? undefined : 'Sub-prompt output parse failed',
  };
}

/**
 * Parse sub-prompt LLM output into either SingleIntent or DagPlan.
 */
function parseSubPromptOutput(text: string): SubPromptOutput | null {
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

  // Try DagPlan first (has "steps" array)
  const dagResult = DagPlanSchema.safeParse(candidate);
  if (dagResult.success) return dagResult.data;

  // Try SingleIntent
  const singleResult = SingleIntentSchema.safeParse(candidate);
  if (singleResult.success) return singleResult.data;

  return null;
}

// ----------------------------- DAG Executor --------------------------------

export interface DagExecutionResult {
  success: boolean;
  /** Results keyed by outputRef (e.g. "$opp" → { id: "xxx", name: "..." }) */
  outputs: Record<string, Record<string, unknown>>;
  /** All resolved steps with their final arguments */
  resolvedSteps: Array<DagStep & { resolvedArgs: Record<string, unknown> }>;
  errors: string[];
}

/**
 * Resolve a DAG plan: group by seq, resolve $ref placeholders, return
 * the execution-ready steps. Does NOT actually call executeFunction —
 * that's for the caller to decide (shadow mode just logs, production mode executes).
 */
export function resolveDagPlan(
  steps: DagStep[],
  priorOutputs?: Record<string, Record<string, unknown>>
): DagExecutionResult {
  const outputs: Record<string, Record<string, unknown>> = { ...(priorOutputs || {}) };
  const resolvedSteps: DagExecutionResult['resolvedSteps'] = [];
  const errors: string[] = [];

  // Group by seq
  const groups = new Map<number, DagStep[]>();
  for (const step of steps) {
    const group = groups.get(step.seq) || [];
    group.push(step);
    groups.set(step.seq, group);
  }

  // Process groups in order
  const sortedSeqs = Array.from(groups.keys()).sort((a, b) => a - b);
  for (const seq of sortedSeqs) {
    const group = groups.get(seq)!;
    for (const step of group) {
      // Check dependencies
      if (step.dependsOn) {
        for (const dep of step.dependsOn) {
          if (!outputs[dep]) {
            errors.push(`Step seq=${seq} function=${step.function}: missing dependency ${dep}`);
          }
        }
      }

      // Resolve $ref placeholders in arguments
      const resolvedArgs = resolveRefs(step.arguments, outputs);
      resolvedSteps.push({ ...step, resolvedArgs });

      // Placeholder output for this step (will be filled by actual execution)
      if (step.outputRef) {
        outputs[step.outputRef] = { _placeholder: true, function: step.function };
      }
    }
  }

  return { success: errors.length === 0, outputs, resolvedSteps, errors };
}

// ----------------------------- Comparison --------------------------------

/**
 * Compare shadow output vs legacy output for benchmark logging.
 */
export function compareShadowVsLegacy(
  shadow: ShadowResult,
  legacyFunction: string | null,
  legacyArgs?: Record<string, unknown>
): ShadowBenchmarkEntry['agreement'] {
  if (!shadow.subPromptOutput) {
    return { functionMatch: null, argumentOverlap: null };
  }

  let shadowFunction: string | null = null;
  let shadowArgs: Record<string, unknown> = {};

  if (isDagPlan(shadow.subPromptOutput)) {
    // For DAG plans, compare the first step's function
    const first = shadow.subPromptOutput.steps[0];
    shadowFunction = first?.function ?? null;
    shadowArgs = first?.arguments ?? {};
  } else {
    shadowFunction = shadow.subPromptOutput.function;
    shadowArgs = shadow.subPromptOutput.arguments;
  }

  const functionMatch = shadowFunction === legacyFunction;

  // Compute argument key overlap
  let argumentOverlap: number | null = null;
  if (legacyArgs && Object.keys(legacyArgs).length > 0) {
    const legacyKeys = new Set(Object.keys(legacyArgs));
    const shadowKeys = new Set(Object.keys(shadowArgs));
    const intersection = [...legacyKeys].filter(k => shadowKeys.has(k));
    const union = new Set([...legacyKeys, ...shadowKeys]);
    argumentOverlap = union.size > 0 ? intersection.length / union.size : 1;
  }

  return { functionMatch, argumentOverlap };
}
