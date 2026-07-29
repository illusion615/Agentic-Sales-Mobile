/**
 * Minimal IndexedDB object store used by the local data adapter.
 *
 * Deliberately small and self-contained: this backs a development fixture, not
 * a production data path, so it stays in the app rather than in the shared
 * runtime where it would invite reuse it is not built for.
 */
const DB_NAME = 'fs-local';

/**
 * Every object store is declared here and created in one upgrade.
 *
 * The alternative — creating each store on demand — needs a version bump per
 * store, and a bump is blocked while any other connection is open, so parallel
 * first reads deadlock. Declaring them together avoids that entirely.
 *
 * Adding a store means adding it here AND bumping the version.
 */
const STORES = ['workorders', 'customers', 'sessions', 'evidence'] as const;
const DB_VERSION = 2;

type StoreName = (typeof STORES)[number];

let connection: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (connection) return connection;

  connection = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        for (const store of STORES) {
          if (!request.result.objectStoreNames.contains(store)) {
            request.result.createObjectStore(store, { keyPath: 'id' });
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return connection;
}

export interface IdbCollection<T extends { id: string }> {
  all(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  put(value: T): Promise<void>;
  putAll(values: readonly T[]): Promise<void>;
}

export function createIdbCollection<T extends { id: string }>(storeName: StoreName): IdbCollection<T> {
  return {
    all() {
      return open().then(
        (db) =>
          new Promise<T[]>((resolve) => {
            if (!db) return resolve([]);
            try {
              const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
              request.onsuccess = () => resolve((request.result ?? []) as T[]);
              request.onerror = () => resolve([]);
            } catch {
              resolve([]);
            }
          }),
      );
    },

    get(id) {
      return open().then(
        (db) =>
          new Promise<T | undefined>((resolve) => {
            if (!db) return resolve(undefined);
            try {
              const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(id);
              request.onsuccess = () => resolve(request.result as T | undefined);
              request.onerror = () => resolve(undefined);
            } catch {
              resolve(undefined);
            }
          }),
      );
    },

    put(value) {
      return this.putAll([value]);
    },

    putAll(values) {
      return open().then(
        (db) =>
          new Promise<void>((resolve) => {
            if (!db) return resolve();
            try {
              const tx = db.transaction(storeName, 'readwrite');
              const store = tx.objectStore(storeName);
              for (const value of values) store.put(value);
              tx.oncomplete = () => resolve();
              tx.onerror = () => resolve();
            } catch {
              resolve();
            }
          }),
      );
    },
  };
}
