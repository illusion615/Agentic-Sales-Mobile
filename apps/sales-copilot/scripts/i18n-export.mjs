/**
 * i18n review EXPORT — generate one Excel workbook per target language for
 * non-technical business users to proofread machine-translated strings.
 *
 * Usage:  node scripts/i18n-export.mjs
 * Output: i18n-review/review-<locale>.xlsx  (e.g. review-de-DE.xlsx)
 *
 * Each workbook has source (English + 中文) reference columns LOCKED, the target
 * language column pre-filled and EDITABLE, a locked "Placeholders" column that
 * lists tokens like {name} that must be preserved, and an editable Notes column.
 * Re-import the edited files with scripts/i18n-import.mjs.
 */
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES_DIR = path.join(ROOT, 'src/locales');
const OUT_DIR = path.join(ROOT, 'i18n-review');

// Languages the customer's business users proofread (source langs are reference only).
const TARGET_LANGS = {
  'de-DE': 'German · Deutsch',
  'fr-FR': 'French · Français',
  'es-ES': 'Spanish · Español',
};

const read = (loc) => JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${loc}.json`), 'utf8'));
const placeholders = (s) => (String(s).match(/\{[^}]+\}/g) || []).join(' ');

const en = read('en-US');
const zh = read('zh-Hans');

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const [loc, label] of Object.entries(TARGET_LANGS)) {
  const dict = read(loc);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Agentic Sales Mobile i18n';
  const ws = wb.addWorksheet(loc, {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
  });

  ws.columns = [
    { header: 'Key (do not edit)', key: 'key', width: 30 },
    { header: 'English (source)', key: 'en', width: 46 },
    { header: '中文 (参考)', key: 'zh', width: 30 },
    { header: `${label} — edit here`, key: 'tgt', width: 46 },
    { header: 'Placeholders to keep', key: 'ph', width: 20 },
    { header: 'Notes (optional)', key: 'notes', width: 30 },
  ];

  for (const k of Object.keys(en)) {
    ws.addRow({ key: k, en: en[k], zh: zh[k] ?? '', tgt: dict[k] ?? '', ph: placeholders(en[k]), notes: '' });
  }

  // Header styling
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial' };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.height = 28;
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } } };
  });

  // Body: wrap text, top-align, mono-ish for key; shade the editable column
  ws.eachRow((row, n) => {
    if (n === 1) return;
    row.alignment = { vertical: 'top', wrapText: true };
    row.font = { name: 'Arial', size: 11 };
    row.getCell('key').font = { name: 'Consolas', size: 10, color: { argb: 'FF808080' } };
    // Lock reference columns, unlock editable ones
    ['key', 'en', 'zh', 'ph'].forEach((c) => { row.getCell(c).protection = { locked: true }; });
    ['tgt', 'notes'].forEach((c) => { row.getCell(c).protection = { locked: false }; });
    row.getCell('tgt').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF6E0' } };
  });

  // Protect the sheet so only the unlocked (target + notes) cells are editable.
  // Empty password = no password prompt, but structure is protected.
  await ws.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatColumns: false,
    formatRows: false,
  });

  ws.autoFilter = { from: 'A1', to: 'F1' };

  const outPath = path.join(OUT_DIR, `review-${loc}.xlsx`);
  await wb.xlsx.writeFile(outPath);
  console.log(`✓ ${path.relative(ROOT, outPath)}  (${Object.keys(en).length} strings)`);
}

console.log(`\nDone. Send i18n-review/review-<lang>.xlsx to the matching business user.`);
console.log(`They edit only the highlighted "— edit here" column (keep {placeholders} intact), then return the file.`);
console.log(`Re-import with:  node scripts/i18n-import.mjs`);
