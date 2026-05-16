/**
 * Type definitions for the app-gen-sdk/data shim.
 *
 * In Power Apps, this module is platform-injected and proxies to Dataverse.
 * Locally, we provide an in-memory implementation backed by sample data
 * (and persisted to localStorage), with a future Dataverse Web API mode.
 */

export interface IOperationOptions {
  /**
   * OData-style filter string (subset supported in memory mode):
   *   field eq 'value' | field eq true | field eq 123
   *   joined with `and` / `or`.
   */
  filter?: string;
  /**
   * Sort directives, e.g. ['name1 asc', 'createdon desc'].
   */
  orderBy?: string[];
  /** Cap returned record count. */
  top?: number;
  /** Return only specified fields. Currently a passthrough. */
  select?: string[];
}

export interface IOperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: Error;
}

export interface IDataClient {
  createRecordAsync<T = unknown>(
    dataSource: string,
    record: Record<string, unknown>
  ): Promise<IOperationResult<T>>;

  updateRecordAsync<T = unknown>(
    dataSource: string,
    id: string,
    changedFields: Record<string, unknown>
  ): Promise<IOperationResult<T>>;

  deleteRecordAsync(
    dataSource: string,
    id: string
  ): Promise<IOperationResult<void>>;

  retrieveRecordAsync<T = unknown>(
    dataSource: string,
    id: string
  ): Promise<IOperationResult<T>>;

  retrieveMultipleRecordsAsync<T = unknown>(
    dataSource: string,
    options?: IOperationOptions
  ): Promise<IOperationResult<T[]>>;
}
