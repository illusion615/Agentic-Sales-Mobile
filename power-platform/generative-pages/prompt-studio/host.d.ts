// Local-only declarations for the globals the generative-page host injects at
// upload time. Not deployed — `pac model genpage upload` takes the page file
// alone, and the transpiler strips types. This exists so the page can actually
// be type-checked locally, which `pac model genpage transpile` does NOT do.
//
// Shapes follow the documented dataApi contract:
// learn.microsoft.com/power-apps/developer/model-driven-apps/generative-page/data-api
export {};

declare global {
  type TableRow<T> = T;

  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface BaseTableRegistrations {}
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface BaseEnumRegistrations {}

  interface DataTable<TRow> {
    rows: TRow[];
    hasMoreRows: boolean;
    loadMoreRows?: () => Promise<DataTable<TRow>>;
  }

  interface QueryTableOptions {
    select?: string[];
    filter?: string;
    orderBy?: string;
    pageSize?: number;
  }

  interface RetrieveRowOptions {
    id: string;
    select?: string[];
  }

  interface BaseUxAgentDataApi<TTables, TEnums> {
    // Documented as returning the new row's Guid, but the runtime does not always
    // hand back a plain string — callers must resolve the id defensively.
    createRow<K extends keyof TTables & string>(
      tableName: K,
      row: Partial<TTables[K]>,
    ): Promise<unknown>;
    updateRow<K extends keyof TTables & string>(
      tableName: K,
      rowId: string,
      row: Partial<TTables[K]>,
    ): Promise<void>;
    deleteRow<K extends keyof TTables & string>(tableName: K, rowId: string): Promise<void>;
    retrieveRow<K extends keyof TTables & string>(
      tableName: K,
      options: RetrieveRowOptions,
    ): Promise<TTables[K]>;
    queryTable<K extends keyof TTables & string>(
      tableName: K,
      query: QueryTableOptions,
    ): Promise<DataTable<TTables[K]>>;
    getChoices(enumName: keyof TEnums & string): Promise<Array<{ label: string; value: number }>>;
  }
}
