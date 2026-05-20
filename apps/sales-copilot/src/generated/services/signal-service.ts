import { getClient } from '@/lib/power-data';
import type { Signal } from '../models/signal-model';
import type { IOperationOptions } from '@microsoft/power-apps/data';

const DATA_SOURCE_NAME = 'crf5c_signals';

export class SignalService {
  static async create(record: Omit<Signal, 'id'>): Promise<Signal> {
    const result = await getClient().createRecordAsync(DATA_SOURCE_NAME, record);
    if (!result.success) throw result.error;
    return result.data as Signal;
  }

  static async update(
    id: string,
    changedFields: Partial<Omit<Signal, 'id'>>
  ): Promise<Signal> {
    const result = await getClient().updateRecordAsync(DATA_SOURCE_NAME, id, changedFields);
    if (!result.success) throw result.error;
    return result.data as Signal;
  }

  static async delete(id: string): Promise<void> {
    const result = await getClient().deleteRecordAsync(DATA_SOURCE_NAME, id);
    if (!result.success) throw result.error;
  }

  static async get(id: string): Promise<Signal> {
    const result = await getClient().retrieveRecordAsync(DATA_SOURCE_NAME, id);
    if (!result.success) throw result.error;
    return result.data as Signal;
  }

  static async getAll(options?: IOperationOptions): Promise<Signal[]> {
    const result = await getClient().retrieveMultipleRecordsAsync(DATA_SOURCE_NAME, options);
    if (!result.success) throw result.error;
    return result.data as Signal[];
  }
}