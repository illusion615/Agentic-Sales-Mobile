/**
 * Turn → business-operation mapping for AI cost analytics.
 * --------------------------------------------------------------------------
 * The cost model analyses spend along BUSINESS dimensions (time × user ×
 * operation type), not technical call sites. The expansion MECHANISM is shared
 * (`@agentic/power-runtime`); what lives here is this app's VOCABULARY — which
 * skill function means which business operation.
 *
 * Classification works from the ALREADY-parsed plan; it never re-interprets
 * free text (that is the Frame's job).
 */
import {
  deriveTurnOperations as deriveOperations,
  type IntentPlanLike,
  type TurnOperation,
} from '@agentic/power-runtime';

export type { IntentPlanLike, TurnOperation };

/**
 * Plan steps that are internal continuations, NOT user-facing business
 * operations. `analyzeResults` is a grounded "think over the fetched records"
 * step the router appends to a read intent — it belongs to its parent query
 * operation, so it must not become a separate operation row (which would halve
 * the parent's per-operation cost sample).
 */
export const INTERNAL_STEP_FUNCTIONS: readonly string[] = ['analyzeResults'];

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
    case 'draftFeedback': return 'feedback.submit';

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
 * Expand a turn's intent plan into an ordered list of BUSINESS operations,
 * using this app's classifier.
 */
export function deriveTurnOperations(rawIntent: IntentPlanLike | null | undefined): TurnOperation[] {
  return deriveOperations(rawIntent, operationTypeFor, {
    internalStepFunctions: INTERNAL_STEP_FUNCTIONS,
  });
}
