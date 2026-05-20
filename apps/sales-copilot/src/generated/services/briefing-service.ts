import { getClient } from '@/lib/power-data';
import type { Briefing } from '../models/briefing-model';
import type { IOperationOptions } from '@microsoft/power-apps/data';

const DATA_SOURCE_NAME = 'crf5c_briefings';

export class BriefingService {
  static async create(record: Omit<Briefing, 'id'>): Promise<Briefing> {
    const result = await getClient().createRecordAsync(DATA_SOURCE_NAME, record);
    if (!result.success) throw result.error;
    return result.data as Briefing;
  }

  static async update(
    id: string,
    changedFields: Partial<Omit<Briefing, 'id'>>
  ): Promise<Briefing> {
    const result = await getClient().updateRecordAsync(DATA_SOURCE_NAME, id, changedFields);
    if (!result.success) throw result.error;
    return result.data as Briefing;
  }

  static async delete(id: string): Promise<void> {
    const result = await getClient().deleteRecordAsync(DATA_SOURCE_NAME, id);
    if (!result.success) throw result.error;
  }

  static async get(id: string): Promise<Briefing> {
    const result = await getClient().retrieveRecordAsync(DATA_SOURCE_NAME, id);
    if (!result.success) throw result.error;
    return result.data as Briefing;
  }

  static async getAll(options?: IOperationOptions): Promise<Briefing[]> {
    const result = await getClient().retrieveMultipleRecordsAsync(DATA_SOURCE_NAME, options);
    if (!result.success) throw result.error;
    return result.data as Briefing[];
  }
}