/**
 * Copilot Agent - Simplified Single-Pass Architecture
 * 
 * This agent uses a SINGLE LLM call with Function Calling to:
 * 1. Understand user intent
 * 2. Extract all parameters
 * 3. Decide on the action (call function, ask for info, or respond directly)
 * 
 * Key Principles:
 * - Single LLM call for intent detection and parameter extraction
 * - LLM handles clarification naturally (no special "clarification" state)
 * - Multi-intent extraction happens in the same pass
 * - Draft functions generate forms, update functions execute directly
 */

import { invokeFlowForLLM } from '@/services/power-automate-service';
import { getLocale } from '@/lib/i18n';
import { getFunctionListForPrompt, getDisplayName } from './function-registry';
import { executeFunction } from './function-executor';
import { 
  parseAndValidateIntent,
  isCircuitBreakerOpen, 
  recordCircuitBreakerFailure, 
  recordCircuitBreakerSuccess,
  recordMetrics,
  type ValidatedIntentResult,
  type SingleIntent,
  type AwaitingClarification,
  type PendingResolution,
  type ResolutionCandidate,
} from './agent-utils';
import { recordShadow, compareFrameVsLegacy } from './frame-shadow';
import { runShadowPipeline, recordBenchmark, compareShadowVsLegacy, type ShadowResult } from './shadow-agent';
import { frameToIntent } from './frame-to-intent';

// Greeting pattern for detecting simple greetings that don't need Copilot Studio
const GREETING_PATTERN = /^(hi|hello|hey|你好|您好|嗨|早上好|下午好|晚上好|good\s*(morning|afternoon|evening))\b/i;
// Phrases that ask the agent to produce a narrative report from the current
// page data. When matched, a non-empty directResponse is allowed through.
const DAILY_REPORT_PATTERN = /daily\s*report|today'?s?\s*report|工作日报|今日日报|今天的报告|生成今日|生成[\u4e00-\u9fa5]*?报/i;

export interface ThinkingProgress {
  stage: 'intent' | 'executing' | 'generating' | 'matching';
  status: 'active' | 'completed';
  intentLabel?: string;
  functionDisplayName?: string;
  detail?: string;
}

export interface AgentResponse {
  success: boolean;
  content: string;
  functionCalled?: string;
  functionDisplayName?: string;
  functionResult?: unknown;
  error?: string;
  latencyMs?: number;
  // Query keys to invalidate after mutation (for UI refresh)
  invalidateQueries?: string[];
  // Final thinking steps for display
  thinkingSteps?: Array<{
    stage: 'intent' | 'executing' | 'generating' | 'matching';
    status: 'completed';
    label: string;
    detail?: string;
  }>;

  // Form card for draft records
  formCard?: {
    type: 'activity' | 'opportunity' | 'account';
    isNew: boolean;
    existingId?: string;
    data: Record<string, unknown>;
  };
  // Record list for query results
  recordList?: {
    type: 'account' | 'opportunity' | 'activity' | 'contact';
    records: Array<{
      id: string;
      title: string;
      subtitle?: string;
      meta?: string;
    }>;
    title?: string;
  };
  // Additional intents discovered from multi-intent analysis
  additionalIntents?: {
    message: string;
    items: Array<{
      type: 'activity' | 'opportunity' | 'account' | 'contact';
      isNew: boolean;
      data: Record<string, unknown>;
      reason: string;
      batchIndex: number;
      userFacingLabel?: { zh: string; en: string };
      intentIndex?: number;
    }>;
  };
  // Intent analysis summary for debugging/display
  intentAnalysis?: {
    totalIntents: number;
    summary: string;
  };
  // I-2 Stage 1: awaiting-clarification blocking state
  awaitingClarification?: AwaitingClarification;

  // Phase B: Per-intent labels for narrative UI. When present, context layer
  // emits a single overview message ("识别到 N 个意图…") then per-task announce
  // bubbles as the resolution cascade advances across intentIndex boundaries.
  intentsOverview?: Array<{ intentIndex: number; userFacingLabel: { zh: string; en: string } }>;

