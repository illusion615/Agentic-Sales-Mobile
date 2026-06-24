/**
 * AI Prompt operation-name resolver.
 *
 * Problem this solves:
 *   AI Builder custom prompts are invoked through an auto-generated Dataverse
 *   Custom API whose unique name is `msdyn_aibdptcustomprompt<aimodelGuid>`.
 *   That GUID is baked into the generated service at build time. When the
 *   solution is imported into another environment and the AI model receives a
 *   different GUID, the hard-coded operation name no longer exists there and the
 *   call fails ("AI service temporarily unavailable").
 *
 * Fix:
 *   Resolve the operation name at runtime by looking up the AI model by its
 *   stable display name (`SalesCopilotCorePrompt`) in the `msdyn_aimodels`
 *   table, then deriving the Custom API name from the resolved GUID. The name
 *   survives solution import unchanged, so the correct GUID is always found.
 *
 * SDK constraint (why the reload-once dance exists):
 *   The Power Apps SDK freezes its Custom-API registry on the first Dataverse
 *   operation of the session. A Custom-API entry that is added *after* that
 *   freeze is invisible to `executeAsync`. We therefore register the resolved
 *   entry synchronously from a localStorage cache at module load (before the
 *   first data op). On the very first launch in a new environment the cache is
 *   empty, so we resolve in the background and — only if the GUID actually
 *   differs from what is already registered — persist it and reload once so the
 *   next boot registers the correct entry before the freeze. In environments
 *   where the GUID is unchanged (e.g. the dev environment) nothing reloads.
 */

import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo';

/** Stable display name of our AI model. Renamed in the maker portal to be unique. */
const MODEL_NAME = 'SalesCopilotCorePrompt';

/** Build-time GUID, used as a safe fallback if runtime resolution is unavailable. */
const FALLBACK_GUID = '104e526a-deab-4292-bf18-6b6180dfd75c';

/** The body parameter name of the custom prompt's text input. */
const PROMPT_INPUT_PARAM = 'prompt_20text';

const LS_KEY = 'salescopilot.textPromptOpName';
const RELOAD_GUARD_KEY = 'salescopilot.promptResolverReloaded';

/** Derives the Custom API unique name from an AI model GUID. */
function buildOpName(guid: string): string {
  return 'msdyn_aibdptcustomprompt' + guid.replace(/-/g, '').toLowerCase();
}

const FALLBACK_OP_NAME = buildOpName(FALLBACK_GUID);

/** In-memory resolved operation name (set once resolution succeeds). */
let resolvedOpName: string | null = null;

/** Status of prompt resolution, for surfacing in Settings. */
export type PromptResolutionState = 'checking' | 'resolved' | 'cached' | 'fallback';

export interface PromptResolutionStatus {
  /** Overall state of the resolution. */
  state: PromptResolutionState;
  /** The AI model display name being resolved. */
  modelName: string;
  /** The operation name currently in effect. */
  opName: string;
  /** Whether the effective op name is the build-time fallback. */
  usingFallback: boolean;
}

/** Event name dispatched on window when the status changes. */
export const PROMPT_RESOLUTION_EVENT = 'salescopilot-prompt-resolution-changed';

let currentState: PromptResolutionState = 'checking';

function setState(next: PromptResolutionState): void {
  currentState = next;
  try {
    window.dispatchEvent(new Event(PROMPT_RESOLUTION_EVENT));
  } catch {
    /* ignore (non-DOM env) */
  }
}

/** Returns the current resolution status snapshot for the UI. */
export function getPromptResolutionStatus(): PromptResolutionStatus {
  const opName = getTextPromptOpName();
  return {
    state: currentState,
    modelName: MODEL_NAME,
    opName,
    usingFallback: opName === FALLBACK_OP_NAME,
  };
}

/**
 * Adds a Custom-API entry for `opName` to the SDK data-sources registry when it
 * is not already present. Mutates the shared `dataSourcesInfo` object in place.
 * Must run before the first Dataverse operation to take effect this session.
 */
