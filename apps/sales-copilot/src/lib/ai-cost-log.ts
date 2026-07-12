/**
 * AI Cost Logging — operation-grain
 * --------------------------------------------------------------------------
 * Writes one Agent Log (crf5c_agentlogs) row per BUSINESS OPERATION of a user
 * turn, so spend can be analysed along business dimensions (time × user ×
 * operation type) and the real credit cost joined later from the AI Event
 * (msdyn_aievent) table. Best-effort + fire-and-forget: cost logging must NEVER
 * break or slow a turn.
 *
 * ── Why per operation, not per call or per turn ───────────────────────────
 * One turn may hold multiple intents (multi-intent), e.g. "log a visit AND
 * bump the opportunity stage". Per-call rows can't carry an operation type for
 * the shared Frame/Orchestrator calls; per-turn rows can't separate the ops.
 * So we emit ONE row per operation (head intent + each additionalAction) and
 * describe how the turn's total credit is split across them (see below).
 *
 * ── How the credit join / split works ─────────────────────────────────────
 * invokeFlowForLLM prepends `[[trace:<guid>]]` at char 0 of every prompt; the
 * GUID survives the AI Event 4000-char prompt truncation, giving an exact 1:1
 * match from an AI Event row back to the app call. We record the turn's full
 * set of trace GUIDs on EACH operation row, plus a `divisor` = operation count:
 *
 *   biz_aieventtracelist = {"v":1,"traces":["<guid>",…],"divisor":N}
 *
 * A server-side matcher Flow computes, per row:
 *   biz_creditsconsumed = Σ(AI Event credit for each trace) / divisor
 * Because every row of the turn carries the same traces + divisor, summing
 * biz_creditsconsumed across the turn's rows reconstructs the exact turn total
 * (Σ traces), while each row still gets an even share of the shared cost. No
 * cross-row coordination is needed — each row is self-describing.
 *
 * ── allocationMethod (biz_allocationmethod) ───────────────────────────────
 *   "sole"   — single-operation turn (divisor 1): the row's credit is a CLEAN
 *              end-to-end measurement of that operation. Distribution stats
 *              (min/max/avg/median per operationType) should prefer these.
 *   "shared" — multi-operation turn (divisor N): the row's credit is an even
 *              allocation of shared turn cost, good for totals, not for clean
 *              per-operation distributions.
 *
 * ── Row field mapping (crf5c_agentlogs) ───────────────────────────────────
 *   crf5c_logname           = turnId                (groups a turn's op rows)
 *   crf5c_agentname         = "Sales Copilot"
 *   crf5c_querytext         = user message[:2000]   (turn context)
 *   crf5c_sourcedescription = operationType         (human-scannable)
 *   crf5c_sessionid         = `${turnId}#${index}`  (unique per row)
 *   crf5c_timestamp         = ISO turn time
 *   biz_operationtype       = operationType
 *   biz_operationindex      = 0-based op index in the turn
 *   biz_allocationmethod    = "sole" | "shared"
 *   biz_aieventtracelist    = {"v":1,"traces":[…],"divisor":N}
 *   biz_creditsconsumed     = (left unset — backfilled by the matcher Flow)
 *
 * ── Lifecycle ─────────────────────────────────────────────────────────────
 * `stageTurnCost` is called once per turn (right after processMessage returns,
 * when rawIntent is known). It flushes the PREVIOUS staged turn first — by then
 * that turn's AI-call ledger is complete, including any queue-phase call that
 * fired after processMessage returned — and arms a fallback timer so the LAST
 * turn is written even without a follow-on turn. `biz_*` columns are written via
 * the raw Dataverse client because the friendly adapter only surfaces `crf5c_*`.
 *
 * v1 scope note: reactive/background AI calls that fire OUTSIDE a turn (composer
 * follow-up suggestions, auto-summaries, warm-ups) are excluded from the pool
 * and not yet costed here.
 */

import { getClient } from '@microsoft/power-apps/data';
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo';
import { aiCallsForTurn } from './ai-call-log';
import { deriveTurnOperations, type TurnOperation, type IntentPlanLike } from './cost-operation';

