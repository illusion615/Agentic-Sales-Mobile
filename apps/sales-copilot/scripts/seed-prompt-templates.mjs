/*!
 * Seed / re-sync the prompt-template table from the app's built-in catalog.
 *
 * The built-in catalog (src/prompts) stays the source of truth for CONTRACT —
 * which prompts exist, what variables they take, what they return. This script
 * pushes that contract into Dataverse so a maintainer edits real prompts in a
 * form instead of a code file.
 *
 * Re-running is safe: contract fields are always refreshed, but an edited BODY
 * is never clobbered unless you pass --force-body. Rows are seeded Published,
 * so editing a body takes effect; unpublishing a row is the one-click rollback
 * to the shipped version.
 *
 *   DV_URL="https://<org>.crm.dynamics.com" \
 *   DV_TOKEN="$(az account get-access-token --resource https://<org>.crm.dynamics.com/ --query accessToken -o tsv)" \
 *   node scripts/seed-prompt-templates.mjs [--force-body] [--dry-run]
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDataverseClient, readEnv } from './dv-request.mjs';

const FORCE_BODY = process.argv.includes('--force-body');
const DRY_RUN = process.argv.includes('--dry-run');
/** Prompt keys are unique per app, so every read and write is scoped by it. */
const APP_ID = process.env.DV_PROMPT_APP || 'sales-copilot';

const { url, token } = readEnv();
const dv = createDataverseClient({ url, token });
const SET = 'crf5c_prompttemplates';

/** The catalog is TypeScript; bundle it with the project's own Vite and import that. */
async function loadCatalog() {
  const dir = mkdtempSync(join(tmpdir(), 'prompt-seed-'));
  try {
    const { build } = await import('vite');
    await build({
      configFile: false,
      logLevel: 'error',
      // The shared runtime is source-direct, so it must be bundled in, not externalised.
      ssr: { noExternal: true },
      build: {
        ssr: 'src/prompts/index.ts',
        outDir: dir,
        emptyOutDir: false,
        minify: false,
        rollupOptions: { output: { entryFileNames: 'catalog.mjs' } },
      },
    });
    const mod = await import(pathToFileURL(join(dir, 'catalog.mjs')).href);
    return mod.salesPrompts.list();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function fetchExistingRows() {
  const res = dv.get(
    `${SET}?$select=crf5c_prompttemplateid,crf5c_name,crf5c_body,crf5c_promptversion&$filter=crf5c_app eq '${APP_ID}'&$top=500`,
  );
  if (!res.ok) throw new Error(`Read existing rows failed (${res.status}): ${res.text}`);
  return new Map(res.json.value.map((r) => [r.crf5c_name, r]));
}

const catalog = await loadCatalog();
const existing = fetchExistingRows();
console.log(`App: ${APP_ID}. Catalog: ${catalog.length} prompts. Table: ${existing.size} rows.`);

let created = 0;
let updated = 0;
let bodyKept = 0;

for (const prompt of catalog) {
  // Contract fields mirror the build and are refreshed every run.
  const contract = {
    crf5c_contractversion: prompt.contractVersion,
    crf5c_responseformat: prompt.responseFormat ?? 'text',
    crf5c_variables: prompt.variables.length ? prompt.variables.join(', ') : '(none)',
    crf5c_description: prompt.description ?? '',
    crf5c_modeltier: prompt.modelTier ?? 'standard',
  };
  const row = existing.get(prompt.key);

  if (!row) {
    if (DRY_RUN) {
      console.log(`+ ${prompt.key}`);
      created++;
      continue;
    }
    const res = dv.post(SET, {
      crf5c_name: prompt.key,
      crf5c_app: APP_ID,
      crf5c_body: prompt.body,
      crf5c_promptversion: 1,
      crf5c_ispublished: true,
      ...contract,
    });
    if (!res.ok) throw new Error(`Create ${prompt.key} failed (${res.status}): ${res.text}`);
    console.log(`+ ${prompt.key}`);
    created++;
    continue;
  }

  const bodyDiffers = row.crf5c_body !== prompt.body;
  const payload = { ...contract };
  if (bodyDiffers && FORCE_BODY) payload.crf5c_body = prompt.body;
  else if (bodyDiffers) bodyKept++;

  if (DRY_RUN) {
    console.log(`~ ${prompt.key}${bodyDiffers ? (FORCE_BODY ? ' (body reset)' : ' (body kept — edited in Dataverse)') : ''}`);
    updated++;
    continue;
  }
  const res = dv.patch(`${SET}(${row.crf5c_prompttemplateid})`, payload);
  if (!res.ok) throw new Error(`Update ${prompt.key} failed (${res.status}): ${res.text}`);
  console.log(`~ ${prompt.key}${bodyDiffers ? (FORCE_BODY ? ' (body reset)' : ' (body kept)') : ''}`);
  updated++;
}

const orphans = [...existing.keys()].filter((key) => !catalog.some((p) => p.key === key));
if (orphans.length) {
  console.log(`\n⚠ ${orphans.length} row(s) of ${APP_ID} have no matching built-in prompt and are ignored by the app:`);
  for (const key of orphans) console.log(`   ${key}`);
}

console.log(
  `\nDone. created=${created} updated=${updated}${bodyKept ? ` bodyKept=${bodyKept} (re-run with --force-body to reset)` : ''}${DRY_RUN ? ' [dry run]' : ''}`,
);
