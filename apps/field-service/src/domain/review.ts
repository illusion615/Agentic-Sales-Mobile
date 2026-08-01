/**
 * What a review screen needs to know about each section.
 *
 * A review is not a form dump: its job is to direct attention. So each section
 * is classified by what it still wants from the technician, and that judgement
 * lives here — as data the UI renders, not as conditions scattered through a
 * component.
 *
 * Note the deliberate gap between "answered" and "settled". A field carrying an
 * unconfirmed proposal counts as answered for completeness — it has a value, so
 * it cannot block submission — but the section is not settled until a person
 * has stood behind that value.
 */
import type { FieldValue, FormField, FormSchema, FormSection } from './form-schema';
import { answerText, isAnswered, valueOf } from './form-schema';

export type SectionStatus =
  /** Required fields are still empty. Blocks submission. */
  | 'needs-input'
  /** Complete, but holding values nobody has confirmed yet. */
  | 'needs-review'
  /** Complete and confirmed. */
  | 'settled'
  /** Nothing required, nothing filled — there is simply nothing to see. */
  | 'blank';

export interface SectionReview {
  section: FormSection;
  status: SectionStatus;
  answered: number;
  total: number;
  missingRequired: FormField[];
  /** Fields still holding a machine proposal. */
  unconfirmed: FormField[];
  /** State in words: what this section wants, if anything. */
  headline: string;
  /** Gist of the content, so a collapsed section still says something. */
  digest: string;
  /**
   * Sections that want something open themselves, so scrolling reveals the
   * work. Settled ones stay shut until asked for.
   */
  defaultOpen: boolean;
}

function labelForValue(field: FormField, value: FieldValue['value']): string {
  const text = answerText(field, value);
  return text.length > 14 ? `${text.slice(0, 14)}…` : text;
}

function digestOf(section: FormSection, values: readonly FieldValue[]): string {
  const parts: string[] = [];
  for (const field of section.fields) {
    const entry = valueOf(values, field.name);
    if (!isAnswered(entry?.value)) continue;
    const rendered = labelForValue(field, entry!.value);
    if (rendered) parts.push(rendered);
    if (parts.length === 3) break;
  }
  return parts.join(' · ');
}

function headlineOf(status: SectionStatus, missing: number, unconfirmed: number, answered: number, total: number): string {
  switch (status) {
    case 'needs-input':
      return `缺 ${missing} 项必填`;
    case 'needs-review':
      return `${unconfirmed} 项待确认`;
    case 'blank':
      return '暂未填写';
    case 'settled':
      return `已完成 ${answered}/${total} 项`;
  }
}

export function reviewSection(section: FormSection, values: readonly FieldValue[]): SectionReview {
  const answerable = section.fields.filter((field) => field.type !== 'custom');
  const answered = answerable.filter((field) => isAnswered(valueOf(values, field.name)?.value)).length;
  const missingRequired = section.fields.filter(
    (field) => field.required && !isAnswered(valueOf(values, field.name)?.value),
  );
  const unconfirmed = section.fields.filter((field) => valueOf(values, field.name)?.source === 'ai');

  const status: SectionStatus =
    missingRequired.length > 0
      ? 'needs-input'
      : unconfirmed.length > 0
        ? 'needs-review'
        : answered === 0
          ? 'blank'
          : 'settled';

  return {
    section,
    status,
    answered,
    total: answerable.length,
    missingRequired,
    unconfirmed,
    headline: headlineOf(status, missingRequired.length, unconfirmed.length, answered, answerable.length),
    digest: digestOf(section, values),
    defaultOpen: status === 'needs-input' || status === 'needs-review',
  };
}

export function reviewSections(schema: FormSchema, values: readonly FieldValue[]): SectionReview[] {
  return schema.sections.map((section) => reviewSection(section, values));
}

/** Sections still wanting something, in the order they appear. */
export function sectionsNeedingAttention(reviews: readonly SectionReview[]): SectionReview[] {
  return reviews.filter((review) => review.status === 'needs-input' || review.status === 'needs-review');
}
