/**
 * Turn → business-operation expansion for AI cost analytics.
 * --------------------------------------------------------------------------
 * Spend is analysed along BUSINESS dimensions (time × user × operation type),
 * not technical call sites. This module owns the deterministic mechanism that
 * turns an already-parsed intent plan into the ordered list of business
 * operations it represents.
 *
 * The mechanism is shared; the vocabulary is not. WHICH function name means
 * which business operation is domain knowledge, so the classifier is injected
 * by the app. This module never re-interprets free text.
 */

/**
 * Minimal structural shape of a parsed intent plan: a head function plus any
 * additional actions. Kept structural so it couples to no app's plan type.
 */
export interface IntentPlanLike {
  function?: string | null;
  arguments?: Record<string, unknown>;
  additionalActions?: Array<{ function?: string | null; arguments?: Record<string, unknown> }>;
}

/** One business operation extracted from a turn's intent plan. */
export interface TurnOperation {
  /**
   * Stable business operation type used for grouping/distribution, e.g.
   * "create.activity.visit", "update.opportunity", "query.account".
   */
  operationType: string;
  /** 0-based position among the turn's business operations (0 = head intent). */
  operationIndex: number;
}

/** Maps a resolved plan function (+ its arguments) to a business operation type. */
export type OperationClassifier = (fnName: string, args: Record<string, unknown>) => string;

/** Operation type used for a turn that carries no actionable plan. */
export const CONVERSATION_OPERATION_TYPE = 'conversation.general';

export interface DeriveTurnOperationsOptions {
  /**
   * Plan steps that are internal continuations rather than user-facing business
   * operations (e.g. a "reason over the fetched records" step appended to a
   * read intent). They are folded into their parent operation, so a single read
   * turn stays ONE operation instead of halving its per-operation cost sample.
   */
  internalStepFunctions?: Iterable<string>;
}

/**
 * Expand a turn's intent plan into an ordered list of BUSINESS operations.
 *  - Head intent → index 0; each additionalAction → the next index.
 *  - Internal continuation steps are dropped.
 *  - A turn with no actionable plan → one conversational operation, so every
 *    billable turn maps to at least one row.
 */
export function deriveTurnOperations(
  rawIntent: IntentPlanLike | null | undefined,
  classify: OperationClassifier,
  options?: DeriveTurnOperationsOptions,
): TurnOperation[] {
  const fallback: TurnOperation[] = [{ operationType: CONVERSATION_OPERATION_TYPE, operationIndex: 0 }];
  if (!rawIntent || !rawIntent.function) return fallback;

  const internal = new Set(options?.internalStepFunctions ?? []);
  const steps: Array<{ fn: string; args: Record<string, unknown> }> = [];

  if (!internal.has(rawIntent.function)) {
    steps.push({ fn: rawIntent.function, args: rawIntent.arguments ?? {} });
  }
  for (const a of rawIntent.additionalActions ?? []) {
    if (!a.function || internal.has(a.function)) continue;
    steps.push({ fn: a.function, args: a.arguments ?? {} });
  }
  if (steps.length === 0) return fallback;

  return steps.map((s, i) => ({
    operationType: classify(s.fn, s.args),
    operationIndex: i,
  }));
}
