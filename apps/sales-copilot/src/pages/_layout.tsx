import { Outlet } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { GlobalCopilot } from '@/components/global-copilot';
import { CopilotProvider } from '@/contexts/copilot-context';
import { SettingsProvider } from '@/contexts/settings-context';
import { ActionDockProvider } from '@/contexts/action-dock-context';

export default function Layout() {
  return (
    <SettingsProvider>
      <CopilotProvider>
        <ActionDockProvider>
          <div className="h-full overflow-hidden">
            <Outlet />
            <GlobalCopilot />
            <Toaster richColors position="top-center" toastOptions={{ className: 'max-w-[280px] mx-auto' }} />
          </div>
        </ActionDockProvider>
      </CopilotProvider>
    </SettingsProvider>
  );
}
