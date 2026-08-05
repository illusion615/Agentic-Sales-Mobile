/*!
 * Provision the "Prompt Studio - Runner" cloud flow.
 *
 * The Prompt Studio queues work by creating a crf5c_promptrun row with
 * status = 'queued' and the fully rendered prompt text. This flow picks it up,
 * invokes the AI Builder prompt, and writes the raw payload back onto the row.
 * The page polls the row and diffs the result against the baseline run.
 *
 * The rendering happens in the page, not here: the page already owns the
 * {{variable}} substitution, and expressing it in flow expressions would be a
 * second, divergent implementation of the same contract.
 *
 * The output is stored RAW. The AI Builder custom API wraps its answer
 * differently depending on the call path, so the page normalizes it with the
 * same unwrap logic the app uses rather than the flow guessing a shape.
 *
 * Idempotent: delete-and-recreate (patching an activated flow in place does not
 * re-register the Dataverse webhook — it silently stops firing).
 *
 *   DV_URL="https://<org>.crm.dynamics.com" \
 *   DV_TOKEN="$(az account get-access-token --resource https://<org>.crm.dynamics.com/ --query accessToken -o tsv)" \
 *   node scripts/provision-prompt-studio-flow.mjs
 */
import { createDataverseClient, readEnv } from './dv-request.mjs';

const { url, token } = readEnv();
const APP_SOLUTION = process.env.DV_APP_SOLUTION || 'AgenticSalesMobileSolution';
const dv = createDataverseClient({ url, token, solution: APP_SOLUTION });

// Environment-specific ids (same connection reference the cost flow uses).
const DATAVERSE_CONN_REF =
  'cua_agent_fbY2k.shared_commondataserviceforapps.shared-commondataser-694d88f9-8f3f-4c2f-81f4-64489a1b8721';
// The app's text prompt custom API. Environment-specific, like every AI Builder
// prompt id — see src/services/prompt-resolver.ts for the runtime equivalent.
const PROMPT_ACTION = 'msdyn_aibdptcustomprompt104e526adeab4292bf186b6180dfd75c';
const FLOW_NAME = 'Prompt Studio - Runner';

const connector = (operationId) => ({
  connectionName: 'shared_commondataserviceforapps',
  operationId,
  apiId: '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps',
});

const definition = {
  $schema:
    'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
  contentVersion: '1.0.0.0',
  parameters: {
    $connections: { defaultValue: {}, type: 'Object' },
    $authentication: { defaultValue: {}, type: 'SecureObject' },
  },
  triggers: {
    When_a_run_is_queued: {
      type: 'OpenApiConnectionWebhook',
      inputs: {
        host: connector('SubscribeWebhookTrigger'),
        parameters: {
          'subscriptionRequest/message': 1,
          'subscriptionRequest/entityname': 'crf5c_promptrun',
          'subscriptionRequest/scope': 4,
        },
        authentication: "@parameters('$authentication')",
      },
      conditions: [
        {
          expression:
            "@and(equals(coalesce(triggerOutputs()?['body/crf5c_status'], ''), 'queued'), greater(length(coalesce(triggerOutputs()?['body/crf5c_renderedprompt'], '')), 0))",
        },
      ],
    },
  },
  actions: {
    Set_Running: {
      runAfter: {},
      type: 'OpenApiConnection',
      inputs: {
        host: connector('UpdateRecord'),
        parameters: {
          entityName: 'crf5c_promptruns',
          recordId: "@triggerOutputs()?['body/crf5c_promptrunid']",
          'item/crf5c_status': 'running',
        },
        authentication: "@parameters('$authentication')",
      },
    },
    Run_Prompt: {
      runAfter: { Set_Running: ['Succeeded'] },
      type: 'OpenApiConnection',
      inputs: {
        host: connector('PerformUnboundAction'),
        parameters: {
          actionName: PROMPT_ACTION,
          'item/prompt_20text': "@triggerOutputs()?['body/crf5c_renderedprompt']",
        },
        authentication: "@parameters('$authentication')",
      },
    },
    Set_Succeeded: {
      runAfter: { Run_Prompt: ['Succeeded'] },
      type: 'OpenApiConnection',
      inputs: {
        host: connector('UpdateRecord'),
        parameters: {
          entityName: 'crf5c_promptruns',
          recordId: "@triggerOutputs()?['body/crf5c_promptrunid']",
          'item/crf5c_status': 'succeeded',
          'item/crf5c_output':
            "@substring(string(coalesce(outputs('Run_Prompt')?['body/ResponsePayload'], outputs('Run_Prompt')?['body'], '')), 0, min(length(string(coalesce(outputs('Run_Prompt')?['body/ResponsePayload'], outputs('Run_Prompt')?['body'], ''))), 90000))",
        },
        authentication: "@parameters('$authentication')",
      },
    },
    Set_Failed: {
      runAfter: { Run_Prompt: ['Failed', 'TimedOut', 'Skipped'] },
      type: 'OpenApiConnection',
      inputs: {
        host: connector('UpdateRecord'),
        parameters: {
          entityName: 'crf5c_promptruns',
          recordId: "@triggerOutputs()?['body/crf5c_promptrunid']",
          'item/crf5c_status': 'failed',
          'item/crf5c_error':
            "@substring(string(coalesce(outputs('Run_Prompt')?['body'], 'Prompt invocation failed')), 0, min(length(string(coalesce(outputs('Run_Prompt')?['body'], 'Prompt invocation failed'))), 4000))",
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
    },
    definition,
  },
  schemaVersion: '1.0.0.0',
});

function must(res, what) {
  if (!res.ok) throw new Error(`${what} failed (${res.status}): ${res.text}`);
  return res.json;
}

console.log(`Provisioning flow "${FLOW_NAME}" …`);

const existing = must(
  dv.get(`workflows?$select=workflowid,statecode&$filter=category eq 5 and name eq '${FLOW_NAME}'`),
  'Query flow',
).value?.[0];

if (existing) {
  console.log(`• Exists (${existing.workflowid}) — deleting to recreate (patch-in-place breaks the webhook).`);
  if (existing.statecode === 1) {
    dv.patch(`workflows(${existing.workflowid})`, { statecode: 0, statuscode: 1 });
  }
  const del = dv.del(`workflows(${existing.workflowid})`);
  if (!del.ok && del.status !== 404) throw new Error(`Delete failed (${del.status}): ${del.text}`);
}

const created = must(
  dv.request(
    'POST',
    'workflows',
    {
      category: 5,
      type: 1,
      name: FLOW_NAME,
      description: 'Executes queued Prompt Studio replay and suggestion runs.',
      primaryentity: 'none',
      statecode: 0,
      statuscode: 1,
      clientdata,
    },
    { Prefer: 'return=representation' },
  ),
  'Create flow',
);
console.log(`✓ Created (${created.workflowid}).`);

const activated = dv.patch(`workflows(${created.workflowid})`, { statecode: 1, statuscode: 2 });
console.log(activated.ok ? '✓ Activated.' : `(activate ${activated.status}: ${activated.text})`);

const added = dv.post('AddSolutionComponent', {
  ComponentId: created.workflowid,
  ComponentType: 29,
  SolutionUniqueName: APP_SOLUTION,
  AddRequiredComponents: false,
});
console.log(added.ok ? `✓ Added to ${APP_SOLUTION}.` : `(add-to-solution ${added.status})`);
console.log('Done. workflowid =', created.workflowid);
