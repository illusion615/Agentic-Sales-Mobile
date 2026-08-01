import { describe, expect, it } from 'vitest';
import { buildExtractionPrompt, parseExtractionResponse } from '@/domain/extraction-contract';
import type { Evidence } from '@/domain/capture';
import type { FormSchema } from '@/domain/form-schema';
import type { WorkOrderDetail } from '@/domain/work-order';

const schema: FormSchema = {
  id: 'dialysis@1',
  title: '透析机维修单',
  sections: [
    {
      key: 's1',
      title: '故障',
      fields: [
        { name: 'f-desc', label: '1、报警现象描述：', type: 'textarea', required: true, readonly: false },
        {
          name: 'f-cat',
          label: '2、故障归类：',
          type: 'single-select',
          required: true,
          readonly: false,
          options: [
            { key: '水路', label: '水路' },
            { key: '传感器', label: '传感器' },
          ],
        },
        {
          name: 'f-actions',
          label: '3、处理措施：',
          type: 'multi-select',
          required: true,
          readonly: false,
          options: [
            { key: 'replace', label: '更换传感器' },
            { key: 'clean', label: '管路清洗' },
          ],
        },
        { name: 'f-count', label: '台数', type: 'number', required: false, readonly: false },
        { name: 'f-when', label: '到场时间', type: 'date', required: false, readonly: false },
        { name: 'f-ok', label: '是否恢复', type: 'boolean', required: false, readonly: false },
        { name: 'f-locked', label: '客户名称', type: 'text', required: false, readonly: true },
      ],
    },
  ],
};

const evidence: Evidence[] = [
  { id: 'ev-1', sessionId: 's', kind: 'text', capturedAt: '2026-08-01T01:00:00Z', text: '电导率报警 E-12' },
];

const workOrder = {
  customerName: '深圳市南山区人民医院',
  incidentType: '透析机停机',
  assetName: '透析机 DX-200 #3',
} as WorkOrderDetail;

function parse(fields: unknown) {
  return parseExtractionResponse(JSON.stringify({ fields }), schema, evidence);
}

describe('buildExtractionPrompt', () => {
  it('gives the model the opaque name, the question and the option keys', () => {
    const prompt = buildExtractionPrompt({ workOrder, schema, evidence });
    expect(prompt).toContain('name: f-cat');
    expect(prompt).toContain('question: 故障归类');
    expect(prompt).toContain('replace=更换传感器');
  });

  it('never asks for a field the form does not let anyone answer', () => {
    const prompt = buildExtractionPrompt({ workOrder, schema, evidence });
    expect(prompt).not.toContain('f-locked');
  });

  it('quotes the notes with the ids the answer must cite', () => {
    const prompt = buildExtractionPrompt({ workOrder, schema, evidence });
    expect(prompt).toContain('[ev-1] 电导率报警 E-12');
  });
});

