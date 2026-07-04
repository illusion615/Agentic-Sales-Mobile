/**
 * App-level connectivity signal.
 *
 * The app is "effectively offline" when EITHER the browser has no network OR the
 * Dataverse backend is unreachable. Both matter because every network feature —
 * data reads/writes AND the AI copilot (its LLM call rides on the same Dataverse
 * connection) — is unusable in either case. UI (the status badge, the copilot
 * gate) keys off this single signal so they never disagree.
 *
 * Dataverse reachability is inferred from the core list queries: if the account
 * or opportunity read has settled in error, the backend is unreachable; a
 * success flips it back. This mirrors what the home dashboard already observes,
 * exposed globally so the copilot (mounted outside the dashboard) can read it.
 */
import { useSyncExternalStore } from 'react';
import { queryClient } from './query-client';
import { useOnlineStatus } from '@/hooks/use-online-status';

// Query-key prefixes whose success/error reflects backend reachability. These
// adapters throw on failure (reliable error signal); the activity adapter
// swallows errors to empty, so it is intentionally not used here.
const PROBE_PREFIXES = ['account-list', 'opportunity-list'];

let reachable = true;
const listeners = new Set<() => void>();

function recompute(): void {
  const probes = queryClient
    .getQueryCache()
    .getAll()
    .filter((q) => Array.isArray(q.queryKey) && PROBE_PREFIXES.includes(q.queryKey[0] as string));
  const settled = probes.filter((q) => q.state.status === 'success' || q.state.status === 'error');
  if (settled.length === 0) return; // no evidence yet — keep the last known value
  // Reachable if at least one probe currently holds a successful result.
  const next = settled.some((q) => q.state.status === 'success');
  if (next !== reachable) {
    reachable = next;
    listeners.forEach((l) => l());
  }
}

queryClient.getQueryCache().subscribe(recompute);

/** Non-reactive read for use outside React (e.g. the copilot send gate). */
export function isDataverseReachable(): boolean {
  return reachable;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Reactive: true while the Dataverse backend appears reachable. */
export function useDataverseReachable(): boolean {
  return useSyncExternalStore(subscribe, isDataverseReachable, () => true);
}

/**
 * Reactive: true when the app should behave as offline — no network OR the
 * Dataverse backend is unreachable. Drives the offline badge and disables every
 * network-dependent control (copilot, writes).
 */
export function useEffectiveOffline(): boolean {
  const online = useOnlineStatus();
  const dvReachable = useDataverseReachable();
  return !online || !dvReachable;
}
