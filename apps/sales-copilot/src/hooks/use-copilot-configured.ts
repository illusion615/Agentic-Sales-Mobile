import { useEffect, useState } from 'react';
import { getLLMConfig } from '@/lib/i18n';
import { getCopilotConfig } from '@/services/copilot-service';

/**
 * Reactive check for whether Copilot is configured.
 *
 * The underlying config is stored in localStorage and can be written either by:
 *  - The settings panel (synchronous user action).
 *  - `useInitSettings`, which hydrates from Dataverse asynchronously after app start.
 *
 * Reading the config synchronously at render time (as a plain function call) means
 * the first render after a cold start sees no config, and nothing re-renders when
 * Dataverse hydration finishes. That's the "Copilot missing until I visit Settings
 * and come back" bug. This hook re-evaluates on the relevant change events and the
 * `storage` event so all consumers stay in sync.
 */
export function useCopilotConfigured(): boolean {
  const [configured, setConfigured] = useState<boolean>(() => compute());

  useEffect(() => {
    const recompute = () => setConfigured(compute());

    // Fire once on mount in case localStorage was updated between the initial
    // useState lazy initializer and effect subscription.
    recompute();

    window.addEventListener('copilot-config-changed', recompute);
    window.addEventListener('llmconfig-changed', recompute);
    window.addEventListener('storage', recompute);

    return () => {
      window.removeEventListener('copilot-config-changed', recompute);
      window.removeEventListener('llmconfig-changed', recompute);
      window.removeEventListener('storage', recompute);
    };
  }, []);

  return configured;
}

function compute(): boolean {
  const copilotConfig = getCopilotConfig();
  const llmConfig = getLLMConfig();
  // Flow is always available via SDK connector — no endpoint check needed
  return !!copilotConfig?.agentName || !!llmConfig?.enabled;
}
