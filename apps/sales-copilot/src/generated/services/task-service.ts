import { getClient } from '@/lib/power-data';
import type { Task } from '../models/task-model';
import type { IOperationOptions } from '@microsoft/power-apps/data';
import { requireId } from './_adapter-utils';

const DATA_SOURCE_NAME = 'crf5c_tasks';

export class TaskService {
  static async create(record: Omit<Task, 'id'>): Promise<Task> {
    const result = await getClient().createRecordAsync(DATA_SOURCE_NAME, record);
    if (!result.success) throw result.error;
    return result.data as Task;
  }

  static async update(
    id: string,
    changedFields: Partial<Omit<Task, 'id'>>
  ): Promise<Task> {
    requireId(id, 'update', 'Task');
    const result = await getClient().updateRecordAsync(DATA_SOURCE_NAME, id, changedFields);
    if (!result.success) throw result.error;
    return result.data as Task;
  }

  static async delete(id: string): Promise<void> {
    requireId(id, 'delete', 'Task');
    const result = await getClient().deleteRecordAsync(DATA_SOURCE_NAME, id);
    if (!result.success) throw result.error;
  }

  static async get(id: string): Promise<Task> {
    requireId(id, 'get', 'Task');
    const result = await getClient().retrieveRecordAsync(DATA_SOURCE_NAME, id);
    if (!result.success) throw result.error;
    return result.data as Task;
  }

  static async getAll(options?: IOperationOptions): Promise<Task[]> {
    const result = await getClient().retrieveMultipleRecordsAsync(DATA_SOURCE_NAME, options);
    if (!result.success) throw result.error;
    return result.data as Task[];
  }
}