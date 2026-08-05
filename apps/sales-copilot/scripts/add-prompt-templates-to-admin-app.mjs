/*!
 * Surface the prompt-template table in the Sales Copilot Admin Center model-driven
 * app, so prompts are maintained in a normal Dataverse form instead of code.
 *
 * Adds the table as an app component and gives it a sitemap entry. Idempotent.
 *
 *   DV_URL="https://<org>.crm.dynamics.com" \
 *   DV_TOKEN="$(az account get-access-token --resource https://<org>.crm.dynamics.com/ --query accessToken -o tsv)" \
 *   node scripts/add-prompt-templates-to-admin-app.mjs [--show]
 */
import { createDataverseClient, readEnv } from './dv-request.mjs';

const SHOW = process.argv.includes('--show');
const APP_UNIQUE_NAME = process.env.DV_ADMIN_APP || 'biz_SalesCopilotAdminCenter';
const ENTITY_LOGICAL = 'crf5c_prompttemplate';
/** The app's existing "Copilot" group — prompts belong next to the other AI config. */
const COPILOT_GROUP_ID = 'group_6e17de79';
const SUBAREA_ID = 'sc_prompttemplates';

const { url, token } = readEnv();
const dv = createDataverseClient({ url, token });

function must(res, what) {
  if (!res.ok) throw new Error(`${what} failed (${res.status}): ${res.text}`);
  return res.json;
}

const app = must(
  dv.get(
    `appmodules?$select=appmoduleid,appmoduleidunique,name&$filter=uniquename eq '${APP_UNIQUE_NAME}'`,
  ),
  'Read app module',
).value?.[0];
if (!app) throw new Error(`Model-driven app "${APP_UNIQUE_NAME}" not found.`);
console.log(`App: ${app.name} (${app.appmoduleid})`);

const components = must(
  dv.get(
    `appmodulecomponents?$select=objectid,componenttype&$filter=_appmoduleidunique_value eq ${app.appmoduleidunique}`,
  ),
  'Read app components',
).value;

const siteMapComponent = components.find((c) => c.componenttype === 62);
if (!siteMapComponent) throw new Error('App has no sitemap component.');

const siteMap = must(
  dv.get(`sitemaps(${siteMapComponent.objectid})?$select=sitemapid,sitemapxml`),
  'Read sitemap',
);

if (SHOW) {
  console.log(siteMap.sitemapxml);
  process.exit(0);
}

// 1. The table must be an app component before its sitemap entry resolves.
const entity = must(
  dv.get(`EntityDefinitions(LogicalName='${ENTITY_LOGICAL}')?$select=MetadataId,ObjectTypeCode`),
  'Read entity metadata',
);
const alreadyComponent = components.some(
  (c) => c.componenttype === 1 && c.objectid?.toLowerCase() === entity.MetadataId.toLowerCase(),
);
if (alreadyComponent) {
  console.log('• Table is already an app component.');
} else {
  must(
    dv.post('AddAppComponents', {
      AppId: app.appmoduleid,
      Components: [
        { '@odata.type': 'Microsoft.Dynamics.CRM.entity', entityid: entity.MetadataId },
      ],
    }),
    'AddAppComponents',
  );
  console.log('✓ Added the table as an app component.');
}

// 2. Sitemap entry, inside the existing Copilot group.
let xml = siteMap.sitemapxml;
if (xml.includes(`Id="${SUBAREA_ID}"`)) {
  console.log('• Sitemap already has the Prompt Templates entry.');
} else {
  const groupStart = xml.indexOf(`<Group Id="${COPILOT_GROUP_ID}"`);
  const anchor = groupStart >= 0 ? xml.indexOf('</Group>', groupStart) : xml.lastIndexOf('</Group>');
  if (anchor < 0) throw new Error('Unexpected sitemap shape: no </Group> to extend.');
  const subArea =
    `<SubArea Id="${SUBAREA_ID}" Icon="/_imgs/imagestrips/transparent_spacer.gif" ` +
    `Entity="${ENTITY_LOGICAL}" Client="All,Outlook,OutlookLaptopClient,OutlookWorkstationClient,Web" ` +
    `AvailableOffline="true" PassParams="false" Sku="All,OnPremise,Live,SPLA" />`;
  xml = xml.slice(0, anchor) + subArea + xml.slice(anchor);
  must(dv.patch(`sitemaps(${siteMap.sitemapid})`, { sitemapxml: xml }), 'Update sitemap');
  console.log('✓ Added the Prompt Templates entry to the Copilot group.');
}

// 3. Publish both so the change is live.
const publish = dv.post('PublishXml', {
  ParameterXml:
    `<importexportxml><appmodules><appmodule>${app.appmoduleid}</appmodule></appmodules>` +
    `<sitemaps><sitemap>${siteMap.sitemapid}</sitemap></sitemaps>` +
    `<entities><entity>${ENTITY_LOGICAL}</entity></entities></importexportxml>`,
});
console.log(publish.ok ? '✓ Published.' : `(publish returned ${publish.status}: ${publish.text})`);
console.log('Done.');
