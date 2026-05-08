/**
 * Copilot Agent with Function Calling
 * Orchestrates intent detection, function execution, and response generation
 */

import { invokeFlowForLLM } from '@/services/power-automate-service';
import { getLLMConfig, getLocale } from '@/lib/i18n';
import { getFunctionListForPrompt, getDisplayName } from './function-registry';
import { executeFunction, type DirectLineSessionRefs } from './function-executor';

// Greeting pattern for detecting simple greetings that don't need Copilot Studio
const GREETING_PATTERN = /^(hi|hello|hey|你好|您好|嗨|早上好|下午好|晚上好|good\s*(morning|afternoon|evening))\b/i;
export interface ThinkingProgress {
  stage: 'intent' | 'executing' | 'generating';
  status: 'active' | 'completed';
  intentLabel?: string;
  functionDisplayName?: string;
}

export interface AgentResponse {
  success: boolean;
  content: string;
  functionCalled?: string;
  functionDisplayName?: string;
  functionResult?: unknown;
  error?: string;
  latencyMs?: number;
  // Final thinking steps for display
  thinkingSteps?: Array<{
    stage: 'intent' | 'executing' | 'generating';
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
    type: 'account' | 'opportunity' | 'activity';
    records: Array<{
      id: string;
      title: string;
      subtitle?: string;
      meta?: string;
    }>;
    title?: string;
  };
}

interface IntentResult {
  function: string | null;
  arguments?: Record<string, unknown>;
  directResponse?: string;
}

/**
 * Parse JSON from LLM response, with fallback regex extraction
 */
