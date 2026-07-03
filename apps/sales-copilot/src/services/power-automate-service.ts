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
import { getClient } from '@microsoft/power-apps/data';
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo';
import { getTextPromptOpName } from './prompt-resolver';
import { Msdyn_aibdptcustomprompt104e526adeab4292bf186b6180dfd75cService as TextPromptService } from '@/generated/services/Msdyn_aibdptcustomprompt104e526adeab4292bf186b6180dfd75cService';

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
 * Invoke a custom prompt by its (possibly runtime-resolved) Custom API operation
 * name. Mirrors the generated TextPromptService call but with a dynamic name so
 * it keeps working when the AI model GUID differs across environments.
 */
async function invokeTextPromptByOpName(
  opName: string,
  text: string,
): Promise<{ success: boolean; data?: Record<string, unknown> | null; error?: { message?: string } }> {
  const client = getClient(dataSourcesInfo);
  return client.executeAsync<{ prompt_20text: string }, Record<string, unknown>>({
    dataverseRequest: {
      action: 'customapi',
      parameters: {
        operationName: opName,
        tableName: opName,
        body: { prompt_20text: text },
      },
    },
  });
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

    // Single Text prompt for every format: the runtime-resolved op name keeps
    // working across environments, and structured formats are repaired
    // client-side below via jsonrepair. (Legacy json/dag/json-generic AI Builder
    // prompts were removed; only SalesCopilotCorePrompt remains.)
    let result: { success: boolean; data?: Record<string, unknown> | null; error?: { message?: string } };
    const opName = getTextPromptOpName();
    result = await invokeTextPromptByOpName(opName, text);
    // If a resolved (non build-time) name fails, fall back to the generated
    // service so we are never worse off than before the dynamic resolver.
    if (!result.success) {
      console.warn('[AI Tool] dynamic prompt op failed, retrying with build-time service:', opName);
      result = await TextPromptService.msdyn_aibdptcustomprompt104e526adeab4292bf186b6180dfd75c(text);
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
