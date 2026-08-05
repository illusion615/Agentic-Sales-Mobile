/*!
 * Reconciles the admin app's navigation against a declared layout.
 *
 * Navigation grouping carries meaning: someone looking for AI tooling should
 * find all of it in one place, and the entry you use most should not be buried
 * under the ones you rarely open. Expressing that as data rather than as a
 * one-off move keeps it re-appliable — `pac model genpage upload
 * --add-to-sitemap` drops new pages into whichever group it meets first, so
 * this drifts every time a page is added.
 *
 * Each placement names a subarea by its Title or its Entity, the group it
 * belongs in, and whether it leads or trails that group. Anything not declared
 * is left exactly where it is.
 *
 * Idempotent: re-running when everything already matches reports no changes.
 *
 *   DV_URL="https://<org>.crm.dynamics.com" \
 *   DV_TOKEN="$(az account get-access-token --resource https://<org>.crm.dynamics.com/ --query accessToken -o tsv)" \
 *   node scripts/arrange-admin-sitemap.mjs [--show] [--dry-run]
 */
import { createDataverseClient, readEnv } from './dv-request.mjs';

const { url, token } = readEnv();
const APP_SOLUTION = process.env.DV_APP_SOLUTION || 'AgenticSalesMobileSolution';
const APP_ID = process.env.DV_APP_ID || '755e21a1-324d-f111-bec7-7ced8d3c7b0f';
const SHOW = process.argv.indexOf('--show') >= 0;
const DRY = process.argv.indexOf('--dry-run') >= 0;

const GROUPS = {
  business: 'group_363dd70b',
  copilot: 'group_6e17de79',
  quality: 'group_b6d33338',
  settings: 'group_c04dc082',
};

// Applied in order, so a later "first" ends up above an earlier one.
const PLACEMENTS = [
  { match: 'crf5c_aisummary', group: GROUPS.copilot, position: 'last' },
  { match: 'Prompt Studio', group: GROUPS.copilot, position: 'first' },
];

const dv = createDataverseClient({ url, token, solution: APP_SOLUTION });

function must(res, what) {
  if (!res.ok) throw new Error(`${what} failed (${res.status}): ${res.text}`);
  return res.json;
}

const app = must(dv.get(`appmodules(${APP_ID})?$select=appmoduleidunique,name`), 'Read app');
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

let xml = siteMap.sitemapxml;

if (SHOW) {
  console.log(xml);
  process.exit(0);
}

const SUBAREA_RE = /<SubArea\b[^>]*\/>|<SubArea\b[^>]*>[\s\S]*?<\/SubArea>/g;
const GROUP_RE = /<Group\b[^>]*>[\s\S]*?<\/Group>/g;

const attr = (fragment, name) => {
  const m = fragment.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : '';
};
const titleOf = (fragment) => {
  const m = fragment.match(/<Title\b[^>]*\bTitle="([^"]*)"/);
  return m ? m[1] : '';
};
const groupId = (g) => attr(g.match(/<Group\b[^>]*>/)[0], 'Id');

const findSubArea = (needle) =>
  (xml.match(SUBAREA_RE) || []).find(
    (s) => titleOf(s) === needle || attr(s, 'Entity') === needle,
  );

let changes = 0;

for (const placement of PLACEMENTS) {
  const subArea = findSubArea(placement.match);
  if (!subArea) {
    console.error(`✗ No subarea matches "${placement.match}" — skipping.`);
    continue;
  }

  const groups = xml.match(GROUP_RE) || [];
  const current = groups.find((g) => g.indexOf(subArea) >= 0);
  const target = groups.find((g) => groupId(g) === placement.group);
  if (!target) throw new Error(`Group ${placement.group} not found.`);

  const alreadyThere = current && groupId(current) === placement.group;
  if (alreadyThere) {
    const siblings = target.match(SUBAREA_RE) || [];
    const index = siblings.indexOf(subArea);
    const wanted = placement.position === 'first' ? 0 : siblings.length - 1;
    if (index === wanted) {
      console.log(`• "${placement.match}" already ${placement.position} in ${placement.group}.`);
      continue;
    }
  }

  // Detach, then re-attach at the requested end of the target group.
  const detached = xml.replace(subArea, '');
  const freshTarget = (detached.match(GROUP_RE) || []).find((g) => groupId(g) === placement.group);
  let rebuilt;
  if (placement.position === 'first') {
    // Subareas must follow the group's <Titles> block.
    rebuilt = freshTarget.includes('</Titles>')
      ? freshTarget.replace('</Titles>', `</Titles>${subArea}`)
      : freshTarget.replace(/^(<Group\b[^>]*>)/, `$1${subArea}`);
  } else {
    rebuilt = freshTarget.replace(/<\/Group>\s*$/, `${subArea}</Group>`);
  }
  xml = detached.replace(freshTarget, rebuilt);
  changes += 1;
  console.log(
    `✓ "${placement.match}" → ${placement.group} (${placement.position})` +
      (current ? ` — was in ${groupId(current)}` : ''),
  );
}

const summary = (source) =>
  (source.match(GROUP_RE) || [])
    .map((g) => {
      const names = (g.match(SUBAREA_RE) || []).map((s) => titleOf(s) || attr(s, 'Entity'));
      return `  ${titleOf(g)}: ${names.join(', ')}`;
    })
    .join('\n');

console.log('\nResulting navigation:\n' + summary(xml));

if (!changes) {
  console.log('\nNothing to change.');
  process.exit(0);
}
if (DRY) {
  console.log('\n[dry run] Sitemap not written.');
  process.exit(0);
}

must(dv.patch(`sitemaps(${siteMap.sitemapid})`, { sitemapxml: xml }), 'Update sitemap');
const published = dv.post('PublishXml', {
  ParameterXml:
    `<importexportxml><sitemaps><sitemap>${siteMap.sitemapid}</sitemap></sitemaps>` +
    `<appmodules><appmodule>${APP_ID}</appmodule></appmodules></importexportxml>`,
});
if (!published.ok) throw new Error(`PublishXml failed (${published.status}): ${published.text}`);
console.log(`\n✓ Applied ${changes} change(s) and published.`);
