import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@/hooks/use-user';
import { useSettingsReady } from '@/contexts/settings-context';
import { 
  clearCopilotConversation,
} from '@/services/copilot-service';
import { getLocale, getSimulateStreaming, type Locale } from '@/lib/i18n';
import { toast } from 'sonner';
import { type ThinkingProgress, type AgentResponse, type IntentResult } from '@/lib/copilot-agent';
import { buildQueueFromIntent, findIntentByMessageId, type IntentQueue } from '@/lib/intent-queue';
import type * as QR from '@/lib/intent-queue-runtime';

// Lazy-load the queue runtime — it pulls in function-executor.ts which is heavy.
// Cached after first import so subsequent calls are instant.
const loadQR = () => import('@/lib/intent-queue-runtime');
import { narrateTask, type PriorTaskOutcome } from '@/lib/task-narrator';
import type { AwaitingClarification, ResolutionItem } from '@/lib/agent-utils';
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
  /** IntentQueue id this message belongs to (queue-driven flows). */
  queueId?: string;
  /** QueueIntent id this message represents (queue-driven flows). */
  queueIntentId?: string;
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
    status?: 'pending' | 'confirmed' | 'modified' | 'cancelled';
    createdRecordId?: string;
  };
  // Batch form cards for multiple drafts
  batchFormCards?: {
    items: Array<{
      type: 'activity' | 'opportunity' | 'account' | 'contact';
      isNew: boolean;
      data: Record<string, unknown>;
      batchIndex: number;
      status?: 'pending' | 'confirmed' | 'modified' | 'cancelled';
      createdRecordId?: string;
      userFacingLabel?: { zh: string; en: string };
      intentIndex?: number;
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
      // I-3 Slice 1: remaining resolution chain to walk after this step is resolved.
      // Slice 2 will consume this to trigger the next fuzzyMatch call.
      remainingResolutions?: Array<{
        entityType: 'account' | 'contact' | 'opportunity' | 'activity';
        query: string;
        scopeBy?: 'account' | 'opportunity';
      }>;
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
  // Short result line shown on the match-selection / awaiting-clarification card
  // once the user has acted on it. Used to lock the card and surface what was decided.
  resolutionResult?: string;

  // ===== Multi-intent task narrative (Phase A: fields plumbed; Phase B: emitted) =====
  /** Groups every message belonging to a single task (announce + sub-steps + done line). */
  taskGroupId?: string;
  /** Role of this message inside its task group. Drives renderer choice. */
  taskRole?: 'overview' | 'announce' | 'substep' | 'summary' | 'done-collapsed';
  /** Payload for the task-announce bubble (only set when taskRole === 'announce'). */
  taskAnnounce?: {
    index: number;      // 1-based
    total: number;
    label: string;      // localized human label (e.g. "登记客户拜访")
  };
  /** Payload for the upfront overview line ("识别到 N 个意图：A、B、C"). */
  taskOverview?: {
    intents: Array<{ index: number; label: string }>;
  };
  /** Whether this message should currently render in collapsed form. Toggled by orchestrator. */
  collapsed?: boolean;
  /** One-line summary shown when this task group is collapsed. */
  collapsedSummary?: string;
}

// Form fill callback type
export type FormFillCallback = (data: Record<string, unknown>) => void;

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
  
  // Continue pending action after match selection
  continuePendingAction: (
    selectedRecord: { id: string; name: string; accountId?: string; accountName?: string },
    pendingIntent: { function: string; arguments: Record<string, unknown> },
    entityType: 'account' | 'contact' | 'opportunity' | 'activity',
    sourceMessageId?: string
  ) => Promise<void>;
  
  // Create new record from intent (skip match selection)
  createNewFromIntent: (
    pendingIntent: { function: string; arguments: Record<string, unknown> }
  ) => Promise<void>;

  // Unified resolution: chain-create the missing entity (e.g. open a draftContact form, then resume the parked main intent).
  // entityKind === 'activity' means "create new activity anyway, ignore the duplicate matches" — runs the original draftActivity intent.
  createEntityForResolution: (
    pendingIntent: { function: string; arguments: Record<string, unknown>; additionalActions?: Array<{ function: string; arguments: Record<string, unknown>; reason?: string }> },
    entityKind: 'contact' | 'account' | 'opportunity' | 'activity',
    queryName: string,
    blockedMsgId?: string
  ) => Promise<void>;

  // Unified resolution: strip the unresolved entity from the args and open the main draft form so the user can pick in-form.
  // entityKind === 'activity' means "cancel this draft entirely" — no executeFunction call.
  skipResolutionAndDraft: (
    pendingIntent: { function: string; arguments: Record<string, unknown> },
    entityKind: 'contact' | 'account' | 'opportunity' | 'activity',
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
    status: 'pending' | 'confirmed' | 'modified' | 'cancelled',
    batchIndex?: number,
    createdRecordId?: string
  ) => void;
  
  // Rollback conversation to a specific message (removes that message and all after it)
  rollbackToMessage: (messageId: string) => void;

  // Phase D: collapse / expand the substep messages of one task group.
  toggleTaskGroupCollapsed: (groupId: string) => void;

  // I-2 Round 3: resume a parked intent after the user finishes creating a new contact via the inline draft form.
  completeParkedIntentWithNewContact: (contactId: string, contactName: string, accountId?: string, accountName?: string) => Promise<void>;
  // Stage 5+: resume parked intent after creating a new account or opportunity via the inline draft form.
  completeParkedIntentWithNewAccount: (accountId: string, accountName: string) => Promise<void>;
  completeParkedIntentWithNewOpportunity: (opportunityId: string, opportunityName: string, accountId?: string, accountName?: string) => Promise<void>;

  // Unified queue handlers for form-card. When the message belongs to an active IntentQueue
  // (carries queueIntentId), these dispatch to the queue runtime; otherwise they fall back to
  // the parked-intent legacy resume path.
  formCardSaved: (args: {
    messageId: string;
    type: 'activity' | 'opportunity' | 'account' | 'contact';
    recordId: string;
    recordName?: string;
    accountId?: string;
    accountName?: string;
    contactId?: string;
    contactName?: string;
    opportunityId?: string;
    opportunityName?: string;
  }) => Promise<void>;
  formCardCancelled: (messageId: string) => Promise<void>;
}

export interface PageContext {
  currentPage: string;
  pageData?: unknown;
  summary?: string;
}

const CopilotContext = createContext<CopilotContextValue | null>(null);

// ===== Conversation persistence =====
// localStorage so messages survive Power Apps player restarts (sessionStorage
// dies with the host tab). Bump the schema version when ChatMessage's shape
// changes incompatibly; on mismatch we discard and start fresh instead of
// rendering broken cards.
const PERSIST_KEY = 'copilot-messages';
const PERSIST_SCHEMA_VERSION = 3;
const PERSIST_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
interface PersistEnvelope {
  v: number;
  savedAt: number;
  messages: ChatMessage[];
}

// ===== Phase B: task narration helpers =====
type IntentsOverview = NonNullable<AgentResponse['intentsOverview']>;

function pickLabel(label: { zh: string; en: string }, isZh: boolean): string {
  return isZh ? label.zh : label.en;
}

const ZH_ORDINALS = ['第一', '第二', '第三', '第四', '第五', '第六', '第七', '第八', '第九'];
function ordinalZh(n: number): string {
  return ZH_ORDINALS[n - 1] ?? `第${n}`;
}

function buildOverviewMessage(overview: IntentsOverview, isZh: boolean): ChatMessage {
  const labels = overview.map((o) => pickLabel(o.userFacingLabel, isZh));
  const joined = isZh ? labels.join('、') : labels.join(', ');
  const text = isZh
    ? `识别到 ${overview.length} 个意图：${joined}`
    : `Identified ${overview.length} intents: ${joined}`;
  return {
    id: `msg-${Date.now()}-overview`,
    role: 'assistant',
    type: 'agent',
    content: text,
    timestamp: new Date().toISOString(),
    taskRole: 'overview',
    taskOverview: { intents: overview.map((o) => ({ index: o.intentIndex, label: pickLabel(o.userFacingLabel, isZh) })) },
  };
}

