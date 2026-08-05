import type { AcceptanceRepository } from '@/domain/ports';
import type { AcceptanceRecord } from '@/domain/acceptance';
import { createIdbCollection } from './idb';

export function createLocalAcceptanceRepository(): AcceptanceRepository {
  const records = createIdbCollection<AcceptanceRecord>('acceptances');

  return {
    async getOrCreate(workOrderId, templateId) {
      const existing = (await records.all()).find((record) => record.workOrderId === workOrderId);
      if (existing) return existing;
      const record: AcceptanceRecord = {
        id: `acceptance_${crypto.randomUUID()}`,
        workOrderId,
        templateId,
        status: 'draft',
        items: [],
      };
      await records.put(record);
      return record;
    },
    save: (record) => records.put(record),
  };
}