function parseJsonResponse(text: string): IntentResult | null {
  // First try direct parse
  try {
    return JSON.parse(text) as IntentResult;
  } catch {
    // Fallback: extract first JSON object with regex
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as IntentResult;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Fallback to Copilot Studio when intent recognition fails
 * Calls the existing queryCopilotStudio function executor
 */
async function fallbackToCopilotStudio(
  userQuery: string,
  locale: string,
  startTime: number,
  context: { userId?: string; userEmail?: string; sessionRefs?: DirectLineSessionRefs },
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
      { userId: context.userId, userEmail: context.userEmail },
      context.sessionRefs
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
    sessionRefs?: DirectLineSessionRefs;
  },
  onProgress?: (progress: ThinkingProgress) => void
): Promise<AgentResponse> {
  const startTime = Date.now();
  const llmConfig = getLLMConfig();

  if (!llmConfig?.enabled || !llmConfig?.endpoint) {
    return {
      success: false,
      content: '',
      error: '请先到设置配置 BYOM 端点 / Please configure BYOM endpoint in Settings',
      latencyMs: Date.now() - startTime,
    };
  }

  const functionList = getFunctionListForPrompt();
  const isZh = (context.locale || getLocale()) === 'zh-Hans';
  const today = new Date().toISOString().split('T')[0];
  const history = context.conversationHistory || [];

  // Build page context string for the prompt
  let pageContextStr = '';
  if (context.pageContext) {
    const { currentPage, summary, pageData } = context.pageContext;
    if (isZh) {
      pageContextStr = `\n\n当前页面: ${currentPage}`;
      if (summary) pageContextStr += `\n页面摘要: ${summary}`;
      if (pageData) pageContextStr += `\n页面数据: ${JSON.stringify(pageData, null, 2).slice(0, 2000)}`;
    } else {
      pageContextStr = `\n\nCurrent page: ${currentPage}`;
      if (summary) pageContextStr += `\nPage summary: ${summary}`;
      if (pageData) pageContextStr += `\nPage data: ${JSON.stringify(pageData, null, 2).slice(0, 2000)}`;
    }
  }

  // ===== Pass 1: Intent Detection =====
  const intentSystemPrompt = isZh
    ? `你是一个销售助手 AI。根据用户问题和对话历史，决定是否需要调用数据查询函数。
今天日期: ${today}${pageContextStr}

可用函数:
${functionList}

规则:
1. 如果用户询问客户、商机、活动等业务数据，选择最合适的函数
2. 如果用户提到"这个"、"它"、"当前"等指代词，结合页面上下文和对话历史理解
3. 如果是闲聊、打招呼（如"你好"、"hi"），设置 function 为 null 并直接回复
4. **重要**：区分两种产品相关问题：
   - "queryCopilotStudio"：仅当用户问的是本系统 Dataverse 里已有的产品记录（如"产品XX有哪些客户"、"产品XX的商机"）
   - "externalKnowledgeQuery"：当用户问的是产品的通用知识、规格参数、技术原理、功能介绍、行业知识、公司外部信息等（如"迈瑞的产品有哪些"、"XX设备的规格是什么"、"如何使用XX设备"）
5. 对于天气、通用常识、技术解释等超出本地数据范围的问题，使用 "externalKnowledgeQuery"
6. 严格输出 JSON，不要任何解释、markdown、代码块
7. 你的所有回复必须使用中文

JSON 格式:
{"function": "函数名或null", "arguments": {参数对象}, "directResponse": "如果不调函数则填写回复"}

示例:
用户: "今天有什么安排？" -> {"function": "getTodayActivities", "arguments": {}}
用户: "帮我找一下华东的客户" -> {"function": "getAccountsByRegion", "arguments": {"region": "华东"}}
用户: "你好" -> {"function": null, "directResponse": "你好！有什么我可以帮你的吗？"}
用户: "迈瑞有哪些产品" -> {"function": "externalKnowledgeQuery", "arguments": {"query": "迈瑞有哪些产品"}}
用户: "XX设备的技术参数是什么" -> {"function": "externalKnowledgeQuery", "arguments": {"query": "XX设备的技术参数是什么"}}
用户: "今天天气怎么样" -> {"function": "externalKnowledgeQuery", "arguments": {"query": "今天天气怎么样"}}`
    : `You are a sales assistant AI. Based on the user's question and conversation history, decide whether to call a data query function.
Today's date: ${today}${pageContextStr}

Available functions:
${functionList}

Rules:
1. If the user asks about customers, opportunities, activities, or other business data, choose the most appropriate function
2. If the user mentions "this", "it", "current" etc., understand context from page data and conversation history
3. If it's small talk or greeting (like "hello", "hi"), set function to null and respond directly
4. **IMPORTANT**: Distinguish between two types of product-related questions:
   - "queryCopilotStudio": ONLY when user asks about product RECORDS in this system's Dataverse (e.g., "which customers use product XX", "opportunities for product XX")
   - "externalKnowledgeQuery": When user asks about general product knowledge, specifications, technical principles, features, industry info, or external company info (e.g., "what products does Mindray have", "what are the specs of XX device", "how to use XX equipment")
5. For weather, general knowledge, technical explanations, or anything beyond local Dataverse data, use "externalKnowledgeQuery"
6. Output strict JSON only, no explanations, no markdown, no code blocks
7. All your responses must be in English

JSON format:
{"function": "functionName or null", "arguments": {parameter object}, "directResponse": "response if no function needed"}

Examples:
User: "What's on my schedule today?" -> {"function": "getTodayActivities", "arguments": {}}
User: "Find me customers in the East region" -> {"function": "getAccountsByRegion", "arguments": {"region": "East"}}
User: "Hello" -> {"function": null, "directResponse": "Hello! How can I help you today?"}
User: "i want to know mindray products" -> {"function": "externalKnowledgeQuery", "arguments": {"query": "i want to know mindray products"}}
User: "what is the spec of XX" -> {"function": "externalKnowledgeQuery", "arguments": {"query": "what is the spec of XX"}}
User: "explain quantum physics" -> {"function": "externalKnowledgeQuery", "arguments": {"query": "explain quantum physics"}}`;

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

  const intentResponse = await invokeFlowForLLM(llmConfig.endpoint, {
    messages: intentMessages,
    model: llmConfig.model,
    deploymentName: llmConfig.deploymentName,
  });

  if (!intentResponse.success) {
    return {
      success: false,
      content: '',
      error: intentResponse.error || 'LLM 调用失败',
      latencyMs: Date.now() - startTime,
    };
  }

  const intent = parseJsonResponse(intentResponse.content || '') as IntentResult | null;
  console.log('[INTENT] userQuery="' + userMessage + '" => function=' + (intent?.function || 'null') + ', args=' + JSON.stringify(intent?.arguments || {}));

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
      { userId: context.userId, userEmail: context.userEmail, sessionRefs: context.sessionRefs },
      onProgress
    );
  }

  // FAILURE B: No function matched
  if (!intent.function) {
    // If it's a simple greeting, return the direct response
    const directResp = intent.directResponse || '';
    if (directResp && GREETING_PATTERN.test(userMessage.trim())) {
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
      { userId: context.userId, userEmail: context.userEmail, sessionRefs: context.sessionRefs },
      onProgress
    );
  }

  // ===== Route externalKnowledgeQuery directly to Copilot Studio =====
  if (intent.function === 'externalKnowledgeQuery') {
    console.log('[CopilotAgent] Routing externalKnowledgeQuery to Copilot Studio');
    return await fallbackToCopilotStudio(
      (intent.arguments?.query as string) || userMessage,
      context.locale || getLocale(),
      startTime,
      { userId: context.userId, userEmail: context.userEmail, sessionRefs: context.sessionRefs },
      onProgress
    );
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
    functionResult = await executeFunction(
      intent.function,
      intent.arguments || {},
      { userId: context.userId, userEmail: context.userEmail }
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

  // FAILURE C: Function execution failed - check if unknown function
  if (!functionResult.success) {
    const errorMsg = functionResult.error || '函数执行失败';
    
    // If unknown function, fallback to Copilot Studio
    if (errorMsg.startsWith('未知函数') || errorMsg.startsWith('Unknown function')) {
      console.warn('[CopilotAgent] Unknown function, falling back to Copilot Studio:', errorMsg);
      return await fallbackToCopilotStudio(
        userMessage,
        context.locale || getLocale(),
        startTime,
        { userId: context.userId, userEmail: context.userEmail, sessionRefs: context.sessionRefs },
        onProgress
      );
    }
    
    // Other execution errors - return error response
    return {
      success: false,
      content: '',
      error: errorMsg,
      functionCalled: intent.function,
      functionDisplayName: fnDisplayName,
      latencyMs: Date.now() - startTime,
      thinkingSteps: [
        { stage: 'intent', status: 'completed', label: isZh ? `意图识别：${fnDisplayName}` : `Intent: ${fnDisplayName}` },
        { stage: 'executing', status: 'completed', label: isZh ? `${fnDisplayName}：执行失败` : `${fnDisplayName}: Failed`, detail: isZh ? '执行失败' : 'Failed' }
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
    finalResponse = await invokeFlowForLLM(llmConfig.endpoint, {
      messages: [
        { role: 'system', content: responseSystemPrompt },
        { role: 'user', content: responseUserPrompt },
      ],
      model: llmConfig.model,
      deploymentName: llmConfig.deploymentName,
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
          subtitle: item.estimatedvalue ? `¥${Number(item.estimatedvalue).toLocaleString()}` : '',
          meta: String(item.stage || ''),
        })),
        title: isZh ? '商机列表' : 'Opportunities',
      };
    } else if (fnName?.includes('Activit') || fnName === 'getTodayActivities' || fnName === 'getUpcomingActivities') {
      recordList = {
        type: 'activity',
        records: resultData.map((item: Record<string, unknown>) => ({
          id: String(item.id || ''),
          title: String(item.title || ''),
          subtitle: String(item.type || item.typeKey || ''),
          meta: item.scheduleddate ? new Date(String(item.scheduleddate)).toLocaleDateString() : '',
        })),
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
    latencyMs: Date.now() - startTime,
    thinkingSteps,
    recordList,
  };
}
