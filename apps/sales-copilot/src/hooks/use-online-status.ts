import { useSyncExternalStore } from 'react';

/**
 * Tracks the browser's network connectivity via the `online` / `offline`
 * window events, backed by `navigator.onLine`.
 *
 * Returns `true` when the device reports it is online. Used to surface the
 * offline banner; react-query's default `refetchOnReconnect` handles the
 * automatic data refresh when connectivity returns.
 *
 * `useSyncExternalStore` is the tear-free way to read a browser value that
 * changes outside React, and avoids the re-render loops a naive
 * `useState` + `useEffect` listener can cause.
 */
function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

export function useOnlineStatus(): boolean {
  // Server snapshot defaults to online so nothing renders an offline state
  // during any non-browser render pass.
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
