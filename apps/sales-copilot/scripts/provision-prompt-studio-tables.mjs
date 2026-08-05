/*!
 * Provision the two tables the Prompt Studio needs on top of crf5c_prompttemplate:
 *
 *   crf5c_promptrevision — every saved body, so a change is diffable and reversible.
 *   crf5c_promptrun      — work queued by the Studio (replay, suggest, eval) and
 *                          completed by its runner flow.
 *
 * Real traffic is read from Microsoft's msdyn_aievent table; duplicating one row per
 * call here would add cost and create two sources of truth.
 *
 * Idempotent: safe to re-run.
 *
 *   DV_URL="https://<org>.crm.dynamics.com" \
 *   DV_TOKEN="$(az account get-access-token --resource https://<org>.crm.dynamics.com/ --query accessToken -o tsv)" \
 *   node scripts/provision-prompt-studio-tables.mjs
 */
import { createDataverseClient, readEnv } from './dv-request.mjs';

const { url, token } = readEnv();
const SOLUTION = process.env.DV_SOLUTION || 'Cr6e9a2';
const APP_SOLUTION = process.env.DV_APP_SOLUTION || 'AgenticSalesMobileSolution';
const dv = createDataverseClient({ url, token, solution: SOLUTION });

const label = (text) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.Label',
  LocalizedLabels: [
    { '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 },
  ],
});

const str = (schema, display, maxLength = 200, description) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
  SchemaName: schema,
  RequiredLevel: { Value: 'None' },
  MaxLength: maxLength,
  FormatName: { Value: 'Text' },
  DisplayName: label(display),
  ...(description ? { Description: label(description) } : {}),
});

const memo = (schema, display, description) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
  SchemaName: schema,
  RequiredLevel: { Value: 'None' },
  MaxLength: 100000,
  DisplayName: label(display),
  ...(description ? { Description: label(description) } : {}),
});

const int = (schema, display, description) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
  SchemaName: schema,
  RequiredLevel: { Value: 'None' },
  Format: 'None',
  MinValue: -1,
  MaxValue: 100000000,
  DisplayName: label(display),
  ...(description ? { Description: label(description) } : {}),
});

const bool = (schema, display, description) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
  SchemaName: schema,
  RequiredLevel: { Value: 'None' },
  DisplayName: label(display),
  ...(description ? { Description: label(description) } : {}),
  DefaultValue: false,
  OptionSet: {
    '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
    TrueOption: { Value: 1, Label: label('Yes') },
    FalseOption: { Value: 0, Label: label('No') },
  },
});

const TABLES = [
  {
    schema: 'crf5c_PromptRevision',
    logical: 'crf5c_promptrevision',
    display: 'Prompt Revision',
    plural: 'Prompt Revisions',
    description: 'Immutable snapshot of a prompt body, written every time it is saved.',
    primary: { schema: 'crf5c_Name', display: 'Revision', maxLength: 150 },
    columns: [
      str('crf5c_PromptKey', 'Prompt Key', 100),
      int('crf5c_PromptVersion', 'Version'),
      memo('crf5c_Body', 'Body'),
      memo('crf5c_Notes', 'Notes'),
      str('crf5c_Author', 'Author', 150),
      bool('crf5c_IsCurrent', 'Is Current', 'Marks the revision that matches the live body.'),
    ],
  },
  {
    schema: 'crf5c_PromptRun',
    logical: 'crf5c_promptrun',
    display: 'Prompt Run',
    plural: 'Prompt Runs',
    description: 'A replay, suggestion or evaluation job started from Prompt Studio.',
    primary: { schema: 'crf5c_Name', display: 'Run', maxLength: 200 },
    columns: [
      str('crf5c_PromptKey', 'Prompt Key', 100),
      int('crf5c_PromptVersion', 'Prompt Version'),
      str('crf5c_Source', 'Source', 20, 'replay | suggest | eval'),
      str('crf5c_Status', 'Status', 20, 'queued | running | succeeded | failed'),
      str('crf5c_Label', 'Call Site', 80),
      memo('crf5c_Variables', 'Variables', 'JSON map of the values used by this Studio job.'),
      memo('crf5c_RenderedPrompt', 'Rendered Prompt', 'The full prompt sent by this Studio job.'),
      memo('crf5c_CandidateBody', 'Candidate Body', 'The body under test.'),
      memo('crf5c_Output', 'Output'),
      memo('crf5c_Error', 'Error'),
      str('crf5c_BaselineRunId', 'Baseline Run', 60, 'The AI Event this replay is compared against.'),
      str('crf5c_TraceId', 'Trace Id', 60),
    ],
  },
];

function createTable(table) {
  if (dv.exists(`EntityDefinitions(LogicalName='${table.logical}')`)) {
    console.log(`• ${table.logical} exists — skipping table create.`);
    return;
  }
  const res = dv.post('EntityDefinitions', {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: table.schema,
    DisplayName: label(table.display),
    DisplayCollectionName: label(table.plural),
    Description: label(table.description),
    OwnershipType: 'OrganizationOwned',
    IsActivity: false,
    HasActivities: false,
    HasNotes: false,
    Attributes: [
      {
        '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
        SchemaName: table.primary.schema,
        RequiredLevel: { Value: 'ApplicationRequired' },
        MaxLength: table.primary.maxLength,
        FormatName: { Value: 'Text' },
        DisplayName: label(table.primary.display),
        IsPrimaryName: true,
      },
    ],
  });
  if (!res.ok) throw new Error(`Create ${table.logical} failed (${res.status}): ${res.text}`);
  console.log(`✓ Created ${table.logical}.`);
}

function createColumn(table, attr) {
  const logical = attr.SchemaName.toLowerCase();
  if (dv.exists(`EntityDefinitions(LogicalName='${table.logical}')/Attributes(LogicalName='${logical}')`)) {
    console.log(`  • ${logical} exists — skipping.`);
    return;
  }
  const res = dv.post(`EntityDefinitions(LogicalName='${table.logical}')/Attributes`, attr);
  if (!res.ok) throw new Error(`Create ${logical} failed (${res.status}): ${res.text}`);
  console.log(`  ✓ ${logical}`);
}

function addToSolution(table) {
  const meta = dv.get(`EntityDefinitions(LogicalName='${table.logical}')?$select=MetadataId`);
  if (!meta.ok) return;
  const res = dv.post('AddSolutionComponent', {
    ComponentId: meta.json.MetadataId,
    ComponentType: 1,
    SolutionUniqueName: APP_SOLUTION,
    AddRequiredComponents: false,
    DoNotIncludeSubcomponents: false,
  });
  console.log(res.ok ? `✓ ${table.logical} → ${APP_SOLUTION}` : `(add-to-solution ${res.status})`);
}

for (const table of TABLES) {
  console.log(`\n${table.logical}`);
  createTable(table);
  for (const attr of table.columns) createColumn(table, attr);
}

// Scoped publish — an org-wide PublishAllXml regularly exceeds the request timeout.
const published = dv.post('PublishXml', {
  ParameterXml:
    '<importexportxml><entities>' +
    TABLES.map((t) => `<entity>${t.logical}</entity>`).join('') +
    '</entities></importexportxml>',
});
console.log(published.ok ? '\n✓ Published customizations.' : `\n(publish ${published.status})`);
for (const table of TABLES) addToSolution(table);
console.log('Done.');
