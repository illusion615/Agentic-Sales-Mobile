/**
 * Loads prompt overrides from Dataverse.
 *
 * The build always ships every prompt, so this is purely additive: a published
 * row replaces a built-in body only if it keeps the contract, and any failure —
 * table missing, offline, malformed row — silently leaves the app on its
 * shipped prompts. Un-publishing a row is therefore the one-click rollback.
 *
 * Reads are cached in localStorage so a cold start applies the last known
 * bodies before the network answers.
 */
import type { PromptOverride } from '@agentic/power-runtime';
import { applyPromptOverrides, SALES_APP_ID } from '@/prompts';
import { Crf5c_prompttemplatesService as PromptTemplateService } from '@/generated/services/Crf5c_prompttemplatesService';
import type { Crf5c_prompttemplates } from '@/generated/models/Crf5c_prompttemplatesModel';

const CACHE_KEY = 'salescopilot.promptOverrides.v1';

type PromptRow = Pick<
  Crf5c_prompttemplates,
  | 'crf5c_name'
  | 'crf5c_body'
  | 'crf5c_contractversion'
  | 'crf5c_responseformat'
  | 'crf5c_modeltier'
  | 'crf5c_promptversion'
> & { crf5c_app?: string };

export type { PromptRow };

const RESPONSE_FORMATS = new Set(['text', 'json', 'dag', 'json-generic']);

/** Maps published rows to overrides, dropping ones that cannot be applied. */
export function toPromptOverrides(rows: PromptRow[]): PromptOverride[] {
  const overrides: PromptOverride[] = [];
  for (const row of rows) {
    if (!row.crf5c_name || !row.crf5c_body) continue;
    const format = row.crf5c_responseformat;
    overrides.push({
      key: row.crf5c_name,
      body: row.crf5c_body,
      contractVersion: row.crf5c_contractversion ?? 0,
      responseFormat:
        format && RESPONSE_FORMATS.has(format)
          ? (format as PromptOverride['responseFormat'])
          : undefined,
      modelTier: row.crf5c_modeltier || undefined,
      version: row.crf5c_promptversion,
      app: row.crf5c_app || undefined,
    });
  }
  return overrides;
}

function apply(overrides: PromptOverride[], source: string): void {
  if (overrides.length === 0) return;
  const report = applyPromptOverrides(overrides);
  if (report.applied.length) {
    console.log(`[Prompts] ${report.applied.length} override(s) applied from ${source}.`);
  }
  for (const rejected of report.rejected) {
    console.warn(`[Prompts] "${rejected.key}" ignored — ${rejected.reason}`);
  }
}

/** Applies the last known overrides synchronously, before the first render. */
export function applyCachedPromptOverrides(): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const cached = JSON.parse(raw) as PromptOverride[];
    if (Array.isArray(cached)) apply(cached, 'cache');
  } catch {
    /* corrupt cache — the shipped prompts are already correct */
  }
}

/** Fetches published rows and applies them. Never throws. */
export async function refreshPromptOverrides(): Promise<void> {
  try {
    const res = await PromptTemplateService.getAll({
      filter: `crf5c_ispublished eq true and crf5c_app eq '${SALES_APP_ID}'`,
      select: [
        'crf5c_name',
        'crf5c_body',
        'crf5c_contractversion',
        'crf5c_responseformat',
        'crf5c_modeltier',
        'crf5c_promptversion',
        'crf5c_app',
      ],
      top: 500,
    });
    if (!res.success || !res.data) return;

    const overrides = toPromptOverrides(res.data);
    apply(overrides, 'Dataverse');
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(overrides));
    } catch {
      /* storage full — overrides still applied for this session */
    }
  } catch (e) {
    console.warn('[Prompts] override refresh skipped:', e);
  }
}
