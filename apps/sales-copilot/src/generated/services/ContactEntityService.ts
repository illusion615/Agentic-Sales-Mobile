/*!
 * Native Dataverse Contact service.
 * Wraps the standard `contacts` entity set via Power Apps SDK.
 */

import type { ContactEntityBase, ContactEntity } from '../models/ContactEntityModel';
import type { IGetOptions, IGetAllOptions } from '../models/CommonModels';
import type { IOperationResult } from '@microsoft/power-apps/data';
import { dataSourcesInfo } from '../../../.power/schemas/appschemas/dataSourcesInfo';
import { getClient } from '@microsoft/power-apps/data';

export class ContactEntityService {
  private static readonly dataSourceName = 'contacts';
  private static readonly client = getClient(dataSourcesInfo);

  public static async create(record: Omit<ContactEntityBase, 'contactid'>): Promise<IOperationResult<ContactEntity>> {
    return ContactEntityService.client.createRecordAsync<Omit<ContactEntityBase, 'contactid'>, ContactEntity>(
      ContactEntityService.dataSourceName,
      record
    );
  }

  public static async update(id: string, changedFields: Partial<Omit<ContactEntityBase, 'contactid'>>): Promise<IOperationResult<ContactEntity>> {
    return ContactEntityService.client.updateRecordAsync<Partial<Omit<ContactEntityBase, 'contactid'>>, ContactEntity>(
      ContactEntityService.dataSourceName,
      id.toString(),
      changedFields
    );
  }

  public static async delete(id: string): Promise<void> {
    await ContactEntityService.client.deleteRecordAsync(
      ContactEntityService.dataSourceName,
      id.toString()
    );
  }

  public static async get(id: string, options?: IGetOptions): Promise<IOperationResult<ContactEntity>> {
    return ContactEntityService.client.retrieveRecordAsync<ContactEntity>(
      ContactEntityService.dataSourceName,
      id.toString(),
      options
    );
  }

  public static async getAll(options?: IGetAllOptions): Promise<IOperationResult<ContactEntity[]>> {
    return ContactEntityService.client.retrieveMultipleRecordsAsync<ContactEntity>(
      ContactEntityService.dataSourceName,
      options
    );
  }
}
