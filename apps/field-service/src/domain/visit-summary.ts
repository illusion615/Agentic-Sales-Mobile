/**
 * The summary shown at the top of review.
 *
 * Distinct from the per-section headlines beside it. A headline states a fact
 * that can be counted — how many fields are missing — so it is computed, not
 * written. This is the other kind: what the visit amounted to, which means
 * reading the answers together. That is a job for a language model, so it goes
 * through a provider and carries its provenance.
 */
import type { FieldValue, FormSchema } from './form-schema';
import type { WorkOrderDetail } from './work-order';

export interface VisitSummary {
  /** A short paragraph a service manager could read on its own. */
  text: string;
  /** The few things worth pulling out, already phrased for display. */
  highlights: string[];
}

export interface VisitSummaryInput {
  workOrder: WorkOrderDetail;
  schema: FormSchema;
  values: readonly FieldValue[];
}
