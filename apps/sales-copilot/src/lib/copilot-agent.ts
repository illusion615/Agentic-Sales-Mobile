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
import { ActivityTypeKeyToLabel, type ActivityTypeKey } from '@/generated/models/activity-model';
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
import { runFrame, recordShadow, compareFrameVsLegacy } from './frame-shadow';
import { runShadowPipeline, recordBenchmark, compareShadowVsLegacy } from './shadow-agent';

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
    }>;
  };
  // Intent analysis summary for debugging/display
  intentAnalysis?: {
    totalIntents: number;
    summary: string;
  };
  // I-2 Stage 1: awaiting-clarification blocking state
  awaitingClarification?: AwaitingClarification;
}

// IntentResult is now imported from agent-utils as ValidatedIntentResult
// We still keep a local interface for backward compatibility
interface IntentResult extends Partial<ValidatedIntentResult> {
  function: string | null;
  arguments?: Record<string, unknown>;
  directResponse?: string;
  additionalActions?: Array<{
    function: string;
    arguments: Record<string, unknown>;
    reason?: string;
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
  }>;
  multiIntentAnalysis?: {
    hasMultipleIntents: boolean;
    summary?: string;
  };
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
  isZh: boolean
): Promise<Array<{
  type: 'activity' | 'opportunity' | 'account' | 'contact';
  isNew: boolean;
  data: Record<string, unknown>;
  reason: string;
  batchIndex: number;
}>> {
  const results: Array<{
    type: 'activity' | 'opportunity' | 'account' | 'contact';
    isNew: boolean;
    data: Record<string, unknown>;
    reason: string;
    batchIndex: number;
  }> = [];
  
  for (let i = 0; i < intents.length; i++) {
    const intent = intents[i];
    
    // Only process draft functions for additional intents
    const draftFunctions = ['draftActivity', 'draftOpportunity', 'draftAccount', 'draftContact'];
    if (!draftFunctions.includes(intent.function)) {
      console.log('[CopilotAgent] Skipping non-draft additional intent:', intent.function);
      continue;
    }
    
    try {
      const result = await executeFunction(
        intent.function,
        intent.arguments || {},
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

  // ===== Pass 1: Intent Detection with Multi-Step Reasoning =====
  const intentSystemPrompt = isZh
    ? `你是一个销售助手 AI。根据用户问题和对话历史，决定是否需要调用数据查询函数。
今天日期: ${today}${pageContextStr}

可用函数:
${functionList}

规则:
1. 如果用户询问客户、商机、活动等业务数据，选择最合适的函数
2. 如果用户提到"这个"、"它"、"当前"等指代词，结合页面上下文和对话历史理解
3. 如果是闲聊、打招呼（如"你好"、"hi"），设置 function 为 null 并直接回复
4. **产品知识查询路由规则（重要）**：
   - 当用户在 **Product Center** 或 **Product Detail** 页面时，所有产品相关问题都使用 "queryCopilotStudio"
   - 产品相关问题包括：产品功能、规格参数、技术原理、使用方法、优势特点、与竞品对比、适用场景、注意事项等
   - 仅当用户明确询问本系统 Dataverse 里的业务数据（如"这个产品有哪些客户"、"这个产品的商机"）时，才使用本地查询函数
   - 示例(在 Product Center 页面): "这个产品有什么功能？" -> {"function": "queryCopilotStudio", "arguments": {"query": "这个产品有什么功能"}}
   - 示例(在 Product Detail 页面, productName="UltraVision X1"): "tell me about its specifications" -> {"function": "queryCopilotStudio", "arguments": {"query": "UltraVision X1 specifications"}}
5. 对于天气、通用常识等超出本地数据范围的问题，使用 "externalKnowledgeQuery"
6. **活动拟定(draftActivity)重要规则**：当用户说"计划新活动"、"记录拜访"、"添加活动"、"创建活动"、"log activity"等：
   - **⚠️ 强制：arguments 必须包含 temporalMode 字段**，三选一："completed"/"planned"/"unspecified"。详见下面的 temporalMode 子项。该字段决定表单结构（是否显示 result/nextStep）与最终活动状态，省略会导致回归 bug。
   - **必须使用 draftActivity 函数**，不要使用 createActivity。draftActivity 会显示草稿表单让用户确认后再保存
   - 必须结合页面上下文生成有意义的标题，包含客户名称+主题/产品
   - 禁止使用"客户拜访"、"电话沟通"、"会议"等泛泛标题
   - **⭐ 活动关联规则**：如果页面上下文包含 opportunityId/opportunityName（如在活动详情页或商机详情页），必须传递 opportunityId 和 opportunityName 参数绑定活动到商机
   - **⭐ 客户关联规则（最重要）**：如果页面上下文包含 accountId/accountName（如在客户详情页），必须传递 accountId 和 accountName 参数，不要设置 requiresMatching！用户在客户详情页说"add activity"、"log call"、"create opportunity"等，直接使用 pageData 中的 accountId 和 accountName，不需要匹配
   - 如果用户提到商机名称，使用 opportunityName 参数，系统会自动匹配
   - **⭐ temporalMode 时态字段（I-8 Slice A）**：根据用户措辞判定活动是"已发生"还是"将发生"，写入 arguments.temporalMode：
     - "completed"：用户表达动作已完成。线索："刚"、"已经"、"了"、"昨天"、"上周"、"just"、"finished"、"did"、"yesterday"、"last week"。此时表单显示 result/nextStep，并应基于用户原话预填这两个字段
     - "planned"：用户表达动作发生在未来或正在安排。线索："明天"、"下周"、"要"、"打算"、"准备"、"plan to"、"will"、"going to"、"tomorrow"、"scheduled"。此时表单隐藏 result/nextStep（事还没发生）
     - "unspecified"（缺省）：无明确时态线索（如裸说"拜访 A 客户"）或时态矛盾。沿用现有缺省行为，不影响回归
     - **仅 draftActivity 意图需要输出 temporalMode；其他意图（draftOpportunity、updateActivity 等）不写**
   - **⭐ 商机自动建议阈值（I-8 Slice B-1 混合方案，最高优先级，覆盖第 12.B 节）**：当 temporalMode="completed" 且用户原话中包含商机相关线索时，**先自评一个 confidence（0-100）**，再决定是否输出 additionalActions 商机。**这是输出 draftOpportunity 作为 additionalAction 的唯一路径**：
     - 自评公式（同类不累加，封顶 100）：amount=30, timeline=20, product=20, strongIntent=20, weakIntent=10
     - 信号定义：amount（金额/预算，如 80万、£800K）、timeline（时间窗，如 Q3、下半年、by year-end）、product（具体产品或品类）、strongIntent（强意向，如 wants demo、requested quote、让我们出方案）、weakIntent（弱意向，如 interested、感兴趣、looking at）
     - **confidence < 40：不要输出 additionalActions:[{"function":"draftOpportunity"}]**，避免污染 pipeline（用户只是闲聊提到，不足以自动建商机）
     - **confidence >= 40：必须输出 additionalActions:[{"function":"draftOpportunity", "arguments":{ ...常规字段, _signals:[{type, quote}...], _confidence: N }}]**
       - 常规字段照旧：name、accountName、amount、stage（通常 qualification）、expectedCloseDate、lastAction 等
       - **_signals 和 _confidence 是强制字段**——前端会读取它们渲染表单顶部的"为什么推荐"解释条。忘记输出等于这条 additionalAction 不合规，前端无法展示理由。
       - signals.type 只能是上面 5 种；quote 必须是用户原话的简短片段（≤20 字），用来作为 chip 上的引用
       - 至少 1 条 signal，最多 5 条；如果某种类型在原话中没出现，就不要硬加
     - **仅在 temporalMode="completed" 时考虑**；planned/unspecified 永远不要自动建议商机
     - **示例（用户："刚见完 Rachel，他们想买心脏耗材，预算 80 万 Q3"）**：additionalActions:[{"function":"draftOpportunity","arguments":{"_signals":[{"type":"amount","quote":"预算 80 万"},{"type":"timeline","quote":"Q3"},{"type":"product","quote":"心脏耗材"},{"type":"strongIntent","quote":"他们想买"}],"_confidence":90,"name":"King's College Hospital - 心脏耗材","accountName":"King's College Hospital","amount":800000,"stage":"qualification","expectedCloseDate":"2026-09-30","lastAction":"客户表达采购意向，预算 80 万 Q3 落地"}}]
7. **多实体创建(batchDraft)**：当用户在一句话中要求创建多个记录时（如"帮我添加一个客户和一个联系人"、"创建两条活动"），使用 batchDraft 函数，将每个记录作为 items 数组的一个元素
7.B **周计划/排期(batchDraft + activity items)**：当用户说"排一下下周"、"帮我做下周计划"、"plan my week"、"安排下周三天的拜访" 等周计划意图时：
   - 用 batchDraft，每个计划项作为一个 type:"activity" item
   - 每个 item.data 至少包含：title（如"拜访 King's College"）、type（visit/call/meeting/email）、scheduleddate（ISO 字符串，按用户提到的日期推算；如未指定则按下周一开始顺次往后排）、accountName（如果用户点名了客户）
   - 如果用户点名联系人/商机，使用 contactName / opportunityName 字段，并设置 resolutions 让系统做模糊匹配
   - **不要担心重复**：系统会自动检测同账户同一天的已存在活动并在表单卡上提示用户，由用户决定是否提交
8. **智能匹配（最重要）**：当用户提到客户/联系人/商机名称但可能不完全准确时（如只提到部分名称、拼音、简称）：
   - 设置 requiresMatching: true
   - 设置 matchTarget: { entityType: 'account|contact|opportunity', query: '用户提到的名称' }
   - **注意**：创建活动时，entityType 必须是 'account'（查找客户），不要用 'activity'
   - 系统会先查找匹配记录，再决定是使用已有记录还是创建新记录
   - **⭐ 多实体解析链路（resolutions[]，I-3）**：当用户在一句话里同时点名了多个需要匹配的实体（如「给国王学院医院的 Rachel Stenhouse 加一个心脏耗材的商机」同时点了客户+联系人+商机），不要用 matchTarget，而是用 resolutions 数组按顺序排列每一步：
     - 顺序固定为：account → contact → opportunity → activity
     - 每个元素：{ entityType, query, scopeBy? }；scopeBy 表示「在哪个已解析实体的范围内查找」（如 contact/opportunity 通常 scopeBy:'account'）
     - 设置 requiresMatching: true；matchTarget 可以省略（向后兼容时也可保留为 resolutions[0]）
     - 系统会按顺序逐个 fuzzyMatch，自动把上一步解析到的 ID 注入下一步
9. **创建新记录前必须检查重复**：用户说"添加客户XXX"、"添加联系人xxx"时，先设置 requiresMatching，如果找到高置信匹配则提示可能重复
10. **⭐ 多意图智能提取（关键能力）**：当用户描述一个完整的业务场景时，要识别其中隐含的多个意图并全部提取：
   - **⚠️ 硬性规则：过去时活动 + 未来时计划同时出现 = 必须拆成 2 个 draftActivity**。例如"刚拜访了 XX 医院讨论了 OR 设备采购预算 50 万英镑，下周二再来一次给临床团队演示" → 主活动 draftActivity(completed visit, 含本次会议要点)，additionalActions:[draftActivity(planned follow-up, scheduledStart=下周二, type=Demo), draftOpportunity(若按 Rule 6 confidence≥40)]。**不要**把下周二的演示折叠进主活动的 nextStep 字段——用户给出了明确日期就必须独立成单。
   - **活动记录**：用户描述的拜访/通话/会议本身 → draftActivity
   - **商机发现**：用户提到的商业机会（如"他们要招标"、"有采购需求"、"要引进新设备"） → draftOpportunity (additionalActions)
   - **后续跟进**：用户提到的下一步计划（如"下周要演示产品"、"需要安排跟进"） → draftActivity (additionalActions)
   - **新联系人发现**：用户在活动中提到的新联系人（如"见了他们的新CMO张医生"） → draftContact (additionalActions)
   - 主要意图放在 function 和 arguments 中，其他意图放在 additionalActions 数组
   - 设置 multiIntentAnalysis: { hasMultipleIntents: true, summary: "检测到的意图摘要" }
11. **更新操作(updateXXX)**：当用户说"更新"、"修改"、"改成"、"调整"、"标记为"、"完成"、"取消"、"mark as"、"mark it done"等，使用对应的 updateXXX 函数：
   - updateAccount: 更新客户信息
   - updateOpportunity: 更新商机（金额、阶段、预计成交日期等）
   - updateActivity: 更新活动记录（状态: draft/confirmed/completed/cancelled，"done"="completed"）。如果 pageData 包含 opportunityId/opportunityName，也要传递这些参数以保持商机绑定
   - updateContact: 更新联系人
   - **关键**：如果用户在详情页面（pageData 包含 "id" 字段），必须从 pageData.id 提取 ID 并传入参数：
     - 活动详情页: 传 activityId = pageData.id
     - 商机详情页: 传 opportunityId = pageData.id
     - 客户详情页: 传 accountId = pageData.id
     - 联系人详情页: 传 contactId = pageData.id
   - "标记完成"、"mark it done"、"完成这个" 在活动详情页 -> {"function": "updateActivity", "arguments": {"activityId": "<从pageData.id获取>", "status": "completed"}}
   - 如果用户提到名称但不在详情页，系统会自动模糊匹配
   - **⭐ 更新时也要提取多意图**：当用户在更新记录时描述了额外信息（如会议结果、后续计划、发现的商机、新联系人），仍然需要提取这些作为 additionalActions
   - 例如："mark this meeting as completed, we discussed new features and customer is interested, will arrange demo next Monday"
     - 主意图：updateActivity（标记完成）
     - additionalActions：draftOpportunity（客户感兴趣可能有商机）、draftActivity（下周一安排演示）
12. **⭐ 完整的活动信息提取（关键）**：当用户记录一个活动时，必须扫描以下所有信息：

   **A. 基础关联（必须提取）- ⭐ 优先级规则：Contact > Account**
   - **联系人 Contact（最高优先级）**：如果用户提到了联系人名称（如"和张医生会面"、"与Dr. Sharma通话"、"给Sarah Lee发邮件"），**必须优先匹配联系人**
     → 设置 contactName, requiresMatching=true, matchTarget={entityType:'contact', query:'联系人名称'}
     → 系统匹配联系人后会自动获取该联系人的 Account 信息，无需单独匹配 Account
   - **客户 Account（仅当没有提到联系人时）**：如果用户只提到客户名称而没有联系人 → 设置 accountName, requiresMatching=true, matchTarget={entityType:'account', query:'客户名称'}
   - **已有商机 Opportunity**：用户提到的项目/商机名称（如"讨论了ICU升级项目"） → 设置 opportunityName，系统会匹配已有商机

   **B. 商机信号（提取为 additionalActions: draftOpportunity）：**
   - 客户表达采购意向（"他们想买"、"有采购计划"）
   - 提到预算/金额（"预算200万"、"项目约50万"）
   - 提到决策时间/招标计划（"Q3决策"、"下月招标"）
   - 对产品表达强烈兴趣（"很感兴趣"、"想深入了解"）
   - **⚠️ 强制走 Rule 6 流程**：先按 Rule 6 的"商机自动建议阈值"公式自评 confidence，**只有 ≥40 才输出**，且 arguments 必须包含 _signals + _confidence 两个字段。否则不要输出 draftOpportunity additionalAction。

   **C. 跟进计划（提取为 additionalActions: draftActivity）：**
   - 下次拜访/会议（"下周二再去"、"周五开会"）
   - 要发送的资料/报价（"需要发报价单"）
   - 要安排的演示/试用（"安排产品演示"）

   **D. 新联系人（提取为 additionalActions: draftContact）：**
   - 新决策者（"见了他们的新CMO"）
   - 需要跟进的新联系人（"他们的采购经理是关键人物"）
   - 包含联系人的职位/角色信息
14. **⭐ notes 字段抽取规则（非常重要）**：当用户描述中包含无法映射到结构化字段的有价值信息时，必须将这些信息提取到 notes 字段：
   - 对于 draftAccount：公司历史、规模、员工数、营收、特殊资质、所属集团、重要背景、专业领域等
   - 对于 draftOpportunity：项目背景、竞争对手、关键决策者、技术要求等
   - 对于 draftActivity：会议细节、讨论要点、客户反馈等
   - 示例：用户说 "Royal London Hospital, part of Barts Health NHS Trust, 员工 17000 人，年营收 18 亿"
     -> name="Royal London Hospital", industry="Healthcare", notes="Part of Barts Health NHS Trust. 17,000 employees. Annual revenue £1.8 billion."
14.B ⭐ **生成工作日报（Daily Report Mode）**：当用户说“生成今日工作日报” / “生成某某日期的工作日报” / “daily report” / “today's report” 且当前页面是活动列表（pageData.viewMode === 'day' 且 pageData.dayActivities 存在）时：
   - **不调用任何函数**，输出 {"function": null, "directResponse": "<叙述式报告>", "intentLabel": "工作日报"}
   - directResponse 必须是 Markdown，包含**四个二级标题**，顺序固定：
     1. "## 今日完成" —— 按 type 分类统计完成/总数，比如 "Visits 2/3 · Meetings 1/1 · Calls 0/1"
     2. "## 关键成果" —— 列出推动了哪些 opportunity/account（用 opportunityName/accountName + outcome/notes 推出“赢在哪里”），每项一句话
     3. "## 未完成与原因" —— 列 pending/draft 状态的 task，按 outcome 推测原因（拖延/人员变动/无联系人等）
     4. "## 明日建议" —— 2–3 条可执行动作，优先点名带 strongIntent 但还没推进的 account/opp
   - 只能使用 pageData.dayActivities 里的信息，不要虚构。如果 dayActivities 为空数组，directResponse 输出一句“今日无记录，无法生成报告”即可。
15. 严格输出 JSON，不要任何解释、markdown、代码块
16. 你的所有回复必须使用中文
13. 你的所有回复必须使用中文

JSON 格式:
{"function": "函数名或null", "arguments": {参数对象}, "requiresMatching": true/false, "matchTarget": {"entityType": "...", "query": "..."}, "resolutions": [{"entityType": "...", "query": "...", "scopeBy": "account|opportunity"}], "additionalActions": [{"function": "...", "arguments": {...}, "reason": "提取原因"}], "multiIntentAnalysis": {"hasMultipleIntents": true/false, "summary": "..."}}

示例:
用户: "今天有什么安排？" -> {"function": "getTodayActivities", "arguments": {}}
用户: "帮我找一下华东的客户" -> {"function": "getAccountsByRegion", "arguments": {"region": "华东"}}
用户: "你好" -> {"function": null, "directResponse": "你好！有什么我可以帮你的吗？"}
用户: "帮我添加一个客户和一个联系人" -> {"function": "batchDraft", "arguments": {"items": [{"type": "account", "data": {}}, {"type": "contact", "data": {}}]}}
用户(在客户详情页，pageData.accountId="acc123", pageData.accountName="华东医院"): "添加两个联系人" -> {"function": "batchDraft", "arguments": {"accountId": "acc123", "accountName": "华东医院", "items": [{"type": "contact", "data": {}}, {"type": "contact", "data": {}}]}}
用户(在客户详情页，pageData.accountId="acc456", pageData.accountName="北京协和"): "创建一个商机和一个拜访记录" -> {"function": "batchDraft", "arguments": {"accountId": "acc456", "accountName": "北京协和", "items": [{"type": "opportunity", "data": {"name": "北京协和 - 新商机"}}, {"type": "activity", "data": {"title": "北京协和 - 拜访", "type": "visit"}}]}}
用户: "把这个商机金额改成150万" -> {"function": "updateOpportunity", "arguments": {"amount": 1500000}}
用户: "更新这个客户的地区为华南" -> {"function": "updateAccount", "arguments": {"region": "华南"}}
用户: "把活动状态改成已完成" -> {"function": "updateActivity", "arguments": {"status": "completed"}}
用户(在活动详情页，pageData.id="abc123"): "mark it done" -> {"function": "updateActivity", "arguments": {"activityId": "abc123", "status": "completed"}}
用户(在活动详情页，pageData.id="xyz789"): "完成这个" -> {"function": "updateActivity", "arguments": {"activityId": "xyz789", "status": "completed"}}
用户(在商机详情页): "标记为赢单" -> {"function": "updateOpportunity", "arguments": {"opportunityId": "<从pageData.id获取>", "stage": "won"}}
用户(在客户详情页，pageData.accountId="acc123", pageData.accountName="华东医院"): "log an activity" -> {"function": "draftActivity", "arguments": {"accountId": "acc123", "accountName": "华东医院", "title": "华东医院 - ..."}}
用户(在客户详情页，pageData.accountId="acc456", pageData.accountName="Royal London"): "create opportunity" -> {"function": "draftOpportunity", "arguments": {"accountId": "acc456", "accountName": "Royal London", "name": "Royal London - ..."}}

**多意图提取示例（关键）**:
用户: "I visited King's College Hospital and discussed the new operation room procurement, they're looking for a new set of devices and will open bidding soon. we're going to introduce the new product next week."
->
{
  "function": "draftActivity",
  "arguments": {
    "title": "King's College Hospital - OR Procurement Discussion",
    "type": "visit",
    "accountName": "King's College Hospital",
    "result": "Discussed new OR procurement. They need new devices and will open bidding soon.",
    "nextStep": "Introduce new product next week"
  },
  "requiresMatching": true,
  "matchTarget": {"entityType": "account", "query": "King's College Hospital"},
  "additionalActions": [
    {
      "function": "draftOpportunity",
      "arguments": {
        "name": "King's College Hospital - OR Equipment Procurement",
        "accountName": "King's College Hospital",
        "stage": "prospecting",
        "lastAction": "Customer planning to open bidding for new OR devices"
      },
      "reason": "发现商机：客户计划招标采购新设备"
    },
    {
      "function": "draftActivity",
      "arguments": {
        "title": "King's College Hospital - New Product Introduction",
        "type": "visit",
        "accountName": "King's College Hospital",
        "scheduledDate": "${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}",
        "notes": "Introduce new product to customer"
      },
      "reason": "后续跟进：下周产品介绍"
    }
  ],
  "multiIntentAnalysis": {
    "hasMultipleIntents": true,
    "summary": "1) 记录客户拜访 2) 发现商机(招标采购) 3) 安排后续活动(产品介绍)"
  }
}

用户: "刚和Royal London谈了ICU升级项目，他们预算200万，Q3要决策，我下周二再去详谈"
->
{
  "function": "draftActivity",
  "arguments": {
    "title": "Royal London - ICU Upgrade Discussion",
    "type": "meeting",
    "accountName": "Royal London",
    "result": "Discussed ICU upgrade project, budget 2M, decision in Q3"
  },
  "requiresMatching": true,
  "matchTarget": {"entityType": "account", "query": "Royal London"},
  "additionalActions": [
    {
      "function": "draftOpportunity",
      "arguments": {
        "name": "Royal London - ICU Upgrade Project",
        "accountName": "Royal London",
        "amount": 2000000,
        "stage": "qualification",
        "expectedCloseDate": "2026-09-30",
        "lastAction": "Initial discussion, Q3 decision timeline"
      },
      "reason": "商机：ICU升级项目，200万预算，Q3决策"
    },
    {
      "function": "draftActivity",
      "arguments": {
        "title": "Royal London - ICU Project Follow-up",
        "type": "visit",
        "accountName": "Royal London",
        "scheduledDate": "${(() => { const d = new Date(); d.setDate(d.getDate() + (2 - d.getDay() + 7) % 7 + 7); return d.toISOString().split('T')[0]; })()}",
        "notes": "Follow-up on ICU upgrade project details"
      },
      "reason": "后续跟进：下周二详谈"
    }
  ],
  "multiIntentAnalysis": {
    "hasMultipleIntents": true,
    "summary": "1) 记录会议 2) 创建商机 3) 安排下周二跟进"
  }
}

**\u2b50 \u8054\u7cfb\u4eba\u4f18\u5148\u5339\u914d\u793a\u4f8b\uff08\u5173\u952e\uff09**:
\u7528\u6237: "\u7ed9Sarah\u53d1\u4e86\u4e00\u5c01\u90ae\u4ef6\uff0c\u9644\u4e0a\u4e86\u624b\u672f\u5ba4\u8bbe\u5907\u7684\u8be6\u7ec6\u62a5\u4ef7\uff0c\u5e76\u9080\u8bf7\u5979\u8fdb\u4e00\u6b65\u8ba8\u8bba\u3002"
->
{
  "function": "draftActivity",
  "arguments": {
    "title": "\u90ae\u4ef6 - \u624b\u672f\u5ba4\u8bbe\u5907\u62a5\u4ef7",
    "type": "email",
    "contactName": "Sarah",
    "result": "\u53d1\u9001\u624b\u672f\u5ba4\u8bbe\u5907\u8be6\u7ec6\u62a5\u4ef7",
    "nextStep": "\u7b49\u5f85\u5ba2\u6237\u56de\u590d\u8ba8\u8bba"
  },
  "requiresMatching": true,
  "matchTarget": {"entityType": "contact", "query": "Sarah"}
}
// \u6ce8\u610f\uff1a\u5f53\u7528\u6237\u63d0\u5230\u8054\u7cfb\u4eba\u540d\u79f0\uff08Sarah\uff09\u65f6\uff0c\u4f18\u5148\u5339\u914d\u8054\u7cfb\u4eba\uff01
// \u7cfb\u7edf\u5339\u914d\u5230\u8054\u7cfb\u4eba\u540e\u4f1a\u81ea\u52a8\u83b7\u53d6\u8be5\u8054\u7cfb\u4eba\u6240\u5c5e\u7684\u5ba2\u6237\u4fe1\u606f\u3002
// \u5f53\u7528\u6237\u63d0\u5230\u8054\u7cfb\u4eba\u540d\u79f0\u65f6\uff0c\u4e0d\u8981\u5c06 matchTarget.entityType \u8bbe\u4e3a 'account'\uff01

**\u8054\u7cfb\u4eba\u521b\u5efa\u793a\u4f8b**:
\u7528\u6237: "\u8054\u7cfb\u4eba: \u674e\u533b\u751f\uff0c\u9996\u5e2d\u533b\u7597\u5b98\uff0c\u6765\u81ea\u7687\u5bb6\u4f26\u6566\u533b\u9662\u3002\u90ae\u7bb1: li.doctor@bartshealth.nhs.uk. \u7535\u8bdd: +44 20 7377 7101. \u8d1f\u8d23\u4e34\u5e8a\u7b56\u7565\u548c\u533b\u7597\u6280\u672f\u91c7\u8d2d\u51b3\u7b56\u3002"
->
{
  "function": "draftContact",
  "arguments": {
    "fullName": "\u674e\u533b\u751f",
    "accountName": "\u7687\u5bb6\u4f26\u6566\u533b\u9662",
    "title": "\u9996\u5e2d\u533b\u7597\u5b98",
    "email": "li.doctor@bartshealth.nhs.uk",
    "phone": "+44 20 7377 7101",
    "isPrimary": true,
    "notes": "\u8d1f\u8d23\u4e34\u5e8a\u7b56\u7565\u548c\u533b\u7597\u6280\u672f\u91c7\u8d2d\u51b3\u7b56"
  },
  "requiresMatching": true,
  "matchTarget": {"entityType": "account", "query": "\u7687\u5bb6\u4f26\u6566\u533b\u9662"}
}

**多实体解析链示例 (resolutions[], I-3)**:
用户: "给国王学院医院的 Rachel Stenhouse 加一个心脏耗材的商机,金额80万,关联到下个月的产品演示会议"
->
{
  "function": "draftActivity",
  "arguments": {
    "title": "产品演示会议",
    "type": "meeting",
    "scheduledDate": "下个月日期占位"
  },
  "requiresMatching": true,
  "resolutions": [
    {"entityType": "account", "query": "国王学院医院"},
    {"entityType": "contact", "query": "Rachel Stenhouse", "scopeBy": "account"},
    {"entityType": "opportunity", "query": "心脏耗材", "scopeBy": "account"}
  ],
  "additionalActions": [
    {
      "function": "draftOpportunity",
      "arguments": {
        "name": "国王学院医院 - 心脏耗材",
        "amount": 800000,
        "stage": "qualification"
      },
      "reason": "用户明确提到新商机：心脏耗材80万"
    }
  ],
  "multiIntentAnalysis": {
    "hasMultipleIntents": true,
    "summary": "1) 创建产品演示会议活动 2) 关联到客户/联系人/已有商机 3) 同时新建心脏耗材商机"
  }
}

**⚡ temporalMode 时态示例（I-8 Slice A，仅 draftActivity）**:

用户: "刚拜访了 King's College Hospital 的 Rachel，她对心脏耗材很感兴趣，下周要安排产品演示"
->
{
  "function": "draftActivity",
  "arguments": {
    "title": "King's College Hospital - 拜访 Rachel",
    "type": "visit",
    "contactName": "Rachel",
    "temporalMode": "completed",
    "result": "客户对心脏耗材表达强烈兴趣",
    "nextStep": "下周安排产品演示"
  },
  "requiresMatching": true,
  "matchTarget": {"entityType": "contact", "query": "Rachel"}
}
// completed 线索："刚"、"了" → result/nextStep 必须预填

用户: "明天下午要拜访皇家伦敦医院的周总"
->
{
  "function": "draftActivity",
  "arguments": {
    "title": "皇家伦敦医院 - 拜访周总",
    "type": "visit",
    "contactName": "周总",
    "temporalMode": "planned",
    "scheduledDate": "明日期占位"
  },
  "requiresMatching": true,
  "matchTarget": {"entityType": "contact", "query": "周总"}
}
// planned 线索："明天"、"要" → 不出 result/nextStep（事还没发生）

用户: "拜访 King's College Hospital"
->
{
  "function": "draftActivity",
  "arguments": {
    "title": "King's College Hospital - 拜访",
    "type": "visit",
    "accountName": "King's College Hospital",
    "temporalMode": "unspecified"
  },
  "requiresMatching": true,
  "matchTarget": {"entityType": "account", "query": "King's College Hospital"}
}
// unspecified：没有明确时态词 → 走现有缺省行为

}`
    : `You are a sales assistant AI. Based on the user's question and conversation history, decide whether to call a data query function.
Today's date: ${today}${pageContextStr}

Available functions:
${functionList}

Rules:
1. If the user asks about customers, opportunities, activities, or other business data, choose the most appropriate function
2. If the user mentions "this", "it", "current" etc., understand context from page data and conversation history
3. If it's small talk or greeting (like "hello", "hi"), set function to null and respond directly
4. **PRODUCT KNOWLEDGE ROUTING RULE (IMPORTANT)**:
   - When user is on **Product Center** or **Product Detail** page, ALL product-related questions should use "queryCopilotStudio"
   - Product-related questions include: features, specifications, technical details, usage, advantages, comparisons, use cases, precautions, etc.
   - ONLY use local query functions when user explicitly asks about business data in this system's Dataverse (e.g., "which customers use this product", "opportunities for this product")
   - Example (on Product Center page): "what features does this product have?" -> {"function": "queryCopilotStudio", "arguments": {"query": "what features does this product have"}}
   - Example (on Product Detail page, productName="UltraVision X1"): "tell me about its specifications" -> {"function": "queryCopilotStudio", "arguments": {"query": "UltraVision X1 specifications"}}
5. For weather, general knowledge, etc., use "externalKnowledgeQuery"
6. **ACTIVITY DRAFT RULES (draftActivity)**: When user says "plan activity", "record visit", "add activity", "create activity", "log activity", "schedule meeting" etc.:
   - **⚠️ MANDATORY: arguments MUST include the temporalMode field**, one of "completed" / "planned" / "unspecified". See the TEMPORAL MODE sub-item below for cue lists. This field drives form rendering (show/hide result/nextStep) and the final activity status; omitting it is a regression bug.
   - **ALWAYS use draftActivity function**, never use createActivity. draftActivity shows a draft form for user to review and confirm before saving
   - MUST generate meaningful title using page context, including account name + topic/product
   - NEVER use generic titles like "Customer Visit", "Phone Call", "Meeting"
   - **⭐ ACTIVITY BINDING RULE**: If pageData contains opportunityId/opportunityName (e.g., on Activity detail page or Opportunity detail page), MUST pass opportunityId and opportunityName parameters to bind activity to opportunity
   - **⭐ ACCOUNT BINDING RULE (MOST CRITICAL)**: If pageData contains accountId/accountName (e.g., on Account detail page), you MUST pass accountId and accountName parameters directly, DO NOT set requiresMatching! When user says "add activity", "log call", "create opportunity" etc. on Account detail page, use accountId and accountName from pageData directly, no matching needed
   - If user mentions an opportunity name, use opportunityName parameter and system will auto-match
   - **⭐ TEMPORAL MODE (I-8 Slice A)**: Detect whether the activity has happened or will happen and put it into arguments.temporalMode:
     - "completed": User says the action is done. Cues: "just", "already", "finished", "did", "yesterday", "last week", past tense verbs. Form will show result/nextStep, and you MUST prefill both fields based on user's wording.
     - "planned": User says the action is in the future or being scheduled. Cues: "plan to", "will", "going to", "tomorrow", "next week", "scheduled", "about to". Form will HIDE result/nextStep (the activity has not happened yet).
     - "unspecified" (default): No clear tense cue (e.g. bare "visit A account") or contradicting cues. Preserves existing behavior, zero regression.
     - **ONLY draftActivity intents need temporalMode; other intents (draftOpportunity, updateActivity, etc.) must NOT include it.**
   - **⭐ OPPORTUNITY AUTO-SUGGEST THRESHOLD (I-8 Slice B-1 hybrid, HIGHEST PRIORITY, OVERRIDES Section 12.B)**: When temporalMode="completed" AND the user's wording contains opportunity cues, **first self-assess a confidence (0-100)**, then decide whether to emit a draftOpportunity additionalAction. **This is the ONLY allowed path for emitting draftOpportunity as an additionalAction**:
     - Self-score formula (same type does NOT double-count, capped at 100): amount=30, timeline=20, product=20, strongIntent=20, weakIntent=10
     - Signal definitions: amount (budget figure, e.g. 800K, £500K, 80万), timeline (Q3, next quarter, by year-end, 下半年), product (specific product / category, e.g. cardiac consumables), strongIntent (wants demo, requested quote, evaluating vendors, 让我们出方案), weakIntent (interested, curious, looking at, 感兴趣)
     - **confidence < 40: do NOT emit additionalActions:[{"function":"draftOpportunity"}]** — user merely chatted, not enough to auto-create an opp (avoids pipeline pollution)
     - **confidence >= 40: you MUST emit additionalActions:[{"function":"draftOpportunity", "arguments":{ ...normal fields, _signals:[{type, quote}...], _confidence: N }}]**
       - Normal fields as usual: name, accountName, amount, stage (usually qualification), expectedCloseDate, lastAction, etc.
       - **_signals and _confidence are REQUIRED fields** — the front-end reads them to render the "Why this was suggested" header on top of the opportunity form. Omitting them means this additionalAction is malformed and the user loses the explanation panel.
       - signals.type must be one of the five above; quote MUST be a short fragment from the user's original wording (≤20 chars) used verbatim as the chip caption
       - Provide at least 1 signal, at most 5; do NOT fabricate a signal type that is absent from the user's wording
     - **Only consider this when temporalMode="completed"**; for planned/unspecified do NOT auto-suggest an opp
     - **Example (user: "Just met with Rachel at King's College Hospital, they're keen on cardiac consumables and budget is around 800K for Q3")**: additionalActions:[{"function":"draftOpportunity","arguments":{"_signals":[{"type":"amount","quote":"budget is around 800K"},{"type":"timeline","quote":"for Q3"},{"type":"product","quote":"cardiac consumables"},{"type":"strongIntent","quote":"they're keen on"}],"_confidence":90,"name":"King's College Hospital - Cardiac Consumables","accountName":"King's College Hospital","amount":800000,"stage":"qualification","expectedCloseDate":"2026-09-30","lastAction":"Customer expressed strong interest, budget ~800K for Q3"}}]
7. **MULTI-ENTITY CREATION (batchDraft)**: When user wants to create multiple records in one request (e.g., "add an account and a contact", "create two activities"), use batchDraft function with each record as an item in the items array
7.B **WEEKLY PLAN (batchDraft + activity items)**: When user asks to plan a week / schedule visits across days (e.g., "plan my week", "set up next week", "schedule three visits next week", "排下周计划"):
   - Use batchDraft with each planned task as one type:"activity" item
   - Each item.data should include: title (e.g. "Visit King's College"), type (visit/call/meeting/email), scheduleddate (ISO string; if user gave a day use it, otherwise spread across Mon–Fri of next week), accountName when the user named an account
   - If user named a contact or opportunity, use contactName / opportunityName and add resolutions so the system fuzzy-matches them
   - **Do not worry about duplicates**: the system auto-detects same-account same-day overlaps with existing activities and warns the user on the batch form; the user decides whether to submit
8. **SMART MATCHING (MOST IMPORTANT)**: When user mentions an account/contact/opportunity name that might not be exact (partial name, abbreviation):
   - Set requiresMatching: true
   - Set matchTarget: { entityType: 'account|contact|opportunity', query: 'name user mentioned' }
   - **IMPORTANT**: When creating activities, entityType MUST be 'account' (to find the customer), NOT 'activity'
   - System will first find matches, then decide whether to use existing record or create new
   - **⭐ MULTI-ENTITY RESOLUTION CHAIN (resolutions[], I-3)**: When the user names multiple entities to match in a single sentence (e.g., "add a cardiac-consumables opportunity for Rachel Stenhouse at King's College Hospital" mentions account + contact + opportunity at once), do NOT use matchTarget — use a "resolutions" array listing each step in order:
     - Fixed order: account → contact → opportunity → activity
     - Each item: { entityType, query, scopeBy? }; scopeBy indicates the parent scope to look within (contact/opportunity typically scopeBy:'account')
     - Set requiresMatching: true; matchTarget can be omitted (or kept identical to resolutions[0] for backward compat)
     - System resolves each step in sequence and auto-injects the resolved ID of earlier steps into later ones
9. **CHECK FOR DUPLICATES BEFORE CREATING**: When user says "add account XXX", "add contact XXX", first set requiresMatching to check for potential duplicates
10. **⭐ MULTI-INTENT INTELLIGENT EXTRACTION (KEY CAPABILITY)**: When user describes a complete business scenario, identify and extract ALL implicit intents:
   - **⚠️ HARD RULE — past-tense activity + future-tense plan in the same message = ALWAYS 2 separate draftActivity calls.** Example: "I just visited XX Hospital and discussed OR equipment procurement with a £500K budget. I'll come back next Tuesday to demo for the clinical team." → main = draftActivity(completed visit with discussion notes), additionalActions = [draftActivity(planned follow-up, scheduledStart=next Tuesday, type=Demo), draftOpportunity(if Rule 6 confidence≥40)]. **Do NOT** fold the next-Tuesday demo into the main activity's nextStep field — when the user supplies a concrete date it MUST be its own activity card.
   - **Activity Record**: The visit/call/meeting itself that user is describing → draftActivity
   - **Opportunity Discovery**: Business opportunities mentioned (e.g., "they will bid", "have procurement needs", "want new equipment") → draftOpportunity (additionalActions)
   - **Follow-up Planning**: Next steps user mentions (e.g., "introduce product next week", "need to schedule follow-up") → draftActivity (additionalActions)
   - **New Contact Discovery**: New contacts mentioned in the activity (e.g., "met their new CMO Dr. Smith") → draftContact (additionalActions)
   - Put primary intent in function and arguments, put other intents in additionalActions array
   - Set multiIntentAnalysis: { hasMultipleIntents: true, summary: "summary of detected intents" }
11. **UPDATE OPERATIONS (updateXXX)**: When user says "update", "modify", "change", "adjust", "mark as", "mark it", "set to", "complete", "finish", "cancel", etc., use the corresponding updateXXX function:
   - updateAccount: Update customer information
   - updateOpportunity: Update opportunity (amount, stage, expected close date, etc.)
   - updateActivity: Update activity record (status: draft/confirmed/completed/cancelled, also "done"="completed"). If pageData contains opportunityId/opportunityName, also pass these to preserve opportunity binding
   - updateContact: Update contact information
   - **CRITICAL**: If user is on a detail page (pageData contains "id" field), ALWAYS extract and pass that ID in arguments:
     - On Activity detail page: pass activityId from pageData.id
     - On Opportunity detail page: pass opportunityId from pageData.id
     - On Account detail page: pass accountId from pageData.id
     - On Contact detail page: pass contactId from pageData.id
   - "mark it done", "mark as complete", "finish it" on Activity page -> {"function": "updateActivity", "arguments": {"activityId": "<from pageData.id>", "status": "completed"}}
   - If user mentions a name but no ID and not on detail page, system will auto-match
   - **⭐ ALSO EXTRACT MULTI-INTENT DURING UPDATES**: When user describes additional information while updating (meeting results, follow-up plans, discovered opportunities, new contacts), STILL extract them as additionalActions
   - Example: "mark this meeting as completed, we discussed new features and customer is interested, will arrange demo next Monday"
     - Primary: updateActivity (mark complete)
     - additionalActions: draftOpportunity (customer interest = potential opportunity), draftActivity (demo next Monday)
12. **⭐ COMPLETE ACTIVITY INFORMATION EXTRACTION (CRITICAL)**: When user records an activity, you MUST scan for ALL of the following information:

   **A. Basic Associations (MUST extract) - ⭐ Priority Rule: Contact > Account**
   - **Contact (HIGHEST PRIORITY)**: If user mentions a contact name (e.g., "met with Dr. Sharma", "called Zhang", "sent email to Sarah Lee"), **you MUST prioritize matching the contact first**
     → Set contactName, requiresMatching=true, matchTarget={entityType:'contact', query:'contact name'}
     → After system matches the contact, it will automatically get the contact's Account info. DO NOT separately match account.
   - **Account (ONLY when no contact mentioned)**: If user only mentions customer/company name without contact → set accountName, requiresMatching=true, matchTarget={entityType:'account', query:'customer name'}
   - **Existing Opportunity**: Project/opportunity name mentioned (e.g., "discussed ICU upgrade project") → set opportunityName so system can match existing opportunity

   **B. Opportunity Signals (extract as additionalActions: draftOpportunity):**
   - Customer expresses purchase intent ("they want to buy", "have procurement plan")
   - Mentions budget/amount ("budget is 2M", "project around 500K")
   - Mentions decision timeline/bidding plan ("decision in Q3", "bidding next month")
   - Expresses strong interest in product ("very interested", "wants to know more")
   - **⚠️ MUST go through Rule 6 flow**: first self-score the confidence per the OPPORTUNITY AUTO-SUGGEST THRESHOLD formula in Rule 6, **only emit when >=40**, and arguments MUST include the _signals and _confidence fields. Otherwise do NOT emit a draftOpportunity additionalAction.

   **C. Follow-up Plans (extract as additionalActions: draftActivity):**
   - Next visit/meeting mentioned ("I'll go again next Tuesday", "meeting on Friday")
   - Materials/quotes to send ("need to send a quote")
   - Demo/trial to arrange ("arrange product demo")

   **D. New Contacts (extract as additionalActions: draftContact):**
   - New decision makers mentioned ("met their new CMO")
   - New contacts to follow up ("their procurement manager is key")
   - Include contact's title/role information
14. **⭐ NOTES FIELD EXTRACTION RULE (CRITICAL)**: When user's description contains valuable information that CANNOT be mapped to structured fields, you MUST extract and put it in the notes field:
   - For draftAccount: company history, size, employee count, revenue, certifications, parent company, important background, specializations, etc.
   - For draftOpportunity: project background, competitors, key decision makers, technical requirements, etc.
   - For draftActivity: meeting details, discussion points, customer feedback, etc.
   - Example: User says "create account: Royal London Hospital, part of Barts Health NHS Trust, 17000 employees, annual revenue £1.8 billion, major trauma centre, specialist in cardiac care and trauma surgery"
     -> name="Royal London Hospital", industry="Healthcare", notes="Part of Barts Health NHS Trust. 17,000 employees. Annual revenue £1.8 billion. Major trauma centre for North East London. Specialist services in cardiac care, trauma surgery, haemophilia, and renal medicine."
14.B ⭐ DAILY REPORT MODE: When the user asks for a daily report (phrases like "generate daily report", "today's report", "daily report for <date>") AND the current page is the activities Day View (pageData.viewMode === day and pageData.dayActivities is present):
   - Do NOT call any function. Return {"function": null, "directResponse": "<narrative report>", "intentLabel": "Daily Report"}
   - directResponse MUST be Markdown with EXACTLY four H2 sections in this order:
     1. ## Today's Completion — group by activity type and report done/total, e.g. "Visits 2/3 · Meetings 1/1 · Calls 0/1"
     2. ## Key Wins — list which opportunities/accounts advanced today (use opportunityName / accountName + outcome / notes to infer the win), one short sentence per item
     3. ## Pending and Why — list pending/draft tasks and infer the reason from outcome (rescheduled, no contact, blocker, etc.)
     4. ## Tomorrow's Suggestions — 2 to 3 concrete next steps, prioritise accounts/opps that showed strong intent today but did not advance
   - Use ONLY data from pageData.dayActivities; do not fabricate. If dayActivities is empty, return a single line: "No activities recorded today — nothing to report."
15. Output strict JSON only, no explanations, no markdown, no code blocks
16. All your responses must be in English

JSON format:
{"function": "functionName or null", "arguments": {parameter object}, "requiresMatching": true/false, "matchTarget": {"entityType": "...", "query": "..."}, "resolutions": [{"entityType": "...", "query": "...", "scopeBy": "account|opportunity"}], "additionalActions": [{"function": "...", "arguments": {...}, "reason": "extraction reason"}], "multiIntentAnalysis": {"hasMultipleIntents": true/false, "summary": "..."}}

Examples:
User: "Change this opportunity amount to 1.5M" -> {"function": "updateOpportunity", "arguments": {"amount": 1500000}}
User: "Update this account's region to South" -> {"function": "updateAccount", "arguments": {"region": "South"}}
User: "Mark this activity as completed" -> {"function": "updateActivity", "arguments": {"status": "completed"}}
User (on Activity detail page with pageData.id="abc123"): "mark it done" -> {"function": "updateActivity", "arguments": {"activityId": "abc123", "status": "completed"}}
User (on Activity detail page with pageData.id="xyz789"): "complete this" -> {"function": "updateActivity", "arguments": {"activityId": "xyz789", "status": "completed"}}
User (on Opportunity detail page): "mark as won" -> {"function": "updateOpportunity", "arguments": {"opportunityId": "<from pageData.id>", "stage": "won"}}
User (on Account detail page with pageData.accountId="acc123", pageData.accountName="Royal London Hospital"): "log an activity" -> {"function": "draftActivity", "arguments": {"accountId": "acc123", "accountName": "Royal London Hospital", "title": "Royal London Hospital - Activity"}}
User (on Account detail page with pageData.accountId="acc456", pageData.accountName="King's College"): "create opportunity" -> {"function": "draftOpportunity", "arguments": {"accountId": "acc456", "accountName": "King's College", "name": "King's College - Opportunity"}}
User (on Account detail page with pageData.accountId="acc789", pageData.accountName="Barts Health"): "add contact" -> {"function": "draftContact", "arguments": {"accountId": "acc789", "accountName": "Barts Health"}}
User: "What's on my schedule today?" -> {"function": "getTodayActivities", "arguments": {}}
User: "Find me customers in the East region" -> {"function": "getAccountsByRegion", "arguments": {"region": "East"}}
User: "Hello" -> {"function": null, "directResponse": "Hello! How can I help you today?"}
User: "Add an account and a contact for me" -> {"function": "batchDraft", "arguments": {"items": [{"type": "account", "data": {}}, {"type": "contact", "data": {}}]}}
User (on Account detail page with pageData.accountId="acc123", pageData.accountName="Royal London Hospital"): "add 2 contacts" -> {"function": "batchDraft", "arguments": {"accountId": "acc123", "accountName": "Royal London Hospital", "items": [{"type": "contact", "data": {}}, {"type": "contact", "data": {}}]}}
User (on Account detail page with pageData.accountId="acc456", pageData.accountName="King's College"): "create an opportunity and log a call" -> {"function": "batchDraft", "arguments": {"accountId": "acc456", "accountName": "King's College", "items": [{"type": "opportunity", "data": {"name": "King's College - New Opportunity"}}, {"type": "activity", "data": {"title": "King's College - Call", "type": "call"}}]}}

**Multi-Intent Extraction Examples (KEY)**:
User: "I visited King's College Hospital and discussed the new operation room procurement, they're looking for a new set of devices and will open bidding soon. we're going to introduce the new product next week."
->
{
  "function": "draftActivity",
  "arguments": {
    "title": "King's College Hospital - OR Procurement Discussion",
    "type": "visit",
    "accountName": "King's College Hospital",
    "result": "Discussed new OR procurement. They need new devices and will open bidding soon.",
    "nextStep": "Introduce new product next week"
  },
  "requiresMatching": true,
  "matchTarget": {"entityType": "account", "query": "King's College Hospital"},
  "additionalActions": [
    {
      "function": "draftOpportunity",
      "arguments": {
        "name": "King's College Hospital - OR Equipment Procurement",
        "accountName": "King's College Hospital",
        "stage": "prospecting",
        "lastAction": "Customer planning to open bidding for new OR devices"
      },
      "reason": "Opportunity: Customer plans to open bidding for new equipment"
    },
    {
      "function": "draftActivity",
      "arguments": {
        "title": "King's College Hospital - New Product Introduction",
        "type": "visit",
        "accountName": "King's College Hospital",
        "scheduledDate": "${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}",
        "notes": "Introduce new product to customer"
      },
      "reason": "Follow-up: Introduce new product next week"
    }
  ],
  "multiIntentAnalysis": {
    "hasMultipleIntents": true,
    "summary": "1) Log customer visit 2) Create opportunity (bidding procurement) 3) Schedule follow-up activity (product introduction)"
  }
}

User: "Just talked with Royal London about ICU upgrade project, budget is 2M, decision in Q3, I'll go again next Tuesday for details"
->
{
  "function": "draftActivity",
  "arguments": {
    "title": "Royal London - ICU Upgrade Discussion",
    "type": "meeting",
    "accountName": "Royal London",
    "result": "Discussed ICU upgrade project, budget 2M, decision in Q3"
  },
  "requiresMatching": true,
  "matchTarget": {"entityType": "account", "query": "Royal London"},
  "additionalActions": [
    {
      "function": "draftOpportunity",
      "arguments": {
        "name": "Royal London - ICU Upgrade Project",
        "accountName": "Royal London",
        "amount": 2000000,
        "stage": "qualification",
        "expectedCloseDate": "2026-09-30",
        "lastAction": "Initial discussion, Q3 decision timeline"
      },
      "reason": "Opportunity: ICU upgrade project, 2M budget, Q3 decision"
    },
    {
      "function": "draftActivity",
      "arguments": {
        "title": "Royal London - ICU Project Follow-up",
        "type": "visit",
        "accountName": "Royal London",
        "notes": "Follow-up on ICU upgrade project details"
      },
      "reason": "Follow-up: Visit next Tuesday for details"
    }
  ],
  "multiIntentAnalysis": {
    "hasMultipleIntents": true,
    "summary": "1) Log meeting 2) Create opportunity 3) Schedule Tuesday follow-up"
  }
}

**Multi-Intent with Update Operations Example**:
User (on Activity detail page pageData.id="meeting-123"): "mark this meeting as completed, we shared new features, customer is very interested, let's arrange onsite demo next Monday"
->
{
  "function": "updateActivity",
  "arguments": {"activityId": "meeting-123", "status": "completed", "result": "Shared new features, customer very interested", "nextStep": "Onsite demo next Monday"},
  "additionalActions": [
    {"function": "draftOpportunity", "arguments": {"name": "Customer - Product Adoption", "stage": "qualification"}, "reason": "Opportunity: Customer interested"},
    {"function": "draftActivity", "arguments": {"title": "Onsite Demo", "type": "visit"}, "reason": "Follow-up: Demo next Monday"}
  ],
  "multiIntentAnalysis": {"hasMultipleIntents": true, "summary": "1) Mark meeting complete 2) Create opportunity 3) Schedule demo"}
}

**⭐ CONTACT-FIRST MATCHING EXAMPLE (CRITICAL)**:
User: "Sent Sarah Lee an email with a detailed quotation for the operating room equipment and invited her to discuss further."
->
{
  "function": "draftActivity",
  "arguments": {
    "title": "Email - Quotation for OR Equipment",
    "type": "email",
    "contactName": "Sarah Lee",
    "result": "Sent detailed quotation for operating room equipment",
    "nextStep": "Await customer response for further discussion"
  },
  "requiresMatching": true,
  "matchTarget": {"entityType": "contact", "query": "Sarah Lee"}
}
// NOTE: When user mentions a contact name (Sarah Lee), match CONTACT first!
// After matching, system will automatically get the contact's account info.
// DO NOT set matchTarget.entityType to 'account' when a contact name is mentioned!

**Contact Creation Example**:
User: "Contact: Dr. Priya Sharma, Chief Medical Officer at Royal London Hospital. Email: priya.sharma@bartshealth.nhs.uk. Phone: +44 20 7377 7101. She oversees clinical strategy and is the primary decision-maker for new medical technology procurement."
->
{
  "function": "draftContact",
  "arguments": {
    "fullName": "Dr. Priya Sharma",
    "accountName": "Royal London Hospital",
    "title": "Chief Medical Officer",
    "email": "priya.sharma@bartshealth.nhs.uk",
    "phone": "+44 20 7377 7101",
    "isPrimary": true,
    "notes": "Oversees clinical strategy across all Barts Health sites. Primary decision-maker for new medical technology procurement and digital health initiatives."
  },
  "requiresMatching": true,
  "matchTarget": {"entityType": "account", "query": "Royal London Hospital"}
}

**MULTI-ENTITY RESOLUTION CHAIN EXAMPLE (resolutions[], I-3)**:
User: "Add a cardiac-consumables opportunity for Rachel Stenhouse at King's College Hospital, 800K amount, link it to next month's product demo meeting"
->
{
  "function": "draftActivity",
  "arguments": {
    "title": "Product Demo Meeting",
    "type": "meeting",
    "scheduledDate": "next-month-placeholder"
  },
  "requiresMatching": true,
  "resolutions": [
    {"entityType": "account", "query": "King's College Hospital"},
    {"entityType": "contact", "query": "Rachel Stenhouse", "scopeBy": "account"},
    {"entityType": "opportunity", "query": "cardiac consumables", "scopeBy": "account"}
  ],
  "additionalActions": [
    {
      "function": "draftOpportunity",
      "arguments": {
        "name": "King's College Hospital - Cardiac Consumables",
        "amount": 800000,
        "stage": "qualification"
      },
      "reason": "User explicitly mentioned new opportunity: cardiac consumables, 800K"
    }
  ],
  "multiIntentAnalysis": {
    "hasMultipleIntents": true,
    "summary": "1) Create product demo meeting activity 2) Link to account/contact/existing opportunity 3) Also create new cardiac-consumables opportunity"
  }
}

**⚡ TEMPORAL MODE EXAMPLES (I-8 Slice A, draftActivity ONLY)**:

User: "Just visited Rachel at King's College Hospital, they're interested in cardiac consumables, want a demo next week"
->
{
  "function": "draftActivity",
  "arguments": {
    "title": "King's College Hospital - Visit with Rachel",
    "type": "visit",
    "contactName": "Rachel",
    "temporalMode": "completed",
    "result": "Customer expressed strong interest in cardiac consumables",
    "nextStep": "Schedule product demo next week"
  },
  "requiresMatching": true,
  "matchTarget": {"entityType": "contact", "query": "Rachel"}
}
// completed cues: "just", "visited" (past tense) -> MUST prefill result and nextStep

User: "Plan a meeting with Rachel at King's College Hospital tomorrow afternoon"
->
{
  "function": "draftActivity",
  "arguments": {
    "title": "King's College Hospital - Meeting with Rachel",
    "type": "meeting",
    "contactName": "Rachel",
    "temporalMode": "planned",
    "scheduledDate": "<tomorrow's date>"
  },
  "requiresMatching": true,
  "matchTarget": {"entityType": "contact", "query": "Rachel"}
}
// planned cues: "plan", "tomorrow" -> DO NOT emit result/nextStep (activity has not happened yet)

User: "Log a meeting with Rachel at King's College Hospital"
->
{
  "function": "draftActivity",
  "arguments": {
    "title": "King's College Hospital - Meeting with Rachel",
    "type": "meeting",
    "contactName": "Rachel",
    "temporalMode": "unspecified"
  },
  "requiresMatching": true,
  "matchTarget": {"entityType": "contact", "query": "Rachel"}
}
// unspecified: no clear tense word -> preserve existing default behavior

}`;
  console.log('[CopilotAgent] Pass 1: Intent detection');

  // Notify progress: intent detection started
  if (onProgress) {
    onProgress({ stage: 'intent', status: 'active' });
  }
  
  // Build messages with conversation history
  const intentMessages: Array<{ role: string; content: string }> = [
    { role: 'system', content: intentSystemPrompt },
  ];
  
  // Add conversation history (last 10 messages to avoid token overflow)
  const recentHistory = history.slice(-10);
  for (const msg of recentHistory) {
    intentMessages.push({ role: msg.role, content: msg.content });
  }
  
  // Add current user message
  intentMessages.push({ role: 'user', content: userMessage });

  const intentResponse = await invokeFlowForLLM({
    messages: intentMessages,
  });

  if (!intentResponse.success) {
    // Record failure in circuit breaker
    recordCircuitBreakerFailure();
    recordMetrics({ success: false, latencyMs: Date.now() - startTime });
    
    return {
      success: false,
      content: '',
      error: intentResponse.error || 'LLM 调用失败',
      latencyMs: Date.now() - startTime,
    };
  }

  // Record success in circuit breaker
  recordCircuitBreakerSuccess();

  const intent = parseJsonResponse(intentResponse.content || '') as IntentResult | null;
  console.log('[INTENT] Raw LLM response:', intentResponse.content);
  console.log('[INTENT] userQuery="' + userMessage + '" => function=' + (intent?.function || 'null') + ', args=' + JSON.stringify(intent?.arguments || {}));

  // ===== Frame Shadow + Shadow Agent (hierarchical intent benchmark) =====
  // Fire-and-forget: run both the Frame classifier AND the full shadow pipeline
  // (Frame → sub-prompt → parse) in parallel with legacy. Results are logged
  // for benchmark comparison. Neither output affects production routing.
  void (async () => {
    try {
      const shadowCtx = {
        userMessage,
        pageContext: context.pageContext,
        conversationHistory: history,
        locale: (isZh ? 'zh-Hans' : 'en') as 'zh-Hans' | 'en',
      };

      // Run full shadow pipeline (Frame + sub-prompt)
      const shadowResult = await runShadowPipeline(shadowCtx);

      // Also record legacy Frame Shadow comparison (existing viewer)
      const agreement = compareFrameVsLegacy(shadowResult.frame, intent?.function ?? null);
      recordShadow({
        ts: Date.now(),
        userMessage,
        page: context.pageContext?.currentPage,
        frame: { success: true, result: shadowResult.frame, latencyMs: shadowResult.frameLatencyMs },
        legacy: {
          functionName: intent?.function ?? null,
          requiresMatching: intent?.requiresMatching,
          matchTargetEntity: intent?.matchTarget?.entityType,
          resolutionsCount: intent?.resolutions?.length,
          additionalActionsCount: intent?.additionalActions?.length,
          confidence: intent?.confidence,
          raw: (intentResponse.content || '').slice(0, 800),
        },
        agreement,
      });

      // Record shadow benchmark (new: full pipeline comparison)
      const benchmarkAgreement = compareShadowVsLegacy(
        shadowResult,
        intent?.function ?? null,
        intent?.arguments as Record<string, unknown> | undefined
      );
      recordBenchmark({
        ts: Date.now(),
        userMessage,
        page: context.pageContext?.currentPage,
        shadow: shadowResult,
        legacy: {
          functionName: intent?.function ?? null,
          arguments: intent?.arguments as Record<string, unknown> | undefined,
          additionalActions: intent?.additionalActions,
          latencyMs: intentResponse.latencyMs || 0,
        },
        agreement: benchmarkAgreement,
      });

      console.log('[ShadowAgent] Pipeline complete:',
        `frame=${shadowResult.subPromptKey}`,
        `sub-prompt=${shadowResult.subPromptOutput ? 'OK' : 'FAIL'}`,
        `total=${shadowResult.totalLatencyMs}ms`,
        `funcMatch=${benchmarkAgreement.functionMatch}`,
        `argOverlap=${benchmarkAgreement.argumentOverlap?.toFixed(2) ?? 'n/a'}`
      );
    } catch (err) {
      console.warn('[ShadowAgent] background run failed:', err);
    }
  })();

  // Notify progress: intent detection completed
  const intentLabel = intent?.function 
    ? getDisplayName(intent.function, isZh ? 'zh-Hans' : 'en-US')
    : (isZh ? '直接回复' : 'Direct Response');
  if (onProgress) {
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
          { stage: 'intent', status: 'completed', label: isZh ? `意图识别：${intentLabel}` : `Intent: ${intentLabel}` }
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
                  { stage: 'intent', status: 'completed', label: isZh ? `意图识别：${intentLabel}` : `Intent: ${intentLabel}` },
                  { stage: 'matching', status: 'completed', label: isZh ? `找到 ${highConfAccountMatches.length} 个匹配客户` : `Found ${highConfAccountMatches.length} matching account${highConfAccountMatches.length === 1 ? '' : 's'}` },
                ],
              };
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
                  },
                },
                latencyMs: Date.now() - startTime,
                thinkingSteps: [
                  { stage: 'intent', status: 'completed', label: isZh ? `意图识别：${intentLabel}` : `Intent: ${intentLabel}` },
                  { stage: 'matching', status: 'completed', label: isZh ? `发现 ${highConfActivityMatches.length} 个类似活动` : `Found ${highConfActivityMatches.length} similar activit${highConfActivityMatches.length === 1 ? 'y' : 'ies'}` },
                ],
              };
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
                  };
                })(),
              },
              latencyMs: Date.now() - startTime,
              thinkingSteps: [
                { stage: 'intent', status: 'completed', label: isZh ? `意图识别：${intentLabel}` : `Intent: ${intentLabel}` },
                { stage: 'matching', status: 'completed', label: isZh ? `找到 ${highConfidenceMatches.length} 个高置信度匹配` : `Found ${highConfidenceMatches.length} high-confidence matches` },
              ],
            };
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
                },
                // I-3 Slice 2: carry remaining queue + resolvedSoFar for Context cascade.
                remainingResolutions: remainingResolutions.length > 0 ? remainingResolutions : undefined,
                resolvedSoFar: Object.keys(resolvedSoFar).length > 0 ? { ...resolvedSoFar } : undefined,
              },
              latencyMs: Date.now() - startTime,
              thinkingSteps: [
                { stage: 'intent', status: 'completed', label: isZh ? `意图识别：${intentLabel}` : `Intent: ${intentLabel}` },
                { stage: 'matching', status: 'completed', label: isZh ? `未找到 ${kindZh} 匹配，等待用户决断` : `No ${pendingKind} match, awaiting user` },
              ],
            };
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
    
    // Get account context for injecting into additional intents
    const matchedAccountId = intent.arguments?.accountId as string | undefined;
    const matchedAccountName = intent.arguments?.accountName as string | undefined;
    
    // Process additional intents asynchronously
    const additionalItems = await processAdditionalIntents(
      additionalActions.map((action, index) => ({
        id: `additional_${index + 1}`,
        function: action.function,
        arguments: {
          ...action.arguments,
          // Inject account context if not present
          ...(matchedAccountId && !action.arguments.accountId ? { accountId: matchedAccountId } : {}),
          ...(matchedAccountName && !action.arguments.accountName ? { accountName: matchedAccountName } : {}),
        },
        confidence: 0.75,
        type: 'inferred' as const,
        priority: 10 + index,
        missingFields: [] as string[],
        source: 'inferred' as const,
        reason: action.reason || (isZh ? '从对话中推断' : 'Inferred from conversation'),
      })),
      { userId: context.userId, userEmail: context.userEmail },
      isZh
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
        { stage: 'intent', status: 'completed', label: isZh ? `意图识别：${intentLabel}` : `Intent: ${intentLabel}` },
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
        { stage: 'intent', status: 'completed', label: isZh ? `意图识别：${intentLabel}` : `Intent: ${intentLabel}` },
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
    ? `你是一个友好的销售助手。根据函数执行结果，用自然语言回复用户。

重要规则:
1. 不要逐条列出具体记录 - 详细列表会以卡片形式单独展示给用户
2. 你的回复应该是摘要和分析，包括:
   - 数量统计（如：共找到X条记录）
   - 关键洞察（如：金额分布、行业分布、时间分布、状态分布等）
   - 业务建议或下一步行动建议
3. 保持简洁，2-3句话即可
4. 必须使用中文回复
5. 如果数据为空，友好地告知用户`
    : `You are a friendly sales assistant. Based on the function execution result, respond to the user in natural language.

Important rules:
1. Do NOT list individual records - detailed list will be shown separately as cards to the user
2. Your response should be a summary and analysis, including:
   - Count statistics (e.g., Found X records)
   - Key insights (e.g., amount distribution, industry distribution, time distribution, status distribution)
   - Business suggestions or next action recommendations
3. Keep it concise, 2-3 sentences
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
    { 
      stage: 'intent' as const, 
      status: 'completed' as const, 
      label: isZh ? `意图识别：${intentLabel}` : `Intent: ${intentLabel}` 
    },
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
        records: resultData.map((item: Record<string, unknown>) => ({
          id: String(item.id || ''),
          title: String(item.name1 || item.name || ''),
          subtitle: item.estimatedvalue ? `$${(Number(item.estimatedvalue) / 1000).toFixed(0)}K` : '',
          meta: String(item.stage || ''),
        })),
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
          const rawType = String(item.type || item.typeKey || '');
          const typeLabel = ActivityTypeKeyToLabel[rawType as ActivityTypeKey] || rawType;
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
