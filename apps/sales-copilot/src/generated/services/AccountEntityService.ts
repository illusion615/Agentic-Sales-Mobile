/*!
 * Native Dataverse Account service.
 * Wraps the standard `accounts` entity set via Power Apps SDK.
 */

import type { AccountBase, AccountEntity } from '../models/AccountEntityModel';
import type { IGetOptions, IGetAllOptions } from '../models/CommonModels';
import type { IOperationResult } from '@microsoft/power-apps/data';
import { dataSourcesInfo } from '../../../.power/schemas/appschemas/dataSourcesInfo';
import { getClient } from '@microsoft/power-apps/data';

export class AccountEntityService {
  private static readonly dataSourceName = 'accounts';
  private static readonly client = getClient(dataSourcesInfo);

  public static async create(record: Omit<AccountBase, 'accountid'>): Promise<IOperationResult<AccountEntity>> {
    return AccountEntityService.client.createRecordAsync<Omit<AccountBase, 'accountid'>, AccountEntity>(
      AccountEntityService.dataSourceName,
      record
    );
  }

  public static async update(id: string, changedFields: Partial<Omit<AccountBase, 'accountid'>>): Promise<IOperationResult<AccountEntity>> {
    return AccountEntityService.client.updateRecordAsync<Partial<Omit<AccountBase, 'accountid'>>, AccountEntity>(
      AccountEntityService.dataSourceName,
      id.toString(),
      changedFields
    );
  }

  public static async delete(id: string): Promise<void> {
    await AccountEntityService.client.deleteRecordAsync(
      AccountEntityService.dataSourceName,
      id.toString()
    );
  }

  public static async get(id: string, options?: IGetOptions): Promise<IOperationResult<AccountEntity>> {
    return AccountEntityService.client.retrieveRecordAsync<AccountEntity>(
      AccountEntityService.dataSourceName,
      id.toString(),
      options
    );
  }

  public static async getAll(options?: IGetAllOptions): Promise<IOperationResult<AccountEntity[]>> {
    return AccountEntityService.client.retrieveMultipleRecordsAsync<AccountEntity>(
      AccountEntityService.dataSourceName,
      options
    );
  }
}
