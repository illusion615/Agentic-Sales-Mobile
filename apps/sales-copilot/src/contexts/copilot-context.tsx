import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@/hooks/use-user';
import { useSettingsReady } from '@/contexts/settings-context';
import { 
  getCopilotConfig, 
  getOrCreateConversation, 
  sendUserContext, 
  pollMessages,
  clearConversation,
  createWebSocketConnection,
  type ConversationInfo,
  type CopilotMessage
} from '@/services/copilot-service';
import { getLocale, getLLMConfig, getSimulateStreaming, type Locale } from '@/lib/i18n';
import { toast } from 'sonner';
import { processMessage, type ThinkingProgress } from '@/lib/copilot-agent';
import type { AwaitingClarification } from '@/lib/agent-utils';
import { extractVisitDataFromText, type ExtractedVisitData } from '@/lib/visit-extraction';

// Re-export ExtractedVisitData for consumers that import from context
export type { ExtractedVisitData } from '@/lib/visit-extraction';

export interface ThinkingStep {
  stage: 'intent' | 'matching' | 'executing' | 'generating';
  status: 'pending' | 'active' | 'completed';
  label: string;
  detail?: string;
}

export interface ChatMessage {
  id: string;
  type: 'user' | 'agent' | 'stage-card' | 'form-card' | 'batch-form-card' | 'match-selection' | 'clarification' | 'awaiting-clarification';
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
    type: 'activity' | 'opportunity' | 'account' | 'contact';
    isNew: boolean;
    existingId?: string;
    data: Record<string, unknown>;
    status?: 'pending' | 'confirmed' | 'modified';
    createdRecordId?: string;
  };
  // Batch form cards for multiple drafts
  batchFormCards?: {
    items: Array<{
      type: 'activity' | 'opportunity' | 'account' | 'contact';
      isNew: boolean;
      data: Record<string, unknown>;
      batchIndex: number;
      status?: 'pending' | 'confirmed' | 'modified';
      createdRecordId?: string;
    }>;
    totalCount: number;
  };
  // Match selection for fuzzy matching
  matchSelection?: {
    entityType: 'account' | 'contact' | 'opportunity' | 'activity';
    query: string;
    matches: Array<{
      id: string;
      name: string;
      subtitle?: string;
      score: number;
      matchType: 'exact' | 'contains' | 'fuzzy';
      accountId?: string;
      accountName?: string;
    }>;
    // Low-confidence matches (<70) for the "Show more" collapsible
    lowConfidenceMatches?: Array<{
      id: string;
      name: string;
      subtitle?: string;
      score: number;
      matchType: 'exact' | 'contains' | 'fuzzy';
      accountId?: string;
      accountName?: string;
    }>;
    confidence: 'high' | 'medium' | 'low' | 'none';
    pendingAction?: string;
    // Pending intent to execute after user selects a match
    pendingIntent?: {
      function: string;
      arguments: Record<string, unknown>;
    };
  };
  // Clarification question for ambiguous inputs
  clarification?: {
    summary: string;
    questions: Array<{
      id: string;
      question: string;
      options?: Array<{
        id: string;
        label: string;
        description?: string;
      }>;
      allowFreeInput?: boolean;
    }>;
  };

  // Additional intents inferred from user input (multi-intent support)
  additionalIntents?: {
    message: string;
    forms: Array<{
      type: 'activity' | 'opportunity' | 'account' | 'contact';
      data: Record<string, unknown>;
      reason: string;
      batchIndex: number;
    }>;
  };

  // Record list for displaying query results
  recordList?: {
    type: 'account' | 'opportunity' | 'activity' | 'contact';
    records: Array<{
      id: string;
      title: string;
      subtitle?: string;
      meta?: string;
    }>;
    title?: string;
  };

  // I-2 Stage 1: awaiting-clarification blocking state
  awaitingClarification?: AwaitingClarification;
  resolutionState?: 'blocked' | 'resolving' | 'resolved';
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

  // Extract structured visit data using Copilot Studio
  extractVisitData: (text: string, findAccountByName: (name: string) => { id: string; name1?: string } | undefined) => Promise<ExtractedVisitData | null>;
  
  // Direct Line session refs for Copilot Studio
  directLineSessionRefs: DirectLineSessionRefs;
  
  // Continue pending action after match selection
  continuePendingAction: (
    selectedRecord: { id: string; name: string; accountId?: string; accountName?: string },
    pendingIntent: { function: string; arguments: Record<string, unknown> },
    entityType: 'account' | 'contact' | 'opportunity' | 'activity'
  ) => Promise<void>;
  
  // Create new record from intent (skip match selection)
  createNewFromIntent: (
    pendingIntent: { function: string; arguments: Record<string, unknown> }
  ) => Promise<void>;

  // Unified resolution: chain-create the missing entity (e.g. open a draftContact form, then resume the parked main intent)
  createEntityForResolution: (
    pendingIntent: { function: string; arguments: Record<string, unknown> },
    entityKind: 'contact' | 'account' | 'opportunity',
    queryName: string,
    blockedMsgId?: string
  ) => Promise<void>;

  // Unified resolution: strip the unresolved entity from the args and open the main draft form so the user can pick in-form
  skipResolutionAndDraft: (
    pendingIntent: { function: string; arguments: Record<string, unknown> },
    entityKind: 'contact' | 'account' | 'opportunity',
    blockedMsgId?: string
  ) => Promise<void>;

  // Unified resolution: re-run fuzzy match with a new query and patch the existing message's matchSelection in place
  refreshResolution: (
    messageId: string,
    newQuery: string,
    entityType: 'account' | 'contact' | 'opportunity' | 'activity',
    pendingIntent: { function: string; arguments: Record<string, unknown> }
  ) => Promise<void>;
  
  // Clarification suggestions for quick action pills
  clarificationSuggestions: Array<{ text: string; query: string; action?: { function: string; arguments: Record<string, unknown> } }>;
  setClarificationSuggestions: (suggestions: Array<{ text: string; query: string; action?: { function: string; arguments: Record<string, unknown> } }>) => void;
  clearClarificationSuggestions: () => void;
  
  // Execute a clarification action directly (skip LLM re-analysis)
  executeClarificationAction: (
    actionFunction: string,
    actionArguments: Record<string, unknown>,
    displayText: string
  ) => Promise<void>;
  
  // Update form card status in a message (for persisting confirmed/modified state)
  updateFormCardStatus: (
    messageId: string,
    status: 'pending' | 'confirmed' | 'modified',
    batchIndex?: number,
    createdRecordId?: string
  ) => void;
  
  // Rollback conversation to a specific message (removes that message and all after it)
  rollbackToMessage: (messageId: string) => void;

  // I-2 Round 3: resume a parked intent after the user finishes creating a new contact via the inline draft form.
  completeParkedIntentWithNewContact: (contactId: string, contactName: string, accountId?: string, accountName?: string) => Promise<void>;
}

export interface PageContext {
  currentPage: string;
  pageData?: unknown;
  summary?: string;
}

const CopilotContext = createContext<CopilotContextValue | null>(null);

