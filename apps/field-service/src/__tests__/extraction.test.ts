import { describe, expect, it } from 'vitest';
import { parseDesignerFormSchema } from '@/data/form-schema/designer-schema';
import { createRuleBasedFieldExtractor } from '@/data/local/field-extractor';
import { mergeCandidates } from '@/domain/extraction';
import type { Evidence } from '@/domain/capture';
import type { WorkOrderDetail } from '@/domain/work-order';
import visitForm from '@/data/form-schema/visit-form.json';

const { schema } = parseDesignerFormSchema(visitForm, { id: 'visit-form', title: '客户走访服务单' });

const workOrder: WorkOrderDetail = {
  id: 'wo-1',
  number: 'WO-1',
  status: 'in-progress',
  priority: 'high',
  incidentType: '客户走访',
  customerId: 'acc-1',
  customerName: '南山人民医院',
  address: { line1: 'somewhere' },
};

function evidence(id: string, text: string, kind: Evidence['kind'] = 'text'): Evidence {
  return { id, sessionId: 'sess-1', kind, capturedAt: '2026-07-29T10:00:00.000Z', text };
}

const extractor = createRuleBasedFieldExtractor();
const extract = (evidenceList: Evidence[]) => extractor.extract({ workOrder, schema, evidence: evidenceList });

const PRODUCTS = 'id-1774854992176-818';
const STAGE = 'id-1774855193073-838';
const UNRESOLVED = 'id-1774855300653-877';
const PROFILE_LINK = 'id-1774855405904-928';
const VISIT_DATE = 'id-1774854878714-788';

describe('schema-driven extraction', () => {
  it('selects the options whose own wording appears in what was captured', async () => {
    const result = await extract([evidence('e1', '重点介绍了瑞智联解决方案和保修，客户对大单升级也有兴趣')]);

    const products = result.fields.find((f) => f.name === PRODUCTS);
    expect(products?.value).toEqual(expect.arrayContaining(['瑞智联解决方案', '保修', '大单升级']));
    expect(products?.confidence).toBe(0.8);
    expect(products?.evidenceIds).toEqual(['e1']);
  });

  it('takes a single choice rather than a list for a single-select', async () => {
    const result = await extract([evidence('e1', '目前处于方案递交阶段')]);
    expect(result.fields.find((f) => f.name === STAGE)?.value).toBe('方案递交阶段');
  });

  it('answers a yes/no question from its own option wording', async () => {
    const result = await extract([evidence('e1', '本次未见遗留事项，无')]);
    expect(result.fields.find((f) => f.name === UNRESOLVED)?.value).toBe('无');
  });

  it('refuses to pick a single choice when the wording matches several', async () => {
    // "有无" contains both options; a wrongly pre-selected radio can be signed
    // off unnoticed, while a blank one is flagged as missing.
    const result = await extract([evidence('e1', '服务有无未解决的问题：无')]);
    expect(result.fields.some((f) => f.name === UNRESOLVED)).toBe(false);
  });

  it('matches a free-text question through its label topic, with low confidence', async () => {
    const result = await extract([evidence('e1', '科室提出需求：希望增加一台彩超')]);
    const needs = result.fields.find((f) => f.confidence === 0.45);
    expect(needs?.value).toContain('希望增加一台彩超');
  });

  it('never fills a custom widget or a date field', async () => {
    const result = await extract([evidence('e1', '客户档案已更新，拜访日期确认')]);
    expect(result.fields.some((f) => f.name === PROFILE_LINK)).toBe(false);
    expect(result.fields.some((f) => f.name === VISIT_DATE)).toBe(false);
  });

  it('proposes nothing at all when nothing was captured', async () => {
    const result = await extract([]);
    expect(result.fields).toEqual([]);
    expect(result.source).toBe('rules');
  });

  it('does not reuse one remark as the answer to several free-text questions', async () => {
    const result = await extract([evidence('e1', '本次走访总结：设备运行正常')]);
    const freeText = result.fields.filter((f) => f.confidence === 0.45);
    expect(freeText).toHaveLength(1);
  });

  it('keeps customer profile facts out of the form answers', async () => {
    const result = await extract([evidence('e1', '进门需要在门岗登记并换鞋', 'voice')]);
    expect(result.customerUpdates.find((u) => u.field === 'siteAccessNotes')?.evidenceIds).toEqual(['e1']);
  });
});

describe('mergeCandidates', () => {
  it('fills only what is still blank', async () => {
    const merged = mergeCandidates(
      [{ name: STAGE, value: '方案谈判阶段', source: 'user' }],
      [
        { name: STAGE, value: '方案设计阶段', confidence: 0.8, evidenceIds: ['e1'] },
        { name: PRODUCTS, value: ['保修'], confidence: 0.8, evidenceIds: ['e1'] },
      ],
    );

    expect(merged.find((v) => v.name === STAGE)?.value).toBe('方案谈判阶段');
    expect(merged.find((v) => v.name === PRODUCTS)?.source).toBe('ai');
  });

  it('respects a field the technician deliberately cleared', () => {
    const merged = mergeCandidates(
      [{ name: STAGE, value: '', source: 'user' }],
      [{ name: STAGE, value: '方案设计阶段', confidence: 0.8, evidenceIds: ['e1'] }],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].value).toBe('');
  });

  it('leaves a prefilled value alone, since it came from the record', () => {
    const merged = mergeCandidates(
      [{ name: 'id-1774854799612-750', value: '南山人民医院', source: 'prefill' }],
      [{ name: 'id-1774854799612-750', value: '别的医院', confidence: 0.9, evidenceIds: ['e1'] }],
    );
    expect(merged[0].value).toBe('南山人民医院');
  });

  it('carries the evidence trail onto the merged value', () => {
    const merged = mergeCandidates([], [{ name: STAGE, value: '方案设计阶段', confidence: 0.8, evidenceIds: ['e1', 'e2'] }]);
    expect(merged[0].evidenceIds).toEqual(['e1', 'e2']);
  });
});
