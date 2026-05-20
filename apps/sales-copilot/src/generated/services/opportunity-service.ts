import { getClient } from '@/lib/power-data';
import type { Opportunity } from '../models/opportunity-model';
import type { IOperationOptions } from '@microsoft/power-apps/data';

const DATA_SOURCE_NAME = 'crf5c_opportunity1s';

export class OpportunityService {
  static async create(record: Omit<Opportunity, 'id'>): Promise<Opportunity> {
    const result = await getClient().createRecordAsync(DATA_SOURCE_NAME, record);
    if (!result.success) throw result.error;
    return result.data as Opportunity;
  }

  static async update(
    id: string,
    changedFields: Partial<Omit<Opportunity, 'id'>>
  ): Promise<Opportunity> {
    const result = await getClient().updateRecordAsync(DATA_SOURCE_NAME, id, changedFields);
    if (!result.success) throw result.error;
    return result.data as Opportunity;
  }

  static async delete(id: string): Promise<void> {
    const result = await getClient().deleteRecordAsync(DATA_SOURCE_NAME, id);
    if (!result.success) throw result.error;
  }

  static async get(id: string): Promise<Opportunity> {
    const result = await getClient().retrieveRecordAsync(DATA_SOURCE_NAME, id);
    if (!result.success) throw result.error;
    return result.data as Opportunity;
  }

  static async getAll(options?: IOperationOptions): Promise<Opportunity[]> {
    const result = await getClient().retrieveMultipleRecordsAsync(DATA_SOURCE_NAME, options);
    if (!result.success) throw result.error;
    return result.data as Opportunity[];
  }
}