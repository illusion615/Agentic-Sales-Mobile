/**
 * Copilot Studio fallback — routes unanswerable queries to CS.
 * Extracted from copilot-agent.ts.
 */

import { executeFunction } from './function-executor';
import type { AgentResponse, ThinkingProgress } from './copilot-agent-types';

export async function fallbackToCopilotStudio(
  userQuery: string,
  locale: string,
  startTime: number,
  context: {
    userId?: string;
    userEmail?: string;
    pageContext?: { currentPage?: string; summary?: string; pageData?: unknown };
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  },
  onProgress?: (progress: ThinkingProgress) => void
): Promise<AgentResponse> {
  console.log('[FALLBACK_CS] ENTER fallbackToCopilotStudio, userQuery=', userQuery);
  const isZh = locale === 'zh-Hans';

  if (onProgress) {
    onProgress({ stage: 'intent', status: 'completed', intentLabel: isZh ? '转 Copilot Studio' : 'Copilot Studio' });
  }

  const thinkingSteps: AgentResponse['thinkingSteps'] = [
    { stage: 'intent', status: 'completed', label: isZh ? '转 Copilot Studio 查询' : 'Routing to Copilot Studio' }
  ];

  if (onProgress) {
    onProgress({ stage: 'executing', status: 'active', functionDisplayName: 'Copilot Studio' });
  }

  try {
    console.log('[FALLBACK_CS] Calling executeFunction(queryCopilotStudio)...');
    const result = await executeFunction(
      'queryCopilotStudio',
      { query: userQuery },
      { userId: context.userId, userEmail: context.userEmail, pageContext: context.pageContext, conversationHistory: context.conversationHistory, locale },
    );
    console.log('[FALLBACK_CS] executeFunction returned:', JSON.stringify(result).slice(0, 500));

    if (onProgress) {
      onProgress({ stage: 'executing', status: 'completed', functionDisplayName: 'Copilot Studio' });
    }

    if (result.success && result.data) {
      const data = result.data as { answer?: string; source?: string };
      thinkingSteps.push({ stage: 'executing', status: 'completed', label: isZh ? 'Copilot Studio：查询成功' : 'Copilot Studio: Query successful' });
      return {
        success: true,
        content: data.answer || (isZh ? '收到您的问题，但暂时没有相关信息。' : 'I received your question but have no relevant information at this time.'),
        functionCalled: 'queryCopilotStudio', functionDisplayName: 'Copilot Studio',
        latencyMs: Date.now() - startTime, thinkingSteps,
      };
    }

    console.warn('[CopilotAgent] Copilot Studio failed:', result.error);
    thinkingSteps.push({ stage: 'executing', status: 'completed', label: isZh ? 'Copilot Studio 不可用' : 'Copilot Studio unavailable' });
    return {
      success: true,
      content: isZh ? '我不太理解你的问题，请换个方式问我吧。' : 'I am not sure I understand. Could you rephrase?',
      latencyMs: Date.now() - startTime, thinkingSteps,
    };
  } catch (error) {
    console.error('[CopilotAgent] Copilot Studio exception:', error);
    if (onProgress) onProgress({ stage: 'executing', status: 'completed', functionDisplayName: 'Copilot Studio' });
    thinkingSteps.push({ stage: 'executing', status: 'completed', label: isZh ? 'Copilot Studio 不可用，回退到通用提示' : 'Copilot Studio unavailable, using fallback' });
    return {
      success: true,
      content: isZh ? '我不太理解你的问题，请换个方式问我吧。' : 'I am not sure I understand. Could you rephrase?',
      latencyMs: Date.now() - startTime, thinkingSteps,
    };
  }
}
