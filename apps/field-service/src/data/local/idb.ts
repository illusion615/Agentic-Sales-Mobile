/**
 * Minimal IndexedDB object store used by the local data adapter.
 *
 * Deliberately small and self-contained: this backs a development fixture, not
 * a production data path, so it stays in the app rather than in the shared
 * runtime where it would invite reuse it is not built for.
 */
const DB_NAME = 'fs-local';
const DB_VERSION = 1;

function open(storeName: string): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(storeName)) {
          request.result.createObjectStore(storeName, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export interface IdbCollection<T extends { id: string }> {
  all(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  put(value: T): Promise<void>;
  putAll(values: readonly T[]): Promise<void>;
}

export function createIdbCollection<T extends { id: string }>(storeName: string): IdbCollection<T> {
  return {
    all() {
      return open(storeName).then(
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
      return open(storeName).then(
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
      return open(storeName).then(
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