const AGENT_LOG_DS = 'crf5c_agentlogs';
const AGENT_NAME = 'Sales Copilot';
const QUERY_MAX = 2000;
/** How long after staging to write the turn if no follow-on turn arrives. */
const FLUSH_FALLBACK_MS = 15_000;

/**
 * AI-call ledger labels for calls that fire OUTSIDE a turn's core work (reactive
 * composer UI). They are excluded from the cost pool so per-operation samples
 * stay clean and deterministic regardless of when the reactive call lands.
 */
const NON_TURN_LABELS = new Set<string>(['Follow-up suggestions']);

interface StagedTurn {
  turnId: string;
  userMessage: string;
  operations: TurnOperation[];
}

let staged: StagedTurn | null = null;
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
let costClient: ReturnType<typeof getClient> | null = null;

function getCostClient(): ReturnType<typeof getClient> {
  if (!costClient) costClient = getClient(dataSourcesInfo);
  return costClient;
}

/**
 * Stage the just-completed turn for cost persistence and flush the PREVIOUS
 * staged turn (whose ledger is now guaranteed complete). Call once per turn,
 * right after processMessage returns and rawIntent is known — before the abort
 * check, so a cancelled turn still records the credits it already consumed.
 */
export function stageTurnCost(args: {
  turnId: string;
  userMessage: string;
  rawIntent: IntentPlanLike | null | undefined;
}): void {
  try {
    flushStagedCost(); // write the predecessor before overwriting `staged`
    if (!args.turnId) return; // calls made outside a turn are not attributable
    staged = {
      turnId: args.turnId,
      userMessage: args.userMessage,
      operations: deriveTurnOperations(args.rawIntent),
    };
    if (fallbackTimer) clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(() => { flushStagedCost(); }, FLUSH_FALLBACK_MS);
  } catch (e) {
    console.warn('[AI Cost] stageTurnCost failed (ignored):', e);
  }
}

/**
 * Write the staged turn's operation rows from the now-complete AI-call ledger.
 * Idempotent per staged turn (clears `staged` up front); fire-and-forget.
 */
export function flushStagedCost(): void {
  const s = staged;
  staged = null;
  if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
  if (!s) return;
  try {
    const traces = Array.from(
      new Set(
        aiCallsForTurn(s.turnId).calls
          .filter((c) => c.ok && c.traceId && !NON_TURN_LABELS.has(c.label))
          .map((c) => c.traceId),
      ),
    );
    if (traces.length === 0) return; // nothing billable recorded for this turn

    const divisor = s.operations.length || 1;
    const allocationMethod = divisor > 1 ? 'shared' : 'sole';
    const tracePayload = JSON.stringify({ v: 1, traces, divisor });
    const nowIso = new Date().toISOString();
    const query = s.userMessage.slice(0, QUERY_MAX);
    const client = getCostClient();

    for (const op of s.operations) {
      const row: Record<string, unknown> = {
        crf5c_logname: s.turnId,
        crf5c_agentname: AGENT_NAME,
        crf5c_querytext: query || op.operationType,
        crf5c_timestamp: nowIso,
        crf5c_sessionid: `${s.turnId}#${op.operationIndex}`,
        crf5c_sourcedescription: op.operationType,
        biz_operationtype: op.operationType,
        biz_operationindex: op.operationIndex,
        biz_allocationmethod: allocationMethod,
        biz_aieventtracelist: tracePayload,
        // biz_creditsconsumed is intentionally left unset — the server-side
        // matcher Flow backfills it from msdyn_aievent.
      };
      // Fire-and-forget: never await, never surface a write error to the turn.
      void client
        .createRecordAsync<Record<string, unknown>, unknown>(AGENT_LOG_DS, row)
        .catch((e: unknown) => console.warn('[AI Cost] Agent Log write failed (ignored):', e));
    }
  } catch (e) {
    console.warn('[AI Cost] flushStagedCost failed (ignored):', e);
  }
}
