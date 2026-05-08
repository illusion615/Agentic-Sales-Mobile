import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo, type ReactNode } from 'react';
import { useUser } from '@/hooks/use-user';
import { 
  getCopilotConfig, 
  getOrCreateConversation, 
  sendUserContext, 
  sendMessage as sendCopilotMessage, 
  pollMessages,
  clearConversation,
  createWebSocketConnection,
  type ConversationInfo,
  type CopilotMessage
} from '@/services/copilot-service';
import { getLocale, getLLMConfig, getSimulateStreaming, type Locale } from '@/lib/i18n';
import { processMessage, type ThinkingProgress } from '@/lib/copilot-agent';

export interface ThinkingStep {
  stage: 'intent' | 'executing' | 'generating';
  status: 'pending' | 'active' | 'completed';
  label: string;
  detail?: string;
}

export interface ChatMessage {
  id: string;
  type: 'user' | 'agent' | 'stage-card' | 'form-card';
  role?: 'user' | 'assistant';
  content: string;
  audioUrl?: string;
  audioDuration?: number;
  agentName?: string;
  functionCalled?: string;
  functionDisplayName?: string;
  sources?: { id: string; label: string; detail: string; type: string }[];
  timestamp: string;
  // Thinking state for streaming feedback
  isThinking?: boolean;
  isStreaming?: boolean;
  thinkingSteps?: ThinkingStep[];
  stageCard?: {
    opportunityId: string;
    title: string;
    account: string;
    value: string;
    stage: string;
    stageIndex: number;
    confidence: number;
    closeDate: string;
  };
  // Form card for draft records (Activity/Opportunity/Account)
  formCard?: {
    type: 'activity' | 'opportunity' | 'account';
    isNew: boolean;
    existingId?: string;
    data: Record<string, unknown>;
    status?: 'pending' | 'confirmed' | 'modified';
  };
  // Record list for displaying query results
  recordList?: {
    type: 'account' | 'opportunity' | 'activity';
    records: Array<{
      id: string;
      title: string;
      subtitle?: string;
      meta?: string;
    }>;
    title?: string;
  };
}

// Form fill callback type
export type FormFillCallback = (data: Record<string, unknown>) => void;

// Direct Line session refs for Copilot Studio multi-turn conversations
export interface DirectLineTokenRef {
  token: string;
  expiresAt: number;
}

export interface DirectLineConversationRef {
  conversationId: string;
  streamUrl?: string;
  watermark?: string;
}

export interface DirectLineSessionRefs {
  tokenRef: React.MutableRefObject<DirectLineTokenRef | null>;
  conversationRef: React.MutableRefObject<DirectLineConversationRef | null>;
}

interface CopilotContextValue {
  // Panel state
  isOpen: boolean;
  isFullScreen: boolean;
  isExpanded: boolean;
  setIsExpanded: (value: boolean) => void;
  openPanel: (fullScreen?: boolean) => void;
  closePanel: () => void;
  toggleFullScreen: () => void;
  
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  
  // Chat state
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  isSending: boolean;
  setIsSending: (value: boolean) => void;
  sendMessage: (text: string) => void;
  inputValue: string;
  setInputValue: (value: string) => void;
  
  // Recording state
  isRecording: boolean;
  setIsRecording: (value: boolean) => void;
  
  // Page context for agent awareness
  pageContext: PageContext | null;
  setPageContext: (ctx: PageContext | null) => void;
  
  // Dynamic input placeholder
  inputPlaceholder: string;
  setInputPlaceholder: (placeholder: string) => void;
  
  // Form fill callback for agent to populate page forms
  formFillCallback: FormFillCallback | null;
  setFormFillCallback: (callback: FormFillCallback | null) => void;
  
  // Conversation management
  startNewConversation: () => Promise<void>;
  
  // Direct Line session refs for Copilot Studio
  directLineSessionRefs: DirectLineSessionRefs;
}

export interface PageContext {
  currentPage: string;
  pageData?: unknown;
  summary?: string;
}

const CopilotContext = createContext<CopilotContextValue | null>(null);

