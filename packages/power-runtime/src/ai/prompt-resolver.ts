/**
 * Resolves which AI Builder Custom API to call, at runtime.
 *
 * An AI Builder prompt is invoked through a generated Dataverse Custom API
 * whose name embeds the model GUID. That GUID is baked in at build time and
 * changes when the solution is imported into another environment, so the
 * hard-coded name stops existing there. Resolving the model by its stable
 * display name survives the import.
 *
 * SDK constraint (why the reload-once dance exists): the Power Apps SDK freezes
 * its Custom-API registry on the first Dataverse operation of the session, so
 * an entry added after that is invisible. The cached name is therefore
 * registered synchronously at construction — before any data op — and a newly
 * discovered GUID is persisted and applied by one reload.
 *
 * The lookup itself is injected, so this package never imports the Power Apps
 * SDK and stays testable without a host.
 */

export type PromptResolutionState = 'checking' | 'resolved' | 'cached' | 'fallback';

export interface PromptResolutionStatus {
  state: PromptResolutionState;
  modelName: string;
  /** The operation name currently in effect. */
  opName: string;
  usingFallback: boolean;
}

export interface PromptResolverConfig {
  /** The app's generated SDK registry. Mutated in place to register the resolved API. */
  dataSourcesInfo: Record<string, unknown>;
  /** Stable display name of the model in `msdyn_aimodels`. */
  modelName: string;
  /** Build-time GUID, used until runtime resolution succeeds. */
  fallbackGuid: string;
  /** Storage key prefix. Sibling code apps must not share one. */
  storageKey: string;
  /** Body parameter name of the prompt's text input. */
  inputParameter?: string;
  /** Looks the model GUID up by display name; null when it cannot be resolved. */
  lookupModelGuid: (modelName: string) => Promise<string | null>;
  /** Fired when the status changes, so a settings screen can show it. */
  onStatusChange?: (status: PromptResolutionStatus) => void;
}

export interface PromptResolver {
  /** Synchronous and cheap: the resolved, cached, or build-time name. */
  getOpName(): string;
  getStatus(): PromptResolutionStatus;
  /** Resolve in the background; reloads once if the environment's GUID differs. */
  refresh(): Promise<void>;
}

/** Derives the Custom API unique name from an AI model GUID. */
export function promptOpName(guid: string): string {
  return 'msdyn_aibdptcustomprompt' + guid.replace(/-/g, '').toLowerCase();
}

function readStore(storage: 'local' | 'session', key: string): string | null {
  try {
    const store = storage === 'local' ? localStorage : sessionStorage;
    return store.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(storage: 'local' | 'session', key: string, value: string): void {
  try {
    const store = storage === 'local' ? localStorage : sessionStorage;
    store.setItem(key, value);
  } catch {
    /* storage may be unavailable in some embeddings — resolution is best-effort */
  }
}

export function createPromptResolver(config: PromptResolverConfig): PromptResolver {
  const inputParameter = config.inputParameter ?? 'prompt_20text';
  const fallbackOpName = promptOpName(config.fallbackGuid);
  const cacheKey = `${config.storageKey}.opName`;
  const reloadGuardKey = `${config.storageKey}.reloaded`;

  let resolvedOpName: string | null = null;
  let state: PromptResolutionState = 'checking';

  function getOpName(): string {
    return resolvedOpName ?? fallbackOpName;
  }

  function getStatus(): PromptResolutionStatus {
    const opName = getOpName();
    return { state, modelName: config.modelName, opName, usingFallback: opName === fallbackOpName };
  }

  function setState(next: PromptResolutionState): void {
    state = next;
    config.onStatusChange?.(getStatus());
  }

  /** Adds the Custom-API entry to the SDK registry when absent. In place, by design. */
  function register(opName: string): void {
    if (config.dataSourcesInfo[opName]) return;
    config.dataSourcesInfo[opName] = {
      tableId: '',
      version: '',
      primaryKey: '',
      dataSourceType: 'Dataverse',
      apis: {
        [opName]: {
          path: `/api/data/v9.2/${opName}`,
          method: 'POST',
          parameters: [{ name: inputParameter, in: 'body', required: true, type: 'string' }],
          responseInfo: { '200': { type: 'object' } },
        },
      },
    };
  }

  const cached = readStore('local', cacheKey);
  if (cached) {
    // A cache entry means a prior resolution succeeded in this environment.
    resolvedOpName = cached;
    register(cached);
    state = 'cached';
  }
  register(fallbackOpName);

  async function refresh(): Promise<void> {
    try {
      const guid = await config.lookupModelGuid(config.modelName);
      if (!guid) {
        if (!resolvedOpName) setState('fallback');
        return;
      }

      const opName = promptOpName(guid);
      if (config.dataSourcesInfo[opName]) {
        resolvedOpName = opName;
        if (readStore('local', cacheKey) !== opName) writeStore('local', cacheKey, opName);
        setState('resolved');
        return;
      }

      // Resolved a GUID the frozen registry does not carry. Persist it and let
      // one reload register it before the next freeze.
      writeStore('local', cacheKey, opName);
      if (readStore('session', reloadGuardKey) === '1') return;
      writeStore('session', reloadGuardKey, '1');
      if (typeof location !== 'undefined') location.reload();
    } catch {
      if (!resolvedOpName) setState('fallback');
    }
  }

  return { getOpName, getStatus, refresh };
}
