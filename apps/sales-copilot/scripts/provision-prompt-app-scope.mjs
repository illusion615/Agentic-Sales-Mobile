/*!
 * Adds the app-scope column to the prompt tables and backfills existing rows.
 *
 * Prompt keys are unique PER APP, not globally: sales-copilot and field-service
 * both legitimately want a `frame.classify`. Without this dimension the shared
 * store silently merges them, and the maintenance UI becomes one mixed list.
 *
 * Existing rows predate the split and all belong to sales-copilot.
 *
 * Idempotent: safe to re-run.
 *
 *   DV_URL="https://<org>.crm.dynamics.com" \
 *   DV_TOKEN="$(az account get-access-token --resource https://<org>.crm.dynamics.com/ --query accessToken -o tsv)" \
 *   node scripts/provision-prompt-app-scope.mjs
 */
import { createDataverseClient, readEnv } from './dv-request.mjs';

const { url, token } = readEnv();
const SOLUTION = process.env.DV_SOLUTION || 'Cr6e9a2';
const BACKFILL_APP = process.env.DV_BACKFILL_APP || 'sales-copilot';
const dv = createDataverseClient({ url, token, solution: SOLUTION });

const TABLES = [
  { logical: 'crf5c_prompttemplate', set: 'crf5c_prompttemplates', pk: 'crf5c_prompttemplateid' },
  { logical: 'crf5c_promptrevision', set: 'crf5c_promptrevisions', pk: 'crf5c_promptrevisionid' },
  { logical: 'crf5c_promptrun', set: 'crf5c_promptruns', pk: 'crf5c_promptrunid' },
];

const label = (text) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.Label',
  LocalizedLabels: [
    { '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 },
  ],
});

const appColumn = {
  '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
  SchemaName: 'crf5c_App',
  RequiredLevel: { Value: 'None' },
  MaxLength: 60,
  FormatName: { Value: 'Text' },
  DisplayName: label('App'),
  Description: label('Which application owns this prompt, e.g. sales-copilot or field-service.'),
};

for (const table of TABLES) {
  const exists = dv.exists(
    `EntityDefinitions(LogicalName='${table.logical}')/Attributes(LogicalName='crf5c_app')`,
  );
  if (exists) {
    console.log(`• ${table.logical}.crf5c_app exists — skipping.`);
  } else {
    const res = dv.post(`EntityDefinitions(LogicalName='${table.logical}')/Attributes`, appColumn);
    if (!res.ok) throw new Error(`Create ${table.logical}.crf5c_app failed (${res.status}): ${res.text}`);
    console.log(`✓ ${table.logical}.crf5c_app`);
  }
}

const published = dv.post('PublishXml', {
  ParameterXml:
    '<importexportxml><entities>' +
    TABLES.map((t) => `<entity>${t.logical}</entity>`).join('') +
    '</entities></importexportxml>',
});
console.log(published.ok ? '✓ Published.' : `(publish ${published.status})`);

for (const table of TABLES) {
  const res = dv.get(`${table.set}?$select=${table.pk}&$filter=crf5c_app eq null&$top=5000`);
  if (!res.ok) {
    console.warn(`(could not read ${table.set}: ${res.status} ${res.text})`);
    continue;
  }
  const rows = res.json.value ?? [];
  let done = 0;
  for (const row of rows) {
    const patched = dv.patch(`${table.set}(${row[table.pk]})`, { crf5c_app: BACKFILL_APP });
    if (patched.ok) done += 1;
  }
  console.log(`✓ ${table.set}: stamped ${done}/${rows.length} unscoped row(s) as "${BACKFILL_APP}".`);
}

console.log('Done.');
