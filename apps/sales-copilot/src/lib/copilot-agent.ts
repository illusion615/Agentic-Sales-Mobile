/**
 * Copilot Agent — intent-driven orchestration pipeline.
 *
 * Pass 1: Frame (intent classification + contextSufficient)
 * Pass 1.5: Orchestrator (DAG plan)
 * Pass 2: Skill execution (handler registry)
 * Pass 3: Response generation
 *
 * Auxiliary logic extracted to:
 *   - copilot-agent-types.ts: shared interfaces
 *   - copilot-studio-fallback.ts: CS fallback
 */

import { invokeFlowForLLM } from '@/services/power-automate-service';
import { getLocale } from '@/lib/i18n';
import { getDisplayName, getFunctionListForPrompt } from './function-registry';
import { executeFunction } from './function-executor';
import { 
  parseAndValidateIntent,
  isCircuitBreakerOpen, 
  recordCircuitBreakerFailure, 
  recordCircuitBreakerSuccess,
  recordMetrics,
  getMatchThresholds,
  extractBoundEntities,
  type ValidatedIntentResult,
  type SingleIntent,
  type PendingResolution,
  type ResolutionCandidate,
} from './agent-utils';
import { recordPipelineRun } from './frame';
import { runIntentPipeline, recordBenchmark, type PipelineResult } from './orchestrator';
import { frameToIntent } from './frame-to-intent';
import { agentError, toUserMessage, toDevLog, type AgentError } from './errors';
import { fallbackToCopilotStudio } from './copilot-studio-fallback';
import {
  WEEKLY_REPORT_PATTERN,
  resolveReportWeekFromMessage,
  generateWeeklyReportMarkdown,
  weekRangeLabel,
  type WeeklyReportActivity,
} from './weekly-report';
import {
  type ThinkingProgress,
  type AgentResponse,
  type IntentResult,
  type FuzzyMatchData,
  type IndexedResolution,
  GREETING_PATTERN,
  DAILY_REPORT_PATTERN,
  buildIntentsOverview,
} from './copilot-agent-types';
import type { ConversationState, StateMutation, EntityType, WorkingSetRecord, FocusEntity } from './conversation-state';
import { computeArgumentsHash, isQuery, entityOf, FOCUS_INIT_QUERY, serializeStateForPrompt } from './conversation-state';
import { resolveDataSource } from './data-source-resolver';
import { resolveAnaphora, type AnaphoraRequest } from './anaphora';
import type { BoundEntities } from './agent-utils';

// Re-export types so existing importers don't break
export type { ThinkingProgress, ThinkingStep, AgentResponse, IntentResult } from './copilot-agent-types';

/**
 * Build a ConversationState mutation (§4.2) from a successful query result.
 * Compresses raw Dataverse rows into WorkingSetRecord shape and, when the query
 * resolved to a single record, surfaces it as a focus candidate. Returns
 * undefined for non-query functions so callers can leave stateMutation empty.
 */
function buildQueryStateMutation(
  fn: string,
  args: Record<string, unknown>,
  resultData: unknown,
  filterSummary: string,
): StateMutation | undefined {
  if (!isQuery(fn)) return undefined;
  const rows = Array.isArray(resultData) ? (resultData as Array<Record<string, unknown>>) : [];
  const entity = entityOf(fn);
  const titleOf = (item: Record<string, unknown>): string => {
    switch (entity) {
      case 'account': return String(item.name1 || item.name || '');
      case 'contact': return String(item.fullname || item.name || '');
      case 'opportunity': return String(item.name1 || item.name || '');
      case 'activity': return String(item.title || item.subject || '');
      default: return String(item.name || '');
    }
  };
  const records: WorkingSetRecord[] = rows.map((item) => ({
    id: String(item.id || ''),
    title: titleOf(item),
  }));
  const mutation: StateMutation = {
    executedFunction: fn,
    executedArgsHash: computeArgumentsHash(fn, args || {}),
    filterSummary,
    resultRecords: records,
    rawResultRecords: rows,
  };
  // Single-record resolution becomes a focus candidate (e.g. "the opportunity").
  if (records.length === 1 && records[0].id) {
    mutation.resolvedFocus = [
      {
        type: entity as EntityType,
        id: records[0].id,
        name: records[0].title,
        confidence: FOCUS_INIT_QUERY,
        source: 'query-result',
        turnIntroduced: 0,
      },
    ];
  }
  return mutation;
}

/**
 * B6 (§7): detect a referring expression in the user message and, when present,
 * map it to an AnaphoraRequest. Returns null when no referring expression is
 * found (so the normal pipeline is unaffected). Entity type is inferred from
 * explicit nouns ("客户"/"商机"/"单子"/"联系人"); otherwise left undefined so
 * resolveAnaphora applies the type-unclear rules (§7 row 2).
 */
function detectAnaphora(msg: string): AnaphoraRequest | null {
  const m = msg.trim();
  // ordinal / superlative
  const ordMatch = m.match(/第\s*([0-9一二三四五六七八九十]+)\s*个|the\s+(\d+)(?:st|nd|rd|th)/i);
  const superl = /最贵的?那?个|金额最高|the\s+(?:most\s+expensive|highest|biggest)/i.test(m);
  const plural = /他们|她们|它们|这些|那些|them|these|those/i.test(m);
  const singular = /\b(it|its)\b|它的?|这个|那个|该(?:客户|商机|单子|联系人|项目)?/i.test(m);
  if (!ordMatch && !superl && !plural && !singular) return null;

  let entityType: EntityType | undefined;
  if (/客户|account/i.test(m)) entityType = 'account';
  else if (/商机|机会|单子|项目|opportunit/i.test(m)) entityType = 'opportunity';
  else if (/联系人|contact/i.test(m)) entityType = 'contact';
  else if (/活动|任务|拜访|会议|activit|task|visit|meeting/i.test(m)) entityType = 'activity';

  if (ordMatch) {
    const cn = ordMatch[1];
    const en = ordMatch[2];
    const cnMap: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    const ordinal = en ? parseInt(en, 10) : (/^\d+$/.test(cn) ? parseInt(cn, 10) : cnMap[cn]);
    return { kind: 'ordinal', entityType, ordinal };
  }
  if (superl) {
    return { kind: 'ordinal', entityType, superlative: { field: 'amount', direction: 'max' } };
  }
  if (plural) return { kind: 'plural', entityType };
  return { kind: 'singular', entityType };
}

/**
 * B6 (§7): merge an anaphora-resolved focus into the Orchestrator boundEntities
 * channel (page-bound entities win — they are the strongest signal). Only fills
 * account/opportunity/contact slots (BoundEntities shape). Returns the resolved
 * focus (for the StateMutation) alongside the merged boundEntities.
 */
function applyAnaphora(
  userMessage: string,
  state: ConversationState | undefined,
  pageBound: BoundEntities | undefined,
): { boundEntities: BoundEntities | undefined; resolvedFocus?: FocusEntity[] } {
  if (!state) return { boundEntities: pageBound };
  const req = detectAnaphora(userMessage);
  if (!req) return { boundEntities: pageBound };
  let result;
  try {
    result = resolveAnaphora(state, req);
  } catch (e) {
    console.warn('[ConvState] resolveAnaphora threw:', e);
    return { boundEntities: pageBound };
  }
  if (result.status !== 'resolved') {
    convLog(`[ConvState] anaphora kind=${req.kind} type=${req.entityType ?? '?'} status=${result.status} rule=${result.rule}`);
    return { boundEntities: pageBound };
  }
  const f = result.entity;
  const merged: BoundEntities = { ...(pageBound ?? {}) };
  const slot = f.type === 'account' ? 'account' : f.type === 'opportunity' ? 'opportunity' : f.type === 'contact' ? 'contact' : null;
  // Page-bound wins; only fill an empty slot. Activity focus has no BoundEntities slot.
  if (slot && !merged[slot]) {
    merged[slot] = { id: f.id, name: f.name };
  }
  convLog(`[ConvState] anaphora resolved → ${f.type} "${f.name}"${f.id ? ` (id=${f.id})` : ''} via ${result.rule}`);
  return {
    boundEntities: Object.keys(merged).length ? merged : pageBound,
    resolvedFocus: [{ ...f, turnIntroduced: 0, source: 'user-mention' }],
  };
}

/**
 * Parse JSON from LLM response using Zod validation
  if (intent.additionalActions) {
    intent.additionalActions.forEach((a, i) => {
      if (a.userFacingLabel) {
        out.push({ intentIndex: i + 1, userFacingLabel: a.userFacingLabel });
      }
    });
  }
  return out.length > 1 ? out : undefined;
}

/**
 * Parse JSON from LLM response using Zod validation
 * Falls back to regex extraction if direct parse fails
 */
function parseJsonResponse(text: string): IntentResult | null {
  const validated = parseAndValidateIntent(text);
  if (validated) {
    // Log confidence if present
    if (validated.confidence !== undefined) {
      console.log('[IntentParser] Intent confidence:', validated.confidence);
    }
    return validated as IntentResult;
  }
  return null;
}

/**
 * Process a user message through the Copilot agent
 * Two-pass approach:
 * 1. Intent detection + function call generation
 * 2. Natural language response generation using function result
 */
