/** Field Service binding for the shared AI cost model. */
import { getContext } from '@microsoft/power-apps/app';
import { getClient } from '@microsoft/power-apps/data';
import { createAiCostLog, type AgentLogSink } from '@agentic/power-runtime';
import { dataSourcesInfo } from '../../../.power/schemas/appschemas/dataSourcesInfo';

const AGENT_LOG_DS = 'crf5c_agentlogs';
const AGENT_NAME = 'Field Service Copilot';

let costClient: ReturnType<typeof getClient> | null = null;
let costUserPromise: Promise<{ userId: string; userName: string }> | null = null;

function getCostClient(): ReturnType<typeof getClient> {
  if (!costClient) costClient = getClient(dataSourcesInfo);
  return costClient;
}

function getCostUser(): Promise<{ userId: string; userName: string }> {
  if (!costUserPromise) {
    costUserPromise = getContext()
      .then((context) => ({
        userId: (context.user.objectId || '').trim().toLowerCase(),
        userName: (context.user.fullName || context.user.userPrincipalName || '').trim(),
      }))
      .catch((error: unknown) => {
        costUserPromise = null;
        console.warn('[AI Cost] User context unavailable; cost row remains unattributed:', error);
        return { userId: '', userName: '' };
      });
  }
  return costUserPromise;
}

const sink: AgentLogSink = {
  async write(row) {
    const user = await getCostUser();
    const result = await getCostClient().createRecordAsync<Record<string, unknown>, unknown>(
      AGENT_LOG_DS,
      {
        ...row,
        ...(user.userId ? { crf5c_userid: user.userId } : {}),
        ...(user.userName ? { crf5c_username: user.userName } : {}),
      },
    );
    if (!result.success) throw new Error(result.error?.message ?? 'Agent Log write failed');
  },
};

const costLog = createAiCostLog({
  sink,
  agentName: AGENT_NAME,
  classifyOperation: () => 'field.unknown',
});

export const recordStandaloneAiOperation = costLog.recordStandaloneOperation;