export function CopilotProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: user } = useUser();
  const locale: Locale = getLocale();
  const settingsReady = useSettingsReady();
  
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

  // I-2 Stage 1: ref tracking latest messages (used by sendMessage to detect blocked state without stale closure)
  const messagesRef = useRef<ChatMessage[]>(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // I-2 Round 3: parked intent — set when user replies 'create' to a contact awaiting-clarification.
  // The parked function is resumed by completeParkedIntentWithNewContact after the new contact is saved.
  const parkedIntentRef = useRef<{
    function: string;
    arguments: Record<string, unknown>;
    pendingKind: 'contact' | 'account' | 'opportunity';
    blockedMsgId: string;
  } | null>(null);

  // Persist messages to sessionStorage - only when all streaming/thinking is complete
  // Use a ref to track the last persisted snapshot and avoid redundant writes
  const lastPersistedRef = useRef<string>('');
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Separate persistence into a stable callback that doesn't change on every render
  const persistMessages = useCallback((messagesToPersist: ChatMessage[]) => {
    // Filter out any message that is still streaming or thinking
    const hasActiveState = messagesToPersist.some((m) => m.isStreaming || m.isThinking);
    if (hasActiveState) {
      return; // Don't persist during active streaming/thinking
    }

    // Strip transient flags before persisting
    const persistableMessages = messagesToPersist.map((m) => ({
      ...m,
      isStreaming: undefined,
      isThinking: undefined,
    }));

    const json = JSON.stringify(persistableMessages);

    // Skip if unchanged from last persisted snapshot
    if (json === lastPersistedRef.current) {
      return;
    }

    lastPersistedRef.current = json;

    try {
      sessionStorage.setItem('copilot-messages', json);
    } catch (e) {
      console.warn('Failed to persist copilot messages:', e);
    }
  }, []);

  // Effect to trigger persistence with debounce - only when messages settle
  useEffect(() => {
    // Don't even schedule if any message is actively streaming or thinking
    const hasActiveState = messages.some((m) => m.isStreaming || m.isThinking);
    if (hasActiveState) {
      // Clear any pending timer - we'll persist when streaming completes
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      return;
    }

    // Debounce persistence by 500ms after all streaming/thinking completes
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }

    persistTimerRef.current = setTimeout(() => {
      persistMessages(messages);
      persistTimerRef.current = null;
    }, 500);

    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
      }
    };
  }, [messages, persistMessages]);
  
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

  // Rollback conversation to a specific message (removes that message and all after it)
  const rollbackToMessage = useCallback((messageId: string) => {
    setMessages((prev) => {
      const targetIndex = prev.findIndex((msg) => msg.id === messageId);
      if (targetIndex === -1) return prev;
      // Keep messages before the target message
      return prev.slice(0, targetIndex);
    });
  }, []);

  // I-2 Round 3: resume a parked intent after the user finishes creating a new contact via the inline draft form.
  // Also propagates the new contact's account back into the parked args so the resumed form (e.g. Activity)
  // gets the correct account pre-filled — fixes the case where the agent only resolved the contact gap and
  // never resolved the account on its own.
  const completeParkedIntentWithNewContact = useCallback(async (contactId: string, contactName: string, accountId?: string, accountName?: string) => {
    const parked = parkedIntentRef.current;
    if (!parked || parked.pendingKind !== 'contact') return;
    parkedIntentRef.current = null;

    const newArgs: Record<string, unknown> = { ...parked.arguments, contactId, contactName };
    // Inject the contact's account only when the parked intent didn't already resolve one.
    if (accountId && !newArgs.accountId) newArgs.accountId = accountId;
    if (accountName && !newArgs.accountName) newArgs.accountName = accountName;

    setIsSending(true);
    try {
      const { executeFunction } = await import('@/lib/function-executor');
      const { getDisplayName } = await import('@/lib/function-registry');
      const fnResult = await executeFunction(
        parked.function,
        newArgs,
        { userId: user?.objectId, userEmail: user?.userPrincipalName },
      );
      const fnDisplay = getDisplayName(parked.function, locale === 'zh-Hans' ? 'zh-Hans' : 'en-US');

      if (fnResult.success && fnResult.data) {
        const formData = fnResult.data as { type: string; isNew: boolean; data: Record<string, unknown> };
        setMessages((prev) => [...prev, {
          id: `msg-${Date.now()}-resumed-form`,
          type: 'form-card',
          role: 'assistant',
          content: locale === 'zh-Hans'
            ? '联系人已新建，请确认以下信息'
            : 'Contact created. Please confirm the following information',
          functionCalled: parked.function,
          functionDisplayName: fnDisplay,
          timestamp: new Date().toISOString(),
          formCard: {
            type: formData.type as 'activity' | 'opportunity' | 'account' | 'contact',
            isNew: formData.isNew,
            data: formData.data,
            status: 'pending',
          },
        }]);
      } else {
        setMessages((prev) => [...prev, {
          id: `msg-${Date.now()}-resume-err`,
          type: 'agent',
          role: 'assistant',
          content: locale === 'zh-Hans'
            ? `❌ 新建联系人后恢复活动创建失败: ${fnResult.error}`
            : `❌ Failed to resume activity after contact create: ${fnResult.error}`,
          agentName: 'System',
          timestamp: new Date().toISOString(),
        }]);
      }
    } catch (err) {
      console.error('[CopilotContext] I-2 resume after contact create error:', err);
    } finally {
      setIsSending(false);
    }
  }, [user, locale]);
  const pageContext = pageContextState;
  const pageContextRef = useRef<PageContext | null>(null);
  
  // Keep pageContextRef in sync with pageContext state
  
  // Debug effect removed - was causing performance issues by running on every render
  useEffect(() => {
    pageContextRef.current = pageContext;
  }, [pageContext]);

  // Extract structured visit data using Copilot Studio Direct Line
  // Delegates to the visit-extraction helper module
  const extractVisitData = useCallback(async (
    text: string,
    findAccountByName: (name: string) => { id: string; name1?: string } | undefined
  ): Promise<ExtractedVisitData | null> => {
    return extractVisitDataFromText(
      text,
      findAccountByName,
      locale,
      user?.objectId,
      copilotConversationRef,
      watermarkRef
    );
  }, [locale, user]);
  
  // Dynamic input placeholder (with guard to prevent loops)
  const [inputPlaceholderState, setInputPlaceholderState] = useState('');
  const setInputPlaceholder = useCallback((next: string) => {
    setInputPlaceholderState((prev) => {
      if (prev === next) return prev; // No change, keep old reference
      return next;
    });
  }, []);
  const inputPlaceholder = inputPlaceholderState;
  
  // Clarification suggestions for quick action pills
  const [clarificationSuggestions, setClarificationSuggestionsState] = useState<Array<{ text: string; query: string; action?: { function: string; arguments: Record<string, unknown> } }>>([]);
  const setClarificationSuggestions = useCallback((suggestions: Array<{ text: string; query: string; action?: { function: string; arguments: Record<string, unknown> } }>) => {
    setClarificationSuggestionsState(suggestions);
  }, []);
  const clearClarificationSuggestions = useCallback(() => {
    setClarificationSuggestionsState([]);
  }, []);
  
  // Execute a clarification action directly (calls draft function and shows form)
  const executeClarificationAction = useCallback(async (
    actionFunction: string,
    actionArguments: Record<string, unknown>,
    displayText: string
  ) => {
    setIsSending(true);
    clearClarificationSuggestions();
    
    // Add user message showing their selection
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      type: 'user',
      role: 'user',
      content: displayText,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    
    // Create a thinking message
    const thinkingMsgId = `msg-${Date.now()}-action`;
    const thinkingMessage: ChatMessage = {
      id: thinkingMsgId,
      type: 'agent',
      role: 'assistant',
      content: '',
      agentName: 'Sales Copilot',
      timestamp: new Date().toISOString(),
      isThinking: true,
      thinkingSteps: [
        { 
          stage: 'executing', 
          status: 'active', 
          label: locale === 'zh-Hans' ? `正在准备${displayText}...` : `Preparing ${displayText}...` 
        },
      ],
    };
    setMessages((prev) => [...prev, thinkingMessage]);
    
    try {
      const { executeFunction } = await import('@/lib/function-executor');
      const { getDisplayName } = await import('@/lib/function-registry');
      
      // Enhance arguments with page context if available
      const enhancedArgs = { ...actionArguments };
      if (pageContextRef.current?.pageData) {
        const pageData = pageContextRef.current.pageData as Record<string, unknown>;
        if (pageData.accountId) enhancedArgs.accountId = pageData.accountId;
        if (pageData.accountName) enhancedArgs.accountName = pageData.accountName;
        if (pageData.contactId) enhancedArgs.contactId = pageData.contactId;
        if (pageData.contactName) enhancedArgs.contactName = pageData.contactName;
        if (pageData.opportunityId) enhancedArgs.opportunityId = pageData.opportunityId;
        if (pageData.opportunityName) enhancedArgs.opportunityName = pageData.opportunityName;
      }
      
      const fnDisplayName = getDisplayName(actionFunction, locale === 'zh-Hans' ? 'zh-Hans' : 'en-US');
      
      const functionResult = await executeFunction(
        actionFunction,
        enhancedArgs,
        { userId: user?.objectId, userEmail: user?.userPrincipalName }
      );
      
      if (functionResult.success && functionResult.data) {
        const formCardResult = functionResult.data as { type: string; isNew: boolean; data: Record<string, unknown> };
        setMessages((prev) => prev.map((msg) => {
          if (msg.id !== thinkingMsgId) return msg;
          return {
            ...msg,
            type: 'form-card' as const,
            content: locale === 'zh-Hans' ? '请确认以下信息' : 'Please confirm the following information',
            functionCalled: actionFunction,
            functionDisplayName: fnDisplayName,
            isThinking: false,
            thinkingSteps: [
              { stage: 'executing' as const, status: 'completed' as const, label: locale === 'zh-Hans' ? `${fnDisplayName}：已准备表单` : `${fnDisplayName}: Form ready` },
            ],
            formCard: {
              type: formCardResult.type as 'activity' | 'opportunity' | 'account' | 'contact',
              isNew: formCardResult.isNew,
              data: formCardResult.data,
              status: 'pending' as const,
            },
          };
        }));
      } else {
        // Show error
        setMessages((prev) => prev.map((msg) => {
          if (msg.id !== thinkingMsgId) return msg;
          return {
            ...msg,
            content: locale === 'zh-Hans'
              ? `❌ 操作失败: ${functionResult.error}`
              : `❌ Error: ${functionResult.error}`,
            agentName: 'System',
            isThinking: false,
            thinkingSteps: undefined,
          };
        }));
      }
    } catch (error) {
      console.error('[CopilotContext] executeClarificationAction error:', error);
      setMessages((prev) => prev.map((msg) => {
        if (msg.id !== thinkingMsgId) return msg;
        return {
          ...msg,
          content: locale === 'zh-Hans'
            ? `❌ 操作失败: ${error instanceof Error ? error.message : '未知错误'}`
            : `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          agentName: 'System',
          isThinking: false,
          thinkingSteps: undefined,
        };
      }));
    } finally {
      setIsSending(false);
    }
  }, [user, locale]);
  
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

  // Initialize copilot connection when panel opens AND settings are ready
  // Connection is non-blocking - Copilot Studio is just a tool, not required for user interaction
  useEffect(() => {
    // Wait for settings to be loaded from Dataverse before attempting connection
    if (!settingsReady) {
      console.log('[Copilot] Waiting for settings to load from Dataverse...');
      return;
    }
    
    if (!isOpen) return;
    if (copilotConversationRef.current) return; // Already connected
    
    // Polling fallback function (hoisted for use in initCopilot)
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
    
    // Initialize Copilot Studio connection in background (non-blocking)
    const initCopilot = async () => {
      const config = getCopilotConfig();
      if (!config) {
        console.log('[Copilot] No Copilot config found in localStorage');
        setIsConnected(false);
        return;
      }
      
      // Don't set isConnecting - let user interact immediately
      // Connection happens silently in background
      console.log('[Copilot] Background: Initializing Copilot Studio connection...');
      try {
        const conversation = await getOrCreateConversation(config);
        copilotConversationRef.current = conversation;
        setIsConnected(true);
        console.log('[Copilot] Background: Successfully connected');
        
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
        console.error('[Copilot] Background: Failed to initialize:', error);
        setIsConnected(false);
        // Silent failure - Copilot Studio is optional, orchestration uses Power Automate Flow
        // Only show error toast for critical issues (like invalid config)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.includes('404')) {
          console.warn('[Copilot] Token Endpoint not found - check Settings');
        } else if (errorMessage.includes('HTML instead of JSON')) {
          console.warn('[Copilot] Token Endpoint returned invalid response');
        }
      }
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
  }, [isOpen, settingsReady, user, showTypingIndicator, handleBotMessage]);

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

    // ===== I-2 Stage 1: Awaiting-clarification gate =====
    // If the last assistant message is blocked on user clarification, intercept this reply
    // and route it as a resolution decision instead of running through the LLM intent pipeline.
    const lastForGate = messagesRef.current[messagesRef.current.length - 1];
    if (
      lastForGate &&
      lastForGate.resolutionState === 'blocked' &&
      lastForGate.type === 'awaiting-clarification' &&
      lastForGate.awaitingClarification
    ) {
      const trimmed = text.trim();
      const isCreate = /^(\u65b0\u5efa|create|\u521b\u5efa)/i.test(trimmed);
      const isSkip = /^(\u8df3\u8fc7|skip)/i.test(trimmed);

      if (isCreate || isSkip) {
        // Echo the user's reply
        const userReplyMsg: ChatMessage = {
          id: `msg-${Date.now()}-user`,
          type: 'user',
          role: 'user',
          content: trimmed,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, userReplyMsg]);
        setInputValue('');

        // Mark the blocked message as resolved
        const blockedId = lastForGate.id;
        setMessages((prev) => prev.map((m) => m.id === blockedId ? { ...m, resolutionState: 'resolved' as const } : m));

        const { function: fn, arguments: args } = lastForGate.awaitingClarification.originalIntent;
        const pendingResolution = lastForGate.awaitingClarification.pendingResolutions[0];
        const pendingKind = pendingResolution.kind;
        const queryName = pendingResolution.query;

        // I-2 Round 3: differentiate 'create' from 'skip'
        if (isCreate && pendingKind === 'contact') {
          // Park the original intent; spawn a contact draft form. After save, the parked intent resumes with the new contactId.
          parkedIntentRef.current = {
            function: fn,
            arguments: args,
            pendingKind: 'contact',
            blockedMsgId: blockedId,
          };
          const contactDraftMsg: ChatMessage = {
            id: `msg-${Date.now()}-contact-draft`,
            type: 'form-card',
            role: 'assistant',
            content: locale === 'zh-Hans'
              ? '新建联系人，保存后将自动关联到本次活动'
              : 'Create a new contact — it will be linked to this activity automatically after save',
            functionCalled: 'createContact',
            functionDisplayName: locale === 'zh-Hans' ? '新建联系人' : 'New Contact',
            timestamp: new Date().toISOString(),
            formCard: {
              type: 'contact',
              isNew: true,
              data: {
                fullName: queryName,
                accountName: (args.accountName as string | undefined) ?? '',
              },
              status: 'pending',
            },
          };
          setMessages((prev) => [...prev, contactDraftMsg]);
          return;
        }

        if (isCreate && (pendingKind === 'account' || pendingKind === 'opportunity')) {
          // Stage 5 stub: notify, then fall through to skip-style execution.
          const kindZh = pendingKind === 'account' ? '客户' : '商机';
          setMessages((prev) => [...prev, {
            id: `msg-${Date.now()}-stage5`,
            type: 'agent',
            role: 'assistant',
            content: locale === 'zh-Hans'
              ? `ℹ️ 新建${kindZh}功能即将开放（Stage 5），本次先跳过${kindZh}关联。`
              : `ℹ️ Creating new ${pendingKind} is coming soon (Stage 5). Skipping ${pendingKind} link for now.`,
            agentName: 'System',
            timestamp: new Date().toISOString(),
          }]);
          // Fall through to skip-style execution below.
        }

        // Skip (or Stage 5 fall-through): strip the unresolved entity and execute the original function directly.
        const strippedArgs: Record<string, unknown> = { ...args };
        if (pendingKind === 'contact') { delete strippedArgs.contactId; delete strippedArgs.contactName; }
        else if (pendingKind === 'account') { delete strippedArgs.accountId; delete strippedArgs.accountName; }
        else if (pendingKind === 'opportunity') { delete strippedArgs.opportunityId; delete strippedArgs.opportunityName; }

        setIsSending(true);
        try {
          const { executeFunction } = await import('@/lib/function-executor');
          const { getDisplayName } = await import('@/lib/function-registry');
          const fnResult = await executeFunction(
            fn,
            strippedArgs,
            { userId: user?.objectId, userEmail: user?.userPrincipalName },
          );
          const fnDisplay = getDisplayName(fn, locale === 'zh-Hans' ? 'zh-Hans' : 'en-US');

          if (fnResult.success && fnResult.data) {
            const formData = fnResult.data as { type: string; isNew: boolean; data: Record<string, unknown> };
            const replyMsg: ChatMessage = {
              id: `msg-${Date.now()}-form`,
              type: 'form-card',
              role: 'assistant',
              content: locale === 'zh-Hans' ? '\u8bf7\u786e\u8ba4\u4ee5\u4e0b\u4fe1\u606f' : 'Please confirm the following information',
              functionCalled: fn,
              functionDisplayName: fnDisplay,
              timestamp: new Date().toISOString(),
              formCard: {
                type: formData.type as 'activity' | 'opportunity' | 'account' | 'contact',
                isNew: formData.isNew,
                data: formData.data,
                status: 'pending',
              },
            };
            setMessages((prev) => [...prev, replyMsg]);
          } else {
            setMessages((prev) => [...prev, {
              id: `msg-${Date.now()}-err`,
              type: 'agent',
              role: 'assistant',
              content: locale === 'zh-Hans'
                ? `\u274c \u64cd\u4f5c\u5931\u8d25: ${fnResult.error}`
                : `\u274c Error: ${fnResult.error}`,
              agentName: 'System',
              timestamp: new Date().toISOString(),
            }]);
          }
        } catch (err) {
          console.error('[CopilotContext] I-2 resolve error:', err);
        } finally {
          setIsSending(false);
        }
        return;
      }

      // Free-text reply: treat as a brand-new request. Mark blocked message resolved and fall through.
      const blockedId2 = lastForGate.id;
      setMessages((prev) => prev.map((m) => m.id === blockedId2 ? { ...m, resolutionState: 'resolved' as const } : m));
      // Fall through to normal flow below (which adds the user message and calls processMessage).
    }

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
    clearClarificationSuggestions(); // Clear any pending clarification suggestions
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
          // Use messagesRef to get current messages without depending on messages state
          const currentMessages = [...messages]; // Create copy at call time
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
          
          // Clarification is now handled naturally by the LLM as a regular response
          // No special clarificationQuestions handling needed - LLM will ask for more info naturally

          // ===== I-2 Stage 1: Handle awaiting-clarification response =====
          if (response.awaitingClarification) {
            setIsSending(false);
            setMessages((prev) => prev.map((msg) => {
              if (msg.id !== thinkingMsgId) return msg;
              return {
                ...msg,
                type: 'awaiting-clarification' as const,
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
                awaitingClarification: response.awaitingClarification,
                resolutionState: 'blocked' as const,
              };
            }));
            return;
          }

          // ===== Handle additional intents (multi-intent support) =====
          if (response.additionalIntents && response.additionalIntents.items.length > 0) {
            // If primary action succeeded AND there are additional intents, show them
            setIsSending(false);
            setMessages((prev) => prev.map((msg) => {
              if (msg.id !== thinkingMsgId) return msg;
              return {
                ...msg,
                type: 'agent' as const,
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
                additionalIntents: {
                  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                  message: response.additionalIntents!.message,
                  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                  forms: response.additionalIntents!.items.map((item) => ({
                    type: item.type,
                    data: item.data,
                    reason: item.reason,
                    batchIndex: item.batchIndex,
                  })),
                },
              };
            }));
            return;
          }
          
          // Check if response is a draft function (returns form card)
          const isDraftFunction = response.functionCalled && ['draftActivity', 'draftOpportunity', 'draftAccount', 'draftContact'].includes(response.functionCalled);
          
          // Check if response is a batch draft function
          const isBatchDraftFunction = response.functionCalled === 'batchDraft' && response.success && response.functionResult;
          
          // Check if response is a fuzzy match function
          const isFuzzyMatchFunction = response.functionCalled && ['fuzzyMatchAccount', 'fuzzyMatchContact', 'fuzzyMatchOpportunity'].includes(response.functionCalled);
          
          if (isBatchDraftFunction) {
            // Create a batch-form-card message for multiple drafts
            setIsSending(false);
            const batchResult = response.functionResult as { isBatch: boolean; items: Array<{ type: string; isNew: boolean; data: Record<string, unknown>; batchIndex: number }>; totalCount: number };
            
            setMessages((prev) => prev.map((msg) => {
              if (msg.id !== thinkingMsgId) return msg;
              return {
                ...msg,
                type: 'batch-form-card' as const,
                content: response.content || (locale === 'zh-Hans' ? `共${batchResult.totalCount}条记录待确认` : `${batchResult.totalCount} records to confirm`),
                functionCalled: response.functionCalled,
                functionDisplayName: response.functionDisplayName,
                isThinking: false,
                thinkingSteps: response.thinkingSteps?.map((s) => ({
                  stage: s.stage,
                  status: 'completed' as const,
                  label: s.label,
                  detail: s.detail,
                })),
                batchFormCards: {
                  items: batchResult.items.map((item) => ({
                    type: item.type as 'activity' | 'opportunity' | 'account' | 'contact',
                    isNew: item.isNew,
                    data: item.data,
                    batchIndex: item.batchIndex,
                    status: 'pending' as const,
                  })),
                  totalCount: batchResult.totalCount,
                },
              };
            }));
          } else if (isFuzzyMatchFunction && response.success && response.functionResult) {
            // Create a match-selection message for fuzzy matching
            setIsSending(false);
            const matchResult = response.functionResult as { 
              matches: Array<{ id: string; name: string; industry?: string; title?: string; score: number; matchType: 'exact' | 'contains' | 'fuzzy'; accountId?: string; accountName?: string }>; 
              lowConfidenceMatches?: Array<{ id: string; name: string; industry?: string; title?: string; score: number; matchType: 'exact' | 'contains' | 'fuzzy'; accountId?: string; accountName?: string }>;
              confidence: 'high' | 'medium' | 'low' | 'none'; 
              needsConfirmation: boolean; 
              exactMatch?: { id: string; name: string };
              pendingIntent?: { function: string; arguments: Record<string, unknown> };
            };
            
            // Determine entity type from function name
            const entityType = response.functionCalled === 'fuzzyMatchAccount' ? 'account' :
                             response.functionCalled === 'fuzzyMatchContact' ? 'contact' :
                             response.functionCalled === 'fuzzyMatchActivity' ? 'activity' : 'opportunity';
            
            setMessages((prev) => prev.map((msg) => {
              if (msg.id !== thinkingMsgId) return msg;
              return {
                ...msg,
                type: 'match-selection' as const,
                content: matchResult.confidence === 'high' && !matchResult.needsConfirmation
                  ? (locale === 'zh-Hans' ? `找到匹配: ${matchResult.exactMatch?.name}` : `Found match: ${matchResult.exactMatch?.name}`)
                  : (locale === 'zh-Hans' ? '请选择一个匹配项：' : 'Please select a match:'),
                functionCalled: response.functionCalled,
                functionDisplayName: response.functionDisplayName,
                isThinking: false,
                thinkingSteps: response.thinkingSteps?.map((s) => ({
                  stage: s.stage,
                  status: 'completed' as const,
                  label: s.label,
                  detail: s.detail,
                })),
                matchSelection: {
                  entityType: entityType as 'account' | 'contact' | 'opportunity' | 'activity',
                  query: '',
                  matches: matchResult.matches.map((m) => ({
                    id: m.id,
                    name: m.name,
                    subtitle: m.industry || m.title,
                    score: m.score,
                    matchType: m.matchType,
                    accountId: m.accountId,
                    accountName: m.accountName,
                  })),
                  lowConfidenceMatches: matchResult.lowConfidenceMatches?.map((m) => ({
                    id: m.id,
                    name: m.name,
                    subtitle: m.industry || m.title,
                    score: m.score,
                    matchType: m.matchType,
                    accountId: m.accountId,
                    accountName: m.accountName,
                  })),
                  confidence: matchResult.confidence,
                  // Pass pendingIntent so UI can continue after user selects a match
                  pendingIntent: matchResult.pendingIntent,
                },
              };
              console.log('[CopilotContext] Match selection created with pendingIntent:', matchResult.pendingIntent);
            }));
          } else if (isDraftFunction && response.success && response.functionResult) {
            // Create a form-card message instead of regular response
            setIsSending(false);
            const formCardResult = response.functionResult as { type: 'activity' | 'opportunity' | 'account' | 'contact'; isNew: boolean; data: Record<string, unknown> };
            
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
          
          // Invalidate React Query cache if the operation modified data
          if (response.invalidateQueries && response.invalidateQueries.length > 0) {
            response.invalidateQueries.forEach((queryKey: string) => {
              queryClient.invalidateQueries({ queryKey: [queryKey] });
            });
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
    // Clear current session immediately for instant UX
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
    
    // Re-initialize Copilot Studio connection in background (non-blocking)
    // Copilot Studio is just a tool, not required for conversation to start
    const config = getCopilotConfig();
    if (config) {
      // Don't set isConnecting - let user interact immediately
      // Connection happens silently in background
      (async () => {
        try {
          console.log('[Copilot] Background: Re-initializing Copilot Studio connection...');
          const conversation = await getOrCreateConversation(config);
          copilotConversationRef.current = conversation;
          setIsConnected(true);
          console.log('[Copilot] Background: Successfully connected');
          
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
              onMessage: (message: CopilotMessage) => handleBotMessage(message),
              onError: (error: Error) => console.error('[Copilot] WebSocket error:', error),
              onClose: () => console.log('[Copilot] WebSocket closed'),
            });
          }
        } catch (error) {
          console.error('[Copilot] Background: Failed to re-initialize:', error);
          setIsConnected(false);
          // Silent failure - Copilot Studio is optional, orchestration uses Power Automate Flow
        }
      })();
    }
  }, [user, showTypingIndicator, handleBotMessage]);

  // Continue pending action after user selects a match from match-selection card
  const continuePendingAction = useCallback(async (
    selectedRecord: { id: string; name: string; accountId?: string; accountName?: string },
    pendingIntent: { function: string; arguments: Record<string, unknown> },
    entityType: 'account' | 'contact' | 'opportunity' | 'activity'
  ) => {
    setIsSending(true);
    
    // Create a thinking message
    const thinkingMsgId = `msg-${Date.now()}-continue`;
    const thinkingMessage: ChatMessage = {
      id: thinkingMsgId,
      type: 'agent',
      role: 'assistant',
      content: '',
      agentName: 'Sales Copilot',
      timestamp: new Date().toISOString(),
      isThinking: true,
      thinkingSteps: [
        { 
          stage: 'executing', 
          status: 'active', 
          label: locale === 'zh-Hans' 
            ? `使用选中的${entityType === 'account' ? '客户' : entityType === 'contact' ? '联系人' : entityType === 'activity' ? '活动' : '商机'}继续...`
            : `Continuing with selected ${entityType}...` 
        },
      ],
    };
    setMessages((prev) => [...prev, thinkingMessage]);

    try {
      // Import function executor and processMessage for full flow
      const { executeFunction } = await import('@/lib/function-executor');
      const { getDisplayName } = await import('@/lib/function-registry');
      const { processMessage } = await import('@/lib/copilot-agent');
      
      // Inject the selected record into the pending intent arguments
      // For contact selection, also inject the contact's account info if available
      const updatedArguments: Record<string, unknown> = {
        ...pendingIntent.arguments,
      };
      
      if (entityType === 'account') {
        updatedArguments.accountId = selectedRecord.id;
        updatedArguments.accountName = selectedRecord.name;
      } else if (entityType === 'contact') {
        updatedArguments.contactId = selectedRecord.id;
        updatedArguments.contactName = selectedRecord.name;
        // Also inject the contact's account info if available
        if (selectedRecord.accountId) {
          updatedArguments.accountId = selectedRecord.accountId;
        }
        if (selectedRecord.accountName) {
          updatedArguments.accountName = selectedRecord.accountName;
        }
      } else if (entityType === 'opportunity') {
        updatedArguments.opportunityId = selectedRecord.id;
        updatedArguments.opportunityName = selectedRecord.name;
      } else if (entityType === 'activity') {
        updatedArguments.activityId = selectedRecord.id;
      }

      console.log('[CopilotContext] Continuing pending action:', pendingIntent.function);
      console.log('[CopilotContext] pendingIntent.arguments:', JSON.stringify(pendingIntent.arguments, null, 2));
      console.log('[CopilotContext] updatedArguments:', JSON.stringify(updatedArguments, null, 2));

      const fnDisplayName = getDisplayName(pendingIntent.function, locale === 'zh-Hans' ? 'zh-Hans' : 'en-US');
      const isDraftFunction = ['draftActivity', 'draftOpportunity', 'draftAccount', 'draftContact'].includes(pendingIntent.function);
      const isBatchDraft = pendingIntent.function === 'batchDraft';
      
      if (isBatchDraft) {
        // For batch draft, execute and show batch form cards
        const functionResult = await executeFunction(
          pendingIntent.function,
          updatedArguments,
          { userId: user?.objectId, userEmail: user?.userPrincipalName }
        );
        
        if (functionResult.success && functionResult.data) {
          const batchResult = functionResult.data as { isBatch: boolean; items: Array<{ type: string; isNew: boolean; data: Record<string, unknown>; batchIndex: number }>; totalCount: number };
          setMessages((prev) => prev.map((msg) => {
            if (msg.id !== thinkingMsgId) return msg;
            return {
              ...msg,
              type: 'batch-form-card' as const,
              content: locale === 'zh-Hans' ? `共${batchResult.totalCount}条记录待确认` : `${batchResult.totalCount} records to confirm`,
              functionCalled: pendingIntent.function,
              functionDisplayName: fnDisplayName,
              isThinking: false,
              thinkingSteps: [
                { stage: 'executing' as const, status: 'completed' as const, label: locale === 'zh-Hans' ? `${fnDisplayName}：已准备表单` : `${fnDisplayName}: Forms ready` },
              ],
              batchFormCards: {
                items: batchResult.items.map((item) => ({
                  type: item.type as 'activity' | 'opportunity' | 'account' | 'contact',
                  isNew: item.isNew,
                  data: item.data,
                  batchIndex: item.batchIndex,
                  status: 'pending' as const,
                })),
                totalCount: batchResult.totalCount,
              },
            };
          }));
        } else {
          // Show error for batch draft failure
          setMessages((prev) => prev.map((msg) => {
            if (msg.id !== thinkingMsgId) return msg;
            return {
              ...msg,
              content: locale === 'zh-Hans'
                ? `❌ 操作失败: ${functionResult.error}`
                : `❌ Error: ${functionResult.error}`,
              agentName: 'System',
              isThinking: false,
              thinkingSteps: undefined,
            };
          }));
        }
      } else if (isDraftFunction) {
        // For single draft functions, execute directly and show form card
        const functionResult = await executeFunction(
          pendingIntent.function,
          updatedArguments,
          { userId: user?.objectId, userEmail: user?.userPrincipalName }
        );
        
        if (functionResult.success && functionResult.data) {
          const formCardResult = functionResult.data as { type: string; isNew: boolean; data: Record<string, unknown> };
          setMessages((prev) => prev.map((msg) => {
            if (msg.id !== thinkingMsgId) return msg;
            return {
              ...msg,
              type: 'form-card' as const,
              content: locale === 'zh-Hans' ? '请确认以下信息' : 'Please confirm the following information',
              functionCalled: pendingIntent.function,
              functionDisplayName: fnDisplayName,
              isThinking: false,
              thinkingSteps: [
                { stage: 'executing' as const, status: 'completed' as const, label: locale === 'zh-Hans' ? `${fnDisplayName}：已准备表单` : `${fnDisplayName}: Form ready` },
              ],
              formCard: {
                type: formCardResult.type as 'activity' | 'opportunity' | 'account' | 'contact',
                isNew: formCardResult.isNew,
                data: formCardResult.data,
                status: 'pending' as const,
              },
            };
          }));
        } else {
          // Show error for draft function failure
          setMessages((prev) => prev.map((msg) => {
            if (msg.id !== thinkingMsgId) return msg;
            return {
              ...msg,
              content: locale === 'zh-Hans'
                ? `❌ 操作失败: ${functionResult.error}`
                : `❌ Error: ${functionResult.error}`,
              agentName: 'System',
              isThinking: false,
              thinkingSteps: undefined,
            };
          }));
        }
      } else {
        // For non-draft functions (queries, summaries, etc.), use full processMessage flow
        // Reconstruct the original user message with the selected entity
        const syntheticMessage = locale === 'zh-Hans'
          ? `关于${entityType === 'account' ? '客户' : entityType === 'contact' ? '联系人' : entityType === 'activity' ? '活动' : '商机'}「${selectedRecord.name}」的${pendingIntent.function === 'queryAccountSummary' ? '概况' : pendingIntent.function === 'queryOpportunities' ? '商机' : pendingIntent.function === 'queryActivities' ? '活动' : pendingIntent.function === 'queryContacts' ? '联系人' : '详情'}`
          : `${pendingIntent.function === 'queryAccountSummary' ? 'Summary' : pendingIntent.function === 'queryOpportunities' ? 'Opportunities' : pendingIntent.function === 'queryActivities' ? 'Activities' : pendingIntent.function === 'queryContacts' ? 'Contacts' : 'Details'} for ${entityType} "${selectedRecord.name}"`;
        
        // Build conversation history
        const currentMessages = messages;
        const conversationHistory = currentMessages
          .filter((m: ChatMessage) => m.role === 'user' || m.role === 'assistant')
          .map((m: ChatMessage) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }));
        
        // Add synthetic message indicating selection
        conversationHistory.push({
          role: 'user',
          content: locale === 'zh-Hans'
            ? `用户选择了${entityType === 'account' ? '客户' : entityType === 'contact' ? '联系人' : entityType === 'activity' ? '活动' : '商机'}：${selectedRecord.name} (ID: ${selectedRecord.id})`
            : `User selected ${entityType}: ${selectedRecord.name} (ID: ${selectedRecord.id})`,
        });
        
        // Progress callback to update thinking message
        const handleProgress = (progress: ThinkingProgress) => {
          setMessages((prev) => prev.map((msg) => {
            if (msg.id !== thinkingMsgId) return msg;
            
            const newSteps = [...(msg.thinkingSteps || [])];
            const stepIndex = newSteps.findIndex((s) => s.stage === progress.stage);
            
            if (stepIndex >= 0) {
              if (progress.status === 'completed') {
                newSteps[stepIndex] = {
                  ...newSteps[stepIndex],
                  status: 'completed',
                  label: progress.functionDisplayName || newSteps[stepIndex].label,
                };
              }
            } else {
              newSteps.push({
                stage: progress.stage,
                status: progress.status,
                label: progress.functionDisplayName || (progress.stage === 'executing'
                  ? (locale === 'zh-Hans' ? '执行中...' : 'Executing...')
                  : (locale === 'zh-Hans' ? '生成回复...' : 'Generating response...')),
              });
            }
            
            return { ...msg, thinkingSteps: newSteps };
          }));
        };
        
        // Execute the function directly first
        const functionResult = await executeFunction(
          pendingIntent.function,
          updatedArguments,
          { userId: user?.objectId, userEmail: user?.userPrincipalName }
        );
        
        if (functionResult.success) {
          // Now use processMessage for full response generation
          // But we need to pass the already-executed function result
          // So we'll call processMessage with a hint about the selected record
          const response = await processMessage(syntheticMessage, {
            userId: user?.objectId,
            userEmail: user?.userPrincipalName,
            locale,
            conversationHistory,
            pageContext: pageContextRef.current ? {
              currentPage: pageContextRef.current.currentPage,
              pageData: {
                ...(pageContextRef.current.pageData || {}),
                // Inject selected record info so agent knows context
                selectedRecord: { entityType, ...selectedRecord },
                injectedFunction: pendingIntent.function,
                injectedArguments: updatedArguments,
              },
              summary: pageContextRef.current.summary,
            } : {
              currentPage: 'Selection Context',
              pageData: {
                selectedRecord: { entityType, ...selectedRecord },
                injectedFunction: pendingIntent.function,
                injectedArguments: updatedArguments,
              },
              summary: `User selected ${entityType}: ${selectedRecord.name}`,
            },
            sessionRefs: directLineSessionRefs,
          }, handleProgress);
          
          // Update message with response
          setMessages((prev) => prev.map((msg) => {
            if (msg.id !== thinkingMsgId) return msg;
            return {
              ...msg,
              content: response.content || (locale === 'zh-Hans' ? '已完成' : 'Done'),
              functionCalled: response.functionCalled || pendingIntent.function,
              functionDisplayName: response.functionDisplayName || fnDisplayName,
              isThinking: false,
              thinkingSteps: response.thinkingSteps?.map((s) => ({
                stage: s.stage,
                status: 'completed' as const,
                label: s.label,
                detail: s.detail,
              })) || [
                { stage: 'executing' as const, status: 'completed' as const, label: fnDisplayName },
              ],
              recordList: response.recordList,
            };
          }));
        } else {
          // Show error message
          setMessages((prev) => prev.map((msg) => {
            if (msg.id !== thinkingMsgId) return msg;
            return {
              ...msg,
              content: locale === 'zh-Hans'
                ? `❌ 操作失败: ${functionResult.error}`
                : `❌ Error: ${functionResult.error}`,
              agentName: 'System',
              isThinking: false,
              thinkingSteps: undefined,
            };
          }));
        }
      }
    } catch (error) {
      console.error('[CopilotContext] continuePendingAction error:', error);
      setMessages((prev) => prev.map((msg) => {
        if (msg.id !== thinkingMsgId) return msg;
        return {
          ...msg,
          content: locale === 'zh-Hans'
            ? `❌ 操作失败: ${error instanceof Error ? error.message : '未知错误'}`
            : `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          agentName: 'System',
          isThinking: false,
          thinkingSteps: undefined,
        };
      }));
    } finally {
      setIsSending(false);
    }
  }, [user, locale, messages, directLineSessionRefs]);

  // Create new record from pending intent (when user clicks 'Create New' instead of selecting a match)
  const createNewFromIntent = useCallback(async (
    pendingIntent: { function: string; arguments: Record<string, unknown> }
  ) => {
    setIsSending(true);
    
    // Create a thinking message
    const thinkingMsgId = `msg-${Date.now()}-create-new`;
    const thinkingMessage: ChatMessage = {
      id: thinkingMsgId,
      type: 'agent',
      role: 'assistant',
      content: '',
      agentName: 'Sales Copilot',
      timestamp: new Date().toISOString(),
      isThinking: true,
      thinkingSteps: [
        { 
          stage: 'executing', 
          status: 'active', 
          label: locale === 'zh-Hans' ? '正在创建新记录...' : 'Creating new record...' 
        },
      ],
    };
    setMessages((prev) => [...prev, thinkingMessage]);

    try {
      const { executeFunction } = await import('@/lib/function-executor');
      const { getDisplayName } = await import('@/lib/function-registry');
      
      const fnDisplayName = getDisplayName(pendingIntent.function, locale === 'zh-Hans' ? 'zh-Hans' : 'en-US');
      
      // Execute the draft function directly
      const functionResult = await executeFunction(
        pendingIntent.function,
        pendingIntent.arguments,
        { userId: user?.objectId, userEmail: user?.userPrincipalName }
      );
      
      if (functionResult.success && functionResult.data) {
        const formCardResult = functionResult.data as { type: string; isNew: boolean; data: Record<string, unknown> };
        setMessages((prev) => prev.map((msg) => {
          if (msg.id !== thinkingMsgId) return msg;
          return {
            ...msg,
            type: 'form-card' as const,
            content: locale === 'zh-Hans' ? '请确认以下信息' : 'Please confirm the following information',
            functionCalled: pendingIntent.function,
            functionDisplayName: fnDisplayName,
            isThinking: false,
            thinkingSteps: [
              { stage: 'executing' as const, status: 'completed' as const, label: locale === 'zh-Hans' ? `${fnDisplayName}：已准备表单` : `${fnDisplayName}: Form ready` },
            ],
            formCard: {
              type: formCardResult.type as 'activity' | 'opportunity' | 'account' | 'contact',
              isNew: true, // Always new when user clicks 'Create New'
              data: formCardResult.data,
              status: 'pending' as const,
            },
          };
        }));
      } else {
        // Show error
        setMessages((prev) => prev.map((msg) => {
          if (msg.id !== thinkingMsgId) return msg;
          return {
            ...msg,
            content: locale === 'zh-Hans'
              ? `❌ 操作失败: ${functionResult.error}`
              : `❌ Error: ${functionResult.error}`,
            agentName: 'System',
            isThinking: false,
            thinkingSteps: undefined,
          };
        }));
      }
    } catch (error) {
      console.error('[CopilotContext] createNewFromIntent error:', error);
      setMessages((prev) => prev.map((msg) => {
        if (msg.id !== thinkingMsgId) return msg;
        return {
          ...msg,
          content: locale === 'zh-Hans'
            ? `❌ 操作失败: ${error instanceof Error ? error.message : '未知错误'}`
            : `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          agentName: 'System',
          isThinking: false,
          thinkingSteps: undefined,
        };
      }));
    } finally {
      setIsSending(false);
    }
  }, [user, locale]);

  // Unified resolution — chain-create: spawn a draft form for the missing entity, park the original intent,
  // then resume it via completeParkedIntentWithNewContact after the user saves the new entity.
  // Mirrors the gate's create branch (sendMessage 'create' path) so button clicks bypass text-token matching.
  const createEntityForResolution = useCallback(async (
    pendingIntent: { function: string; arguments: Record<string, unknown> },
    entityKind: 'contact' | 'account' | 'opportunity',
    queryName: string,
    blockedMsgId?: string
  ) => {
    // Mark the source message resolved so the card freezes
    if (blockedMsgId) {
      setMessages((prev) => prev.map((m) => m.id === blockedMsgId ? { ...m, resolutionState: 'resolved' as const } : m));
    }

    if (entityKind === 'contact') {
      // Park the original intent; resumed by completeParkedIntentWithNewContact after the contact is saved
      parkedIntentRef.current = {
        function: pendingIntent.function,
        arguments: pendingIntent.arguments,
        pendingKind: 'contact',
        blockedMsgId: blockedMsgId || '',
      };
      const contactDraftMsg: ChatMessage = {
        id: `msg-${Date.now()}-contact-draft`,
        type: 'form-card',
        role: 'assistant',
        content: locale === 'zh-Hans'
          ? '新建联系人，保存后将自动关联到本次活动'
          : 'Create a new contact — it will be linked to this activity automatically after save',
        functionCalled: 'createContact',
        functionDisplayName: locale === 'zh-Hans' ? '新建联系人' : 'New Contact',
        timestamp: new Date().toISOString(),
        formCard: {
          type: 'contact',
          isNew: true,
          data: {
            fullName: queryName,
            accountName: (pendingIntent.arguments.accountName as string | undefined) ?? '',
          },
          status: 'pending',
        },
      };
      setMessages((prev) => [...prev, contactDraftMsg]);
      return;
    }

    // account / opportunity chain-create is Stage 5 — for now, show a stub and fall through to skip
    const kindZh = entityKind === 'account' ? '客户' : '商机';
    setMessages((prev) => [...prev, {
      id: `msg-${Date.now()}-stage5`,
      type: 'agent',
      role: 'assistant',
      content: locale === 'zh-Hans'
        ? `ℹ️ 新建${kindZh}功能即将开放（Stage 5），本次先跳过${kindZh}关联。`
        : `ℹ️ Creating new ${entityKind} is coming soon (Stage 5). Skipping ${entityKind} link for now.`,
      agentName: 'System',
      timestamp: new Date().toISOString(),
    }]);
    // Fall through: run the main draft with the entity stripped
    await skipResolutionAndDraftImpl(pendingIntent, entityKind);
  }, [user, locale]);

  // Unified resolution — skip: strip the unresolved entity from args and run the original draft directly.
  // The resulting form-card has an empty lookup for the skipped entity so the user can pick it in-form.
  // Mirrors the gate's skip branch.
  const skipResolutionAndDraftImpl = async (
    pendingIntent: { function: string; arguments: Record<string, unknown> },
    entityKind: 'contact' | 'account' | 'opportunity'
  ) => {
    const strippedArgs: Record<string, unknown> = { ...pendingIntent.arguments };
    if (entityKind === 'contact') { delete strippedArgs.contactId; delete strippedArgs.contactName; }
    else if (entityKind === 'account') { delete strippedArgs.accountId; delete strippedArgs.accountName; }
    else if (entityKind === 'opportunity') { delete strippedArgs.opportunityId; delete strippedArgs.opportunityName; }

    setIsSending(true);
    try {
      const { executeFunction } = await import('@/lib/function-executor');
      const { getDisplayName } = await import('@/lib/function-registry');
      const fnResult = await executeFunction(
        pendingIntent.function,
        strippedArgs,
        { userId: user?.objectId, userEmail: user?.userPrincipalName },
      );
      const fnDisplay = getDisplayName(pendingIntent.function, locale === 'zh-Hans' ? 'zh-Hans' : 'en-US');

      if (fnResult.success && fnResult.data) {
        const formData = fnResult.data as { type: string; isNew: boolean; data: Record<string, unknown> };
        setMessages((prev) => [...prev, {
          id: `msg-${Date.now()}-form`,
          type: 'form-card',
          role: 'assistant',
          content: locale === 'zh-Hans' ? '请确认以下信息' : 'Please confirm the following information',
          functionCalled: pendingIntent.function,
          functionDisplayName: fnDisplay,
          timestamp: new Date().toISOString(),
          formCard: {
            type: formData.type as 'activity' | 'opportunity' | 'account' | 'contact',
            isNew: formData.isNew,
            data: formData.data,
            status: 'pending',
          },
        }]);
      } else {
        setMessages((prev) => [...prev, {
          id: `msg-${Date.now()}-err`,
          type: 'agent',
          role: 'assistant',
          content: locale === 'zh-Hans' ? `❌ 操作失败: ${fnResult.error}` : `❌ Error: ${fnResult.error}`,
          agentName: 'System',
          timestamp: new Date().toISOString(),
        }]);
      }
    } catch (err) {
      console.error('[CopilotContext] skipResolutionAndDraft error:', err);
    } finally {
      setIsSending(false);
    }
  };

  const skipResolutionAndDraft = useCallback(async (
    pendingIntent: { function: string; arguments: Record<string, unknown> },
    entityKind: 'contact' | 'account' | 'opportunity',
    blockedMsgId?: string
  ) => {
    if (blockedMsgId) {
      setMessages((prev) => prev.map((m) => m.id === blockedMsgId ? { ...m, resolutionState: 'resolved' as const } : m));
    }
    await skipResolutionAndDraftImpl(pendingIntent, entityKind);
  }, [user, locale]);

  // Unified resolution — search other: re-run fuzzyMatch with a new query and patch matchSelection in place.
  // Used by the "Search other" inline input on the resolution card.
  const refreshResolution = useCallback(async (
    messageId: string,
    newQuery: string,
    entityType: 'account' | 'contact' | 'opportunity' | 'activity',
    pendingIntent: { function: string; arguments: Record<string, unknown> }
  ) => {
    const trimmed = newQuery.trim();
    if (!trimmed) return;
    const matchFnName = entityType === 'account' ? 'fuzzyMatchAccount'
      : entityType === 'contact' ? 'fuzzyMatchContact'
      : entityType === 'activity' ? 'fuzzyMatchActivity'
      : 'fuzzyMatchOpportunity';
    try {
      const { executeFunction } = await import('@/lib/function-executor');
      const result = await executeFunction(
        matchFnName,
        { query: trimmed, accountId: pendingIntent.arguments?.accountId as string | undefined },
        { userId: user?.objectId, userEmail: user?.userPrincipalName },
      );
      if (!result.success || !result.data) return;
      const matchData = result.data as {
        matches: Array<{ id: string; name: string; subtitle?: string; industry?: string; title?: string; score: number; matchType: 'exact' | 'contains' | 'fuzzy'; accountId?: string; accountName?: string }>;
        confidence: 'high' | 'medium' | 'low' | 'none';
      };
      const normalize = (m: typeof matchData.matches[number]) => ({
        id: m.id,
        name: m.name,
        subtitle: m.subtitle || m.industry || m.title || m.accountName,
        score: m.score,
        matchType: m.matchType,
        accountId: m.accountId,
        accountName: m.accountName,
      });
      const highMatches = matchData.matches.filter((m) => m.score >= 70).map(normalize);
      const lowMatches = matchData.matches.filter((m) => m.score < 70 && m.score >= 20).map(normalize);

      setMessages((prev) => prev.map((msg) => {
        if (msg.id !== messageId) return msg;
        // Convert awaiting-clarification messages into match-selection on refresh so the card driver is uniform.
        return {
          ...msg,
          type: 'match-selection' as const,
          awaitingClarification: undefined,
          resolutionState: undefined,
          matchSelection: {
            entityType,
            query: trimmed,
            matches: highMatches,
            lowConfidenceMatches: lowMatches,
            confidence: matchData.confidence,
            pendingIntent,
          },
        };
      }));
    } catch (err) {
      console.error('[CopilotContext] refreshResolution error:', err);
    }
  }, [user]);
  const updateFormCardStatus = useCallback((
    messageId: string,
    status: 'pending' | 'confirmed' | 'modified',
    batchIndex?: number,
    createdRecordId?: string
  ) => {
    setMessages((prev) => prev.map((msg) => {
      if (msg.id !== messageId) return msg;
      
      // Handle batch form cards
      if (typeof batchIndex === 'number' && msg.batchFormCards) {
        const updatedItems = msg.batchFormCards.items.map((item, idx) => {
          if (idx !== batchIndex) return item;
          return { ...item, status, ...(createdRecordId && { createdRecordId }) };
        });
        return {
          ...msg,
          batchFormCards: {
            ...msg.batchFormCards,
            items: updatedItems,
          },
        };
      }
      
      // Handle single form card
      if (msg.formCard) {
        return {
          ...msg,
          formCard: {
            ...msg.formCard,
            status,
            ...(createdRecordId && { createdRecordId }),
          },
        };
      }
      
      return msg;
    }));
  }, []);

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
    extractVisitData,
    directLineSessionRefs,
    continuePendingAction,
    createNewFromIntent,
    createEntityForResolution,
    skipResolutionAndDraft,
    refreshResolution,
    updateFormCardStatus,
    rollbackToMessage,
    clarificationSuggestions,
    setClarificationSuggestions,
    clearClarificationSuggestions,
    executeClarificationAction,
    completeParkedIntentWithNewContact,
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
    extractVisitData,
    directLineSessionRefs,
    continuePendingAction,
    createNewFromIntent,
    createEntityForResolution,
    skipResolutionAndDraft,
    refreshResolution,
    updateFormCardStatus,
    clarificationSuggestions,
    setClarificationSuggestions,
    clearClarificationSuggestions,
    executeClarificationAction,
    completeParkedIntentWithNewContact,
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
