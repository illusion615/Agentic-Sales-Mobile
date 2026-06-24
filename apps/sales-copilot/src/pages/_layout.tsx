import { Outlet } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { GlobalCopilot, useCopilotSideDocked } from '@/components/global-copilot';
import { CopilotProvider } from '@/contexts/copilot-context';
import { SettingsProvider } from '@/contexts/settings-context';
import { ActionDockProvider } from '@/contexts/action-dock-context';

function LayoutInner() {
  const { docked, side } = useCopilotSideDocked();

  // Non-docked (mobile/float): simple container, pages handle their own scrolling.
  if (!docked) {
    return (
      <div className="h-full overflow-hidden">
        <Outlet />
        <GlobalCopilot />
        <Toaster richColors position="top-center" toastOptions={{ className: 'max-w-[280px] mx-auto' }} />
      </div>
    );
  }

  // Side-docked (desktop left/right): flex layout for content + panel side by side.
  return (
    <div className="h-full overflow-hidden flex">
      {side === 'left' && <GlobalCopilot />}
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
      {side === 'right' && <GlobalCopilot />}
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
