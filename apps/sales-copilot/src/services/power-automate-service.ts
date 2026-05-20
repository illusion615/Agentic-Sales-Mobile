/**
 * Power Automate Flow Service
 * Invokes the "Power Apps Flow - LLM" via SDK connector (shared_logicflows).
 *
 * Flow contract:
 *   Input:  { text: string }          — the prompt text
 *   Output: { output?: string }       — the AI-generated response
 */

import { PowerAppsFlow_LLMService } from '@/generated/services/PowerAppsFlow_LLMService';

export interface FlowLLMResponse {
  success: boolean;
  content?: string;
  error?: string;
  latencyMs?: number;
}

/**
 * Invoke the LLM flow via Power Platform connector.
 *
 * Callers pass a `messages` array (OpenAI chat format). This function
 * serialises them into a single `text` string for the flow's Prompt input.
 */
export async function invokeFlowForLLM(
  request: { messages: Array<{ role: string; content: string }> },
): Promise<FlowLLMResponse> {
  const startTime = Date.now();

  try {
    // Serialise messages → single prompt string
    const text = request.messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    console.log('[Power Automate] Invoking LLM flow via SDK connector, prompt length:', text.length);

    const result = await PowerAppsFlow_LLMService.Run({ text });
    const latencyMs = Date.now() - startTime;

    if (!result.success) {
      console.error('[Power Automate] Flow SDK error:', result.error);
      return {
        success: false,
        error: result.error?.message ?? 'Flow invocation failed',
        latencyMs,
      };
    }

    const content = result.data?.output ?? '';
    console.log('[Power Automate] Flow response length:', content.length);

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
