/**
 * The work order questionnaire, and how complete it is.
 *
 * Which questions a job must answer depends on the kind of job, so the form is
 * selected by incident type. Completeness is computed here, deterministically,
 * and never asked of the model: a model may propose an answer, but whether the
 * form can be submitted is a rule, not an opinion.
 */

export type QuestionKind = 'text' | 'number' | 'choice' | 'boolean';

export interface QuestionField {
  key: string;
  label: string;
  kind: QuestionKind;
  /** Required fields block submission and drive the "what is missing" prompt. */
  required: boolean;
  choices?: string[];
  unit?: string;
  /** Shown when the field is still empty, to tell the technician what to capture. */
  hint?: string;
}

export interface Questionnaire {
  incidentType: string;
  fields: QuestionField[];
}

const COMMON_CLOSING: QuestionField[] = [
  { key: 'resolution', label: '处理过程与结果', kind: 'text', required: true, hint: '说明做了什么、是否恢复正常' },
  { key: 'resolved', label: '是否已解决', kind: 'boolean', required: true },
  { key: 'followUp', label: '后续跟进事项', kind: 'text', required: false },
];

const QUESTIONNAIRES: Record<string, QuestionField[]> = {
  透析机停机: [
    { key: 'faultCode', label: '报警代码', kind: 'text', required: true, hint: '面板显示的报警编号' },
    { key: 'rootCause', label: '故障原因', kind: 'text', required: true },
    { key: 'partsReplaced', label: '更换部件', kind: 'text', required: false },
    { key: 'conductivity', label: '电导率', kind: 'number', required: false, unit: 'mS/cm' },
    ...COMMON_CLOSING,
  ],
  监护仪校准: [
    { key: 'deviceCount', label: '校准台数', kind: 'number', required: true },
    { key: 'calibrationResult', label: '校准结论', kind: 'choice', required: true, choices: ['合格', '不合格'] },
    { key: 'reportNo', label: '校准报告编号', kind: 'text', required: false },
    ...COMMON_CLOSING,
  ],
  预防性维护: [
    { key: 'checklistDone', label: '保养项目是否全部完成', kind: 'boolean', required: true },
    { key: 'consumables', label: '更换的耗材', kind: 'text', required: false },
    ...COMMON_CLOSING,
  ],
};

const DEFAULT_FIELDS: QuestionField[] = [
  { key: 'findings', label: '现场情况', kind: 'text', required: true },
  ...COMMON_CLOSING,
];

export function questionnaireFor(incidentType: string | undefined): Questionnaire {
  const fields = (incidentType && QUESTIONNAIRES[incidentType]) || DEFAULT_FIELDS;
  return { incidentType: incidentType ?? '通用', fields };
}

/** Where a value came from — a proposal must never look like a confirmation. */
export type ValueSource = 'ai' | 'user';

export interface FieldValue {
  key: string;
  value: string;
  source: ValueSource;
  /** 0–1. Only meaningful for proposals. */
  confidence?: number;
  /** Which captured fragments produced this, so the technician can check it. */
  evidenceIds?: string[];
}

export interface Completeness {
  /** 0–1 over required fields only; optional fields never gate submission. */
  ratio: number;
  answeredRequired: number;
  totalRequired: number;
  missingRequired: QuestionField[];
  /** True once every required field holds a non-empty value. */
  submittable: boolean;
}

function hasValue(values: readonly FieldValue[], key: string): boolean {
  const found = values.find((v) => v.key === key);
  return !!found && found.value.trim().length > 0;
}

export function assessCompleteness(
  questionnaire: Questionnaire,
  values: readonly FieldValue[],
): Completeness {
  const required = questionnaire.fields.filter((f) => f.required);
  const missingRequired = required.filter((f) => !hasValue(values, f.key));
  const answeredRequired = required.length - missingRequired.length;

  return {
    ratio: required.length === 0 ? 1 : answeredRequired / required.length,
    answeredRequired,
    totalRequired: required.length,
    missingRequired,
    submittable: missingRequired.length === 0,
  };
}
