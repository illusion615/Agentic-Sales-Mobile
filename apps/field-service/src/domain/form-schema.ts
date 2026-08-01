/**
 * Work order form schema.
 *
 * The form is DATA, not code: which sections and fields a job must answer
 * varies by customer, business line and job type, and the definitions will be
 * served from Dataverse. Nothing here may hardcode a particular form.
 *
 * Field identity is the opaque `name` assigned by whoever authored the form
 * (for example `id-1774854799612-750`). It is meaningless to read but stable to
 * store, so answers are keyed by it. Anything that needs to understand a field
 * — a person, or a model proposing an answer — must work from its `label`,
 * `type` and `options` instead.
 */

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'single-select'
  | 'multi-select'
  | 'boolean'
  /** A widget this app implements itself; see `customType`. */
  | 'custom';

export interface FormFieldOption {
  key: string;
  label: string;
}

export interface FormField {
  /** Opaque, author-assigned identifier. Answers are keyed by this. */
  name: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  readonly: boolean;
  options?: FormFieldOption[];
  /** Which widget to mount when `type` is 'custom'. */
  customType?: string;
  /**
   * Prefill expression from the form definition, kept verbatim. It is
   * interpreted by a restricted evaluator, never executed — see
   * `form-expression.ts`.
   */
  prefill?: string;
}

export interface FormSection {
  key: string;
  title: string;
  fields: FormField[];
}

export interface FormSchema {
  id: string;
  /** Human name of the form, for display and diagnostics. */
  title: string;
  sections: FormSection[];
}

export type FormValue = string | string[] | number | boolean | null;

/** Where an answer came from. A proposal must never look like a confirmation. */
export type ValueSource = 'ai' | 'user' | 'prefill';

export interface FieldValue {
  name: string;
  value: FormValue;
  source: ValueSource;
  /** 0–1. Only meaningful for proposals. */
  confidence?: number;
  /** Captured fragments that produced this, so it can be checked. */
  evidenceIds?: string[];
}

export function allFields(schema: FormSchema): FormField[] {
  return schema.sections.flatMap((section) => section.fields);
}

export function findField(schema: FormSchema, name: string): FormField | undefined {
  return allFields(schema).find((field) => field.name === name);
}

/** The label without its authoring ornaments — leading numbering, trailing punctuation. */
export function plainLabel(field: FormField): string {
  return field.label.replace(/^\s*\d+\s*[、.．)）]\s*/, '').replace(/[：:？?\s]+$/, '');
}

/** An answer as a person would read it: option labels, not stored keys. */
export function answerText(field: FormField, value: FormValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value.map((key) => field.options?.find((o) => o.key === key)?.label ?? key).join('、');
  }
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (field.options && typeof value === 'string') {
    return field.options.find((o) => o.key === value)?.label ?? value;
  }
  return String(value);
}

/**
 * Whether a value counts as answered.
 *
 * Type-aware on purpose: an empty multi-select array and a blank string are
 * both "not answered", while `false` is a real answer to a yes/no question.
 */
export function isAnswered(value: FormValue | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function valueOf(values: readonly FieldValue[], name: string): FieldValue | undefined {
  return values.find((v) => v.name === name);
}

export interface Completeness {
  /** 0–1 over required fields only; optional fields never gate submission. */
  ratio: number;
  answeredRequired: number;
  totalRequired: number;
  missingRequired: FormField[];
  /** True once every required field holds a value. */
  submittable: boolean;
}

/**
 * Completeness is computed here, deterministically, and never asked of a model.
 * A model may propose an answer; whether the form can be submitted is a rule.
 */
export function assessCompleteness(
  schema: FormSchema,
  values: readonly FieldValue[],
): Completeness {
  const required = allFields(schema).filter((field) => field.required);
  const missingRequired = required.filter((field) => !isAnswered(valueOf(values, field.name)?.value));
  const answeredRequired = required.length - missingRequired.length;

  return {
    ratio: required.length === 0 ? 1 : answeredRequired / required.length,
    answeredRequired,
    totalRequired: required.length,
    missingRequired,
    submittable: missingRequired.length === 0,
  };
}

/** Replace one answer, marking it as the technician's own. */
export function setUserValue(
  values: readonly FieldValue[],
  name: string,
  value: FormValue,
): FieldValue[] {
  // An edit drops the proposal's confidence and provenance along with it.
  return [...values.filter((v) => v.name !== name), { name, value, source: 'user' }];
}

/**
 * Accept a proposal as it stands. The value does not change; who stands behind
 * it does, which is the whole point of review.
 */
export function confirmValue(values: readonly FieldValue[], name: string): FieldValue[] {
  const entry = values.find((v) => v.name === name);
  if (!entry) return [...values];
  return [...values.filter((v) => v.name !== name), { name, value: entry.value, source: 'user' }];
}
