/**
 * Power Automate Flow Service
 * Invokes the "Power Apps Flow - LLM" via SDK connector (shared_logicflows).
 *
 * Flow contract:
 *   Input:  { text: string, text_1: 'text' | 'json' }
 *   Output: { output?: string }
 *
 * ALL LLM availability checks are centralised here.
 * Callers should NOT check getLLMConfig / endpoint / enabled themselves.
 */

import { PowerAppsFlow_LLMService } from '@/generated/services/PowerAppsFlow_LLMService';
import { getLLMConfig } from '@/lib/i18n';

export interface FlowLLMResponse {
  success: boolean;
  content?: string;
  error?: string;
  latencyMs?: number;
}

/**
 * Whether the LLM flow is available for use.
 * UI components can use this to show/hide AI features.
 */
export function isFlowAvailable(): boolean {
  const config = getLLMConfig();
  return !!config?.enabled;
}

/**
 * Invoke the LLM flow via Power Platform connector.
 *
 * Callers pass a `messages` array (OpenAI chat format). This function
 * serialises them into a single `text` string for the flow's Prompt input.
 *
 * Contains its own availability guard — callers do NOT need to pre-check config.
 */
export async function invokeFlowForLLM(
  request: {
    messages: Array<{ role: string; content: string }>;
    responseFormat?: 'text' | 'json';
  },
): Promise<FlowLLMResponse> {
  const startTime = Date.now();

  // Centralised availability check — no caller needs to duplicate this
  if (!isFlowAvailable()) {
    return {
      success: false,
      error: 'AI assistant is not enabled',
      latencyMs: Date.now() - startTime,
    };
  }

  try {
    // Serialise messages → single prompt string
    const text = request.messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const responseFormat = request.responseFormat ?? 'text';
    console.log('[Power Automate] Invoking LLM flow, prompt length:', text.length, 'responseFormat:', responseFormat);

    const result = await PowerAppsFlow_LLMService.Run({ text, text_1: responseFormat });
    const latencyMs = Date.now() - startTime;

    if (!result.success) {
      console.error('[Power Automate] Flow SDK error:', result.error);
      return {
        success: false,
        error: result.error?.message ?? 'Flow invocation failed',
        latencyMs,
      };
    }

    const rawContent = result.data?.output ?? '';
    console.log('[Power Automate] Flow response length:', rawContent.length);

    // Sanitize LLM output: fix invalid JSON escape sequences (e.g. \. \$ \+ \()
    // LLMs frequently produce these in string values, breaking JSON.parse downstream.
    const content = rawContent.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');

    return { success: true, content, latencyMs };
  } catch (error: unknown) {
    const latencyMs = Date.now() - startTime;
    console.error('[Power Automate] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error invoking flow',
      latencyMs,
    };
  }
}

/**
 * Quick connectivity test
 */
export async function testFlowConnection(): Promise<{
  success: boolean;
  error?: string;
  latencyMs?: number;
}> {
  const result = await invokeFlowForLLM({
    messages: [{ role: 'user', content: 'Hello' }],
  });
  return { success: result.success, error: result.error, latencyMs: result.latencyMs };
}
