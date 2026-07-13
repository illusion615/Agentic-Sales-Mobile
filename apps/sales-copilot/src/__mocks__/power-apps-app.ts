// Mock for @microsoft/power-apps/app used in tests.
// The real subpath resolves to the SDK's dist/app entry, which uses
// extensionless internal imports that vitest's ESM loader can't resolve. Any
// module in an import chain that reads the signed-in user (getContext) would
// otherwise fail to load. Individual tests can still override via vi.mock.
export interface IUserContext {
  user: {
    objectId: string;
    fullName: string;
    userPrincipalName: string;
  };
}

export async function getContext(): Promise<IUserContext> {
  return {
    user: {
      objectId: '',
      fullName: '',
      userPrincipalName: '',
    },
  };
}