  /** Phase B: 0-based intent index that this blocking response belongs to.
   *  Lets the context layer detect intent boundaries inside the cascade and
   *  emit a fresh task-announce bubble when the index changes. */
  currentIntentIndex?: number;

  /** Raw parsed intent from the LLM Pass-1. Exposed so the context layer can
   *  build an IntentQueue from it and drive multi-step orchestration through
   *  the queue runtime instead of the agent's internal cascade. Populated
   *  whenever Pass-1 parsing succeeds (function may be null for direct responses). */
  rawIntent?: IntentResult;
}

// IntentResult is now imported from agent-utils as ValidatedIntentResult
// We still keep a local interface for backward compatibility
export interface IntentResult extends Partial<ValidatedIntentResult> {
  function: string | null;
  arguments?: Record<string, unknown>;
  directResponse?: string;
  /** Per-intent human-friendly label for narration UI (head). */
  userFacingLabel?: { zh: string; en: string };
  additionalActions?: Array<{
    function: string;
    arguments: Record<string, unknown>;
    reason?: string;
    userFacingLabel?: { zh: string; en: string };
  }>;
  requiresMatching?: boolean;
  matchTarget?: {
    entityType: 'account' | 'contact' | 'opportunity' | 'activity';
    query: string;
  };
  // I-3 Slice 1: ordered resolution chain. When present, supersedes matchTarget.
  resolutions?: Array<{
    entityType: 'account' | 'contact' | 'opportunity' | 'activity';
    query: string;
    scopeBy?: 'account' | 'opportunity';
    /** Which intent (0-based head, 1+ for additionalActions) this resolution belongs to. */
    intentIndex?: number;
  }>;
  multiIntentAnalysis?: {
    hasMultipleIntents: boolean;
    summary?: string;
  };
}

/**
 * Phase B: Build the per-intent overview that the UI uses to render the
 * upfront "identified N intents" announce. Only emits entries that have a
 * `userFacingLabel` (i.e. populated by frame mode); legacy mode without
 * labels returns an empty array and the UI silently skips the overview.
 */
