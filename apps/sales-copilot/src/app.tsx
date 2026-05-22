import { useEffect, lazy, Suspense } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Provider as JotaiProvider } from 'jotai';
import { Loader2 } from 'lucide-react';

import Layout from '@/pages/_layout';
import { queryClient } from '@/lib/query-client';

import ErrorBoundary from '@/components/system/error-boundary';
import { initColorTheme, initFontSize } from '@/lib/i18n';

import HomeDashboard from '@/pages/home';

const SettingsPage = lazy(() => import('@/pages/settings'));
const BriefMePage = lazy(() => import('@/pages/brief'));
const ActivityCapturePage = lazy(() => import('@/pages/activity-capture'));
const OpportunityReviewPage = lazy(() => import('@/pages/opportunity-review'));
const OpportunityDraftReviewPage = lazy(() => import('@/pages/opportunity-draft-review'));
const AccountsPage = lazy(() => import('@/pages/accounts'));
const AccountDetailPage = lazy(() => import('@/pages/account-detail'));
const OpportunitiesPage = lazy(() => import('@/pages/opportunities'));
const ActivitiesPage = lazy(() => import('@/pages/activities'));
const ActivityDetailPage = lazy(() => import('@/pages/activity-detail'));
const ContactsPage = lazy(() => import('@/pages/contacts'));
const ContactDetailPage = lazy(() => import('@/pages/contact-detail'));
const OpportunityDetailPage = lazy(() => import('@/pages/opportunity-detail'));
const PerformanceReportPage = lazy(() => import('@/pages/performance-report'));
const ProductsPage = lazy(() => import('@/pages/products'));
const ProductDetailPage = lazy(() => import('@/pages/product-detail'));
const VisitLogPage = lazy(() => import('@/pages/visit-log'));
const DataImportPage = lazy(() => import('@/pages/data-import'));
const CodeReviewPage = lazy(() => import('@/pages/code-review'));
const HelpFeedbackPage = lazy(() => import('@/pages/help-feedback'));

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
