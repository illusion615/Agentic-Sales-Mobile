import type { CaptureRepository } from '@/domain/ports';
import type { Evidence, WorkSession } from '@/domain/capture';
import type { FormDefinitionRef } from '@/domain/form-definition';
import type { FieldValue } from '@/domain/form-schema';
import type { CustomerUpdateCandidate } from '@/domain/extraction';
import { createIdbCollection } from './idb';

/** Answers live with the session; they are working state, not a separate record. */
interface StoredSession extends WorkSession {
  answers: FieldValue[];
  customerUpdates: CustomerUpdateCandidate[];
}

function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}_${random}`;
}

export function createLocalCaptureRepository(): CaptureRepository {
  const sessions = createIdbCollection<StoredSession>('sessions');
  const evidence = createIdbCollection<Evidence>('evidence');

  async function requireSession(sessionId: string): Promise<StoredSession> {
    const session = await sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    return session;
  }

  return {
    async openSession(workOrderId: string, form?: FormDefinitionRef): Promise<WorkSession> {
      const all = await sessions.all();
      const existing = all.find((s) => s.workOrderId === workOrderId && s.status === 'open');
      if (existing) return existing;

      const session: StoredSession = {
        id: newId('sess'),
        workOrderId,
        startedAt: new Date().toISOString(),
        status: 'open',
        form,
        answers: [],
        customerUpdates: [],
      };
      await sessions.put(session);
      return session;
    },

    getSession(sessionId: string): Promise<WorkSession> {
      return requireSession(sessionId);
    },

    async appendEvidence(input: Omit<Evidence, 'id'>): Promise<Evidence> {
      const record: Evidence = { ...input, id: newId('ev') };
      await evidence.put(record);
      return record;
    },

    async listEvidence(sessionId: string): Promise<Evidence[]> {
      const all = await evidence.all();
      return all
        .filter((e) => e.sessionId === sessionId)
        .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
    },

    async saveAnswers(sessionId: string, values: readonly FieldValue[]): Promise<void> {
      const session = await requireSession(sessionId);
      await sessions.put({ ...session, answers: [...values] });
    },

    async getAnswers(sessionId: string): Promise<FieldValue[]> {
      const session = await requireSession(sessionId);
      return session.answers ?? [];
    },

    async saveCustomerUpdates(sessionId, updates): Promise<void> {
      const session = await requireSession(sessionId);
      await sessions.put({ ...session, customerUpdates: [...updates] });
    },

    async getCustomerUpdates(sessionId: string): Promise<CustomerUpdateCandidate[]> {
      const session = await requireSession(sessionId);
      return session.customerUpdates ?? [];
    },

    async submitSession(sessionId: string, at: string): Promise<void> {
      const session = await requireSession(sessionId);
      await sessions.put({ ...session, status: 'submitted', submittedAt: at });
    },
  };
}
