/**
 * Turning captured fragments into proposed answers.
 *
 * Extraction only ever PROPOSES. Two rules follow from that and are enforced
 * here rather than left to each caller:
 *
 *  - a proposal never overwrites something the technician entered or locked;
 *  - a later proposal may revise earlier, still-unlocked AI content;
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
}

/**
 * Fold proposals into the working answers.
 *
 * Human-entered, locked, and prefilled values are left untouched. An AI
 * proposal remains provisional, so a later extraction can revise it when a
 * technician adds a correction or more precise evidence.
 */
export function mergeCandidates(
  existing: readonly FieldValue[],
  candidates: readonly FieldCandidate[],
): FieldValue[] {
  const merged = [...existing];
  const protectedNames = new Set(existing.filter((value) => value.source !== 'ai').map((value) => value.name));

  for (const candidate of candidates) {
    if (protectedNames.has(candidate.name)) continue;
    const previousIndex = merged.findIndex((value) => value.name === candidate.name);
    const proposal: FieldValue = {
      name: candidate.name,
      value: candidate.value,
      source: 'ai',
      confidence: candidate.confidence,
      evidenceIds: candidate.evidenceIds,
    };

    if (previousIndex >= 0) {
      merged[previousIndex] = proposal;
      continue;
    }
    merged.push({
      ...proposal,
    });
  }

  return merged;
}
