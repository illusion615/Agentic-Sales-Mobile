import { useEffect, lazy, Suspense } from 'react';
// MemoryRouter (not HashRouter): the Power Apps mobile player mishandles the URL
// hash and hangs on load. MemoryRouter keeps all routing state in memory and
// never touches window.location, which is the correct model for an embedded app.
import { MemoryRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Provider as JotaiProvider } from 'jotai';
import { Loader2 } from 'lucide-react';

import Layout from '@/pages/_layout';
import { queryClient } from '@/lib/query-client';

import ErrorBoundary from '@/components/system/error-boundary';
import { initColorTheme, initFontSize } from '@/lib/i18n';

// When the app is redeployed, the currently-loaded index.html holds references
// to chunk filenames that no longer exist on the server. The next lazy() import
// fails with "Importing a module script failed". Reload once to grab the new
// index. The session flag stops infinite reload loops if the failure is real.
const RELOAD_FLAG = 'sc:chunkReloadAt';
function lazyWithReload<T extends { default: React.ComponentType<unknown> }>(
  loader: () => Promise<T>,
) {
  return lazy(() =>
    loader().catch((err) => {
      const msg = String((err as Error)?.message || err);
      const isChunkErr = /module script failed|Failed to fetch dynamically imported module|Loading chunk|ChunkLoadError/i.test(msg);
      if (isChunkErr) {
        const last = Number(sessionStorage.getItem(RELOAD_FLAG) || '0');
        // Reload at most once per minute to avoid loops on genuine failures.
        if (Date.now() - last > 60_000) {
          sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
          window.location.reload();
          // Return a never-resolving promise so React keeps Suspense up until reload.
          return new Promise<T>(() => {});
        }
      }
      throw err;
    })
  );
}

const HomeDashboard = lazyWithReload(() => import('@/pages/home'));

const SettingsPage = lazyWithReload(() => import('@/pages/settings'));
const BriefMePage = lazyWithReload(() => import('@/pages/brief'));
const ActivityCapturePage = lazyWithReload(() => import('@/pages/activity-capture'));
const OpportunityReviewPage = lazyWithReload(() => import('@/pages/opportunity-review'));
const OpportunityDraftReviewPage = lazyWithReload(() => import('@/pages/opportunity-draft-review'));
const AccountsPage = lazyWithReload(() => import('@/pages/accounts'));
const AccountDetailPage = lazyWithReload(() => import('@/pages/account-detail'));
const OpportunitiesPage = lazyWithReload(() => import('@/pages/opportunities'));
const ActivitiesPage = lazyWithReload(() => import('@/pages/activities'));
const ActivityDetailPage = lazyWithReload(() => import('@/pages/activity-detail'));
const ContactsPage = lazyWithReload(() => import('@/pages/contacts'));
const ContactDetailPage = lazyWithReload(() => import('@/pages/contact-detail'));
const OpportunityDetailPage = lazyWithReload(() => import('@/pages/opportunity-detail'));
const PerformanceReportPage = lazyWithReload(() => import('@/pages/performance-report'));
const ProductsPage = lazyWithReload(() => import('@/pages/products'));
const ProductDetailPage = lazyWithReload(() => import('@/pages/product-detail'));
const VisitLogPage = lazyWithReload(() => import('@/pages/visit-log'));
const DataImportPage = lazyWithReload(() => import('@/pages/data-import'));
const CodeReviewPage = lazyWithReload(() => import('@/pages/code-review'));
const HelpFeedbackPage = lazyWithReload(() => import('@/pages/help-feedback'));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function App() {
  useEffect(() => {
    // Initialize settings from localStorage
    initColorTheme();
    initFontSize();
    // Restore dark/light mode from localStorage, defaulting to light
    const savedTheme = localStorage.getItem('theme');
    const resolvedTheme = savedTheme === 'dark' ? 'dark' : 'light';
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(resolvedTheme);
    if (!savedTheme) {
      localStorage.setItem('theme', 'light');
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary resetQueryCache>
        <JotaiProvider>

          <Router>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Layout />}>
                  <Route index element={<HomeDashboard />} />
                  <Route path="home" element={<HomeDashboard />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="brief-me" element={<BriefMePage />} />
                  <Route path="brief" element={<BriefMePage />} />

                  <Route path="activity-capture" element={<ActivityCapturePage />} />
                  <Route path="activity/:accountId" element={<ActivityCapturePage />} />
                  <Route path="opportunity-review" element={<OpportunityReviewPage />} />
                  <Route path="opp-draft/:activityId" element={<OpportunityDraftReviewPage />} />
                  <Route path="accounts" element={<AccountsPage />} />
                  <Route path="accounts/:id" element={<AccountDetailPage />} />
                  <Route path="opportunities" element={<OpportunitiesPage />} />
                  <Route path="opportunities/:id" element={<OpportunityDetailPage />} />
                  <Route path="activities/:id" element={<ActivityDetailPage />} />
                  <Route path="activities" element={<ActivitiesPage />} />
                  <Route path="contacts" element={<ContactsPage />} />
                  <Route path="contacts/:id" element={<ContactDetailPage />} />
                  <Route path="visit-log" element={<VisitLogPage />} />
                  <Route path="products/:id" element={<ProductDetailPage />} />
                  <Route path="products" element={<ProductsPage />} />
                  <Route path="data-import" element={<DataImportPage />} />
                  <Route path="help-feedback" element={<HelpFeedbackPage />} />
                  <Route path="debug/code-review" element={<CodeReviewPage />} />
                  <Route path="reports/performance" element={<PerformanceReportPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </Suspense>
          </Router>
        </JotaiProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

export default App;
