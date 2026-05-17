import { AccountService } from '@/generated/services/account-service';

/**
 * Bump an account's `lastcontactedon` to `whenISO` if newer than the existing
 * value. Call after creating an activity or marking one completed so dashboards
 * (Coverage, At-Risk accounts) stay accurate without manual field maintenance.
 *
 * Silently no-ops on any failure — never let a writeback error break the
 * primary activity write path.
 */
export async function touchAccountLastContacted(
  accountId: string | undefined | null,
  whenISO?: string,
): Promise<void> {
  if (!accountId) return;
  try {
    const when = whenISO ? new Date(whenISO) : new Date();
    if (Number.isNaN(when.getTime())) return;
    const current = await AccountService.get(accountId);
    const existing = current?.lastcontactedon ? new Date(current.lastcontactedon) : null;
    if (existing && existing.getTime() >= when.getTime()) return; // already newer or equal
    await AccountService.update(accountId, { lastcontactedon: when.toISOString() });
  } catch (err) {
    console.warn('[touchAccountLastContacted] failed for', accountId, err);
  }
}
