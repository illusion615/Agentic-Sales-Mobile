/**
 * Turning captured fragments into proposed answers.
 *
 * Extraction only ever PROPOSES. Two rules follow from that and are enforced
 * here rather than left to each caller:
 *
 *  - a proposal never overwrites something the technician entered;
 *  - every proposal names the fragments it came from, so it can be checked
 *    rather than trusted.
 *
 * Candidates are keyed by the form's opaque field `name`, but nothing may be
 * inferred FROM that name: it is author-assigned and meaningless. An extractor
 * works from the field's label, type and options — which is also exactly what a
 * language model will be given.
 */
import type { Evidence } from './capture';
import type { FieldValue, FormSchema, FormValue } from './form-schema';
import type { WorkOrderDetail } from './work-order';

export interface FieldCandidate {
  name: string;
  value: FormValue;
  /** 0–1. Drives review ordering, never gates submission. */
  confidence: number;
  evidenceIds: string[];
}

/**
 * Customer-profile facts noticed during the visit. Kept apart from form
 * answers because they outlive the job and are reviewed separately.
 */
export type CustomerUpdateField = 'siteAccessNotes' | 'caution' | 'contact';

export interface CustomerUpdateCandidate {
  field: CustomerUpdateField;
  value: string;
  confidence: number;
  evidenceIds: string[];
}

export interface ExtractionInput {
  workOrder: WorkOrderDetail;
  schema: FormSchema;
  evidence: readonly Evidence[];
}

export interface ExtractionResult {
  fields: FieldCandidate[];
  customerUpdates: CustomerUpdateCandidate[];
  /** Provenance, shown in review so a rules-derived proposal is labelled as such. */
  source: 'ai' | 'rules';
}

/**
 * Fold proposals into the working answers.
 *
 * A field already carrying an entry is left untouched — including one the
 * technician cleared on purpose, which is why an existing entry blocks a
 * proposal even when its value is empty. Prefilled values are treated the same
 * way: they came from the record, so they outrank a guess.
 */
export function mergeCandidates(
  existing: readonly FieldValue[],
  candidates: readonly FieldCandidate[],
): FieldValue[] {
  const merged = [...existing];
  const claimed = new Set(existing.map((v) => v.name));

  for (const candidate of candidates) {
    if (claimed.has(candidate.name)) continue;
    merged.push({
      name: candidate.name,
      value: candidate.value,
      source: 'ai',
      confidence: candidate.confidence,
      evidenceIds: candidate.evidenceIds,
    });
    claimed.add(candidate.name);
  }

  return merged;
}
