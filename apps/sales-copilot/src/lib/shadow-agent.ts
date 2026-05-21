/**
 * Shadow Agent Engine (Orchestrator)
 *
 * Architecture: Router → Orchestrator → Skills → Executor
 *
 * This module is the Orchestrator layer. It receives:
 *   - Frame Shadow classification (Router output)
 *   - User message + context
 *   - Filtered skills list (from skills-selector)
 *
 * It outputs a DAG execution plan — a unified format where:
 *   - Single intent = steps.length === 1
 *   - Multi intent = steps with seq + dependsOn + $ref
 *
 * Runs as a shadow/parallel system alongside Legacy for benchmarking.
 * Does NOT affect production routing until explicitly switched.
 */

import { runFrame, type FrameRunContext, type FrameResult } from './frame-shadow';
import { selectSkills, formatSkillsForPrompt } from './skills-selector';
import { invokeFlowForLLM } from '@/services/power-automate-service';
import { DagPlanSchema, SingleIntentSchema, isDagPlan, type SubPromptOutput, type DagStep } from './dag-schema';
import { getLocale } from '@/lib/i18n';

// ----------------------------- Types ------------------------------------

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

// ----------------------------- Orchestrator Prompt -------------------------

function buildOrchestratorPrompt(
  frame: FrameResult,
  skillsText: string,
  locale: 'zh-Hans' | 'en'
): string {
  if (locale === 'zh-Hans') {
    return `你是一个销售助手的执行规划器。你的任务是把用户的请求转化为一个或多个步骤的执行计划。

# 当前分类
- 销售对象: ${frame.salesObject}
- 认知任务: ${frame.cognitiveTask}
- 时态: ${frame.temporal}
${frame.boundEntities?.account ? `- 已绑定客户: ${frame.boundEntities.account.name} (ID: ${frame.boundEntities.account.id})` : ''}
${frame.boundEntities?.opportunity ? `- 已绑定商机: ${frame.boundEntities.opportunity.name} (ID: ${frame.boundEntities.opportunity.id})` : ''}
${frame.boundEntities?.contact ? `- 已绑定联系人: ${frame.boundEntities.contact.name} (ID: ${frame.boundEntities.contact.id})` : ''}

# 可用技能
${skillsText}

# 输出规则

## 单步骤（用户只有一个意图）
输出 JSON: {"function": "技能名", "arguments": {...}}

## 多步骤（用户有多个意图）
输出 DAG 执行计划:
{
  "steps": [
    { "seq": 1, "outputRef": "$引用名", "function": "技能名", "arguments": {...} },
    { "seq": 2, "dependsOn": ["$引用名"], "function": "技能名", "arguments": {"字段": "$引用名.id", ...} }
  ]
}

## DAG 依赖规则
- 如果创建商机+活动：活动依赖商机（opportunityId = "$opp.id"）
- 如果创建客户+联系人：联系人依赖客户（accountName = "$acct.name"）
- 独立操作可以有相同的 seq（并行）
- 产品推荐（queryCopilotStudio）通常依赖商机上下文

## 时态规则
- temporal = past → 活动 temporalMode = "completed"
- temporal = future → 活动 temporalMode = "planned"
- 已绑定的实体直接用 ID，不需要用户再说

## 金额转换
- 200k / 200K → 200000
- 50万 → 500000
- 1.5M → 1500000

只输出 JSON，不要解释。`;
  }

  return `You are an execution planner for a sales assistant. Transform the user's request into an execution plan of one or more steps.

# Current Classification
- Sales Object: ${frame.salesObject}
- Cognitive Task: ${frame.cognitiveTask}
- Temporal: ${frame.temporal}
${frame.boundEntities?.account ? `- Bound Account: ${frame.boundEntities.account.name} (ID: ${frame.boundEntities.account.id})` : ''}
${frame.boundEntities?.opportunity ? `- Bound Opportunity: ${frame.boundEntities.opportunity.name} (ID: ${frame.boundEntities.opportunity.id})` : ''}
${frame.boundEntities?.contact ? `- Bound Contact: ${frame.boundEntities.contact.name} (ID: ${frame.boundEntities.contact.id})` : ''}

# Available Skills
${skillsText}

# Output Rules

## Single step (user has one intent)
Output JSON: {"function": "skillName", "arguments": {...}}

## Multi step (user has multiple intents)
Output DAG execution plan:
{
  "steps": [
    { "seq": 1, "outputRef": "$refName", "function": "skillName", "arguments": {...} },
    { "seq": 2, "dependsOn": ["$refName"], "function": "skillName", "arguments": {"field": "$refName.id", ...} }
  ]
}

## DAG Dependency Rules
- Opportunity + Activity: Activity depends on Opportunity (opportunityId = "$opp.id")
- Account + Contact: Contact depends on Account (accountName = "$acct.name")
- Independent operations can share the same seq (parallel)
- Product recommendations (queryCopilotStudio) usually depend on opportunity context

## Temporal Rules
- temporal = past → Activity temporalMode = "completed"
- temporal = future → Activity temporalMode = "planned"
- Bound entities: use their IDs directly, don't ask user again

## Amount Conversion
- 200k / 200K → 200000
- 50万 → 500000
- 1.5M → 1500000

Output only JSON, no explanation.`;
}

