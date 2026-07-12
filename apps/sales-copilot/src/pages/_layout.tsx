import { Outlet } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { GlobalCopilot, useCopilotSideDocked } from '@/components/global-copilot';
import { CopilotProvider } from '@/contexts/copilot-context';
import { SettingsProvider } from '@/contexts/settings-context';
import { ActionDockProvider } from '@/contexts/action-dock-context';
import { FeedbackHost } from '@/components/feedback/feedback-host';
import { useTrackNavDepth } from '@/lib/nav-depth';
import { useOutboxSync } from '@/lib/use-outbox-sync';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import { WhatsNew } from '@/components/whats-new';

function LayoutInner() {
  // Track in-app navigation depth (MemoryRouter doesn't write window.history).
  useTrackNavDepth();
  // Replay any offline-queued activity creates once we're back online.
  useOutboxSync();
  // Publish the soft-keyboard height as --keyboard-inset so bottom-docked fixed
  // surfaces (copilot composer) can lift above the IME on Android/iOS.
  useKeyboardInset();
  const { docked, side } = useCopilotSideDocked();

  // Non-docked (mobile/float): simple container, pages handle their own scrolling.
  if (!docked) {
    return (
      <div className="h-full overflow-hidden">
        <Outlet />
        <GlobalCopilot />
        <Toaster richColors position="top-center" toastOptions={{ className: 'max-w-[280px] mx-auto' }} />
        <FeedbackHost />
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
      <FeedbackHost />
    </div>
  );
}

export default function Layout() {
  return (
    <SettingsProvider>
      <CopilotProvider>
        <ActionDockProvider>
          <LayoutInner />
          <WhatsNew />
        </ActionDockProvider>
      </CopilotProvider>
    </SettingsProvider>
  );
}
