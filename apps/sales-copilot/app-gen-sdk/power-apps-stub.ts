/**
 * Local stub for `@microsoft/power-apps/app`.
 *
 * In Power Apps, this module exposes the host bridge (initialize, getContext).
 * Outside Power Apps, every call sites either uses try/catch with a fallback
 * or treats the call as best-effort, so the stub simply throws — that triggers
 * the existing fallback paths cleanly.
 */

export interface PowerAppsUserContext {
  fullName: string;
  userPrincipalName: string;
  objectId: string;
  tenantId: string;
}

export interface PowerAppsContext {
  user: PowerAppsUserContext;
}

export async function initialize(): Promise<void> {
  // No-op in standalone mode.
}

export async function getContext(): Promise<PowerAppsContext> {
  throw new Error('[power-apps stub] getContext is not available outside Power Apps host');
}
