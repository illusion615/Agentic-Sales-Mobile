import { getClient } from '@/lib/power-data';
import type { Setting } from '../models/setting-model';
import type { IOperationOptions } from '@microsoft/power-apps/data';

const DATA_SOURCE_NAME = 'crf5c_settings';

export class SettingService {
  static async create(record: Omit<Setting, 'id'>): Promise<Setting> {
    const result = await getClient().createRecordAsync(DATA_SOURCE_NAME, record);
    if (!result.success) throw result.error;
    return result.data as Setting;
  }

  static async update(
    id: string,
    changedFields: Partial<Omit<Setting, 'id'>>
  ): Promise<Setting> {
    const result = await getClient().updateRecordAsync(DATA_SOURCE_NAME, id, changedFields);
    if (!result.success) throw result.error;
    return result.data as Setting;
  }

  static async delete(id: string): Promise<void> {
    const result = await getClient().deleteRecordAsync(DATA_SOURCE_NAME, id);
    if (!result.success) throw result.error;
  }

  static async get(id: string): Promise<Setting> {
    const result = await getClient().retrieveRecordAsync(DATA_SOURCE_NAME, id);
    if (!result.success) throw result.error;
    return result.data as Setting;
  }

  static async getAll(options?: IOperationOptions): Promise<Setting[]> {
    const result = await getClient().retrieveMultipleRecordsAsync(DATA_SOURCE_NAME, options);
    if (!result.success) throw result.error;
    return result.data as Setting[];
  }
}