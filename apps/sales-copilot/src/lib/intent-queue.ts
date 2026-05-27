/**
 * IntentQueue — single source of truth for multi-step intent orchestration.
 *
 * Replaces the previously scattered logic across copilot-context.tsx:
 *   parkedIntentRef, replayAdditionalActions, completeParkedIntentWithNew*,
 *   continuePendingAction's cascade walk, createEntityForResolution,
 *   skipResolutionAndDraftImpl, bypassFinalActivityDraft.
 *
 * One user turn → one IntentQueue. The queue holds every intent the user
 * implicitly or explicitly asked for (primary + LLM-inferred additionalActions
 * + any sub-intents the runtime spawns
 * to satisfy a resolution like "create new contact for the parent activity").
 *
 * The reducer here is pure; the async executor (intent-queue-runtime.ts) owns
 * fuzzy matching, function execution, and React message rendering.
 */

import type { ResolutionItem } from './agent-utils';
import type { IntentResult } from './copilot-agent';

export type IntentStatus =
  | 'queued'          // not yet active
  | 'resolving'       // currently running fuzzy match for one of its resolutions
  | 'awaiting-user'   // a match-selection or awaiting-clarification card is shown
  | 'executing'       // form-card shown, waiting for Save / Cancel
  | 'confirmed'       // user saved / function ran successfully
  | 'cancelled'       // user cancelled this step
  | 'skipped'         // user skipped a resolution that this step depended on
  | 'failed';         // executor hit an unrecoverable error

export interface QueueIntentResult {
  recordId?: string;
  recordName?: string;
  error?: string;
  /** Query result data stored for aggregation in multi-query workflows. */
  data?: unknown;
  count?: number;
}

export interface QueueIntent {
  /** Stable id within the queue (e.g. q-{queueId}-{index}-{nonce}). */
  id: string;
  /** Position in the queue at creation time; new intents inserted mid-flight get fractional indices. */
  index: number;
  /** Function name — draftActivity, draftOpportunity, queryAccounts, updateActivity, ... */
  function: string;
  /** LLM-supplied arguments; merged with resolvedContext at execute time. */
  arguments: Record<string, unknown>;
  /** Pretty label for the progress badge. */
  userFacingLabel?: { zh: string; en: string };
  /** Why this intent exists (for cards / debugging). */
  reason?: string;
  /** Entities that need fuzzy-match before execute. Consumed in order. */
  resolutions: ResolutionItem[];
  /** Lifecycle state. */
  status: IntentStatus;
  /** Message id of the card currently representing this intent (form / match / awaiting). */
  messageId?: string;
  /** Outcome once terminal. */
  result?: QueueIntentResult;
  /** When true, this intent was spawned by the runtime to unblock another (e.g. "create new contact for the parent activity"). The parent intent's id is in parentId. */
  parentId?: string;
  /** True once a "Starting step N: ..." narration message has been emitted for this intent. */
  announced?: boolean;
}

export interface IntentQueue {
  /** Globally unique queue id (one per user turn). */
  id: string;
  intents: QueueIntent[];
  /** Index of the intent currently being processed (or -1 once done). */
  cursor: number;
  /**
   * Accumulated entity context resolved during this queue.
   *   accountId / accountName / contactId / contactName / opportunityId / opportunityName
   * Auto-injected into each subsequent intent's arguments if missing.
   */
  resolvedContext: Record<string, string>;
  createdAt: number;
  /** Set true once cursor walks past the last intent. */
  done: boolean;
  /** Set true once the final "all steps completed" summary has been pushed. */
  summaryEmitted?: boolean;
  /** Original user message that triggered this queue (for aggregation). */
  userMessage?: string;
}

// ---------- factories ----------

let nonce = 0;
const fresh = () => `${Date.now().toString(36)}-${(++nonce).toString(36)}`;

export function newQueueId(): string {
  return `q-${fresh()}`;
}

/**
 * Build a queue from the LLM's IntentResult.
 * Primary intent always sits at index 0; additionalActions append in order.
 */
export function buildQueueFromIntent(intent: IntentResult): IntentQueue {
  const id = newQueueId();
  const intents: QueueIntent[] = [];

  const pushIntent = (
    fnName: string,
    args: Record<string, unknown>,
    opts: {
      userFacingLabel?: { zh: string; en: string };
      reason?: string;
      resolutions?: ResolutionItem[];
    } = {}
  ) => {
    intents.push({
      id: `${id}-${intents.length}-${fresh()}`,
      index: intents.length,
      function: fnName,
      arguments: { ...args },
      userFacingLabel: opts.userFacingLabel,
      reason: opts.reason,
      resolutions: opts.resolutions ?? [],
      status: 'queued',
    });
  };

  // Primary intent
  if (intent.function) {
    // I-3: normalize resolutions[] (or wrap legacy matchTarget) onto the primary intent.
    const primaryResolutions: ResolutionItem[] = intent.requiresMatching
      ? (intent.resolutions?.length
          ? intent.resolutions
          : intent.matchTarget
            ? [{ entityType: intent.matchTarget.entityType, query: intent.matchTarget.query }]
            : [])
      : [];
    pushIntent(intent.function, (intent.arguments as Record<string, unknown>) ?? {}, {
      userFacingLabel: intent.userFacingLabel,
      reason: intent.multiIntentAnalysis?.summary,
      resolutions: primaryResolutions,
    });
  }

  // Additional intents — each one its own queue entry. We do NOT auto-attach
  // resolutions here; the per-step name→id lookup happens at execute time via
  // the runtime's "implicit fuzzy match" pass (mirrors processAdditionalIntents
  // behavior so accountName / contactName / opportunityName get resolved when
  // present without an id).
  (intent.additionalActions ?? []).forEach((action: { function: string; arguments?: Record<string, unknown>; userFacingLabel?: { zh: string; en: string }; reason?: string }) => {
    pushIntent(action.function, action.arguments ?? {}, {
      userFacingLabel: action.userFacingLabel,
      reason: action.reason,
    });
  });

  return {
    id,
    intents,
    cursor: intents.length > 0 ? 0 : -1,
    resolvedContext: {},
    createdAt: Date.now(),
    done: intents.length === 0,
  };
}

