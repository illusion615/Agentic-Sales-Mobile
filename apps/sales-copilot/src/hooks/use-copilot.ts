/**
 * React hook for Copilot Studio integration
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from './use-user';
import {
  getCopilotConfig,
  getOrCreateConversation,
  sendUserContext,
  sendMessage,
  pollMessages,
  clearConversation,
  type ConversationInfo,
  type CopilotMessage,
} from '@/services/copilot-service';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isTyping?: boolean;
}

export function useCopilot() {
  const { data: user } = useUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const conversationRef = useRef<ConversationInfo | null>(null);
  const watermarkRef = useRef<string | undefined>(undefined);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userContextSentRef = useRef(false);

  // Initialize connection
  const connect = useCallback(async () => {
    const config = getCopilotConfig();
    if (!config) {
      setIsConnected(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Get or create conversation
      const conversation = await getOrCreateConversation(config);
      conversationRef.current = conversation;

      // Send user context if we have user info and haven't sent it yet
      if (user && !userContextSentRef.current) {
        await sendUserContext(conversation, {
          userId: user.objectId || '',
          userPrincipalName: user.userPrincipalName || '',
          displayName: user.fullName || '',
        });
        userContextSentRef.current = true;
      }

      setIsConnected(true);

      // Start polling for messages
      startPolling();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Start polling for bot responses
  const startPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    pollingRef.current = setInterval(async () => {
      if (!conversationRef.current) return;

      try {
        const { activities, watermark } = await pollMessages(
          conversationRef.current,
          watermarkRef.current
        );

        watermarkRef.current = watermark;

        // Process new bot messages
        const botMessages = activities.filter(
          (a: CopilotMessage) => a.type === 'message' && a.from === 'bot' && a.text
        );

        if (botMessages.length > 0) {
          setMessages((prev: ChatMessage[]) => {
            const newMessages = botMessages
              .filter((m: CopilotMessage) => !prev.some((p: ChatMessage) => p.content === m.text))
              .map((m: CopilotMessage) => ({
                id: `bot-${Date.now()}-${Math.random()}`,
                role: 'assistant' as const,
                content: m.text || '',
                timestamp: m.timestamp,
                isTyping: true,
              }));

            return [...prev, ...newMessages];
          });
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 1000);
  }, []);

  // Send a message
  const send = useCallback(async (text: string) => {
    if (!conversationRef.current || !user) {
      setError('Not connected to Copilot');
      return;
    }

    // Add user message immediately
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev: ChatMessage[]) => [...prev, userMessage]);

    try {
      await sendMessage(conversationRef.current, user.objectId || 'anonymous', text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    }
  }, [user]);

  // Reset conversation
  const reset = useCallback(() => {
    clearConversation();
    conversationRef.current = null;
    watermarkRef.current = undefined;
    userContextSentRef.current = false;
    setMessages([]);
    setIsConnected(false);
    connect();
  }, [connect]);

  // Mark message as done typing
  const markMessageComplete = useCallback((messageId: string) => {
    setMessages((prev: ChatMessage[]) =>
      prev.map((m: ChatMessage) => (m.id === messageId ? { ...m, isTyping: false } : m))
    );
  }, []);

  // Connect on mount and when user changes
  useEffect(() => {
    connect();

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [connect]);

  return {
    messages,
    isConnected,
    isLoading,
    error,
    send,
    reset,
    markMessageComplete,
  };
}
