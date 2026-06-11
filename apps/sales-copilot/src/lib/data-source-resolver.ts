/**
 * Data source resolution — pure function (§6).
 *
 * Decides whether a planned query step should reuse a cached working set, use
 * page data, or re-query. The decision is deterministic (rule-based), not left
 * to the LLM. Frame may still emit contextSufficient as a *hint*, but the final
 * source is decided here.
 */

import {
  computeArgumentsHash,
  isQuery,
  type ConversationState,
  type FocusPageContext,
} from './conversation-state';

export interface PlannedStep {
  fn: string;
  args: Record<string, unknown>;
  /** User explicitly asked to refresh ("重新查"/"刷新"). */
  userRequestedRefresh?: boolean;
}

export type DataSource =
  | { kind: 'reuse'; workingSetId: string }
  | { kind: 'page' }
  | { kind: 'requery' };

/**
 * Whether the current page context already covers the requested query. Only
 * matches when the page is bound to the same entity type and the step carries
 * no additional result-affecting filters.
 */
function pageCovers(step: PlannedStep, pageContext?: FocusPageContext): boolean {
  if (!pageContext?.entityType) return false;
  const entityByFn: Record<string, string> = {
    queryActivities: 'activity',
    queryOpportunities: 'opportunity',
    queryAccounts: 'account',
    queryContacts: 'contact',
  };
  if (entityByFn[step.fn] !== pageContext.entityType) return false;
  // Any explicit filter argument means the page list is not a safe substitute.
  const hasFilter = Object.entries(step.args ?? {}).some(
    ([k, v]) => k !== 'limit' && k !== 'sortBy' && v !== undefined && v !== '',
  );
  return !hasFilter;
}

export function resolveDataSource(
  step: PlannedStep,
  state: ConversationState,
  pageContext?: FocusPageContext,
  now: Date = new Date(),
): DataSource {
  if (!isQuery(step.fn)) return { kind: 'requery' };
  if (step.userRequestedRefresh) return { kind: 'requery' };

  const hash = computeArgumentsHash(step.fn, step.args ?? {}, now);
  const ws = state.workingSets.find(
    (w) => w.sourceFunction === step.fn && w.argumentsHash === hash && !w.stale,
  );
  if (ws) return { kind: 'reuse', workingSetId: ws.id };

  if (pageCovers(step, pageContext)) return { kind: 'page' };

  return { kind: 'requery' };
}
