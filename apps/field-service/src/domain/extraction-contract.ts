/**
 * The contract between this app and the extraction model.
 *
 * Both halves are pure so they can be tested without a model: what we ask for,
 * and what we are willing to accept back. The second half matters more. A model
 * will happily invent a field name, answer a single-choice question with three
 * options, or return a date as "上周三" — so every value is checked against the
 * form definition and anything that does not fit is dropped, not coerced.
 * A dropped proposal leaves a blank the technician is prompted to fill; a
 * coerced one is a wrong answer that gets signed off unnoticed.
 */
import type { CustomerUpdateCandidate, CustomerUpdateField, FieldCandidate } from './extraction';
import type { Evidence } from './capture';
import { readableEvidence } from './capture';
import { allFields, plainLabel, type FormField, type FormSchema, type FormValue } from './form-schema';
import { extractJsonObject } from './model-response';
import type { WorkOrderDetail } from './work-order';

/** Types the model is asked to fill. The rest are prefilled or not answerable. */
function isExtractable(field: FormField): boolean {
  return !field.readonly && field.type !== 'custom';
}

function describeField(field: FormField): string {
  const parts = [`- name: ${field.name}`, `  question: ${plainLabel(field)}`, `  type: ${field.type}`];
  if (field.required) parts.push('  required: true');
  if (field.options?.length) {
    parts.push(`  options: ${field.options.map((o) => `${o.key}=${o.label}`).join(' | ')}`);
  }
  return parts.join('\n');
}

