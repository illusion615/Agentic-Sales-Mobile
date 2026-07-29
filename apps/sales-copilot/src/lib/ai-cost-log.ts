/**
 * AI cost logging — this app's binding of the shared operation-grain cost model.
 *
 * The row shape, credit allocation and staging lifecycle live in
 * `@agentic/power-runtime`. What belongs here is the transport: which Dataverse
 * table receives the rows, which agent name identifies this app, and how the
 * signed-in user is attributed.
 *
 * Best-effort and fire-and-forget throughout: cost logging must NEVER break or
 * slow a turn.
 */
import { getClient } from '@microsoft/power-apps/data';
import { getContext } from '@microsoft/power-apps/app';
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo';
import { createAiCostLog, type AgentLogSink } from '@agentic/power-runtime';
import { INTERNAL_STEP_FUNCTIONS, operationTypeFor } from './cost-operation';

const AGENT_LOG_DS = 'crf5c_agentlogs';
const AGENT_NAME = 'Sales Copilot';

/**
 * Ledger labels for calls that fire OUTSIDE a turn's core work (reactive
 * composer UI). Excluded from the cost pool so per-operation samples stay clean
 * regardless of when the reactive call lands.
 */
const NON_TURN_LABELS = ['Follow-up suggestions'];

let costClient: ReturnType<typeof getClient> | null = null;
let costUserPromise: Promise<{ userId: string; userName: string }> | null = null;

function getCostClient(): ReturnType<typeof getClient> {
  if (!costClient) costClient = getClient(dataSourcesInfo);
  return costClient;
}

/** Resolve the signed-in user once per app session for cost attribution. */
function getCostUser(): Promise<{ userId: string; userName: string }> {
  if (!costUserPromise) {
    costUserPromise = getContext()
      .then((context) => ({
        userId: (context.user.objectId || '').trim().toLowerCase(),
        userName: (context.user.fullName || context.user.userPrincipalName || '').trim(),
      }))
      .catch((error: unknown) => {
        // Permit a later write to retry if host context was temporarily unavailable.
        costUserPromise = null;
        console.warn('[AI Cost] User context unavailable (cost row remains unattributed):', error);
        return { userId: '', userName: '' };
      });
  }
  return costUserPromise;
}

/** Writes cost rows to Dataverse, stamped with the signed-in user. */
const sink: AgentLogSink = {
  async write(row) {
    const user = await getCostUser();
    const attributedRow = {
      ...row,
      ...(user.userId ? { crf5c_userid: user.userId } : {}),
      ...(user.userName ? { crf5c_username: user.userName } : {}),
    };
    await getCostClient().createRecordAsync<Record<string, unknown>, unknown>(AGENT_LOG_DS, attributedRow);
  },
};

const costLog = createAiCostLog({
  sink,
  agentName: AGENT_NAME,
  classifyOperation: operationTypeFor,
  internalStepFunctions: INTERNAL_STEP_FUNCTIONS,
  nonBillableLabels: NON_TURN_LABELS,
});

/**
 * Stage the just-completed turn and flush the previous one. Call once per turn,
 * right after processMessage returns and rawIntent is known — before the abort
 * check, so a cancelled turn still records the credits it already consumed.
 */
export const stageTurnCost = costLog.stageTurn;

/** Write the staged turn immediately. */
export const flushStagedCost = costLog.flush;

/**
 * Persist one business AI operation that runs outside a Copilot chat turn (an
 * account insight, a pipeline summary, a generated weekly report). The caller
 * supplies the trace emitted by the invoke boundary, so the existing matcher
 * Flow backfills its real credit cost exactly as it does for chat operations.
 */
export const recordStandaloneAiOperation = costLog.recordStandaloneOperation;
