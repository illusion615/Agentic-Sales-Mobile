import { getClient } from '@/lib/power-data';
import type { BusinessInsight } from '../models/business-insight-model';
import type { IOperationOptions } from '@microsoft/power-apps/data';

const DATA_SOURCE_NAME = 'crf5c_businessinsights';

export class BusinessInsightService {
  static async create(record: Omit<BusinessInsight, 'id'>): Promise<BusinessInsight> {
    const result = await getClient().createRecordAsync(DATA_SOURCE_NAME, record);
    if (!result.success) throw result.error;
    return result.data as BusinessInsight;
  }

  static async update(
    id: string,
    changedFields: Partial<Omit<BusinessInsight, 'id'>>
  ): Promise<BusinessInsight> {
    const result = await getClient().updateRecordAsync(DATA_SOURCE_NAME, id, changedFields);
    if (!result.success) throw result.error;
    return result.data as BusinessInsight;
  }

  static async delete(id: string): Promise<void> {
    const result = await getClient().deleteRecordAsync(DATA_SOURCE_NAME, id);
    if (!result.success) throw result.error;
  }

  static async get(id: string): Promise<BusinessInsight> {
    const result = await getClient().retrieveRecordAsync(DATA_SOURCE_NAME, id);
    if (!result.success) throw result.error;
    return result.data as BusinessInsight;
  }

  static async getAll(options?: IOperationOptions): Promise<BusinessInsight[]> {
    const result = await getClient().retrieveMultipleRecordsAsync(DATA_SOURCE_NAME, options);
    if (!result.success) throw result.error;
    return result.data as BusinessInsight[];
  }
}