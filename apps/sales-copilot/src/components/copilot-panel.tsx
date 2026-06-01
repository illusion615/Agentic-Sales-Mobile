import { useRef, useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useDragControls, type PanInfo } from 'motion/react';
import { Sparkles, ArrowUp, SquarePen, X, ChevronDown, Copy, Volume2, VolumeX, Loader2, Square, Play, Pause, Paperclip, RotateCcw, Mic, Plus, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCopilot, type ChatMessage } from '@/contexts/copilot-context';
import { getLocale, getChatFontClass, getSelectedVoice, findMatchingSystemVoice, getLLMConfig, getVoiceSummaryEnabled, getCopilotDockLayout, getCopilotFullscreenDefault, type CopilotDockLayout, type Locale } from '@/lib/i18n';
import { DynamicDataRenderer, tryParseJson } from '@/components/dynamic-data-renderer';
import { FormCard } from '@/components/form-card';
import { BatchFormCard } from '@/components/batch-form-card';
import { MatchSelectionCard, buildMatchReasonText } from '@/components/match-selection-card';
import { MarkdownContent } from '@/components/markdown-content';
import { RecordListCard } from '@/components/record-list-card';
import { AdditionalIntentsCard } from '@/components/additional-intents-card';
import { PipelineViewer } from '@/components/frame-viewer';
import { TaskAnnounceBubble } from '@/components/task-announce-bubble';
import { toast } from 'sonner';
import { useActionDock } from '@/contexts/action-dock-context';
import { useIsMobile } from '@/hooks/use-mobile';