export function buildExtractionPrompt(input: {
  workOrder: WorkOrderDetail;
  schema: FormSchema;
  evidence: readonly Evidence[];
}): string {
  const fields = allFields(input.schema).filter(isExtractable);
  const fragments = readableEvidence(input.evidence)
    .map((e) => `[${e.id}] ${e.text ?? ''}`)
    .filter((line) => line.trim().length > 0);

  return [
    'You extract structured answers from a field engineer\'s raw site notes.',
    '',
    '## Job',
    `customer: ${input.workOrder.customerName}`,
    `incident: ${input.workOrder.incidentType ?? 'unspecified'}`,
    input.workOrder.assetName ? `equipment: ${input.workOrder.assetName}` : '',
    input.workOrder.summary ? `reported: ${input.workOrder.summary}` : '',
    '',
    '## Form fields',
    fields.map(describeField).join('\n'),
    '',
    '## Site notes',
    fragments.length > 0 ? fragments.join('\n') : '(none)',
    '',
    '## Rules',
    '1. Answer ONLY from the site notes. Never infer from the job description.',
    '2. Leave a field out entirely when the notes do not answer it. Omission is correct and expected.',
    '3. Use the exact `name` given above. Never invent a name.',
    '4. single-select: return ONE option key. multi-select: return an array of option keys.',
    '5. date: return YYYY-MM-DD. number: return a bare number. boolean: return true or false.',
    '6. text/textarea: quote or tightly paraphrase the notes; do not embellish.',
    '7. evidence: list the note ids the value came from.',
    '8. confidence: 0-1, how certain the notes actually say this.',
    '9. Notes are chronological. When a later note explicitly corrects or refines an earlier note, use the later value and cite the correcting evidence.',
    '',
    '## Customer profile',
    'Also report anything about the SITE or the CUSTOMER that will still be true on the next visit:',
    '- siteAccessNotes: how to get in — gate registration, parking, escorts, keys, shoe covers',
    '- caution: something that must be respected on site',
    '- contact: a person and their phone number',
    'Report only what the notes state. Never repeat what the job description already says.',
    '',
    '## Output',
    'Return ONLY this JSON, no prose and no code fence:',
    '{"fields":[{"name":"...","value":...,"confidence":0.0,"evidence":["..."]}],',
    ' "customer":[{"kind":"siteAccessNotes|caution|contact","value":"...","confidence":0.0,"evidence":["..."]}]}',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

interface RawCandidate {
  name?: unknown;
  value?: unknown;
  confidence?: unknown;
  evidence?: unknown;
}

/** Accepts an option by key, or by its display label when the model answered in words. */
function optionKey(field: FormField, value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  const options = field.options ?? [];
  const byKey = options.find((o) => o.key === text);
  if (byKey) return byKey.key;
  const byLabel = options.find((o) => o.label === text);
  return byLabel ? byLabel.key : null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns the value to store, or null when it does not fit the field. */
function coerce(field: FormField, value: unknown): FormValue | null {
  switch (field.type) {
    case 'single-select':
      return optionKey(field, value);

    case 'multi-select': {
      if (!Array.isArray(value)) return null;
      const keys = value.map((item) => optionKey(field, item)).filter((key): key is string => key !== null);
      return keys.length > 0 ? [...new Set(keys)] : null;
    }

    case 'boolean':
      return typeof value === 'boolean' ? value : null;

    case 'number': {
      const parsed = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    case 'date':
      return typeof value === 'string' && ISO_DATE.test(value.trim()) ? value.trim() : null;

    default: {
      if (typeof value !== 'string') return null;
      const text = value.trim();
      return text.length > 0 ? text : null;
    }
  }
}

export interface ParsedExtraction {
  fields: FieldCandidate[];
  customerUpdates: CustomerUpdateCandidate[];
  /** Everything rejected, so a bad prompt or model shows up instead of going quiet. */
  warnings: string[];
}

const CUSTOMER_FIELDS: readonly CustomerUpdateField[] = ['siteAccessNotes', 'caution', 'contact'];

/** A model that omits its confidence has not claimed certainty, so it gets the middling value. */
function clampConfidence(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}

function citedEvidence(raw: unknown, known: ReadonlySet<string>): string[] {
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string' && known.has(id)) : [];
}

function parseCustomerUpdates(
  raw: unknown,
  known: ReadonlySet<string>,
  warnings: string[],
): CustomerUpdateCandidate[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warnings.push('customer 不是数组');
    return [];
  }

  const updates: CustomerUpdateCandidate[] = [];
  const seen = new Set<string>();

  for (const item of raw as Array<Record<string, unknown>>) {
    const field = CUSTOMER_FIELDS.find((f) => f === item?.kind);
    if (!field) {
      warnings.push(`忽略未知的档案类别 ${String(item?.kind ?? '(空)')}`);
      continue;
    }
    const value = typeof item.value === 'string' ? item.value.trim() : '';
    if (!value) continue;
    // One remark filed twice only gives the reviewer more to dismiss.
    if (seen.has(value)) continue;
    seen.add(value);

    updates.push({
      field,
      value,
      confidence: clampConfidence(item.confidence),
      evidenceIds: citedEvidence(item.evidence, known),
    });
  }

  return updates;
}

export function parseExtractionResponse(
  raw: string,
  schema: FormSchema,
  evidence: readonly Evidence[],
): ParsedExtraction {
  const warnings: string[] = [];
  const nothing = { fields: [], customerUpdates: [] };
  const json = extractJsonObject(raw);
  if (!json) return { ...nothing, warnings: ['模型没有返回 JSON'] };

  let parsed: { fields?: unknown; customer?: unknown };
  try {
    parsed = JSON.parse(json) as { fields?: unknown; customer?: unknown };
  } catch {
    return { ...nothing, warnings: ['模型返回的 JSON 无法解析'] };
  }

  const knownEvidence = new Set(evidence.map((e) => e.id));
  const customerUpdates = parseCustomerUpdates(parsed.customer, knownEvidence, warnings);

  if (!Array.isArray(parsed.fields)) {
    warnings.push('返回中没有 fields 数组');
    return { fields: [], customerUpdates, warnings };
  }

  const byName = new Map(allFields(schema).map((field) => [field.name, field]));
  const claimed = new Set<string>();
  const fields: FieldCandidate[] = [];

  for (const item of parsed.fields as RawCandidate[]) {
    const name = typeof item?.name === 'string' ? item.name : '';
    const field = byName.get(name);
    if (!field) {
      warnings.push(`忽略未知字段 ${name || '(空)'}`);
      continue;
    }
    if (!isExtractable(field)) {
      warnings.push(`忽略只读字段 ${plainLabel(field)}`);
      continue;
    }
    if (claimed.has(name)) {
      warnings.push(`忽略重复字段 ${plainLabel(field)}`);
      continue;
    }

    const value = coerce(field, item.value);
    if (value === null) {
      warnings.push(`忽略不符合类型的值：${plainLabel(field)}`);
      continue;
    }

    claimed.add(name);
    fields.push({
      name,
      value,
      confidence: clampConfidence(item.confidence),
      evidenceIds: citedEvidence(item.evidence, knownEvidence),
    });
  }

  return { fields, customerUpdates, warnings };
}
