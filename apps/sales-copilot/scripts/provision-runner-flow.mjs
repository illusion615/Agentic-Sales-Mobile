/*!
 * Provision the "Background Task - Runner" cloud flow — the server-side Runner
 * of the fire-and-forget subsystem. See
 * docs/05-engineering/background-task-architecture-2026-07-20.md.
 *
 * Design (Option A — agent writes back): on a queued crf5c_backgroundtask row,
 * set it running, invoke the Account Enrichment Agent (which researches AND
 * writes the results to Dataverse), then mark the task succeeded/failed. Thin,
 * reusable dispatcher — new task types add their own branch later.
 *
 * Idempotent: create-or-update by flow name, then activate + add to solution.
 *
 * Auth via env (token minted by caller; never stored):
 *   DV_URL="https://<org>.crm.dynamics.com" \
 *   DV_TOKEN="$(az account get-access-token --resource https://<org>.crm.dynamics.com/ --query accessToken -o tsv)" \
 *   node scripts/provision-runner-flow.mjs
 */

const DV_URL = process.env.DV_URL?.replace(/\/$/, '');
const DV_TOKEN = process.env.DV_TOKEN;
const APP_SOLUTION = process.env.DV_APP_SOLUTION || 'AgenticSalesMobileSolution';
const API = `${DV_URL}/api/data/v9.2`;

// Environment-specific resource ids (discovered 2026-07-20; see repo memory).
const DATAVERSE_CONN_REF = 'cua_agent_fbY2k.shared_commondataserviceforapps.shared-commondataser-694d88f9-8f3f-4c2f-81f4-64489a1b8721';
// New-generation agents are NOT callable via the Copilot Studio connector
// (ExecuteCopilotAsyncV2 rejects them). They are invoked through the Agent-node
// connector (shared_agentnode / InvokeAgent), the same mechanism the existing
// "Account Enrichment - Account Changed" Studio workflow uses.
const AGENTNODE_CONN_REF = 'new_sharedagentnode_a159d541';
const ENRICHMENT_AGENT_SCHEMA = 'crf5c_accountenrichmentagent_THcDNf';
const FLOW_NAME = 'Background Task - Runner';

if (!DV_URL || !DV_TOKEN) {
  console.error('Missing DV_URL or DV_TOKEN env var. See header for usage.');
  process.exit(1);
}

const headers = (extra = {}) => ({
  Authorization: `Bearer ${DV_TOKEN}`,
  'Content-Type': 'application/json; charset=utf-8',
  Accept: 'application/json',
  'OData-MaxVersion': '4.0',
  'OData-Version': '4.0',
  'MSCRM.SolutionUniqueName': APP_SOLUTION,
  ...extra,
});

const dv = (op) => ({
  connectionName: 'shared_commondataserviceforapps',
  operationId: op,
  apiId: '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps',
});

// Compose the agent instruction from the task fields. Reuses the agent's known
// trigger-payload contract (see copilot-studio/account-enrichment-agent/workflows.md).
const agentPrompt =
  'Run account enrichment for this background task. Research the account from public sources and WRITE the results to Dataverse yourself: update the public master fields, write a concise plain-text profile to account.description, and upsert the Marketing Insight (crf5c_aisummary where crf5c_entityid equals the account id and biz_type equals marketing). Reply with a one-line confirmation.\n\nTrigger payload JSON:\n{\n  "triggerMode": "accountChanged",\n  "accountId": "@{triggerOutputs()?[\'body/crf5c_targetentityid\']}",\n  "accountName": "@{triggerOutputs()?[\'body/crf5c_targetname\']}",\n  "forceRefresh": true,\n  "outputLanguage": "zh-Hans"\n}';

