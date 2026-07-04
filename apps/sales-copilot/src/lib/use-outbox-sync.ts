import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast-utils';
import { ActivityService } from '@/generated/services/activity-service';
import { getLocale, t } from '@/lib/i18n';
import { useEffectiveOffline } from '@/lib/connectivity';
import { usePendingActivities, syncActivityOutbox } from '@/lib/activity-outbox';

/**
 * Replays the offline activity outbox whenever the app is back online (network
 * AND Dataverse reachable) and items are queued. Mount once, high in the tree.
 * The outbox itself guards against concurrent runs, so re-entry is harmless.
 */
export function useOutboxSync(): void {
  const offline = useEffectiveOffline();
  const pending = usePendingActivities();
  const client = useQueryClient();

  useEffect(() => {
    if (offline || pending.length === 0) return;
    let cancelled = false;
    void (async () => {
      const synced = await syncActivityOutbox((p) => ActivityService.create(p));
      if (!cancelled && synced > 0) {
        client.invalidateQueries({ queryKey: ['activity-list'] });
        toast.success(t('offlineSynced', getLocale(), { count: synced }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [offline, pending.length, client]);
}
