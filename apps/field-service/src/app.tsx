import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useKeyboardInset } from '@agentic/power-runtime/react';
import { DashboardPage } from './pages/dashboard';
import { WorkOrderDetailPage } from './pages/work-order-detail';

export function App() {
  // The Power Apps mobile player mishandles the URL hash, so routing is held in
  // memory; see the sales app for the full history behind this.
  useKeyboardInset();

  return (
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/work-orders/:id" element={<WorkOrderDetailPage />} />
        <Route path="*" element={<DashboardPage />} />
      </Routes>
    </MemoryRouter>
  );
}
