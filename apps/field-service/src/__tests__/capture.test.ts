import { describe, expect, it } from 'vitest';
import { assessCompleteness, questionnaireFor, type FieldValue } from '@/domain/questionnaire';
import { mergeCandidates } from '@/domain/extraction';
import { createRuleBasedFieldExtractor } from '@/data/local/field-extractor';
import type { Evidence } from '@/domain/capture';
import type { WorkOrderDetail } from '@/domain/work-order';

const workOrder: WorkOrderDetail = {
  id: 'wo-1',
  number: 'WO-1',
  status: 'in-progress',
  priority: 'high',
  incidentType: '透析机停机',
  customerId: 'acc-1',
  customerName: '南山人民医院',
  address: { line1: 'somewhere' },
};

function evidence(id: string, text: string, kind: Evidence['kind'] = 'text'): Evidence {
  return { id, sessionId: 'sess-1', kind, capturedAt: '2026-07-29T10:00:00.000Z', text };
}

describe('questionnaireFor', () => {
  it('selects the form for the incident type', () => {
    expect(questionnaireFor('透析机停机').fields.some((f) => f.key === 'faultCode')).toBe(true);
  });

  it('falls back to a generic form for an unknown or missing type', () => {
    expect(questionnaireFor(undefined).fields.some((f) => f.key === 'findings')).toBe(true);
    expect(questionnaireFor('从未见过的类型').fields.some((f) => f.key === 'findings')).toBe(true);
  });
});

describe('assessCompleteness', () => {
  const questionnaire = questionnaireFor('透析机停机');

  it('measures required fields only, so optional ones never block submission', () => {
    const optionalOnly: FieldValue[] = [{ key: 'partsReplaced', value: '传感器', source: 'user' }];
    const completeness = assessCompleteness(questionnaire, optionalOnly);
    expect(completeness.answeredRequired).toBe(0);
    expect(completeness.submittable).toBe(false);
  });

  it('names what is still missing rather than only reporting a number', () => {
    const completeness = assessCompleteness(questionnaire, []);
    expect(completeness.missingRequired.map((f) => f.key)).toEqual([
      'faultCode',
      'rootCause',
      'resolution',
      'resolved',
    ]);
  });

  it('treats a whitespace-only answer as unanswered', () => {
    const completeness = assessCompleteness(questionnaire, [{ key: 'faultCode', value: '   ', source: 'user' }]);
    expect(completeness.missingRequired.some((f) => f.key === 'faultCode')).toBe(true);
  });

  it('becomes submittable once every required field holds a value', () => {
    const answers: FieldValue[] = [
      { key: 'faultCode', value: 'E-12', source: 'ai' },
      { key: 'rootCause', value: '水质波动', source: 'user' },
      { key: 'resolution', value: '更换传感器并校准', source: 'user' },
      { key: 'resolved', value: '是', source: 'ai' },
    ];
    const completeness = assessCompleteness(questionnaire, answers);
    expect(completeness.ratio).toBe(1);
    expect(completeness.submittable).toBe(true);
  });
});

describe('mergeCandidates', () => {
  it('fills only what is still blank', () => {
    const merged = mergeCandidates(
      [{ key: 'rootCause', value: '人工填写', source: 'user' }],
      [
        { key: 'rootCause', value: '模型猜测', confidence: 0.9, evidenceIds: ['e1'] },
        { key: 'faultCode', value: 'E-12', confidence: 0.9, evidenceIds: ['e1'] },
      ],
    );

    expect(merged.find((v) => v.key === 'rootCause')?.value).toBe('人工填写');
    expect(merged.find((v) => v.key === 'faultCode')?.source).toBe('ai');
  });

  it('respects a field the technician deliberately cleared', () => {
    const merged = mergeCandidates(
      [{ key: 'faultCode', value: '', source: 'user' }],
      [{ key: 'faultCode', value: 'E-12', confidence: 0.9, evidenceIds: ['e1'] }],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].value).toBe('');
  });

  it('carries the evidence trail onto the merged value', () => {
    const merged = mergeCandidates([], [{ key: 'faultCode', value: 'E-12', confidence: 0.9, evidenceIds: ['e1', 'e2'] }]);
    expect(merged[0].evidenceIds).toEqual(['e1', 'e2']);
  });
});

describe('rule-based extraction', () => {
  const extractor = createRuleBasedFieldExtractor();
  const questionnaire = questionnaireFor('透析机停机');

  it('pulls anchored measurements with high confidence and cites their source', async () => {
    const result = await extractor.extract({
      workOrder,
      questionnaire,
      evidence: [evidence('e1', '面板报警代码 E-12。电导率 13.8 偏高')],
    });

    const faultCode = result.fields.find((f) => f.key === 'faultCode');
    expect(faultCode?.value).toBe('E-12');
    expect(faultCode?.confidence).toBeGreaterThan(0.8);
    expect(faultCode?.evidenceIds).toEqual(['e1']);
    expect(result.fields.find((f) => f.key === 'conductivity')?.value).toBe('13.8');
  });

  it('labels itself as rules so review never presents it as model output', async () => {
    const result = await extractor.extract({ workOrder, questionnaire, evidence: [] });
    expect(result.source).toBe('rules');
    expect(result.fields).toEqual([]);
  });

  it('reads an unresolved outcome as unresolved rather than defaulting to done', async () => {
    const result = await extractor.extract({
      workOrder,
      questionnaire,
      evidence: [evidence('e1', '临时旁通运行，未解决，需返修')],
    });
    expect(result.fields.find((f) => f.key === 'resolved')?.value).toBe('否');
  });

  it('separates customer profile facts from work order answers', async () => {
    const result = await extractor.extract({
      workOrder,
      questionnaire,
      evidence: [evidence('e1', '进门需要在门岗登记并换鞋', 'voice')],
    });

    expect(result.fields.some((f) => f.key === 'siteAccessNotes')).toBe(false);
    const update = result.customerUpdates.find((u) => u.field === 'siteAccessNotes');
    expect(update?.evidenceIds).toEqual(['e1']);
  });

  it('picks up a contact left in a spoken note', async () => {
    const result = await extractor.extract({
      workOrder,
      questionnaire,
      evidence: [evidence('e1', '以后找陈主任 13900001111', 'voice')],
    });
    expect(result.customerUpdates.some((u) => u.field === 'contact')).toBe(true);
  });

  it('proposes one sentence once, however many rules it satisfies', async () => {
    const result = await extractor.extract({
      workOrder,
      questionnaire,
      // Matches both the access rule (登记) and the caution rule (务必).
      evidence: [evidence('e1', '务必先在门岗登记')],
    });
    expect(result.customerUpdates).toHaveLength(1);
  });
});
