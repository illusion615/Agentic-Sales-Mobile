// Mock for @microsoft/power-apps/data used in tests
export interface IOperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: Error;
}

export function getClient(_dataSourcesInfo: unknown) {
  return {
    async executeAsync<_TInput, TOutput>(options: {
      connectorOperation: {
        tableName: string;
        operationName: string;
        parameters: unknown;
      };
    }): Promise<IOperationResult<TOutput>> {
      // Default mock — tests can override via vi.mock
      const op = options.connectorOperation;
      console.log(`[mock] executeAsync: ${op.tableName}.${op.operationName}`);
      return { success: true, data: {} as TOutput };
    },
  };
}
