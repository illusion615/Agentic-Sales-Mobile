/**
 * Test suite: copilot-service.ts
 * Tests config management, availability check, and conversation state.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCopilotConfig,
  saveCopilotConfig,
  isCopilotStudioAvailable,
  clearCopilotConversation,
  clearCopilotConfig,
  COPILOT_STUDIO_AGENT_NAME,
} from '@/services/copilot-service';

describe('copilot-service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('COPILOT_STUDIO_AGENT_NAME', () => {
    it('should be the expected bot schema name', () => {
      expect(COPILOT_STUDIO_AGENT_NAME).toBe('crf5c_agentrl2oCW');
    });
  });

  describe('getCopilotConfig', () => {
    it('returns default config when nothing is stored', () => {
      const config = getCopilotConfig();
      expect(config.agentName).toBe(COPILOT_STUDIO_AGENT_NAME);
      expect(config.conversationId).toBeUndefined();
    });

    it('returns stored config when present', () => {
      saveCopilotConfig({ agentName: 'custom_agent', conversationId: 'conv-123' });
      const config = getCopilotConfig();
      expect(config.agentName).toBe('custom_agent');
      expect(config.conversationId).toBe('conv-123');
    });

    it('falls back to default if stored JSON is invalid', () => {
      localStorage.setItem('copilot-config', 'not-json');
      const config = getCopilotConfig();
      expect(config.agentName).toBe(COPILOT_STUDIO_AGENT_NAME);
    });

    it('falls back to default if stored object has no agentName', () => {
      localStorage.setItem('copilot-config', JSON.stringify({ foo: 'bar' }));
      const config = getCopilotConfig();
      expect(config.agentName).toBe(COPILOT_STUDIO_AGENT_NAME);
    });
  });

  describe('isCopilotStudioAvailable', () => {
    it('returns true (SDK connector is always available)', () => {
      expect(isCopilotStudioAvailable()).toBe(true);
    });
  });

  describe('saveCopilotConfig', () => {
    it('persists config to localStorage', () => {
      saveCopilotConfig({ agentName: 'test_agent' });
      const raw = JSON.parse(localStorage.getItem('copilot-config')!);
      expect(raw.agentName).toBe('test_agent');
    });

    it('dispatches copilot-config-changed event', () => {
      let received = false;
      const handler = () => { received = true; };
      window.addEventListener('copilot-config-changed', handler);
      saveCopilotConfig({ agentName: 'test' });
      window.removeEventListener('copilot-config-changed', handler);
      expect(received).toBe(true);
    });
  });

  describe('clearCopilotConversation', () => {
    it('clears conversationId but preserves agentName', () => {
      saveCopilotConfig({ agentName: 'my_agent', conversationId: 'conv-456' });
      clearCopilotConversation();
      const config = getCopilotConfig();
      expect(config.agentName).toBe('my_agent');
      expect(config.conversationId).toBeUndefined();
    });
  });

  describe('clearCopilotConfig', () => {
    it('removes all config from localStorage', () => {
      saveCopilotConfig({ agentName: 'test' });
      clearCopilotConfig();
      expect(localStorage.getItem('copilot-config')).toBeNull();
    });
  });
});
