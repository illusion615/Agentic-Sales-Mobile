/**
 * Translates a Frame + Orchestrator PipelineResult into the legacy IntentResult
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

import type { PipelineResult } from './orchestrator';
import type { DagPlan, SingleIntent } from './dag-schema';
import { isDagPlan } from './dag-schema';
import { fallbackUserFacingLabel, type UserFacingLabel, type IntentItem } from './frame';
import { temporalModeFromFrame } from './activity-draft-mode';

export interface TranslatedIntent {
  function: string;
  arguments: Record<string, unknown>;
  /** Human-friendly per-intent label for narration UI (head intent). */
  userFacingLabel?: UserFacingLabel;
  additionalActions?: Array<{
    function: string;
    arguments: Record<string, unknown>;
    reason?: string;
    /** Human-friendly per-intent label for narration UI. */
    userFacingLabel?: UserFacingLabel;
  }>;
  requiresMatching?: boolean;
  resolutions?: Array<{
    entityType: 'account' | 'contact' | 'opportunity' | 'activity';
    query: string;
    scopeBy?: 'account' | 'opportunity';
    /** Which intent (0-based head, 1+ for additionalActions) this resolution belongs to. */
    intentIndex?: number;
  }>;
  multiIntentAnalysis?: {
    hasMultipleIntents: boolean;
    summary?: string;
  };
  confidence?: number;
  /** When true, the previous query result in conversation history can satisfy this request. */
  contextSufficient?: boolean;
}

const DRAFT_FUNCTIONS = new Set([
  'draftActivity',
  'draftAccount',
  'draftContact',
  'draftOpportunity',
  'draftFeedback',
]);

/** True when a string field is a DAG `$ref.field` placeholder (resolved at execution time, not a literal name). */
function isRefPlaceholder(v: unknown): boolean {
  return typeof v === 'string' && v.startsWith('$');
}

/** Read a name field as a literal, returning '' if it's a $ref placeholder. */
function literalName(v: unknown): string {
  if (typeof v !== 'string') return '';
  if (isRefPlaceholder(v)) return '';
  return v.trim();
}

/**
 * Normalize a step's arguments by blanking any `$intent_N.field` ref placeholder
 * to ''. Cross-step entity links (e.g. an activity that relates to the
 * opportunity created in a prior step) are carried by the runtime's
 * `resolvedContext` (keyed by entity type), which `buildEffectiveArgs` folds
 * into MISSING arg keys only. A literal `$intent_N.*` string is non-empty, so
 * leaving it in place both BLOCKS that fill AND leaks the raw placeholder into
 * the form card (e.g. 关联商机 renders "$intent_1.name"). Blanking hands linking
 * back to resolvedContext — the single cross-step linking mechanism.
 */
function stripRefPlaceholders(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    out[k] = isRefPlaceholder(v) ? '' : v;
  }
  return out;
}

/** Extract resolution chain from arguments based on present name fields.
 *  Skips $ref placeholders (e.g. "$intent_1.name") — those are resolved at
 *  execution time from prior step outputs and must not leak into the UI as
 *  fuzzy-match queries. */
function deriveResolutions(
  fnName: string,
  args: Record<string, unknown>,
  intentIndex: number
): TranslatedIntent['resolutions'] {
  if (!DRAFT_FUNCTIONS.has(fnName) && !fnName.startsWith('update')) return undefined;

  const resolutions: NonNullable<TranslatedIntent['resolutions']> = [];

  // Account first (so contact/opportunity can scope by it)
  const accountName = literalName(args.accountName);
  const accountId = typeof args.accountId === 'string' && !isRefPlaceholder(args.accountId) ? args.accountId : '';
  if (accountName && !accountId) {
    resolutions.push({ entityType: 'account', query: accountName, intentIndex });
  }

  const contactName = literalName(args.contactName);
  const contactId = typeof args.contactId === 'string' && !isRefPlaceholder(args.contactId) ? args.contactId : '';
  if (contactName && !contactId) {
    resolutions.push({
      entityType: 'contact',
      query: contactName,
      intentIndex,
      ...(accountName ? { scopeBy: 'account' as const } : {}),
    });
  }

  const opportunityName = literalName(args.opportunityName);
  const opportunityId = typeof args.opportunityId === 'string' && !isRefPlaceholder(args.opportunityId) ? args.opportunityId : '';
  if (opportunityName && !opportunityId) {
    resolutions.push({
      entityType: 'opportunity',
      query: opportunityName,
      intentIndex,
      ...(accountName ? { scopeBy: 'account' as const } : {}),
    });
  }

  // Activity duplicate-detection: only when drafting an Activity with a literal title.
  if (fnName === 'draftActivity') {
    const title = literalName(args.title);
    if (title) resolutions.push({ entityType: 'activity', query: title, intentIndex });
  }

  return resolutions.length ? resolutions : undefined;
}

function stepToIntentSlot(
  fnName: string,
  args: Record<string, unknown>,
  usePageContext?: boolean
): { function: string; arguments: Record<string, unknown>; usePageContext?: boolean } {
  return { function: fnName, arguments: { ...args }, ...(usePageContext ? { usePageContext } : {}) };
}

