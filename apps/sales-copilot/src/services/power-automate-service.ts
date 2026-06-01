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
import { jsonrepair } from 'jsonrepair';

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
/**
 * Contains its own availability guard — callers do NOT need to pre-check config.
 */
export async function invokeFlowForLLM(
  request: {
    messages: Array<{ role: string; content: string }>;
    responseFormat?: 'text' | 'json' | 'dag' | 'json-generic';
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

    const rawOutput = result.data?.output ?? '';
    // Decode B64: prefix — Flow wraps LLM responses in base64 to avoid
    // OData special character issues in the "Respond to PowerApp" action.
    const rawContent = rawOutput.startsWith('B64:')
      ? atob(rawOutput.slice(4))
      : rawOutput;
    console.log('[Power Automate] Flow response length:', rawContent.length);
    console.log('[Power Automate] Raw response preview:', rawContent.slice(0, 200));

    // Repair malformed JSON from LLM output (unterminated strings, invalid
    // escapes, trailing commas, etc.) using the battle-tested jsonrepair lib.
    // Only run for JSON response formats — plain text responses must NOT be
    // "repaired" as jsonrepair aggressively converts markdown lists into JSON arrays.
    let content = rawContent;
    if (responseFormat !== 'text') {
      try {
        content = jsonrepair(rawContent);
      } catch {
        // jsonrepair throws on completely unparseable input — keep raw content
        content = rawContent;
      }
    }

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
