/**
 * Turn → business-operation mapping for AI cost analytics.
 * --------------------------------------------------------------------------
 * The cost model analyses spend along BUSINESS dimensions (time × user ×
 * operation type), not technical call sites. This module is the single,
 * deterministic source that turns a parsed turn intent (the Frame/Orchestrator
 * plan, `TranslatedIntent`) into the ordered list of business operations it
 * represents, and maps each operation's function to a stable `operationType`
 * label used for grouping and distribution stats.
 *
 * A single user turn can express multiple intents (multi-intent), producing
 * several operations that share one turn's AI cost — hence the per-operation
 * grain. Classification is done here from the ALREADY-parsed plan; it never
 * re-interprets free text (that is the Frame's job).
 */

/**
 * Minimal structural shape shared by the two intent representations a turn can
 * carry: `TranslatedIntent` (frame-to-intent) and `IntentResult`
 * (copilot-agent-types, whose `function` may be null). Kept local so this module
 * couples to neither.
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
   * "create.activity.visit", "update.opportunity", "query.account",
   * "knowledge.product", "conversation.general".
   */
  operationType: string;
  /** 0-based position among the turn's business operations (0 = head intent). */
  operationIndex: number;
}

/**
 * Plan steps that are internal continuations, NOT user-facing business
 * operations. `analyzeResults` is a grounded "think over the fetched records"
 * step the router appends to a read intent — it belongs to its parent query
 * operation, so it must not become a separate operation row (which would halve
 * the parent's per-operation cost sample).
 */
const INTERNAL_STEP_FUNCTIONS = new Set<string>(['analyzeResults']);

/**
 * Map a resolved function name (+ its arguments) to a stable business
 * operation type. Unknown functions fall back to `other.<fn>`; an empty
 * function name means a plain conversational turn.
 */
export function operationTypeFor(fnName: string, args: Record<string, unknown> = {}): string {
  switch (fnName) {
    // Create (drafts)
    case 'draftActivity': {
      const t = typeof args.type === 'string' ? args.type.trim().toLowerCase() : '';
      return t ? `create.activity.${t}` : 'create.activity';
    }
    case 'draftOpportunity': return 'create.opportunity';
    case 'draftAccount': return 'create.account';
    case 'draftContact': return 'create.contact';

    // Update
    case 'updateActivity': return 'update.activity';
    case 'updateOpportunity': return 'update.opportunity';
    case 'updateAccount': return 'update.account';
    case 'updateContact': return 'update.contact';
    case 'proposeChanges': return 'update.propose';

    // Query / report
    case 'queryAccounts': return 'query.account';
    case 'queryOpportunities': return 'query.opportunity';
    case 'queryActivities': return 'query.activity';
    case 'queryContacts': return 'query.contact';

    // Fuzzy match (usually a sub-step of create/update, occasionally a head intent)
    case 'fuzzyMatchAccount': return 'match.account';
    case 'fuzzyMatchContact': return 'match.contact';
    case 'fuzzyMatchOpportunity': return 'match.opportunity';
    case 'fuzzyMatchActivity': return 'match.activity';

    // Knowledge
    case 'queryCopilotStudio': return 'knowledge.product';
    case 'externalKnowledgeQuery': return 'knowledge.external';

    // Planning & AI skills
    case 'suggestPlan': return 'plan.suggest';
    case 'generateInsight': return 'insight.generate';
    case 'generateBriefTranscript': return 'brief.transcript';
    case 'summarizeEntities': return 'summarize.entities';

    default:
      return fnName ? `other.${fnName}` : 'conversation.general';
  }
}

/**
 * Expand a turn's intent plan into an ordered list of BUSINESS operations.
 *  - Head intent → index 0; each additionalAction → the next index.
 *  - Internal continuation steps (analyzeResults) are folded into their parent
 *    op (dropped), so a single read turn stays ONE operation.
 *  - A turn with no actionable plan (chat / small talk) → one
 *    `conversation.general` operation, so every billable turn maps to ≥1 row.
 */
export function deriveTurnOperations(rawIntent: IntentPlanLike | null | undefined): TurnOperation[] {
  const fallback: TurnOperation[] = [{ operationType: 'conversation.general', operationIndex: 0 }];
  if (!rawIntent || !rawIntent.function) return fallback;

  const steps: Array<{ fn: string; args: Record<string, unknown> }> = [];
  if (!INTERNAL_STEP_FUNCTIONS.has(rawIntent.function)) {
    steps.push({ fn: rawIntent.function, args: rawIntent.arguments ?? {} });
  }
  for (const a of rawIntent.additionalActions ?? []) {
    if (!a.function || INTERNAL_STEP_FUNCTIONS.has(a.function)) continue;
    steps.push({ fn: a.function, args: a.arguments ?? {} });
  }
  if (steps.length === 0) return fallback;

  return steps.map((s, i) => ({
    operationType: operationTypeFor(s.fn, s.args),
    operationIndex: i,
  }));
}