// Module-level side-channel so the outer wrapper can attach rawIntent to the
// response without threading it through ~30 nested return sites.
let _lastParsedIntent: IntentResult | null = null;
// B6 side-channel: anaphora-resolved focus for this turn, merged into the
// response's stateMutation by the outer wrapper (so all return sites benefit).
// Non-nullable ([] when none) to keep tsc happy across the await boundary.
let _anaphoraResolvedFocus: FocusEntity[] = [];
// C1 side-channel: [ConvState] decision lines collected this turn for the Inspector.
let _convStateDebug: string[] = [];
function convLog(line: string): void {
  console.log(line);
  _convStateDebug.push(line);
}

export async function processMessage(
  userMessage: string,
  context: {
    userId?: string;
    userEmail?: string;
    locale?: string;
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    lastFunctionResult?: unknown;
    lastFunctionCalled?: string;
    pageContext?: {
      currentPage: string;
      pageData?: unknown;
      summary?: string;
    };
    /** Conversation State snapshot (read-only). See conversation-state.ts §4.2. */
    state?: ConversationState;
  },
  onProgress?: (progress: ThinkingProgress) => void
): Promise<AgentResponse> {
  _lastParsedIntent = null;
  _anaphoraResolvedFocus = [];
  _convStateDebug = [];
  const result = await processMessageInner(userMessage, context, onProgress);
  if (_lastParsedIntent && !result.rawIntent) {
    result.rawIntent = _lastParsedIntent;
  }
  // B6: ensure the anaphora-resolved focus reaches the committed state even when
  // the executed path produced no resolvedFocus of its own (e.g. update/draft).
  const anaFocus = _anaphoraResolvedFocus;
  if (anaFocus.length > 0) {
    const existing = result.stateMutation ?? {};
    const mergedFocus = [...anaFocus, ...(existing.resolvedFocus ?? [])];
    result.stateMutation = { ...existing, resolvedFocus: mergedFocus };
  }
  // C1: surface this turn's [ConvState] decision lines for the Inspector.
  if (_convStateDebug.length > 0) {
    result.convStateDebug = [..._convStateDebug];
  }
  return result;
}

