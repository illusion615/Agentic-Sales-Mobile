/*!
 * Native Dataverse Activity services — appointment, phonecall, email.
 * Each wraps its respective entity set via Power Apps SDK.
 */

import type { AppointmentEntity, PhonecallEntity, EmailEntity } from '../models/ActivityEntityModel';
import type { IGetOptions, IGetAllOptions } from '../models/CommonModels';
import type { IOperationResult } from '@microsoft/power-apps/data';
import { dataSourcesInfo } from '../../../.power/schemas/appschemas/dataSourcesInfo';
import { getClient } from '@microsoft/power-apps/data';

const client = getClient(dataSourcesInfo);

export class AppointmentEntityService {
  private static readonly ds = 'appointments';

  static create(record: Record<string, unknown>): Promise<IOperationResult<AppointmentEntity>> {
    return client.createRecordAsync<Record<string, unknown>, AppointmentEntity>(this.ds, record);
  }
  static update(id: string, fields: Record<string, unknown>): Promise<IOperationResult<AppointmentEntity>> {
    return client.updateRecordAsync<Record<string, unknown>, AppointmentEntity>(this.ds, id, fields);
  }
  static async delete(id: string): Promise<void> {
    await client.deleteRecordAsync(this.ds, id);
  }
  static get(id: string, options?: IGetOptions): Promise<IOperationResult<AppointmentEntity>> {
    return client.retrieveRecordAsync<AppointmentEntity>(this.ds, id, options);
  }
  static getAll(options?: IGetAllOptions): Promise<IOperationResult<AppointmentEntity[]>> {
    return client.retrieveMultipleRecordsAsync<AppointmentEntity>(this.ds, options);
  }
}

export class PhonecallEntityService {
  private static readonly ds = 'phonecalls';

  static create(record: Record<string, unknown>): Promise<IOperationResult<PhonecallEntity>> {
    return client.createRecordAsync<Record<string, unknown>, PhonecallEntity>(this.ds, record);
  }
  static update(id: string, fields: Record<string, unknown>): Promise<IOperationResult<PhonecallEntity>> {
    return client.updateRecordAsync<Record<string, unknown>, PhonecallEntity>(this.ds, id, fields);
  }
  static async delete(id: string): Promise<void> {
    await client.deleteRecordAsync(this.ds, id);
  }
  static get(id: string, options?: IGetOptions): Promise<IOperationResult<PhonecallEntity>> {
    return client.retrieveRecordAsync<PhonecallEntity>(this.ds, id, options);
  }
  static getAll(options?: IGetAllOptions): Promise<IOperationResult<PhonecallEntity[]>> {
    return client.retrieveMultipleRecordsAsync<PhonecallEntity>(this.ds, options);
  }
}

export class EmailEntityService {
  private static readonly ds = 'emails';

  static create(record: Record<string, unknown>): Promise<IOperationResult<EmailEntity>> {
    return client.createRecordAsync<Record<string, unknown>, EmailEntity>(this.ds, record);
  }
  static update(id: string, fields: Record<string, unknown>): Promise<IOperationResult<EmailEntity>> {
    return client.updateRecordAsync<Record<string, unknown>, EmailEntity>(this.ds, id, fields);
  }
  static async delete(id: string): Promise<void> {
    await client.deleteRecordAsync(this.ds, id);
  }
  static get(id: string, options?: IGetOptions): Promise<IOperationResult<EmailEntity>> {
    return client.retrieveRecordAsync<EmailEntity>(this.ds, id, options);
  }
  static getAll(options?: IGetAllOptions): Promise<IOperationResult<EmailEntity[]>> {
    return client.retrieveMultipleRecordsAsync<EmailEntity>(this.ds, options);
  }
}