function injectActivityTemporalMode(
  fnName: string,
  args: Record<string, unknown>,
  frameIntent: IntentItem | undefined,
): Record<string, unknown> {
  if (fnName !== 'draftActivity') return args;
  return {
    ...args,
    // Frame owns semantic tense. This intentionally overrides a conflicting
    // Orchestrator value; `none` becomes unspecified and is date-resolved later.
    temporalMode: temporalModeFromFrame(frameIntent?.temporal),
  };
}

/**
 * Translate a PipelineResult into a legacy IntentResult shape, or null when
 * the pipeline result has no actionable plan.
 */
export function frameToIntent(pipeline: PipelineResult): TranslatedIntent | null {
  const plan = pipeline.plan;
  if (!plan) return null;

  const frameIntents = pipeline.frame.intents as IntentItem[] | undefined;

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
    primaryArgs = injectActivityTemporalMode(
      primaryFn,
      stripRefPlaceholders({ ...(head.arguments as Record<string, unknown>) }),
      frameIntents?.[0],
    );
    const headUsePageContext = head.usePageContext;
    extras = sorted.slice(1)
      .filter((s) => s.function)
      .map((s, index) => ({
        function: s.function,
        arguments: injectActivityTemporalMode(
          s.function,
          stripRefPlaceholders({ ...(s.arguments as Record<string, unknown>) }),
          frameIntents?.[index + 1],
        ),
        ...(s.usePageContext ? { usePageContext: true } : {}),
      }));
  } else {
    const single = plan as SingleIntent;
    if (!single.function) return null;
    primaryFn = single.function;
    primaryArgs = injectActivityTemporalMode(
      primaryFn,
      stripRefPlaceholders({ ...(single.arguments as Record<string, unknown>) }),
      frameIntents?.[0],
    );
  }

  // Correct-architecture routing (query → think): a single read intent whose
  // job is to ANALYZE or REPORT over records is answered by a grounded
  // "think over the fetched records" step (analyzeResults), not by the model
  // free-forming from a bare query. We append a dependent analyzeResults step so
  // the plan becomes query → grounded-think. Activity-Analyze is left alone —
  // that is task BRAINSTORM (suggestPlan), which legitimately proposes NEW tasks.
  const routeFrameIntents = pipeline.frame.intents as IntentItem[] | undefined;
  const soleReadIntent = routeFrameIntents && routeFrameIntents.length === 1 ? routeFrameIntents[0] : undefined;
  if (
    soleReadIntent &&
    (soleReadIntent.cognitiveTask === 'Analyze' || soleReadIntent.cognitiveTask === 'Report') &&
    soleReadIntent.salesObject !== 'Activity' &&
    extras.length === 0 &&
    /^query/.test(primaryFn)
  ) {
    extras = [{ function: 'analyzeResults', arguments: {} }];
  }

  const headUseCtx = isDagPlan(plan) ? (plan as DagPlan).steps.sort((a, b) => a.seq - b.seq)[0]?.usePageContext : undefined;
  const slot = stepToIntentSlot(primaryFn, primaryArgs, headUseCtx);
  const headResolutions = deriveResolutions(slot.function, slot.arguments, 0) ?? [];

  // Also derive resolutions for every extra step so multi-intent plans that
  // reference a different account/contact/opportunity than head still get
  // their entities pre-matched. The dispatcher in copilot-agent.ts only
  // injects head's *resolved IDs* into extras — it does NOT trigger a fresh
  // matching pass for extras with novel names.
  const extraResolutions = extras.flatMap((s, i) => deriveResolutions(s.function, s.arguments, i + 1) ?? []);

  const mergedResolutions = mergeResolutions([...headResolutions, ...extraResolutions]);

  // Frame intent labels: map by index. DAG sort by seq aligns 1:1 with frame.intents[]
  // in the common case; we tolerate length mismatch by falling back to template.
  const labelFor = (i: number): UserFacingLabel | undefined => {
    const it = frameIntents?.[i];
    if (!it) return undefined;
    return it.userFacingLabel ?? fallbackUserFacingLabel(it);
  };
  const headLabel = labelFor(0);
  const extrasWithLabels = extras.map((e, i) => ({ ...e, userFacingLabel: labelFor(i + 1) }));

  return {
    function: slot.function,
    arguments: slot.arguments,
    ...(headLabel ? { userFacingLabel: headLabel } : {}),
    ...(extrasWithLabels.length
      ? {
          additionalActions: extrasWithLabels,
          // Required by downstream multi-intent dispatcher in copilot-agent.ts.
          // Without hasMultipleIntents=true, additionalActions are silently dropped
          // and only the primary step executes.
          multiIntentAnalysis: {
            hasMultipleIntents: true,
            summary: pipeline.frame.reasoning || `${extrasWithLabels.length + 1} intents from frame`,
          },
        }
      : {}),
    ...(mergedResolutions.length
      ? { requiresMatching: true, resolutions: mergedResolutions }
      : {}),
    confidence: pipeline.frame.confidence,
    contextSufficient: pipeline.frame.contextSufficient ?? false,
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
