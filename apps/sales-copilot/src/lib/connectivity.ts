/**
 * App-level connectivity signal.
 *
 * "Effectively offline" means no network OR Dataverse unreachable — both make
 * every network feature unusable, including the copilot, whose LLM call rides
 * on the same Dataverse connection. The badge and the copilot gate read this
 * single signal so they never disagree.
 */
import { createConnectivity } from '@agentic/power-runtime/query';
import { queryClient } from './query-client';

const connectivity = createConnectivity({
  queryClient,
  // These adapters throw on failure, so their error state is a reliable signal.
  // The activity adapter swallows errors into an empty list and is unusable here.
  probeKeyPrefixes: ['account-list', 'opportunity-list'],
});

/** Non-reactive read for use outside React (e.g. the copilot send gate). */
export const isDataverseReachable = connectivity.isBackendReachable;

/** Reactive: true while the Dataverse backend appears reachable. */
export const useDataverseReachable = connectivity.useBackendReachable;

/**
 * Reactive: true when the app should behave as offline. Drives the offline
 * badge and disables every network-dependent control (copilot, writes).
 */
export const useEffectiveOffline = connectivity.useEffectiveOffline;
