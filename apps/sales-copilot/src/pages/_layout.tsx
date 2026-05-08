import { Outlet } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { GlobalCopilot } from '@/components/global-copilot';
import { CopilotProvider } from '@/contexts/copilot-context';

export default function Layout() {
  return (
    <CopilotProvider>
      <div className="h-full overflow-hidden">
        <Outlet />
        <GlobalCopilot />
        <Toaster richColors position="top-center" />
      </div>
    </CopilotProvider>
  );
}
