import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from '@/app.tsx';
import { initColorTheme } from '@/lib/i18n';
import { refreshPromptResolution } from '@/services/prompt-resolver';
import { queryClient } from '@/lib/query-client';
import { restoreQueryCache, startQueryPersistence } from '@/lib/query-persist';

// Initialize theme from localStorage or default to light
const savedTheme = localStorage.getItem('theme');
const root = document.documentElement;
// Clear any existing theme classes first
root.classList.remove('dark', 'light');
if (savedTheme === 'dark') {
  root.classList.add('dark');
} else {
  root.classList.add('light');
  if (!savedTheme) {
    localStorage.setItem('theme', 'light');
  }
}

// Initialize color theme
initColorTheme();

// Build fingerprint — changes on every build
const BUILD_ID = __BUILD_TIMESTAMP__;
console.log(`%c[SalesCopilot] build ${BUILD_ID}`, 'color:#6366f1;font-weight:bold');

// Local-first boot: hydrate the query cache from IndexedDB BEFORE the first
// render so the app opens instantly with the last-synced data (even offline).
// Capped so a slow/unavailable IndexedDB can never delay first paint by more
// than ~800ms. When online, react-query then background-refetches stale data.
async function bootstrap() {
  // Cache restore is strictly best-effort. Wrap the await so that NOTHING it
  // does — a rejection, a slow/again-unavailable IndexedDB — can ever abort or
  // delay first paint beyond the 800ms cap. First render must always happen.
  try {
    await Promise.race([
      restoreQueryCache(queryClient),
      new Promise((r) => setTimeout(r, 800)),
    ]);
  } catch {
    /* ignore — open the app without a warm cache */
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );

  // Keep persisting successful queries to IndexedDB for the next cold start.
  startQueryPersistence(queryClient);
}
void bootstrap();

// Resolve the AI prompt operation name for this environment in the background.
// Self-heals (one reload) if the AI model GUID differs from the build-time value;
// no-op when the GUID is unchanged.
void refreshPromptResolution();
