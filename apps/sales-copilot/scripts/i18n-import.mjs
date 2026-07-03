/**
 * i18n review IMPORT — merge proofread Excel workbooks back into the JSON dicts.
 *
 * Usage:  node scripts/i18n-import.mjs
 * Reads:  i18n-review/review-<locale>.xlsx  (whatever files are present)
 * Writes: src/locales/<locale>.json  (values only; keys never change)
 *
 * Safety: a cell is applied ONLY when it is non-empty AND its {placeholders}
 * exactly match the English source. Anything else is reported and skipped so a
 * broken string never reaches the app.
 */
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES_DIR = path.join(ROOT, 'src/locales');
const REVIEW_DIR = path.join(ROOT, 'i18n-review');
const TARGET_LANGS = ['de-DE', 'fr-FR', 'es-ES'];

const phSet = (s) => [...new Set(String(s).match(/\{[^}]+\}/g) || [])].sort();
const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const en = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en-US.json'), 'utf8'));

/** Find a 1-based column index whose header contains any of the needles (case-insensitive). */
function findCol(headerRow, needles) {
  for (let c = 1; c <= headerRow.cellCount; c++) {
    const v = String(headerRow.getCell(c).value ?? '').toLowerCase();
    if (needles.some((n) => v.includes(n))) return c;
  }
  return -1;
}

let grandWarnings = 0;

for (const loc of TARGET_LANGS) {
  const file = path.join(REVIEW_DIR, `review-${loc}.xlsx`);
  if (!fs.existsSync(file)) { console.log(`– ${loc}: no review file, skipped`); continue; }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet(loc) || wb.worksheets[0];
  const head = ws.getRow(1);
  const keyCol = findCol(head, ['key']);
  const tgtCol = findCol(head, ['edit here', loc.toLowerCase(), 'german', 'french', 'spanish', 'deutsch', 'français', 'español']);
  if (keyCol < 0 || tgtCol < 0) { console.log(`✗ ${loc}: could not locate Key/translation columns — skipped`); grandWarnings++; continue; }

  const dictPath = path.join(LOCALES_DIR, `${loc}.json`);
  const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));

  let applied = 0, emptySkip = 0, phSkip = 0, unknown = 0, unchanged = 0;
  const issues = [];

  ws.eachRow((row, n) => {
    if (n === 1) return;
    const key = String(row.getCell(keyCol).value ?? '').trim();
    if (!key) return;
    if (!(key in en)) { unknown++; issues.push(`unknown key: ${key}`); return; }
    const raw = row.getCell(tgtCol).value;
    const val = (raw && typeof raw === 'object' && 'richText' in raw)
      ? raw.richText.map((t) => t.text).join('')
      : String(raw ?? '');
    const next = val.trim();
    if (!next) { emptySkip++; return; }
    if (!eq(phSet(en[key]), phSet(next))) {
      phSkip++;
      issues.push(`placeholder mismatch [${key}]: source=${phSet(en[key]).join(',') || '∅'} vs edited=${phSet(next).join(',') || '∅'}`);
      return;
    }
    // Edge whitespace (leading/trailing spaces) is canonical from the English
    // source — e.g. "Generated " keeps its trailing space even if Excel or the
    // reviewer trims it. The reviewer only controls the words in between.
    const lead = (en[key].match(/^\s+/) || [''])[0];
    const trail = (en[key].match(/\s+$/) || [''])[0];
    const finalVal = lead + next + trail;
    if (dict[key] !== finalVal) { dict[key] = finalVal; applied++; } else { unchanged++; }
  });

  fs.writeFileSync(dictPath, JSON.stringify(dict, null, 2) + '\n');
  console.log(`✓ ${loc}: applied ${applied}, unchanged ${unchanged}, empty ${emptySkip}, placeholder-skip ${phSkip}, unknown ${unknown}`);
  issues.slice(0, 20).forEach((m) => console.log(`    ⚠ ${m}`));
  if (issues.length > 20) console.log(`    … and ${issues.length - 20} more`);
  grandWarnings += phSkip + unknown;
}

// Consistency check: every locale must have the identical key set.
const locales = ['zh-Hans', 'en-US', ...TARGET_LANGS];
const keysOf = (l) => Object.keys(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${l}.json`), 'utf8')));
const base = keysOf('zh-Hans');
let mismatch = false;
for (const l of locales) {
  const k = keysOf(l);
  const miss = base.filter((x) => !k.includes(x));
  const extra = k.filter((x) => !base.includes(x));
  if (miss.length || extra.length) { mismatch = true; console.log(`✗ ${l}: missing ${miss.length}, extra ${extra.length}`); }
}
console.log(mismatch ? '\n✗ KEY SET MISMATCH — fix before building.' : `\n✓ All ${locales.length} locales key-aligned (${base.length} keys).`);
console.log(grandWarnings ? `\n⚠ ${grandWarnings} issue(s) above were skipped — review and re-run if needed.` : '✓ No skipped cells.');
console.log('\nNext: pnpm build, then test.');