describe('parseExtractionResponse', () => {
  it('reads a well-formed answer', () => {
    const { fields } = parse([{ name: 'f-cat', value: '传感器', confidence: 0.9, evidence: ['ev-1'] }]);
    expect(fields).toEqual([{ name: 'f-cat', value: '传感器', confidence: 0.9, evidenceIds: ['ev-1'] }]);
  });

  it('survives a code fence and surrounding prose', () => {
    const raw = '好的，结果如下：\n```json\n{"fields":[{"name":"f-desc","value":"电导率报警"}]}\n```\n以上。';
    const { fields } = parseExtractionResponse(raw, schema, evidence);
    expect(fields[0].name).toBe('f-desc');
  });

  it('drops a field name the form does not have', () => {
    const { fields, warnings } = parse([{ name: 'f-hallucinated', value: 'x' }]);
    expect(fields).toEqual([]);
    expect(warnings[0]).toContain('未知字段');
  });

  it('drops a readonly field even when the model answers it', () => {
    const { fields, warnings } = parse([{ name: 'f-locked', value: '某医院' }]);
    expect(fields).toEqual([]);
    expect(warnings[0]).toContain('只读');
  });

  it('rejects an option key the field does not offer', () => {
    const { fields, warnings } = parse([{ name: 'f-cat', value: '电路' }]);
    expect(fields).toEqual([]);
    expect(warnings[0]).toContain('类型');
  });

  it('accepts a choice answered by its label and stores the key', () => {
    const { fields } = parse([{ name: 'f-actions', value: ['更换传感器'] }]);
    expect(fields[0].value).toEqual(['replace']);
  });

  it('keeps the valid members of a multi-select and drops the invented one', () => {
    const { fields } = parse([{ name: 'f-actions', value: ['clean', '整机更换'] }]);
    expect(fields[0].value).toEqual(['clean']);
  });

  it('refuses a single-select answered with several options', () => {
    const { fields } = parse([{ name: 'f-cat', value: ['水路', '传感器'] }]);
    expect(fields).toEqual([]);
  });

  it('refuses a date that is not ISO', () => {
    expect(parse([{ name: 'f-when', value: '上周三' }]).fields).toEqual([]);
    expect(parse([{ name: 'f-when', value: '2026-08-01' }]).fields[0].value).toBe('2026-08-01');
  });

  it('refuses a number that is not a number', () => {
    expect(parse([{ name: 'f-count', value: '两台' }]).fields).toEqual([]);
    expect(parse([{ name: 'f-count', value: '3' }]).fields[0].value).toBe(3);
  });

  it('refuses a yes/no answered with a word', () => {
    expect(parse([{ name: 'f-ok', value: '是' }]).fields).toEqual([]);
    expect(parse([{ name: 'f-ok', value: false }]).fields[0].value).toBe(false);
  });

  it('drops a blank text answer rather than storing an empty string', () => {
    expect(parse([{ name: 'f-desc', value: '   ' }]).fields).toEqual([]);
  });

  it('keeps only the first answer when the model repeats a field', () => {
    const { fields } = parse([
      { name: 'f-desc', value: '第一次' },
      { name: 'f-desc', value: '第二次' },
    ]);
    expect(fields).toHaveLength(1);
    expect(fields[0].value).toBe('第一次');
  });

  it('discards a citation to evidence that does not exist', () => {
    const { fields } = parse([{ name: 'f-desc', value: '报警', evidence: ['ev-1', 'ev-999'] }]);
    expect(fields[0].evidenceIds).toEqual(['ev-1']);
  });

  it('clamps a confidence outside 0-1 and defaults a missing one', () => {
    expect(parse([{ name: 'f-desc', value: 'a', confidence: 7 }]).fields[0].confidence).toBe(1);
    expect(parse([{ name: 'f-desc', value: 'a' }]).fields[0].confidence).toBe(0.5);
  });

  it('reports rather than throws when the reply is not JSON at all', () => {
    const { fields, warnings } = parseExtractionResponse('抱歉，我无法回答。', schema, evidence);
    expect(fields).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it('reports when the JSON has no fields array', () => {
    const { fields, warnings } = parseExtractionResponse('{"result":"ok"}', schema, evidence);
    expect(fields).toEqual([]);
    expect(warnings[0]).toContain('fields');
  });
});

describe('customer profile proposals', () => {
  const parseCustomer = (customer: unknown) =>
    parseExtractionResponse(JSON.stringify({ fields: [], customer }), schema, evidence);

  it('reads a site-access note with its citation', () => {
    const { customerUpdates } = parseCustomer([
      { kind: 'siteAccessNotes', value: '门岗需登记换鞋', confidence: 0.8, evidence: ['ev-1'] },
    ]);
    expect(customerUpdates).toEqual([
      { field: 'siteAccessNotes', value: '门岗需登记换鞋', confidence: 0.8, evidenceIds: ['ev-1'] },
    ]);
  });

  it('drops a category the profile does not have', () => {
    const { customerUpdates, warnings } = parseCustomer([{ kind: 'opportunity', value: '想买新机' }]);
    expect(customerUpdates).toEqual([]);
    expect(warnings[0]).toContain('档案类别');
  });

  it('files one remark once even when the model repeats it', () => {
    const { customerUpdates } = parseCustomer([
      { kind: 'caution', value: '需穿鞋套' },
      { kind: 'siteAccessNotes', value: '需穿鞋套' },
    ]);
    expect(customerUpdates).toHaveLength(1);
  });

  it('ignores a blank value rather than proposing an empty change', () => {
    expect(parseCustomer([{ kind: 'caution', value: '  ' }]).customerUpdates).toEqual([]);
  });

  it('treats an absent customer section as nothing to propose', () => {
    const { customerUpdates, warnings } = parseExtractionResponse('{"fields":[]}', schema, evidence);
    expect(customerUpdates).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('keeps the form answers when only the customer section is malformed', () => {
    const raw = JSON.stringify({ fields: [{ name: 'f-desc', value: '报警' }], customer: 'nope' });
    const { fields, customerUpdates, warnings } = parseExtractionResponse(raw, schema, evidence);
    expect(fields).toHaveLength(1);
    expect(customerUpdates).toEqual([]);
    expect(warnings[0]).toContain('customer');
  });
});
