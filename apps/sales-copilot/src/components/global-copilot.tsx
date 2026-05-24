import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getCopilotInAllScreens } from '@/lib/i18n';
import { useCopilotConfigured } from '@/hooks/use-copilot-configured';
import { CopilotPanel } from '@/components/copilot-panel';

export function GlobalCopilot() {
  const location = useLocation();
  const [enabled, setEnabled] = useState(() => getCopilotInAllScreens());

  useEffect(() => {
    const handleChange = (e: CustomEvent<boolean>) => {
      setEnabled(e.detail);
    };
    window.addEventListener('copilotinallscreens-changed', handleChange as EventListener);
    return () => window.removeEventListener('copilotinallscreens-changed', handleChange as EventListener);
  }, []);

  const isCopilotConfigured = useCopilotConfigured();
  const isHomePage = location.pathname === '/' || location.pathname === '/home';
  const isSettingsPage = location.pathname === '/settings';
  const shouldShowCopilot = !isSettingsPage && isCopilotConfigured && (isHomePage || enabled);

  if (!shouldShowCopilot) {
    return null;
  }

  return <CopilotPanel />;
}