function buildUserMessage(
  userMessage: string,
  frame: FrameResult,
  pageContext?: { currentPage: string; summary?: string; pageData?: unknown },
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): string {
  let msg = userMessage;

  if (frame.explicitNames?.length) {
    msg += `\n[用户提到的实体: ${frame.explicitNames.map(e => `${e.kind}:${e.text}`).join(', ')}]`;
  }
  if (pageContext?.summary) {
    msg += `\n[页面: ${pageContext.currentPage}, ${pageContext.summary}]`;
  }
  if (conversationHistory?.length) {
    const tail = conversationHistory.slice(-2);
    msg += `\n[最近对话: ${tail.map(m => `${m.role}: ${m.content.slice(0, 100)}`).join(' | ')}]`;
  }

  return msg;
}

// ----------------------------- Pipeline -----------------------------------

/**
 * Run the full shadow pipeline: Frame → Skills Select → Orchestrator → Parse.
 */
export async function runShadowPipeline(ctx: FrameRunContext): Promise<ShadowResult> {
  const totalStart = Date.now();

  // Layer 1: Frame classification
  const frameOutcome = await runFrame(ctx);

  if (!frameOutcome.success || !frameOutcome.result) {
    return {
      frame: { salesObject: 'None', cognitiveTask: 'Chat', temporal: 'none', reasoning: 'frame failed', confidence: 0 },
      frameLatencyMs: frameOutcome.latencyMs,
      skillsCount: 0,
      plan: null,
      planLatencyMs: 0,
      totalLatencyMs: Date.now() - totalStart,
      error: `Frame failed: ${frameOutcome.error}`,
    };
  }

  const frame = frameOutcome.result;
  const frameLatencyMs = frameOutcome.latencyMs;

  // Skills selection based on Frame classification
  const skills = selectSkills(frame);
  const locale = ctx.locale ?? ((getLocale() === 'zh-Hans' ? 'zh-Hans' : 'en') as 'zh-Hans' | 'en');
  const skillsText = formatSkillsForPrompt(skills, locale);

  // Layer 2: Orchestrator — one unified prompt
  const systemPrompt = buildOrchestratorPrompt(frame, skillsText, locale);
  const userPrompt = buildUserMessage(
    ctx.userMessage,
    frame,
    ctx.pageContext,
    ctx.conversationHistory
  );

  const planStart = Date.now();
  const planResp = await invokeFlowForLLM({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });
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
      error: `Orchestrator LLM failed: ${planResp.error}`,
    };
  }

  const plan = parseOutput(planResp.content);

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

function parseOutput(text: string): SubPromptOutput | null {
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { candidate = JSON.parse(m[0]); } catch { return null; }
  }

  const dagResult = DagPlanSchema.safeParse(candidate);
  if (dagResult.success) return dagResult.data;

  const singleResult = SingleIntentSchema.safeParse(candidate);
  if (singleResult.success) return singleResult.data;

  return null;
}

// ----------------------------- Comparison --------------------------------

export function compareShadowVsLegacy(
  shadow: ShadowResult,
  legacyFunction: string | null,
  legacyArgs?: Record<string, unknown>
): ShadowBenchmarkEntry['agreement'] {
  if (!shadow.plan) {
    return { functionMatch: null, argumentOverlap: null };
  }

  let shadowFunction: string | null = null;
  let shadowArgs: Record<string, unknown> = {};

  if (isDagPlan(shadow.plan)) {
    const first = shadow.plan.steps[0];
    shadowFunction = first?.function ?? null;
    shadowArgs = first?.arguments ?? {};
  } else {
    shadowFunction = shadow.plan.function;
    shadowArgs = shadow.plan.arguments;
  }

  const functionMatch = shadowFunction === legacyFunction;

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
