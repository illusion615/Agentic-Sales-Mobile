import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearCopilotConversationLogId,
  getCopilotConversationLogBounds,
  readCopilotConversationLogId,
  toCopilotConversationLogMessages,
  writeCopilotConversationLogId,
} from '@/lib/copilot-conversation-log';
import type { ChatMessage } from '@/contexts/copilot-context';

describe('copilot conversation log helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores and clears the active Dataverse log id locally', () => {
    expect(readCopilotConversationLogId()).toBeNull();

    writeCopilotConversationLogId('log-123');
    expect(readCopilotConversationLogId()).toBe('log-123');

    clearCopilotConversationLogId();
    expect(readCopilotConversationLogId()).toBeNull();
  });

  it('filters transient and empty messages before writing logs', () => {
    const messages: ChatMessage[] = [
      {
        id: '1',
        type: 'user',
        role: 'user',
        content: 'hello',
        timestamp: '2026-05-27T01:00:00.000Z',
      },
      {
        id: '2',
        type: 'agent',
        role: 'assistant',
        content: '',
        timestamp: '2026-05-27T01:00:01.000Z',
      },
      {
        id: '3',
        type: 'agent',
        role: 'assistant',
        content: 'thinking',
        timestamp: '2026-05-27T01:00:02.000Z',
        isThinking: true,
      },
      {
        id: '4',
        type: 'agent',
        role: 'assistant',
        content: 'done',
        timestamp: '2026-05-27T01:00:03.000Z',
        agentName: 'Sales Copilot',
      },
    ];

    expect(toCopilotConversationLogMessages(messages)).toEqual([
      {
        role: 'user',
        content: 'hello',
        timestamp: '2026-05-27T01:00:00.000Z',
        agentName: undefined,
        functionDisplayName: undefined,
      },
      {
        role: 'assistant',
        content: 'done',
        timestamp: '2026-05-27T01:00:03.000Z',
        agentName: 'Sales Copilot',
        functionDisplayName: undefined,
      },
    ]);
  });

  it('derives started and last-active timestamps from persisted messages', () => {
    const bounds = getCopilotConversationLogBounds([
      { role: 'user', content: 'a', timestamp: '2026-05-27T01:00:00.000Z' },
      { role: 'assistant', content: 'b', timestamp: '2026-05-27T01:05:00.000Z' },
    ]);

    expect(bounds).toEqual({
      startedOn: '2026-05-27T01:00:00.000Z',
      lastActiveOn: '2026-05-27T01:05:00.000Z',
    });
  });
});