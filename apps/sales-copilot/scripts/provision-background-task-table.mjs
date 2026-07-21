/*!
 * Provision the generic background-task table (crf5c_backgroundtask) used by the
 * long-running "fire-and-forget" task subsystem. See
 * docs/05-engineering/background-task-architecture-2026-07-20.md.
 *
 * Idempotent: safe to re-run. Skips the table and any column that already exists.
 *
 * Auth: this script does NOT handle secrets. Provide a Dataverse bearer token and
 * org URL via env vars (the token is minted by the caller, e.g. Azure CLI):
 *
 *   DV_URL="https://<org>.crm.dynamics.com" \
 *   DV_TOKEN="$(az account get-access-token --resource https://<org>.crm.dynamics.com/ --query accessToken -o tsv)" \
 *   node scripts/provision-background-task-table.mjs
 *
 * Requires Node 18+ (global fetch).
 */

const DV_URL = process.env.DV_URL?.replace(/\/$/, '');
const DV_TOKEN = process.env.DV_TOKEN;
const SOLUTION = process.env.DV_SOLUTION || 'Cr6e9a2'; // crf5c publisher's unmanaged solution (create context)
// The app's deployable solution — every new asset (table, flow, …) must be a
// member of this so it ships as one unit.
const APP_SOLUTION = process.env.DV_APP_SOLUTION || 'AgenticSalesMobileSolution';
const API = `${DV_URL}/api/data/v9.2`;

if (!DV_URL || !DV_TOKEN) {
  console.error('Missing DV_URL or DV_TOKEN env var. See header for usage.');
  process.exit(1);
}

const ENTITY_SCHEMA = 'crf5c_BackgroundTask';
const ENTITY_LOGICAL = 'crf5c_backgroundtask';

const headers = (extra = {}) => ({
  Authorization: `Bearer ${DV_TOKEN}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'OData-MaxVersion': '4.0',
  'OData-Version': '4.0',
  'MSCRM.SolutionUniqueName': SOLUTION,
  ...extra,
});

const label = (text) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.Label',
  LocalizedLabels: [
    { '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 },
  ],
});

const strAttr = (schema, display, maxLength) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
  SchemaName: schema,
  RequiredLevel: { Value: 'None' },
  MaxLength: maxLength,
  FormatName: { Value: 'Text' },
  DisplayName: label(display),
});

const memoAttr = (schema, display) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
  SchemaName: schema,
  RequiredLevel: { Value: 'None' },
  MaxLength: 100000,
  DisplayName: label(display),
});

const dateAttr = (schema, display) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
  SchemaName: schema,
  RequiredLevel: { Value: 'None' },
  Format: 'DateAndTime',
  DateTimeBehavior: { Value: 'UserLocal' },
  DisplayName: label(display),
});

// Custom columns (the primary name column crf5c_name is created with the table).
const COLUMNS = [
  strAttr('crf5c_TaskType', 'Task Type', 100),
  strAttr('crf5c_Status', 'Status', 20),
  strAttr('crf5c_TargetEntityType', 'Target Entity Type', 50),
  strAttr('crf5c_TargetEntityId', 'Target Entity Id', 100),
  strAttr('crf5c_TargetName', 'Target Name', 200),
  memoAttr('crf5c_RequestPayload', 'Request Payload'),
  strAttr('crf5c_ResultRef', 'Result Ref', 100),
  memoAttr('crf5c_ResultSummary', 'Result Summary'),
  memoAttr('crf5c_Error', 'Error'),
  dateAttr('crf5c_StartedOn', 'Started On'),
  dateAttr('crf5c_FinishedOn', 'Finished On'),
  dateAttr('crf5c_SeenOn', 'Seen On'),
];

async function exists(url) {
  const res = await fetch(url, { headers: headers() });
  return res.status === 200;
}

async function createTable() {
  if (await exists(`${API}/EntityDefinitions(LogicalName='${ENTITY_LOGICAL}')`)) {
    console.log(`• Table ${ENTITY_LOGICAL} already exists — skipping table create.`);
    return;
  }
  const body = {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: ENTITY_SCHEMA,
    DisplayName: label('Background Task'),
    DisplayCollectionName: label('Background Tasks'),
    Description: label('Generic long-running task queue for the fire-and-forget subsystem.'),
    OwnershipType: 'UserOwned',
    IsActivity: false,
    HasActivities: false,
    HasNotes: false,
    Attributes: [
      {
        '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
        SchemaName: 'crf5c_Name',
        RequiredLevel: { Value: 'ApplicationRequired' },
        MaxLength: 200,
        FormatName: { Value: 'Text' },
        DisplayName: label('Name'),
        IsPrimaryName: true,
      },
    ],
  };
  const res = await fetch(`${API}/EntityDefinitions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Create table failed (${res.status}): ${await res.text()}`);
  }
  console.log(`✓ Created table ${ENTITY_LOGICAL}.`);
}

async function createColumn(attr) {
  const logical = attr.SchemaName.toLowerCase();
  const url = `${API}/EntityDefinitions(LogicalName='${ENTITY_LOGICAL}')/Attributes(LogicalName='${logical}')`;
  if (await exists(url)) {
    console.log(`  • ${logical} exists — skipping.`);
    return;
  }
  const res = await fetch(`${API}/EntityDefinitions(LogicalName='${ENTITY_LOGICAL}')/Attributes`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(attr),
  });
  if (!res.ok) {
    throw new Error(`Create column ${logical} failed (${res.status}): ${await res.text()}`);
  }
  console.log(`  ✓ ${logical}`);
}

async function publish() {
  const res = await fetch(`${API}/PublishAllXml`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    console.warn(`(publish returned ${res.status}: ${await res.text()})`);
  } else {
    console.log('✓ Published customizations.');
  }
}

// Ensure the table is a member of the app's deployable solution so it ships as
// one unit (AddSolutionComponent is idempotent — re-adding is a no-op).
async function addToAppSolution() {
  const meta = await fetch(`${API}/EntityDefinitions(LogicalName='${ENTITY_LOGICAL}')?$select=MetadataId`, {
    headers: headers(),
  });
  if (!meta.ok) {
    console.warn(`(could not read MetadataId: ${meta.status})`);
    return;
  }
  const { MetadataId } = await meta.json();
  const res = await fetch(`${API}/AddSolutionComponent`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      ComponentId: MetadataId,
      ComponentType: 1, // Entity
      SolutionUniqueName: APP_SOLUTION,
      AddRequiredComponents: false,
      DoNotIncludeSubcomponents: false,
    }),
  });
  if (!res.ok) {
    console.warn(`(add-to-solution returned ${res.status}: ${await res.text()})`);
  } else {
    console.log(`✓ Added ${ENTITY_LOGICAL} to solution ${APP_SOLUTION}.`);
  }
}

(async () => {
  console.log(`Provisioning ${ENTITY_LOGICAL} into solution ${SOLUTION} …`);
  await createTable();
  console.log('Columns:');
  for (const attr of COLUMNS) {
    // Metadata writes must be sequential — parallel POSTs to Attributes race.
    // eslint-disable-next-line no-await-in-loop
    await createColumn(attr);
  }
  await publish();
  await addToAppSolution();
  console.log('Done.');
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
