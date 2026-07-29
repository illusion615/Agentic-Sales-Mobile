/**
 * Turning captured fragments into proposed answers.
 *
 * Extraction only ever PROPOSES. Two rules follow from that and are enforced
 * here rather than left to each caller:
 *
 *  - a proposal never overwrites something the technician typed;
 *  - every proposal names the fragments it came from, so it can be checked
 *    rather than trusted.
 */
import type { Evidence } from './capture';
import type { FieldValue, Questionnaire } from './questionnaire';
import type { WorkOrderDetail } from './work-order';

export interface FieldCandidate {
  key: string;
  value: string;
  /** 0–1. Drives review ordering, never gates submission. */
  confidence: number;
  evidenceIds: string[];
}

/**
 * Customer-profile facts noticed during the visit. Kept apart from work order
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
  questionnaire: Questionnaire;
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
 * A field the technician has already filled is left untouched — including one
 * they cleared on purpose, which is why an existing entry blocks a proposal
 * even when its value is empty.
 */
export function mergeCandidates(
  existing: readonly FieldValue[],
  candidates: readonly FieldCandidate[],
): FieldValue[] {
  const merged = [...existing];
  const claimed = new Set(existing.map((v) => v.key));

  for (const candidate of candidates) {
    if (claimed.has(candidate.key)) continue;
    merged.push({
      key: candidate.key,
      value: candidate.value,
      source: 'ai',
      confidence: candidate.confidence,
      evidenceIds: candidate.evidenceIds,
    });
    claimed.add(candidate.key);
  }

  return merged;
}
