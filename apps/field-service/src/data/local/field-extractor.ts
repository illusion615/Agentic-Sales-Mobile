import type { FieldExtractor } from '@/domain/ports';
import { readableEvidence } from '@/domain/capture';
import { allFields, type FormField } from '@/domain/form-schema';
import type {
  CustomerUpdateCandidate,
  ExtractionInput,
  ExtractionResult,
  FieldCandidate,
} from '@/domain/extraction';

/**
 * Rule-based stand-in for the extraction model.
 *
 * It is schema-driven, because the form is: field identifiers are opaque, so
 * nothing here may key off them. Two strategies carry it, both of which work on
 * a form this code has never seen:
 *
 *  - for choice fields, an option is selected when its own text appears in what
 *    was captured. This needs no knowledge of the question at all, and is
 *    scored highest because the match is exact.
 *  - for free text, the label's topic words are looked for in the captured
 *    fragments. This is a weak signal and is scored as such.
 *
 * It produces the same shape the model will — a value, a confidence and the
 * fragments it came from — so review, merging and traceability are exercised
 * for real.
 */

interface Fragment {
  text: string;
  evidenceId: string;
}

/** Words that recur in service form labels, used to link a label to a remark. */
const TOPIC_WORDS = [
  '需求',
  '总结',
  '待办',
  '跟进',
  '问题',
  '科室',
  '职务',
  '姓名',
  '阶段',
  '结论',
  '原因',
  '处理',
  '结果',
  '备注',
  '建议',
  '进度',
];

function toFragments(input: ExtractionInput): Fragment[] {
  return readableEvidence(input.evidence).flatMap((e) =>
    (e.text ?? '')
      .split(/[。！？\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((text) => ({ text, evidenceId: e.id })),
  );
}

/** Strip the authoring ornaments so the label reads as a topic. */
function cleanLabel(label: string): string {
  return label.replace(/^\s*\d+\s*[、.．)）]\s*/, '').replace(/[：:？?\s]+$/, '');
}

function topicsOf(field: FormField): string[] {
  const label = cleanLabel(field.label);
  return TOPIC_WORDS.filter((word) => label.includes(word));
}

function byKeyword(
  fragments: readonly Fragment[],
  keywords: readonly string[],
  used: ReadonlySet<string>,
): Fragment | null {
  for (const fragment of fragments) {
    if (used.has(fragment.text)) continue;
    if (keywords.some((k) => fragment.text.includes(k))) return fragment;
  }
  return null;
}

/** Options whose own text appears verbatim in what was captured. */
function matchedOptions(field: FormField, fragments: readonly Fragment[]) {
  const hits: Array<{ key: string; evidenceId: string }> = [];
  for (const option of field.options ?? []) {
    const fragment = fragments.find((f) => f.text.includes(option.label));
    if (fragment) hits.push({ key: option.key, evidenceId: fragment.evidenceId });
  }
  return hits;
}

function extractField(
  field: FormField,
  fragments: readonly Fragment[],
  used: Set<string>,
): FieldCandidate | null {
  if (field.readonly || field.type === 'custom' || field.type === 'date') return null;

  if (field.type === 'single-select' || field.type === 'multi-select') {
    const hits = matchedOptions(field, fragments);
    if (hits.length === 0) return null;
    const evidenceIds = [...new Set(hits.map((h) => h.evidenceId))];

    if (field.type === 'multi-select') {
      return { name: field.name, value: hits.map((h) => h.key), confidence: 0.8, evidenceIds };
    }
    // Several options matched a question that takes one answer. Short option
    // wording makes this easy — "有无" contains both 有 and 无 — and a wrongly
    // pre-selected radio is worse than a blank one, because a blank required
    // field is flagged while a wrong answer can be signed off unnoticed.
    if (hits.length > 1) return null;
    return { name: field.name, value: hits[0].key, confidence: 0.8, evidenceIds };
  }

  const topics = topicsOf(field);
  if (topics.length === 0) return null;

  const fragment = byKeyword(fragments, topics, used);
  if (!fragment) return null;

  if (field.type === 'number') {
    const number = fragment.text.match(/(\d+(?:\.\d+)?)/);
    if (!number) return null;
    used.add(fragment.text);
    return { name: field.name, value: Number(number[1]), confidence: 0.6, evidenceIds: [fragment.evidenceId] };
  }

  // A whole remark answering a labelled question is a guess, not a reading.
  used.add(fragment.text);
  return { name: field.name, value: fragment.text, confidence: 0.45, evidenceIds: [fragment.evidenceId] };
}

const CUSTOMER_RULES: Array<{
  field: CustomerUpdateCandidate['field'];
  keywords: string[];
  confidence: number;
}> = [
  { field: 'siteAccessNotes', keywords: ['门禁', '登记', '换鞋', '停车', '刷卡', '陪同'], confidence: 0.6 },
  { field: 'caution', keywords: ['注意', '务必', '禁止', '不得', '提前报备'], confidence: 0.55 },
];

export function createRuleBasedFieldExtractor(): FieldExtractor {
  return {
    async extract(input: ExtractionInput): Promise<ExtractionResult> {
      const fragments = toFragments(input);
      const usedByFields = new Set<string>();

      const fields: FieldCandidate[] = [];
      for (const field of allFields(input.schema)) {
        const candidate = extractField(field, fragments, usedByFields);
        if (candidate) fields.push(candidate);
      }

      const customerUpdates: CustomerUpdateCandidate[] = [];
      // One sentence can satisfy several keyword rules; proposing it twice
      // under different headings only gives the reviewer more to dismiss.
      const proposed = new Set<string>();

      for (const rule of CUSTOMER_RULES) {
        const hit = byKeyword(fragments, rule.keywords, new Set());
        if (hit && !proposed.has(hit.text)) {
          proposed.add(hit.text);
          customerUpdates.push({
            field: rule.field,
            value: hit.text,
            confidence: rule.confidence,
            evidenceIds: [hit.evidenceId],
          });
        }
      }

      const contactPattern = /[\u4e00-\u9fa5]{2,4}\s*(?:主任|工程师|护士长|老师|经理)?[^\d]{0,4}1\d{10}/;
      const contact = fragments.find((f) => contactPattern.test(f.text));
      if (contact && !proposed.has(contact.text)) {
        const matched = contact.text.match(contactPattern);
        if (matched) {
          customerUpdates.push({
            field: 'contact',
            value: matched[0],
            confidence: 0.7,
            evidenceIds: [contact.evidenceId],
          });
        }
      }

      return { fields, customerUpdates, source: 'rules' };
    },
  };
}
