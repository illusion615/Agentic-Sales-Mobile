/**
 * Progress stated in the words of the job at hand.
 *
 * "信息完整度 2/6" describes a form; a technician standing in front of the
 * equipment needs to know what THIS visit still lacks. So the sentence names
 * the asset or fault being worked on and quotes the outstanding questions as
 * the form asks them, rather than reporting a count over opaque fields.
 */
import type { WorkOrderDetail } from './work-order';
import { assessCompleteness, plainLabel, type FieldValue, type FormSchema } from './form-schema';

export type CaptureStage = 'blank' | 'gathering' | 'nearly' | 'ready';

export interface CaptureProgress {
  stage: CaptureStage;
  /** 0–100 over required fields only. */
  percent: number;
  headline: string;
  /** Outstanding required questions, worded as the form asks them. */
  missing: string[];
  submittable: boolean;
}

/** What this visit is about, preferring the most concrete thing known. */
function subjectOf(workOrder: Pick<WorkOrderDetail, 'assetName' | 'incidentType'>): string {
  return workOrder.assetName ?? workOrder.incidentType ?? '本次服务';
}

export function captureProgress(
  workOrder: Pick<WorkOrderDetail, 'assetName' | 'incidentType'>,
  schema: FormSchema,
  answers: readonly FieldValue[],
): CaptureProgress {
  const completeness = assessCompleteness(schema, answers);
  const missing = completeness.missingRequired.map(plainLabel);
  const subject = subjectOf(workOrder);
  const percent = Math.round(completeness.ratio * 100);

  if (completeness.submittable) {
    return {
      stage: 'ready',
      percent,
      headline: `${subject}的记录已齐全，可以完成服务并进入客户验收`,
      missing,
      submittable: true,
    };
  }

  if (completeness.answeredRequired === 0) {
    return {
      stage: 'blank',
      percent,
      headline: `说说${subject}现在的情况，记下的内容会自动整理进表单`,
      missing,
      submittable: false,
    };
  }

  // Few enough to name them all: knowing exactly what is left beats a number.
  if (missing.length <= 2) {
    return {
      stage: 'nearly',
      percent,
      headline: `还差${missing.join('、')}，就能提交了`,
      missing,
      submittable: false,
    };
  }

  return {
    stage: 'gathering',
    percent,
    headline: `${subject}还差 ${missing.length} 项：${missing.slice(0, 2).join('、')} 等`,
    missing,
    submittable: false,
  };
}