export function CopilotProvider({ children }: { children: ReactNode }) {
  const { data: user } = useUser();
  const locale: Locale = getLocale();

  
  // Panel state
  const [isOpen, setIsOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  
  // Chat state - persist messages in sessionStorage to survive navigation
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const stored = sessionStorage.getItem('copilot-messages');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [isSending, setIsSending] = useState(false);
  const [inputValue, setInputValue] = useState('');

  // Persist messages to sessionStorage whenever they change
  useEffect(() => {
    try {
      sessionStorage.setItem('copilot-messages', JSON.stringify(messages));
    } catch (e) {
      console.warn('Failed to persist copilot messages:', e);
    }
  }, [messages]);
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  
  // Page context for agent awareness - with defensive shallow-equal check
  const [pageContextState, setPageContextState] = useState<PageContext | null>(null);
  const setPageContext = useCallback((next: PageContext | null) => {
    setPageContextState((prev) => {
      // Shallow-equal bail out to prevent infinite loops from consumer useEffects
      if (prev === next) return prev;
      if (prev === null || next === null) return next;
      if (
        prev.currentPage === next.currentPage &&
        prev.summary === next.summary &&
        JSON.stringify(prev.pageData) === JSON.stringify(next.pageData)
      ) {
        return prev; // No change, keep old reference
      }
      return next;
    });
  }, []);
  const pageContext = pageContextState;
  const pageContextRef = useRef<PageContext | null>(null);
  
  // Keep pageContextRef in sync with pageContext state
  
  // Debug: track what's causing re-renders
  const prevUserRef = useRef(user);
  const prevLocaleRef = useRef(locale);
  const prevMessagesRef = useRef(messages);
  const prevPageContextRef = useRef(pageContextState);
  useEffect(() => {
    const changes: string[] = [];
    if (prevUserRef.current !== user) changes.push('user');
    if (prevLocaleRef.current !== locale) changes.push('locale');
    if (prevMessagesRef.current !== messages) changes.push('messages');
    if (prevPageContextRef.current !== pageContextState) changes.push('pageContext');
    if (changes.length > 0) {
      console.log('[LOOP DEBUG] CopilotProvider deps changed:', changes.join(', '));
    }
    prevUserRef.current = user;
    prevLocaleRef.current = locale;
    prevMessagesRef.current = messages;
    prevPageContextRef.current = pageContextState;
  });
  useEffect(() => {
    pageContextRef.current = pageContext;
  }, [pageContext]);
  
  // Dynamic input placeholder (with guard to prevent loops)
  const [inputPlaceholderState, setInputPlaceholderState] = useState('');
  const setInputPlaceholder = useCallback((next: string) => {
    setInputPlaceholderState((prev) => {
      if (prev === next) return prev; // No change, keep old reference
      return next;
    });
  }, []);
  const inputPlaceholder = inputPlaceholderState;
  
  // Form fill callback for agent to populate page forms
  const formFillCallbackRef = useRef<FormFillCallback | null>(null);
  const setFormFillCallback = useCallback((callback: FormFillCallback | null) => {
    formFillCallbackRef.current = callback;
  }, []);
  
  // Refs for copilot connection
  const copilotConversationRef = useRef<ConversationInfo | null>(null);
  const userContextSentRef = useRef(false);
  const watermarkRef = useRef<string | undefined>(undefined);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isReconnectingRef = useRef(false);
  const wsCleanupRef = useRef<(() => void) | null>(null);
  const typingMessageIdRef = useRef<string | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Direct Line session refs for Copilot Studio multi-turn conversations
  const directLineTokenRef = useRef<DirectLineTokenRef | null>(null);
  const directLineConversationRef = useRef<DirectLineConversationRef | null>(null);
  const directLineSessionRefs: DirectLineSessionRefs = useMemo(() => ({
    tokenRef: directLineTokenRef,
    conversationRef: directLineConversationRef,
  }), []);

  // Helper function to simulate streaming text effect
  const simulateStreamingText = useCallback((messageId: string, fullContent: string, agentName: string, timestamp: string, onComplete?: () => void) => {
    // Clean up any existing streaming interval
    if (streamingIntervalRef.current) {
      clearInterval(streamingIntervalRef.current);
      streamingIntervalRef.current = null;
    }
    
    let currentIndex = 0;
    const charsPerTick = 15; // Characters to add per tick (increased from 3 for performance)
    const tickInterval = 50; // Milliseconds between ticks (increased from 20 for performance)
    
    // Start with empty content, then gradually reveal
    setMessages((prev) => {
      const filtered = typingMessageIdRef.current
        ? prev.filter((msg) => msg.id !== typingMessageIdRef.current)
        : prev;
      
      // Check for duplicate
      const existingContents = new Set(filtered.filter((p) => p.type === 'agent').map((p) => p.content));
      if (existingContents.has(fullContent)) {
        // Call onComplete even if duplicate to ensure isSending is cleared
        if (onComplete) onComplete();
        return filtered;
      }
      
      return [...filtered, {
        id: messageId,
        type: 'agent' as const,
        role: 'assistant' as const,
        content: '',
        agentName,
        timestamp,
        isStreaming: true,
      }];
    });
    
    typingMessageIdRef.current = null;
    
    streamingIntervalRef.current = setInterval(() => {
      currentIndex += charsPerTick;
      const partialContent = fullContent.slice(0, currentIndex);
      
      if (currentIndex >= fullContent.length) {
        // Done streaming
        if (streamingIntervalRef.current) {
          clearInterval(streamingIntervalRef.current);
          streamingIntervalRef.current = null;
        }
        setMessages((prev) => prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, content: fullContent, isStreaming: false }
            : msg
        ));
        // Call onComplete callback when streaming finishes
        if (onComplete) onComplete();
      } else {
        // Update with partial content
        setMessages((prev) => prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, content: partialContent }
            : msg
        ));
      }
    }, tickInterval);
  }, []);

  // Helper function to show typing indicator for Copilot Studio
  const showTypingIndicator = useCallback(() => {
    // Clear any existing typing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // If there's no existing typing message, create one
    if (!typingMessageIdRef.current) {
      const thinkingMsgId = `msg-${Date.now()}-typing`;
      typingMessageIdRef.current = thinkingMsgId;
      
      const thinkingMessage: ChatMessage = {
        id: thinkingMsgId,
        type: 'agent',
        role: 'assistant',
        content: '',
        agentName: 'Copilot',
        timestamp: new Date().toISOString(),
        isThinking: true,
        thinkingSteps: [
          { stage: 'generating', status: 'active', label: locale === 'zh-Hans' ? 'Copilot \u6b63\u5728\u601d\u8003...' : 'Copilot is thinking...' },
        ],
      };
      setMessages((prev) => [...prev, thinkingMessage]);
    }
    
    // Set timeout to remove typing indicator if no response (safety net)
    typingTimeoutRef.current = setTimeout(() => {
      if (typingMessageIdRef.current) {
        setMessages((prev) => prev.filter((msg) => msg.id !== typingMessageIdRef.current));
        typingMessageIdRef.current = null;
      }
    }, 30000); // 30 second timeout
  }, [locale]);

  // Helper function to clear typing indicator and add actual message
  // Helper function to clear typing indicator and add actual message
  const handleBotMessage = useCallback((message: CopilotMessage) => {
    // Clear typing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    
    const messageId = `bot-${message.timestamp.getTime()}-${Math.random().toString(36).slice(2, 7)}`;
    const fullContent = message.text || '';
    const timestamp = message.timestamp.toISOString();
    
    // Check if streaming is enabled
    if (getSimulateStreaming() && fullContent.length > 0) {
      // Keep isSending true during streaming, will be set to false when streaming completes
      simulateStreamingText(messageId, fullContent, 'Copilot', timestamp, () => {
        // Callback when streaming completes
        setIsSending(false);
      });
    } else {
      // Add message immediately without streaming
      setIsSending(false);
      
      const newMessage: ChatMessage = {
        id: messageId,
        type: 'agent',
        role: 'assistant',
        content: fullContent,
        agentName: 'Copilot',
        timestamp,
      };
      
      setMessages((prev) => {
        // Remove typing indicator if present
        const filtered = typingMessageIdRef.current 
          ? prev.filter((msg) => msg.id !== typingMessageIdRef.current)
          : prev;
        
        // Check for duplicate content
        const existingContents = new Set(filtered.filter((p) => p.type === 'agent').map((p) => p.content));
        if (existingContents.has(newMessage.content)) {
          return filtered;
        }
        
        return [...filtered, newMessage];
      });
      
      typingMessageIdRef.current = null;
    }
  }, [simulateStreamingText]);

  // Initialize copilot connection when panel opens
  useEffect(() => {
    if (!isOpen) return;
    if (copilotConversationRef.current) return; // Already connected
    
    const initCopilot = async () => {
      const config = getCopilotConfig();
      if (!config) {
        setIsConnected(false);
        return;
      }
      
      setIsConnecting(true);
      try {
        const conversation = await getOrCreateConversation(config);
        copilotConversationRef.current = conversation;
        setIsConnected(true);
        
        // Send user context if user is available
        if (user && !userContextSentRef.current) {
          await sendUserContext(conversation, {
            userId: user.objectId || '',
            userPrincipalName: user.userPrincipalName || '',
            displayName: user.fullName || '',
          });
          userContextSentRef.current = true;
        }
        
        // Try WebSocket connection first for real-time updates
        // WebSocket provides typing indicators, polling is the fallback
        if (conversation.streamUrl) {
          console.log('[Copilot] Setting up WebSocket connection');
          wsCleanupRef.current = createWebSocketConnection(conversation, {
            onTyping: () => {
              console.log('[Copilot] Received typing indicator');
              showTypingIndicator();
            },
            onMessage: (message) => {
              console.log('[Copilot] Received WebSocket message:', message);
              handleBotMessage(message);
            },
            onClose: () => {
              console.log('[Copilot] WebSocket closed, falling back to polling');
              // Fall back to polling if WebSocket closes (includes error cases)
              wsCleanupRef.current = null;
              if (!pollIntervalRef.current && copilotConversationRef.current) {
                startPolling();
              }
            },
          });
        } else {
          // No streamUrl, use polling
          startPolling();
        }
      } catch (error) {
        console.error('Failed to initialize Copilot:', error);
        setIsConnected(false);
      } finally {
        setIsConnecting(false);
      }
    };
    
    // Polling fallback function
    const startPolling = () => {
      console.log('[Copilot] Starting polling fallback');
      pollIntervalRef.current = setInterval(async () => {
        if (!copilotConversationRef.current) return;
        
        try {
          const { activities, watermark } = await pollMessages(
            copilotConversationRef.current,
            watermarkRef.current
          );
          watermarkRef.current = watermark;
          
          // Check for typing activities - Direct Line uses type === 'typing'
          const typingActivities = activities.filter(
            (a) => a.type === 'typing' && a.from === 'bot'
          );
          if (typingActivities.length > 0) {
            showTypingIndicator();
          }
          
          const botMessages = activities.filter(
            (a) => a.type === 'message' && a.from === 'bot' && a.text
          );
          
          if (botMessages.length > 0) {
            for (const m of botMessages) {
              handleBotMessage(m);
            }
          }
        } catch (err) {
          const error = err as Error & { status?: number };
          if ((error.status === 403 || error.message?.includes('403')) && !isReconnectingRef.current) {
            isReconnectingRef.current = true;
            clearConversation();
            copilotConversationRef.current = null;
            userContextSentRef.current = false;
            watermarkRef.current = undefined;
            
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            
            setTimeout(async () => {
              try {
                const config = getCopilotConfig();
                if (config) {
                  const conversation = await getOrCreateConversation(config);
                  copilotConversationRef.current = conversation;
                  setIsConnected(true);
                }
              } catch (reconnectErr) {
                console.error('Failed to reconnect:', reconnectErr);
                setIsConnected(false);
              } finally {
                isReconnectingRef.current = false;
              }
            }, 1000);
          }
        }
      }, 1000);
    };
    
    initCopilot();
    
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (wsCleanupRef.current) {
        wsCleanupRef.current();
        wsCleanupRef.current = null;
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, [isOpen, user, showTypingIndicator, handleBotMessage]);

  const openPanel = useCallback((fullScreen = false) => {
    setIsOpen(true);
    setIsFullScreen(fullScreen);
  }, []);

  const closePanel = useCallback(() => {
    setIsOpen(false);
    setIsFullScreen(false);
  }, []);

  const toggleFullScreen = useCallback(() => {
    setIsFullScreen((prev) => !prev);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;
    
    // Add user message immediately
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      type: 'user',
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsSending(true);
    
    // Always use Power Automate Flow as the orchestrator for LLM function calling
    // Local agent processes data operations, Copilot Studio is available as a tool/function
    const llmConfig = getLLMConfig();
      if (llmConfig?.enabled && llmConfig?.endpoint) {
        // Create a thinking message that will be updated with progress
        const thinkingMsgId = `msg-${Date.now()}-thinking`;
        const thinkingMessage: ChatMessage = {
          id: thinkingMsgId,
          type: 'agent',
          role: 'assistant',
          content: '',
          agentName: 'Sales Copilot',
          timestamp: new Date().toISOString(),
          isThinking: true,
          thinkingSteps: [
            { stage: 'intent', status: 'active', label: locale === 'zh-Hans' ? '理解意图...' : 'Understanding...' },
          ],
        };
        setMessages((prev) => [...prev, thinkingMessage]);
        
        try {
          // Build conversation history from messages
          // Build conversation history from messages
          // Use ref to avoid dependency on messages state
          const currentMessages = messages;
          const conversationHistory = currentMessages
            .filter((m: ChatMessage) => m.role === 'user' || m.role === 'assistant')
            .map((m: ChatMessage) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            }));
          
          // Progress callback to update thinking message
          const handleProgress = (progress: ThinkingProgress) => {
            setMessages((prev) => prev.map((msg) => {
              if (msg.id !== thinkingMsgId) return msg;
              
              const newSteps = [...(msg.thinkingSteps || [])];
              const stepIndex = newSteps.findIndex((s) => s.stage === progress.stage);
              
              if (stepIndex >= 0) {
                // Update existing step
                if (progress.status === 'active') {
                  newSteps[stepIndex] = {
                    ...newSteps[stepIndex],
                    status: 'active',
                    label: progress.stage === 'intent'
                      ? (locale === 'zh-Hans' ? '理解意图...' : 'Understanding...')
                      : progress.stage === 'executing'
                      ? (locale === 'zh-Hans' ? `执行: ${progress.functionDisplayName || ''}` : `Executing: ${progress.functionDisplayName || ''}`)
                      : (locale === 'zh-Hans' ? '生成回复...' : 'Generating response...'),
                  };
                } else if (progress.status === 'completed') {
                  newSteps[stepIndex] = {
                    ...newSteps[stepIndex],
                    status: 'completed',
                    // For intent stage, keep simple completion label instead of showing intent detail
                    // to avoid duplication with executing stage's function name
                    label: progress.stage === 'intent'
                      ? (locale === 'zh-Hans' ? '已理解' : 'Understood')
                      : progress.stage === 'executing'
                      ? (progress.functionDisplayName || (locale === 'zh-Hans' ? '已执行' : 'Executed'))
                      : (locale === 'zh-Hans' ? '已完成' : 'Completed'),
                  };
                }
              } else {
                // Step doesn't exist yet, add it
                const newLabel = progress.status === 'active'
                  ? (progress.stage === 'intent'
                      ? (locale === 'zh-Hans' ? '理解意图...' : 'Understanding...')
                      : progress.stage === 'executing'
                      ? (locale === 'zh-Hans' ? `执行: ${progress.functionDisplayName || ''}` : `Executing: ${progress.functionDisplayName || ''}`)
                      : (locale === 'zh-Hans' ? '生成回复...' : 'Generating response...'))
                  : (progress.stage === 'intent'
                      ? (locale === 'zh-Hans' ? '已理解' : 'Understood')
                      : progress.stage === 'executing'
                      ? (progress.functionDisplayName || (locale === 'zh-Hans' ? '已执行' : 'Executed'))
                      : (locale === 'zh-Hans' ? '已完成' : 'Completed'));
                newSteps.push({
                  stage: progress.stage,
                  status: progress.status,
                  label: newLabel,
                });
              }
              
              return { ...msg, thinkingSteps: newSteps };
            }));
          };
          
          const response = await processMessage(text.trim(), {
            userId: user?.objectId,
            userEmail: user?.userPrincipalName,
            locale,
            conversationHistory,
            pageContext: pageContextRef.current ? {
              currentPage: pageContextRef.current.currentPage,
              pageData: pageContextRef.current.pageData,
              summary: pageContextRef.current.summary,
            } : undefined,
            sessionRefs: directLineSessionRefs,
          }, handleProgress);
          

          
          // Check if response is a draft function (returns form card)
          const isDraftFunction = response.functionCalled && ['draftActivity', 'draftOpportunity', 'draftAccount'].includes(response.functionCalled);
          
          if (isDraftFunction && response.success && response.functionResult) {
            // Create a form-card message instead of regular response
            setIsSending(false);
            const formCardResult = response.functionResult as { type: 'activity' | 'opportunity' | 'account'; isNew: boolean; data: Record<string, unknown> };
            
            setMessages((prev) => prev.map((msg) => {
              if (msg.id !== thinkingMsgId) return msg;
              return {
                ...msg,
                type: 'form-card' as const,
                content: response.content || '',
                functionCalled: response.functionCalled,
                functionDisplayName: response.functionDisplayName,
                isThinking: false,
                thinkingSteps: response.thinkingSteps?.map((s) => ({
                  stage: s.stage,
                  status: 'completed' as const,
                  label: s.label,
                  detail: s.detail,
                })),
                formCard: {
                  type: formCardResult.type,
                  isNew: formCardResult.isNew,
                  data: formCardResult.data,
                  status: 'pending' as const,
                },
              };
            }));
          } else {
            // Replace thinking message with final response
            // Check if streaming is enabled for local agent
            const shouldStream = getSimulateStreaming() && response.success && response.content && response.content.length > 0;
            
            if (shouldStream) {
              // Start streaming simulation for local agent
              // Start streaming simulation for local agent
              // First, mark the message as streaming with initial empty content
              setMessages((prev) => prev.map((msg) => {
                if (msg.id !== thinkingMsgId) return msg;
                return {
                  ...msg,
                  content: '',
                  functionCalled: response.functionCalled,
                  functionDisplayName: response.functionDisplayName,
                  isThinking: false,
                  isStreaming: true,
                  thinkingSteps: response.thinkingSteps?.map((s) => ({
                    stage: s.stage,
                    status: 'completed' as const,
                    label: s.label,
                    detail: s.detail,
                  })),
                  recordList: response.recordList,
                };
              }));
              
              // Simulate streaming with interval
              const fullContent = response.content;
              let currentIndex = 0;
              const charsPerTick = 15; // Characters to add per tick (increased from 3 for performance)
              const tickInterval = 50; // Milliseconds between ticks (increased from 20 for performance)
              
              const streamInterval = setInterval(() => {
                currentIndex += charsPerTick;
                const partialContent = fullContent.slice(0, currentIndex);
                
                if (currentIndex >= fullContent.length) {
                  clearInterval(streamInterval);
                  // Streaming complete
                  setMessages((prev) => {
                    const found = prev.find((m) => m.id === thinkingMsgId);

                    return prev.map((msg) =>
                      msg.id === thinkingMsgId
                        ? { ...msg, content: fullContent, isStreaming: false }
                        : msg
                    );
                  });
                  // Set isSending false only after streaming completes
                  setIsSending(false);
                } else {
                  setMessages((prev) => prev.map((msg) =>
                    msg.id === thinkingMsgId
                      ? { ...msg, content: partialContent }
                      : msg
                  ));
                }
              }, tickInterval);
            } else {
              // No streaming - set content immediately
              setIsSending(false);
              setMessages((prev) => prev.map((msg) => {
                if (msg.id !== thinkingMsgId) return msg;
                
                if (response.success) {
                  // Ensure we have content - if empty, show a generic confirmation
                  const displayContent = response.content && response.content.trim().length > 0
                    ? response.content
                    : (locale === 'zh-Hans' ? '操作已完成。' : 'Done.');

                  return {
                    ...msg,
                    content: displayContent,
                    functionCalled: response.functionCalled,
                    functionDisplayName: response.functionDisplayName,
                    isThinking: false,
                    thinkingSteps: response.thinkingSteps?.map((s) => ({
                      stage: s.stage,
                      status: 'completed' as const,
                      label: s.label,
                      detail: s.detail,
                    })),
                    recordList: response.recordList,
                  };
                } else {
                  return {
                    ...msg,
                    content: locale === 'zh-Hans'
                      ? `\u274c \u5904\u7406\u5931\u8d25: ${response.error}`
                      : `\u274c Error: ${response.error}`,
                    agentName: 'System',
                    isThinking: false,
                    thinkingSteps: undefined,
                  };
                }
              }));
            }
          }
          
          // Check if this is a form fill action and execute callback
          if (response.functionCalled === 'fillActivityForm' && response.functionResult && formFillCallbackRef.current) {
            formFillCallbackRef.current(response.functionResult as Record<string, unknown>);
          }
          
          // Log function call for debugging
          if (response.functionCalled) {

          }
        } catch (err) {
          console.error('Failed to process message:', err);
          setIsSending(false);
          // Update thinking message to show error
          setMessages((prev) => prev.map((msg) => {
            if (msg.id !== thinkingMsgId) return msg;
            return {
              ...msg,
              content: locale === 'zh-Hans'
                ? `❌ 处理失败: ${err instanceof Error ? err.message : '未知错误'}`
                : `❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
              agentName: 'System',
              isThinking: false,
              thinkingSteps: undefined,
            };
          }));
        }
    } else {
      // Power Automate endpoint not configured
      setIsSending(false);
      const notConfiguredMessage: ChatMessage = {
        id: `msg-${Date.now()}-system`,
        type: 'agent',
        role: 'assistant',
        content: locale === 'zh-Hans'
          ? '⚠️ Power Automate Flow 端点尚未配置。请前往设置页面配置 LLM Function Calling 端点。'
          : '⚠️ Power Automate Flow endpoint is not configured. Please go to Settings to configure your LLM Function Calling endpoint.',
        agentName: 'System',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, notConfiguredMessage]);
    }
  }, [user, locale]); // pageContext accessed via ref to avoid re-creating sendMessage

  const startNewConversation = useCallback(async () => {
    // Clear current session
    clearConversation();
    copilotConversationRef.current = null;
    userContextSentRef.current = false;
    watermarkRef.current = undefined;
    // Clear Direct Line conversation ref (keep token if not expired)
    directLineConversationRef.current = null;
    typingMessageIdRef.current = null;
    setMessages([]);
    
    // Also clear persisted messages
    try {
      sessionStorage.removeItem('copilot-messages');
    } catch (e) {
      console.warn('Failed to clear persisted messages:', e);
    }
    
    // Clean up existing connections
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (wsCleanupRef.current) {
      wsCleanupRef.current();
      wsCleanupRef.current = null;
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    
    // Re-initialize
    const config = getCopilotConfig();
    if (config) {
      setIsConnecting(true);
      try {
        const conversation = await getOrCreateConversation(config);
        copilotConversationRef.current = conversation;
        setIsConnected(true);
        
        if (user) {
          await sendUserContext(conversation, {
            userId: user.objectId || '',
            userPrincipalName: user.userPrincipalName || '',
            displayName: user.fullName || '',
          });
          userContextSentRef.current = true;
        }
        
        // Set up WebSocket connection for new conversation
        if (conversation.streamUrl) {
          wsCleanupRef.current = createWebSocketConnection(conversation, {
            onTyping: () => showTypingIndicator(),
            onMessage: (message) => handleBotMessage(message),
            onError: (error) => console.error('[Copilot] WebSocket error:', error),
            onClose: () => console.log('[Copilot] WebSocket closed'),
          });
        }
      } catch (error) {
        console.error('Failed to re-initialize Copilot:', error);
        setIsConnected(false);
      } finally {
        setIsConnecting(false);
      }
    }
  }, [user, showTypingIndicator, handleBotMessage]);

  const value: CopilotContextValue = useMemo(() => ({
    isOpen,
    isFullScreen,
    isExpanded,
    setIsExpanded,
    openPanel,
    closePanel,
    toggleFullScreen,
    isConnected,
    isConnecting,
    messages,
    setMessages,
    isSending,
    setIsSending,
    sendMessage,
    inputValue,
    setInputValue,
    isRecording,
    setIsRecording,
    pageContext: pageContextRef.current,
    setPageContext,
    inputPlaceholder,
    setInputPlaceholder,
    formFillCallback: formFillCallbackRef.current,
    setFormFillCallback,
    startNewConversation,
    directLineSessionRefs,
  }), [
    isOpen,
    isFullScreen,
    isExpanded,
    openPanel,
    closePanel,
    toggleFullScreen,
    isConnected,
    isConnecting,
    messages,
    isSending,
    sendMessage,
    inputValue,
    isRecording,

    setPageContext,
    inputPlaceholder,
    setInputPlaceholder,
    setFormFillCallback,
    startNewConversation,
    directLineSessionRefs,
  ]);

  return (
    <CopilotContext.Provider value={value}>
      {children}
    </CopilotContext.Provider>
  );
}

export function useCopilot() {
  const context = useContext(CopilotContext);
  if (!context) {
    throw new Error('useCopilot must be used within a CopilotProvider');
  }
  return context;
}