function buildIntentsOverview(intent: IntentResult): AgentResponse['intentsOverview'] {
  const out: NonNullable<AgentResponse['intentsOverview']> = [];
  if (intent.userFacingLabel) {
    out.push({ intentIndex: 0, userFacingLabel: intent.userFacingLabel });
  }
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
 * Fallback to Copilot Studio when intent recognition fails
 * Calls the existing queryCopilotStudio function executor
 */
async function fallbackToCopilotStudio(
  userQuery: string,
  locale: string,
  startTime: number,
  context: {
    userId?: string;
    userEmail?: string;
    // Forwarded so Copilot Studio sees page/account/product/dialog context.
    pageContext?: { currentPage?: string; summary?: string; pageData?: unknown };
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  },
  onProgress?: (progress: ThinkingProgress) => void
): Promise<AgentResponse> {
  console.log('[FALLBACK_CS] ENTER fallbackToCopilotStudio, userQuery=', userQuery);
  const isZh = locale === 'zh-Hans';
  
  // Notify progress: routing to Copilot Studio
  if (onProgress) {
    onProgress({ stage: 'intent', status: 'completed', intentLabel: isZh ? '转 Copilot Studio' : 'Copilot Studio' });
  }
  
  const thinkingSteps: AgentResponse['thinkingSteps'] = [
    { stage: 'intent', status: 'completed', label: isZh ? '转 Copilot Studio 查询' : 'Routing to Copilot Studio' }
  ];
  
  // Notify progress: executing Copilot Studio query
  if (onProgress) {
    onProgress({ stage: 'executing', status: 'active', functionDisplayName: 'Copilot Studio' });
  }
  
  try {
    console.log('[FALLBACK_CS] Calling executeFunction(queryCopilotStudio)...');
    const result = await executeFunction(
      'queryCopilotStudio',
      { query: userQuery },
      {
        userId: context.userId,
        userEmail: context.userEmail,
        pageContext: context.pageContext,
        conversationHistory: context.conversationHistory,
        locale,
      }
    );
    console.log('[FALLBACK_CS] executeFunction returned:', JSON.stringify(result).slice(0, 500));
    
    // Notify progress: execution completed
    if (onProgress) {
      onProgress({ stage: 'executing', status: 'completed', functionDisplayName: 'Copilot Studio' });
    }
    
    if (result.success && result.data) {
      const data = result.data as { answer?: string; source?: string };
      thinkingSteps.push({
        stage: 'executing',
        status: 'completed',
        label: isZh ? 'Copilot Studio：查询成功' : 'Copilot Studio: Query successful'
      });
      
      return {
        success: true,
        content: data.answer || (isZh ? '收到您的问题，但暂时没有相关信息。' : 'I received your question but have no relevant information at this time.'),
        functionCalled: 'queryCopilotStudio',
        functionDisplayName: 'Copilot Studio',
        latencyMs: Date.now() - startTime,
        thinkingSteps,
      };
    }
    
    // Copilot Studio failed - return friendly fallback
    console.warn('[CopilotAgent] Copilot Studio failed:', result.error);
    thinkingSteps.push({
      stage: 'executing',
      status: 'completed',
      label: isZh ? 'Copilot Studio 不可用' : 'Copilot Studio unavailable'
    });
    
    return {
      success: true,
      content: isZh ? '我不太理解你的问题，请换个方式问我吧。' : 'I am not sure I understand. Could you rephrase?',
      latencyMs: Date.now() - startTime,
      thinkingSteps,
    };
  } catch (error) {
    console.error('[CopilotAgent] Copilot Studio exception:', error);
    
    // Notify progress: execution completed (even on error)
    if (onProgress) {
      onProgress({ stage: 'executing', status: 'completed', functionDisplayName: 'Copilot Studio' });
    }
    
    thinkingSteps.push({
      stage: 'executing',
      status: 'completed',
      label: isZh ? 'Copilot Studio 不可用，回退到通用提示' : 'Copilot Studio unavailable, using fallback'
    });
    
    return {
      success: true,
      content: isZh ? '我不太理解你的问题，请换个方式问我吧。' : 'I am not sure I understand. Could you rephrase?',
      latencyMs: Date.now() - startTime,
      thinkingSteps,
    };
  }
}

/**
 * Process additional intents (inferred from user input)
 * Returns batch form items for user confirmation
 */
async function processAdditionalIntents(
  intents: SingleIntent[],
  context: { userId?: string; userEmail?: string },
  isZh: boolean,
  labels?: Array<{ zh: string; en: string } | undefined>
): Promise<Array<{
  type: 'activity' | 'opportunity' | 'account' | 'contact';
  isNew: boolean;
  data: Record<string, unknown>;
  reason: string;
  batchIndex: number;
  userFacingLabel?: { zh: string; en: string };
  intentIndex?: number;
}>> {
  const results: Array<{
    type: 'activity' | 'opportunity' | 'account' | 'contact';
    isNew: boolean;
    data: Record<string, unknown>;
    reason: string;
    batchIndex: number;
    userFacingLabel?: { zh: string; en: string };
    intentIndex?: number;
  }> = [];
  
  for (let i = 0; i < intents.length; i++) {
    const intent = intents[i];
    
    // Only process draft functions for additional intents
    const draftFunctions = ['draftActivity', 'draftOpportunity', 'draftAccount', 'draftContact'];
    if (!draftFunctions.includes(intent.function)) {
      console.log('[CopilotAgent] Skipping non-draft additional intent:', intent.function);
      continue;
    }
    
    // Per-step fuzzyMatch: when a name field is set but its id is missing, try to resolve
    // it now (best-effort, top-1 high-confidence only). For 'draftAccount' / 'draftOpportunity'
    // / 'draftContact' the name field IS the new entity's name, not a query — so we only
    // fuzzy-match the *referenced* names (e.g. accountName on draftOpportunity, contactName
    // on draftActivity). For draftAccount the only name field is the account itself, so skip.
    const stepArgs: Record<string, unknown> = { ...(intent.arguments || {}) };
    if (intent.function !== 'draftAccount') {
      const lookups: Array<{ name: keyof typeof stepArgs; idField: string; entityType: 'account' | 'contact' | 'opportunity' }> = [
        { name: 'accountName', idField: 'accountId', entityType: 'account' },
      ];
      // contactName / opportunityName only make sense as references on draftActivity
      // (and in some draftOpportunity flows for parent contact, but that's out of scope).
      if (intent.function === 'draftActivity') {
        lookups.push({ name: 'contactName', idField: 'contactId', entityType: 'contact' });
        lookups.push({ name: 'opportunityName', idField: 'opportunityId', entityType: 'opportunity' });
      }
      for (const lookup of lookups) {
        const nameVal = stepArgs[lookup.name];
        const idVal = stepArgs[lookup.idField];
        if (typeof nameVal === 'string' && nameVal.trim() && (typeof idVal !== 'string' || !idVal)) {
          try {
            const matchRes = await executeFunction(
              'fuzzyMatch',
              { entityType: lookup.entityType, query: nameVal.trim() },
              context
            );
            if (matchRes.success && matchRes.data) {
              const md = matchRes.data as { matches?: Array<{ id: string; name: string; score: number; accountId?: string; accountName?: string }> };
              const top = (md.matches ?? []).find((m) => m.score >= 90);
              if (top) {
                stepArgs[lookup.idField] = top.id;
                stepArgs[lookup.name] = top.name;
                if (lookup.entityType === 'contact' && top.accountId && !stepArgs.accountId) {
                  stepArgs.accountId = top.accountId;
                  if (top.accountName) stepArgs.accountName = top.accountName;
                }
                console.log('[CopilotAgent] additional-intent auto-resolved', lookup.entityType, top.name);
              }
            }
          } catch (e) {
            console.warn('[CopilotAgent] additional-intent fuzzyMatch failed:', lookup.entityType, e);
          }
        }
      }
    }

    try {
      const result = await executeFunction(
        intent.function,
        stepArgs,
        context
      );
      
      if (result.success && result.data) {
        const data = result.data as { type?: string; data?: Record<string, unknown> };
        const itemType = data.type || (
          intent.function === 'draftActivity' ? 'activity' :
          intent.function === 'draftOpportunity' ? 'opportunity' :
          intent.function === 'draftAccount' ? 'account' : 'contact'
        );
        
        results.push({
          type: itemType as 'activity' | 'opportunity' | 'account' | 'contact',
          isNew: true,
          data: data.data || data as Record<string, unknown>,
          reason: intent.reason || (isZh ? '从对话中推断' : 'Inferred from conversation'),
          batchIndex: i,
          ...(labels?.[i] ? { userFacingLabel: labels[i] } : {}),
          intentIndex: i + 1,
        });
      }
    } catch (error) {
      console.warn('[CopilotAgent] Failed to process additional intent:', intent.function, error);
    }
  }
  
  return results;
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

export async function processMessage(
  userMessage: string,
  context: {
    userId?: string;
    userEmail?: string;
    locale?: string;
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    pageContext?: {
      currentPage: string;
      pageData?: unknown;
      summary?: string;
    };
  },
  onProgress?: (progress: ThinkingProgress) => void
): Promise<AgentResponse> {
  _lastParsedIntent = null;
  const result = await processMessageInner(userMessage, context, onProgress);
  if (_lastParsedIntent && !result.rawIntent) {
    result.rawIntent = _lastParsedIntent;
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
    pageContext?: {
      currentPage: string;
      pageData?: unknown;
      summary?: string;
    };
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

  // ===== Single-Pass Intent Detection =====
  // Removed Stage 1 (Intent Analyzer) - consolidated into single LLM call
  // The LLM will naturally handle clarification by responding with helpful text
  
  // ===== Continue with existing intent detection (Pass 1) for backward compatibility =====
  // The intent analyzer above handles greeting detection and clarification
  // The code below continues with the original LLM-based intent detection for function execution
  // Note: pageContextStr was already built earlier in the function

  // ===== Pass 1: Intent Detection via Frame Pipeline =====
  console.log('[CopilotAgent] Pass 1: Intent detection (frame mode)');


  // Notify progress: intent detection started
  if (onProgress) {
    onProgress({ stage: 'intent', status: 'active' });
  }

  let intent: IntentResult | null = null;

  // ===== Frame mode: Frame + Orchestrator drives production =====
  const shadowCtx = {
      userMessage,
      pageContext: context.pageContext,
      conversationHistory: history,
      locale: (isZh ? 'zh-Hans' : 'en') as 'zh-Hans' | 'en',
    };

    let shadowResult: ShadowResult;
    try {
      shadowResult = await runShadowPipeline(shadowCtx);
    } catch (err) {
      recordCircuitBreakerFailure();
      recordMetrics({ success: false, latencyMs: Date.now() - startTime });
      return {
        success: false,
        content: '',
        error: 'Frame pipeline threw: ' + (err instanceof Error ? err.message : String(err)),
        latencyMs: Date.now() - startTime,
      };
    }

    // Always record the shadow run for the viewer (legacy side empty in frame mode)
    try {
      recordShadow({
        ts: Date.now(),
        userMessage,
        page: context.pageContext?.currentPage,
        frame: { success: !shadowResult.error, result: shadowResult.frame, latencyMs: shadowResult.frameLatencyMs, error: shadowResult.error },
        legacy: { functionName: null, raw: (shadowResult.planRaw ?? '').slice(0, 8000) },
        agreement: compareFrameVsLegacy(shadowResult.frame, null, 0),
      });
      recordBenchmark({
        ts: Date.now(),
        userMessage,
        page: context.pageContext?.currentPage,
        shadow: shadowResult,
        legacy: { functionName: null, latencyMs: shadowResult.totalLatencyMs },
        agreement: compareShadowVsLegacy(shadowResult, null, undefined),
      });
    } catch (e) {
      console.warn('[CopilotAgent] frame mode logging failed:', e);
    }

    if (shadowResult.error || !shadowResult.plan) {
      recordCircuitBreakerFailure();
      recordMetrics({ success: false, latencyMs: Date.now() - startTime });
      return {
        success: false,
        content: '',
        error: isZh
          ? `意图识别失败: ${shadowResult.error ?? '未生成执行计划'}。请重试。`
          : `Intent detection failed: ${shadowResult.error ?? 'no plan produced'}. Please retry.`,
        latencyMs: Date.now() - startTime,
      };
    } else {
      const translated = frameToIntent(shadowResult);
      if (!translated) {
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

  // ===== Smart Matching: Pre-check for entity matching before draft functions =====
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
        const matchData = matchResult.data as {
          matches: Array<{ id: string; name: string; score: number; matchType: string; accountId?: string; accountName?: string }>;
          confidence: 'high' | 'medium' | 'low' | 'none';
          needsConfirmation: boolean;
          exactMatch?: { id: string; name: string; score: number; accountId?: string; accountName?: string };
        };
        
        // Notify progress: matching completed
        if (onProgress) {
          const highConfMatches = matchData.matches.filter((m: { score: number }) => m.score >= 70);
          onProgress({ 
            stage: 'matching', 
            status: 'completed', 
            detail: isZh 
              ? `找到 ${highConfMatches.length} 个高置信度匹配` 
              : `Found ${highConfMatches.length} high-confidence match${highConfMatches.length === 1 ? '' : 'es'}` 
          });
        }
        
        // If high confidence exact match found (score >= 70), handle based on entity type
        if (matchData.confidence === 'high' && matchData.exactMatch && matchData.exactMatch.score >= 70) {
          console.log('[CopilotAgent] High confidence match found:', matchData.exactMatch.name, 'score:', matchData.exactMatch.score);
          
          // For draftAccount, show match selection card since user might be trying to create a duplicate
          if (intent.function === 'draftAccount') {
            const highConfAccountMatches = matchData.matches.filter((m: { score: number }) => m.score >= 70);
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
              blockingIntentIndex = (currentResolution as { intentIndex?: number }).intentIndex;
              break;
            } else {
              // No high-confidence account matches - proceed directly to create new account
              console.log('[CopilotAgent] No high-confidence account matches, proceeding to create new account');
            }
          }
          
          // For draftActivity with activity matching - if found exact match with high score, show duplicate warning
          if (intent.function === 'draftActivity' && entityType === 'activity') {
            const highConfActivityMatches = matchData.matches.filter((m: { score: number }) => m.score >= 70);
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
              blockingIntentIndex = (currentResolution as { intentIndex?: number }).intentIndex;
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
            const contactMatch = matchData.exactMatch as { id: string; name: string; accountId?: string; accountName?: string };
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
        // Filter to only show high-confidence matches (score >= 70)
        const highConfidenceMatches = matchData.matches.filter((m: { score: number }) => m.score >= 70);
        
        // If there are high-confidence matches and needs confirmation, show selection
        if (highConfidenceMatches.length > 0) {
          // For single high-confidence match (>90%), auto-select for account/contact/opportunity
          if (highConfidenceMatches.length === 1 && highConfidenceMatches[0].score > 90) {
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
                accountId: (autoMatch as { accountId?: string }).accountId || (intent.arguments?.accountId as string) || '',
                accountName: (autoMatch as { accountName?: string }).accountName || (intent.arguments?.accountName as string) || '',
              };
              resolvedSoFar.contact = autoMatch.id;
              if ((autoMatch as { accountId?: string }).accountId) resolvedSoFar.account = (autoMatch as { accountId?: string }).accountId!;
              console.log(`[CopilotAgent] Injected contact with account info:`, {
                contactId: autoMatch.id,
                contactName: autoMatch.name,
                accountId: (autoMatch as { accountId?: string }).accountId,
                accountName: (autoMatch as { accountName?: string }).accountName,
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
            blockingIntentIndex = (currentResolution as { intentIndex?: number }).intentIndex;
            break;
          }
        } else {
          const isDraftFn = typeof intent.function === 'string' && intent.function.startsWith('draft');
          if (isDraftFn) {
            const topCandidates: ResolutionCandidate[] = matchData.matches.slice(0, 3).map((m: { id: string; name: string; score: number; accountName?: string }) => ({
              id: m.id,
              name: m.name,
              score: m.score,
              subtitle: m.accountName,
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
            blockingIntentIndex = (currentResolution as { intentIndex?: number }).intentIndex;
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

  // ===== MULTI-INTENT PROCESSING =====
  // Check for additional intents regardless of primary function type
  // This enables multi-intent extraction for ALL operations (update, draft, query, etc.)
  
  // Get additional intents from LLM's additionalActions
  const additionalActions = intent.additionalActions || [];
  const hasAdditionalIntents = additionalActions.length > 0;
  const isMultiIntent = hasAdditionalIntents && intent.multiIntentAnalysis?.hasMultipleIntents;
  
  // Process additional intents if detected
  let additionalIntentsResult: AgentResponse['additionalIntents'] | undefined;
  
  if (isMultiIntent && additionalActions.length > 0) {
    console.log('[CopilotAgent] Multi-intent detected with', additionalActions.length, 'additional actions');
    console.log('[CopilotAgent] Summary:', intent.multiIntentAnalysis?.summary);
    
    // Get account / contact / opportunity context resolved during the primary intent
    // so it can be injected into additional intents that reference the same entities by name.
    const matchedAccountId = intent.arguments?.accountId as string | undefined;
    const matchedAccountName = intent.arguments?.accountName as string | undefined;
    const matchedContactId = intent.arguments?.contactId as string | undefined;
    const matchedContactName = intent.arguments?.contactName as string | undefined;
    const matchedOpportunityId = intent.arguments?.opportunityId as string | undefined;
    const matchedOpportunityName = intent.arguments?.opportunityName as string | undefined;
    
    // Process additional intents asynchronously
    const additionalItems = await processAdditionalIntents(
      additionalActions.map((action, index) => ({
        id: `additional_${index + 1}`,
        function: action.function,
        arguments: {
          ...action.arguments,
          // Inject primary-resolved context if not already present on the step
          ...(matchedAccountId && !action.arguments.accountId ? { accountId: matchedAccountId } : {}),
          ...(matchedAccountName && !action.arguments.accountName ? { accountName: matchedAccountName } : {}),
          ...(matchedContactId && !action.arguments.contactId ? { contactId: matchedContactId } : {}),
          ...(matchedContactName && !action.arguments.contactName ? { contactName: matchedContactName } : {}),
          ...(matchedOpportunityId && !action.arguments.opportunityId ? { opportunityId: matchedOpportunityId } : {}),
          ...(matchedOpportunityName && !action.arguments.opportunityName ? { opportunityName: matchedOpportunityName } : {}),
        },
        confidence: 0.75,
        type: 'inferred' as const,
        priority: 10 + index,
        missingFields: [] as string[],
        source: 'inferred' as const,
        reason: action.reason || (isZh ? '从对话中推断' : 'Inferred from conversation'),
      })),
      { userId: context.userId, userEmail: context.userEmail },
      isZh,
      additionalActions.map((a) => a.userFacingLabel)
    );
    
    if (additionalItems.length > 0) {
      additionalIntentsResult = {
        message: isZh 
          ? `我还从您的描述中发现了 ${additionalItems.length} 个可能需要记录的内容：`
          : `I also found ${additionalItems.length} item(s) you might want to record:`,
        items: additionalItems,
      };
    }
  }

  // ===== Check for draft functions - return directly without Pass 2 =====
  const draftFunctions = ['draftActivity', 'draftOpportunity', 'draftAccount', 'draftContact', 'batchDraft'];
  if (draftFunctions.includes(intent.function)) {
    console.log('[CopilotAgent] Draft function detected, returning form card data directly');
    
    // If we have additional intents, include them in the response
    if (additionalIntentsResult) {
      const primaryData = functionResult.data as { type?: string; data?: Record<string, unknown> };
      const primaryType = primaryData.type || (intent.function === 'draftActivity' ? 'activity' : 
                         intent.function === 'draftOpportunity' ? 'opportunity' : 
                         intent.function === 'draftAccount' ? 'account' : 'contact');
      
      // Build batch items including primary intent
      const allItems = [
        {
          type: primaryType as 'activity' | 'opportunity' | 'account' | 'contact',
          isNew: true,
          data: primaryData.data || primaryData as Record<string, unknown>,
          batchIndex: 0,
          reason: isZh ? '主要意图' : 'Primary intent',
          ...(intent.userFacingLabel ? { userFacingLabel: intent.userFacingLabel } : {}),
          intentIndex: 0,
        },
        ...additionalIntentsResult.items,
      ];
      
      // Notify progress: completed
      if (onProgress) {
        onProgress({ stage: 'generating', status: 'completed' });
      }
      
      return {
        success: true,
        content: isZh 
          ? `检测到 ${allItems.length} 个意图，请确认以下信息：\n${intent.multiIntentAnalysis?.summary || ''}`
          : `Detected ${allItems.length} intents, please confirm the following:\n${intent.multiIntentAnalysis?.summary || ''}`,
        functionCalled: 'batchDraft',
        functionDisplayName: isZh ? '多意图智能提取' : 'Multi-Intent Extraction',
        functionResult: {
          items: allItems,
          totalCount: allItems.length,
          multiIntentSummary: intent.multiIntentAnalysis?.summary,
        },
        latencyMs: Date.now() - startTime,
        thinkingSteps: [
          { stage: 'intent', status: 'completed', label: isZh ? `多意图识别：发现 ${allItems.length} 个意图` : `Multi-Intent: ${allItems.length} intents detected` },
          { stage: 'executing', status: 'completed', label: isZh ? `已准备 ${allItems.length} 个表单` : `Prepared ${allItems.length} forms` },
        ],
        intentAnalysis: {
          totalIntents: allItems.length,
          summary: intent.multiIntentAnalysis?.summary || '',
        },
        intentsOverview: buildIntentsOverview(intent),
      };
    }
    
    // Single intent - return as before
    // Notify progress: completed
    if (onProgress) {
      onProgress({ stage: 'generating', status: 'completed' });
    }
    
    return {
      success: true,
      content: isZh ? '请确认以下信息' : 'Please confirm the following information',
      functionCalled: intent.function,
      functionDisplayName: fnDisplayName,
      functionResult: functionResult.data,
      latencyMs: Date.now() - startTime,
      thinkingSteps: [
        ...(hasMultipleIntents ? [] : [{ stage: 'intent' as const, status: 'completed' as const, label: isZh ? `意图识别：${intentLabel}` : `Intent: ${intentLabel}` }]),
        { stage: 'executing', status: 'completed', label: isZh ? `${fnDisplayName}：已准备表单` : `${fnDisplayName}: Form ready` },
      ],
    };
  }

  // ===== For UPDATE operations with additional intents =====
  // Execute the update, then show additional intents as forms
  if (additionalIntentsResult && additionalIntentsResult.items.length > 0) {
    // Notify progress: completed
    if (onProgress) {
      onProgress({ stage: 'generating', status: 'completed' });
    }
    
    // Build a success message for the primary action
    const primarySuccessMsg = isZh
      ? `${fnDisplayName} 已完成。`
      : `${fnDisplayName} completed.`;
    
    return {
      success: true,
      content: `${primarySuccessMsg}\n\n${additionalIntentsResult.message}`,
      functionCalled: intent.function,
      functionDisplayName: fnDisplayName,
      functionResult: functionResult.data,
      invalidateQueries: functionResult.invalidateQueries,
      latencyMs: Date.now() - startTime,
      thinkingSteps: [
        { stage: 'intent', status: 'completed', label: isZh ? `多意图识别：发现 ${additionalIntentsResult.items.length + 1} 个意图` : `Multi-Intent: ${additionalIntentsResult.items.length + 1} intents detected` },
        { stage: 'executing', status: 'completed', label: isZh ? `${fnDisplayName}：执行成功` : `${fnDisplayName}: Success` },
        { stage: 'generating', status: 'completed', label: isZh ? `发现 ${additionalIntentsResult.items.length} 个额外意图` : `Found ${additionalIntentsResult.items.length} additional intent(s)` },
      ],
      // Include additional intents for UI to display as batch forms
      additionalIntents: additionalIntentsResult,
      intentAnalysis: {
        totalIntents: additionalIntentsResult.items.length + 1,
        summary: intent.multiIntentAnalysis?.summary || '',
      },
      intentsOverview: buildIntentsOverview(intent),
    };
  }

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
${JSON.stringify(functionResult.data, null, 2).slice(0, 1500)}

请提供简短的摘要和分析，不要列出具体记录。`
    : `User question: ${userMessage}

Called function: ${intent.function}
Record count: ${Array.isArray(functionResult.data) ? functionResult.data.length : 1}
Execution result summary:
${JSON.stringify(functionResult.data, null, 2).slice(0, 1500)}

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
    if (fnName?.includes('Account') || fnName === 'searchAccounts' || fnName === 'getAccountsNeedingFollowUp') {
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
    } else if (fnName?.includes('Opportunit') || fnName === 'getTopOpportunities' || fnName === 'getOpportunitiesClosingSoon') {
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
    } else if (fnName === 'getContactsByAccount') {
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
    } else if (fnName?.includes('Activit') || fnName === 'getTodayActivities' || fnName === 'getUpcomingActivities') {
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
  };
}
