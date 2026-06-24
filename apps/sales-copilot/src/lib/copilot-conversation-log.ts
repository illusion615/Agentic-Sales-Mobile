import type { ChatMessage } from '@/contexts/copilot-context';

export const COPILOT_CONVERSATION_LOG_ID_KEY = 'copilot-log-conversation-id';

export interface CopilotConversationLogMessage {
  role?: ChatMessage['role'];
  content: string;
  timestamp: string;
  agentName?: string;
  functionDisplayName?: string;
}

export function readCopilotConversationLogId(): string | null {
  try {
    const stored = localStorage.getItem(COPILOT_CONVERSATION_LOG_ID_KEY);
    return stored && stored.trim().length > 0 ? stored : null;
  } catch {
    return null;
  }
}

export function writeCopilotConversationLogId(id: string): void {
  try {
    localStorage.setItem(COPILOT_CONVERSATION_LOG_ID_KEY, id);
  } catch {
    // Ignore storage failures; log persistence is best-effort.
  }
}

export function clearCopilotConversationLogId(): void {
  try {
    localStorage.removeItem(COPILOT_CONVERSATION_LOG_ID_KEY);
  } catch {
    // Ignore storage failures; log persistence is best-effort.
  }
}

export function toCopilotConversationLogMessages(messages: ChatMessage[]): CopilotConversationLogMessage[] {
  return messages
    .filter((message) => !message.isThinking && !message.isStreaming)
    .filter((message) => typeof message.content === 'string' && message.content.trim().length > 0)
    .map((message) => ({
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      agentName: message.agentName,
      functionDisplayName: message.functionDisplayName,
    }));
}

export function getCopilotConversationLogBounds(messages: CopilotConversationLogMessage[]): {
  startedOn: string;
  lastActiveOn: string;
} | null {
  if (messages.length === 0) return null;

  const now = new Date().toISOString();
  const timestamps = messages
    .map((message) => message.timestamp)
    .filter((timestamp): timestamp is string => typeof timestamp === 'string' && !Number.isNaN(new Date(timestamp).getTime()));

  return {
    startedOn: timestamps[0] ?? now,
    lastActiveOn: timestamps[timestamps.length - 1] ?? timestamps[0] ?? now,
  };
}