function buildAnnounceMessage(
  intentIndex: number,
  overview: IntentsOverview,
  isZh: boolean,
): ChatMessage | null {
  const entry = overview.find((o) => o.intentIndex === intentIndex);
  if (!entry) return null;
  const label = pickLabel(entry.userFacingLabel, isZh);
  const position = overview.findIndex((o) => o.intentIndex === intentIndex) + 1;
  const total = overview.length;
  const text = total > 1
    ? (isZh
        ? `现在开始${ordinalZh(position)}个任务：${label}`
        : `Starting task ${position} of ${total}: ${label}`)
    : (isZh ? `开始：${label}` : `Starting: ${label}`);
  const taskGroupId = `task-${intentIndex}`;
  return {
    id: `msg-${Date.now()}-announce-${intentIndex}`,
    role: 'assistant',
    type: 'agent',
    content: text,
    timestamp: new Date().toISOString(),
    taskGroupId,
    taskRole: 'announce',
    taskAnnounce: { index: position, total, label },
  };
}

/**
 * Returns true if a message with the given predicate exists after the latest
 * user message in `prev`. Used to deduplicate overview / announce emissions
 * across multi-call cascades within the same turn.
 */
function hasMessageAfterLastUser(prev: ChatMessage[], predicate: (m: ChatMessage) => boolean): boolean {
  let lastUserIdx = -1;
  for (let i = prev.length - 1; i >= 0; i--) {
    if (prev[i].role === 'user') { lastUserIdx = i; break; }
  }
  for (let i = lastUserIdx + 1; i < prev.length; i++) {
    if (predicate(prev[i])) return true;
  }
  return false;
}

/**
 * Phase D: when a new task announce is added, fold every prior task's
 * substep messages so the chat stays tidy. The previous announce bubble
 * remains visible (with its chevron now pointing right to hint at expand);
 * its sub-rows are hidden behind `collapsed=true`.
 */
function collapseEarlierTasks(prev: ChatMessage[], newIntentIndex: number): ChatMessage[] {
  let mutated = false;
  const next = prev.map((m) => {
    if (!m.taskGroupId) return m;
    const match = /^task-(\d+)$/.exec(m.taskGroupId);
    if (!match) return m;
    const idx = Number.parseInt(match[1], 10);
    if (!Number.isFinite(idx) || idx >= newIntentIndex) return m;
    if (m.collapsed) return m;
    mutated = true;
    return { ...m, collapsed: true };
  });
  return mutated ? next : prev;
}

/**
 * Phase C: walk the current message list and produce one outcome line per
 * already-completed task group, ordered by intentIndex. The narrator feeds
 * these to the LLM so it can carry resolved entities into the next sentence.
 */
