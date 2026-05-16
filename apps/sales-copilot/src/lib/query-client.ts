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
  onError: (error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // ResourceNotFound errors - show friendly message
    if (errorMessage.includes('ResourceNotFound') || errorMessage.includes('does not exist')) {
      toast.error('Operation failed: The requested resource was not found.');
      return;
    }
    
    // Show generic error for mutations
    toast.error('Operation failed. Please try again.');
    console.error('[QueryClient] Mutation error:', error);
  },
});

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