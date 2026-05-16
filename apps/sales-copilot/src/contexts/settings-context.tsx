import { createContext, useContext, type ReactNode } from 'react';
import { useInitSettings, type SettingsInitStatus } from '@/hooks/use-init-settings';

interface SettingsContextValue {
  status: SettingsInitStatus;
  hasPowerAutomateConfig: boolean;
  hasCopilotConfig: boolean;
  isReady: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const settingsInit = useInitSettings();

  return (
    <SettingsContext.Provider value={settingsInit}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettingsContext() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettingsContext must be used within a SettingsProvider');
  }
  return context;
}

/**
 * Hook to check if settings are ready for Copilot connection.
 * Returns true when Dataverse settings have been loaded (whether configured or not).
 */
export function useSettingsReady(): boolean {
  const context = useContext(SettingsContext);
  return context?.isReady ?? false;
}
