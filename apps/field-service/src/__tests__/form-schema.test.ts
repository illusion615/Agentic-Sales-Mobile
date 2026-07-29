import { describe, expect, it } from 'vitest';
import { parseDesignerFormSchema } from '@/data/form-schema/designer-schema';
import { applyPrefills, evaluatePrefill } from '@/domain/form-expression';
import {
  allFields,
  assessCompleteness,
  findField,
  isAnswered,
  setUserValue,
  type FieldValue,
  type FormSchema,
} from '@/domain/form-schema';
import visitForm from '@/data/form-schema/visit-form.json';

const meta = { id: 'visit-form', title: '客户走访服务单' };
const { schema, warnings } = parseDesignerFormSchema(visitForm, meta);

describe('parsing a designer form definition', () => {
  it('reads the real definition without warnings', () => {
    expect(warnings).toEqual([]);
    expect(schema.sections.map((s) => s.title)).toEqual([
      '基本信息',
      '专业信息',
      '服务反馈',
      '客户档案填写',
    ]);
  });
  it('maps every designer widget onto a canonical type', () => {
    const typeOf = (label: string) => allFields(schema).find((f) => f.label === label)?.type;
    expect(typeOf('客户名称')).toBe('text');
    expect(typeOf('拜访日期')).toBe('date');
    expect(typeOf('1、临床科室重点需求描述：')).toBe('textarea');
    expect(typeOf('2、PMLS重点推广产品')).toBe('multi-select');
    expect(typeOf('4、方案推广阶段：')).toBe('single-select');
  });

  it('keeps an unknown widget as a custom one instead of dropping the field', () => {
    const field = allFields(schema).find((f) => f.label === '客户档案');
    expect(field?.type).toBe('custom');
    expect(field?.customType).toBe('CustomerProfileLink');
  });

  it('carries options, required flags and prefill expressions through', () => {
    const products = allFields(schema).find((f) => f.label === '2、PMLS重点推广产品');
    expect(products?.options?.map((o) => o.key)).toContain('瑞智联解决方案');

    const summary = allFields(schema).find((f) => f.label === '2、本次走访重点总结与待办事项：');
    expect(summary?.required).toBe(true);

    const customerName = allFields(schema).find((f) => f.label === '客户名称');
    expect(customerName?.prefill).toBe('#workorder?.customer?.name');
  });

  it('keys answers by the author-assigned name, not by position or label', () => {
    expect(findField(schema, 'id-1774854799612-750')?.label).toBe('客户名称');
  });

  it('skips malformed entries and says why, rather than failing the whole form', () => {
    const result = parseDesignerFormSchema(
      [{ title: '有问题的一节', items: [{ label: '缺少 name 和 type' }, { name: 'ok', label: '正常', type: 'Input' }] }],
      meta,
    );
    expect(result.schema.sections[0].fields).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes('已跳过'))).toBe(true);
  });

  it('degrades a choice field with no options to free text', () => {
    const result = parseDesignerFormSchema(
      [{ title: '一节', items: [{ name: 'a', label: '没有选项的单选', type: 'Radio' }] }],
      meta,
    );
    expect(result.schema.sections[0].fields[0].type).toBe('text');
    expect(result.warnings.some((w) => w.includes('按文本输入处理'))).toBe(true);
  });

  it('survives a definition that is not a list at all', () => {
    expect(parseDesignerFormSchema({ nope: true }, meta).schema.sections).toEqual([]);
  });
});

describe('prefill expressions', () => {
  const context = {
    workorder: { customer: { name: '南山人民医院' }, customerEquipment: { contactName: '王主任' } },
  };

  it('reads an optional-chaining path out of the context', () => {
    expect(evaluatePrefill('#workorder?.customer?.name', context).value).toBe('南山人民医院');
  });

  it('treats a path that resolves to nothing as simply blank', () => {
    expect(evaluatePrefill('#workorder?.missing?.thing', context)).toEqual({});
  });

  it('understands the Java date form legacy definitions use', () => {
    expect(evaluatePrefill('new java.util.Date()', context).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // The definitions come from a database, so an evaluator that could run them
  // would turn a table row into code execution in every technician's session.
  it('refuses to execute anything, reporting it as unsupported instead', () => {
    for (const hostile of [
      'alert(1)',
      "constructor.constructor('return 1')()",
      'window.location = "http://x"',
      '1 + 1',
    ]) {
      expect(evaluatePrefill(hostile, context).value).toBeUndefined();
    }
  });

  it('does not walk off the object into prototype properties', () => {
    expect(evaluatePrefill('#workorder.constructor', context).value).toBeUndefined();
    expect(evaluatePrefill('#workorder.__proto__', context).value).toBeUndefined();
  });

  it('reports unsupported expressions so the gap is visible', () => {
    const outcome = applyPrefills(
      { id: 'x', title: 'x', sections: [{ key: 's', title: 's', fields: [
        { name: 'f1', label: '奇怪的表达式', type: 'text', required: false, readonly: false, prefill: 'lookup(42)' },
      ] }] },
      context,
    );
    expect(outcome.values).toEqual([]);
    expect(outcome.unsupported).toEqual([{ field: 'f1', expression: 'lookup(42)' }]);
  });

  it('seeds a blank form and marks the values as brought in automatically', () => {
    const outcome = applyPrefills(schema, context);
    const customerName = outcome.values.find((v) => v.name === 'id-1774854799612-750');
    expect(customerName?.value).toBe('南山人民医院');
    expect(customerName?.source).toBe('prefill');
    // 拜访日期 is filled by the date expression.
    expect(outcome.values.some((v) => v.name === 'id-1774854878714-788')).toBe(true);
  });
});

describe('answers and completeness', () => {
  const requiredField = 'id-1774855375385-913';

  it('counts an empty multi-select as unanswered but false as an answer', () => {
    expect(isAnswered([])).toBe(false);
    expect(isAnswered(['a'])).toBe(true);
    expect(isAnswered('  ')).toBe(false);
    expect(isAnswered(false)).toBe(true);
    expect(isAnswered(null)).toBe(false);
  });

  it('gates submission on required fields only', () => {
    const optionalOnly: FieldValue[] = [{ name: 'id-1774854812167-755', value: '心内科', source: 'user' }];
    const completeness = assessCompleteness(schema, optionalOnly);
    expect(completeness.totalRequired).toBe(1);
    expect(completeness.submittable).toBe(false);
    expect(completeness.missingRequired[0].label).toBe('2、本次走访重点总结与待办事项：');
  });

  it('becomes submittable once the required field is answered', () => {
    const completeness = assessCompleteness(schema, [
      { name: requiredField, value: '已与王主任确认下季度采购计划', source: 'user' },
    ]);
    expect(completeness.ratio).toBe(1);
    expect(completeness.submittable).toBe(true);
  });

  it('reports a form with no required fields as complete', () => {
    const optional: FormSchema = {
      id: 'x',
      title: 'x',
      sections: [{ key: 's', title: 's', fields: [{ name: 'a', label: 'a', type: 'text', required: false, readonly: false }] }],
    };
    expect(assessCompleteness(optional, []).submittable).toBe(true);
  });

  it('marks an edited value as the technician own, dropping the proposal metadata', () => {
    const edited = setUserValue(
      [{ name: 'a', value: '模型建议', source: 'ai', confidence: 0.9, evidenceIds: ['e1'] }],
      'a',
      '人工修改',
    );
    expect(edited[0]).toEqual({ name: 'a', value: '人工修改', source: 'user' });
  });
});
