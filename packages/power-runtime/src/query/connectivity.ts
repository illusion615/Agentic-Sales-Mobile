import { useSyncExternalStore } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useOnlineStatus } from '../react/use-online-status';

/**
 * App-level connectivity signal.
 *
 * The app is "effectively offline" when EITHER the browser has no network OR
 * the backend is unreachable. Both matter because every network feature — data
 * reads and writes, and any AI that rides on the same connection — is unusable
 * in either case. UI keys off this single signal so separate surfaces never
 * disagree.
 *
 * Backend reachability is INFERRED from designated probe queries rather than
 * polled: if a probe has settled in error the backend is unreachable; a success
 * flips it back. Which queries are trustworthy probes is app knowledge, so the
 * caller names them.
 */

export interface ConnectivityOptions {
  queryClient: QueryClient;
  /**
   * Query-key prefixes whose success/error reflects backend reachability.
   * Choose adapters that THROW on failure — one that swallows errors into an
   * empty result never reports an error and would pin the signal to reachable.
   */
  probeKeyPrefixes: readonly string[];
}

export interface Connectivity {
  /** Non-reactive read, for use outside React (e.g. a send gate). */
  isBackendReachable(): boolean;
  /** Reactive: true while the backend appears reachable. */
  useBackendReachable(): boolean;
  /**
   * Reactive: true when the app should behave as offline — no network OR the
   * backend is unreachable.
   */
  useEffectiveOffline(): boolean;
}

export function createConnectivity(options: ConnectivityOptions): Connectivity {
  const prefixes = new Set(options.probeKeyPrefixes);
  let reachable = true;
  const listeners = new Set<() => void>();

  function recompute(): void {
    const probes = options.queryClient
      .getQueryCache()
      .getAll()
      .filter((q) => Array.isArray(q.queryKey) && prefixes.has(q.queryKey[0] as string));
    const settled = probes.filter((q) => q.state.status === 'success' || q.state.status === 'error');
    if (settled.length === 0) return; // no evidence yet — keep the last known value
    // Reachable if at least one probe currently holds a successful result.
    const next = settled.some((q) => q.state.status === 'success');
    if (next !== reachable) {
      reachable = next;
      listeners.forEach((l) => l());
    }
  }

  options.queryClient.getQueryCache().subscribe(recompute);

  function subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }

  const isBackendReachable = () => reachable;

  function useBackendReachable(): boolean {
    return useSyncExternalStore(subscribe, isBackendReachable, () => true);
  }

  return {
    isBackendReachable,
    useBackendReachable,
    useEffectiveOffline(): boolean {
      const online = useOnlineStatus();
      const backendReachable = useBackendReachable();
      return !online || !backendReachable;
    },
  };
}
