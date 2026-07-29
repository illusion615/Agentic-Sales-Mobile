/**
 * Local-first query cache persistence, bound to this app's IndexedDB database.
 *
 * The database name must stay unique to this app: code apps are served from a
 * shared origin, so a generic name would let a sibling app read and overwrite
 * this cache.
 */
import { createQueryPersistence } from '@agentic/power-runtime/query';

const persistence = createQueryPersistence({
  dbName: 'sc-query-cache',
  // Bump when the adapter services' app-facing model shapes change.
  schemaVersion: 'v1',
});

export const restoreQueryCache = persistence.restore;
export const startQueryPersistence = persistence.start;