const definition = {
  $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
  contentVersion: '1.0.0.0',
  parameters: {
    $connections: { defaultValue: {}, type: 'Object' },
    $authentication: { defaultValue: {}, type: 'SecureObject' },
  },
  triggers: {
    When_a_task_is_created: {
      type: 'OpenApiConnectionWebhook',
      inputs: {
        host: dv('SubscribeWebhookTrigger'),
        parameters: {
          'subscriptionRequest/message': 1,
          'subscriptionRequest/entityname': 'crf5c_backgroundtask',
          'subscriptionRequest/scope': 4,
        },
        authentication: "@parameters('$authentication')",
      },
      conditions: [
        { expression: "@equals(coalesce(triggerOutputs()?['body/crf5c_status'], ''), 'queued')" },
      ],
    },
  },
  actions: {
    Set_Running: {
      runAfter: {},
      type: 'OpenApiConnection',
      inputs: {
        host: dv('UpdateRecord'),
        parameters: {
          entityName: 'crf5c_backgroundtasks',
          recordId: "@triggerOutputs()?['body/crf5c_backgroundtaskid']",
          'item/crf5c_status': 'running',
          'item/crf5c_startedon': '@utcNow()',
        },
        authentication: "@parameters('$authentication')",
      },
    },
    Run_Agent: {
      runAfter: { Set_Running: ['Succeeded'] },
      type: 'OpenApiConnection',
      inputs: {
        host: {
          apiId: '/providers/Microsoft.PowerApps/apis/shared_agentnode',
          connectionName: 'shared_agentnode',
          operationId: 'InvokeAgent',
        },
        parameters: {
          'body/agentId': ENRICHMENT_AGENT_SCHEMA,
          'body/prompt': agentPrompt,
        },
      },
    },
    Set_Succeeded: {
      runAfter: { Run_Agent: ['Succeeded'] },
      type: 'OpenApiConnection',
      inputs: {
        host: dv('UpdateRecord'),
        parameters: {
          entityName: 'crf5c_backgroundtasks',
          recordId: "@triggerOutputs()?['body/crf5c_backgroundtaskid']",
          'item/crf5c_status': 'succeeded',
          'item/crf5c_resultsummary': "@coalesce(outputs('Run_Agent')?['body/text'], outputs('Run_Agent')?['body/messages'], 'Done')",
          'item/crf5c_finishedon': '@utcNow()',
        },
        authentication: "@parameters('$authentication')",
      },
    },
    Set_Failed: {
      runAfter: { Run_Agent: ['Failed', 'TimedOut', 'Skipped'] },
      type: 'OpenApiConnection',
      inputs: {
        host: dv('UpdateRecord'),
        parameters: {
          entityName: 'crf5c_backgroundtasks',
          recordId: "@triggerOutputs()?['body/crf5c_backgroundtaskid']",
          'item/crf5c_status': 'failed',
          'item/crf5c_error': "@coalesce(string(outputs('Run_Agent')?['body']), 'Agent run failed')",
          'item/crf5c_finishedon': '@utcNow()',
        },
        authentication: "@parameters('$authentication')",
      },
    },
  },
};

const clientdata = JSON.stringify({
  properties: {
    connectionReferences: {
      shared_commondataserviceforapps: {
        runtimeSource: 'embedded',
        connection: { connectionReferenceLogicalName: DATAVERSE_CONN_REF },
        api: { name: 'shared_commondataserviceforapps' },
      },
      shared_agentnode: {
        runtimeSource: 'embedded',
        connection: { connectionReferenceLogicalName: AGENTNODE_CONN_REF },
        api: { name: 'shared_agentnode' },
      },
    },
    definition,
  },
  schemaVersion: '1.0.0.0',
});

async function findFlow() {
  const res = await fetch(
    `${API}/workflows?$select=workflowid,statecode&$filter=category eq 5 and name eq '${FLOW_NAME}'`,
    { headers: headers() },
  );
  if (!res.ok) throw new Error(`Query flow failed (${res.status}): ${await res.text()}`);
  return (await res.json()).value?.[0] ?? null;
}

async function createFlow() {
  const body = {
    category: 5,
    type: 1,
    name: FLOW_NAME,
    description: 'Runner for the fire-and-forget background-task subsystem.',
    primaryentity: 'none',
    statecode: 0,
    statuscode: 1,
    clientdata,
  };
  const res = await fetch(`${API}/workflows`, { method: 'POST', headers: headers({ Prefer: 'return=representation' }), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Create flow failed (${res.status}): ${await res.text()}`);
  const created = await res.json();
  console.log(`✓ Created flow ${FLOW_NAME} (${created.workflowid}).`);
  return created.workflowid;
}

async function patchFlow(id) {
  const res = await fetch(`${API}/workflows(${id})`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ clientdata }) });
  if (!res.ok) throw new Error(`Patch flow failed (${res.status}): ${await res.text()}`);
  console.log(`✓ Updated flow definition (${id}).`);
}

async function activate(id) {
  const res = await fetch(`${API}/workflows(${id})`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ statecode: 1, statuscode: 2 }) });
  if (!res.ok) {
    console.warn(`(activate returned ${res.status}: ${await res.text()})`);
    return;
  }
  console.log('✓ Activated flow.');
}

async function addToSolution(id) {
  const res = await fetch(`${API}/AddSolutionComponent`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ ComponentId: id, ComponentType: 29, SolutionUniqueName: APP_SOLUTION, AddRequiredComponents: false }),
  });
  if (!res.ok) console.warn(`(add-to-solution returned ${res.status}: ${await res.text()})`);
  else console.log(`✓ Added flow to solution ${APP_SOLUTION}.`);
}

(async () => {
  console.log(`Provisioning flow "${FLOW_NAME}" …`);
  const existing = await findFlow();
  // IMPORTANT: patching an activated flow's definition in place (deactivate →
  // PATCH → reactivate) does NOT reliably re-register the Dataverse webhook
  // trigger via the Web API — the flow shows activated but never fires. A fresh
  // create + activate DOES register it. So on re-runs we delete and recreate.
  if (existing) {
    console.log(`• Flow exists (${existing.workflowid}) — deleting to recreate (patch-in-place breaks the webhook).`);
    if (existing.statecode === 1) {
      await fetch(`${API}/workflows(${existing.workflowid})`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ statecode: 0, statuscode: 1 }) });
    }
    const del = await fetch(`${API}/workflows(${existing.workflowid})`, { method: 'DELETE', headers: headers() });
    if (!del.ok && del.status !== 404) throw new Error(`Delete existing flow failed (${del.status}): ${await del.text()}`);
  }
  const id = await createFlow();
  await activate(id);
  await addToSolution(id);
  console.log('Done. workflowid =', id);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
