import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query';

/**
 * Local-first query cache persistence.
 *
 * Persists successful react-query results to IndexedDB and hydrates them back
 * before the first render, so the app opens instantly with the last-synced data
 * (even offline) and — when online — background-refetches to update
 * (stale-while-revalidate). Uses react-query's built-in dehydrate/hydrate plus
 * raw IndexedDB, so it adds no dependencies.
 *
 * IndexedDB (not localStorage) is used deliberately: the data cache can be a
 * few MB and must not compete with the ~5 MB localStorage budget typically
 * already spent on settings and conversation history.
 */

const STORE = 'kv';
const KEY = 'dehydrated';
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_DEBOUNCE_MS = 1500;

export interface QueryPersistenceOptions {
  /**
   * IndexedDB database name. MUST be unique per app: code apps in the same
   * tenant are served from a shared origin, so a generic name would let two
   * apps read and overwrite each other's cache.
   */
  dbName: string;
  /**
   * Bump ONLY when the shape of a persisted query result (the app-facing model
   * types produced by the adapter services) changes. Keeping it independent of
   * the build id lets offline data survive routine app updates; changing it
   * discards stale-shaped cache so a shape change can never render against it.
   */
  schemaVersion: string;
  /** Discard persisted cache older than this. Default 7 days. */
  maxAgeMs?: number;
  /** Debounce between cache changes and a write. Default 1500ms. */
  debounceMs?: number;
}

export interface QueryPersistence {
  /**
   * Hydrate the query cache from IndexedDB. Call (and await) before the first
   * render for a local-first paint. Never throws; a miss just means no cache yet.
   */
  restore(client: QueryClient): Promise<void>;
  /**
   * Start persisting successful queries, debounced on every cache change.
   * Call once after the client is created.
   */
  start(client: QueryClient): void;
}

interface Persisted {
  version: string;
  savedAt: number;
  state: unknown;
}

export function createQueryPersistence(options: QueryPersistenceOptions): QueryPersistence {
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  function openDb(): Promise<IDBDatabase | null> {
    return new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const req = indexedDB.open(options.dbName, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  function idbGet(key: string): Promise<Persisted | undefined> {
    return openDb().then(
      (db) =>
        new Promise((resolve) => {
          if (!db) return resolve(undefined);
          try {
            const tx = db.transaction(STORE, 'readonly');
            const r = tx.objectStore(STORE).get(key);
            r.onsuccess = () => resolve(r.result as Persisted | undefined);
            r.onerror = () => resolve(undefined);
          } catch {
            resolve(undefined);
          }
        }),
    );
  }

  function idbSet(key: string, val: Persisted): Promise<void> {
    return openDb().then(
      (db) =>
        new Promise((resolve) => {
          if (!db) return resolve();
          try {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(val, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          } catch {
            resolve();
          }
        }),
    );
  }

  return {
    async restore(client) {
      try {
        const saved = await idbGet(KEY);
        if (!saved) return;
        if (saved.version !== options.schemaVersion) return;
        if (Date.now() - saved.savedAt > maxAgeMs) return;
        hydrate(client, saved.state);
      } catch {
        /* ignore — app works without a warm cache */
      }
    },

    start(client) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const flush = () => {
        timer = undefined;
        try {
          const state = dehydrate(client, {
            // Only cache successful reads — never persist errors or in-flight state.
            shouldDehydrateQuery: (q) => q.state.status === 'success',
            shouldDehydrateMutation: () => false,
          });
          void idbSet(KEY, { version: options.schemaVersion, savedAt: Date.now(), state });
        } catch {
          /* ignore persistence failures — they must never break the app */
        }
      };
      client.getQueryCache().subscribe(() => {
        if (timer) return;
        timer = setTimeout(flush, debounceMs);
      });
    },
  };
}
