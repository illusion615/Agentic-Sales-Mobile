/*!
 * Provision the prompt-template table (crf5c_prompttemplate) — the Dataverse
 * store behind the app's prompt registry (apps/sales-copilot/src/prompts).
 *
 * Rows are OVERRIDES, not the source of truth: the app ships every prompt in
 * its build and only replaces a body when a published row keeps the contract
 * (same key, same contract version, same response format, no invented
 * variable). Deleting or breaking a row can therefore never break the app.
 *
 * Organization-owned on purpose: prompts are configuration shared by everyone,
 * not per-user data.
 *
 * Idempotent: safe to re-run. Skips the table and any column that already exists.
 *
 *   DV_URL="https://<org>.crm.dynamics.com" \
 *   DV_TOKEN="$(az account get-access-token --resource https://<org>.crm.dynamics.com/ --query accessToken -o tsv)" \
 *   node scripts/provision-prompt-template-table.mjs
 */
import { createDataverseClient, readEnv } from './dv-request.mjs';

const { url, token } = readEnv();
const SOLUTION = process.env.DV_SOLUTION || 'Cr6e9a2'; // crf5c publisher's unmanaged solution (create context)
const APP_SOLUTION = process.env.DV_APP_SOLUTION || 'AgenticSalesMobileSolution';
const dv = createDataverseClient({ url, token, solution: SOLUTION });

const ENTITY_SCHEMA = 'crf5c_PromptTemplate';
const ENTITY_LOGICAL = 'crf5c_prompttemplate';

const label = (text) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.Label',
  LocalizedLabels: [
    { '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 },
  ],
});

const strAttr = (schema, display, maxLength, description) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
  SchemaName: schema,
  RequiredLevel: { Value: 'None' },
  MaxLength: maxLength,
  FormatName: { Value: 'Text' },
  DisplayName: label(display),
  ...(description ? { Description: label(description) } : {}),
});

const memoAttr = (schema, display, description) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
  SchemaName: schema,
  RequiredLevel: { Value: 'None' },
  MaxLength: 100000,
  DisplayName: label(display),
  ...(description ? { Description: label(description) } : {}),
});

const intAttr = (schema, display, description) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
  SchemaName: schema,
  RequiredLevel: { Value: 'None' },
  Format: 'None',
  MinValue: 0,
  MaxValue: 1000000,
  DisplayName: label(display),
  ...(description ? { Description: label(description) } : {}),
});

// Two Options rather than a Choice: its values are fixed 0/1, so nothing depends
// on the publisher's option-value prefix, and it renders as a clean toggle.
const boolAttr = (schema, display, description) => ({
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

// The primary name column crf5c_name holds the prompt KEY and is created with
// the table, so it is not repeated here.
const COLUMNS = [
  memoAttr('crf5c_Body', 'Body', 'The prompt text. Placeholders use {{name}} and must be one of the listed variables.'),
  intAttr('crf5c_ContractVersion', 'Contract Version', 'Must match the version this app build parses, or the row is ignored.'),
  strAttr('crf5c_ResponseFormat', 'Response Format', 20, 'text | json | dag | json-generic. Must match the built-in declaration.'),
  strAttr('crf5c_Variables', 'Variables', 1000, 'Placeholders the app supplies to this prompt. Reference only.'),
  strAttr('crf5c_ModelTier', 'Model Tier', 20, 'Which model tier this prompt should run on.'),
  boolAttr('crf5c_IsPublished', 'Published', 'Only published rows are loaded by the app.'),
  intAttr('crf5c_PromptVersion', 'Version', 'Bump when you change the body, so a change is traceable.'),
  strAttr('crf5c_Description', 'Description', 400, 'What this prompt is for.'),
  memoAttr('crf5c_Notes', 'Notes', 'Why the body was last changed.'),
];

function createTable() {
  if (dv.exists(`EntityDefinitions(LogicalName='${ENTITY_LOGICAL}')`)) {
    console.log(`• Table ${ENTITY_LOGICAL} already exists — skipping table create.`);
    return;
  }
  const res = dv.post('EntityDefinitions', {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: ENTITY_SCHEMA,
    DisplayName: label('Prompt Template'),
    DisplayCollectionName: label('Prompt Templates'),
    Description: label('Editable overrides for the prompts the Sales Copilot sends to the model.'),
    OwnershipType: 'OrganizationOwned',
    IsActivity: false,
    HasActivities: false,
    HasNotes: false,
    Attributes: [
      {
        '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
        SchemaName: 'crf5c_Name',
        RequiredLevel: { Value: 'ApplicationRequired' },
        MaxLength: 100,
        FormatName: { Value: 'Text' },
        DisplayName: label('Key'),
        Description: label('Stable prompt key the app looks up, e.g. frame.classify.'),
        IsPrimaryName: true,
      },
    ],
  });
  if (!res.ok) throw new Error(`Create table failed (${res.status}): ${res.text}`);
  console.log(`✓ Created table ${ENTITY_LOGICAL}.`);
}

function createColumn(attr) {
  const logical = attr.SchemaName.toLowerCase();
  if (dv.exists(`EntityDefinitions(LogicalName='${ENTITY_LOGICAL}')/Attributes(LogicalName='${logical}')`)) {
    console.log(`  • ${logical} exists — skipping.`);
    return;
  }
  const res = dv.post(`EntityDefinitions(LogicalName='${ENTITY_LOGICAL}')/Attributes`, attr);
  if (!res.ok) throw new Error(`Create column ${logical} failed (${res.status}): ${res.text}`);
  console.log(`  ✓ ${logical}`);
}

function addToAppSolution() {
  const meta = dv.get(`EntityDefinitions(LogicalName='${ENTITY_LOGICAL}')?$select=MetadataId`);
  if (!meta.ok) {
    console.warn(`(could not read MetadataId: ${meta.status})`);
    return;
  }
  const res = dv.post('AddSolutionComponent', {
    ComponentId: meta.json.MetadataId,
    ComponentType: 1, // Entity
    SolutionUniqueName: APP_SOLUTION,
    AddRequiredComponents: false,
    DoNotIncludeSubcomponents: false,
  });
  if (!res.ok) console.warn(`(add-to-solution returned ${res.status}: ${res.text})`);
  else console.log(`✓ Added ${ENTITY_LOGICAL} to solution ${APP_SOLUTION}.`);
}

console.log(`Provisioning ${ENTITY_LOGICAL} into solution ${SOLUTION} …`);
createTable();
console.log('Columns:');
for (const attr of COLUMNS) createColumn(attr);
const published = dv.post('PublishXml', {
  ParameterXml: `<importexportxml><entities><entity>${ENTITY_LOGICAL}</entity></entities></importexportxml>`,
});
console.log(published.ok ? '✓ Published customizations.' : `(publish returned ${published.status})`);
addToAppSolution();
console.log('Done.');