// ---------- pure reducer helpers ----------

export function currentIntent(q: IntentQueue): QueueIntent | undefined {
  if (q.cursor < 0 || q.cursor >= q.intents.length) return undefined;
  return q.intents[q.cursor];
}

export function totalCount(q: IntentQueue): number {
  return q.intents.length;
}

export function confirmedCount(q: IntentQueue): number {
  return q.intents.filter((i) => i.status === 'confirmed').length;
}

export function cancelledCount(q: IntentQueue): number {
  return q.intents.filter((i) => i.status === 'cancelled' || i.status === 'skipped').length;
}

/** Replace one intent (returns new queue). */
export function patchIntent(
  q: IntentQueue,
  intentId: string,
  patch: Partial<QueueIntent>,
): IntentQueue {
  return {
    ...q,
    intents: q.intents.map((i) => (i.id === intentId ? { ...i, ...patch } : i)),
  };
}

/** Update one intent's arguments by shallow-merge. */
export function mergeIntentArgs(
  q: IntentQueue,
  intentId: string,
  argsPatch: Record<string, unknown>,
): IntentQueue {
  return {
    ...q,
    intents: q.intents.map((i) =>
      i.id === intentId ? { ...i, arguments: { ...i.arguments, ...argsPatch } } : i
    ),
  };
}

/** Drop the first resolution from one intent. */
export function dropFirstResolution(q: IntentQueue, intentId: string): IntentQueue {
  return {
    ...q,
    intents: q.intents.map((i) =>
      i.id === intentId ? { ...i, resolutions: i.resolutions.slice(1) } : i
    ),
  };
}

/** Replace the first resolution's query (for "Search other"). */
export function replaceFirstResolutionQuery(
  q: IntentQueue,
  intentId: string,
  newQuery: string,
): IntentQueue {
  return {
    ...q,
    intents: q.intents.map((i) => {
      if (i.id !== intentId) return i;
      const [first, ...rest] = i.resolutions;
      if (!first) return i;
      return { ...i, resolutions: [{ ...first, query: newQuery }, ...rest] };
    }),
  };
}

/** Append accumulated context (e.g. after a fuzzy match auto-injected accountId). */
export function mergeResolvedContext(
  q: IntentQueue,
  patch: Record<string, string>,
): IntentQueue {
  return {
    ...q,
    resolvedContext: { ...q.resolvedContext, ...patch },
  };
}

/**
 * Insert a sub-intent immediately AFTER the current cursor, so the runtime
 * processes it next, then returns to the parent. Used when match-selection
 * card says "Create new contact" — we spawn a draftContact intent and resume
 * the parent (activity) once that contact is confirmed.
 */
export function insertSubIntentAfterCursor(
  q: IntentQueue,
  parentId: string,
  subIntent: Omit<QueueIntent, 'index' | 'id' | 'status' | 'parentId'>,
): { queue: IntentQueue; subIntentId: string } {
  const subId = `${q.id}-sub-${fresh()}`;
  const newSub: QueueIntent = {
    ...subIntent,
    id: subId,
    index: q.cursor + 0.5,
    status: 'queued',
    parentId,
  };
  const intents = [...q.intents];
  intents.splice(q.cursor + 1, 0, newSub);
  // Re-number indices for display sanity.
  intents.forEach((i, idx) => { i.index = idx; });
  return { queue: { ...q, intents }, subIntentId: subId };
}

/**
 * Move cursor forward to the next non-terminal intent (status === 'queued').
 * If none found, mark queue done.
 */
export function advanceCursor(q: IntentQueue): IntentQueue {
  for (let i = q.cursor + 1; i < q.intents.length; i++) {
    if (q.intents[i].status === 'queued') {
      return { ...q, cursor: i };
    }
  }
  return { ...q, cursor: -1, done: true };
}

/**
 * Build the args to actually call executeFunction with: shallow-merge
 * resolvedContext into the intent's args, but only filling missing keys.
 */
export function buildEffectiveArgs(
  intent: QueueIntent,
  resolvedContext: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...intent.arguments };
  for (const [k, v] of Object.entries(resolvedContext)) {
    if (out[k] == null || out[k] === '') {
      out[k] = v;
    }
  }
  return out;
}

/** Find an intent by id. */
export function findIntent(q: IntentQueue, intentId: string): QueueIntent | undefined {
  return q.intents.find((i) => i.id === intentId);
}

/** Find an intent by its associated card messageId. */
export function findIntentByMessageId(q: IntentQueue, messageId: string): QueueIntent | undefined {
  return q.intents.find((i) => i.messageId === messageId);
}
