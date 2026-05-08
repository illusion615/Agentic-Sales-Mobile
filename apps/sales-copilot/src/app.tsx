import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Provider as JotaiProvider } from 'jotai';
import { initialize } from '@microsoft/power-apps/app';

import Layout from '@/pages/_layout';
import { queryClient } from '@/lib/query-client';
import { Toaster } from '@/components/ui/sonner';
import ErrorBoundary from '@/components/system/error-boundary';
import { initColorTheme } from '@/lib/i18n';

import HomeDashboard from '@/pages/home';
import SettingsPage from '@/pages/settings';
import BriefMePage from '@/pages/brief';

import ActivityCapturePage from '@/pages/activity-capture';
import OpportunityReviewPage from '@/pages/opportunity-review';
import OpportunityDraftReviewPage from '@/pages/opportunity-draft-review';
import AccountsPage from '@/pages/accounts';
import OpportunitiesPage from '@/pages/opportunities';
import ActivitiesPage from '@/pages/activities';
import ActivityDetailPage from '@/pages/activity-detail';
import ClientsPage from '@/pages/clients';
import ClientDetailPage from '@/pages/client-detail';
import OpportunityDetailPage from '@/pages/opportunity-detail';
import PerformanceReportPage from '@/pages/performance-report';
import NotFoundPage from '@/pages/not-found';
import VisitLogPage from '@/pages/visit-log';

function App() {
  useEffect(() => {
    initialize();
    // Initialize settings from localStorage
    initColorTheme();
    // Restore dark/light mode from localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      document.documentElement.classList.remove('dark', 'light');
      document.documentElement.classList.add(savedTheme);
    }
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary resetQueryCache>
        <JotaiProvider>
          <Toaster richColors position="top-center" />
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
                <Route path="opportunities" element={<OpportunitiesPage />} />
                <Route path="opportunities/:id" element={<OpportunityDetailPage />} />
                <Route path="activities/:id" element={<ActivityDetailPage />} />
                <Route path="activities" element={<ActivitiesPage />} />
                <Route path="clients" element={<ClientsPage />} />
                <Route path="clients/:id" element={<ClientDetailPage />} />
                <Route path="visit-log" element={<VisitLogPage />} />
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
