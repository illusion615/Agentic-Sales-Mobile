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
 * Published Power Apps Code Apps corrupt flow responses that contain multibyte
 * UTF-8 characters (e.g. Chinese) in the SDK/storageproxy decode channel, causing
 * "JSON Parse error: Unterminated string" (see microsoft/PowerAppsCodeApps#359).
 *
 * Mitigation: the flow base64-encodes its payload and prefixes it with `B64:`.
 * Base64 is pure ASCII, so it survives the channel intact; we decode it here back
 * to UTF-8. Responses WITHOUT the prefix are returned unchanged (backward compatible).
 */
const B64_PREFIX = 'B64:';

/** Telemetry counters for base64 transport health. */
const b64Stats = { total: 0, b64: 0, raw: 0, decodeFailed: 0 };

/** Read-only snapshot of base64 transport telemetry. */
export function getB64Stats() { return { ...b64Stats }; }

function decodeFlowPayload(raw: string): string {
  b64Stats.total += 1;
  if (!raw.startsWith(B64_PREFIX)) {
    b64Stats.raw += 1;
    return raw;
  }
  b64Stats.b64 += 1;
  const b64 = raw.slice(B64_PREFIX.length).trim();
  try {
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch (err) {
    b64Stats.decodeFailed += 1;
    console.warn('[Power Automate] base64 decode failed, using raw payload:', err);
    return raw;
  }
}

/**
 * Whether the LLM flow is available for use.
 * UI components can use this to show/hide AI features.
 *
 * The Power Automate flow is baked into the build via the SDK connector,
 * so it is available regardless of localStorage state. The only reason to
 * report unavailable is if the user has explicitly disabled it in settings.
 * (Treating a missing config as "unavailable" causes a race on first load
 * where Copilot opens before useInitSettings has written the flag.)
 */
export function isFlowAvailable(): boolean {
  const config = getLLMConfig();
  if (config && config.enabled === false) return false;
  return true;
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

    // Cast needed: Flow trigger enum will be updated to include 'dag'|'json-generic';
    // until then the SDK type is narrower than our internal type.
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

    const rawContent = decodeFlowPayload(result.data?.output ?? '');
    console.log('[Power Automate] Flow response length:', rawContent.length);

    // Only repair JSON when a JSON format was explicitly requested.
    // jsonrepair can mangle plain text responses.
    let content = rawContent;
    if (responseFormat !== 'text') {
      try {
        content = jsonrepair(rawContent);
        console.log('[Power Automate] jsonrepair applied, before:', rawContent.substring(0, 80), '→ after:', content.substring(0, 80));
      } catch (repairErr) {
        console.warn('[Power Automate] jsonrepair failed, using raw:', repairErr);
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
