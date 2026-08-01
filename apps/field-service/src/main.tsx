import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configureAppearanceScope, initAppearance } from '@agentic/app-shell';
import { refreshPromptResolution } from './data/ai/prompt-gateway';
import { App } from './app';
import './index.css';

configureAppearanceScope('field-service');
initAppearance();

// Resolves this environment's AI model GUID. Best-effort: extraction falls back
// to the deterministic pass when it cannot be resolved.
void refreshPromptResolution();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
    // Fail fast offline instead of replaying stale edits on reconnect.
    mutations: { networkMode: 'always' },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