function extractPriorOutcomes(messages: ChatMessage[], upToIntentIndex: number): PriorTaskOutcome[] {
  const byGroup = new Map<string, { intentIdx: number; label: string; outcomeParts: string[] }>();
  for (const m of messages) {
    if (!m.taskGroupId) continue;
    const match = /^task-(\d+)$/.exec(m.taskGroupId);
    if (!match) continue;
    const intentIdx = Number.parseInt(match[1], 10);
    if (!Number.isFinite(intentIdx) || intentIdx >= upToIntentIndex) continue;
    let bucket = byGroup.get(m.taskGroupId);
    if (!bucket) {
      bucket = { intentIdx, label: '', outcomeParts: [] };
      byGroup.set(m.taskGroupId, bucket);
    }
    if (m.taskRole === 'announce' && m.taskAnnounce?.label) {
      bucket.label = m.taskAnnounce.label;
    } else if (m.taskRole === 'substep' && typeof m.content === 'string' && m.content.trim()) {
      bucket.outcomeParts.push(m.content.trim());
    }
  }
  return [...byGroup.values()]
    .sort((a, b) => a.intentIdx - b.intentIdx)
    .map((b) => ({
      taskGroupId: `task-${b.intentIdx}`,
      label: b.label || `task-${b.intentIdx}`,
      outcome: b.outcomeParts.length ? b.outcomeParts[b.outcomeParts.length - 1] : '(completed)',
    }));
}

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
  
  // Chat state - persist messages in localStorage so they survive Power Apps
  // player restarts (sessionStorage is wiped when the host tab/iframe closes).
  // Envelope: { v: schema version, savedAt: epoch ms, messages: [...] }.
  // Bump PERSIST_SCHEMA_VERSION when ChatMessage shape changes incompatibly.
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const stored = localStorage.getItem(PERSIST_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored) as PersistEnvelope | ChatMessage[];
      // Back-compat: legacy plain-array shape
      if (Array.isArray(parsed)) return parsed;
      if (!parsed || typeof parsed !== 'object') return [];
      if (parsed.v !== PERSIST_SCHEMA_VERSION) return [];
      if (typeof parsed.savedAt === 'number' && Date.now() - parsed.savedAt > PERSIST_TTL_MS) return [];
      return Array.isArray(parsed.messages) ? parsed.messages : [];
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
  // G-1: also carries any inferred sibling intents (additionalActions) so they can be replayed
  // as additional form-cards once the primary chain-create resume completes.
  const parkedIntentRef = useRef<{
    function: string;
    arguments: Record<string, unknown>;
    pendingKind: 'contact' | 'account' | 'opportunity';
    blockedMsgId: string;
    additionalActions?: Array<{ function: string; arguments: Record<string, unknown>; reason?: string }>;
  } | null>(null);

  // ===== IntentQueue: single source of truth for multi-step orchestration =====
  // Replaces parkedIntentRef + replayAdditionalActions for any flow whose initial
  // intent triggers queue mode (draft / batch / matching / awaitingClarification).
  // Each card the queue produces carries queueId + queueIntentId so user actions
  // (Save / Cancel / Pick / Skip) dispatch back into the queue runtime.
  const queueRef = useRef<IntentQueue | null>(null);
  const [, setQueueTick] = useState(0);
  const bumpQueue = useCallback(() => setQueueTick((t) => t + 1), []);
  const queryClientRef = useRef(queryClient);
  useEffect(() => { queryClientRef.current = queryClient; }, [queryClient]);

  const buildRuntimeDeps = useCallback((): QR.RuntimeDeps => ({
    userId: user?.objectId,
    userEmail: user?.userPrincipalName,
    locale: (locale === 'zh-Hans' ? 'zh-Hans' : 'en-US') as 'zh-Hans' | 'en-US',
    pushMessage: (msg) => {
      const chatMsg = {
        ...msg,
        role: 'assistant' as const,
        timestamp: typeof msg.timestamp === 'number' ? new Date(msg.timestamp).toISOString() : msg.timestamp,
      } as unknown as ChatMessage;
      setMessages((prev) => [...prev, chatMsg]);
    },
    patchMessage: (id, patch) => {
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...(patch as Partial<ChatMessage>) } : m)));
    },
    invalidate: (keys) => {
      if (!keys || keys.length === 0) return;
      keys.forEach((k) => queryClientRef.current.invalidateQueries({ queryKey: [k] }));
    },
    toast: (kind, msg) => {
      if (kind === 'success') toast.success(msg);
      else if (kind === 'error') toast.error(msg);
      else toast(msg);
    },
  }), [user, locale]);

  const runAndStoreQueue = useCallback(async (q: IntentQueue) => {
    queueRef.current = q;
    bumpQueue();
    const after = await (await loadQR()).runQueue(q, buildRuntimeDeps());
    queueRef.current = after;
    bumpQueue();
  }, [buildRuntimeDeps, bumpQueue]);

  // Predicate: does this LLM intent need the queue to orchestrate it?
  const shouldUseQueue = useCallback((intent: IntentResult | undefined): boolean => {
    if (!intent || !intent.function) return false;
    const draftFns = ['draftActivity', 'draftOpportunity', 'draftAccount', 'draftContact', 'batchDraft'];
    if (draftFns.includes(intent.function)) return true;
    if (intent.additionalActions && intent.additionalActions.length > 0) return true;
    if (intent.requiresMatching) return true;
    if (intent.resolutions && intent.resolutions.length > 0) return true;
    return false;
  }, []);

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

    const envelope: PersistEnvelope = {
      v: PERSIST_SCHEMA_VERSION,
      savedAt: Date.now(),
      messages: persistableMessages as ChatMessage[],
    };
    const json = JSON.stringify(envelope);

    // Skip if unchanged from last persisted snapshot (compare messages slice
    // so the savedAt timestamp doesn't defeat the dedup).
    const messagesJson = JSON.stringify(persistableMessages);
    if (messagesJson === lastPersistedRef.current) {
      return;
    }

    lastPersistedRef.current = messagesJson;

    try {
      localStorage.setItem(PERSIST_KEY, json);
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

  // Phase D: toggle the collapsed state of every message in a task group.
  // The announce bubble itself stays visible — only its sub-rows fold/unfold.
  const toggleTaskGroupCollapsed = useCallback((groupId: string) => {
    setMessages((prev) => {
      const target = prev.find((m) => m.taskGroupId === groupId && m.taskRole === 'announce');
      const nextCollapsed = !(target?.collapsed);
      return prev.map((m) => (m.taskGroupId === groupId ? { ...m, collapsed: nextCollapsed } : m));
    });
  }, []);

  // Phase C: fire an async LLM narration for a freshly-inserted announce
  // message. Best-effort — on any failure the sync sentence stays put.
  const kickOffNarration = useCallback((args: {
    announceMsgId: string;
    intentIndex: number;
    taskIndex: number;
    total: number;
    label: string;
    fnName: string;
    locale: 'zh-Hans' | 'en';
  }) => {
    const { announceMsgId, intentIndex, taskIndex, total, label, fnName, locale: loc } = args;
    const prior = extractPriorOutcomes(messagesRef.current, intentIndex);
    // Skip the LLM round-trip for the very first task — sync sentence is fine.
    if (prior.length === 0) return;
    narrateTask({ taskIndex, total, label, fnName, prior, locale: loc })
      .then((narration) => {
        if (!narration?.announceText || narration.announceText === label) return;
        setMessages((prev) => prev.map((m) => {
          if (m.id !== announceMsgId) return m;
          return {
            ...m,
            content: narration.announceText,
            taskAnnounce: m.taskAnnounce
              ? { ...m.taskAnnounce, label: narration.announceText }
              : m.taskAnnounce,
          };
        }));
      })
      .catch((err) => console.warn('[copilot-context] narration error swallowed:', err));
  }, []);

  // I-2 Round 3: resume a parked intent after the user finishes creating a new contact via the inline draft form.
  // Also propagates the new contact's account back into the parked args so the resumed form (e.g. Activity)
  // gets the correct account pre-filled — fixes the case where the agent only resolved the contact gap and
  // never resolved the account on its own.

  // G-1: Replay any inferred sibling intents (additionalActions) after the parked primary intent resumes.
  // Each sibling becomes an inline form-card so the user can confirm/edit it independently. Newly resolved
  // ids/names from the chain (account/contact/opportunity) are merged into each sibling's args so they
  // inherit the same context.
  const replayAdditionalActions = useCallback(async (
    actions: Array<{ function: string; arguments: Record<string, unknown>; reason?: string }> | undefined,
    inheritedContext: Record<string, unknown>,
  ) => {
    if (!actions || actions.length === 0) return;
    const { executeFunction } = await import('@/lib/function-executor');
    const { getDisplayName } = await import('@/lib/function-registry');
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      if (!action.function.startsWith('draft')) continue;
      const mergedArgs: Record<string, unknown> = { ...action.arguments };
      // Inherit ids/names from the resolved chain when the sibling didn't supply its own
      for (const [key, val] of Object.entries(inheritedContext)) {
        if (val != null && (mergedArgs[key] == null || mergedArgs[key] === '')) {
          mergedArgs[key] = val;
        }
      }
      try {
        const result = await executeFunction(
          action.function,
          mergedArgs,
          { userId: user?.objectId, userEmail: user?.userPrincipalName },
        );
        if (!result.success || !result.data) {
          console.warn('[CopilotContext] replayAdditionalActions: draft failed', action.function, result.error);
          continue;
        }
        const data = result.data as { type: string; isNew: boolean; data: Record<string, unknown> };
        const fnDisplay = getDisplayName(action.function, locale === 'zh-Hans' ? 'zh-Hans' : 'en-US');
        setMessages((prev) => [...prev, {
          id: `msg-${Date.now()}-extra-${i}`,
          type: 'form-card',
          role: 'assistant',
          content: action.reason || (locale === 'zh-Hans' ? '从对话中推断' : 'Inferred from conversation'),
          functionCalled: action.function,
          functionDisplayName: fnDisplay,
          timestamp: new Date().toISOString(),
          formCard: {
            type: data.type as 'activity' | 'opportunity' | 'account' | 'contact',
            isNew: data.isNew,
            data: data.data,
            status: 'pending',
          },
        }]);
      } catch (err) {
        console.warn('[CopilotContext] replayAdditionalActions error:', action.function, err);
      }
    }
  }, [user, locale]);

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
        // G-1: replay inferred siblings, inheriting the newly resolved contact + account
        await replayAdditionalActions(parked.additionalActions, {
          contactId,
          contactName,
          ...(accountId ? { accountId } : {}),
          ...(accountName ? { accountName } : {}),
        });
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
  }, [user, locale, replayAdditionalActions]);

  // Generic resume helper for the parked intent — used by both account and opportunity create paths.
  // Patches the parked args with the newly created entity id/name (and any propagated parent), then
  // re-runs the parked draft function and renders the resumed form-card.
  const resumeParkedAfterEntityCreate = useCallback(async (
    expectedKind: 'account' | 'opportunity',
    patch: Record<string, unknown>,
  ) => {
    const parked = parkedIntentRef.current;
    if (!parked || parked.pendingKind !== expectedKind) return;
    parkedIntentRef.current = null;

    const newArgs: Record<string, unknown> = { ...parked.arguments, ...patch };

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
      const kindZh = expectedKind === 'account' ? '客户' : '商机';
      const kindEn = expectedKind === 'account' ? 'Account' : 'Opportunity';

      if (fnResult.success && fnResult.data) {
        const formData = fnResult.data as { type: string; isNew: boolean; data: Record<string, unknown> };
        setMessages((prev) => [...prev, {
          id: `msg-${Date.now()}-resumed-form`,
          type: 'form-card',
          role: 'assistant',
          content: locale === 'zh-Hans'
            ? `${kindZh}已新建，请确认以下信息`
            : `${kindEn} created. Please confirm the following information`,
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
        // G-1: replay inferred siblings, inheriting the resolved entity ids/names
        await replayAdditionalActions(parked.additionalActions, patch);
      } else {
        setMessages((prev) => [...prev, {
          id: `msg-${Date.now()}-resume-err`,
          type: 'agent',
          role: 'assistant',
          content: locale === 'zh-Hans'
            ? `❌ 新建${kindZh}后恢复操作失败: ${fnResult.error}`
            : `❌ Failed to resume after ${expectedKind} create: ${fnResult.error}`,
          agentName: 'System',
          timestamp: new Date().toISOString(),
        }]);
      }
    } catch (err) {
      console.error(`[CopilotContext] resume after ${expectedKind} create error:`, err);
    } finally {
      setIsSending(false);
    }
  }, [user, locale, replayAdditionalActions]);

  const completeParkedIntentWithNewAccount = useCallback(async (
    accountId: string,
    accountName: string,
  ) => {
    await resumeParkedAfterEntityCreate('account', { accountId, accountName });
  }, [resumeParkedAfterEntityCreate]);

  const completeParkedIntentWithNewOpportunity = useCallback(async (
    opportunityId: string,
    opportunityName: string,
    accountId?: string,
    accountName?: string,
  ) => {
    const patch: Record<string, unknown> = { opportunityId, opportunityName };
    // If parked args don't already have an account, propagate the opportunity's parent account.
    const parked = parkedIntentRef.current;
    if (parked) {
      if (accountId && !parked.arguments.accountId) patch.accountId = accountId;
      if (accountName && !parked.arguments.accountName) patch.accountName = accountName;
    }
    await resumeParkedAfterEntityCreate('opportunity', patch);
  }, [resumeParkedAfterEntityCreate]);
  const pageContext = pageContextState;
  const pageContextRef = useRef<PageContext | null>(null);
  
  // Keep pageContextRef in sync with pageContext state
  
  // Debug effect removed - was causing performance issues by running on every render
  useEffect(() => {
    pageContextRef.current = pageContext;
  }, [pageContext]);

  // Extract structured visit data using Copilot Studio SDK connector
  const extractVisitData = useCallback(async (
    text: string,
    findAccountByName: (name: string) => { id: string; name1?: string } | undefined
  ): Promise<ExtractedVisitData | null> => {
    return extractVisitDataFromText(
      text,
      findAccountByName,
      locale,
      user?.objectId
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
  
  // Refs for copilot UI state
  const typingMessageIdRef = useRef<string | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Helper function to simulate streaming text effect — reveals word-by-word
  // with smooth timing for a natural feel.
  const simulateStreamingText = useCallback((messageId: string, fullContent: string, agentName: string, timestamp: string, onComplete?: () => void) => {
    // Clean up any existing streaming interval
    if (streamingIntervalRef.current) {
      clearInterval(streamingIntervalRef.current);
      streamingIntervalRef.current = null;
    }
    
    // Split into words, then reveal in word chunks for a natural pace.
    const words = fullContent.split(/(\s+)/); // keep whitespace as separate tokens
    let wordIndex = 0;
    const wordsPerTick = 3; // words per frame
    const tickInterval = 40; // ms between frames
    
    // Start with empty content, then gradually reveal
    setMessages((prev) => {
      const filtered = typingMessageIdRef.current
        ? prev.filter((msg) => msg.id !== typingMessageIdRef.current)
        : prev;
      
      // Check for duplicate
      const existingContents = new Set(filtered.filter((p) => p.type === 'agent').map((p) => p.content));
      if (existingContents.has(fullContent)) {
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
      wordIndex += wordsPerTick;
      
      if (wordIndex >= words.length) {
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
        if (onComplete) onComplete();
      } else {
        // Update with partial content — join words up to current index
        const partialContent = words.slice(0, wordIndex).join('');
        setMessages((prev) => prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, content: partialContent }
            : msg
        ));
      }
    }, tickInterval);
  }, []);

  // With SDK connector, Copilot Studio is always available — mark connected when settings are ready
  useEffect(() => {
    if (settingsReady) {
      setIsConnected(true);
    }
  }, [settingsReady]);

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
      // Queue-driven awaiting card → dispatch to runtime.
      if (lastForGate.queueIntentId && queueRef.current) {
        const userReplyMsg: ChatMessage = {
          id: `msg-${Date.now()}-user`,
          type: 'user',
          role: 'user',
          content: text.trim(),
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, userReplyMsg]);
        setInputValue('');
        try {
          const result = await (await loadQR()).handleAwaitingReply(
            queueRef.current,
            lastForGate.queueIntentId,
            text.trim(),
            buildRuntimeDeps(),
          );
          if (result.handled) {
            queueRef.current = result.queue;
            bumpQueue();
            return;
          }
        } catch (err) {
          console.error('[CopilotContext] queue awaiting reply error:', err);
        }
        // Not handled by queue → fall through to normal flow (mark resolved + re-detect intent).
        setMessages((prev) => prev.map((m) => m.id === lastForGate.id ? { ...m, resolutionState: 'resolved' as const } : m));
        // Fall through past the legacy gate by treating the rest as a fresh request.
      } else {
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
        const { function: fn, arguments: args, additionalActions: parkedExtras } = lastForGate.awaitingClarification.originalIntent;
        const pendingResolution = lastForGate.awaitingClarification.pendingResolutions[0];
        const pendingKind = pendingResolution.kind;
        const queryName = pendingResolution.query;
        const kindLabelZh = pendingKind === 'contact' ? '联系人' : pendingKind === 'account' ? '客户' : '商机';
        const gateResultText = isCreate
          ? (locale === 'zh-Hans' ? `新建${kindLabelZh}：${queryName}` : `Created new ${pendingKind}: ${queryName}`)
          : (locale === 'zh-Hans' ? `已跳过${kindLabelZh}关联` : `Skipped ${pendingKind} link`);
        setMessages((prev) => prev.map((m) =>
          m.id === blockedId
            ? { ...m, resolutionState: 'resolved' as const, resolutionResult: gateResultText }
            : m
        ));

        // I-2 Round 3: differentiate 'create' from 'skip'
        if (isCreate && pendingKind === 'contact') {
          // Park the original intent; spawn a contact draft form. After save, the parked intent resumes with the new contactId.
          parkedIntentRef.current = {
            function: fn,
            arguments: args,
            pendingKind: 'contact',
            blockedMsgId: blockedId,
            additionalActions: parkedExtras,
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
          // Park the original intent and spawn a draft form for the new account/opportunity.
          // After the user saves it, completeParkedIntentWithNewAccount/Opportunity resumes the parked draft.
          parkedIntentRef.current = {
            function: fn,
            arguments: args,
            pendingKind,
            blockedMsgId: blockedId,
            additionalActions: parkedExtras,
          };
          const isAccount = pendingKind === 'account';
          const draftFn = isAccount ? 'createAccount' : 'createOpportunity';
          const draftLabel = isAccount
            ? (locale === 'zh-Hans' ? '新建客户' : 'New Account')
            : (locale === 'zh-Hans' ? '新建商机' : 'New Opportunity');
          const draftBody = isAccount
            ? (locale === 'zh-Hans'
                ? '新建客户，保存后将自动关联到本次操作'
                : 'Create a new account — it will be linked automatically after save')
            : (locale === 'zh-Hans'
                ? '新建商机，保存后将自动关联到本次操作'
                : 'Create a new opportunity — it will be linked automatically after save');
          const draftData: Record<string, unknown> = isAccount
            ? { name: queryName }
            : {
                name: queryName,
                accountName: (args.accountName as string | undefined) ?? '',
                accountId: (args.accountId as string | undefined) ?? '',
              };
          setMessages((prev) => [...prev, {
            id: `msg-${Date.now()}-${pendingKind}-draft`,
            type: 'form-card',
            role: 'assistant',
            content: draftBody,
            functionCalled: draftFn,
            functionDisplayName: draftLabel,
            timestamp: new Date().toISOString(),
            formCard: {
              type: pendingKind,
              isNew: true,
              data: draftData,
              status: 'pending',
            },
          }]);
          return;
        }

        // Skip: strip the unresolved entity and execute the original function directly.
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
    
    // Proceed directly — invokeFlowForLLM has its own availability guard
    {
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
            .filter((m: ChatMessage) => {
              // Only include actual conversational messages, not UI narration or cards.
              if (!m.role || (m.role !== 'user' && m.role !== 'assistant')) return false;
              if (!m.content || !m.content.trim()) return false;
              // Skip queue narration messages (announce, substep, overview) — they're UI chrome, not conversation.
              if (m.taskRole === 'announce' || m.taskRole === 'substep' || m.taskRole === 'overview') return false;
              // Skip thinking/streaming placeholders.
              if (m.isThinking || m.isStreaming) return false;
              // Skip non-text message types (cards etc.) — only agent text and user text.
              if (m.type !== 'user' && m.type !== 'agent') return false;
              return true;
            })
            .map((m: ChatMessage) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
              // Carry function metadata so Frame can resolve anaphora
              // ("list them" after getSalesSummary → "them" = opportunities)
              ...(m.functionCalled ? { functionCalled: m.functionCalled } : {}),
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
          
          const { processMessage } = await import('@/lib/copilot-agent');
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
          }, handleProgress);
          
          // ===== IntentQueue intercept =====
          // When the parsed intent triggers queue mode (draft / batch / matching / additionalActions),
          // discard the agent's pre-rendered cards and hand off to the queue runtime instead.
          // The thinking message becomes a brief agent ack and the queue pushes its own cards.
          if (response.rawIntent && shouldUseQueue(response.rawIntent)) {
            setIsSending(false);
            setMessages((prev) => prev.map((msg) => {
              if (msg.id !== thinkingMsgId) return msg;
              const stepCount = 1 + (response.rawIntent?.additionalActions?.length ?? 0);
              const ackContent = stepCount > 1
                ? (locale === 'zh-Hans' ? `已识别 ${stepCount} 步任务，依次处理...` : `Detected ${stepCount} steps. Processing in order...`)
                : (locale === 'zh-Hans' ? '正在准备...' : 'Preparing...');
              return {
                ...msg,
                type: 'agent' as const,
                content: ackContent,
                functionCalled: response.functionCalled,
                functionDisplayName: response.functionDisplayName,
                isThinking: false,
                // Drop pre-resolved thinkingSteps (e.g. "Found N high-confidence matches").
                // In queue mode the same info already appears inside the cards we render,
                // so showing it again above the ack is redundant noise.
                thinkingSteps: undefined,
              };
            }));
            const newQueue = buildQueueFromIntent(response.rawIntent);
            await runAndStoreQueue(newQueue);
            return;
          }

          // Clarification is now handled naturally by the LLM as a regular response
          // No special clarificationQuestions handling needed - LLM will ask for more info naturally

          // ===== I-2 Stage 1: Handle awaiting-clarification response =====
          if (response.awaitingClarification) {
            setIsSending(false);
            // Phase B: emit overview + announce before the awaiting-clarification card
            const overviewAc = response.intentsOverview;
            const intentIdxAc = response.currentIntentIndex;
            const isZhAc = locale === 'zh-Hans';
            let acTaskGroupId: string | undefined;
            if (overviewAc && overviewAc.length > 1 && intentIdxAc !== undefined) {
              acTaskGroupId = `task-${intentIdxAc}`;
              const announceForAc = buildAnnounceMessage(intentIdxAc, overviewAc, isZhAc);
              let didInsertAnnounceAc = false;
              setMessages((prev) => {
                const idx = prev.findIndex((m) => m.id === thinkingMsgId);
                if (idx < 0) return prev;
                const inserts: ChatMessage[] = [];
                if (!hasMessageAfterLastUser(prev, (m) => m.taskRole === 'overview')) {
                  inserts.push(buildOverviewMessage(overviewAc, isZhAc));
                }
                if (announceForAc && !hasMessageAfterLastUser(prev, (m) => m.taskRole === 'announce' && m.taskGroupId === `task-${intentIdxAc}`)) {
                  inserts.push(announceForAc);
                  didInsertAnnounceAc = true;
                }
                if (inserts.length === 0) return prev;
                // Phase D: fold any earlier task's substeps before showing the new announce.
                const folded = collapseEarlierTasks(prev, intentIdxAc);
                return [...folded.slice(0, idx), ...inserts, ...folded.slice(idx)];
              });
              // Phase C: async LLM narration kick-off (best effort).
              if (didInsertAnnounceAc && announceForAc?.taskAnnounce) {
                kickOffNarration({
                  announceMsgId: announceForAc.id,
                  intentIndex: intentIdxAc,
                  taskIndex: announceForAc.taskAnnounce.index,
                  total: announceForAc.taskAnnounce.total,
                  label: announceForAc.taskAnnounce.label,
                  fnName: response.functionCalled ?? '',
                  locale: isZhAc ? 'zh-Hans' : 'en',
                });
              }
            }
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
                ...(acTaskGroupId ? { taskGroupId: acTaskGroupId, taskRole: 'substep' as const } : {}),
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
          const isFuzzyMatchFunction = response.functionCalled && ['fuzzyMatchAccount', 'fuzzyMatchContact', 'fuzzyMatchOpportunity', 'fuzzyMatchActivity'].includes(response.functionCalled);
          
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

            // ===== Phase B: emit task narration overview + announce BEFORE the match-selection =====
            const overview = response.intentsOverview;
            const intentIdx = response.currentIntentIndex;
            const isZhLocale = locale === 'zh-Hans';
            let currentTaskGroupId: string | undefined;
            if (overview && overview.length > 1 && intentIdx !== undefined) {
              currentTaskGroupId = `task-${intentIdx}`;
              const announceForIntent = buildAnnounceMessage(intentIdx, overview, isZhLocale);
              let didInsertAnnounce = false;
              setMessages((prev) => {
                const idx = prev.findIndex((m) => m.id === thinkingMsgId);
                if (idx < 0) return prev;
                const inserts: ChatMessage[] = [];
                if (!hasMessageAfterLastUser(prev, (m) => m.taskRole === 'overview')) {
                  inserts.push(buildOverviewMessage(overview, isZhLocale));
                }
                if (announceForIntent && !hasMessageAfterLastUser(prev, (m) => m.taskRole === 'announce' && m.taskGroupId === `task-${intentIdx}`)) {
                  inserts.push(announceForIntent);
                  didInsertAnnounce = true;
                }
                if (inserts.length === 0) return prev;
                // Phase D: fold prior tasks before the new announce lands.
                const folded = collapseEarlierTasks(prev, intentIdx);
                return [...folded.slice(0, idx), ...inserts, ...folded.slice(idx)];
              });
              if (didInsertAnnounce && announceForIntent?.taskAnnounce) {
                kickOffNarration({
                  announceMsgId: announceForIntent.id,
                  intentIndex: intentIdx,
                  taskIndex: announceForIntent.taskAnnounce.index,
                  total: announceForIntent.taskAnnounce.total,
                  label: announceForIntent.taskAnnounce.label,
                  fnName: response.functionCalled ?? '',
                  locale: isZhLocale ? 'zh-Hans' : 'en',
                });
              }
            }

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
                ...(currentTaskGroupId ? { taskGroupId: currentTaskGroupId, taskRole: 'substep' as const } : {}),
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
    }
  }, [user, locale]); // pageContext accessed via ref to avoid re-create sendMessage

  const startNewConversation = useCallback(async () => {
    // Clear current session
    clearCopilotConversation();
    typingMessageIdRef.current = null;
    setMessages([]);
    
    // Clear persisted messages
    try {
      localStorage.removeItem(PERSIST_KEY);
    } catch (e) {
      console.warn('Failed to clear persisted messages:', e);
    }
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, []);

  // Continue pending action after user selects a match from match-selection card
  const continuePendingAction = useCallback(async (
    selectedRecord: { id: string; name: string; accountId?: string; accountName?: string },
    pendingIntent: { function: string; arguments: Record<string, unknown> },
    entityType: 'account' | 'contact' | 'opportunity' | 'activity',
    sourceMessageId?: string
  ) => {
    // Queue intercept: when the card belongs to an active queue intent, route the pick
    // to the runtime so the queue advances; bypass the legacy resolution cascade.
    if (sourceMessageId) {
      const srcMsg = messagesRef.current.find((m) => m.id === sourceMessageId);
      const intentId = srcMsg?.queueIntentId;
      const q = queueRef.current;
      if (intentId && q && findIntentByMessageId(q, sourceMessageId)) {
        const after = await (await loadQR()).handlePick(q, intentId, {
          id: selectedRecord.id,
          name: selectedRecord.name,
          accountId: selectedRecord.accountId,
          accountName: selectedRecord.accountName,
        }, buildRuntimeDeps());
        queueRef.current = after;
        bumpQueue();
        return;
      }
    }

    // Lock the source match-selection card with a result line.
    if (sourceMessageId) {
      const resultText = locale === 'zh-Hans'
        ? `已选择：${selectedRecord.name}`
        : `Selected: ${selectedRecord.name}`;
      setMessages((prev) => prev.map((m) =>
        m.id === sourceMessageId
          ? { ...m, resolutionState: 'resolved' as const, resolutionResult: resultText }
          : m
      ));
    }

    // Activity "select existing" semantic: don't draft a duplicate. We still
    // need to walk any remainingResolutions and advance through subsequent
    // intents — only the *final* draftActivity executeFunction call gets
    // suppressed. (draftActivity always returns isNew:true regardless of
    // activityId, which is why the old behavior produced a duplicate form.)
    // batchDraft is NOT covered here because suppressing one item in a batch
    // requires reshaping the batch payload — future work if boss hits it.
    const bypassFinalActivityDraft = entityType === 'activity' && pendingIntent.function === 'draftActivity';
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

      // I-3 Slice 3: Walk remaining resolution chain before executing the final draft.
      // For each remaining ResolutionItem: scopeBy-inject, run fuzzyMatch, then:
      //   - single >90% high-conf → auto-inject into args + continue
      //   - multi/medium-high-conf → render matchSelection card (with shortened queue) + stop
      //   - no high-conf (draft only) → render awaiting-clarification card + stop
      const remainingResolutions = (pendingIntent as { remainingResolutions?: ResolutionItem[] }).remainingResolutions;
      if ((isDraftFunction || isBatchDraft) && remainingResolutions && remainingResolutions.length > 0) {
        console.log('[CopilotContext] I-3 cascade: walking', remainingResolutions.length, 'remaining resolutions');
        const resolvedSoFar: Record<string, string> = {};
        resolvedSoFar[entityType] = selectedRecord.id;
        if (entityType === 'contact' && selectedRecord.accountId) resolvedSoFar.account = selectedRecord.accountId;
        if (updatedArguments.accountId && !resolvedSoFar.account) resolvedSoFar.account = updatedArguments.accountId as string;
        if (updatedArguments.contactId && !resolvedSoFar.contact) resolvedSoFar.contact = updatedArguments.contactId as string;
        if (updatedArguments.opportunityId && !resolvedSoFar.opportunity) resolvedSoFar.opportunity = updatedArguments.opportunityId as string;

        let cascadeBlocked = false;
        // ===== Phase B: recover prior task narration context from the message stream =====
        // Latest taskGroupId among messages tells us which intent we were on; the
        // overview message tells us the per-intent labels for future announces.
        const stateForNarration = messages;
        let prevIntentIndex: number | undefined = undefined;
        for (let k = stateForNarration.length - 1; k >= 0; k--) {
          const gid = stateForNarration[k].taskGroupId;
          if (gid && gid.startsWith('task-')) {
            const n = Number.parseInt(gid.slice(5), 10);
            if (Number.isFinite(n)) { prevIntentIndex = n; break; }
          }
        }
        const overviewFromStream: IntentsOverview | undefined = (() => {
          const overviewMsg = stateForNarration.find((m) => m.taskRole === 'overview' && m.taskOverview);
          if (!overviewMsg?.taskOverview) return undefined;
          return overviewMsg.taskOverview.intents.map((it) => ({
            intentIndex: it.index,
            userFacingLabel: { zh: it.label, en: it.label },
          }));
        })();
        const isZhCascade = locale === 'zh-Hans';
        let currentCascadeGroupId: string | undefined =
          prevIntentIndex !== undefined ? `task-${prevIntentIndex}` : undefined;

        for (let i = 0; i < remainingResolutions.length; i++) {
          const item = remainingResolutions[i];
          const remainingAfter = remainingResolutions.slice(i + 1);

          // Phase B: on intent boundary change, emit an announce message before
          // creating the next blocking card. This is what makes the user see
          // "Starting task 2 of 4: …" between two related matches.
          // If intermediate intents auto-resolved (no blocking entity), fill in
          // their announces too so the user doesn't see Task 1 → Task 3 jumps.
          const itemIntentIndex = (item as { intentIndex?: number }).intentIndex;
          if (
            overviewFromStream &&
            overviewFromStream.length > 1 &&
            itemIntentIndex !== undefined &&
            itemIntentIndex !== prevIntentIndex
          ) {
            const startIdx = (prevIntentIndex ?? -1) + 1;
            for (let stepIdx = startIdx; stepIdx <= itemIntentIndex; stepIdx++) {
              const announce = buildAnnounceMessage(stepIdx, overviewFromStream, isZhCascade);
              if (announce) {
                setMessages((prev) => {
                  // Phase D: fold any prior task's substeps before the next announce.
                  const folded = collapseEarlierTasks(prev, stepIdx);
                  const idx = folded.findIndex((m) => m.id === thinkingMsgId);
                  if (idx < 0) return [...folded, announce];
                  return [...folded.slice(0, idx), announce, ...folded.slice(idx)];
                });
                if (announce.taskAnnounce) {
                  kickOffNarration({
                    announceMsgId: announce.id,
                    intentIndex: stepIdx,
                    taskIndex: announce.taskAnnounce.index,
                    total: announce.taskAnnounce.total,
                    label: announce.taskAnnounce.label,
                    fnName: '',
                    locale: isZhCascade ? 'zh-Hans' : 'en',
                  });
                }
              }
            }
            currentCascadeGroupId = `task-${itemIntentIndex}`;
            prevIntentIndex = itemIntentIndex;
          }

          // scopeBy injection from accumulated resolvedSoFar
          if (item.scopeBy && resolvedSoFar[item.scopeBy]) {
            updatedArguments[`${item.scopeBy}Id`] = resolvedSoFar[item.scopeBy];
            console.log('[CopilotContext] cascade scopeBy inject:', `${item.scopeBy}Id=${resolvedSoFar[item.scopeBy]}`);
          }

          const matchFn = item.entityType === 'account' ? 'fuzzyMatchAccount' :
                          item.entityType === 'contact' ? 'fuzzyMatchContact' :
                          item.entityType === 'activity' ? 'fuzzyMatchActivity' :
                          'fuzzyMatchOpportunity';

          let matchResult;
          try {
            matchResult = await executeFunction(
              matchFn,
              { query: item.query, accountId: updatedArguments.accountId as string | undefined },
              { userId: user?.objectId, userEmail: user?.userPrincipalName }
            );
          } catch (err) {
            console.warn('[CopilotContext] cascade match error, skipping step:', err);
            continue;
          }

          if (!matchResult.success || !matchResult.data) {
            console.warn('[CopilotContext] cascade match unsuccessful, skipping step');
            continue;
          }

          const matchData = matchResult.data as {
            matches: Array<{ id: string; name: string; score: number; matchType: 'exact' | 'contains' | 'fuzzy'; accountId?: string; accountName?: string; subtitle?: string }>;
          };
          const highConf = matchData.matches.filter((m) => m.score >= 70);

          // Auto-inject single very-high-confidence match
          if (highConf.length === 1 && highConf[0].score > 90) {
            const m = highConf[0];
            if (item.entityType === 'account') {
              updatedArguments.accountId = m.id;
              updatedArguments.accountName = m.name;
              resolvedSoFar.account = m.id;
            } else if (item.entityType === 'contact') {
              updatedArguments.contactId = m.id;
              updatedArguments.contactName = m.name;
              if (m.accountId) {
                updatedArguments.accountId = m.accountId;
                if (m.accountName) updatedArguments.accountName = m.accountName;
                resolvedSoFar.account = m.accountId;
              }
              resolvedSoFar.contact = m.id;
            } else if (item.entityType === 'opportunity') {
              updatedArguments.opportunityId = m.id;
              updatedArguments.opportunityName = m.name;
              resolvedSoFar.opportunity = m.id;
            } else if (item.entityType === 'activity') {
              updatedArguments.activityId = m.id;
              resolvedSoFar.activity = m.id;
            }
            console.log('[CopilotContext] cascade auto-injected', item.entityType, m.name);
            continue;
          }

          // Multiple high-conf OR single 70-90 → blocking matchSelection card
          if (highConf.length > 0) {
            const lowConf = matchData.matches.filter((m) => m.score < 70 && m.score >= 20);
            const newPendingIntent = {
              function: pendingIntent.function,
              arguments: { ...updatedArguments },
              ...(remainingAfter.length > 0 ? { remainingResolutions: remainingAfter } : {}),
            };
            const entityLabel = item.entityType === 'account' ? (locale === 'zh-Hans' ? '客户' : 'account') :
                                item.entityType === 'contact' ? (locale === 'zh-Hans' ? '联系人' : 'contact') :
                                item.entityType === 'activity' ? (locale === 'zh-Hans' ? '活动' : 'activity') :
                                (locale === 'zh-Hans' ? '商机' : 'opportunity');
            setMessages((prev) => prev.map((msg) => {
              if (msg.id !== thinkingMsgId) return msg;
              return {
                ...msg,
                type: 'match-selection' as const,
                content: locale === 'zh-Hans'
                  ? `找到 ${highConf.length} 个匹配的${entityLabel}，请选择：`
                  : `Found ${highConf.length} matching ${entityLabel}(s). Please select:`,
                isThinking: false,
                thinkingSteps: [
                  { stage: 'matching' as const, status: 'completed' as const, label: locale === 'zh-Hans' ? `继续解析「${item.query}」` : `Continuing resolution for "${item.query}"` },
                ],
                matchSelection: {
                  entityType: item.entityType,
                  query: item.query,
                  matches: highConf,
                  lowConfidenceMatches: lowConf,
                  confidence: 'high' as const,
                  pendingIntent: newPendingIntent,
                },
                resolutionState: 'blocked' as const,
                ...(currentCascadeGroupId ? { taskGroupId: currentCascadeGroupId, taskRole: 'substep' as const } : {}),
              };
            }));
            cascadeBlocked = true;
            break;
          }

          // No high-conf for draft → awaiting-clarification card
          const topCandidates = matchData.matches.slice(0, 3).map((m) => ({
            id: m.id,
            name: m.name,
            score: m.score,
            subtitle: m.accountName,
          }));
          const pendingKind: 'contact' | 'account' | 'opportunity' =
            item.entityType === 'activity' ? 'opportunity' : (item.entityType as 'contact' | 'account' | 'opportunity');
          const kindLabel = pendingKind === 'contact' ? (locale === 'zh-Hans' ? '联系人' : 'contact') :
                            pendingKind === 'account' ? (locale === 'zh-Hans' ? '客户' : 'account') :
                            (locale === 'zh-Hans' ? '商机' : 'opportunity');
          const ac: AwaitingClarification = {
            kind: 'awaiting-clarification',
            pendingResolutions: [{
              id: 'pr-' + Date.now(),
              kind: pendingKind,
              query: item.query,
              candidates: topCandidates,
              status: 'pending',
            }],
            originalIntent: {
              function: pendingIntent.function,
              arguments: { ...updatedArguments },
            },
            ...(remainingAfter.length > 0 ? { remainingResolutions: remainingAfter } : {}),
            ...(Object.keys(resolvedSoFar).length > 0 ? { resolvedSoFar: { ...resolvedSoFar } } : {}),
          };
          setMessages((prev) => prev.map((msg) => {
            if (msg.id !== thinkingMsgId) return msg;
            return {
              ...msg,
              type: 'awaiting-clarification' as const,
              content: locale === 'zh-Hans'
                ? `未找到与「${item.query}」匹配的${kindLabel}。回复"新建"以新建，或回复其他名称重新搜索，或回复"跳过"以不关联。`
                : `No ${kindLabel} matches "${item.query}". Reply "create" to create one, another name to retry, or "skip" to omit.`,
              isThinking: false,
              thinkingSteps: [
                { stage: 'matching' as const, status: 'completed' as const, label: locale === 'zh-Hans' ? `未找到「${item.query}」匹配` : `No match for "${item.query}"` },
              ],
              awaitingClarification: ac,
              resolutionState: 'blocked' as const,
              ...(currentCascadeGroupId ? { taskGroupId: currentCascadeGroupId, taskRole: 'substep' as const } : {}),
            };
          }));
          cascadeBlocked = true;
          break;
        }

        if (cascadeBlocked) {
          setIsSending(false);
          return;
        }
        console.log('[CopilotContext] cascade exhausted, final args:', JSON.stringify(updatedArguments, null, 2));
      }

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
        // bypassFinalActivityDraft: user picked an existing activity earlier.
        // Convert the thinking message into a plain ack instead of running
        // draftActivity (which would always produce a duplicate form).
        if (bypassFinalActivityDraft) {
          setMessages((prev) => prev.map((msg) => {
            if (msg.id !== thinkingMsgId) return msg;
            return {
              ...msg,
              type: 'agent' as const,
              content: locale === 'zh-Hans'
                ? `已关联到现有活动「${selectedRecord.name}」，未创建重复记录。`
                : `Linked to existing activity "${selectedRecord.name}" — no duplicate created.`,
              isThinking: false,
              thinkingSteps: [
                { stage: 'executing' as const, status: 'completed' as const, label: locale === 'zh-Hans' ? `关联现有活动` : `Linked existing activity` },
              ],
            };
          }));
        } else {
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
        } // end bypassFinalActivityDraft else

        // Replay any additional intents (e.g. draftOpportunity, follow-up draftActivity)
        // that were carried through the match-selection flow. These were originally part
        // of the LLM's multi-intent response but got parked when matching blocked.
        const carriedActions = (pendingIntent as { additionalActions?: Array<{ function: string; arguments: Record<string, unknown>; reason?: string }> }).additionalActions;
        if (carriedActions && carriedActions.length > 0) {
          console.log('[CopilotContext] replaying', carriedActions.length, 'additional actions after match resolution');
          await replayAdditionalActions(carriedActions, updatedArguments);
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
          .filter((m: ChatMessage) => {
            if (!m.role || (m.role !== 'user' && m.role !== 'assistant')) return false;
            if (!m.content || !m.content.trim()) return false;
            if (m.taskRole === 'announce' || m.taskRole === 'substep' || m.taskRole === 'overview') return false;
            if (m.isThinking || m.isStreaming) return false;
            if (m.type !== 'user' && m.type !== 'agent') return false;
            return true;
          })
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
          const { processMessage } = await import('@/lib/copilot-agent');
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
  }, [user, locale, messages, buildRuntimeDeps, bumpQueue]);

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
    pendingIntent: { function: string; arguments: Record<string, unknown>; additionalActions?: Array<{ function: string; arguments: Record<string, unknown>; reason?: string }> },
    entityKind: 'contact' | 'account' | 'opportunity' | 'activity',
    queryName: string,
    blockedMsgId?: string
  ) => {
    // Queue intercept
    if (blockedMsgId) {
      const srcMsg = messagesRef.current.find((m) => m.id === blockedMsgId);
      const intentId = srcMsg?.queueIntentId;
      const q = queueRef.current;
      if (intentId && q && findIntentByMessageId(q, blockedMsgId)) {
        const kind: 'contact' | 'account' | 'opportunity' =
          entityKind === 'activity' ? 'opportunity' : entityKind;
        const after = await (await loadQR()).handleCreateNew(q, intentId, kind, queryName, buildRuntimeDeps());
        queueRef.current = after;
        bumpQueue();
        return;
      }
    }
    // Activity branch: "create new anyway" — lock the card, then run the
    // original draftActivity. Original args carry no activityId, so the form
    // will be a fresh draft (matching the duplicate-check bypass semantic).
    if (entityKind === 'activity') {
      if (blockedMsgId) {
        const resultText = locale === 'zh-Hans'
          ? `新建活动：${queryName}`
          : `Creating new activity: ${queryName}`;
        setMessages((prev) => prev.map((m) =>
          m.id === blockedMsgId
            ? { ...m, resolutionState: 'resolved' as const, resolutionResult: resultText }
            : m
        ));
      }
      await skipResolutionAndDraftImpl(pendingIntent, 'activity');
      return;
    }

    // Mark the source message resolved so the card freezes
    if (blockedMsgId) {
      const kindLabelZh = entityKind === 'contact' ? '联系人' : entityKind === 'account' ? '客户' : '商机';
      const resultText = locale === 'zh-Hans'
        ? `新建${kindLabelZh}：${queryName}`
        : `Created new ${entityKind}: ${queryName}`;
      setMessages((prev) => prev.map((m) =>
        m.id === blockedMsgId
          ? { ...m, resolutionState: 'resolved' as const, resolutionResult: resultText }
          : m
      ));
    }

    if (entityKind === 'contact') {
      // Park the original intent; resumed by completeParkedIntentWithNewContact after the contact is saved
      parkedIntentRef.current = {
        function: pendingIntent.function,
        arguments: pendingIntent.arguments,
        pendingKind: 'contact',
        blockedMsgId: blockedMsgId || '',
        additionalActions: pendingIntent.additionalActions,
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

    // account / opportunity chain-create: park original intent, spawn a draft form for the new entity.
    // After the user saves it, completeParkedIntentWithNewAccount/Opportunity resumes the parked draft.
    if (entityKind === 'account' || entityKind === 'opportunity') {
      const blockedId = blockedMsgId || `msg-${Date.now()}-park-anchor`;
      parkedIntentRef.current = {
        function: pendingIntent.function,
        arguments: pendingIntent.arguments,
        pendingKind: entityKind,
        blockedMsgId: blockedId,
        additionalActions: pendingIntent.additionalActions,
      };
      const isAccount = entityKind === 'account';
      const draftFn = isAccount ? 'createAccount' : 'createOpportunity';
      const draftLabel = isAccount
        ? (locale === 'zh-Hans' ? '新建客户' : 'New Account')
        : (locale === 'zh-Hans' ? '新建商机' : 'New Opportunity');
      const draftBody = isAccount
        ? (locale === 'zh-Hans'
            ? '新建客户，保存后将自动关联到本次操作'
            : 'Create a new account — it will be linked automatically after save')
        : (locale === 'zh-Hans'
            ? '新建商机，保存后将自动关联到本次操作'
            : 'Create a new opportunity — it will be linked automatically after save');
      const draftData: Record<string, unknown> = isAccount
        ? { name: queryName }
        : {
            name: queryName,
            accountName: (pendingIntent.arguments.accountName as string | undefined) ?? '',
            accountId: (pendingIntent.arguments.accountId as string | undefined) ?? '',
          };
      setMessages((prev) => [...prev, {
        id: `msg-${Date.now()}-${entityKind}-draft`,
        type: 'form-card',
        role: 'assistant',
        content: draftBody,
        functionCalled: draftFn,
        functionDisplayName: draftLabel,
        timestamp: new Date().toISOString(),
        formCard: {
          type: entityKind,
          isNew: true,
          data: draftData,
          status: 'pending',
        },
      }]);
      return;
    }

    // Unreachable — entityKind is exhausted by the contact / account / opportunity / activity branches above.
    await skipResolutionAndDraftImpl(pendingIntent, entityKind);
  }, [user, locale, buildRuntimeDeps, bumpQueue]);

  // Unified resolution — skip: strip the unresolved entity from args and run the original draft directly.
  // The resulting form-card has an empty lookup for the skipped entity so the user can pick it in-form.
  // Mirrors the gate's skip branch. entityKind === 'activity' uses this path for "create new anyway"
  // (no fields to strip; runs draftActivity with original args).
  const skipResolutionAndDraftImpl = async (
    pendingIntent: { function: string; arguments: Record<string, unknown> },
    entityKind: 'contact' | 'account' | 'opportunity' | 'activity'
  ) => {
    const strippedArgs: Record<string, unknown> = { ...pendingIntent.arguments };
    if (entityKind === 'contact') { delete strippedArgs.contactId; delete strippedArgs.contactName; }
    else if (entityKind === 'account') { delete strippedArgs.accountId; delete strippedArgs.accountName; }
    else if (entityKind === 'opportunity') { delete strippedArgs.opportunityId; delete strippedArgs.opportunityName; }
    else if (entityKind === 'activity') { delete strippedArgs.activityId; }

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
    entityKind: 'contact' | 'account' | 'opportunity' | 'activity',
    blockedMsgId?: string
  ) => {
    // Queue intercept
    if (blockedMsgId) {
      const srcMsg = messagesRef.current.find((m) => m.id === blockedMsgId);
      const intentId = srcMsg?.queueIntentId;
      const q = queueRef.current;
      if (intentId && q && findIntentByMessageId(q, blockedMsgId)) {
        const after = await (await loadQR()).handleSkip(q, intentId, buildRuntimeDeps());
        queueRef.current = after;
        bumpQueue();
        return;
      }
    }
    // Activity branch: "skip" = cancel the draft entirely. The activity IS the
    // thing being drafted, so there's nothing left to draft — just lock the
    // card and stop. No executeFunction call.
    if (entityKind === 'activity') {
      if (blockedMsgId) {
        const resultText = locale === 'zh-Hans'
          ? '已取消活动草稿'
          : 'Activity draft cancelled';
        setMessages((prev) => prev.map((m) =>
          m.id === blockedMsgId
            ? { ...m, resolutionState: 'resolved' as const, resolutionResult: resultText }
            : m
        ));
      }
      return;
    }
    if (blockedMsgId) {
      const kindLabelZh = entityKind === 'contact' ? '联系人' : entityKind === 'account' ? '客户' : '商机';
      const resultText = locale === 'zh-Hans'
        ? `已跳过${kindLabelZh}关联`
        : `Skipped ${entityKind} link`;
      setMessages((prev) => prev.map((m) =>
        m.id === blockedMsgId
          ? { ...m, resolutionState: 'resolved' as const, resolutionResult: resultText }
          : m
      ));
    }
    await skipResolutionAndDraftImpl(pendingIntent, entityKind);
  }, [user, locale, buildRuntimeDeps, bumpQueue]);

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
    // Queue intercept
    {
      const srcMsg = messagesRef.current.find((m) => m.id === messageId);
      const intentId = srcMsg?.queueIntentId;
      const q = queueRef.current;
      if (intentId && q && findIntentByMessageId(q, messageId)) {
        const after = await (await loadQR()).handleSearchOther(q, intentId, trimmed, buildRuntimeDeps());
        queueRef.current = after;
        bumpQueue();
        return;
      }
    }
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
  }, [user, buildRuntimeDeps, bumpQueue]);
  const updateFormCardStatus = useCallback((
    messageId: string,
    status: 'pending' | 'confirmed' | 'modified' | 'cancelled',
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

  // ===== IntentQueue: unified form-card save / cancel dispatchers =====
  // If the form-card belongs to an active queue intent, route to the runtime so the queue
  // advances correctly. Otherwise fall through to the legacy parked-intent resume paths
  // (kept for backward compatibility with persisted pre-refactor messages).
  const formCardSaved = useCallback(async (args: {
    messageId: string;
    type: 'activity' | 'opportunity' | 'account' | 'contact';
    recordId: string;
    recordName?: string;
    accountId?: string;
    accountName?: string;
    contactId?: string;
    contactName?: string;
    opportunityId?: string;
    opportunityName?: string;
  }): Promise<void> => {
    const msg = messagesRef.current.find((m) => m.id === args.messageId);
    const intentId = msg?.queueIntentId;
    const q = queueRef.current;
    if (intentId && q && findIntentByMessageId(q, args.messageId)) {
      const after = await (await loadQR()).handleSave(q, intentId, {
        recordId: args.recordId,
        recordName: args.recordName,
        type: args.type,
        accountId: args.accountId,
        accountName: args.accountName,
        contactId: args.contactId,
        contactName: args.contactName,
        opportunityId: args.opportunityId,
        opportunityName: args.opportunityName,
      }, buildRuntimeDeps());
      queueRef.current = after;
      bumpQueue();
      return;
    }
    // Legacy path: delegate to existing completeParkedIntentWith* based on entity type.
    if (args.type === 'contact') {
      await completeParkedIntentWithNewContact(args.recordId, args.recordName ?? '', args.accountId, args.accountName);
    } else if (args.type === 'account') {
      await completeParkedIntentWithNewAccount(args.recordId, args.recordName ?? '');
    } else if (args.type === 'opportunity') {
      await completeParkedIntentWithNewOpportunity(args.recordId, args.recordName ?? '', args.accountId, args.accountName);
    }
    // Activity: no legacy parked resume — saving an activity ends the flow naturally.
  }, [buildRuntimeDeps, bumpQueue, completeParkedIntentWithNewContact, completeParkedIntentWithNewAccount, completeParkedIntentWithNewOpportunity]);

  const formCardCancelled = useCallback(async (messageId: string): Promise<void> => {
    const msg = messagesRef.current.find((m) => m.id === messageId);
    const intentId = msg?.queueIntentId;
    const q = queueRef.current;
    if (intentId && q && findIntentByMessageId(q, messageId)) {
      const after = await (await loadQR()).handleCancel(q, intentId, buildRuntimeDeps());
      queueRef.current = after;
      bumpQueue();
      return;
    }
    // No legacy cancel path — just clear parked state if it was tied to this message.
    if (parkedIntentRef.current?.blockedMsgId === messageId) {
      parkedIntentRef.current = null;
    }
  }, [buildRuntimeDeps, bumpQueue]);

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
    continuePendingAction,
    createNewFromIntent,
    createEntityForResolution,
    skipResolutionAndDraft,
    refreshResolution,
    updateFormCardStatus,
    rollbackToMessage,
    toggleTaskGroupCollapsed,
    clarificationSuggestions,
    setClarificationSuggestions,
    clearClarificationSuggestions,
    executeClarificationAction,
    completeParkedIntentWithNewContact,
    completeParkedIntentWithNewAccount,
    completeParkedIntentWithNewOpportunity,
    formCardSaved,
    formCardCancelled,
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
    continuePendingAction,
    createNewFromIntent,
    createEntityForResolution,
    skipResolutionAndDraft,
    refreshResolution,
    updateFormCardStatus,
    toggleTaskGroupCollapsed,
    clarificationSuggestions,
    setClarificationSuggestions,
    clearClarificationSuggestions,
    executeClarificationAction,
    completeParkedIntentWithNewContact,
    completeParkedIntentWithNewAccount,
    completeParkedIntentWithNewOpportunity,
    formCardSaved,
    formCardCancelled,
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