export function CopilotPanel() {
  const navigate = useNavigate();
  const {
    isOpen,
    isFullScreen,
    openPanel,
    closePanel,
    isConnected,
    isConnecting,
    messages,
    isSending,
    sendMessage,
    inputValue,
    setInputValue,

    startNewConversation,
    continuePendingAction,
    createEntityForResolution,
    skipResolutionAndDraft,
    refreshResolution,
    pageContext,
    setPageContext,
    clarificationSuggestions,
    executeClarificationAction,
    rollbackToMessage,
    toggleTaskGroupCollapsed,
  } = useCopilot();

  const { chips: dockChips, slot: dockSlot } = useActionDock();
  const isMobile = useIsMobile();

  // Dock layout: float (default bottom sheet) | left | right (side panel on widescreen)
  const [dockLayout, setDockLayout] = useState<CopilotDockLayout>(() => getCopilotDockLayout());
  useEffect(() => {
    const handler = (e: Event) => setDockLayout((e as CustomEvent<CopilotDockLayout>).detail);
    window.addEventListener('copilot-dock-layout-changed', handler);
    return () => window.removeEventListener('copilot-dock-layout-changed', handler);
  }, []);
  // On mobile always fall back to float regardless of setting.
  const effectiveLayout: CopilotDockLayout = isMobile ? 'float' : dockLayout;
  const isSideDocked = effectiveLayout === 'left' || effectiveLayout === 'right';

  // Side-docked mode: always keep the panel open (no collapse).
  useEffect(() => {
    if (isSideDocked && !isOpen) openPanel(false);
  }, [isSideDocked, isOpen, openPanel]);

  // Render counter — only warn on very rapid renders (>100 in 2 seconds)
  const renderCountRef = useRef(0);
  const renderWindowRef = useRef(Date.now());
  renderCountRef.current++;
  if (Date.now() - renderWindowRef.current > 2000) {
    renderCountRef.current = 0;
    renderWindowRef.current = Date.now();
  }
  useEffect(() => {
    if (renderCountRef.current > 100) {
      console.warn('[LOOP WARNING] CopilotPanel rapid renders in 2s window:', renderCountRef.current);
    }
  });

  const locale: Locale = getLocale();
  
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  
  // TTS per-message playback
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const playedMessageIdsRef = useRef<Set<string>>(new Set());

  const stopSpeaking = useCallback(() => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setSpeakingMessageId(null);
  }, []);

  const speakMessage = useCallback((messageId: string, text: string) => {
    // Toggle off if already playing this message
    if (speakingMessageId === messageId) {
      stopSpeaking();
      return;
    }
    stopSpeaking();
    const plain = text
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/#{1,6}\s+/g, '')
      .replace(/`[^`]+`/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .trim();
    if (!plain || !('speechSynthesis' in window)) return;
    const utt = new SpeechSynthesisUtterance(plain);
    utt.lang = locale === 'zh-Hans' ? 'zh-CN' : 'en-US';
    const voice = findMatchingSystemVoice(getSelectedVoice(), locale);
    if (voice) utt.voice = voice;
    utt.rate = 1.0;
    utt.pitch = 1.0;
    utt.onend = () => setSpeakingMessageId(null);
    utt.onerror = () => setSpeakingMessageId(null);
    setSpeakingMessageId(messageId);
    playedMessageIdsRef.current.add(messageId);
    window.speechSynthesis.speak(utt);
  }, [speakingMessageId, locale, stopSpeaking]);

  const panelRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  // IME composition tracking (belt-and-suspenders for cross-browser reliability)
  const isComposingRef = useRef(false);
  
  const [playingInlineId, setPlayingInlineId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Array<{ file: File; preview: string; type: 'image' | 'file' }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  // "+" attachment popover (collapses low-frequency actions away from the input)
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  
  // Context chips that user can dismiss
  const [dismissedContexts, setDismissedContexts] = useState<Set<string>>(new Set());

  // Frame shadow viewer overlay (\u65b9\u6848 3 \u00b7 Phase 1)
  const [frameViewerOpen, setFrameViewerOpen] = useState(false);
  
  // Clear dismissed contexts when page context changes
  useEffect(() => {
    if (pageContext?.currentPage) {
      setDismissedContexts(new Set());
    }
  }, [pageContext?.currentPage]);
  
  // Handle dismissing a context chip
  const handleDismissContext = useCallback(() => {
    if (pageContext?.currentPage) {
      setDismissedContexts((prev) => new Set([...prev, pageContext.currentPage]));
      // Clear the page context so agent no longer uses it
      setPageContext(null);
    }
  }, [pageContext?.currentPage, setPageContext]);

  // Handle file selection
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file: File) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setAttachments((prev) => [...prev, {
            file,
            preview: event.target?.result as string,
            type: 'image' as const
          }]);
        };
        reader.readAsDataURL(file);
      } else {
        setAttachments((prev) => [...prev, {
          file,
          preview: '',
          type: 'file' as const
        }]);
      }
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Handle remove attachment
  const handleRemoveAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);
  
  // Check if context should be shown
  const shouldShowContext = pageContext && 
    pageContext.currentPage && 
    !dismissedContexts.has(pageContext.currentPage) &&
    pageContext.currentPage !== 'Home';

  // Scroll to bottom when messages change.
  // Use requestAnimationFrame to ensure the DOM has updated before scrolling,
  // preventing overshoot when the queue pushes messages rapidly.
  useEffect(() => {
    requestAnimationFrame(() => {
      const container = messagesContainerRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    });
  }, [messages.length]);

  // Focus input and scroll to bottom when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        const container = messagesContainerRef.current;
        if (container) container.scrollTop = container.scrollHeight;
      }, 300);
    }
  }, [isOpen]);

  // Auto-grow the input textarea up to 4 lines, then scroll inside.
  const autoResizeInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    // Reset height to measure the true scroll height, then clamp to maxHeight.
    el.style.height = 'auto';
    const cs = window.getComputedStyle(el);
    const lineHeight = parseFloat(cs.lineHeight) || 20;
    const padTop = parseFloat(cs.paddingTop) || 0;
    const padBottom = parseFloat(cs.paddingBottom) || 0;
    const maxHeight = lineHeight * 4 + padTop + padBottom;
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, []);

  // Re-measure whenever the value changes (typing, dictation, programmatic set).
  useEffect(() => {
    autoResizeInput();
  }, [inputValue, autoResizeInput]);

  // Handle enter key - IME-safe (skip Enter during IME composition)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Native IME composition signal (isComposing) or keyCode 229 (IME processing)
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    // Component-level flag (set via onCompositionStart/End for browsers that don't set isComposing reliably)
    if (isComposingRef.current) return;
    if (e.key === 'Enter' && !e.shiftKey && inputValue.trim()) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  // IME composition handlers
  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };

  const handleCompositionEnd = () => {
    isComposingRef.current = false;
  };

  // Handle input focus
  // When fullscreen-by-default is on (mobile): only fullscreen ↔ collapsed, no mid state.
  // Otherwise: open to 78vh, then fullscreen on second tap.
  const handleInputFocus = () => {
    const fullscreenDefault = isMobile && getCopilotFullscreenDefault();
    if (!isOpen) {
      openPanel(fullscreenDefault);
    } else if (fullscreenDefault && !isFullScreen) {
      // Mid state shouldn't exist; jump to fullscreen
      openPanel(true);
    } else if (isMobile && !isFullScreen) {
      openPanel(true);
    }
  };

  // Handle close (collapse panel completely back to dock)
  const handleClose = () => {
    closePanel();
  };

  // ─── Press-to-talk voice input (Web Speech API) ───────────────────────────
  // Hold the mic to dictate (release to stop); a quick tap toggles a hands-free
  // continuous listen mode (tap again to stop). Also the iframe-mic-permission probe.
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const baseTextRef = useRef('');
  // Mic gesture state machine: idle | hold (press-and-hold) | toggle (tap-to-toggle)
  const listenModeRef = useRef<'idle' | 'hold' | 'toggle'>('idle');
  const pressStartRef = useRef(0);
  const suppressNextUpRef = useRef(false);
  const speechSupported =
    typeof window !== 'undefined' &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* noop */
    }
  }, []);

  const startListening = useCallback(() => {
    if (isListening) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error(
        locale === 'zh-Hans'
          ? '当前浏览器不支持语音识别'
          : 'Speech recognition not supported in this browser'
      );
      return;
    }

    const recognition = new SR();
    recognition.lang = locale === 'zh-Hans' ? 'zh-CN' : 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

    baseTextRef.current = inputValue ? inputValue.trimEnd() + ' ' : '';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInputValue(baseTextRef.current + transcript);
    };

    recognition.onerror = (event: any) => {
      setIsListening(false);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        toast.error(
          locale === 'zh-Hans'
            ? '麦克风权限被拒绝（可能是平台 iframe 未授权）'
            : 'Microphone permission denied (host iframe may not allow it)'
        );
      } else if (event.error === 'no-speech') {
        // silent — user simply didn't say anything
      } else {
        toast.error(
          locale === 'zh-Hans'
            ? `语音识别出错：${event.error}`
            : `Speech recognition error: ${event.error}`
        );
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      listenModeRef.current = 'idle';
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      setIsListening(false);
      toast.error(
        locale === 'zh-Hans'
          ? '无法启动语音识别'
          : 'Failed to start speech recognition'
      );
    }
  }, [isListening, inputValue, locale, setInputValue]);

  // Stop recognition if the component unmounts mid-recording.
  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        /* noop */
      }
    };
  }, []);

  // Mic gesture handlers: distinguish press-and-hold from tap-to-toggle by duration.
  const TAP_THRESHOLD_MS = 300;
  const handleMicPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      // If already in hands-free toggle mode, a tap stops it.
      if (listenModeRef.current === 'toggle') {
        stopListening();
        listenModeRef.current = 'idle';
        suppressNextUpRef.current = true;
        return;
      }
      pressStartRef.current = Date.now();
      listenModeRef.current = 'hold';
      startListening();
    },
    [startListening, stopListening]
  );

  const handleMicPointerUp = useCallback(() => {
    if (suppressNextUpRef.current) {
      suppressNextUpRef.current = false;
      return;
    }
    if (listenModeRef.current !== 'hold') return;
    const duration = Date.now() - pressStartRef.current;
    if (duration < TAP_THRESHOLD_MS) {
      // Quick tap → switch to hands-free continuous listening (keep recording).
      listenModeRef.current = 'toggle';
    } else {
      // Held → press-to-talk release stops dictation.
      stopListening();
      listenModeRef.current = 'idle';
    }
  }, [stopListening]);

  const handleMicPointerLeave = useCallback(() => {
    // Only the press-and-hold gesture cancels on leave; toggle mode persists.
    if (listenModeRef.current === 'hold') {
      stopListening();
      listenModeRef.current = 'idle';
    }
  }, [stopListening]);



  // Get quick actions based on conversation or clarification suggestions
  const getQuickActions = useCallback(() => {
    // If there are clarification suggestions, show them as priority
    if (clarificationSuggestions.length > 0) {
      return clarificationSuggestions;
    }
    
    if (messages.length === 0) {
      return [
        { text: locale === 'zh-Hans' ? '今日待办' : "Today's tasks", query: locale === 'zh-Hans' ? '今天有哪些待办事项？' : 'What are my tasks for today?' },
        { text: locale === 'zh-Hans' ? '商机状态' : 'Pipeline status', query: locale === 'zh-Hans' ? '我的商机状态如何？' : 'What is my pipeline status?' },
        { text: locale === 'zh-Hans' ? '客户跟进' : 'Follow-ups', query: locale === 'zh-Hans' ? '哪些客户需要跟进？' : 'Which customers need follow-up?' },
      ];
    }
    return [
      { text: locale === 'zh-Hans' ? '更多详情' : 'More details', query: locale === 'zh-Hans' ? '告诉我更多详情' : 'Tell me more details' },
      { text: locale === 'zh-Hans' ? '今日待办' : "Today's tasks", query: locale === 'zh-Hans' ? '今天有哪些待办事项？' : 'What are my tasks for today?' },
      { text: locale === 'zh-Hans' ? '帮助' : 'Help', query: locale === 'zh-Hans' ? '你能帮我做什么？' : 'What can you help me with?' },
    ];
  }, [messages, locale, clarificationSuggestions]);

  const quickActions = getQuickActions();
  const hasClarificationSuggestions = clarificationSuggestions.length > 0;

  // For overlay mode, the AnimatePresence handles the open/close animation,
  // so we don't return null here - it's handled in the overlay render section below

  const renderMessages = () => {

    return (
    <div ref={messagesContainerRef} className="flex-1 overflow-y-auto scrollbar-hide px-3 py-3 min-h-0">
      {messages.length === 0 ? (
        <div className="flex flex-col h-full justify-center px-4">
          <p className="text-sm font-medium text-foreground mb-4">
            {locale === 'zh-Hans' ? '我可以帮助您：' : 'I can help you with:'}
          </p>
          <ul className="space-y-3">
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs text-primary font-medium">1</span>
              </span>
              <span className="text-sm text-muted-foreground">
                {locale === 'zh-Hans' ? '查询客户信息和商机状态' : 'Query customer info and opportunity status'}
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs text-primary font-medium">2</span>
              </span>
              <span className="text-sm text-muted-foreground">
                {locale === 'zh-Hans' ? '获取今日日程和待办事项' : 'Get today\'s schedule and to-do items'}
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs text-primary font-medium">3</span>
              </span>
              <span className="text-sm text-muted-foreground">
                {locale === 'zh-Hans' ? '分析销售趋势和业绩数据' : 'Analyze sales trends and performance data'}
              </span>
            </li>
          </ul>
          <p className="text-xs text-muted-foreground mt-6 text-center">
            {locale === 'zh-Hans' ? '输入问题或按住麦克风开始对话' : 'Type a question or hold the mic to start'}
          </p>
        </div>
      ) : (
        <>

          {messages.map((message: ChatMessage) => {
            // Phase D: hide substep messages when their owning task group is collapsed.
            if (message.taskRole === 'substep' && message.collapsed) return null;
            return (
            <div key={message.id} id={`message-${message.id}`} className={cn(
              'mb-3',
              message.type === 'user' ? 'flex justify-end' : '',
              // Indent sub-content under a task header for visual hierarchy.
              message.queueId && message.taskRole !== 'announce' && message.taskRole !== 'summary' && 'pl-3 border-l-2 border-primary/10',
            )}>
              {/* Phase B: Task overview — "识别到 N 个意图：A、B、C" (plain text, no bubble) */}
              {message.taskRole === 'overview' && message.taskOverview && (
                <div className="text-sm text-muted-foreground px-1">
                  {message.content}
                </div>
              )}

              {/* Phase B: Per-task announce bubble (Phase D: now toggleable) */}
              {message.taskRole === 'announce' && message.taskAnnounce && (
                <TaskAnnounceBubble
                  index={message.taskAnnounce.index}
                  total={message.taskAnnounce.total}
                  label={message.taskAnnounce.label}
                  locale={locale === 'zh-Hans' ? 'zh-Hans' : 'en'}
                  collapsed={message.collapsed}
                  onToggle={message.taskGroupId ? () => toggleTaskGroupCollapsed(message.taskGroupId!) : undefined}
                />
              )}

              {/* User Message */}
              {message.type === 'user' && (
                <div className="max-w-[85%] group">
                  <div
                    className={cn('px-3 py-2 rounded-2xl rounded-br-md', getChatFontClass())}
                    style={{
                      background: 'rgba(255, 122, 0, 0.08)',
                      border: '2px solid rgba(255, 122, 0, 0.4)',
                    }}
                  >
                    {message.content}
                  </div>
                  <div className="flex items-center justify-end gap-1.5 mt-1">
                    <button
                      onClick={() => {
                        // Rollback conversation to this message
                        rollbackToMessage(message.id);
                        // Put content in input
                        setInputValue(message.content);
                        // Focus input
                        inputRef.current?.focus();
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-primary/10 hover:text-primary transition-all"
                      aria-label={locale === 'zh-Hans' ? '重试' : 'Retry'}
                    >
                      <RotateCcw className="w-3 h-3 text-muted-foreground hover:text-primary" />
                    </button>
                    <p className="text-[9px] text-muted-foreground">
                      {new Date(message.timestamp).toLocaleTimeString(locale === 'zh-Hans' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              )}
              
              {/* Batch Form Card Message */}
              {message.type === 'batch-form-card' && message.batchFormCards && !message.isStreaming && (
                <div className="max-w-full">
                  {/* Show thinking steps if present */}
                  {message.thinkingSteps && message.thinkingSteps.length > 0 && (
                    <div className="mb-2 text-xs space-y-1 text-muted-foreground">
                      {message.thinkingSteps.map((step, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-primary">✓</span>
                          <span>{step.label}</span>
                          {step.detail && <span>· {step.detail}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {message.content && (
                    <p className="text-sm text-foreground mb-2">{message.content}</p>
                  )}
                  <BatchFormCard 
                    messageId={message.id} 
                    batchFormCards={message.batchFormCards}
                  />
                </div>
              )}

              {/* Match Selection Card Message */}
              {message.type === 'match-selection' && message.matchSelection && (
                <div className="max-w-full">
                  {/* Reason text — hidden once resolved to keep the conversation compact. */}
                  {message.resolutionState !== 'resolved' && (() => {
                    const reason = buildMatchReasonText({
                      entityType: message.matchSelection.entityType,
                      query: message.matchSelection.query,
                      pendingFn: message.matchSelection.pendingIntent?.function,
                      locale: locale === 'zh-Hans' ? 'zh-Hans' : 'en-US',
                    });
                    if (!reason) return null;
                    return (
                      <p className={cn('text-foreground mb-2 leading-relaxed', getChatFontClass())}>
                        {reason}
                      </p>
                    );
                  })()}
                  {message.content && (
                    <p className="sr-only">{message.content}</p>
                  )}
                  <MatchSelectionCard
                    messageId={message.id}
                    matchSelection={message.matchSelection}
                    resolved={message.resolutionState === 'resolved'}
                    resolutionResult={message.resolutionResult}
                    onSelect={(record) => {
                      toast.success(locale === 'zh-Hans' 
                        ? `已选择: ${record.name}` 
                        : `Selected: ${record.name}`);
                    }}
                    onContinueWithSelection={(record, pendingIntent) => {
                      continuePendingAction(
                        record,
                        pendingIntent,
                        message.matchSelection?.entityType || 'account',
                        message.id
                      );
                    }}
                    onCreateEntity={(pendingIntent, entityKind, queryName) => {
                      createEntityForResolution(pendingIntent, entityKind, queryName, message.id);
                    }}
                    onSkip={(pendingIntent, entityKind) => {
                      skipResolutionAndDraft(pendingIntent, entityKind, message.id);
                    }}
                    onSearchOther={(newQuery, entityType, pendingIntent) => {
                      refreshResolution(message.id, newQuery, entityType, pendingIntent);
                    }}
                  />
                </div>
              )}

              {/* Awaiting-clarification: adapt pendingResolutions[0] → matchSelection-shape and render via MatchSelectionCard */}
              {message.type === 'awaiting-clarification' && message.awaitingClarification && !message.isThinking && !message.isStreaming && (() => {
                const pr = message.awaitingClarification.pendingResolutions[0];
                if (!pr) return null;
                const entityType: 'account' | 'contact' | 'opportunity' = pr.kind;
                const adapted = {
                  entityType,
                  query: pr.query,
                  // Awaiting-clarification path = 0 high-confidence matches by definition
                  matches: [],
                  // Surface the candidates the agent stashed (top-3 from fuzzyMatch, all <70 by construction) as low-confidence
                  lowConfidenceMatches: pr.candidates.map((c) => ({
                    id: c.id,
                    name: c.name,
                    subtitle: c.subtitle,
                    score: c.score,
                    matchType: 'fuzzy' as const,
                  })),
                  confidence: 'none' as const,
                  pendingIntent: {
                    function: message.awaitingClarification.originalIntent.function,
                    arguments: message.awaitingClarification.originalIntent.arguments,
                    // G-1: forward inferred siblings so the chain-create resume can replay them
                    additionalActions: message.awaitingClarification.originalIntent.additionalActions,
                  },
                };
                return (
                  <div className="max-w-full">
                    {/* Reason text \u2014 moved out of the card. Falls back to the
                        agent's own content (e.g. clarification question) when
                        the entity/function info isn't enough to derive one. */}
                    {(() => {
                      const reason = buildMatchReasonText({
                        entityType,
                        query: pr.query,
                        pendingFn: message.awaitingClarification?.originalIntent.function,
                        locale: locale === 'zh-Hans' ? 'zh-Hans' : 'en-US',
                      }) || message.content;
                      if (!reason) return null;
                      return (
                        <p className={cn('text-foreground mb-2 leading-relaxed', getChatFontClass())}>
                          {reason}
                        </p>
                      );
                    })()}
                    <MatchSelectionCard
                      messageId={message.id}
                      matchSelection={adapted}
                      resolved={message.resolutionState === 'resolved'}
                      resolutionResult={message.resolutionResult}
                      onContinueWithSelection={(record, pendingIntent) => {
                        continuePendingAction(record, pendingIntent, entityType, message.id);
                      }}
                      onCreateEntity={(pendingIntent, entityKind, queryName) => {
                        createEntityForResolution(pendingIntent, entityKind, queryName, message.id);
                      }}
                      onSkip={(pendingIntent, entityKind) => {
                        skipResolutionAndDraft(pendingIntent, entityKind, message.id);
                      }}
                      onSearchOther={(newQuery, et, pendingIntent) => {
                        refreshResolution(message.id, newQuery, et, pendingIntent);
                      }}
                    />
                  </div>
                );
              })()}

              {/* Agent Message (also renders awaiting-clarification thinking/streaming as generic text) */}
              {(message.type === 'agent' || (message.type === 'awaiting-clarification' && (message.isThinking || message.isStreaming || !message.awaitingClarification))) && message.taskRole !== 'overview' && message.taskRole !== 'announce' && (() => {
                // Thinking state - show progress steps
                if (message.isThinking && message.thinkingSteps) {
                  return (
                    <div className="flex flex-col gap-2 max-w-[85%] py-2">
                      {/* Thinking Steps */}
                      <div className="space-y-1">
                        {message.thinkingSteps.filter((step) => step.status !== 'pending').map((step, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs">
                            {step.status === 'completed' ? (
                              <span className="text-primary">✓</span>
                            ) : step.status === 'active' ? (
                              <span className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                            ) : null}
                            <span className={cn(
                              step.status === 'completed' && 'text-muted-foreground',
                              step.status === 'active' && 'text-foreground font-medium'
                            )}>
                              {step.label}
                            </span>
                            {step.detail && (
                              <span className="text-muted-foreground">· {step.detail}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                
                // Streaming state - show partial content with cursor
                if (message.isStreaming) {
                  return (
                    <div>
                      {/* Show completed thinking steps in collapsed form */}
                      {message.thinkingSteps && message.thinkingSteps.length > 0 && (
                        <div className="mb-2 text-xs space-y-1 text-muted-foreground">
                          {message.thinkingSteps.map((step, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <span className="text-primary">✓</span>
                              <span>{step.label}</span>
                              {step.detail && <span>· {step.detail}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className={cn('text-foreground', getChatFontClass())}>
                        <MarkdownContent content={message.content || ''} />
                        <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5 align-middle" />
                      </div>
                    </div>
                  );
                }
                
                // Completed response
                const { isJson, isEmpty } = tryParseJson(message.content);
                return (
                  <div>
                    {/* Show completed thinking steps in collapsed form */}
                    {message.thinkingSteps && message.thinkingSteps.length > 0 && (
                      <div className="mb-2 text-xs space-y-1 text-muted-foreground">
                        {message.thinkingSteps.map((step, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="text-primary">✓</span>
                            <span>{step.label}</span>
                            {step.detail && <span>· {step.detail}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {isJson && isEmpty ? (
                      <div className={cn('text-foreground', getChatFontClass())}>
                        <p className="text-sm text-muted-foreground">
                          {locale === 'zh-Hans' 
                            ? '抱歉，未能找到您请求的数据。请尝试换一种方式提问或检查您的查询条件。'
                            : "Sorry, I couldn't find the data you requested. Please try rephrasing your question or check your search criteria."}
                        </p>
                      </div>
                    ) : isJson ? (
                      <DynamicDataRenderer content={message.content} />
                    ) : (
                      <div className={cn('text-foreground mb-1', getChatFontClass())}>
                        <MarkdownContent content={message.content} />
                      </div>
                    )}
                    
                    {/* Additional Intents (multi-intent support) */}
                    {message.additionalIntents && message.additionalIntents.forms.length > 0 && (
                      <AdditionalIntentsCard
                        messageId={message.id}
                        additionalIntents={message.additionalIntents}
                      />
                    )}
                    {/* Action bar: timestamp + copy + play — right-aligned */}
                    {message.content && !isJson && !message.isThinking && !message.isStreaming && (
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-[9px] text-muted-foreground">
                          {new Date(message.timestamp).toLocaleTimeString(locale === 'zh-Hans' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(message.content);
                            }}
                            className="p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                            aria-label="Copy"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => speakMessage(message.id, message.content)}
                            className="p-1 rounded hover:bg-muted/50 transition-colors inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                            aria-label={speakingMessageId === message.id ? 'Stop' : 'Play'}
                          >
                            {speakingMessageId === message.id ? (
                              <>
                                <span className="flex items-end gap-0.5 h-3">
                                  <span className="w-0.5 bg-primary rounded-full animate-pulse" style={{ height: '60%' }} />
                                  <span className="w-0.5 bg-primary rounded-full animate-pulse" style={{ height: '100%', animationDelay: '0.15s' }} />
                                  <span className="w-0.5 bg-primary rounded-full animate-pulse" style={{ height: '40%', animationDelay: '0.3s' }} />
                                </span>
                                <span className="text-[10px] text-primary">Stop</span>
                              </>
                            ) : (
                              <Volume2 className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              
              {/* Form Card Message */}
              {message.type === 'form-card' && message.formCard && !message.isStreaming && (
                <div className="max-w-full">
                  {/* Show thinking steps if present */}
                  {message.thinkingSteps && message.thinkingSteps.length > 0 && (
                    <div className="mb-2 text-xs space-y-1 text-muted-foreground">
                      {message.thinkingSteps.map((step, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-primary">✓</span>
                          <span>{step.label}</span>
                          {step.detail && <span>· {step.detail}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {message.content && (
                    <p className="text-sm text-foreground mb-2">{message.content}</p>
                  )}
                  <FormCard 
                    messageId={message.id} 
                    formCard={message.formCard}
                  />
                </div>
              )}
              
              {/* Record List Card (query results) */}
              {message.recordList && !message.isStreaming && (
                <div className="max-w-full mt-3">
                  <RecordListCard
                    type={message.recordList.type}
                    records={message.recordList.records.map((r) => ({ ...r, type: message.recordList!.type }))}
                    title={message.recordList.title}
                  />
                </div>
              )}
            </div>
            );
          })}
          {/* Thinking dots removed - now shown inline in thinking message */}
        </>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
  };

  // Pills + attachment preview only (no input bar). Used above the bottom-anchored input wrapper.
  const renderInputExtras = () => (
    <div className="shrink-0">
      {/* Quick Action Pills - highlighted when showing clarification suggestions */}
      <div className={cn(
        'px-3 pb-2 pt-1 border-t',
        hasClarificationSuggestions 
          ? 'border-primary/30 bg-primary/5' 
          : 'border-border/20'
      )}>
        {hasClarificationSuggestions && (
          <p className="text-xs text-primary mb-2 font-medium">
            {locale === 'zh-Hans' ? '请选择一个操作：' : 'Please choose an option:'}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action: { text: string; query: string; action?: { function: string; arguments: Record<string, unknown> } }, idx: number) => (
            <button
              key={idx}
              onClick={() => {
                // If action has function info, execute directly without LLM re-analysis
                if (action.action) {
                  executeClarificationAction(
                    action.action.function,
                    action.action.arguments,
                    action.text
                  );
                } else {
                  // Regular query - send as message
                  sendMessage(action.query);
                }
              }}
              disabled={isSending}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium',
                'transition-all active:scale-95',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                hasClarificationSuggestions
                  ? 'bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 hover:border-primary/50'
                  : 'bg-muted/50 hover:bg-muted text-foreground border border-border/50 hover:border-border'
              )}
            >
              {action.text}
            </button>
          ))}
        </div>
      </div>

      {/* Attachment Preview */}
      {attachments.length > 0 && (
        <div className="px-3 pb-2">
          <div className="flex gap-2 flex-wrap">
            {attachments.map((attachment, index: number) => (
              <div key={index} className="relative group">
                {attachment.type === 'image' ? (
                  <div className="w-16 h-16 rounded-lg overflow-hidden border border-border/50">
                    <img
                      src={attachment.preview}
                      alt="Attachment"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-lg border border-border/50 bg-muted/50 flex flex-col items-center justify-center">
                    <Paperclip className="w-5 h-5 text-muted-foreground" />
                    <span className="text-[8px] text-muted-foreground mt-1 px-1 truncate max-w-full">
                      {attachment.file.name.length > 8 ? attachment.file.name.slice(0, 8) + '...' : attachment.file.name}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => handleRemoveAttachment(index)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Bottom-anchored input wrapper. Same wrapper used in collapsed and expanded states
  // so the input bar's position and width stay locked.
  const renderInputWrapper = () => (
    <div className="mx-auto w-full max-w-md px-3 pt-2 pb-3 shrink-0">
      {renderInputBar()}
    </div>
  );

  // The neon-glow input pill — must be visually identical in collapsed dock and expanded panel.
  // Don't inline this anywhere; both states call it so style/size stay locked together.
  const renderInputBar = () => (
    <div className="relative p-[2px] rounded-2xl">
      <div className="absolute inset-0 rounded-2xl neon-glow-blur" />
      <div className="absolute inset-0 rounded-2xl neon-glow" />

      <div className="relative flex items-end gap-2 p-2 rounded-[14px] bg-background" style={{ backgroundColor: 'var(--background)' }}>
        {/* Hidden inputs: file/photo picker and camera capture */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* "+" Attachment menu — collapses low-frequency actions */}
        <div className="relative shrink-0">
          {showAttachMenu && (
            <>
              {/* Click-away overlay */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowAttachMenu(false)}
              />
              <div className="absolute bottom-full left-0 mb-2 z-50 min-w-[160px] glass-card rounded-xl p-1.5 shadow-lg">
                <button
                  type="button"
                  onClick={() => { setShowAttachMenu(false); cameraInputRef.current?.click(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-muted/60 transition-colors"
                >
                  <Camera className="w-4 h-4 text-muted-foreground" />
                  {locale === 'zh-Hans' ? '拍照' : 'Take photo'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAttachMenu(false); fileInputRef.current?.click(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-muted/60 transition-colors"
                >
                  <Paperclip className="w-4 h-4 text-muted-foreground" />
                  {locale === 'zh-Hans' ? '照片或文件' : 'Photo or file'}
                </button>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowAttachMenu((v) => !v)}
            className={cn(
              'w-10 h-10 flex items-center justify-center rounded-full transition-colors',
              showAttachMenu
                ? 'bg-muted/60 text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
            aria-label={locale === 'zh-Hans' ? '添加附件' : 'Add attachment'}
            title={locale === 'zh-Hans' ? '添加附件' : 'Add attachment'}
          >
            <Plus className={cn('w-5 h-5 transition-transform', showAttachMenu && 'rotate-45')} />
          </button>
        </div>
        {/* Input Field — auto-grows up to 4 lines, then scrolls internally */}
        <textarea
          ref={inputRef}
          rows={1}
          value={inputValue}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onFocus={handleInputFocus}
          placeholder={locale === 'zh-Hans' ? '向 Copilot 提问...' : 'Ask Copilot...'}
          className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground resize-none leading-5 py-2 self-end"
        />

        {/* Right action — mutually exclusive: Stop / Send / Mic */}
        {isSending ? (
          <button
            onClick={() => {}}
            className="w-10 h-10 rounded-full flex items-center justify-center text-red-500 hover:bg-muted/50 transition-colors shrink-0"
            aria-label={locale === 'zh-Hans' ? '停止' : 'Stop'}
            title={locale === 'zh-Hans' ? '停止' : 'Stop'}
          >
            <Square className="w-4 h-4 fill-current" />
          </button>
        ) : !isListening && inputValue.trim() ? (
          <button
            onClick={() => inputValue.trim() && sendMessage(inputValue)}
            className="w-10 h-10 flex items-center justify-center transition-all text-primary hover:brightness-125 shrink-0"
            aria-label={locale === 'zh-Hans' ? '发送' : 'Send'}
            title={locale === 'zh-Hans' ? '发送' : 'Send'}
          >
            <ArrowUp className="w-5 h-5" />
          </button>
        ) : speechSupported ? (
          <button
            type="button"
            onPointerDown={handleMicPointerDown}
            onPointerUp={handleMicPointerUp}
            onPointerLeave={handleMicPointerLeave}
            className={cn(
              'w-10 h-10 flex items-center justify-center rounded-full transition-colors touch-none select-none shrink-0',
              isListening
                ? 'bg-red-500/15 text-red-500 animate-pulse'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
            style={{ touchAction: 'none' }}
            aria-label={
              isListening
                ? (locale === 'zh-Hans' ? '点击停止聆听' : 'Tap to stop listening')
                : (locale === 'zh-Hans' ? '按住说话 · 轻点持续聆听' : 'Hold to talk · tap to keep listening')
            }
            title={
              isListening
                ? (locale === 'zh-Hans' ? '点击停止聆听' : 'Tap to stop listening')
                : (locale === 'zh-Hans' ? '按住说话 · 轻点持续聆听' : 'Hold to talk · tap to keep listening')
            }
          >
            <Mic className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={() => {}}
            disabled
            className="w-10 h-10 flex items-center justify-center text-muted-foreground cursor-not-allowed shrink-0"
            aria-label={locale === 'zh-Hans' ? '发送' : 'Send'}
            title={locale === 'zh-Hans' ? '发送' : 'Send'}
          >
            <ArrowUp className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );

  // Expanded panel overlay mode
  // ─── Unified ActionDock: single container morphs from collapsed dock to expanded panel ───
    const panelChrome = (
      <div className="shrink-0">
        {/* Drag handle — hidden in full-screen */}
        {/* Drag handle — hidden in side-docked mode */}
        {!isFullScreen && !isSideDocked && (
          <div
            className="flex justify-center py-2 cursor-grab active:cursor-grabbing touch-none"
            onPointerDown={(e: React.PointerEvent) => dragControls.start(e)}
          >
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
        )}

        {/* Header */}
        <div className={cn(
          'flex items-center justify-between px-4 py-2 border-b border-border/30',
          isFullScreen && 'safe-area-top pt-3'
        )}>
          {/* Collapse button — hidden in side-docked mode (always open) */}
          {isSideDocked ? (
            <div className="w-8" />
          ) : (
          <button
            onClick={isFullScreen ? () => openPanel(false) : handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:brightness-125 active:brightness-75"
            aria-label={
              locale === 'zh-Hans'
                ? (isFullScreen ? '返回面板' : '收起')
                : (isFullScreen ? 'Back to panel' : 'Collapse')
            }
          >
            <ChevronDown className="w-4 h-4 text-foreground" />
          </button>
          )}
          <div className="flex items-center gap-2">
            {isFullScreen && <Sparkles className="w-5 h-5 text-primary" />}
            <span className="text-sm font-medium text-foreground">Sales Copilot</span>
            {isConnected && <span className="w-2 h-2 bg-green-500 rounded-full" />}
            {isConnecting && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            <button
              type="button"
              onClick={() => setFrameViewerOpen(true)}
              className="ml-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 bg-orange-100 hover:bg-orange-200 transition-colors"
              title={locale === 'zh-Hans' ? 'Frame 影子模式 · 销售专家思考记录' : 'Frame shadow mode · sales-coach reasoning log'}
              aria-label="Frame shadow log"
            >
              F
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => startNewConversation()}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:brightness-125 active:brightness-75"
              aria-label={locale === 'zh-Hans' ? '新会话' : 'New session'}
            >
              <SquarePen className="w-4 h-4 text-foreground" />
            </button>
          </div>
        </div>

        {/* Context Chips */}
        {shouldShowContext && (
          <div className="px-4 py-2 border-b border-border/20 bg-muted/30">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">
                {locale === 'zh-Hans' ? '当前上下文:' : 'Context:'}
              </span>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20">
                <span className="text-xs font-medium text-primary">
                  {pageContext.currentPage}
                </span>
                {((pageContext.pageData as Record<string, unknown>)?.accountName as string | undefined) && (
                  <span className="text-xs text-primary/80">
                    {' · '}{(pageContext.pageData as Record<string, unknown>).accountName as string}
                  </span>
                )}
                {((pageContext.pageData as Record<string, unknown>)?.contactName as string | undefined) && (
                  <span className="text-xs text-primary/80">
                    {' · '}{(pageContext.pageData as Record<string, unknown>).contactName as string}
                  </span>
                )}
                {((pageContext.pageData as Record<string, unknown>)?.opportunityName as string | undefined) && (
                  <span className="text-xs text-primary/80">
                    {' · '}{(pageContext.pageData as Record<string, unknown>).opportunityName as string}
                  </span>
                )}
                {((pageContext.pageData as Record<string, unknown>)?.activitySubject as string | undefined) && (
                  <span className="text-xs text-primary/80">
                    {' · '}{(pageContext.pageData as Record<string, unknown>).activitySubject as string}
                  </span>
                )}
                <button
                  onClick={handleDismissContext}
                  className="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full hover:bg-primary/20 transition-colors"
                  aria-label={locale === 'zh-Hans' ? '移除上下文' : 'Remove context'}
                >
                  <X className="w-3 h-3 text-primary" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );

    // ─── Unified ActionDock: single container morphs from collapsed dock to expanded panel ───
    // Same input bar JSX renders in both collapsed and expanded states (via renderInputBar),
    // so style/size stay locked together. Container animates its height.
    return (
      <>
        <AnimatePresence>
          {isOpen && !isSideDocked && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-[55] bg-black/30 backdrop-blur-sm"
              onClick={handleClose}
            />
          )}
        </AnimatePresence>

        <motion.div
          ref={panelRef}
          initial={false}
          animate={isSideDocked
            ? undefined
            : { height: isFullScreen ? '100vh' : isOpen ? '78vh' : 'auto' }
          }
          transition={{ type: 'spring', damping: 32, stiffness: 280 }}
          drag={isOpen && !isSideDocked ? 'y' : false}
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.3, bottom: 0.5 }}
          onDragEnd={(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
            if (isFullScreen) {
              // Full-screen: down-swipe collapses. On mobile we skip the 78vh
              // mid state (too little room) and close all the way to the dock.
              if (info.offset.y > 80 || info.velocity.y > 500) {
                if (isMobile) closePanel();
                else openPanel(false);
              }
              return;
            }
            if (info.offset.y < -80 || info.velocity.y < -500) {
              openPanel(true);
            } else if (info.offset.y > 80 || info.velocity.y > 500) {
              closePanel();
            }
          }}
          className={cn(
            'flex flex-col overflow-clip safe-area-bottom min-h-0',
            'bg-background/80 backdrop-blur-md',
            // Float mode: fixed bottom sheet overlay
            !isSideDocked && 'fixed bottom-0 left-0 right-0 z-[60] border-t border-border/50',
            !isSideDocked && isOpen && !isFullScreen && 'rounded-t-[20px]',
            // Side-docked mode: inline flex child, not fixed/absolute.
            // flex-1 makes it share space 1:1 with the content area.
            // pt-14: push content below the fixed page header that spans full width.
            isSideDocked && 'h-full flex-1 border-border/50 pt-14',
            isSideDocked && effectiveLayout === 'right' && 'border-l',
            isSideDocked && effectiveLayout === 'left' && 'border-r',
          )}
          style={
            isOpen && !isSideDocked
              ? { boxShadow: '0 -8px 32px -4px rgba(0, 0, 0, 0.15), 0 -4px 16px -4px rgba(0, 0, 0, 0.1)' }
              : isSideDocked && isOpen
                ? { boxShadow: '0 0 24px -4px rgba(0, 0, 0, 0.1)' }
                : undefined
          }
          data-component="copilot-unified-dock"
        >
          {isOpen ? (
            <>
              {panelChrome}
              {renderMessages()}
              {/* Side-docked: show page quick actions above input since collapsed dock is hidden */}
              {isSideDocked && dockChips.length > 0 && (
                <div className="px-3 py-2 border-t border-border/20 flex items-center gap-2 flex-wrap shrink-0">
                  {dockChips.map((c) => {
                    const Icon = c.icon;
                    return (
                      <button
                        key={c.id}
                        onClick={c.onClick}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5',
                          'rounded-full bg-muted/50 border border-border/50',
                          'text-xs font-medium text-foreground',
                          'hover:bg-muted active:scale-95 transition-all'
                        )}
                      >
                        <Icon className="w-3.5 h-3.5 text-primary" />
                        <span>{c.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {renderInputExtras()}
            </>
          ) : isSideDocked ? null : (
            <div className="mx-auto w-full max-w-md flex flex-col gap-2 px-3 pt-2 pb-0 overflow-y-auto flex-1">
              {dockSlot !== null ? (
                <div className="flex justify-center">{dockSlot}</div>
              ) : dockChips.length > 0 ? (
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  {dockChips.map((c) => {
                    const Icon = c.icon;
                    return (
                      <button
                        key={c.id}
                        onClick={c.onClick}
                        className={cn(
                          'flex items-center gap-2 px-4 py-2.5',
                          'rounded-full bg-background border border-border/60 shadow-sm',
                          'text-xs font-medium text-foreground',
                          'active:scale-95 transition-transform'
                        )}
                      >
                        <Icon className="w-4 h-4 text-primary" />
                        <span>{c.label}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          )}
          {/* Input bar — always rendered inside the panel container */}
          {(!isSideDocked || isOpen) && renderInputWrapper()}
        </motion.div>


        <PipelineViewer open={frameViewerOpen} onClose={() => setFrameViewerOpen(false)} locale={locale} />
      </>
    );
}
