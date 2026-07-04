import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { toast } from '@/lib/toast-utils';
import { t, getLocale } from '@/lib/i18n';

// Global error handler for queries
const queryCache = new QueryCache({
  onError: (error: unknown) => {
    // Handle Azure/Microsoft specific errors gracefully
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // ResourceNotFound errors from Azure - don't crash, just log
    if (errorMessage.includes('ResourceNotFound') || errorMessage.includes('does not exist')) {
      console.warn('[QueryClient] Resource not found error (handled gracefully):', errorMessage);
      return; // Don't show toast for these - they're often transient
    }
    
    // Network errors
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('Network error')) {
      console.warn('[QueryClient] Network error:', errorMessage);
      return;
    }
    
    // Log other errors but don't crash
    console.error('[QueryClient] Query error:', error);
  },
});

// Global error handler for mutations
const mutationCache = new MutationCache({
  onError: (error: unknown, _variables, _context, mutation) => {
    // Orchestration mutations whose mutationFn calls other mutations should
    // opt out via meta.suppressGlobalToast — the inner mutation already
    // surfaced the real error, so re-toasting here would duplicate it.
    if (mutation.meta?.suppressGlobalToast) {
      console.error('[QueryClient] Mutation error (suppressed toast):', error);
      return;
    }

    const errorMessage = extractMessage(error);

    // Connectivity failure (offline or backend unreachable): show a friendly
    // "you're offline" message instead of a raw network error. Offline the app is
    // a read-only viewer; the one sanctioned offline write (manual activity
    // create) is queued via its own outbox, never through this mutation path.
    if (
      (typeof navigator !== 'undefined' && !navigator.onLine) ||
      /Failed to fetch|NetworkError|Network error|ERR_NAME_NOT_RESOLVED|timed out|Load failed/i.test(errorMessage)
    ) {
      toast.error(t('offlineWriteBlocked', getLocale()));
      return;
    }

    // ResourceNotFound errors - show friendly message
    if (errorMessage.includes('ResourceNotFound') || errorMessage.includes('does not exist')) {
      toast.error('Operation failed: The requested resource was not found.');
      return;
    }

    // Surface the actual error message so we can diagnose, instead of
    // hiding everything behind "Operation failed. Please try again."
    toast.error(`Operation failed: ${errorMessage || 'unknown error'}`);
    console.error('[QueryClient] Mutation error:', error);
  },
});

function extractMessage(err: unknown, depth = 0): string {
  if (depth > 4) return '';
  if (err == null) return '';
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') {
    const t = err.trim();
    if (t.startsWith('{')) {
      try { return extractMessage(JSON.parse(t), depth + 1); } catch { return t; }
    }
    return t;
  }
  if (typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const candidates: unknown[] = [
      e.message,
      e.error,
      (e.body as Record<string, unknown> | undefined)?.error,
      (e.body as Record<string, unknown> | undefined)?.message,
      (e.innerError as Record<string, unknown> | undefined)?.message,
      e.body,
      e.code,
      e.statusText,
    ];
    for (const c of candidates) {
      const m = extractMessage(c, depth + 1);
      if (m) return m;
    }
    const ctor = (err as { constructor?: { name?: string } }).constructor?.name ?? 'Error';
    const status = (e.status as number | string | undefined) ?? (e.statusCode as number | string | undefined);
    return status != null ? `${ctor} (status=${status})` : `${ctor} with no message`;
  }
  return String(err);
}

export const queryClient = new QueryClient({
  queryCache,
  mutationCache,
  defaultOptions: {
    queries: {
      // Stale time: how long data is considered fresh (5 minutes). After this,
      // an online mount/reconnect triggers a background refetch (the "sync" half
      // of local-first: cached data shows instantly, fresh data replaces it).
      staleTime: 5 * 60 * 1000,
      // Cache/GC time: kept long so hydrated (persisted) queries are not evicted
      // from memory during a session — the IndexedDB persister (query-persist.ts)
      // is the durable store across reloads.
      gcTime: 7 * 24 * 60 * 60 * 1000,
      // Disable retries
      retry: false,
      // Don't refetch on window focus by default
      refetchOnWindowFocus: false,
      // Don't retry on mount
      retryOnMount: false,
      // Throw errors to error boundary instead of swallowing
      throwOnError: false,
    },
    mutations: {
      // Disable retries for mutations
      retry: false,
      // Fail writes immediately when offline instead of react-query's default
      // "pause while offline, auto-resume on reconnect". Auto-resume would replay
      // stale offline edits against records that may have changed server-side —
      // the exact conflict we want to avoid. Offline writes therefore fail fast;
      // the only sanctioned offline write (manual activity create) goes through
      // its own explicit, append-only outbox, not this path.
      networkMode: 'always',
      // Don't throw to allow graceful handling
      throwOnError: false,
    },
  },
});