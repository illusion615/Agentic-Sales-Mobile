/**
 * AI Builder Direct Service
 * Invokes AI Builder custom prompts directly via Dataverse Custom API,
 * bypassing Power Automate Flow entirely.
 *
 * This eliminates:
 * - shared_logicflows connectionReference (which causes launch 500)
 * - Flow run quota consumption
 * - UTF-8 multibyte corruption (microsoft/PowerAppsCodeApps#359)
 * - ~1-3s Flow middleware latency
 *
 * Uses generated service classes from `power-apps add-dataverse-api`.
 */

import { getLLMConfig } from '@/lib/i18n';
import { jsonrepair } from 'jsonrepair';
import { Msdyn_aibdptcustomprompt104e526adeab4292bf186b6180dfd75cService as TextPromptService } from '@/generated/services/Msdyn_aibdptcustomprompt104e526adeab4292bf186b6180dfd75cService';
import { Msdyn_aibdptcustomprompt124202362324ambbd51cc43b914f54958cd773f856a323Service as JsonPromptService } from '@/generated/services/Msdyn_aibdptcustomprompt124202362324ambbd51cc43b914f54958cd773f856a323Service';
import { Msdyn_aibdptcustomprompt228202435537pmbd0d86826d054e2ba9efc694a371f6fbService as DagPromptService } from '@/generated/services/Msdyn_aibdptcustomprompt228202435537pmbd0d86826d054e2ba9efc694a371f6fbService';
import { Msdyn_aibdptcustomprompt228202450236pmfa03a8f2db2741658a366f471cb5b2b7Service as JsonGenericPromptService } from '@/generated/services/Msdyn_aibdptcustomprompt228202450236pmfa03a8f2db2741658a366f471cb5b2b7Service';

export interface FlowLLMResponse {
  success: boolean;
  content?: string;
  error?: string;
  latencyMs?: number;
}

type ResponseFormat = 'text' | 'json' | 'dag' | 'json-generic';

/** Telemetry counters */
const b64Stats = { total: 0, b64: 0, raw: 0, decodeFailed: 0 };
export function getB64Stats() { return { ...b64Stats }; }

/**
 * Decode flow payload — kept for backward compatibility.
 * Direct AI Builder calls return plain UTF-8, so B64 prefix is unlikely.
 */
const B64_PREFIX = 'B64:';
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
    console.warn('[AI Tool] base64 decode failed, using raw:', err);
    return raw;
  }
}

/**
 * Whether the LLM is available for use.
 */
export function isFlowAvailable(): boolean {
  const config = getLLMConfig();
  if (config && config.enabled === false) return false;
  return true;
}

/**
 * Invoke AI Builder custom prompt directly via Dataverse Custom API.
 */
export async function invokeFlowForLLM(
  request: {
    messages: Array<{ role: string; content: string }>;
    responseFormat?: 'text' | 'json' | 'dag' | 'json-generic';
  },
): Promise<FlowLLMResponse> {
  const startTime = Date.now();

  if (!isFlowAvailable()) {
    return {
      success: false,
      error: 'AI assistant is not enabled',
      latencyMs: Date.now() - startTime,
    };
  }

  try {
    const text = request.messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const responseFormat: ResponseFormat = request.responseFormat ?? 'text';

    console.log('[AI Tool] Invoking prompt via generated service, format:', responseFormat, 'prompt length:', text.length);

    // Call via generated Dataverse operation services (from `power-apps add-dataverse-api`)
    let result: { success: boolean; data?: Record<string, unknown> | null; error?: { message?: string } };
    switch (responseFormat) {
      case 'json':
        result = await JsonPromptService.msdyn_aibdptcustomprompt124202362324ambbd51cc43b914f54958cd773f856a323(text);
        break;
      case 'dag':
        result = await DagPromptService.msdyn_aibdptcustomprompt228202435537pmbd0d86826d054e2ba9efc694a371f6fb(text);
        break;
      case 'json-generic':
        result = await JsonGenericPromptService.msdyn_aibdptcustomprompt228202450236pmfa03a8f2db2741658a366f471cb5b2b7('', text);
        break;
      default: // 'text'
        result = await TextPromptService.msdyn_aibdptcustomprompt104e526adeab4292bf186b6180dfd75c(text);
        break;
    }

    const latencyMs = Date.now() - startTime;

    if (!result.success) {
      console.error('[AI Tool] Custom API error:', JSON.stringify(result.error, null, 2));
      console.error('[AI Tool] Full result:', JSON.stringify(result, null, 2));
      return {
        success: false,
        error: result.error?.message ?? 'AI Builder predict failed',
        latencyMs,
      };
    }

    // Extract prediction output text
    const data = result.data as Record<string, unknown>;
    let rawContent = '';

    // Response shape: { ResponsePayload: "{ predictionOutput: { text: '...' } }" }
    const payload = data?.ResponsePayload ?? data?.responsev2 ?? data;
    if (typeof payload === 'string') {
      try {
        const parsed = JSON.parse(payload);
        rawContent = parsed?.predictionOutput?.text ?? parsed?.text ?? payload;
      } catch {
        rawContent = payload;
      }
    } else if (typeof payload === 'object' && payload !== null) {
      const p = payload as Record<string, unknown>;
      rawContent = (p.predictionOutput as Record<string, string>)?.text
        ?? (p as Record<string, string>).text
        ?? JSON.stringify(payload);
    }

    // Decode in case of B64 prefix (backward compat)
    rawContent = decodeFlowPayload(rawContent);
    console.log('[AI Tool] Response length:', rawContent.length);

    // JSON repair for structured formats
    let content = rawContent;
    if (responseFormat !== 'text') {
      try {
        content = jsonrepair(rawContent);
      } catch {
        content = rawContent;
      }
    }

    return { success: true, content, latencyMs };
  } catch (error: unknown) {
    const latencyMs = Date.now() - startTime;
    console.error('[AI Tool] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error invoking AI Builder',
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
