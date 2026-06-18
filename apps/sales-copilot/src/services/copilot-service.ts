/**
 * Copilot Studio Service
 *
 * Configuration and availability for the Copilot Studio SDK connector.
 * All actual API calls go through CopilotStudioConnectorService (generated).
 * This module manages the agent name and multi-turn conversation ID.
 *
 * IMPORTANT: there is NO hardcoded fallback agent. The knowledge-base agent's
 * schema name MUST come from the `copilot_studio_agent_name` Setting (Dataverse),
 * which is hydrated into the cache by useInitSettings. If it's missing, the app
 * must tell the user to contact an administrator — never silently connect to a
 * baked-in agent (which, with identical schema names across environments, could
 * resolve to the wrong environment's agent).
 */

export interface CopilotConfig {
  /** Agent schema name. Undefined until the Setting table value is hydrated. */
  agentName?: string;
  /** Conversation ID for multi-turn (returned by ExecuteCopilotAsyncV2) */
  conversationId?: string;
}

const STORAGE_KEY = 'copilot-config';

/**
 * Get Copilot config from the cache. Returns `agentName: undefined` when nothing
 * has been hydrated from the Setting table yet — callers MUST handle the missing
 * case (show "contact admin"), NOT fall back to a default agent.
 */
export function getCopilotConfig(): CopilotConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const raw = JSON.parse(stored);
      if (raw.agentName) return raw as CopilotConfig;
    }
  } catch { /* ignore */ }
  return { agentName: undefined };
}

/**
 * Whether a Copilot Studio agent is configured (i.e. an agent name was hydrated
 * from the Setting table into the cache). When false, the app should prompt the
 * user to contact an administrator rather than attempting a call.
 */
export function isCopilotStudioAvailable(): boolean {
  return !!getCopilotConfig().agentName;
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
