/*!
 * Lay out the prompt-template form and view so the table is actually usable in
 * the admin app: the body gets a full-height editor, contract fields are shown
 * read-only (editing them can only get the row rejected), and the list shows
 * publish state at a glance.
 *
 * Idempotent — it rewrites the main form and the default view every run.
 *
 *   DV_URL="https://<org>.crm.dynamics.com" \
 *   DV_TOKEN="$(az account get-access-token --resource https://<org>.crm.dynamics.com/ --query accessToken -o tsv)" \
 *   node scripts/configure-prompt-template-ui.mjs
 */
import { randomUUID } from 'node:crypto';
import { createDataverseClient, readEnv } from './dv-request.mjs';

const ENTITY_LOGICAL = 'crf5c_prompttemplate';
const { url, token } = readEnv();
const dv = createDataverseClient({ url, token });

const TEXT = '{4273EDBD-AC1D-40d3-9FB2-095C621B552D}';
const MEMO = '{E0DECE4B-6FC8-4a8f-A065-082708572369}';
const CHECKBOX = '{B0C6723A-8503-4fd7-BB28-C8A06AC933C2}';

function must(res, what) {
  if (!res.ok) throw new Error(`${what} failed (${res.status}): ${res.text}`);
  return res.json;
}

const guid = () => `{${randomUUID().toUpperCase()}}`;

// `datafieldname` must be the lowercase LOGICAL name. Schema-cased names are
// accepted by the API but the control is silently dropped at render time —
// the section then shows with nothing in it.
const cell = (field, label, classid, { disabled = false, rowspan } = {}) =>
  `<cell id="${guid()}"${rowspan ? ` rowspan="${rowspan}"` : ''}>` +
  `<labels><label description="${label}" languagecode="1033" /></labels>` +
  `<control id="${field}" classid="${classid}" datafieldname="${field}"` +
  `${disabled ? ' disabled="true"' : ''} /></cell>`;

const row = (inner) => `<row>${inner}</row>`;

const section = (title, showLabel, rows) =>
  `<section showlabel="${showLabel}" showbar="false" IsUserDefined="0" id="${guid()}">` +
  `<labels><label description="${title}" languagecode="1033" /></labels>` +
  `<rows>${rows}</rows></section>`;

const formXml =
  '<form><tabs>' +
  `<tab verticallayout="true" id="${guid()}" IsUserDefined="1">` +
  '<labels><label description="General" languagecode="1033" /></labels>' +
  '<columns><column width="100%"><sections>' +
  section(
    'Prompt',
    'false',
    [
      row(cell('crf5c_name', 'Key', TEXT)),
      row(cell('crf5c_app', 'App', TEXT, { disabled: true })),
      row(cell('crf5c_description', 'Description', TEXT)),
      row(cell('crf5c_ispublished', 'Published', CHECKBOX)),
      row(cell('crf5c_modeltier', 'Model Tier', TEXT)),
      row(cell('crf5c_promptversion', 'Version', TEXT)),
    ].join(''),
  ) +
  section('Body', 'true', row(cell('crf5c_body', 'Body', MEMO, { rowspan: 20 }))) +
  section(
    'Contract (managed by the app build)',
    'true',
    [
      row(cell('crf5c_variables', 'Variables you can use', TEXT, { disabled: true })),
      row(cell('crf5c_responseformat', 'Response Format', TEXT, { disabled: true })),
      row(cell('crf5c_contractversion', 'Contract Version', TEXT, { disabled: true })),
    ].join(''),
  ) +
  section('Change log', 'true', row(cell('crf5c_notes', 'Notes', MEMO, { rowspan: 4 }))) +
  '</sections></column></columns></tab>' +
  '</tabs></form>';

const entity = must(
  dv.get(`EntityDefinitions(LogicalName='${ENTITY_LOGICAL}')?$select=ObjectTypeCode`),
  'Read entity metadata',
);

const forms = must(
  dv.get(
    `systemforms?$select=formid,name,type&$filter=objecttypecode eq '${ENTITY_LOGICAL}' and type eq 2`,
  ),
  'Read forms',
).value;
if (!forms.length) throw new Error('No main form found for the table.');

for (const form of forms) {
  must(dv.patch(`systemforms(${form.formid})`, { formxml: formXml }), `Update form ${form.name}`);
  console.log(`✓ Laid out main form "${form.name}".`);
}

const views = must(
  dv.get(
    `savedqueries?$select=savedqueryid,name,querytype&$filter=returnedtypecode eq '${ENTITY_LOGICAL}' and querytype eq 0`,
  ),
  'Read views',
).value;

const COLUMNS = [
  ['crf5c_app', 130],
  ['crf5c_name', 240],
  ['crf5c_ispublished', 100],
  ['crf5c_promptversion', 90],
  ['crf5c_modeltier', 110],
  ['crf5c_description', 320],
  ['modifiedon', 150],
];

const layoutXml =
  `<grid name="resultset" object="${entity.ObjectTypeCode}" jump="crf5c_name" select="1" icon="1" preview="1">` +
  `<row name="result" id="crf5c_prompttemplateid">` +
  COLUMNS.map(([name, width]) => `<cell name="${name}" width="${width}" />`).join('') +
  '</row></grid>';

/** Active/Inactive views differ only by their state filter, which must survive. */
const fetchXmlFor = (stateCode) =>
  '<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false">' +
  `<entity name="${ENTITY_LOGICAL}">` +
  COLUMNS.map(([name]) => `<attribute name="${name}" />`).join('') +
  '<attribute name="crf5c_prompttemplateid" />' +
  '<order attribute="crf5c_app" descending="false" />' +
  '<order attribute="crf5c_name" descending="false" />' +
  `<filter type="and"><condition attribute="statecode" operator="eq" value="${stateCode}" /></filter>` +
  '</entity></fetch>';

for (const view of views) {
  const stateCode = /inactive/i.test(view.name) ? 1 : 0;
  must(
    dv.patch(`savedqueries(${view.savedqueryid})`, {
      layoutxml: layoutXml,
      fetchxml: fetchXmlFor(stateCode),
    }),
    `Update view ${view.name}`,
  );
  console.log(`✓ Updated view "${view.name}" (statecode=${stateCode}).`);
}

const publish = dv.post('PublishXml', {
  ParameterXml: `<importexportxml><entities><entity>${ENTITY_LOGICAL}</entity></entities></importexportxml>`,
});
console.log(publish.ok ? '✓ Published.' : `(publish returned ${publish.status}: ${publish.text})`);
