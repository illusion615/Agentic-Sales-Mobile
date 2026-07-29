import { describe, expect, it } from 'vitest';
import { parseDesignerFormSchema } from '@/data/form-schema/designer-schema';
import { confirmValue, type FieldValue, type FormSection } from '@/domain/form-schema';
import { reviewSection, reviewSections, sectionsNeedingAttention } from '@/domain/review';
import visitForm from '@/data/form-schema/visit-form.json';

const { schema } = parseDesignerFormSchema(visitForm, { id: 'visit-form', title: '客户走访服务单' });

const PRODUCTS = 'id-1774854992176-818';
const STAGE = 'id-1774855193073-838';
const SUMMARY = 'id-1774855375385-913';
const CUSTOMER_NAME = 'id-1774854799612-750';

const sectionOf = (title: string): FormSection =>
  schema.sections.find((s) => s.title === title)!;

describe('section review', () => {
  it('asks for input first, ahead of anything else it might want', () => {
    // The feedback section holds the only required field in this form.
    const review = reviewSection(sectionOf('服务反馈'), []);
    expect(review.status).toBe('needs-input');
    expect(review.missingRequired.map((f) => f.name)).toEqual([SUMMARY]);
    expect(review.headline).toBe('缺 1 项必填');
  });

  it('asks for review once nothing is missing but values are unconfirmed', () => {
    const values: FieldValue[] = [{ name: SUMMARY, value: '下周提交报价', source: 'ai', confidence: 0.45 }];
    const review = reviewSection(sectionOf('服务反馈'), values);
    expect(review.status).toBe('needs-review');
    expect(review.headline).toBe('1 项待确认');
  });

  it('settles once a person stands behind the values', () => {
    const values: FieldValue[] = [{ name: SUMMARY, value: '下周提交报价', source: 'user' }];
    expect(reviewSection(sectionOf('服务反馈'), values).status).toBe('settled');
  });

  it('treats a prefilled value as settled, since it came from the record', () => {
    const values: FieldValue[] = [{ name: CUSTOMER_NAME, value: '南山人民医院', source: 'prefill' }];
    expect(reviewSection(sectionOf('基本信息'), values).status).toBe('settled');
  });

  it('reports an untouched optional section as blank rather than complete', () => {
    const review = reviewSection(sectionOf('专业信息'), []);
    expect(review.status).toBe('blank');
    expect(review.headline).toBe('暂未填写');
  });

  it('opens exactly the sections that want something', () => {
    const values: FieldValue[] = [{ name: SUMMARY, value: '完成', source: 'user' }];
    const reviews = reviewSections(schema, values);
    const open = reviews.filter((r) => r.defaultOpen);
    expect(open).toEqual([]);

    const withProposal = reviewSections(schema, [{ name: SUMMARY, value: '完成', source: 'ai' }]);
    expect(withProposal.filter((r) => r.defaultOpen).map((r) => r.section.title)).toEqual(['服务反馈']);
  });

  it('lists what still needs attention in the order it appears', () => {
    const reviews = reviewSections(schema, [{ name: STAGE, value: '方案递交阶段', source: 'ai' }]);
    expect(sectionsNeedingAttention(reviews).map((r) => r.section.title)).toEqual(['专业信息', '服务反馈']);
  });
});

describe('collapsed digest', () => {
  it('shows option wording rather than the stored keys', () => {
    const values: FieldValue[] = [
      { name: PRODUCTS, value: ['保修', '瑞智联解决方案'], source: 'ai' },
      { name: STAGE, value: '方案递交阶段', source: 'ai' },
    ];
    const review = reviewSection(sectionOf('专业信息'), values);
    expect(review.digest).toBe('保修、瑞智联解决方案 · 方案递交阶段');
  });

  it('shortens a long answer instead of spilling it into the header', () => {
    const long = '这是一段很长的现场描述'.repeat(5);
    const review = reviewSection(sectionOf('服务反馈'), [{ name: SUMMARY, value: long, source: 'user' }]);
    expect(review.digest.length).toBeLessThanOrEqual(15);
    expect(review.digest.endsWith('…')).toBe(true);
  });

  it('says nothing when there is nothing filled in', () => {
    expect(reviewSection(sectionOf('专业信息'), []).digest).toBe('');
  });

  it('does not count a custom widget as an answerable field', () => {
    const review = reviewSection(sectionOf('客户档案填写'), []);
    expect(review.total).toBe(0);
  });
});

describe('confirming a proposal', () => {
  it('keeps the value and transfers ownership to the technician', () => {
    const confirmed = confirmValue(
      [{ name: STAGE, value: '方案递交阶段', source: 'ai', confidence: 0.8, evidenceIds: ['e1'] }],
      STAGE,
    );
    expect(confirmed[0]).toEqual({ name: STAGE, value: '方案递交阶段', source: 'user' });
  });

  it('is a no-op for a field that holds nothing', () => {
    expect(confirmValue([], STAGE)).toEqual([]);
  });
});
