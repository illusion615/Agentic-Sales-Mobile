/**
 * On-site capture.
 *
 * A visit produces fragments — a spoken remark, a photo, a typed note — in
 * whatever order the work happens. They are stored append-only: nothing the
 * technician captured is ever rewritten or dropped, and extraction reads them
 * rather than replacing them. That is what makes every proposed field value
 * traceable back to what was actually observed.
 */

export type EvidenceKind = 'text' | 'photo' | 'voice';

export interface Evidence {
  id: string;
  sessionId: string;
  kind: EvidenceKind;
  capturedAt: string;
  /** The note, the transcript, or the caption — whatever carries meaning. */
  text?: string;
  /** Data URL, for photos. */
  image?: string;
}

export type WorkSessionStatus = 'open' | 'submitted';

export interface WorkSession {
  id: string;
  workOrderId: string;
  startedAt: string;
  submittedAt?: string;
  status: WorkSessionStatus;
}

/** Evidence that carries readable content, oldest first. */
export function readableEvidence(evidence: readonly Evidence[]): Evidence[] {
  return [...evidence]
    .filter((e) => (e.text ?? '').trim().length > 0)
    .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
}
