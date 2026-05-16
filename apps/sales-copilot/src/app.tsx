import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Provider as JotaiProvider } from 'jotai';
import { initialize } from '@microsoft/power-apps/app';

import Layout from '@/pages/_layout';
import { queryClient } from '@/lib/query-client';

import ErrorBoundary from '@/components/system/error-boundary';
import { initColorTheme, initFontSize } from '@/lib/i18n';

import HomeDashboard from '@/pages/home';
import SettingsPage from '@/pages/settings';
import BriefMePage from '@/pages/brief';

import ActivityCapturePage from '@/pages/activity-capture';
import OpportunityReviewPage from '@/pages/opportunity-review';
import OpportunityDraftReviewPage from '@/pages/opportunity-draft-review';
import AccountsPage from '@/pages/accounts';
import AccountDetailPage from '@/pages/account-detail';
import OpportunitiesPage from '@/pages/opportunities';
import ActivitiesPage from '@/pages/activities';
import ActivityDetailPage from '@/pages/activity-detail';

import ContactsPage from '@/pages/contacts';
import ContactDetailPage from '@/pages/contact-detail';
import OpportunityDetailPage from '@/pages/opportunity-detail';
import PerformanceReportPage from '@/pages/performance-report';
import ProductsPage from '@/pages/products';
import ProductDetailPage from '@/pages/product-detail';
import NotFoundPage from '@/pages/not-found';
import VisitLogPage from '@/pages/visit-log';
import DataImportPage from '@/pages/data-import';
import CodeReviewPage from '@/pages/code-review';
import HelpFeedbackPage from '@/pages/help-feedback';

function App() {
  useEffect(() => {
    initialize();
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
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </Router>
        </JotaiProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

export default App;