async function processMessageInner(
  userMessage: string,
  context: {
    userId?: string;
    userEmail?: string;
    locale?: string;
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    lastFunctionResult?: unknown;
    lastFunctionCalled?: string;
    pageContext?: {
      currentPage: string;
      pageData?: unknown;
      summary?: string;
    };
    /** Conversation State snapshot (read-only). See conversation-state.ts §4.2. */
    state?: ConversationState;
  },
  onProgress?: (progress: ThinkingProgress) => void
): Promise<AgentResponse> {
  const startTime = Date.now();
  const isZh = (context.locale || getLocale()) === 'zh-Hans';

  // Check circuit breaker before making LLM call
  if (isCircuitBreakerOpen()) {
    console.warn('[CopilotAgent] Circuit breaker is OPEN - LLM calls temporarily disabled');
    return {
      success: false,
      content: '',
      error: isZh 
        ? '服务暂时不可用，请稍后重试（30秒后自动恢复）' 
        : 'Service temporarily unavailable, please try again shortly (auto-recovery in 30s)',
      latencyMs: Date.now() - startTime,
    };
  }

  // No need to check llmConfig here — invokeFlowForLLM has its own guard

  const functionList = getFunctionListForPrompt();
  const today = new Date().toISOString().split('T')[0];
  const history = context.conversationHistory || [];

  // Build page context string for the prompt
  let pageContextStr = '';
  if (context.pageContext) {
    const { currentPage, summary, pageData } = context.pageContext;
    if (isZh) {
      pageContextStr = `\n\n当前页面: ${currentPage}`;
      if (summary) pageContextStr += `\n页面摘要: ${summary}`;
      if (pageData) pageContextStr += `\n页面数据: ${JSON.stringify(pageData, null, 2).slice(0, 4000)}`;
    } else {
      pageContextStr = `\n\nCurrent page: ${currentPage}`;
      if (summary) pageContextStr += `\nPage summary: ${summary}`;
      if (pageData) pageContextStr += `\nPage data: ${JSON.stringify(pageData, null, 2).slice(0, 4000)}`;
    }
  }

  // ===== Weekly-report fast-path (D9) =====
  // When the user asks in chat for a weekly report, generate it through the
  // SAME shared pipeline the Activities week-view card uses (D16) and render the
  // markdown in the conversation. The result is cached under the week's key, so
  // the Activities card shows the identical report for that week.
  // NOTE: this must run BEFORE the daily-report routing — DAILY_REPORT_PATTERN's
  // `生成…报` alternative also matches "生成周报".
  if (WEEKLY_REPORT_PATTERN.test(userMessage)) {
    console.log('[CopilotAgent] Weekly-report request detected — generating via shared weekly-report lib');
    if (onProgress) onProgress({ stage: 'intent', status: 'active' });
    try {
      const { weekStart, weekEnd } = resolveReportWeekFromMessage(userMessage);
      const { ActivityService } = await import('@/generated/services/activity-service');
      const all = await ActivityService.getAll();
      const inWeek = all.filter((a) => {
        if (!a.scheduleddate) return false;
        const d = new Date(a.scheduleddate);
        return !Number.isNaN(d.getTime()) && d >= weekStart && d <= weekEnd;
      });
      const payload: WeeklyReportActivity[] = inWeek.map((a) => ({
        title: a.title,
        type: a.type,
        status: a.status,
        scheduledAt: a.scheduleddate,
        accountName: a.account?.name1,
        opportunityName: a.opportunity?.name1,
        notes: a.notes ? String(a.notes) : undefined,
      }));
      const completed = inWeek.filter((a) => a.status === 'completed').length;
      const md = await generateWeeklyReportMarkdown({
        weekStart,
        weekEnd,
        activities: payload,
        completedCount: completed,
        totalCount: inWeek.length,
        locale: isZh ? 'zh-Hans' : 'en',
      });
      if (md) {
        const range = weekRangeLabel(weekStart, weekEnd, isZh ? 'zh-Hans' : 'en');
        const header = isZh ? `**📋 周报 · ${range}**\n\n` : `**📋 Weekly Report · ${range}**\n\n`;
        return {
          success: true,
          content: header + md,
          latencyMs: Date.now() - startTime,
          thinkingSteps: [
            { stage: 'intent' as const, status: 'completed' as const, label: isZh ? '意图识别：生成周报' : 'Intent: Weekly report' },
          ],
        };
      }
      console.warn('[CopilotAgent] Weekly-report generation returned empty — falling through to normal pipeline');
    } catch (e) {
      console.error('[CopilotAgent] Weekly-report generation failed, falling through:', e);
    }
  }

  // ===== Product Knowledge Fast-Path: Route directly to Copilot Studio =====
  // Boss directive (2026-05-17): ALL product-knowledge queries must go to
  // Copilot Studio, never Dataverse. The fast-path here bypasses LLM intent
  // detection for two reliable cases:
  //   1) User is on a Product page (Product Center / Product Detail) — any
  //      product-shaped question is overwhelmingly product knowledge.
  //   2) User is anywhere else but uses *strong* product-knowledge language
  //      (specifications / features / SKUs / manual / datasheet / how does it
  //      work). Weak words like "product" alone are NOT enough off the product
  //      page, because "list products with opportunities" is Dataverse, not CS.
  // Outside these two cases we let the LLM decide — it has the same routing
  // instructions in its system prompt and will pick `queryCopilotStudio` when
  // appropriate; either way the executor passes pageContext + dialog history
  // to CS via the cs-context-builder.
  const isProductPage = context.pageContext?.currentPage === 'Product Center' || 
                        context.pageContext?.currentPage === 'Product Detail';
  // Soft keywords: enough on a product page where the user is clearly talking
  // about the product they're looking at.
  const productSoftKeywords = /product|feature|specification|spec|function|advantage|benefit|comparison|compare|usage|how to use|what is|tell me about|explain|details|产品|功能|规格|参数|优势|特点|对比|使用|介绍|说明/i;
  // Strong keywords: knowledge-base phrasing that's ambiguous nowhere — these
  // route to CS even off the product page (e.g. user asks "what does the SKU
  // X1 spec sheet say about IP rating" from the Home page).
  const productStrongKeywords = /specification sheet|spec sheet|datasheet|data sheet|user manual|product manual|technical manual|ip rating|certification|fda |ce mark|warranty|service interval|maintenance interval|how (does|do) (it|they|this product) work|what (does|is) (the )?(sku|model|product)\s+[A-Z0-9-]+|规格书|技术手册|用户手册|产品手册|说明书|认证|保修/i;
  const isProductKnowledgeQuery = isProductPage && productSoftKeywords.test(userMessage);
  const isStrongProductKnowledge = productStrongKeywords.test(userMessage);
  
  // Also check for queries referencing current product context
  const pageData = context.pageContext?.pageData as { productName?: string; productId?: string } | undefined;
  const currentProductName = pageData?.productName;
  const referencesCurrentProduct = currentProductName && 
    (userMessage.toLowerCase().includes(currentProductName.toLowerCase()) || 
     /this product|this one|it|its|这个产品|它的|这个/i.test(userMessage));
  
  if (isProductKnowledgeQuery || (isProductPage && referencesCurrentProduct) || isStrongProductKnowledge) {
    console.log('[CopilotAgent] Product knowledge query detected, routing to Copilot Studio',
      { isProductPage, isStrongProductKnowledge, referencesCurrentProduct });
    
    // We intentionally pass the user message VERBATIM. The cs-context-builder
    // inside function-executor now layers in page / product / account / dialog
    // context so CS sees a single self-contained payload — no need to fold the
    // product name into the query string here.
    return await fallbackToCopilotStudio(
      userMessage,
      context.locale || getLocale(),
      startTime,
      {
        userId: context.userId,
        userEmail: context.userEmail,
        pageContext: context.pageContext,
        conversationHistory: history,
      },
      onProgress
    );
  }

  // ===== Pass 1: Intent Detection via Frame Pipeline =====
  console.log('[CopilotAgent] Pass 1: Intent detection (frame mode)');


  // Notify progress: intent detection started
  if (onProgress) {
    onProgress({ stage: 'intent', status: 'active' });
  }

  let intent: IntentResult | null = null;

  // ===== Frame mode: Frame + Orchestrator drives production =====
  // Phase 2: derive boundEntities from the current page so the Orchestrator gets
  // the IDs of the account/opportunity/contact the user is viewing (this link was
  // previously missing — pipelineCtx never set boundEntities, so describeBoundEntities
  // always rendered empty and the Orchestrator had to guess from the page summary).
  // B6 (§7): when the message uses a referring expression, resolve it against
  // conversation state and merge the resolved entity into boundEntities (page wins).
  const pageBound = extractBoundEntities(context.pageContext?.pageData);
  const anaphora = applyAnaphora(userMessage, context.state, pageBound);
  const anaphoraResolvedFocus = anaphora.resolvedFocus;
  _anaphoraResolvedFocus = anaphoraResolvedFocus ?? [];
  const pipelineCtx = {
      userMessage,
      pageContext: context.pageContext,
      conversationHistory: history,
      locale: (isZh ? 'zh-Hans' : 'en') as 'zh-Hans' | 'en',
      boundEntities: anaphora.boundEntities,
      conversationStateText: context.state ? serializeStateForPrompt(context.state) : undefined,
    };

    let pipelineResult: PipelineResult;
    try {
      pipelineResult = await runIntentPipeline(pipelineCtx);
    } catch (err) {
      const wrapped = agentError('unknown', 'orchestrator', 'Pipeline threw unexpectedly', err);
      console.error('[CopilotAgent]', toDevLog(wrapped));
      recordCircuitBreakerFailure();
      recordMetrics({ success: false, latencyMs: Date.now() - startTime });
      return {
        success: false,
        content: '',
        error: toUserMessage(wrapped, isZh ? 'zh-Hans' : 'en'),
        latencyMs: Date.now() - startTime,
      };
    }

    // Record the pipeline run for the dev viewer
    try {
      recordPipelineRun({
        ts: Date.now(),
        userMessage,
        page: context.pageContext?.currentPage,
        frame: { success: !pipelineResult.error, result: pipelineResult.frame, latencyMs: pipelineResult.frameLatencyMs, error: pipelineResult.error ? toDevLog(pipelineResult.error) : undefined },
      });
      recordBenchmark({
        ts: Date.now(),
        userMessage,
        page: context.pageContext?.currentPage,
        result: pipelineResult,
      });
    } catch (e) {
      console.warn('[CopilotAgent] frame mode logging failed:', e);
    }

    if (pipelineResult.error || !pipelineResult.plan) {
      const pipeErr = pipelineResult.error ?? agentError('unknown', 'orchestrator', 'No plan produced');
      console.warn('[CopilotAgent]', toDevLog(pipeErr));
      recordCircuitBreakerFailure();
      recordMetrics({ success: false, latencyMs: Date.now() - startTime });
      return {
        success: false,
        content: '',
        error: toUserMessage(pipeErr, isZh ? 'zh-Hans' : 'en'),
        latencyMs: Date.now() - startTime,
      };
    } else {
      const translated = frameToIntent(pipelineResult);
      if (!translated) {
        // ===== Chat lane (Phase 3a) =====
        // When the Frame classified the message as conversational (None|Chat) —
        // a greeting, thanks, small talk — there is no actionable function and
        // frameToIntent returns null. Previously this hit a harsh "Could not
        // determine an actionable intent. Please rephrase." wall. Instead, give
        // a friendly LLM-generated reply, like a real assistant would.
        const frameIntents = (pipelineResult.frame?.intents ?? []) as Array<{ salesObject?: string; cognitiveTask?: string }>;
        const isConversational =
          frameIntents.length > 0 &&
          frameIntents.every((i) => i?.salesObject === 'None' && i?.cognitiveTask === 'Chat');
        if (isConversational) {
          console.log('[CopilotAgent] Chat lane — generating a conversational reply');
          if (onProgress) onProgress({ stage: 'generating', status: 'active' });
          const chatSystem = isZh
            ? '你是一位友好、专业的销售助手。用户刚刚说了一句寒暄、感谢或闲聊。用一到两句话自然地回应，保持温暖且简洁。如果合适，可以轻描淡写地提示你能帮忙查询客户、商机、活动或安排跟进——但不要生硬推销，也不要罗列功能清单。'
            : 'You are a friendly, professional sales assistant. The user just made small talk, a greeting, or said thanks. Reply naturally in one or two sentences — warm and concise. If it fits, lightly mention you can help look up accounts, opportunities, activities, or plan follow-ups — but do not hard-sell or list features.';
          let chatContent = '';
          try {
            const chatResp = await invokeFlowForLLM({
              messages: [
                { role: 'system', content: chatSystem },
                { role: 'user', content: userMessage },
              ],
              responseFormat: 'text',
            });
            if (chatResp.success && chatResp.content) chatContent = chatResp.content.trim();
          } catch (e) {
            console.warn('[CopilotAgent] Chat lane LLM failed:', e);
          }
          if (!chatContent) {
            // Fallback only if the LLM is unavailable — still friendly, never an error.
            chatContent = isZh ? '好的！需要我帮你查客户、商机或安排跟进随时说。' : "You got it! Happy to help with accounts, opportunities, or planning follow-ups whenever you need.";
          }
          recordCircuitBreakerSuccess();
          if (onProgress) onProgress({ stage: 'generating', status: 'completed' });
          return {
            success: true,
            content: chatContent,
            latencyMs: Date.now() - startTime,
            thinkingSteps: [
              { stage: 'intent' as const, status: 'completed' as const, label: isZh ? '日常对话' : 'Chat' },
            ],
          };
        }

        recordCircuitBreakerFailure();
        recordMetrics({ success: false, latencyMs: Date.now() - startTime });
        return {
          success: false,
          content: '',
          error: isZh ? '未能解析出可执行的操作，请换一种方式描述。' : 'Could not determine an actionable intent. Please rephrase.',
          latencyMs: Date.now() - startTime,
        };
      }
      recordCircuitBreakerSuccess();
      intent = translated as IntentResult;
      _lastParsedIntent = intent;
      console.log('[INTENT/frame] function=' + intent.function,
        'args=' + JSON.stringify(intent.arguments || {}),
        'extras=' + (intent.additionalActions?.length ?? 0),
        'resolutions=' + (intent.resolutions?.length ?? 0));
    }

  // Notify progress: intent detection completed
  // In frame mode, surface ALL planned functions (primary + additionalActions)
  // so the user can see the full multi-step plan in the thinking row.
  const buildIntentLabel = (): string => {
    if (!intent?.function) return isZh ? '直接回复' : 'Direct Response';
    const primary = getDisplayName(intent.function, isZh ? 'zh-Hans' : 'en-US');
    const extras = (intent.additionalActions ?? []).filter((a) => a.function);
    if (!extras.length) return primary;
    const extraLabels = extras.map((a) => getDisplayName(a.function, isZh ? 'zh-Hans' : 'en-US'));
    return [primary, ...extraLabels].join(' → ');
  };
  const intentLabel = buildIntentLabel();
  // Phase B: for multi-intent runs the overview message + per-task announces already
  // communicate the full plan; the chained "Intent: A → B → C" step becomes redundant
  // (and misleading when it appears scoped under Task 1/M). Suppress it in that case.
  const hasMultipleIntents = (intent?.additionalActions ?? []).some((a) => a?.function);
  if (onProgress && !hasMultipleIntents) {
    onProgress({ stage: 'intent', status: 'completed', intentLabel });
  }

  // FAILURE A: JSON parse failed - fallback to Copilot Studio
  if (!intent) {
    console.warn('[CopilotAgent] JSON parse failed, falling back to Copilot Studio');
    return await fallbackToCopilotStudio(
      userMessage,
      context.locale || getLocale(),
      startTime,
      {
        userId: context.userId,
        userEmail: context.userEmail,
        pageContext: context.pageContext,
        conversationHistory: history,
      },
      onProgress
    );
  }

  // FAILURE B: No function matched
  if (!intent.function) {
    // If it's a simple greeting, return the direct response
    const directResp = intent.directResponse || '';
    if (directResp && (GREETING_PATTERN.test(userMessage.trim()) || DAILY_REPORT_PATTERN.test(userMessage))) {
      return {
        success: true,
        content: directResp,
        latencyMs: Date.now() - startTime,
        thinkingSteps: [
          ...(hasMultipleIntents ? [] : [{ stage: 'intent' as const, status: 'completed' as const, label: isZh ? `意图识别：${intentLabel}` : `Intent: ${intentLabel}` }])
        ],
      };
    }
    
    // Otherwise, fallback to Copilot Studio for general questions
    console.warn('[CopilotAgent] No function matched, falling back to Copilot Studio');
    return await fallbackToCopilotStudio(
      userMessage,
      context.locale || getLocale(),
      startTime,
      {
        userId: context.userId,
        userEmail: context.userEmail,
        pageContext: context.pageContext,
        conversationHistory: history,
      },
      onProgress
    );
  }

  // ===== Single-executor guard (Phase 1: unify execution on the IntentQueue) =====
  // The IntentQueue runtime is the SOLE execution engine. When copilot-context's
  // shouldUseQueue() will route this intent to the queue, executing it here too is
  // pure double-execution — the agent's result is discarded by the queue fork anyway,
  // yet executeFunction runs twice (matching + the operation), causing duplicate
  // Dataverse writes and the wasted second pass seen in logs.
  //
  // So: when the intent will be queue-handled, return early with ONLY the intent +
  // thinking steps. copilot-context reads rawIntent (attached by the outer wrapper)
  // and rebuilds/executes from it. This predicate MUST mirror shouldUseQueue exactly.
  const willUseQueue =
    intent.function.startsWith('draft') ||
    (intent.additionalActions?.length ?? 0) > 0 ||
    intent.requiresMatching === true ||
    (intent.resolutions?.length ?? 0) > 0;
  if (willUseQueue) {
    console.log('[CopilotAgent] Deferring execution to the IntentQueue (single executor) — no agent-side run');
    return {
      success: true,
      content: '',
      functionCalled: intent.function,
      functionDisplayName: getDisplayName(intent.function, isZh ? 'zh-Hans' : 'en-US'),
      latencyMs: Date.now() - startTime,
      thinkingSteps: [
        ...(hasMultipleIntents ? [] : [{ stage: 'intent' as const, status: 'completed' as const, label: isZh ? `意图识别：${intentLabel}` : `Intent: ${intentLabel}` }]),
      ],
    };
  }

  // ===== Smart Matching: Pre-check for entity matching before draft functions =====
  // DEAD CODE (single-executor refactor): the `willUseQueue` guard above returns
  // early whenever `requiresMatching` is true or `resolutions.length > 0`, so the
  // condition below can never be satisfied. All entity matching now happens in the
  // IntentQueue runtime. This block is inert and slated for physical removal; it is
  // kept temporarily only to keep the diff small. Do NOT add new logic here.
  // I-3 Slice 2: serial resolution chain. Walks `resolutions[]` (or the legacy single
  // `matchTarget` wrapped into a one-element array). Each iteration may:
  //   - auto-inject a resolved ID into intent.arguments (silent) and continue,
  //   - or block by returning a selection card / awaiting-clarification, carrying
  //     `remainingResolutions` + `resolvedSoFar` so Context cascade (Slice 3) can resume.
  if (intent.requiresMatching && (intent.resolutions?.length || intent.matchTarget)) {
    const normalizedResolutions = intent.resolutions?.length
      ? intent.resolutions
      : [{ entityType: intent.matchTarget!.entityType, query: intent.matchTarget!.query }];
    const resolvedSoFar: Record<string, string> = {};
    let blockingResponse: AgentResponse | null = null;
    /** Phase B: intent index of the resolution that produced blockingResponse. */
    let blockingIntentIndex: number | undefined = undefined;
    console.log('[CopilotAgent] Resolution chain length:', normalizedResolutions.length);

    for (let _resIdx = 0; _resIdx < normalizedResolutions.length; _resIdx++) {
      const currentResolution = normalizedResolutions[_resIdx];
      const remainingResolutions = normalizedResolutions.slice(_resIdx + 1);
      const { entityType, query } = currentResolution;

      // I-3 Slice 2: scopeBy injection — if this step depends on an earlier-resolved entity,
      // inject that entity's ID into intent.arguments BEFORE the fuzzy match so the match
      // call can scope its search (e.g. find contact within the resolved account).
      if (currentResolution.scopeBy && resolvedSoFar[currentResolution.scopeBy]) {
        const scopeKey = `${currentResolution.scopeBy}Id`;
        intent.arguments = { ...(intent.arguments || {}), [scopeKey]: resolvedSoFar[currentResolution.scopeBy] };
        console.log(`[CopilotAgent] Scope injection: ${scopeKey}=${resolvedSoFar[currentResolution.scopeBy]} for ${entityType} resolution`);
      }

      console.log('[CopilotAgent] Smart matching step', _resIdx + 1, 'of', normalizedResolutions.length, ':', entityType, query, '| remaining after this:', remainingResolutions.length);
      console.log('[CopilotAgent] intent.arguments before matching:', JSON.stringify(intent.arguments, null, 2));
    
    // Notify progress: matching phase started
    if (onProgress) {
      onProgress({ stage: 'matching', status: 'active', detail: isZh ? `正在查找匹配的${entityType === 'account' ? '客户' : entityType === 'contact' ? '联系人' : '商机'}...` : `Finding matching ${entityType}...` });
    }
    
    // Execute fuzzy match function
    const matchFunctionName = entityType === 'account' ? 'fuzzyMatchAccount' :
                             entityType === 'contact' ? 'fuzzyMatchContact' :
                             entityType === 'activity' ? 'fuzzyMatchActivity' :
                             'fuzzyMatchOpportunity';
    
    try {
      const matchResult = await executeFunction(
        matchFunctionName,
        { query, accountId: intent.arguments?.accountId as string | undefined },
        { userId: context.userId, userEmail: context.userEmail }
      );
      
      console.log('[CopilotAgent] Match result:', matchResult);
      
      if (matchResult.success && matchResult.data) {
        const matchData = matchResult.data as FuzzyMatchData;
        
        // Notify progress: matching completed
        if (onProgress) {
          const highConfMatches = matchData.matches.filter((m: { score: number }) => m.score >= getMatchThresholds().high);
          onProgress({ 
            stage: 'matching', 
            status: 'completed', 
            detail: isZh 
              ? `找到 ${highConfMatches.length} 个高置信度匹配` 
              : `Found ${highConfMatches.length} high-confidence match${highConfMatches.length === 1 ? '' : 'es'}` 
          });
        }
        
        // If high confidence exact match found (score >= threshold.high), handle based on entity type
        if (matchData.confidence === 'high' && matchData.exactMatch && matchData.exactMatch.score >= getMatchThresholds().high) {
          console.log('[CopilotAgent] High confidence match found:', matchData.exactMatch.name, 'score:', matchData.exactMatch.score);
          
          // For draftAccount, show match selection card since user might be trying to create a duplicate
          if (intent.function === 'draftAccount') {
            const highConfAccountMatches = matchData.matches.filter((m: { score: number }) => m.score >= getMatchThresholds().high);
            // Only show selection if there are actual high-confidence matches to display
            if (highConfAccountMatches.length > 0) {
              blockingResponse = {
                success: true,
                content: isZh 
                  ? `找到 ${highConfAccountMatches.length} 个可能匹配的客户，请确认是否使用已有记录，还是创建新客户：`
                  : `Found ${highConfAccountMatches.length} possible matching account${highConfAccountMatches.length === 1 ? '' : 's'}. Please confirm if you want to use an existing record or create a new account:`,
                functionCalled: matchFunctionName,
                functionDisplayName: isZh ? '智能匹配' : 'Smart Matching',
                functionResult: {
                  ...matchData,
                  matches: highConfAccountMatches,
                },
                latencyMs: Date.now() - startTime,
                thinkingSteps: [
                  ...(hasMultipleIntents ? [] : [{ stage: 'intent' as const, status: 'completed' as const, label: isZh ? `意图识别：${intentLabel}` : `Intent: ${intentLabel}` }]),
                  { stage: 'matching', status: 'completed', label: isZh ? `找到 ${highConfAccountMatches.length} 个匹配客户` : `Found ${highConfAccountMatches.length} matching account${highConfAccountMatches.length === 1 ? '' : 's'}` },
                ],
              };
              blockingIntentIndex = (currentResolution as IndexedResolution).intentIndex;
              break;
            } else {
              // No high-confidence account matches - proceed directly to create new account
              console.log('[CopilotAgent] No high-confidence account matches, proceeding to create new account');
            }
          }
          
          // For draftActivity with activity matching - if found exact match with high score, show duplicate warning
          if (intent.function === 'draftActivity' && entityType === 'activity') {
            const highConfActivityMatches = matchData.matches.filter((m: { score: number }) => m.score >= getMatchThresholds().high);
            // Only show selection if there are actual high-confidence matches to display
            if (highConfActivityMatches.length > 0) {
              // Show selection card for potential duplicate activity
              blockingResponse = {
                success: true,
                content: isZh 
                  ? `发现 ${highConfActivityMatches.length} 个可能重复的活动记录。您可以选择编辑已有记录，或创建新活动：`
                  : `Found ${highConfActivityMatches.length} potentially duplicate activit${highConfActivityMatches.length === 1 ? 'y' : 'ies'}. You can edit an existing record or create a new activity:`,
                functionCalled: matchFunctionName,
                functionDisplayName: isZh ? '智能匹配' : 'Smart Matching',
                functionResult: {
                  ...matchData,
                  matches: highConfActivityMatches,
                  pendingIntent: {
                    function: intent.function,
                    arguments: intent.arguments,
                    ...((intent.additionalActions?.length ?? 0) > 0 ? { additionalActions: intent.additionalActions } : {}),
                  },
                },
                latencyMs: Date.now() - startTime,
                thinkingSteps: [
                  ...(hasMultipleIntents ? [] : [{ stage: 'intent' as const, status: 'completed' as const, label: isZh ? `意图识别：${intentLabel}` : `Intent: ${intentLabel}` }]),
                  { stage: 'matching', status: 'completed', label: isZh ? `发现 ${highConfActivityMatches.length} 个类似活动` : `Found ${highConfActivityMatches.length} similar activit${highConfActivityMatches.length === 1 ? 'y' : 'ies'}` },
                ],
              };
              blockingIntentIndex = (currentResolution as IndexedResolution).intentIndex;
              break;
            } else {
              // No high-confidence activity matches - proceed directly to create new activity
              console.log('[CopilotAgent] No high-confidence activity matches, proceeding to create new activity');
            }
          }
          
          // For draft functions with account matching, inject the matched account data
          if ((intent.function === 'draftActivity' || intent.function === 'draftOpportunity' || intent.function === 'draftContact') && entityType === 'account') {
            intent.arguments = {
              ...(intent.arguments || {}),
              accountId: matchData.exactMatch.id,
              accountName: matchData.exactMatch.name,
            };
            resolvedSoFar.account = matchData.exactMatch.id;
            console.log('[CopilotAgent] Injected matched account into draft:', matchData.exactMatch.name);
            // Continue to execute the draft function with the correct account data
          }
          
          // For draft functions with contact matching, inject the matched contact AND its account data
          if ((intent.function === 'draftActivity') && entityType === 'contact') {
            const contactMatch = matchData.exactMatch!;
            intent.arguments = {
              ...(intent.arguments || {}),
              contactId: contactMatch.id,
              contactName: contactMatch.name,
              // Also inject the contact's account information
              accountId: contactMatch.accountId || (intent.arguments?.accountId as string) || '',
              accountName: contactMatch.accountName || (intent.arguments?.accountName as string) || '',
            };
            resolvedSoFar.contact = contactMatch.id;
            if (contactMatch.accountId) resolvedSoFar.account = contactMatch.accountId;
            console.log('[CopilotAgent] Injected matched contact with account into draft:', contactMatch.name, 'account:', contactMatch.accountName);
            // Continue to execute the draft function with the correct contact data
          }
        }
        
        // If medium/low confidence or multiple matches, show selection card
        // Filter to only show high-confidence matches (score >= threshold.high)
        const highConfidenceMatches = matchData.matches.filter((m: { score: number }) => m.score >= getMatchThresholds().high);
        
        // If there are high-confidence matches and needs confirmation, show selection
        if (highConfidenceMatches.length > 0) {
          // For single high-confidence match (>90%), auto-select for account/contact/opportunity
          if (highConfidenceMatches.length === 1 && highConfidenceMatches[0].score >= getMatchThresholds().autoSelect) {
            const autoMatch = highConfidenceMatches[0];
            console.log(`[CopilotAgent] Auto-selecting single high-confidence ${entityType} match:`, autoMatch.name, 'score:', autoMatch.score);
            
            // Inject the matched entity into intent.arguments based on entity type
            if (entityType === 'account') {
              intent.arguments = {
                ...(intent.arguments || {}),
                accountId: autoMatch.id,
                accountName: autoMatch.name,
              };
              resolvedSoFar.account = autoMatch.id;
            } else if (entityType === 'contact') {
              // For contact match, also inject the contact's account information
              intent.arguments = {
                ...(intent.arguments || {}),
                contactId: autoMatch.id,
                contactName: autoMatch.name,
                // Inject account info from the matched contact
                accountId: autoMatch.accountId || (intent.arguments?.accountId as string) || '',
                accountName: autoMatch.accountName || (intent.arguments?.accountName as string) || '',
              };
              resolvedSoFar.contact = autoMatch.id;
              if (autoMatch.accountId) resolvedSoFar.account = autoMatch.accountId;
              console.log(`[CopilotAgent] Injected contact with account info:`, {
                contactId: autoMatch.id,
                contactName: autoMatch.name,
                accountId: autoMatch.accountId,
                accountName: autoMatch.accountName,
              });
            } else if (entityType === 'opportunity') {
              intent.arguments = {
                ...(intent.arguments || {}),
                opportunityId: autoMatch.id,
                opportunityName: autoMatch.name,
              };
              resolvedSoFar.opportunity = autoMatch.id;
            }
            console.log(`[CopilotAgent] Injected auto-matched ${entityType} into draft:`, autoMatch.name);
            // Continue to execute the draft function with the matched entity data
          } else {
            // Multiple matches or single match with score <= 90, show selection card
            console.log('[CopilotAgent] Showing selection card for', highConfidenceMatches.length, 'high-confidence matches');
            blockingResponse = {
              success: true,
              content: isZh 
                ? `找到 ${highConfidenceMatches.length} 个高置信度匹配的${entityType === 'account' ? '客户' : entityType === 'contact' ? '联系人' : entityType === 'activity' ? '活动' : '商机'}，请选择一个：`
                : `Found ${highConfidenceMatches.length} high-confidence matching ${entityType}(s). Please select one:`,
              functionCalled: matchFunctionName,
              functionDisplayName: isZh ? '智能匹配' : 'Smart Matching',
              functionResult: {
                ...matchData,
                // Only include high-confidence matches
                matches: highConfidenceMatches,
                // Surface low-confidence (20-70) for the card's "Show more" fold-out
                lowConfidenceMatches: matchData.matches.filter((m: { score: number }) => m.score < 70 && m.score >= 20),
                // Pass entity type so UI knows how to handle selection
                entityType,
                // Pass original intent so UI can continue after selection
                pendingIntent: (() => {
                  console.log('[CopilotAgent] Building pendingIntent with arguments:', JSON.stringify(intent.arguments, null, 2));
                  return {
                    function: intent.function,
                    arguments: intent.arguments,
                    // I-3 Slice 2: carry remaining queue for Context cascade.
                    remainingResolutions: remainingResolutions.length > 0 ? remainingResolutions : undefined,
                    ...((intent.additionalActions?.length ?? 0) > 0 ? { additionalActions: intent.additionalActions } : {}),
                  };
                })(),
              },
              latencyMs: Date.now() - startTime,
              thinkingSteps: [
                ...(hasMultipleIntents ? [] : [{ stage: 'intent' as const, status: 'completed' as const, label: isZh ? `意图识别：${intentLabel}` : `Intent: ${intentLabel}` }]),
                { stage: 'matching', status: 'completed', label: isZh ? `找到 ${highConfidenceMatches.length} 个高置信度匹配` : `Found ${highConfidenceMatches.length} high-confidence matches` },
              ],
            };
            blockingIntentIndex = (currentResolution as IndexedResolution).intentIndex;
            break;
          }
        } else {
          const isDraftFn = typeof intent.function === 'string' && intent.function.startsWith('draft');
          if (isDraftFn) {
            const topCandidates: ResolutionCandidate[] = matchData.matches.slice(0, 3).map((m: { id: string; name: string; score: number; accountName?: string; title?: string; phone?: string; email?: string }) => ({
              id: m.id,
              name: m.name,
              score: m.score,
              subtitle: m.accountName,
              title: m.title,
              phone: m.phone,
              email: m.email,
              accountName: m.accountName,
            }));
            const pendingKind: 'contact' | 'account' | 'opportunity' =
              entityType === 'activity' ? 'opportunity' : (entityType as 'contact' | 'account' | 'opportunity');
            const pending: PendingResolution = {
              id: 'pr-' + Date.now(),
              kind: pendingKind,
              query,
              candidates: topCandidates,
              status: 'pending',
            };
            const kindZh = pendingKind === 'contact' ? '联系人' : pendingKind === 'account' ? '客户' : '商机';
            const fallback = isZh
              ? `未找到与 "${query}" 匹配的${kindZh}。回复"新建"以新建，或回复其他名称重新搜索，或回复"跳过"以不关联。`
              : `No ${pendingKind} matches "${query}". Reply "create", or reply with another name, or "skip".`;
            console.log('[CopilotAgent] I-2 awaiting-clarification:', pendingKind, query);
            blockingResponse = {
              success: true,
              content: fallback,
              functionCalled: matchFunctionName,
              functionDisplayName: isZh ? '需要澄清' : 'Needs clarification',
              awaitingClarification: {
                kind: 'awaiting-clarification',
                pendingResolutions: [pending],
                originalIntent: {
                  function: intent.function as string,
                  arguments: (intent.arguments || {}) as Record<string, unknown>,
                  // G-1: carry inferred siblings so the resume helper can rerun them
                  // after the primary clarification is resolved.
                  ...(intent.additionalActions && intent.additionalActions.length > 0
                    ? { additionalActions: intent.additionalActions.map((a) => ({
                        function: a.function,
                        arguments: a.arguments || {},
                        reason: a.reason,
                      })) }
                    : {}),
                },
                // I-3 Slice 2: carry remaining queue + resolvedSoFar for Context cascade.
                remainingResolutions: remainingResolutions.length > 0 ? remainingResolutions : undefined,
                resolvedSoFar: Object.keys(resolvedSoFar).length > 0 ? { ...resolvedSoFar } : undefined,
              },
              latencyMs: Date.now() - startTime,
              thinkingSteps: [
                ...(hasMultipleIntents ? [] : [{ stage: 'intent' as const, status: 'completed' as const, label: isZh ? `意图识别：${intentLabel}` : `Intent: ${intentLabel}` }]),
                { stage: 'matching', status: 'completed', label: isZh ? `未找到 ${kindZh} 匹配，等待用户决断` : `No ${pendingKind} match, awaiting user` },
              ],
            };
            blockingIntentIndex = (currentResolution as IndexedResolution).intentIndex;
            break;
          }
          // No high-confidence matches, proceed with creating new record
          console.log('[CopilotAgent] No high-confidence matches, proceeding with function execution');
        }
        
        // No matches found or low confidence single match for activity - proceed with creating new record
        console.log('[CopilotAgent] Proceeding with function execution (no blocking matches)');
      }
    } catch (matchError) {
      console.warn('[CopilotAgent] Matching error, proceeding without match:', matchError);
    }
    } // end for-loop over normalizedResolutions

    if (blockingResponse) {
      if (blockingIntentIndex !== undefined) {
        blockingResponse.currentIntentIndex = blockingIntentIndex;
      }
      blockingResponse.intentsOverview = buildIntentsOverview(intent);
      return blockingResponse;
    }
  }

  // ===== Execute Function =====
  const fnDisplayName = getDisplayName(intent.function, isZh ? 'zh-Hans' : 'en-US');
  console.log('[CopilotAgent] Executing function:', intent.function, intent.arguments);
  
  // Notify progress: function execution started
  if (onProgress) {
    onProgress({ stage: 'executing', status: 'active', functionDisplayName: fnDisplayName });
  }
  
  let functionResult;
  
  // Check if this step should use page context data instead of querying Dataverse
  const shouldUsePageContext = (intent as unknown as Record<string, unknown>).usePageContext === true
    && context.pageContext?.pageData
    && ['queryActivities', 'queryOpportunities', 'queryAccounts', 'queryContacts'].includes(intent.function);

  // Check if Frame determined the conversation history data can satisfy this request
  const CONTEXT_REUSABLE_FUNCTIONS = ['queryActivities', 'queryOpportunities', 'queryAccounts', 'queryContacts'];
  const explicitQueryArgs = Object.keys(intent.arguments || {}).length > 0;
  const shouldUseConversationContext = intent.contextSufficient === true
    && context.lastFunctionResult
    && !explicitQueryArgs
    && CONTEXT_REUSABLE_FUNCTIONS.includes(intent.function);

  // ===== B5 (§6 / §14.1): deterministic data-source decision takes over =====
  // When conversation state is present, resolveDataSource (rule-based, hash-keyed)
  // REPLACES the non-deterministic LLM contextSufficient gate. A 'reuse' decision
  // replays the exact hash-matched working set's raw rows through the normal
  // display/analysis pipeline — no re-query, correct data, full display. When no
  // state is present we fall back to the legacy contextSufficient behaviour.
  let reuseWorkingSetRaw: unknown[] | null = null;
  if (context.state && isQuery(intent.function)) {
    try {
      const decision = resolveDataSource(
        { fn: intent.function, args: intent.arguments || {} },
        context.state,
      );
      const legacy = shouldUseConversationContext ? 'reuse(lastResult)' : 'requery';
      const agree =
        (decision.kind === 'reuse' && shouldUseConversationContext) ||
        (decision.kind !== 'reuse' && !shouldUseConversationContext);
      if (decision.kind === 'reuse') {
        const ws = context.state.workingSets.find((w) => w.id === decision.workingSetId);
        if (ws && Array.isArray(ws.rawRecords) && ws.rawRecords.length > 0) {
          reuseWorkingSetRaw = ws.rawRecords;
        }
      }
      convLog(
        `[ConvState] fn=${intent.function} decision=${decision.kind} legacy=${legacy} agree=${agree} ` +
          `reuseApplied=${reuseWorkingSetRaw !== null} hash=${computeArgumentsHash(intent.function, intent.arguments || {})}`,
      );
    } catch (e) {
      console.warn('[ConvState] resolveDataSource threw, falling back to requery:', e);
    }
  }
  // Legacy reuse only when there is no conversation state to drive the decision.
  const legacyReuse = !context.state && shouldUseConversationContext;

  
  if (shouldUsePageContext) {
    console.log('[CopilotAgent] Using page context data for', intent.function);
    const pd = context.pageContext!.pageData as Record<string, unknown>;
    // Extract the relevant data from page context
    const contextData = pd.dayActivities || pd.activities || pd.opportunities || pd.accounts || pd.contacts || [];
    const records = Array.isArray(contextData) ? contextData : [];
    functionResult = {
      success: true,
      data: records,
      message: `Found ${records.length} records from page context`,
    };
  } else if (reuseWorkingSetRaw) {
    // B5 (§6): deterministic reuse — replay the hash-matched working set's raw
    // rows through the normal pipeline. Same data as a re-query, no round-trip.
    console.log('[ConvState] reusing working set (', reuseWorkingSetRaw.length, 'records) for', intent.function);
    _convStateDebug.push(`[ConvState] reused ${reuseWorkingSetRaw.length} records for ${intent.function}`);
    functionResult = {
      success: true,
      data: reuseWorkingSetRaw,
      message: `Found ${reuseWorkingSetRaw.length} records from conversation state`,
    };
  } else if (legacyReuse) {
    // Legacy fallback (no conversation state): Frame LLM determined the user is
    // asking a follow-up answerable from the previous query result. Reuse that
    // data instead of re-querying, then let Pass 3 + recordList handle output.
    console.log('[CopilotAgent] Context-sufficient: reusing lastFunctionResult for', intent.function);
    const lastData = context.lastFunctionResult;
    const records = Array.isArray(lastData)
      ? lastData
      : Array.isArray((lastData as { records?: unknown[] } | undefined)?.records)
        ? (lastData as { records: unknown[] }).records
        : [];
    functionResult = {
      success: true,
      data: records,
      message: `Found ${records.length} records from conversation context`,
    };
  } else {
    try {
    // Always forward pageContext + conversationHistory + locale so that
    // queryCopilotStudio (and any future context-sensitive function) sees the
    // same situational data the LLM used. Other functions ignore the extras.
    functionResult = await executeFunction(
      intent.function,
      intent.arguments || {},
      {
        userId: context.userId,
        userEmail: context.userEmail,
        pageContext: context.pageContext,
        conversationHistory: context.conversationHistory,
        locale: context.locale,
      }
    );
    console.log('[CopilotAgent] Function result:', functionResult);
  } catch (execError) {
    console.error('[CopilotAgent] Function execution error:', execError);
    return {
      success: false,
      content: '',
      error: `函数执行异常: ${execError instanceof Error ? execError.message : String(execError)}`,
      functionCalled: intent.function,
      functionDisplayName: fnDisplayName,
      latencyMs: Date.now() - startTime,
      thinkingSteps: [
        { stage: 'intent', status: 'completed', label: isZh ? `意图识别：${fnDisplayName}` : `Intent: ${fnDisplayName}` },
        { stage: 'executing', status: 'completed', label: isZh ? `${fnDisplayName}：执行异常` : `${fnDisplayName}: Exception`, detail: isZh ? '执行异常' : 'Exception' }
      ],
    };
  }
  } // end else (Dataverse query path)

  // Notify progress: function execution completed
  if (onProgress) {
    onProgress({ stage: 'executing', status: 'completed', functionDisplayName: fnDisplayName });
  }

  // FAILURE C: Function execution failed - use LLM to analyze error and provide helpful response
  if (!functionResult.success) {
    const errorMsg = functionResult.error || '函数执行失败';
    console.warn('[CopilotAgent] Function execution failed:', errorMsg);
    
    // If unknown function, fallback to Copilot Studio
    if (errorMsg.startsWith('未知函数') || errorMsg.startsWith('Unknown function')) {
      console.warn('[CopilotAgent] Unknown function, falling back to Copilot Studio:', errorMsg);
      return await fallbackToCopilotStudio(
        userMessage,
        context.locale || getLocale(),
        startTime,
        {
          userId: context.userId,
          userEmail: context.userEmail,
          pageContext: context.pageContext,
          conversationHistory: context.conversationHistory || [],
        },
        onProgress
      );
    }
    
    // ===== LLM Error Analysis =====
    // Use LLM to analyze the error and provide a helpful, user-friendly response
    console.log('[CopilotAgent] Using LLM to analyze error and generate helpful response');
    
    // Notify progress: error analysis
    if (onProgress) {
      onProgress({ stage: 'generating', status: 'active' });
    }
    
    const errorAnalysisPrompt = isZh
      ? `你是一个友好的销售助手。用户请求执行时出现了错误，请分析错误并给出友好的回复。

用户问题: ${userMessage}
尝试调用的函数: ${intent.function}
传入的参数: ${JSON.stringify(intent.arguments || {})}
错误信息: ${errorMsg}

请根据错误信息，用友好的语气回复用户。重要规则:
1. 不要暴露技术细节如"recordId"、"data source"等内部术语
2. 如果是记录ID无效（如 "recordId is not valid"），说明可能是因为：
   - 用户提到的客户/商机/活动名称不存在或已被删除
   - 需要用户澄清确认要查询的具体记录
3. 给出具体的下一步建议，例如：
   - "您可以告诉我客户的完整名称吗？"
   - "请问您要查询哪个商机的详情？"
   - "我找不到这条记录，您可以搜索一下看看吗？"
4. 保持简洁友好，2-3句话
5. 必须使用中文回复`
      : `You are a friendly sales assistant. An error occurred while executing the user's request. Please analyze the error and provide a helpful response.

User question: ${userMessage}
Function attempted: ${intent.function}
Arguments passed: ${JSON.stringify(intent.arguments || {})}
Error message: ${errorMsg}

Please respond to the user in a friendly manner based on the error. Important rules:
1. Do NOT expose technical details like "recordId", "data source", or internal terms
2. If it's an invalid record ID error (e.g., "recordId is not valid"), explain that:
   - The account/opportunity/activity name mentioned might not exist or was deleted
   - Ask the user to clarify which specific record they want to query
3. Give specific next step suggestions, such as:
   - "Could you tell me the full name of the account?"
   - "Which opportunity would you like to see details for?"
   - "I couldn't find this record. Would you like to search for it?"
4. Keep it concise and friendly, 2-3 sentences
5. You must respond in English`;
    
    try {
      const errorAnalysisResponse = await invokeFlowForLLM({
        messages: [
          { role: 'system', content: errorAnalysisPrompt },
          { role: 'user', content: `请分析这个错误并给出友好的回复: ${errorMsg}` },
        ],
      });
      
      // Notify progress: error analysis completed
      if (onProgress) {
        onProgress({ stage: 'generating', status: 'completed' });
      }
      
      if (errorAnalysisResponse.success && errorAnalysisResponse.content) {
        return {
          success: true, // Return success: true with helpful content instead of crashing
          content: errorAnalysisResponse.content,
          functionCalled: intent.function,
          functionDisplayName: fnDisplayName,
          error: errorMsg, // Keep original error for debugging
          latencyMs: Date.now() - startTime,
          thinkingSteps: [
            { stage: 'intent', status: 'completed', label: isZh ? `意图识别：${fnDisplayName}` : `Intent: ${fnDisplayName}` },
            { stage: 'executing', status: 'completed', label: isZh ? `${fnDisplayName}：需要澄清` : `${fnDisplayName}: Needs clarification` },
            { stage: 'generating', status: 'completed', label: isZh ? '生成帮助建议' : 'Generating helpful suggestion' },
          ],
        };
      }
    } catch (analysisError) {
      console.error('[CopilotAgent] Error analysis failed:', analysisError);
    }
    
    // Notify progress completed even if analysis failed
    if (onProgress) {
      onProgress({ stage: 'generating', status: 'completed' });
    }
    
    // Fallback: provide a generic helpful response if LLM analysis fails
    const fallbackResponse = isZh
      ? `抱歉，我在处理您的请求时遇到了问题。这可能是因为您提到的记录不存在或已被删除。您可以：\n• 确认一下客户/商机/活动的完整名称\n• 使用搜索功能查找相关记录\n• 换个方式描述您的需求`
      : `Sorry, I encountered an issue processing your request. This might be because the record you mentioned doesn't exist or was deleted. You can:\n• Confirm the full name of the account/opportunity/activity\n• Use the search function to find relevant records\n• Try describing your request in a different way`;
    
    return {
      success: true, // Return success: true to show helpful message instead of error
      content: fallbackResponse,
      functionCalled: intent.function,
      functionDisplayName: fnDisplayName,
      error: errorMsg, // Keep original error for debugging
      latencyMs: Date.now() - startTime,
      thinkingSteps: [
        { stage: 'intent', status: 'completed', label: isZh ? `意图识别：${fnDisplayName}` : `Intent: ${fnDisplayName}` },
        { stage: 'executing', status: 'completed', label: isZh ? `${fnDisplayName}：需要澄清` : `${fnDisplayName}: Needs clarification` },
      ],
    };
  }

  // ===== MULTI-INTENT PROCESSING (removed — single-executor refactor) =====
  // Multi-intent / additionalActions are now handled entirely by the IntentQueue
  // (copilot-context.tsx). When an intent carries additionalActions the
  // `willUseQueue` guard above returns early, so this agent path only ever runs
  // for single, non-queue intents.

  // ===== Check for suggestPlan - returns batch form cards =====
  if (intent.function === 'suggestPlan') {
    if (functionResult.success) {
      console.log('[CopilotAgent] suggestPlan detected, returning batch form cards');
      const planData = functionResult.data as { type: string; items: Array<{ type: string; isNew: boolean; data: Record<string, unknown>; batchIndex: number; reason: string }> };
      if (onProgress) {
        onProgress({ stage: 'generating', status: 'completed' });
      }
      return {
        success: true,
        content: functionResult.message || '',
        functionCalled: intent.function,
        functionDisplayName: fnDisplayName,
        latencyMs: Date.now() - startTime,
        thinkingSteps: [
          { stage: 'intent', status: 'completed', label: isZh ? `意图识别：${fnDisplayName}` : `Intent: ${fnDisplayName}` },
          { stage: 'executing', status: 'completed', label: isZh ? `${fnDisplayName}：生成 ${planData.items.length} 个建议` : `${fnDisplayName}: ${planData.items.length} suggestions`, detail: isZh ? `${planData.items.length} 个任务` : `${planData.items.length} tasks` },
        ],
        additionalIntents: {
          message: functionResult.message || '',
          items: planData.items.map((item, idx) => ({
            type: item.type as 'activity',
            isNew: true,
            data: item.data,
            batchIndex: idx,
            reason: item.reason,
            intentIndex: idx,
          })),
        },
      };
    } else {
      // suggestPlan failed — return error message, don't ask for clarification
      if (onProgress) {
        onProgress({ stage: 'generating', status: 'completed' });
      }
      return {
        success: true,
        content: isZh
          ? `抱歉，生成工作计划时遇到问题：${functionResult.error || '请稍后重试'}。您可以尝试说"帮我规划明天的日程"或"plan tomorrow focusing on closing deals"。`
          : `Sorry, I encountered an issue generating the plan: ${functionResult.error || 'please try again'}. You can try "plan tomorrow focusing on closing deals" or "帮我规划明天的日程".`,
        functionCalled: intent.function,
        functionDisplayName: fnDisplayName,
        latencyMs: Date.now() - startTime,
        thinkingSteps: [
          { stage: 'intent', status: 'completed', label: isZh ? `意图识别：${fnDisplayName}` : `Intent: ${fnDisplayName}` },
          { stage: 'executing', status: 'completed', label: isZh ? `${fnDisplayName}：执行失败` : `${fnDisplayName}: Failed` },
        ],
      };
    }
  }

  // ===== Update fell back to a draft (entity not found → offer to create) =====
  // e.g. updateContact for a person who doesn't exist yet → show a create card
  // instead of a dead-end error.
  if (
    functionResult.success &&
    functionResult.data &&
    typeof functionResult.data === 'object' &&
    (functionResult.data as Record<string, unknown>)._fallbackDraft
  ) {
    const draftData = functionResult.data as { type: string; isNew: boolean; data: Record<string, unknown> };
    const draftFnName =
      draftData.type === 'contact' ? 'draftContact'
      : draftData.type === 'account' ? 'draftAccount'
      : draftData.type === 'opportunity' ? 'draftOpportunity'
      : 'draftActivity';
    const draftDisplayName = getDisplayName(draftFnName, isZh ? 'zh-Hans' : 'en-US');
    if (onProgress) onProgress({ stage: 'generating', status: 'completed' });
    return {
      success: true,
      content: isZh ? '没有找到该记录，请确认是否创建：' : 'No matching record found — confirm to create:',
      functionCalled: draftFnName,
      functionDisplayName: draftDisplayName,
      functionResult: { type: draftData.type, isNew: true, data: draftData.data },
      latencyMs: Date.now() - startTime,
      thinkingSteps: [
        { stage: 'intent', status: 'completed', label: isZh ? `意图识别：${fnDisplayName}` : `Intent: ${fnDisplayName}` },
        { stage: 'executing', status: 'completed', label: isZh ? '未找到记录，转为新建' : 'Not found — switching to create' },
      ],
    };
  }

  // ===== Draft functions & multi-intent batch forms (removed) =====
  // draft* functions and any intent carrying additionalActions are now handled
  // exclusively by the IntentQueue (the `willUseQueue` guard returns early).
  // The former draft-form and "update + additional intents" branches here were
  // unreachable and have been deleted as part of the single-executor refactor.

  // ===== Knowledge-query short-circuit (boss directive 2026-05-17) =====
  // For Copilot Studio knowledge queries the function result already IS a
  // fully-formed natural-language answer. Running Pass-2 on it rewrites the
  // real answer into a generic "Found 1 record" meta-summary, which is wrong.
  // Return the CS answer verbatim instead.
  if (intent.function === 'queryCopilotStudio' || intent.function === 'externalKnowledgeQuery') {
    const csData = functionResult.data as { answer?: string; source?: string } | undefined;
    const csAnswer = (csData && typeof csData.answer === 'string' && csData.answer.trim().length > 0)
      ? csData.answer
      : (isZh ? '（Copilot Studio 未返回内容）' : '(Copilot Studio returned no content)');
    if (onProgress) {
      onProgress({ stage: 'generating', status: 'completed' });
    }
    return {
      success: true,
      content: csAnswer,
      functionCalled: intent.function,
      functionDisplayName: fnDisplayName,
      functionResult: functionResult.data,
      invalidateQueries: functionResult.invalidateQueries,
      latencyMs: Date.now() - startTime,
      thinkingSteps: [
        ...(hasMultipleIntents ? [] : [{ stage: 'intent' as const, status: 'completed' as const, label: isZh ? `意图识别：${intentLabel}` : `Intent: ${intentLabel}` }]),
        { stage: 'executing', status: 'completed', label: isZh ? `Copilot Studio 已回复` : `Copilot Studio responded` },
        { stage: 'generating', status: 'completed', label: isZh ? `返回原文` : `Return verbatim` },
      ],
    };
  }

  // ===== Pass 2: Generate Natural Language Response =====
  // Notify progress: response generation started
  if (onProgress) {
    onProgress({ stage: 'generating', status: 'active' });
  }

  const responseSystemPrompt = isZh
    ? `你是一个资深销售教练。根据函数执行结果和用户的具体问题，用自然语言回复用户。

重要规则:
1. 不要逐条列出具体记录 - 详细列表会以卡片形式单独展示给用户
2. 根据用户意图调整回复风格:
   - 如果用户在查询记录（Find）: 给出数量统计 + 关键分布洞察（金额/行业/阶段/时间）
   - 如果用户在要求分析/建议（Analyze/Recommend）: 给出具体的、可操作的销售建议，例如：哪些商机应该优先跟进、建议的下一步动作、潜在风险提醒、关键时间节点
   - 如果用户在查看摘要（Report）: 给出关键指标 + 趋势 + 需要关注的异常
3. 回复长度根据内容复杂度灵活调整:
   - 简单查询: 2-3句
   - 分析建议: 可以3-5句，用要点列举关键行动项
4. 必须使用中文回复
5. 如果数据为空，友好地告知用户`
    : `You are a senior sales coach. Based on the function execution result and the user's specific question, respond in natural language.

Important rules:
1. Do NOT list individual records - detailed list will be shown separately as cards to the user
2. Adjust response style based on user intent:
   - If user is querying records (Find): provide count statistics + key distribution insights (amount/industry/stage/time)
   - If user is asking for analysis/advice (Analyze/Recommend): provide specific, actionable sales advice, such as: which opportunities to prioritize, suggested next actions, risk alerts, key deadlines
   - If user is viewing summary (Report): provide key metrics + trends + anomalies to watch
3. Adjust response length based on content complexity:
   - Simple queries: 2-3 sentences
   - Analysis/advice: 3-5 sentences, use bullet points for key action items
4. You must respond in English
5. If data is empty, kindly inform the user`;

  const responseUserPrompt = isZh
    ? `用户问题: ${userMessage}

调用了函数: ${intent.function}
记录数量: ${Array.isArray(functionResult.data) ? functionResult.data.length : 1}
执行结果摘要:
${JSON.stringify(functionResult.data, null, 2).slice(0, 4000)}

请提供简短的摘要和分析，不要列出具体记录。`
    : `User question: ${userMessage}

Called function: ${intent.function}
Record count: ${Array.isArray(functionResult.data) ? functionResult.data.length : 1}
Execution result summary:
${JSON.stringify(functionResult.data, null, 2).slice(0, 4000)}

Please provide a brief summary and analysis, do not list individual records.`;

  console.log('[CopilotAgent] Pass 2: Generating response');

  let finalResponse;
  try {
    finalResponse = await invokeFlowForLLM({
      messages: [
        { role: 'system', content: responseSystemPrompt },
        { role: 'user', content: responseUserPrompt },
      ],
    });
    console.log('[CopilotAgent] Pass 2 response:', finalResponse.success, finalResponse.content?.slice(0, 100));
  } catch (pass2Error) {
    console.error('[CopilotAgent] Pass 2 error:', pass2Error);
    // If Pass 2 fails, return function result with fallback content
    if (onProgress) {
      onProgress({ stage: 'generating', status: 'completed' });
    }
    return {
      success: true,
      content: isZh
        ? `已执行 ${fnDisplayName}，找到 ${Array.isArray(functionResult.data) ? functionResult.data.length : 1} 条记录。`
        : `Executed ${fnDisplayName}, found ${Array.isArray(functionResult.data) ? functionResult.data.length : 1} record(s).`,
      functionCalled: intent.function,
      functionDisplayName: fnDisplayName,
      functionResult: functionResult.data,
      invalidateQueries: functionResult.invalidateQueries,
      latencyMs: Date.now() - startTime,
    };
  }

  // Notify progress: response generation completed
  if (onProgress) {
    onProgress({ stage: 'generating', status: 'completed' });
  }

  // Build final thinking steps with unique labels to avoid duplication
  // Step 1: Intent recognition - shows what action was identified
  // Step 2: Execution - shows function name and result count
  const recordCount = Array.isArray(functionResult.data) ? functionResult.data.length : 1;
  const thinkingSteps = [
    ...(hasMultipleIntents ? [] as Array<{stage:'intent';status:'completed';label:string}> : [{ stage: 'intent' as const, status: 'completed' as const, label: isZh ? `意图识别：${intentLabel}` : `Intent: ${intentLabel}` }]),
    { 
      stage: 'executing' as const, 
      status: 'completed' as const, 
      label: isZh ? `${fnDisplayName}：找到${recordCount}条记录` : `${fnDisplayName}: Found ${recordCount} record${recordCount === 1 ? '' : 's'}` 
    },
    { stage: 'generating' as const, status: 'completed' as const, label: isZh ? '生成回复' : 'Generate Response' },
  ];

  // Check if function result is a list that should be displayed as record cards
  let recordList: AgentResponse['recordList'] = undefined;
  const fnName = intent.function;
  const resultData = functionResult.data;
  
  if (Array.isArray(resultData) && resultData.length > 0) {
    // Determine record type based on function name
    if (fnName === 'queryAccounts') {
      recordList = {
        type: 'account',
        records: resultData.map((item: Record<string, unknown>) => ({
          id: String(item.id || ''),
          title: String(item.name1 || item.name || ''),
          subtitle: String(item.industry || ''),
          meta: String(item.region || ''),
        })),
        title: isZh ? '客户列表' : 'Accounts',
      };
    } else if (fnName === 'queryOpportunities') {
      recordList = {
        type: 'opportunity',
        records: resultData.map((item: Record<string, unknown>) => {
          // Real opp records use `amount` + `stage` (raw stageKey) + `expectedCloseDate`; legacy fallbacks left for safety.
          const amountRaw = (item.amount ?? item.totalamount ?? item.estimatedvalue) as number | string | undefined;
          const amountNum = typeof amountRaw === 'number' ? amountRaw : amountRaw ? Number(amountRaw) : undefined;
          const amountStr = amountNum != null && !Number.isNaN(amountNum)
            ? (amountNum >= 1000 ? `$${(amountNum / 1000).toFixed(0)}K` : `$${amountNum.toFixed(0)}`)
            : '';
          const stageLabel = String(item.stage || '');
          const closeRaw = (item.expectedCloseDate || item.expectedclosedate) as string | undefined;
          const closeStr = closeRaw ? new Date(closeRaw).toLocaleDateString() : '';
          // Stage + amount on subtitle, close-date on meta — gives boss the at-a-glance trio.
          const subtitleParts = [stageLabel, amountStr].filter(Boolean);
          return {
            id: String(item.id || ''),
            title: String(item.name1 || item.name || ''),
            subtitle: subtitleParts.join(' · '),
            meta: closeStr ? (isZh ? `预计成交 ${closeStr}` : `Close ${closeStr}`) : '',
          };
        }),
        title: isZh ? '商机列表' : 'Opportunities',
      };
    } else if (fnName === 'queryContacts') {
      recordList = {
        type: 'contact',
        records: resultData.map((item: Record<string, unknown>) => ({
          id: String(item.id || ''),
          title: String(item.fullname || item.name || ''),
          subtitle: String(item.jobtitle || ''),
          meta: String(item.email || ''),
        })),
        title: isZh ? '联系人列表' : 'Contacts',
      };
    } else if (fnName === 'queryActivities') {
      recordList = {
        type: 'activity',
        records: resultData.map((item: Record<string, unknown>) => {
          const typeLabel = String(item.type || '');
          const dateStr = (item.scheduledDate || item.scheduleddate) as string | undefined;
          return {
            id: String(item.id || ''),
            title: String(item.title || ''),
            subtitle: typeLabel,
            meta: dateStr ? new Date(String(dateStr)).toLocaleDateString() : '',
          };
        }),
        title: isZh ? '活动列表' : 'Activities',
      };
    }
  }

  if (!finalResponse.success) {
    // Fallback: return raw function result if second pass fails
    return {
      success: true,
      content: isZh
        ? `查询结果: ${JSON.stringify(functionResult.data)}`
        : `Result: ${JSON.stringify(functionResult.data)}`,
      functionCalled: intent.function,
      functionDisplayName: fnDisplayName,
      functionResult: functionResult.data,
      invalidateQueries: functionResult.invalidateQueries,
      latencyMs: Date.now() - startTime,
      thinkingSteps,
      recordList,
      stateMutation: buildQueryStateMutation(
        intent.function,
        intent.arguments || {},
        functionResult.data,
        recordList?.title ?? '',
      ),
    };
  }

  // Ensure we have content - fallback if LLM returned empty
  const responseContent = finalResponse.content?.trim() || (isZh
    ? `已执行 ${fnDisplayName}，共${recordCount}条记录。`
    : `Executed ${fnDisplayName}, found ${recordCount} record${recordCount === 1 ? '' : 's'}.`);

  return {
    success: true,
    content: responseContent,
    functionCalled: intent.function,
    functionDisplayName: fnDisplayName,
    functionResult: functionResult.data,
    invalidateQueries: functionResult.invalidateQueries,
    latencyMs: Date.now() - startTime,
    thinkingSteps,
    recordList,
    stateMutation: buildQueryStateMutation(
      intent.function,
      intent.arguments || {},
      functionResult.data,
      recordList?.title ?? '',
    ),
  };
}
