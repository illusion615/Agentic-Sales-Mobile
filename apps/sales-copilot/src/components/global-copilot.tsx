import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getCopilotInAllScreens, getCopilotDockLayout, type CopilotDockLayout } from '@/lib/i18n';
import { useCopilotConfigured } from '@/hooks/use-copilot-configured';
import { CopilotPanel } from '@/components/copilot-panel';
import { useIsMobile } from '@/hooks/use-mobile';

export function GlobalCopilot() {
  const location = useLocation();
  const isMobile = useIsMobile();
  const [enabled, setEnabled] = useState(() => getCopilotInAllScreens());
  const [dockLayout, setDockLayout] = useState<CopilotDockLayout>(() => getCopilotDockLayout());

  useEffect(() => {
    const handleChange = (e: CustomEvent<boolean>) => {
      setEnabled(e.detail);
    };
    window.addEventListener('copilotinallscreens-changed', handleChange as EventListener);
    return () => window.removeEventListener('copilotinallscreens-changed', handleChange as EventListener);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => setDockLayout((e as CustomEvent<CopilotDockLayout>).detail);
    window.addEventListener('copilot-dock-layout-changed', handler);
    return () => window.removeEventListener('copilot-dock-layout-changed', handler);
  }, []);

  const isCopilotConfigured = useCopilotConfigured();
  const isHomePage = location.pathname === '/' || location.pathname === '/home';
  const isSettingsPage = location.pathname === '/settings';
  const shouldShowCopilot = !isSettingsPage && isCopilotConfigured && (isHomePage || enabled);
  const effectiveLayout: CopilotDockLayout = isMobile ? 'float' : dockLayout;

  if (!shouldShowCopilot) {
    return null;
  }

  return <CopilotPanel />;
}

/** Whether the copilot side panel is currently docked (left/right) and should affect layout. */
export function useCopilotSideDocked(): { docked: boolean; side: 'left' | 'right' } {
  const isMobile = useIsMobile();
  const [layout, setLayout] = useState<CopilotDockLayout>(() => getCopilotDockLayout());
  useEffect(() => {
    const handler = (e: Event) => setLayout((e as CustomEvent<CopilotDockLayout>).detail);
    window.addEventListener('copilot-dock-layout-changed', handler);
    return () => window.removeEventListener('copilot-dock-layout-changed', handler);
  }, []);
  const effective: CopilotDockLayout = isMobile ? 'float' : layout;
  return { docked: effective === 'left' || effective === 'right', side: effective === 'left' ? 'left' : 'right' };
}
