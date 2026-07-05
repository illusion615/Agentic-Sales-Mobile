import { useEffect, useRef } from 'react';
import { useAppSettings } from '@/hooks/use-app-settings';
import { setLLMConfig, type LLMConfig } from '@/lib/i18n';
import { saveCopilotConfig, getCopilotConfig } from '@/services/copilot-service';

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
    const hasCopilotConfig = !!appSettings.copilotStudioAgentName;
    
    hasPowerAutomateRef.current = hasPowerAutomateConfig;
    hasCopilotRef.current = hasCopilotConfig;

    // Always enable LLM config — flow is baked in via SDK connector
    console.log('[InitSettings] Power Automate Flow integrated via SDK connector');
    const config: LLMConfig = {
      provider: 'power-automate',
      enabled: true,
    };
    setLLMConfig(config);

    // Initialize Copilot Studio agent name (single config source via copilot-service).
    // The Setting table is the AUTHORITATIVE source: when its agent name differs
    // from what's cached in localStorage (e.g. after deploying to a new environment
    // where the agent schema name changed), overwrite the cache so the app connects
    // to the right agent. Preserve any in-flight conversationId.
    if (hasCopilotConfig && appSettings.copilotStudioAgentName) {
      const current = getCopilotConfig();
      // One agent pointer for the whole app (product Q&A + enrichment): the
      // `copilot_studio_agent_name` Setting is authoritative. Overwrite the cache
      // when it differs (e.g. new environment / renamed agent). Preserve conversationId.
      if (current.agentName !== appSettings.copilotStudioAgentName) {
        console.log('[InitSettings] Syncing Copilot agent name from Setting table:', appSettings.copilotStudioAgentName);
        saveCopilotConfig({
          agentName: appSettings.copilotStudioAgentName,
          conversationId: current.conversationId,
        });
      } else {
        console.log('[InitSettings] Copilot agent name already in sync with Setting table');
      }
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
