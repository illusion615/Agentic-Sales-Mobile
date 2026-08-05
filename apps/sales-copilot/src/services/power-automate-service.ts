/**
 * AI Builder invocation — Sales binding.
 *
 * Invokes AI Builder custom prompts directly via a Dataverse Custom API,
 * bypassing Power Automate Flow entirely. That avoids the `shared_logicflows`
 * connection reference (which causes launch 500), Flow run quota, UTF-8
 * multibyte corruption (microsoft/PowerAppsCodeApps#359) and ~1–3s of Flow
 * middleware latency.
 *
 * Serialization, trace GUIDs, the call ledger, response unwrapping and JSON
 * repair are platform-generic and live in `@agentic/power-runtime`. This module
 * supplies the Sales-specific pieces: the enablement switch, the generated
 * service, and the standalone-operation cost row.
 */

import { getLLMConfig } from '@/lib/i18n';
import { jsonrepair } from 'jsonrepair';
import { getClient } from '@microsoft/power-apps/data';
import { createAiInvoker, type AiInvokeResult } from '@agentic/power-runtime';
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo';
import { getTextPromptOpName } from './prompt-resolver';
import { recordStandaloneAiOperation } from '@/lib/ai-cost-log';
import { SALES_APP_ID, type SalesPromptKey } from '@/prompts';
import { Msdyn_aibdptcustomprompt104e526adeab4292bf186b6180dfd75cService as TextPromptService } from '@/generated/services/Msdyn_aibdptcustomprompt104e526adeab4292bf186b6180dfd75cService';

export type FlowLLMResponse = AiInvokeResult;

export interface StandaloneAiOperation {
  /** Stable business dimension stored in biz_operationtype. */
  operationType: string;
  /** Short human-readable descriptor only — never the full prompt/response. */
  queryText: string;
}

/**
 * Whether the LLM is available for use.
 */
export function isFlowAvailable(): boolean {
  const config = getLLMConfig();
  if (config && config.enabled === false) return false;
  return true;
}

const invoke = createAiInvoker({
  projectId: 'agentic-crm',
  appId: SALES_APP_ID,
  resolveOpName: getTextPromptOpName,
  execute: (opName, text) =>
    getClient(dataSourcesInfo).executeAsync<{ prompt_20text: string }, Record<string, unknown>>({
      dataverseRequest: {
        action: 'customapi',
        parameters: { operationName: opName, tableName: opName, body: { prompt_20text: text } },
      },
    }),
  executeFallback: (text) =>
    TextPromptService.msdyn_aibdptcustomprompt104e526adeab4292bf186b6180dfd75c(text),
  isEnabled: isFlowAvailable,
  repairJson: jsonrepair,
  disabledMessage: 'AI assistant is not enabled',
});

/**
 * Invoke AI Builder custom prompt directly via Dataverse Custom API.
 */
export async function invokeFlowForLLM(
  request: {
    messages: Array<{ role: string; content: string }>;
    responseFormat?: 'text' | 'json' | 'dag' | 'json-generic';
  },
  meta?: {
    label?: string;
    standaloneOperation?: StandaloneAiOperation;
    /** Declares which catalogued prompt drove this call for platform-log attribution. */
    prompt?: { key: SalesPromptKey };
  },
): Promise<FlowLLMResponse> {
  const standalone = meta?.standaloneOperation;
  return invoke(request, {
    label: meta?.label,
    // Named in the trace marker so the platform's AI Event log is self-describing.
    promptKey: meta?.prompt?.key,
    detached: !!standalone,
    onStandalone: (traceId) => {
      if (standalone) recordStandaloneAiOperation({ ...standalone, traceId });
    },
  });
}

/**
 * Quick connectivity test
 */
export async function testFlowConnection(): Promise<{
  success: boolean;
  error?: string;
  latencyMs?: number;
}> {
  const result = await invokeFlowForLLM({ messages: [{ role: 'user', content: 'Hello' }] });
  return { success: result.success, error: result.error, latencyMs: result.latencyMs };
}
