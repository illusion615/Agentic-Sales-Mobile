import { Outlet } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { GlobalCopilot, useCopilotSideDocked } from '@/components/global-copilot';
import { CopilotProvider } from '@/contexts/copilot-context';
import { SettingsProvider } from '@/contexts/settings-context';
import { ActionDockProvider } from '@/contexts/action-dock-context';

function LayoutInner() {
  const { docked, side } = useCopilotSideDocked();

  return (
    <div className="h-full overflow-hidden flex flex-col">
      {/* Main content area: when side-docked, content + panel sit side by side below the header */}
      <div className={docked ? 'flex-1 flex overflow-hidden' : 'flex-1 overflow-hidden'}>
        {docked && side === 'left' && <GlobalCopilot />}
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
        {docked && side === 'right' && <GlobalCopilot />}
        {!docked && <GlobalCopilot />}
      </div>
      <Toaster richColors position="top-center" toastOptions={{ className: 'max-w-[280px] mx-auto' }} />
    </div>
  );
}

export default function Layout() {
  return (
    <SettingsProvider>
      <CopilotProvider>
        <ActionDockProvider>
          <LayoutInner />
        </ActionDockProvider>
      </CopilotProvider>
    </SettingsProvider>
  );
}
