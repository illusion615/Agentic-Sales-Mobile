/*!
 * Provision crf5c_promptcase — the graded case set behind prompt accuracy.
 *
 * A replay tells you the output CHANGED; it cannot tell you the output got
 * BETTER. Judging that needs three things a diff does not have: a ground truth,
 * a SET of cases (one case is noise), and an automatic verdict. This table
 * holds the first two.
 *
 * crf5c_checktype selects how a case is graded, and the ordering is deliberate:
 *   json    — assert JSON fields equal expected values (exact, free, instant)
 *   regex   — the output must match a pattern
 *   contains— every expectation line must appear in the output
 *   judge   — an LLM grades against a rubric
 * Prefer the deterministic modes. Asking a model whether a JSON field equals a
 * string is slower, dearer and less reliable than comparing it.
 *
 * Cases are grown from REAL runs rather than invented, so the set reflects
 * traffic the prompt actually has to survive.
 *
 * Idempotent: safe to re-run.
 *
 *   DV_URL="https://<org>.crm.dynamics.com" \
 *   DV_TOKEN="$(az account get-access-token --resource https://<org>.crm.dynamics.com/ --query accessToken -o tsv)" \
 *   node scripts/provision-prompt-case-table.mjs
 */
import { createDataverseClient, readEnv } from './dv-request.mjs';

const { url, token } = readEnv();
const SOLUTION = process.env.DV_SOLUTION || 'Cr6e9a2';
const APP_SOLUTION = process.env.DV_APP_SOLUTION || 'AgenticSalesMobileSolution';
const dv = createDataverseClient({ url, token, solution: SOLUTION });

const TABLE = 'crf5c_promptcase';
const SET = 'crf5c_promptcases';

const label = (text) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.Label',
  LocalizedLabels: [
    { '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 },
  ],
});

const text = (schema, display, description, maxLength = 200) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
  SchemaName: schema,
  RequiredLevel: { Value: 'None' },
  MaxLength: maxLength,
  FormatName: { Value: 'Text' },
  DisplayName: label(display),
  Description: label(description),
});

const memo = (schema, display, description) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
  SchemaName: schema,
  RequiredLevel: { Value: 'None' },
  MaxLength: 100000,
  Format: 'TextArea',
  DisplayName: label(display),
  Description: label(description),
});

if (!dv.exists(`EntityDefinitions(LogicalName='${TABLE}')`)) {
  const entity = {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: 'crf5c_PromptCase',
    LogicalName: TABLE,
    DisplayName: label('Prompt Case'),
    DisplayCollectionName: label('Prompt Cases'),
    Description: label('A graded example used to measure whether a prompt answers correctly.'),
    OwnershipType: 'OrganizationOwned',
    IsActivity: false,
    HasNotes: false,
    HasActivities: false,
    Attributes: [
      {
        '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
        SchemaName: 'crf5c_Name',
        RequiredLevel: { Value: 'ApplicationRequired' },
        MaxLength: 200,
        FormatName: { Value: 'Text' },
        DisplayName: label('Case'),
        Description: label('Short description of what this case checks.'),
        IsPrimaryName: true,
      },
    ],
  };
  const res = dv.post('EntityDefinitions', entity);
  if (!res.ok) throw new Error(`Create table failed (${res.status}): ${res.text}`);
  console.log(`✓ Created ${TABLE}.`);
} else {
  console.log(`• ${TABLE} exists — skipping create.`);
}

const COLUMNS = [
  text('crf5c_App', 'App', 'Which application owns the prompt under test.', 60),
  text('crf5c_PromptKey', 'Prompt Key', 'The catalogued prompt this case grades.', 100),
  memo('crf5c_Variables', 'Variables', 'JSON of the inputs the prompt is rendered with, in the same shape a recorded run stores.'),
  memo('crf5c_Expectation', 'Expectation', 'The ground truth, interpreted according to the check type.'),
  text('crf5c_CheckType', 'Check Type', 'json | regex | contains | judge. Prefer deterministic modes over the judge.', 20),
  memo('crf5c_Notes', 'Notes', 'Why this case exists — usually the real failure that motivated it.'),
  {
    '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
    SchemaName: 'crf5c_Enabled',
    RequiredLevel: { Value: 'None' },
    DisplayName: label('Enabled'),
    Description: label('Disabled cases stay on record but are skipped when scoring.'),
    DefaultValue: true,
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
      TrueOption: { Value: 1, Label: label('Yes') },
      FalseOption: { Value: 0, Label: label('No') },
    },
  },
];

for (const column of COLUMNS) {
  const logical = column.SchemaName.toLowerCase();
  if (dv.exists(`EntityDefinitions(LogicalName='${TABLE}')/Attributes(LogicalName='${logical}')`)) {
    console.log(`• ${logical} exists — skipping.`);
    continue;
  }
  const res = dv.post(`EntityDefinitions(LogicalName='${TABLE}')/Attributes`, column);
  if (!res.ok) throw new Error(`Create ${logical} failed (${res.status}): ${res.text}`);
  console.log(`✓ ${logical}`);
}

const published = dv.post('PublishXml', {
  ParameterXml: `<importexportxml><entities><entity>${TABLE}</entity></entities></importexportxml>`,
});
if (!published.ok) throw new Error(`PublishXml failed (${published.status}): ${published.text}`);
console.log('✓ Published.');

const added = dv.post('AddSolutionComponent', {
  ComponentId: dv.get(`EntityDefinitions(LogicalName='${TABLE}')?$select=MetadataId`).json.MetadataId,
  ComponentType: 1,
  SolutionUniqueName: APP_SOLUTION,
  AddRequiredComponents: false,
});
console.log(added.ok ? `✓ ${TABLE} → ${APP_SOLUTION}` : `(add-to-solution ${added.status}: ${added.text})`);
console.log(`Done. entitySet = ${SET}`);
