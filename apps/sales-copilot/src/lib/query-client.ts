import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { toast } from 'sonner';

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
      // Stale time: how long data is considered fresh (5 minutes)
      staleTime: 5 * 60 * 1000,
      // Cache time: how long data stays in cache when unused (10 minutes)
      gcTime: 10 * 60 * 1000,
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
      // Don't throw to allow graceful handling
      throwOnError: false,
    },
  },
});