/**
 * Field Service binding for the shared AI Builder invoker.
 *
 * The invocation, trace GUID, call ledger, response unwrapping and JSON repair
 * are the platform-generic ones in `@agentic/power-runtime` — the same code
 * path Sales uses, so both apps share one choke point and one log. Only the
 * model name, registry and storage scope are supplied here.
 *
 * There is no build-time generated service for the prompt because the CLI
 * cannot generate a Custom API; the resolver registers the entry into the SDK
 * registry at construction instead, before the first Dataverse operation.
 */
import { jsonrepair } from 'jsonrepair';
import { getClient } from '@microsoft/power-apps/data';
import {
  createAiInvoker,
  createPromptResolver,
  type AiInvokeRequest,
  type AiInvokeResult,
} from '@agentic/power-runtime';
import { dataSourcesInfo } from '../../../.power/schemas/appschemas/dataSourcesInfo';
import { recordStandaloneAiOperation } from './cost-log';

/** Stable display name of the shared AI Builder model in `msdyn_aimodels`. */
const MODEL_NAME = 'SalesCopilotCorePrompt';

/** Build-time GUID, used until runtime resolution succeeds. */
const FALLBACK_GUID = '104e526a-deab-4292-bf18-6b6180dfd75c';
const FIELD_SERVICE_APP_ID = 'field-service';

const resolver = createPromptResolver({
  dataSourcesInfo: dataSourcesInfo as unknown as Record<string, unknown>,
  modelName: MODEL_NAME,
  fallbackGuid: FALLBACK_GUID,
  // Scoped to this app so the sibling Code App's cache can never be read.
  storageKey: 'fieldservice.textPrompt',
  async lookupModelGuid(modelName) {
    const client = getClient(dataSourcesInfo);
    const res = await client.retrieveMultipleRecordsAsync<{ msdyn_aimodelid: string }>(
      'msdyn_aimodels',
      { filter: `msdyn_name eq '${modelName}'`, select: ['msdyn_aimodelid'], top: 1 },
    );
    if (!res.success) return null;
    return res.data?.[0]?.msdyn_aimodelid ?? null;
  },
});

const invoke = createAiInvoker({
  projectId: 'agentic-crm',
  appId: FIELD_SERVICE_APP_ID,
  resolveOpName: resolver.getOpName,
  execute: (opName, text) =>
    getClient(dataSourcesInfo).executeAsync<{ prompt_20text: string }, Record<string, unknown>>({
      dataverseRequest: {
        action: 'customapi',
        parameters: { operationName: opName, tableName: opName, body: { prompt_20text: text } },
      },
    }),
  repairJson: jsonrepair,
});

export interface FieldAiOperation {
  /** Stable business dimension stored in `biz_operationtype`. */
  operationType: 'field.previsit_briefing' | 'field.form_extraction' | 'field.visit_summary';
  /** Short descriptor only; never the prompt, note contents, or model response. */
  queryText: string;
}

/** Every Field AI call is a standalone billable business operation. */
export function invokeAi(
  request: AiInvokeRequest,
  meta: { label: string; operation: FieldAiOperation },
): Promise<AiInvokeResult> {
  return invoke(request, {
    label: meta.label,
    detached: true,
    onStandalone: (traceId) => recordStandaloneAiOperation({ ...meta.operation, traceId }),
  });
}

/** Resolve the environment's model GUID. Safe to call once at startup. */
export function refreshPromptResolution(): Promise<void> {
  return resolver.refresh();
}

export function promptResolutionStatus() {
  return resolver.getStatus();
}
