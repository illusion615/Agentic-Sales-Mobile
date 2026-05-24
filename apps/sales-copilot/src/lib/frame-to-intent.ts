/**
 * Translates a Frame + Orchestrator ShadowResult into the legacy IntentResult
 * shape so the existing executor / matching / resolution machinery can run
 * unchanged.
 *
 * Mapping:
 *   - DAG step 1            → intent.function + intent.arguments
 *   - DAG steps 2..N        → intent.additionalActions[]
 *   - Single-intent shape   → step 1 only, no additionalActions
 *   - Entity-name fields on ANY step (accountName / contactName /
 *     opportunityName / activityTitle) become intent.resolutions[] so the
 *     legacy resolver chain fires before execution. Extras' resolutions are
 *     merged into the top-level list (deduped) — without this, additionalActions
 *     that reference a different account/contact than head would skip matching
 *     and silently fail or attach to the wrong record.
 *
 * Returns null when the shadow result has no actionable plan.
 */

import type { ShadowResult } from './shadow-agent';
import type { DagPlan, SingleIntent } from './dag-schema';
import { isDagPlan } from './dag-schema';

export interface TranslatedIntent {
  function: string;
  arguments: Record<string, unknown>;
  additionalActions?: Array<{
    function: string;
    arguments: Record<string, unknown>;
    reason?: string;
  }>;
  requiresMatching?: boolean;
  resolutions?: Array<{
    entityType: 'account' | 'contact' | 'opportunity' | 'activity';
    query: string;
    scopeBy?: 'account' | 'opportunity';
  }>;
  multiIntentAnalysis?: {
    hasMultipleIntents: boolean;
    summary?: string;
  };
  confidence?: number;
}

const DRAFT_FUNCTIONS = new Set([
  'draftActivity',
  'draftAccount',
  'draftContact',
  'draftOpportunity',
]);

/** Extract resolution chain from arguments based on present name fields. */
function deriveResolutions(
  fnName: string,
  args: Record<string, unknown>
): TranslatedIntent['resolutions'] {
  if (!DRAFT_FUNCTIONS.has(fnName) && !fnName.startsWith('update')) return undefined;

  const resolutions: NonNullable<TranslatedIntent['resolutions']> = [];

  // Account first (so contact/opportunity can scope by it)
  const accountName = typeof args.accountName === 'string' ? args.accountName.trim() : '';
  const accountId = typeof args.accountId === 'string' ? args.accountId : '';
  if (accountName && !accountId) {
    resolutions.push({ entityType: 'account', query: accountName });
  }

  const contactName = typeof args.contactName === 'string' ? args.contactName.trim() : '';
  const contactId = typeof args.contactId === 'string' ? args.contactId : '';
  if (contactName && !contactId) {
    resolutions.push({
      entityType: 'contact',
      query: contactName,
      ...(accountName ? { scopeBy: 'account' as const } : {}),
    });
  }

  const opportunityName =
    typeof args.opportunityName === 'string' ? args.opportunityName.trim() : '';
  const opportunityId = typeof args.opportunityId === 'string' ? args.opportunityId : '';
  if (opportunityName && !opportunityId) {
    resolutions.push({
      entityType: 'opportunity',
      query: opportunityName,
      ...(accountName ? { scopeBy: 'account' as const } : {}),
    });
  }

  // Activity duplicate-detection: only when drafting an Activity with a title.
  if (fnName === 'draftActivity') {
    const title = typeof args.title === 'string' ? args.title.trim() : '';
    if (title) resolutions.push({ entityType: 'activity', query: title });
  }

  return resolutions.length ? resolutions : undefined;
}

function stepToIntentSlot(
  fnName: string,
  args: Record<string, unknown>
): { function: string; arguments: Record<string, unknown> } {
  return { function: fnName, arguments: { ...args } };
}

/**
 * Translate a ShadowResult into a legacy IntentResult shape, or null when
 * the shadow plan is empty / non-actionable.
 */
export function frameToIntent(shadow: ShadowResult): TranslatedIntent | null {
  const plan = shadow.plan;
  if (!plan) return null;

  let primaryFn: string;
  let primaryArgs: Record<string, unknown>;
  let extras: Array<{ function: string; arguments: Record<string, unknown>; reason?: string }> = [];

  if (isDagPlan(plan)) {
    const dag = plan as DagPlan;
    if (!dag.steps.length) return null;
    const sorted = [...dag.steps].sort((a, b) => a.seq - b.seq);
    const head = sorted[0];
    if (!head.function) return null;
    primaryFn = head.function;
    primaryArgs = { ...(head.arguments as Record<string, unknown>) };
    extras = sorted.slice(1)
      .filter((s) => s.function)
      .map((s) => ({
        function: s.function,
        arguments: { ...(s.arguments as Record<string, unknown>) },
      }));
  } else {
    const single = plan as SingleIntent;
    if (!single.function) return null;
    primaryFn = single.function;
    primaryArgs = { ...(single.arguments as Record<string, unknown>) };
  }

  const slot = stepToIntentSlot(primaryFn, primaryArgs);
  const headResolutions = deriveResolutions(slot.function, slot.arguments) ?? [];

  // Also derive resolutions for every extra step so multi-intent plans that
  // reference a different account/contact/opportunity than head still get
  // their entities pre-matched. The dispatcher in copilot-agent.ts only
  // injects head's *resolved IDs* into extras — it does NOT trigger a fresh
  // matching pass for extras with novel names.
  const extraResolutions = extras.flatMap((s) => deriveResolutions(s.function, s.arguments) ?? []);

  const mergedResolutions = mergeResolutions([...headResolutions, ...extraResolutions]);

  return {
    function: slot.function,
    arguments: slot.arguments,
    ...(extras.length
      ? {
          additionalActions: extras,
          // Required by downstream multi-intent dispatcher in copilot-agent.ts.
          // Without hasMultipleIntents=true, additionalActions are silently dropped
          // and only the primary step executes.
          multiIntentAnalysis: {
            hasMultipleIntents: true,
            summary: shadow.frame.reasoning || `${extras.length + 1} intents from frame`,
          },
        }
      : {}),
    ...(mergedResolutions.length
      ? { requiresMatching: true, resolutions: mergedResolutions }
      : {}),
    confidence: shadow.frame.confidence,
  };
}

/** Dedupe resolutions by (entityType, normalized query, scopeBy). First occurrence wins. */
function mergeResolutions(
  items: NonNullable<TranslatedIntent['resolutions']>
): NonNullable<TranslatedIntent['resolutions']> {
  const seen = new Set<string>();
  const out: NonNullable<TranslatedIntent['resolutions']> = [];
  for (const r of items) {
    const key = `${r.entityType}|${r.query.trim().toLowerCase()}|${r.scopeBy ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}