function registerCustomApi(opName: string): void {
  const info = dataSourcesInfo as unknown as Record<string, unknown>;
  if (info[opName]) return;
  info[opName] = {
    tableId: '',
    version: '',
    primaryKey: '',
    dataSourceType: 'Dataverse',
    apis: {
      [opName]: {
        path: `/api/data/v9.2/${opName}`,
        method: 'POST',
        parameters: [
          { name: PROMPT_INPUT_PARAM, in: 'body', required: true, type: 'string' },
        ],
        responseInfo: { '200': { type: 'object' } },
      },
    },
  };
}

/**
 * Synchronous module-load step: register the cached operation name (if any)
 * before the first Dataverse op so it survives the SDK registry freeze.
 */
function preregisterFromCache(): void {
  let cached: string | null = null;
  try {
    cached = localStorage.getItem(LS_KEY);
  } catch {
    cached = null;
  }
  if (cached) {
    // A cache entry means a prior background resolution succeeded for this
    // environment, so the wiring is trustworthy until the refresh re-confirms.
    resolvedOpName = cached;
    registerCustomApi(cached);
    currentState = 'cached';
  } else {
    currentState = 'checking';
  }
  // The build-time fallback entry already exists in dataSourcesInfo.ts, but
  // register it defensively in case generation ever drops it.
  registerCustomApi(FALLBACK_OP_NAME);
}

preregisterFromCache();

/**
 * Returns the operation name to use for the text prompt right now. Synchronous
 * and cheap: returns the cached/resolved name, or the build-time fallback.
 */
export function getTextPromptOpName(): string {
  return resolvedOpName ?? FALLBACK_OP_NAME;
}

/**
 * Resolves the AI model GUID by name in the background and, if it differs from
 * what is currently registered, persists it and reloads once so the next boot
 * registers the correct Custom-API entry before the SDK freeze.
 *
 * Safe to call once at app startup. No-op effect in environments where the GUID
 * matches the build-time/cached value.
 */
export async function refreshPromptResolution(): Promise<void> {
  try {
    const { getClient } = await import('@microsoft/power-apps/data');
    const client = getClient(dataSourcesInfo);
    const res = await client.retrieveMultipleRecordsAsync<{ msdyn_aimodelid: string }>(
      'msdyn_aimodels',
      { filter: `msdyn_name eq '${MODEL_NAME}'`, select: ['msdyn_aimodelid'], top: 1 },
    );

    const guid = res?.data?.[0]?.msdyn_aimodelid;
    if (!res.success || !guid) {
      // Could not resolve (e.g. no read privilege). Keep a prior cached result
      // if we have one; otherwise fall back to the unverified build-time guess.
      console.warn('[PromptResolver] could not resolve model by name; using fallback');
      if (!resolvedOpName) setState('fallback');
      return;
    }

    const opName = buildOpName(guid);
    const currentlyRegistered = (dataSourcesInfo as unknown as Record<string, unknown>)[opName];

    if (currentlyRegistered) {
      // Resolution confirmed this session and the op name is already usable
      // (this includes the case where the environment GUID matches build time).
      resolvedOpName = opName;
      try {
        if (localStorage.getItem(LS_KEY) !== opName) localStorage.setItem(LS_KEY, opName);
      } catch { /* ignore */ }
      setState('resolved');
      return;
    }

    // Resolved a GUID that is NOT yet registered in the frozen SDK registry.
    // Persist it and reload once so the next boot registers it before the freeze.
    try {
      localStorage.setItem(LS_KEY, opName);
    } catch { /* ignore */ }

    let alreadyReloaded = false;
    try {
      alreadyReloaded = sessionStorage.getItem(RELOAD_GUARD_KEY) === '1';
    } catch { /* ignore */ }

    if (!alreadyReloaded) {
      try {
        sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
      } catch { /* ignore */ }
      console.warn('[PromptResolver] prompt GUID changed for this environment; reloading once to apply');
      location.reload();
    }
  } catch (err) {
    console.warn('[PromptResolver] resolution error; using fallback:', err);
    if (!resolvedOpName) setState('fallback');
  }
}
