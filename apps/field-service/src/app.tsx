import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useKeyboardInset } from '@agentic/power-runtime/react';
import { DashboardPage } from './pages/dashboard';
import { WorkOrderDetailPage } from './pages/work-order-detail';
import { CapturePage } from './pages/capture';
import { ReviewPage } from './pages/review';
import { CustomerDetailPage } from './pages/customer-detail';
import { SettingsPage } from './pages/settings';

export function App() {
  // The Power Apps mobile player mishandles the URL hash, so routing is held in
  // memory; see the sales app for the full history behind this.
  useKeyboardInset();

  return (
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/work-orders/:id" element={<WorkOrderDetailPage />} />
        <Route path="/work-orders/:id/capture" element={<CapturePage />} />
        <Route path="/work-orders/:id/review" element={<ReviewPage />} />
        <Route path="/customers/:id" element={<CustomerDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<DashboardPage />} />
      </Routes>
    </MemoryRouter>
  );
}
