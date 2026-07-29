import type { FieldExtractor } from '@/domain/ports';
import { readableEvidence } from '@/domain/capture';
import type {
  CustomerUpdateCandidate,
  ExtractionInput,
  ExtractionResult,
  FieldCandidate,
} from '@/domain/extraction';

/**
 * Rule-based stand-in for the extraction model.
 *
 * It produces the same shape the model will — a value, a confidence and the
 * fragments it came from — so review, merging and traceability are exercised
 * for real. What it cannot do is understand; it matches patterns. Confidence
 * is scored accordingly: an anchored measurement scores well above a sentence
 * picked for containing a keyword.
 */

interface Fragment {
  text: string;
  evidenceId: string;
}

function toFragments(input: ExtractionInput): Fragment[] {
  return readableEvidence(input.evidence).flatMap((e) =>
    (e.text ?? '')
      .split(/[。！？\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((text) => ({ text, evidenceId: e.id })),
  );
}

/** First fragment matching a pattern, with the chosen capture group. */
function byPattern(
  fragments: readonly Fragment[],
  pattern: RegExp,
  group = 1,
): { value: string; evidenceId: string } | null {
  for (const fragment of fragments) {
    const match = fragment.text.match(pattern);
    if (match && match[group]) return { value: match[group].trim(), evidenceId: fragment.evidenceId };
  }
  return null;
}

/** First fragment containing any keyword, returned whole. */
function byKeyword(
  fragments: readonly Fragment[],
  keywords: readonly string[],
): { value: string; evidenceId: string } | null {
  for (const fragment of fragments) {
    if (keywords.some((k) => fragment.text.includes(k))) {
      return { value: fragment.text, evidenceId: fragment.evidenceId };
    }
  }
  return null;
}

type Rule = (fragments: readonly Fragment[]) => Omit<FieldCandidate, 'key'> | null;

const anchored = (hit: { value: string; evidenceId: string } | null, confidence: number) =>
  hit ? { value: hit.value, confidence, evidenceIds: [hit.evidenceId] } : null;

const FIELD_RULES: Record<string, Rule> = {
  faultCode: (f) => anchored(byPattern(f, /(?:报警|故障)\s*(?:代码|码)?\s*[:：]?\s*([A-Za-z]{0,3}-?\d{2,4})/), 0.9),
  conductivity: (f) => anchored(byPattern(f, /电导率[^\d]{0,6}([\d.]+)/), 0.9),
  deviceCount: (f) => anchored(byPattern(f, /(\d+)\s*台/), 0.8),
  reportNo: (f) => anchored(byPattern(f, /报告(?:编号)?\s*[:：]?\s*([A-Za-z0-9-]{4,})/), 0.85),
  calibrationResult: (f) => {
    const hit = byKeyword(f, ['不合格']) ?? byKeyword(f, ['合格']);
    if (!hit) return null;
    return { value: hit.value.includes('不合格') ? '不合格' : '合格', confidence: 0.8, evidenceIds: [hit.evidenceId] };
  },
  rootCause: (f) => anchored(byKeyword(f, ['原因', '由于', '因为', '导致']), 0.55),
  partsReplaced: (f) => anchored(byKeyword(f, ['更换', '换了', '替换']), 0.6),
  consumables: (f) => anchored(byKeyword(f, ['滤芯', '耗材', '密封圈']), 0.6),
  followUp: (f) => anchored(byKeyword(f, ['后续', '建议', '下次', '待观察']), 0.5),
  findings: (f) => anchored(byKeyword(f, ['现场', '检查', '发现']), 0.5),
  resolution: (f) => {
    const hit = byKeyword(f, ['处理', '恢复', '完成', '解决']);
    return anchored(hit, 0.6);
  },
  resolved: (f) => {
    const negative = byKeyword(f, ['未解决', '未恢复', '待观察', '需返修']);
    if (negative) return { value: '否', confidence: 0.75, evidenceIds: [negative.evidenceId] };
    const positive = byKeyword(f, ['恢复正常', '已解决', '运行正常', '测试通过']);
    if (positive) return { value: '是', confidence: 0.75, evidenceIds: [positive.evidenceId] };
    return null;
  },
  checklistDone: (f) => {
    const hit = byKeyword(f, ['全部完成', '保养完成', '已完成']);
    return hit ? { value: '是', confidence: 0.7, evidenceIds: [hit.evidenceId] } : null;
  },
};

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

      const fields: FieldCandidate[] = [];
      for (const question of input.questionnaire.fields) {
        const rule = FIELD_RULES[question.key];
        const hit = rule?.(fragments);
        if (hit) fields.push({ key: question.key, ...hit });
      }

      const customerUpdates: CustomerUpdateCandidate[] = [];
      // One sentence can satisfy several keyword rules; proposing it twice
      // under different headings only gives the reviewer more to dismiss.
      const proposed = new Set<string>();

      for (const rule of CUSTOMER_RULES) {
        const hit = byKeyword(fragments, rule.keywords);
        if (hit && !proposed.has(hit.value)) {
          proposed.add(hit.value);
          customerUpdates.push({
            field: rule.field,
            value: hit.value,
            confidence: rule.confidence,
            evidenceIds: [hit.evidenceId],
          });
        }
      }

      const contact = byPattern(fragments, /([\u4e00-\u9fa5]{2,4})\s*(?:主任|工程师|护士长|老师|经理)?[^\d]{0,4}(1\d{10})/, 0);
      if (contact && !proposed.has(contact.value)) {
        customerUpdates.push({
          field: 'contact',
          value: contact.value,
          confidence: 0.7,
          evidenceIds: [contact.evidenceId],
        });
      }

      return { fields, customerUpdates, source: 'rules' };
    },
  };
}
