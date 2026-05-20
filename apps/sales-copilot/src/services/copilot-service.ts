/**
 * Copilot Studio Service
 *
 * Configuration and availability for the Copilot Studio SDK connector.
 * All actual API calls go through CopilotStudioConnectorService (generated).
 * This module manages the agent name and multi-turn conversation ID.
 */

/** Agent schema name — matches the bot deployed in the solution */
export const COPILOT_STUDIO_AGENT_NAME = 'crf5c_agentrl2oCW';

export interface CopilotConfig {
  agentName: string;
  /** Conversation ID for multi-turn (returned by ExecuteCopilotAsyncV2) */
  conversationId?: string;
}

const STORAGE_KEY = 'copilot-config';

/**
 * Get Copilot config. Falls back to default agent name if nothing is stored.
 */
export function getCopilotConfig(): CopilotConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const raw = JSON.parse(stored);
      if (raw.agentName) return raw as CopilotConfig;
    }
  } catch { /* ignore */ }
  return { agentName: COPILOT_STUDIO_AGENT_NAME };
}

/**
 * Whether Copilot Studio is available.
 * With the SDK connector baked into the app, this is always true.
 */
export function isCopilotStudioAvailable(): boolean {
  return true;
}

/** Persist config (agent name + conversation ID for multi-turn). */
export function saveCopilotConfig(config: CopilotConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  window.dispatchEvent(new CustomEvent('copilot-config-changed', { detail: config }));
}

/** Clear only the conversation state, preserving the configured agent. */
export function clearCopilotConversation(): void {
  const config = getCopilotConfig();
  saveCopilotConfig({ agentName: config.agentName });
}

/** Clear config and conversation state. */
export function clearCopilotConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('copilot-config-changed', { detail: null }));
}
