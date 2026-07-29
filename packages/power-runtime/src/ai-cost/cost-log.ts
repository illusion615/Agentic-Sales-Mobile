/**
 * AI Cost Logging — operation grain
 * --------------------------------------------------------------------------
 * Writes one Agent Log row per BUSINESS OPERATION of a user turn, so spend can
 * be analysed along business dimensions (time × user × operation type) and the
 * real credit cost joined later from the platform's AI Event table.
 * Best-effort and fire-and-forget: cost logging must NEVER break or slow a turn.
 *
 * ── Why per operation, not per call or per turn ───────────────────────────
 * One turn may hold multiple intents, e.g. "log a visit AND bump the
 * opportunity stage". Per-call rows can't carry an operation type for the
 * shared classification/planning calls; per-turn rows can't separate the ops.
 * So we emit ONE row per operation and describe how the turn's total credit is
 * split across them.
 *
 * ── How the credit join / split works ─────────────────────────────────────
 * The invoke boundary prepends `[[trace:<guid>]]` at char 0 of every prompt;
 * the GUID survives the AI Event prompt truncation, giving an exact 1:1 match
 * from an AI Event row back to the app call. We record the turn's full set of
 * trace GUIDs on EACH operation row, plus a `divisor` = operation count:
 *
 *   biz_aieventtracelist = {"v":1,"traces":["<guid>",…],"divisor":N}
 *
 * A server-side matcher computes, per row:
 *   biz_creditsconsumed = Σ(AI Event credit for each trace) / divisor
 * Because every row of the turn carries the same traces + divisor, summing
 * across the turn's rows reconstructs the exact turn total, while each row
 * still gets an even share of the shared cost. Each row is self-describing, so
 * no cross-row coordination is needed.
 *
 * ── allocationMethod ──────────────────────────────────────────────────────
 *   "sole"   — single-operation turn (divisor 1): a CLEAN end-to-end
 *              measurement. Distribution stats should prefer these.
 *   "shared" — multi-operation turn (divisor N): an even allocation of shared
 *              turn cost; good for totals, not for per-operation distributions.
 */

import { aiCallsForTurn } from './call-log';
import {
  deriveTurnOperations,
  type IntentPlanLike,
  type OperationClassifier,
  type TurnOperation,
} from './operations';

/** Where cost rows are written. The app owns the Dataverse transport. */
export interface AgentLogSink {
  write(row: Record<string, unknown>): Promise<void>;
}

export interface AiCostLogOptions {
  sink: AgentLogSink;
  /** Logical agent name recorded on every row (identifies the app). */
  agentName: string;
  /** Maps a plan function to a business operation type (domain vocabulary). */
  classifyOperation: OperationClassifier;
  /** Plan steps folded into their parent operation. */
  internalStepFunctions?: Iterable<string>;
  /**
   * AI-call ledger labels for calls that fire OUTSIDE a turn's core work
   * (reactive composer UI, warm-ups). They are excluded from the cost pool so
   * per-operation samples stay clean regardless of when the reactive call lands.
   */
  nonBillableLabels?: Iterable<string>;
  /** How long after staging to write the turn if no follow-on turn arrives. */
  flushFallbackMs?: number;
  /** Truncation ceiling for the stored user message. */
  queryMaxChars?: number;
}

export interface AiCostLog {
  /**
   * Stage the just-completed turn and flush the PREVIOUS staged turn (whose
   * ledger is now guaranteed complete). Call once per turn, right after the
   * plan is known — before any abort check, so a cancelled turn still records
   * the credits it already consumed.
   */
  stageTurn(args: { turnId: string; userMessage: string; rawIntent: IntentPlanLike | null | undefined }): void;
  /** Write the staged turn immediately. Idempotent; fire-and-forget. */
  flush(): void;
  /**
   * Persist one AI operation that runs outside a chat turn (a background
   * insight, a generated report). The caller supplies the trace emitted by the
   * invoke boundary so the same server-side matcher backfills its real cost.
   *
   * Deliberately stores only a short business descriptor, never the generated
   * response or the full data prompt.
   */
  recordStandaloneOperation(args: { operationType: string; queryText: string; traceId: string }): void;
}

const DEFAULT_FLUSH_FALLBACK_MS = 15_000;
const DEFAULT_QUERY_MAX = 2000;

/** Serialized trace manifest shared by every row of one turn. */
export function buildTraceManifest(traces: string[], divisor: number): string {
  return JSON.stringify({ v: 1, traces, divisor });
}

