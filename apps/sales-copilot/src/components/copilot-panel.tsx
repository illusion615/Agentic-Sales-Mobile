import { useRef, useEffect, useLayoutEffect, useCallback, useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useDragControls, type PanInfo } from 'motion/react';
import { ArrowUp, SquarePen, X, Copy, Volume2, VolumeX, Loader2, Square, Play, Pause, Paperclip, RotateCcw, Mic, ScrollText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCopilot, type ChatMessage, isUnresolvedBlockingCard } from '@/contexts/copilot-context';
import { getLocale, getChatFontClass, getSelectedVoice, findMatchingSystemVoice, getLLMConfig, getVoiceSummaryEnabled, getCopilotDockLayout, getCopilotFullscreenDefault, getDebugMode, speechLang, t, localeBcp47, type CopilotDockLayout, type Locale } from '@/lib/i18n';
import { useSpeechPlayer } from '@/hooks/use-speech-player';
import { ThinkingIndicator } from '@/components/thinking-indicator';
import { DynamicDataRenderer, tryParseJson } from '@/components/dynamic-data-renderer';
import { FormCard } from '@/components/form-card';
import { BatchFormCard } from '@/components/batch-form-card';
import { ParamPickerCard } from '@/components/param-picker-card';
import { ProposalCard } from '@/components/proposal-card';
// Chart pulls in recharts (~heavy) — load it only when a chart actually renders.
const ChartCard = lazy(() => import('@/components/chart-card').then((m) => ({ default: m.ChartCard })));
import { MatchSelectionCard, buildMatchReasonText } from '@/components/match-selection-card';
import { MarkdownContent } from '@/components/markdown-content';
import { RecordListCard } from '@/components/record-list-card';
import { AdditionalIntentsCard } from '@/components/additional-intents-card';
import { PipelineViewer } from '@/components/frame-viewer';
import { TaskAnnounceBubble } from '@/components/task-announce-bubble';
import { MessageAttachments } from '@/components/message-attachments';
import { toast } from 'sonner';
import { useActionDock } from '@/contexts/action-dock-context';
import { useIsMobile } from '@/hooks/use-mobile';
import { newAttachmentId, type CopilotAttachment } from '@/lib/attachments';
import { useDynamicSuggestions } from '@/hooks/use-dynamic-suggestions';



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
    cancelSend,
    inputValue,
    setInputValue,

    startNewConversation,
    continuePendingAction,
    createEntityForResolution,
    skipResolutionAndDraft,
    refreshResolution,
    formCardCancelled,
    paramFieldPicked,
    paramValuePicked,
    proposalConfirmed,
    proposalCancelled,
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

  // "Fullscreen Copilot by default" (mobile) — reactive so binary-mode recomputes
  // live when the setting is toggled.
  const [copilotFullscreenDefault, setCopilotFullscreenDefault] = useState(() => getCopilotFullscreenDefault());
  useEffect(() => {
    const handler = (e: Event) => setCopilotFullscreenDefault((e as CustomEvent<boolean>).detail);
    window.addEventListener('copilotfullscreendefault-changed', handler);
    return () => window.removeEventListener('copilotfullscreendefault-changed', handler);
  }, []);

  // Debug mode — reactive; gates the Frame shadow-log icon so end users don't see it.
  const [debugMode, setDebugModeState] = useState(() => getDebugMode());
  useEffect(() => {
    const handler = (e: Event) => setDebugModeState((e as CustomEvent<boolean>).detail);
    window.addEventListener('debugmode-changed', handler);
    return () => window.removeEventListener('debugmode-changed', handler);
  }, []);

  // Binary mode: no 78vh mid state — collapsed dock ⇄ fullscreen only. Driven
  // solely by the "Fullscreen Copilot by default" toggle (mobile only), so that
  // setting alone decides whether tapping the composer opens fullscreen or the
  // 78vh mid sheet. NOT tied to "display in all screens" (that only controls
  // dock visibility).
  const binaryMode = isMobile && copilotFullscreenDefault;

  // Side-docked mode: always keep the panel open (no collapse).
  useEffect(() => {
    if (isSideDocked && !isOpen) openPanel(false);
  }, [isSideDocked, isOpen, openPanel]);

  // Binary mode: if the panel ever opens to the mid state, snap it to fullscreen
  // so no intermediate height is ever shown (covers every open entry path).
  useEffect(() => {
    if (binaryMode && isOpen && !isFullScreen) openPanel(true);
  }, [binaryMode, isOpen, isFullScreen, openPanel]);

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
  // True while we programmatically focus the composer after opening, so the
  // resulting onFocus isn't mistaken for a user tap (which would escalate to
  // fullscreen). See handleInputFocus.
  const programmaticFocusRef = useRef(false);
  // §8: lock the composer (text + mic + attachments) while any blocking card
  // (draft / batch / match-selection / awaiting-clarification) is unresolved, so
  // the card is the only input entry and there is no "follow-up vs new command"
  // ambiguity. Query-result lists do NOT lock. Derived from the live messages.
  const inputLocked = messages.some(isUnresolvedBlockingCard);
  // When the user taps the disabled composer, guide them to the blocking card.
  // If the panel is collapsed we first EXPAND it so the card is visible (the
  // card — not the composer — is where the user acts); then pulse + scroll to it.
  const [pulseCardId, setPulseCardId] = useState<string | null>(null);
  const guideToBlockingCard = useCallback(() => {
    const target = messages.find(isUnresolvedBlockingCard);
    if (!target) return;
    const wasCollapsed = !isOpen;
    // Expand the panel if it is collapsed (same policy as handleInputFocus).
    const fullscreenDefault = binaryMode;
    if (!isOpen) {
      openPanel(fullscreenDefault);
    } else if (fullscreenDefault && !isFullScreen) {
      openPanel(true);
    } else if (isMobile && !isFullScreen) {
      openPanel(true);
    }
    // Pulse + scroll to the card. When we just opened, wait for the expand
    // animation so the message list is mounted before scrolling.
    setPulseCardId(target.id);
    const delay = wasCollapsed ? 320 : 0;
    window.setTimeout(() => {
      const el = document.getElementById(`message-${target.id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, delay);
    window.setTimeout(() => setPulseCardId((id) => (id === target.id ? null : id)), delay + 1200);
  }, [messages, isOpen, isFullScreen, isMobile, binaryMode, openPanel]);

  
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Smart auto-scroll: only scroll to bottom after the user sends a message
  // or while a streaming response is arriving. Preserve scroll position when
  // the user navigates away (clicks a record card) and comes back.
  const shouldAutoScrollRef = useRef(true);
  const prevMessagesLenRef = useRef(0);
  
  // TTS per-message playback — driven by the shared speech player so the same
  // mobile-safe priming / voice-matching path is used everywhere.
  const { state: ttsState, play: ttsPlay, stop: ttsStop } = useSpeechPlayer({
    getLang: () => speechLang(locale),
    getVoice: () => findMatchingSystemVoice(getSelectedVoice(), locale),
  });
  const speakingMessageId = ttsState.isActive ? ttsState.activeId : null;

  const speakMessage = useCallback((messageId: string, text: string) => {
    // Toggle off if this message is already playing.
    if (ttsState.isActive && ttsState.activeId === messageId) {
      ttsStop();
      return;
    }
    ttsPlay([{ id: messageId, text }]);
  }, [ttsState.isActive, ttsState.activeId, ttsPlay, ttsStop]);

  const panelRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  // IME composition tracking (belt-and-suspenders for cross-browser reliability)
  const isComposingRef = useRef(false);
  
  const [playingInlineId, setPlayingInlineId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Array<{ file: File; preview: string; type: 'image' | 'file' }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
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
      const reader = new FileReader();
      reader.onload = (event) => {
        setAttachments((prev) => [...prev, {
          file,
          preview: event.target?.result as string,
          type: file.type.startsWith('image/') ? 'image' as const : 'file' as const,
        }]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Handle remove attachment
  const handleRemoveAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Send the current input together with any composer attachments, then clear both.
  const handleSend = useCallback((text: string) => {
    if (!text.trim()) return;
    const atts: CopilotAttachment[] = attachments.map((a) => ({
      id: newAttachmentId(),
      name: a.file.name,
      mimeType: a.file.type || 'application/octet-stream',
      dataUrl: a.preview,
      type: a.type,
    }));
    shouldAutoScrollRef.current = true;
    sendMessage(text, atts.length ? atts : undefined);
    setAttachments([]);
  }, [attachments, sendMessage]);
  
  // Check if context should be shown
  const shouldShowContext = pageContext && 
    pageContext.currentPage && 
    !dismissedContexts.has(pageContext.currentPage) &&
    pageContext.currentPage !== 'Home';

  // Scroll to bottom when messages change — but only when auto-scroll is active.
  // Auto-scroll is enabled when the user sends a message or a quick-action, and
  // disabled when the user manually scrolls up away from the bottom.
  useEffect(() => {
    // A new user message just appeared → re-enable auto-scroll
    if (messages.length > prevMessagesLenRef.current) {
      const latest = messages[messages.length - 1];
      if (latest?.role === 'user') {
        shouldAutoScrollRef.current = true;
      }
    }
    prevMessagesLenRef.current = messages.length;

    if (!shouldAutoScrollRef.current) return;
    requestAnimationFrame(() => {
      const container = messagesContainerRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    });
  }, [messages.length, messages]);

  // While the assistant is streaming, keep scrolling to bottom (if auto-scroll is on).
  useEffect(() => {
    if (!isSending || !shouldAutoScrollRef.current) return;
    requestAnimationFrame(() => {
      const container = messagesContainerRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    });
  });

  // Detect manual scroll: if user scrolls up away from the bottom, pause auto-scroll.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      // If user scrolled more than 80px from bottom, they're browsing history
      if (distanceFromBottom > 80) {
        shouldAutoScrollRef.current = false;
      } else {
        shouldAutoScrollRef.current = true;
      }
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Keep the thread pinned to the bottom across the whole open transition.
  // useLayoutEffect positions it before the first painted frame; a short rAF loop
  // then re-pins each frame while layout settles (cards/fonts/images can grow
  // scrollHeight over several frames). This shows the latest message throughout
  // the expand instead of a single late "catch-up" scroll that fights the motion.
  useLayoutEffect(() => {
    if (!isOpen || !shouldAutoScrollRef.current) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    let raf = 0;
    const start = performance.now();
    const pin = () => {
      if (!shouldAutoScrollRef.current) return;
      const el = messagesContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      if (performance.now() - start < 450) raf = requestAnimationFrame(pin);
    };
    raf = requestAnimationFrame(pin);
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  // Focus the composer shortly after open. Kept separate from the scroll above
  // so focus (which can itself nudge scroll) happens after the sheet settles.
  // We flag this focus as programmatic so handleInputFocus doesn't treat it as a
  // user tap and escalate a 78vh mid sheet to fullscreen.
  useEffect(() => {
    if (!isOpen) return;
    const id = window.setTimeout(() => {
      programmaticFocusRef.current = true;
      inputRef.current?.focus();
      // Safety: clear on the next tick in case focus() fired no onFocus event
      // (e.g. the field was already focused), so a later real tap still counts.
      window.setTimeout(() => { programmaticFocusRef.current = false; }, 0);
    }, 300);
    return () => window.clearTimeout(id);
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
      handleSend(inputValue);
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
  // When fullscreen-by-default / binary mode is on: only fullscreen ↔ collapsed, no mid state.
  // Otherwise: open to 78vh, then fullscreen on second tap.
  const handleInputFocus = () => {
    // Ignore the programmatic focus we trigger right after opening — otherwise it
    // would count as a "second tap" and escalate the 78vh mid sheet straight to
    // fullscreen, making the "Fullscreen by default = off" setting have no effect.
    if (programmaticFocusRef.current) {
      programmaticFocusRef.current = false;
      return;
    }
    const fullscreenDefault = binaryMode;
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
        t('speechNotSupported', locale)
      );
      return;
    }

    const recognition = new SR();
    recognition.lang = speechLang(locale);
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
          t('micPermissionDenied', locale)
        );
      } else if (event.error === 'no-speech') {
        // silent — user simply didn't say anything
      } else {
        toast.error(
          t('speechRecognitionError', locale, { error: event.error })
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
        t('speechStartFailed', locale)
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
  const hasClarificationSuggestions = clarificationSuggestions.length > 0;

  // Dynamic, LLM-generated follow-up pills. Generated in the background after
  // each reply (while the user reads), with hidden→generating→ready states so
  // the panel can fade pills out on send and show a skeleton while generating.
  // Disabled while clarification/blocking pills must take priority.
  const { status: suggestionStatus, pills: dynamicPills } = useDynamicSuggestions({
    messages,
    isSending,
    locale,
    enabled: !hasClarificationSuggestions && !inputLocked,
  });

  const quickActions = hasClarificationSuggestions ? clarificationSuggestions : dynamicPills;

  // For overlay mode, the AnimatePresence handles the open/close animation,
  // so we don't return null here - it's handled in the overlay render section below

  const renderMessages = () => {

    return (
    <div ref={messagesContainerRef} className="flex-1 overflow-y-auto scrollbar-hide px-3 py-3 min-h-0 flex flex-col">
      {messages.length === 0 ? (
        <div className="flex flex-col h-full justify-center px-4">
          <p className="text-sm font-medium text-foreground mb-4">
            {t('iCanHelp', locale)}
          </p>
          <ul className="space-y-3">
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs text-primary font-medium">1</span>
              </span>
              <span className="text-sm text-muted-foreground">
                {t('helpQuery', locale)}
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs text-primary font-medium">2</span>
              </span>
              <span className="text-sm text-muted-foreground">
                {t('helpCreate', locale)}
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs text-primary font-medium">3</span>
              </span>
              <span className="text-sm text-muted-foreground">
                {t('helpAnalyze', locale)}
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs text-primary font-medium">4</span>
              </span>
              <span className="text-sm text-muted-foreground">
                {t('helpKnowledge', locale)}
              </span>
            </li>
          </ul>
          <p className="text-xs text-muted-foreground mt-6 text-center">
            {t('typeOrHoldMic', locale)}
          </p>
        </div>
      ) : (
        // Bottom-anchor the thread: mt-auto glues messages to the bottom (next to
        // the composer) so when the panel expands the content rises up with the
        // sheet instead of unfolding top-down.
        <div className="mt-auto flex flex-col">

          {messages.map((message: ChatMessage, msgIndex: number) => {
            // Phase D: hide substep messages when their owning task group is collapsed.
            if (message.taskRole === 'substep' && message.collapsed) return null;

            // Determine if a queue step announce is completed: check the
            // announceStatus field patched by the runtime after execution.
            const announceStatus = message.announceStatus;
            const announceDetail = message.announceDetail;
            const isAnnounceCompleted = message.taskRole === 'announce' && (
              announceStatus === 'completed' || announceStatus === 'failed'
              || (message.queueIntentId && messages.slice(msgIndex + 1).some((m) => m.queueIntentId === message.queueIntentId && m.taskRole !== 'announce'))
            );
            const isAnnounceFailed = announceStatus === 'failed';

            // Messages inside a queue step (not announce/summary/overview) are "substeps".
            const isQueueSubstep = !!message.queueId && message.taskRole !== 'announce' && message.taskRole !== 'summary' && message.taskRole !== 'overview';
            return (
            <div key={message.id} id={`message-${message.id}`} className={cn(
              message.taskRole === 'announce' ? 'mb-1' : 'mb-3',
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

              {/* Phase B: Per-task announce — uses thinking-step style */}
              {message.taskRole === 'announce' && message.taskAnnounce && (
                <div className="flex items-center gap-2 text-xs py-1">
                  {isAnnounceFailed ? (
                    <span className="text-destructive">✗</span>
                  ) : isAnnounceCompleted || message.collapsed ? (
                    <span className="text-primary">✓</span>
                  ) : (
                    <ThinkingIndicator />
                  )}
                  <span className={cn(
                    isAnnounceFailed ? 'text-destructive' :
                    isAnnounceCompleted || message.collapsed ? 'text-muted-foreground' : 'text-foreground font-medium'
                  )}>
                    {t('stepWithLabel', locale, { index: message.taskAnnounce.index, total: message.taskAnnounce.total, label: message.taskAnnounce.label })}
                  </span>
                  {announceDetail && (
                    <span className={cn(
                      'text-[10px]',
                      isAnnounceFailed ? 'text-destructive/70' : 'text-muted-foreground/70'
                    )}>
                      — {announceDetail}
                    </span>
                  )}
                </div>
              )}

              {/* User Message */}
              {message.type === 'user' && (
                <div className="max-w-[85%] group">
                  <div
                    className={cn('px-3 py-2 rounded-2xl rounded-br-md bg-[rgba(255,122,0,0.08)] border-2 border-[rgba(255,122,0,0.4)]', getChatFontClass())}
                  >
                    {message.content}
                  </div>
                  {message.attachments && message.attachments.length > 0 && (
                    <MessageAttachments attachments={message.attachments} />
                  )}
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
                      className="p-1 rounded hover:bg-primary/10 hover:text-primary transition-all"
                      aria-label={t('retry', locale)}
                    >
                      <RotateCcw className="w-3 h-3 text-muted-foreground hover:text-primary" />
                    </button>
                    <p className="text-[9px] text-muted-foreground">
                      {new Date(message.timestamp).toLocaleTimeString(localeBcp47(locale), { hour: '2-digit', minute: '2-digit' })}
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
                  <div className={cn('rounded-2xl', pulseCardId === message.id && 'ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse')}>
                    <BatchFormCard 
                      messageId={message.id} 
                      batchFormCards={message.batchFormCards}
                    />
                  </div>
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
                      locale,
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
                  <div className={cn('rounded-2xl', pulseCardId === message.id && 'ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse')}>
                  <MatchSelectionCard
                    messageId={message.id}
                    matchSelection={message.matchSelection}
                    resolved={message.resolutionState === 'resolved'}
                    resolutionResult={message.resolutionResult}
                    // No toast on select: the card locks to a "Selected: X · Account"
                    // pill inline and a completion message follows, so a toast would
                    // be a third, redundant confirmation (D14).
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
                    onCancel={() => formCardCancelled(message.id)}
                  />
                  </div>
                </div>
              )}

              {/* Param Picker Card (missing-parameter gate) */}
              {message.type === 'param-picker' && message.paramPicker && (
                <div className="max-w-full">
                  <div className={cn('rounded-2xl', pulseCardId === message.id && 'ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse')}>
                    <ParamPickerCard
                      messageId={message.id}
                      paramPicker={message.paramPicker}
                      resolved={message.resolutionState === 'resolved'}
                      resolutionResult={message.resolutionResult}
                      onPickField={(field) => paramFieldPicked(message.id, field)}
                      onPickValue={(value) => paramValuePicked(message.id, message.paramPicker?.field ?? '', value)}
                      onCancel={() => formCardCancelled(message.id)}
                    />
                  </div>
                </div>
              )}

              {/* Change-proposal Card (composite / destructive ops confirm gate) */}
              {message.type === 'proposal-card' && message.proposalCard && (
                <div className="max-w-full">
                  <div className={cn('rounded-2xl', pulseCardId === message.id && 'ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse')}>
                    <ProposalCard
                      messageId={message.id}
                      proposalCard={message.proposalCard}
                      resolved={message.resolutionState === 'resolved'}
                      resolutionResult={message.resolutionResult}
                      onConfirm={() => proposalConfirmed(message.id)}
                      onCancel={() => proposalCancelled(message.id)}
                    />
                  </div>
                </div>
              )}

              {/* Interactive pipeline chart (grounded quantitative analysis + drill-down) */}
              {message.type === 'chart-card' && message.chartCard && (
                <div className="max-w-full">
                  <Suspense fallback={<div className="h-[200px] rounded-2xl border bg-card animate-pulse" />}>
                    <ChartCard
                      chartCard={message.chartCard}
                      locale={getLocale() === 'zh-Hans' ? 'zh-Hans' : 'en'}
                    />
                  </Suspense>
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
                    title: c.title,
                    phone: c.phone,
                    email: c.email,
                    accountName: c.accountName,
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
                        locale,
                      }) || message.content;
                      if (!reason) return null;
                      return (
                        <p className={cn('text-foreground mb-2 leading-relaxed', getChatFontClass())}>
                          {reason}
                        </p>
                      );
                    })()}
                    <div className={cn('rounded-2xl', pulseCardId === message.id && 'ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse')}>
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
                      onCancel={() => formCardCancelled(message.id)}
                    />
                    </div>
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
                              <ThinkingIndicator />
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
                          {t('noDataFound', locale)}
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
                    {/* Action bar: timestamp + copy + play — hidden for queue substeps */}
                    {message.content && !isJson && !message.isThinking && !message.isStreaming && !isQueueSubstep && (
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-[9px] text-muted-foreground">
                          {new Date(message.timestamp).toLocaleTimeString(localeBcp47(locale), { hour: '2-digit', minute: '2-digit' })}
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
                                  <span className="w-0.5 bg-primary rounded-full animate-pulse h-[60%]" />
                                  <span className="w-0.5 bg-primary rounded-full animate-pulse h-full [animation-delay:0.15s]" />
                                  <span className="w-0.5 bg-primary rounded-full animate-pulse h-[40%] [animation-delay:0.3s]" />
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
                  <div className={cn('rounded-2xl', pulseCardId === message.id && 'ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse')}>
                    <FormCard 
                      messageId={message.id} 
                      formCard={message.formCard}
                    />
                  </div>
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
        </div>
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
        {/* Center the pills to the same max-width column as the input bar so that
            on wide screens they cluster near the (centered) composer instead of
            stretching across the full panel width. */}
        <div className="mx-auto w-full max-w-md">
          {hasClarificationSuggestions && (
            <p className="text-xs text-primary mb-2 font-medium">
              {t('chooseOption', locale)}
            </p>
          )}
          {/* min-height keeps the bar a constant height so pills fade out → skeleton
              → pills fade in without a layout jump. */}
          <div className="relative min-h-[30px] flex items-center">
            <AnimatePresence mode="wait" initial={false}>
              {(hasClarificationSuggestions || suggestionStatus === 'ready') ? (
                <motion.div
                  key="pills"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex gap-2 overflow-x-auto w-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                >
                  {quickActions.map((action: { text: string; query: string; action?: { function: string; arguments: Record<string, unknown> } }, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => {
                        // While a blocking card is unresolved the composer is locked; the
                        // suggestion pills must be locked too, otherwise tapping one would
                        // send a new message and bypass the card. Route the tap to the
                        // card instead (same behaviour as the disabled composer).
                        if (inputLocked) {
                          guideToBlockingCard();
                          return;
                        }
                        // If action has function info, execute directly without LLM re-analysis
                        if (action.action) {
                          executeClarificationAction(
                            action.action.function,
                            action.action.arguments,
                            action.text
                          );
                        } else {
                          // Regular query - send as message
                          shouldAutoScrollRef.current = true;
                          sendMessage(action.query);
                        }
                      }}
                      disabled={isSending}
                      className={cn(
                        'shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium',
                        'transition-all active:scale-95',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        inputLocked && 'opacity-50 cursor-not-allowed',
                        hasClarificationSuggestions
                          ? 'bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 hover:border-primary/50'
                          : 'bg-muted/50 hover:bg-muted text-foreground border border-border/50 hover:border-border'
                      )}
                    >
                      {action.text}
                    </button>
                  ))}
                </motion.div>
              ) : suggestionStatus === 'generating' ? (
                <motion.div
                  key="skeleton"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex gap-2"
                  aria-label={t('generatingSuggestions', locale)}
                >
                  <div className="h-[26px] w-16 rounded-full bg-muted/60 animate-pulse" />
                  <div className="h-[26px] w-24 rounded-full bg-muted/60 animate-pulse" />
                  <div className="h-[26px] w-20 rounded-full bg-muted/60 animate-pulse" />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
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
                      {attachment.file.name}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => handleRemoveAttachment(index)}
                  aria-label={t('removeAttachment', locale)}
                  title={t('removeAttachment', locale)}
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

      <div className="relative flex items-end gap-2 p-2 rounded-[14px] bg-background">
        {/* Hidden input: file/photo picker. On mobile the native sheet already
            offers "Take Photo" as an option, so a separate camera shortcut is
            redundant — a single attachment button covers both. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          aria-label={t('choosePhotoOrFile', locale)}
        />

        {/* Attachment button — opens the native picker directly (no popup menu) */}
        <button
          type="button"
          onClick={() => { if (inputLocked) { guideToBlockingCard(); return; } fileInputRef.current?.click(); }}
          disabled={inputLocked}
          className={cn(
            'w-10 h-10 flex items-center justify-center rounded-full transition-colors shrink-0',
            inputLocked
              ? 'text-muted-foreground/40 cursor-not-allowed'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
          aria-label={t('addAttachment', locale)}
          title={t('addAttachment', locale)}
        >
          <Paperclip className="w-5 h-5" />
        </button>
        {/* Input Field — auto-grows up to 4 lines, then scrolls internally */}
        <textarea
          ref={inputRef}
          data-tour="copilot-input"
          rows={1}
          value={inputValue}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onFocus={handleInputFocus}
          onPointerDown={(e: React.PointerEvent) => { if (inputLocked) { e.preventDefault(); guideToBlockingCard(); } }}
          disabled={inputLocked}
          placeholder={inputLocked
            ? t('completeCardAbove', locale)
            : t('askCopilotPlaceholder', locale)}
          className={cn(
            'flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground resize-none leading-5 py-2 self-end',
            inputLocked && 'cursor-not-allowed opacity-60'
          )}
        />

        {/* Right action — mutually exclusive: Stop / Send / Mic */}
        {isSending ? (
          <button
            onClick={cancelSend}
            className="w-10 h-10 rounded-full flex items-center justify-center text-red-500 hover:bg-muted/50 transition-colors shrink-0"
            aria-label={t('stop', locale)}
            title={t('stop', locale)}
          >
            <Square className="w-4 h-4 fill-current" />
          </button>
        ) : inputLocked ? (
          <button
            type="button"
            onClick={guideToBlockingCard}
            className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground/40 cursor-not-allowed shrink-0"
            aria-label={t('completeCardAbove', locale)}
            title={t('completeCardAbove', locale)}
          >
            <Mic className="w-5 h-5" />
          </button>
        ) : !isListening && inputValue.trim() ? (
          <button
            onClick={() => { if (inputValue.trim()) { handleSend(inputValue); } }}
            className="w-10 h-10 flex items-center justify-center transition-all text-primary hover:brightness-125 shrink-0"
            aria-label={t('send', locale)}
            title={t('send', locale)}
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
            aria-label={isListening ? t('tapToStopListening', locale) : t('holdToTalk', locale)}
            title={isListening ? t('tapToStopListening', locale) : t('holdToTalk', locale)}
          >
            <Mic className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={() => {}}
            disabled
            className="w-10 h-10 flex items-center justify-center text-muted-foreground cursor-not-allowed shrink-0"
            aria-label={t('send', locale)}
            title={t('send', locale)}
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
        {/* Drag handle (grabber) — shown in float mode for BOTH the 78vh and the
            fullscreen states so collapse-by-swipe works the same in both. Hidden
            only when side-docked (persistent panel). In fullscreen it clears the
            top safe area (notch). */}
        {!isSideDocked && (
          <div
            className={cn(
              'flex justify-center py-2 cursor-grab active:cursor-grabbing touch-none',
              isFullScreen && 'safe-area-top pt-3',
            )}
            onPointerDown={(e: React.PointerEvent) => dragControls.start(e)}
          >
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
        )}

        {/* Header — title left-aligned; there is no collapse button, collapse is
            via the grabber swipe-down (float) or staying open (side-docked). */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/30">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-foreground">Sales Copilot</span>
            {isConnected && <span className="w-2 h-2 bg-green-500 rounded-full shrink-0" />}
            {isConnecting && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
            {debugMode && (
              <button
                type="button"
                onClick={() => setFrameViewerOpen(true)}
                className="ml-1 w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
                title={t('frameShadowMode', locale)}
                aria-label="Frame shadow log"
              >
                <ScrollText className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => { shouldAutoScrollRef.current = true; startNewConversation(); }}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:brightness-125 active:brightness-75"
              aria-label={t('newSession', locale)}
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
                {t('contextLabel', locale)}
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
                  aria-label={t('removeContext', locale)}
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
              transition={{ duration: 0.32, ease: 'easeOut' }}
              className="fixed inset-0 z-[55] bg-black/30 backdrop-blur-sm"
              onClick={handleClose}
            />
          )}
        </AnimatePresence>

        {/* Collapsed dock (float) + full inline panel (side-dock). In FLOAT mode the
            EXPANDED panel is a separate slide-up sheet rendered below, so this
            container only mounts as the collapsed dock when closed. In side-dock
            mode it stays the always-open inline panel. */}
        {(isSideDocked || !isOpen) && (
        <motion.div
          ref={panelRef}
          initial={false}
          animate={isSideDocked
            ? undefined
            : { height: (isFullScreen || (binaryMode && isOpen)) ? '100vh' : isOpen ? '78vh' : 'auto' }
          }
          transition={{ type: 'spring', damping: 32, stiffness: 280 }}
          drag={isOpen && !isSideDocked ? 'y' : false}
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.3, bottom: 0.5 }}
          onDragEnd={(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
            if (isFullScreen) {
              // Full-screen: down-swipe collapses. On mobile / binary mode we skip the
              // 78vh mid state (too little room) and close all the way to the dock.
              if (info.offset.y > 80 || info.velocity.y > 500) {
                if (isMobile || binaryMode) closePanel();
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
            isSideDocked && 'h-full flex-1 min-w-0 max-w-[50%] border-border/50 pt-14',
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
                    const Icon = c.busy ? Loader2 : c.icon;
                    return (
                      <button
                        key={c.id}
                        onClick={c.disabled ? undefined : c.onClick}
                        disabled={c.disabled}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5',
                          'rounded-full bg-muted/50 border border-border/50',
                          'text-xs font-medium text-foreground',
                          'transition-all',
                          c.disabled
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-muted active:scale-95'
                        )}
                      >
                        <Icon className={cn('w-3.5 h-3.5 text-primary', c.busy && 'animate-spin')} />
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
                    const Icon = c.busy ? Loader2 : c.icon;
                    return (
                      <button
                        key={c.id}
                        onClick={c.disabled ? undefined : c.onClick}
                        disabled={c.disabled}
                        className={cn(
                          'flex items-center gap-2 px-4 py-2.5',
                          'rounded-full bg-background border border-border/60 shadow-sm',
                          'text-xs font-medium text-foreground',
                          'transition-transform',
                          c.disabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'
                        )}
                      >
                        <Icon className={cn('w-4 h-4 text-primary', c.busy && 'animate-spin')} />
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
        )}

        {/* Float-mode expanded panel — slides up from the bottom like a native
            bottom sheet (mirrors the <Sheet> used by the insight / brief / profile
            panels) instead of growing its height, so the open motion reads as a
            proper expand. Content is pre-sized; only the transform animates. */}
        <AnimatePresence>
          {isOpen && !isSideDocked && (
            <motion.div
              key="copilot-sheet"
              ref={panelRef}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 36, stiffness: 340 }}
              drag="y"
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.15, bottom: 0.5 }}
              onDragEnd={(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
                if (isFullScreen) {
                  // Full-screen: down-swipe collapses. On mobile / binary mode we skip
                  // the 78vh mid state and close all the way to the dock.
                  if (info.offset.y > 80 || info.velocity.y > 500) {
                    if (isMobile || binaryMode) closePanel();
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
                'fixed bottom-0 left-0 right-0 z-[60] flex flex-col overflow-clip safe-area-bottom min-h-0',
                'bg-background/80 backdrop-blur-md border-t border-border/50',
                !isFullScreen && 'rounded-t-[20px]',
              )}
              style={{
                height: (isFullScreen || binaryMode) ? '100vh' : '78vh',
                boxShadow: '0 -8px 32px -4px rgba(0, 0, 0, 0.15), 0 -4px 16px -4px rgba(0, 0, 0, 0.1)',
              }}
              data-component="copilot-sheet"
            >
              {panelChrome}
              {renderMessages()}
              {renderInputExtras()}
              {renderInputWrapper()}
            </motion.div>
          )}
        </AnimatePresence>

        <PipelineViewer open={frameViewerOpen} onClose={() => setFrameViewerOpen(false)} locale={locale} />
      </>
    );
}
