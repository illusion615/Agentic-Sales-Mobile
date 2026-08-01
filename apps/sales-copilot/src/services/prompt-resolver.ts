/**
 * AI prompt operation-name resolver — Sales binding.
 *
 * The mechanism is platform-generic and lives in `@agentic/power-runtime`; this
 * module supplies the app's model name, registry and storage scope, and keeps
 * the import path stable.
 */
import {
  createPromptResolver,
  type PromptResolutionState,
  type PromptResolutionStatus,
} from '@agentic/power-runtime';
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo';

/** Stable display name of our AI model. Renamed in the maker portal to be unique. */
const MODEL_NAME = 'SalesCopilotCorePrompt';

/** Build-time GUID, used as a safe fallback if runtime resolution is unavailable. */
const FALLBACK_GUID = '104e526a-deab-4292-bf18-6b6180dfd75c';

export type { PromptResolutionState, PromptResolutionStatus };

/** Event name dispatched on window when the status changes. */
export const PROMPT_RESOLUTION_EVENT = 'salescopilot-prompt-resolution-changed';

const resolver = createPromptResolver({
  dataSourcesInfo: dataSourcesInfo as unknown as Record<string, unknown>,
  modelName: MODEL_NAME,
  fallbackGuid: FALLBACK_GUID,
  storageKey: 'salescopilot.textPrompt',
  async lookupModelGuid(modelName) {
    const { getClient } = await import('@microsoft/power-apps/data');
    const client = getClient(dataSourcesInfo);
    const res = await client.retrieveMultipleRecordsAsync<{ msdyn_aimodelid: string }>(
      'msdyn_aimodels',
      { filter: `msdyn_name eq '${modelName}'`, select: ['msdyn_aimodelid'], top: 1 },
    );
    if (!res.success) return null;
    return res.data?.[0]?.msdyn_aimodelid ?? null;
  },
  onStatusChange() {
    try {
      window.dispatchEvent(new Event(PROMPT_RESOLUTION_EVENT));
    } catch {
      /* ignore (non-DOM env) */
    }
  },
});

/** Returns the current resolution status snapshot for the UI. */
export function getPromptResolutionStatus(): PromptResolutionStatus {
  return resolver.getStatus();
}

/** The operation name to use for the text prompt right now. */
export function getTextPromptOpName(): string {
  return resolver.getOpName();
}

/** Safe to call once at app startup. */
export function refreshPromptResolution(): Promise<void> {
  return resolver.refresh();
}
