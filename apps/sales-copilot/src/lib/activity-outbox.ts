/**
 * Offline activity outbox.
 *
 * Manual activity creation is the ONLY write allowed while offline. Because it
 * is append-only (never edits existing server records) it can be queued locally
 * and replayed on reconnect with no risk of merge conflicts.
 *
 * Queued creates live in IndexedDB (survive reloads). A react store mirror lets
 * the UI show pending items and counts. `syncActivityOutbox` replays the queue
 * via a caller-supplied create function (kept decoupled from the data layer).
 */
import { useSyncExternalStore } from 'react';
import type { Activity } from '@/generated/models/activity-model';

export type ActivityCreatePayload = Omit<Activity, 'id'>;

export interface PendingActivity {
  tempId: string;
  payload: ActivityCreatePayload;
  queuedAt: number;
}

const DB_NAME = 'sc-outbox';
const STORE = 'kv';
const KEY = 'pending-activities';
const EMPTY: PendingActivity[] = [];

// --- minimal IndexedDB access (a single array stored under one key) ----------
function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
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

function readStore(): Promise<PendingActivity[]> {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve([]);
        try {
          const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
          r.onsuccess = () => resolve(Array.isArray(r.result) ? (r.result as PendingActivity[]) : []);
          r.onerror = () => resolve([]);
        } catch {
          resolve([]);
        }
      }),
  );
}

function writeStore(list: PendingActivity[]): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve();
        try {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(list, KEY);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      }),
  );
}

// --- in-memory mirror + subscribable store -----------------------------------
let items: PendingActivity[] = EMPTY;
let loadedPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function ensureLoaded(): Promise<void> {
  if (!loadedPromise) {
    loadedPromise = readStore().then((list) => {
      // Only adopt the stored list if nothing was enqueued while we were reading.
      if (items === EMPTY && list.length) {
        items = list;
        emit();
      }
    });
  }
  return loadedPromise;
}
void ensureLoaded();

export function getPendingActivities(): PendingActivity[] {
  return items;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Reactive list of activities queued while offline, awaiting sync. */
export function usePendingActivities(): PendingActivity[] {
  return useSyncExternalStore(subscribe, getPendingActivities, () => EMPTY);
}

/** Queue a manual activity create for later sync. */
export async function enqueueActivity(payload: ActivityCreatePayload): Promise<PendingActivity> {
  await ensureLoaded();
  const item: PendingActivity = {
    tempId: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    payload,
    queuedAt: Date.now(),
  };
  items = [...items, item];
  await writeStore(items);
  emit();
  return item;
}

async function removePending(tempId: string): Promise<void> {
  items = items.filter((i) => i.tempId !== tempId);
  await writeStore(items);
  emit();
}

/**
 * Replay every queued create via `createFn`. Successful items are removed;
 * failed ones stay queued for the next attempt. Returns the number synced.
 * Guarded against concurrent runs so a reconnect burst can't double-submit.
 */
let syncing = false;
export async function syncActivityOutbox(
  createFn: (payload: ActivityCreatePayload) => Promise<unknown>,
): Promise<number> {
  await ensureLoaded();
  if (syncing || items.length === 0) return 0;
  syncing = true;
  let synced = 0;
  try {
    for (const it of [...items]) {
      try {
        await createFn(it.payload);
        await removePending(it.tempId);
        synced += 1;
      } catch {
        // Keep in the queue; retry on the next reconnect.
      }
    }
  } finally {
    syncing = false;
  }
  return synced;
}
