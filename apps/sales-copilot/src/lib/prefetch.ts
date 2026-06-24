/**
 * Dynamic chunk prefetch — preloads page chunks based on visible entity types.
 *
 * Tracks which chunks are already loaded to avoid redundant imports.
 * Triggered by: RecordListCard (copilot results), detail pages (related entities),
 * and any component that knows which entity types the user is likely to visit next.
 *
 * Usage:
 *   prefetchForEntityType('opportunity');     // preload opportunity-detail chunk
 *   prefetchForEntityTypes(['account', 'contact']); // batch
 */

type EntityType = 'account' | 'opportunity' | 'activity' | 'contact';

const loaded = new Set<EntityType>();

const chunkLoaders: Record<EntityType, () => Promise<unknown>> = {
  account: () => import('@/pages/account-detail'),
  opportunity: () => import('@/pages/opportunity-detail'),
  activity: () => import('@/pages/activity-detail'),
  contact: () => import('@/pages/contact-detail'),
};

/** Prefetch a single entity detail page chunk if not already cached. */
export function prefetchForEntityType(type: EntityType): void {
  if (loaded.has(type)) return;
  loaded.add(type);
  // Use requestIdleCallback (or setTimeout fallback) so prefetch never
  // blocks user interaction or rendering.
  const schedule = typeof requestIdleCallback === 'function'
    ? requestIdleCallback
    : (cb: () => void) => setTimeout(cb, 100);
  schedule(() => {
    chunkLoaders[type]?.().catch(() => {
      // Download failed — allow retry next time
      loaded.delete(type);
    });
  });
}

/** Prefetch multiple entity types at once. */
export function prefetchForEntityTypes(types: EntityType[]): void {
  for (const t of types) prefetchForEntityType(t);
}

/**
 * Given the current page route, prefetch detail pages for related entity types.
 * E.g. on account-detail → prefetch opportunity, activity, contact (likely next).
 */
export function prefetchRelated(currentEntityType: EntityType): void {
  const related: Record<EntityType, EntityType[]> = {
    account: ['opportunity', 'activity', 'contact'],
    opportunity: ['account', 'activity'],
    activity: ['account', 'opportunity', 'contact'],
    contact: ['account', 'opportunity', 'activity'],
  };
  prefetchForEntityTypes(related[currentEntityType] ?? []);
}