/**
 * Build the Agent Log rows for one turn. Pure: no I/O, no timers — the credit
 * allocation contract is verifiable in isolation.
 *
 * `biz_creditsconsumed` is intentionally left unset; the server-side matcher
 * backfills it from the AI Event table.
 */
export function buildTurnCostRows(input: {
  turnId: string;
  userMessage: string;
  operations: TurnOperation[];
  traces: string[];
  agentName: string;
  timestamp?: string;
  queryMaxChars?: number;
}): Record<string, unknown>[] {
  if (input.traces.length === 0) return []; // nothing billable recorded
  const operations = input.operations.length > 0
    ? input.operations
    : [{ operationType: 'conversation.general', operationIndex: 0 }];

  const divisor = operations.length;
  const allocationMethod = divisor > 1 ? 'shared' : 'sole';
  const tracePayload = buildTraceManifest(input.traces, divisor);
  const nowIso = input.timestamp ?? new Date().toISOString();
  const query = input.userMessage.slice(0, input.queryMaxChars ?? DEFAULT_QUERY_MAX);

  return operations.map((op) => ({
    crf5c_logname: input.turnId,
    crf5c_agentname: input.agentName,
    crf5c_querytext: query || op.operationType,
    crf5c_timestamp: nowIso,
    crf5c_sessionid: `${input.turnId}#${op.operationIndex}`,
    crf5c_sourcedescription: op.operationType,
    biz_operationtype: op.operationType,
    biz_operationindex: op.operationIndex,
    biz_allocationmethod: allocationMethod,
    biz_aieventtracelist: tracePayload,
  }));
}

interface StagedTurn {
  turnId: string;
  userMessage: string;
  operations: TurnOperation[];
}

export function createAiCostLog(options: AiCostLogOptions): AiCostLog {
  const nonBillable = new Set(options.nonBillableLabels ?? []);
  const fallbackMs = options.flushFallbackMs ?? DEFAULT_FLUSH_FALLBACK_MS;

  let staged: StagedTurn | null = null;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  function emit(row: Record<string, unknown>, warningLabel: string): void {
    // Fire-and-forget: never await, never surface a write error to the turn.
    void options.sink.write(row).catch((error: unknown) => {
      console.warn(`[AI Cost] ${warningLabel} failed (ignored):`, error);
    });
  }

  function flush(): void {
    const s = staged;
    staged = null;
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    if (!s) return;
    try {
      const traces = Array.from(
        new Set(
          aiCallsForTurn(s.turnId).calls
            .filter((c) => c.ok && c.traceId && !nonBillable.has(c.label))
            .map((c) => c.traceId),
        ),
      );
      const rows = buildTurnCostRows({
        turnId: s.turnId,
        userMessage: s.userMessage,
        operations: s.operations,
        traces,
        agentName: options.agentName,
        queryMaxChars: options.queryMaxChars,
      });
      for (const row of rows) emit(row, 'Agent Log write');
    } catch (e) {
      console.warn('[AI Cost] flush failed (ignored):', e);
    }
  }

  return {
    stageTurn(args) {
      try {
        flush(); // write the predecessor before overwriting `staged`
        if (!args.turnId) return; // calls made outside a turn are not attributable
        staged = {
          turnId: args.turnId,
          userMessage: args.userMessage,
          operations: deriveTurnOperations(args.rawIntent, options.classifyOperation, {
            internalStepFunctions: options.internalStepFunctions,
          }),
        };
        if (fallbackTimer) clearTimeout(fallbackTimer);
        fallbackTimer = setTimeout(() => { flush(); }, fallbackMs);
      } catch (e) {
        console.warn('[AI Cost] stageTurn failed (ignored):', e);
      }
    },

    flush,

    recordStandaloneOperation(args) {
      try {
        if (!args.operationType || !args.traceId) return;
        const operationId = `aiop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const [row] = buildTurnCostRows({
          turnId: operationId,
          userMessage: args.queryText || args.operationType,
          operations: [{ operationType: args.operationType, operationIndex: 0 }],
          traces: [args.traceId],
          agentName: options.agentName,
          queryMaxChars: options.queryMaxChars,
        });
        if (row) emit(row, 'Standalone Agent Log write');
      } catch (e) {
        console.warn('[AI Cost] recordStandaloneOperation failed (ignored):', e);
      }
    },
  };
}
