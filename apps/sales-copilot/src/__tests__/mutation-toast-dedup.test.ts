import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';

const toastErrorMock = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

// Import after mock so query-client.ts picks up the mocked toast.
async function freshClient() {
  vi.resetModules();
  toastErrorMock.mockClear();
  const mod = await import('@/lib/query-client');
  return mod.queryClient;
}

describe('MutationCache global toast handler', () => {
  beforeEach(() => {
    toastErrorMock.mockClear();
  });

  it('fires a single toast for an inner (leaf) mutation failure', async () => {
    const client = await freshClient();
    const cache = client.getMutationCache();
    const observer = client.getDefaultOptions();
    expect(observer.mutations).toBeDefined();

    // Simulate a leaf mutation failure by triggering MutationCache.onError manually
    // through the same code path: build a Mutation and call onError.
    const mutation = cache.build(client, {
      mutationFn: async () => { throw new Error('inner boom'); },
    });
    try { await mutation.execute(undefined); } catch { /* expected */ }

    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock.mock.calls[0][0]).toContain('inner boom');
  });

  it('suppresses the global toast when mutation meta.suppressGlobalToast is true', async () => {
    const client = await freshClient();
    const cache = client.getMutationCache();

    const mutation = cache.build(client, {
      mutationFn: async () => { throw new Error('outer boom'); },
      meta: { suppressGlobalToast: true },
    });
    try { await mutation.execute(undefined); } catch { /* expected */ }

    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('reproduces the orchestration scenario: inner toasts once, outer suppressed', async () => {
    const client = await freshClient();
    const cache = client.getMutationCache();

    // Inner mutation (no meta) — will trigger global toast on failure.
    const innerMutationFn = vi.fn(async () => {
      throw new Error('Dataverse create returned no primary key for AISummary');
    });

    // Outer mutation invokes inner.mutateAsync inside its mutationFn.
    const outer = cache.build(client, {
      meta: { suppressGlobalToast: true },
      mutationFn: async () => {
        const inner = cache.build(client, { mutationFn: innerMutationFn });
        await inner.execute(undefined);
      },
    });
    try { await outer.execute(undefined); } catch { /* expected */ }

    expect(innerMutationFn).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock.mock.calls[0][0]).toContain('no primary key');
  });
});

// Keep tree-shaking happy and silence unused warnings.
void QueryClient;
void QueryCache;
void MutationCache;
