/**
 * The prompt registry — one lookup table for every instruction the app sends
 * to a model.
 *
 * Call sites ask for a KEY and pass VARIABLES; they never hold prompt text.
 * That indirection is the whole point: the body backing a key can later come
 * from outside the build (a Dataverse row, a config file) with no call site
 * touched, and can fall back to the shipped body whenever the external source
 * is unavailable, stale, or rejected.
 *
 * An external body is accepted only if it keeps the contract: same output
 * format, same output-schema version, and no placeholder the caller does not
 * supply. Anything else is refused and reported — the app keeps working on the
 * builtin body instead of failing in production.
 */
import { extractPlaceholders, renderPromptTemplate } from './template';
import type {
  PromptDefinition,
  PromptOverride,
  PromptOverrideReport,
  PromptVariables,
  ResolvedPrompt,
} from './types';

export interface PromptRegistry<K extends string = string> {
  /** The app this catalog belongs to. Prompt keys are unique per app, not globally. */
  readonly appId: string;
  has(key: string): boolean;
  get(key: K): ResolvedPrompt;
  /** Body with placeholders substituted, ready to send. */
  render(key: K, variables?: PromptVariables): string;
  list(): ResolvedPrompt[];
  /** Replaces builtin bodies with externally authored ones that keep the contract. */
  applyOverrides(rows: PromptOverride[]): PromptOverrideReport;
  clearOverrides(): void;
}

export interface PromptRegistryOptions {
  /**
   * Identifies the owning app, e.g. 'sales-copilot'. Every app has its own
   * catalog and its own rows in the shared store, so this is what keeps two
   * apps that both define `frame.classify` from overwriting each other.
   */
  appId: string;
}

export function createPromptRegistry<K extends string = string>(
  definitions: readonly PromptDefinition[],
  options: PromptRegistryOptions,
): PromptRegistry<K> {
  const builtins = new Map<string, ResolvedPrompt>();
  for (const definition of definitions) {
    if (builtins.has(definition.key)) {
      throw new Error(`Duplicate prompt key "${definition.key}"`);
    }
    builtins.set(definition.key, {
      ...definition,
      variables: extractPlaceholders(definition.body),
      source: 'builtin',
    });
  }

  const overrides = new Map<string, ResolvedPrompt>();

  function get(key: string): ResolvedPrompt {
    const resolved = overrides.get(key) ?? builtins.get(key);
    if (!resolved) throw new Error(`Unknown prompt key "${key}"`);
    return resolved;
  }

  function rejectReason(row: PromptOverride, builtin: ResolvedPrompt): string | null {
    if (row.app && row.app !== options.appId) {
      return `belongs to app "${row.app}", not "${options.appId}"`;
    }
    if (!row.body || !row.body.trim()) return 'body is empty';
    if (row.contractVersion !== builtin.contractVersion) {
      return `contract version ${row.contractVersion} does not match the ${builtin.contractVersion} this build parses`;
    }
    if (row.responseFormat && row.responseFormat !== builtin.responseFormat) {
      return `response format "${row.responseFormat}" does not match the declared "${builtin.responseFormat}"`;
    }
    const unknown = extractPlaceholders(row.body).filter((name) => !builtin.variables.includes(name));
    if (unknown.length > 0) {
      return `uses variables the app does not supply: ${unknown.join(', ')}`;
    }
    return null;
  }

  return {
    appId: options.appId,
    has: (key) => overrides.has(key) || builtins.has(key),
    get: (key) => get(key),
    render: (key, variables) => {
      const prompt = get(key);
      return renderPromptTemplate(prompt.body, variables, key);
    },
    list: () => [...builtins.keys()].map((key) => get(key)),
    applyOverrides(rows) {
      const report: PromptOverrideReport = { applied: [], rejected: [] };
      for (const row of rows) {
        const builtin = builtins.get(row.key);
        if (!builtin) {
          report.rejected.push({ key: row.key, reason: 'unknown prompt key' });
          continue;
        }
        const reason = rejectReason(row, builtin);
        if (reason) {
          report.rejected.push({ key: row.key, reason });
          continue;
        }
        overrides.set(row.key, {
          ...builtin,
          body: row.body,
          modelTier: row.modelTier ?? builtin.modelTier,
          source: 'external',
          version: row.version,
        });
        report.applied.push(row.key);
      }
      return report;
    },
    clearOverrides: () => overrides.clear(),
  };
}
