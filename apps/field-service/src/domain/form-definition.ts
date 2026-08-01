/**
 * Form definitions, versioned.
 *
 * Which questions a visit must answer varies by job type, so the definitions
 * are DATA held in one store — not a table per form and not code. A definition
 * is published as an immutable version: editing a live form would silently
 * change the meaning of answers already collected under it, so a change is a
 * new version and old versions stay readable forever.
 *
 * Answers are keyed by the opaque field `name`, which is only interpretable
 * against the definition that produced them. Every response therefore records
 * which definition and version it answered.
 */
import type { WorkOrderSummary } from './work-order';

export type FormDefinitionStatus = 'draft' | 'published' | 'retired';

export interface FormApplicability {
  /** Job types this form serves. Empty means it is the fallback for any job. */
  incidentTypes: string[];
}

export interface FormDefinition {
  /** `formId@version`; a version is a distinct, immutable record. */
  id: string;
  /** The logical form, stable across versions. */
  formId: string;
  version: number;
  title: string;
  status: FormDefinitionStatus;
  appliesTo: FormApplicability;
  /** Authoring-tool output, stored verbatim and parsed on read. */
  definition: unknown;
}

/** What a stored response points at to stay interpretable. */
export interface FormDefinitionRef {
  formId: string;
  version: number;
}

export function formDefinitionKey(formId: string, version: number): string {
  return `${formId}@${version}`;
}

export function isFallback(definition: FormDefinition): boolean {
  return definition.appliesTo.incidentTypes.length === 0;
}

/**
 * The definition a job should be answered with.
 *
 * A form naming the job's type wins over the fallback, and the highest
 * published version wins within either group — so publishing a new version
 * switches new visits over without touching the ones already captured.
 * Drafts and retired forms are never served.
 */
export function selectFormDefinition(
  definitions: readonly FormDefinition[],
  workOrder: Pick<WorkOrderSummary, 'incidentType'>,
): FormDefinition | undefined {
  const published = definitions.filter((d) => d.status === 'published');
  const matching = workOrder.incidentType
    ? published.filter((d) => d.appliesTo.incidentTypes.includes(workOrder.incidentType!))
    : [];

  const candidates = matching.length > 0 ? matching : published.filter(isFallback);
  return candidates.sort((a, b) => b.version - a.version)[0];
}
