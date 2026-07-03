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

import { extractEntitySeed, type ResolutionItem } from './agent-utils';
import { getFunctionSubject } from './function-registry';
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

  // I-3: normalize resolutions[] (or wrap legacy matchTarget). Each resolution
  // carries an `intentIndex` (0 = head, 1+ = additionalActions). Route each one to
  // the intent it belongs to — WITHOUT this, ALL resolutions pool onto the head,
  // so intent 0 resolves intent 1's account/contact (the "step 1 mixed in step 2's
  // account name" bug). Resolutions with no intentIndex default to the head.
  const allResolutions: ResolutionItem[] = intent.requiresMatching
    ? (intent.resolutions?.length
        ? intent.resolutions
        : intent.matchTarget
          ? [{ entityType: intent.matchTarget.entityType, query: intent.matchTarget.query }]
          : [])
    : [];
  const resolutionsFor = (idx: number): ResolutionItem[] =>
    allResolutions.filter((r) => (r.intentIndex ?? 0) === idx);

  // Primary intent
  if (intent.function) {
    pushIntent(intent.function, (intent.arguments as Record<string, unknown>) ?? {}, {
      userFacingLabel: intent.userFacingLabel,
      reason: intent.multiIntentAnalysis?.summary,
      resolutions: resolutionsFor(0),
    });
  }

  // Additional intents — each queue entry carries ONLY its OWN resolutions (routed
  // by intentIndex), so it resolves its own account/contact when it runs.
  (intent.additionalActions ?? []).forEach((action: { function: string; arguments?: Record<string, unknown>; userFacingLabel?: { zh: string; en: string }; reason?: string }, i: number) => {
    pushIntent(action.function, action.arguments ?? {}, {
      userFacingLabel: action.userFacingLabel,
      reason: action.reason,
      resolutions: resolutionsFor(i + 1),
    });
  });

  // Seed resolvedContext from the primary intent's resolved entity-reference
  // args (account / contact / opportunity id + name). buildEffectiveArgs only
  // fills MISSING keys, so this lets sibling additionalActions auto-link to the
  // same entity the user is acting on — e.g. "update this opportunity AND book a
  // meeting" creates the meeting already linked to that opportunity.
  // Phase 2: same canonical PAGE_ENTITY_KEYS the page-seed uses (no drift).
  const seedContext = extractEntitySeed(intent.arguments ?? {});

  return {
    id,
    intents,
    cursor: intents.length > 0 ? 0 : -1,
    resolvedContext: seedContext,
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

/** Append a resolution to the END of one intent's chain (missing-subject gate). */
export function appendResolution(
  q: IntentQueue,
  intentId: string,
  resolution: ResolutionItem,
): IntentQueue {
  return {
    ...q,
    intents: q.intents.map((i) =>
      i.id === intentId ? { ...i, resolutions: [...i.resolutions, resolution] } : i
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

/**
 * Missing-subject gate (pure). If the intent's function declares a required
 * subject entity (registry `subject`, e.g. updateOpportunity → 'opportunity')
 * and that subject's id is NOT present in the effective args, append a REQUIRED
 * resolution for it so the runtime launches fuzzy match — instead of the handler
 * hard-failing on a missing id. A name in the args ("update opportunity ACME")
 * seeds the fuzzy query; no name ("update the opportunity") leaves the query
 * empty → the fuzzy handler returns a pick list. Silent no-op when the subject is
 * already known (args, or resolvedContext seeded from the page / a prior intent).
 */
export function ensureRequiredSubjectResolution(queue: IntentQueue, intent: QueueIntent): IntentQueue {
  const subject = getFunctionSubject(intent.function);
  if (!subject) return queue;
  // Already resolving this subject (a name→id resolution is queued) → skip.
  if (intent.resolutions.some((r) => r.entityType === subject)) return queue;
  const args = buildEffectiveArgs(intent, queue.resolvedContext);
  const idVal = args[`${subject}Id`];
  if (typeof idVal === 'string' && idVal) return queue; // fast-path: subject already known
  const nameVal = args[`${subject}Name`];
  const query = typeof nameVal === 'string' ? nameVal : '';
  return appendResolution(queue, intent.id, { entityType: subject, query, required: true });
}

/** Find an intent by id. */
export function findIntent(q: IntentQueue, intentId: string): QueueIntent | undefined {
  return q.intents.find((i) => i.id === intentId);
}

/** Find an intent by its associated card messageId. */
export function findIntentByMessageId(q: IntentQueue, messageId: string): QueueIntent | undefined {
  return q.intents.find((i) => i.messageId === messageId);
}
