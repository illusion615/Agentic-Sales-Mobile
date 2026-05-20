import { useEffect, useRef } from 'react';
import { useAppSettings } from '@/hooks/use-app-settings';
import { setLLMConfig, type LLMConfig } from '@/lib/i18n';
import { saveCopilotConfig } from '@/services/copilot-service';

export type SettingsInitStatus = 'loading' | 'not-configured' | 'configured' | 'error';

interface InitSettingsResult {
  status: SettingsInitStatus;
  hasPowerAutomateConfig: boolean;
  hasCopilotConfig: boolean;
  isReady: boolean;
}

/**
 * Hook to initialize app settings from Dataverse on startup.
 * Reads settings from the Setting table and applies them to localStorage.
 * This ensures connection status indicators show correct state immediately.
 * 
 * NOTE: This hook only saves configuration - it does NOT test connections.
 * Connection testing happens when user actually opens the Copilot panel.
 * 
 * Returns status information so consumers can wait for settings to be ready
 * before attempting to use Copilot connections.
 */
export function useInitSettings(): InitSettingsResult {
  const { settings: appSettings, isFetched, isFetching, isError } = useAppSettings();
  const initializedRef = useRef(false);
  const statusRef = useRef<SettingsInitStatus>('loading');
  const hasPowerAutomateRef = useRef(false);
  const hasCopilotRef = useRef(false);

  useEffect(() => {
    // Still loading from Dataverse
    if (isFetching && !isFetched) {
      statusRef.current = 'loading';
      return;
    }

    // Error loading from Dataverse
    if (isError) {
      console.warn('[InitSettings] Error loading settings from Dataverse');
      statusRef.current = 'error';
      return;
    }

    // Only run initialization once when settings are fetched
    if (!isFetched || initializedRef.current) return;
    initializedRef.current = true;

    console.log('[InitSettings] Initializing settings from Dataverse...');

    // Power Automate Flow is always available via SDK connector (no URL needed)
    const hasPowerAutomateConfig = true;
    const hasCopilotConfig = !!appSettings.copilotStudioTokenEndpoint;
    
    hasPowerAutomateRef.current = hasPowerAutomateConfig;
    hasCopilotRef.current = hasCopilotConfig;

    // Always enable LLM config — flow is baked in via SDK connector
    console.log('[InitSettings] Power Automate Flow integrated via SDK connector');
    const config: LLMConfig = {
      provider: 'power-automate',
      enabled: true,
    };
    setLLMConfig(config);

    // Initialize Copilot Studio Token Endpoint (save to localStorage only, no connection test)
    if (hasCopilotConfig && appSettings.copilotStudioTokenEndpoint) {
      console.log('[InitSettings] Found Copilot Studio Token Endpoint in Dataverse');
      // Save to localStorage for copilot-service to use when user opens panel
      saveCopilotConfig({ tokenEndpoint: appSettings.copilotStudioTokenEndpoint });
      // Also save to copilot-studio-config for settings panel display
      const copilotStudioConfig = {
        enabled: true,
        endpoint: appSettings.copilotStudioTokenEndpoint,
      };
      localStorage.setItem('copilot-studio-config', JSON.stringify(copilotStudioConfig));
    }

    statusRef.current = 'configured';
    console.log('[InitSettings] Settings initialization complete');
  }, [isFetched, isFetching, isError, appSettings]);

  // Determine current status
  let currentStatus: SettingsInitStatus;
  if (isFetching && !isFetched) {
    currentStatus = 'loading';
  } else if (isError) {
    currentStatus = 'error';
  } else if (isFetched) {
    currentStatus = statusRef.current;
  } else {
    currentStatus = 'loading';
  }

  return {
    status: currentStatus,
    hasPowerAutomateConfig: hasPowerAutomateRef.current,
    hasCopilotConfig: hasCopilotRef.current,
    isReady: currentStatus === 'configured' || currentStatus === 'not-configured',
  };
}
