import { useRef, useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useDragControls, type PanInfo } from 'motion/react';
import { Sparkles, ArrowUp, SquarePen, X, ChevronDown, Copy, Volume2, VolumeX, Loader2, Square, Play, Pause, Paperclip, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCopilot, type ChatMessage } from '@/contexts/copilot-context';
import { getLocale, getChatFontClass, getThinkingDotStyle, getSelectedVoice, findMatchingSystemVoice, getLLMConfig, getVoiceSummaryEnabled, generateVoiceSummary, type Locale, type ThinkingDotStyle } from '@/lib/i18n';
import { DynamicDataRenderer, tryParseJson } from '@/components/dynamic-data-renderer';
import { FormCard } from '@/components/form-card';
import { BatchFormCard } from '@/components/batch-form-card';
import { MatchSelectionCard } from '@/components/match-selection-card';
import { MarkdownContent } from '@/components/markdown-content';
import { RecordListCard } from '@/components/record-list-card';
import { AdditionalIntentsCard } from '@/components/additional-intents-card';
import { toast } from 'sonner';



interface CopilotPanelProps {
  mode: 'overlay' | 'embedded';
  onClose?: () => void;
}

export function CopilotPanel({ mode, onClose }: CopilotPanelProps) {
  const navigate = useNavigate();
  const {
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
    isSending,
    sendMessage,
    inputValue,
    setInputValue,

    startNewConversation,
    continuePendingAction,
    createNewFromIntent,
    pageContext,
    setPageContext,
    clarificationSuggestions,
    executeClarificationAction,
    rollbackToMessage,
  } = useCopilot();

  // Render counter for loop diagnostics
  const renderCountRef = useRef(0);
  renderCountRef.current++;
  useEffect(() => {
    if (renderCountRef.current > 500) {
      console.warn('[LOOP WARNING] CopilotPanel render count:', renderCountRef.current);
    }
  });

  const locale: Locale = getLocale();
  const thinkingDotStyle: ThinkingDotStyle = getThinkingDotStyle();
  
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  // IME composition tracking (belt-and-suspenders for cross-browser reliability)
  const isComposingRef = useRef(false);
  
  const [playingInlineId, setPlayingInlineId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Array<{ file: File; preview: string; type: 'image' | 'file' }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Context chips that user can dismiss
  const [dismissedContexts, setDismissedContexts] = useState<Set<string>>(new Set());
  
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

  // Handle camera/attachment button click
  const handleAttachmentClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  
  // Check if context should be shown
  const shouldShowContext = pageContext && 
    pageContext.currentPage && 
    !dismissedContexts.has(pageContext.currentPage) &&
    pageContext.currentPage !== 'Home';

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (mode === 'overlay' && isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
    }
  }, [mode, isOpen]);

  // Handle enter key - IME-safe (skip Enter during IME composition)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
  const handleInputFocus = () => {
    if (mode === 'overlay' && !isExpanded) {
      setIsExpanded(true);
    }
  };

  // Handle full screen toggle
  const handleFullScreen = () => {
    toggleFullScreen();
  };

  // Handle close
  const handleClose = () => {
    if (mode === 'overlay') {
      closePanel();
      onClose?.();
    } else {
      setIsExpanded(false);
    }
  };



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
    <div className="flex-1 overflow-y-auto scrollbar-hide px-3 py-3">
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

          {messages.map((message: ChatMessage) => (
            <div key={message.id} id={`message-${message.id}`} className={cn(
              'mb-3',
              message.type === 'user' ? 'flex justify-end' : ''
            )}>
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
              {message.type === 'batch-form-card' && message.batchFormCards && (
                <div className="max-w-full">
                  {/* Show thinking steps if present */}
                  {message.thinkingSteps && message.thinkingSteps.length > 0 && (
                    <details className="mb-2 text-xs" open>
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                        <span>🧠</span>
                        <span>{locale === 'zh-Hans' ? '思考过程' : 'Thinking process'}</span>
                      </summary>
                      <div className="mt-1.5 pl-4 space-y-1 text-muted-foreground">
                        {message.thinkingSteps.map((step, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="text-primary">✓</span>
                            <span>{step.label}</span>
                            {step.detail && <span>· {step.detail}</span>}
                          </div>
                        ))}
                      </div>
                    </details>
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
                  {/* Show thinking steps if present */}
                  {message.thinkingSteps && message.thinkingSteps.length > 0 && (
                    <details className="mb-2 text-xs" open>
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                        <span>🧠</span>
                        <span>{locale === 'zh-Hans' ? '思考过程' : 'Thinking process'}</span>
                      </summary>
                      <div className="mt-1.5 pl-4 space-y-1 text-muted-foreground">
                        {message.thinkingSteps.map((step, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="text-primary">✓</span>
                            <span>{step.label}</span>
                            {step.detail && <span>· {step.detail}</span>}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  {message.content && (
                    <p className="text-sm text-foreground mb-2">{message.content}</p>
                  )}
                  <MatchSelectionCard
                    messageId={message.id}
                    matchSelection={message.matchSelection}
                    onSelect={(record) => {
                      toast.success(locale === 'zh-Hans' 
                        ? `已选择: ${record.name}` 
                        : `Selected: ${record.name}`);
                    }}
                    onContinueWithSelection={(record, pendingIntent) => {
                      // Continue with the pending action using the selected record
                      continuePendingAction(
                        record,
                        pendingIntent,
                        message.matchSelection?.entityType || 'account'
                      );
                    }}
                    onCreateNew={(pendingIntent) => {
                      // Create new record without using any existing match
                      createNewFromIntent(pendingIntent);
                    }}
                  />
                </div>
              )}

              {/* Agent Message */}
              {message.type === 'agent' && (() => {
                // Thinking state - show progress steps
                if (message.isThinking && message.thinkingSteps) {
                  return (
                    <div className="flex flex-col gap-2 max-w-[85%] py-2">
                      {/* Thinking Dots */}
                      <div className="flex items-center gap-2">
                        {thinkingDotStyle === 'bounce' && (
                          <div className="flex items-center gap-1">
                            <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.5, repeat: Infinity, delay: 0 }} />
                            <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.5, repeat: Infinity, delay: 0.1 }} />
                            <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.5, repeat: Infinity, delay: 0.2 }} />
                          </div>
                        )}
                        {thinkingDotStyle === 'pulse' && (
                          <div className="flex items-center gap-1">
                            <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0 }} />
                            <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0.15 }} />
                            <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0.3 }} />
                          </div>
                        )}
                        {thinkingDotStyle === 'wave' && (
                          <div className="flex items-center gap-1">
                            <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ y: [0, -3, 0, 3, 0] }} transition={{ duration: 1, repeat: Infinity, delay: 0, ease: 'easeInOut' as const }} />
                            <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ y: [0, -3, 0, 3, 0] }} transition={{ duration: 1, repeat: Infinity, delay: 0.15, ease: 'easeInOut' as const }} />
                            <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ y: [0, -3, 0, 3, 0] }} transition={{ duration: 1, repeat: Infinity, delay: 0.3, ease: 'easeInOut' as const }} />
                          </div>
                        )}
                        {thinkingDotStyle === 'fade' && (
                          <div className="flex items-center gap-1">
                            <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0 }} />
                            <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }} />
                            <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }} />
                          </div>
                        )}
                        {thinkingDotStyle === 'orbit' && (
                          <div className="relative w-5 h-5 flex items-center justify-center">
                            <span className="absolute w-1.5 h-1.5 bg-primary/30 rounded-full" />
                            <motion.span
                              className="absolute w-1.5 h-1.5 bg-primary rounded-full"
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: 'linear' as const }}
                              style={{ transformOrigin: 'center', x: 5 }}
                            />
                          </div>
                        )}
                      </div>
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
                        <details className="mb-2 text-xs" open>
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                            <span>🧠</span>
                            <span>{locale === 'zh-Hans' ? '思考过程' : 'Thinking process'}</span>
                          </summary>
                          <div className="mt-1.5 pl-4 space-y-1 text-muted-foreground">
                            {message.thinkingSteps.map((step, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <span className="text-primary">✓</span>
                                <span>{step.label}</span>
                                {step.detail && <span>· {step.detail}</span>}
                              </div>
                            ))}
                          </div>
                        </details>
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
                      <details className="mb-2 text-xs" open>
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                          <span>🧠</span>
                          <span>{locale === 'zh-Hans' ? '思考过程' : 'Thinking process'}</span>
                        </summary>
                        <div className="mt-1.5 pl-4 space-y-1 text-muted-foreground">
                          {message.thinkingSteps.map((step, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <span className="text-primary">✓</span>
                              <span>{step.label}</span>
                              {step.detail && <span>· {step.detail}</span>}
                            </div>
                          ))}
                        </div>
                      </details>
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
                      <div className={cn('text-foreground mb-3', getChatFontClass())}>
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
                  </div>
                );
              })()}
              
              {/* Form Card Message */}
              {message.type === 'form-card' && message.formCard && (
                <div className="max-w-full">
                  {/* Show thinking steps if present */}
                  {message.thinkingSteps && message.thinkingSteps.length > 0 && (
                    <details className="mb-2 text-xs" open>
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                        <span>🧠</span>
                        <span>{locale === 'zh-Hans' ? '思考过程' : 'Thinking process'}</span>
                      </summary>
                      <div className="mt-1.5 pl-4 space-y-1 text-muted-foreground">
                        {message.thinkingSteps.map((step, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="text-primary">✓</span>
                            <span>{step.label}</span>
                            {step.detail && <span>· {step.detail}</span>}
                          </div>
                        ))}
                      </div>
                    </details>
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
              {message.recordList && (
                <div className="max-w-full mt-3">
                  <RecordListCard
                    type={message.recordList.type}
                    records={message.recordList.records.map((r) => ({ ...r, type: message.recordList!.type }))}
                    title={message.recordList.title}
                  />
                </div>
              )}
            </div>
          ))}
          {/* Thinking dots removed - now shown inline in thinking message */}
        </>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
  };

  const renderInputArea = () => (
    <>
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

      {/* Input Bar */}
      <div className="px-3 pb-3 pt-2">
        <div className="relative p-[2px] rounded-2xl">
          <div className="absolute inset-0 rounded-2xl neon-glow-blur" />
          <div className="absolute inset-0 rounded-2xl neon-glow" />
          
          <div className="relative flex items-center gap-2 p-2 rounded-[14px] bg-background" style={{ backgroundColor: 'var(--background)' }}>
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Camera/Attachment Button */}
            <button
              type="button"
              onClick={handleAttachmentClick}
              className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              aria-label={locale === 'zh-Hans' ? '添加附件' : 'Add attachment'}
            >
              <Paperclip className="w-5 h-5" />
            </button>
            {/* Input Field */}
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              onFocus={handleInputFocus}
              placeholder={locale === 'zh-Hans' ? '向 Copilot 提问...' : 'Ask Copilot...'}
              className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground"
            />

            {/* Send Button */}
            {isSending ? (
              <button
                onClick={() => {}}
                className="w-10 h-10 rounded-full flex items-center justify-center text-red-500 hover:bg-muted/50 transition-colors"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                onClick={() => inputValue.trim() && sendMessage(inputValue)}
                disabled={!inputValue.trim()}
                className={cn(
                  'w-10 h-10 flex items-center justify-center transition-all',
                  inputValue.trim()
                    ? 'text-primary hover:brightness-125'
                    : 'text-muted-foreground cursor-not-allowed'
                )}
                aria-label={locale === 'zh-Hans' ? '发送' : 'Send'}
              >
                <ArrowUp className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );

  // Full screen overlay mode
  if (mode === 'overlay' && isFullScreen) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-background flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 safe-area-top">
          <button
            onClick={handleClose}
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-muted/50 transition-colors"
            aria-label={locale === 'zh-Hans' ? '关闭' : 'Close'}
          >
            <X className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium text-foreground">Ask Copilot</span>
            {isConnected && <span className="w-2 h-2 bg-green-500 rounded-full" />}
            {isConnecting && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
          <button
            onClick={() => startNewConversation()}
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-muted/50 transition-colors"
            aria-label={locale === 'zh-Hans' ? '新会话' : 'New session'}
          >
            <SquarePen className="w-5 h-5 text-foreground" />
          </button>
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

        {/* Messages */}
        {renderMessages()}

        {/* Input */}
        <div className="safe-area-bottom">
          {renderInputArea()}
        </div>
      </motion.div>
    );
  }

  // Expanded panel overlay mode
  if (mode === 'overlay') {
    return (
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[55] bg-black/30 backdrop-blur-sm"
              onClick={handleClose}
            />
            
            {/* Panel */}
            <motion.div
              ref={panelRef}
              drag="y"
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.3, bottom: 0.5 }}
              onDragEnd={(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
                if (info.offset.y < -80 || info.velocity.y < -500) {
                  openPanel(true);
                } else if (info.offset.y > 80 || info.velocity.y > 500) {
                  closePanel();
                }
              }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[60] bg-background/98 backdrop-blur-xl flex flex-col safe-area-bottom"
              style={{ 
                height: '78vh',
                borderTopLeftRadius: 20, 
                borderTopRightRadius: 20,
                boxShadow: '0 -8px 32px -4px rgba(0, 0, 0, 0.15), 0 -4px 16px -4px rgba(0, 0, 0, 0.1)'
              }}
            >
              {/* Drag handle */}
              <div 
                className="flex justify-center py-2 cursor-grab active:cursor-grabbing touch-none"
                onPointerDown={(e: React.PointerEvent) => dragControls.start(e)}
              >
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-border/30">
                <button
                  onClick={handleClose}
                  className="w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:brightness-125 active:brightness-75"
                  aria-label={locale === 'zh-Hans' ? '收起' : 'Collapse'}
                >
                  <ChevronDown className="w-4 h-4 text-foreground" />
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Ask Copilot</span>
                  {isConnected && <span className="w-2 h-2 bg-green-500 rounded-full" />}
                  {isConnecting && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
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

              {/* Messages */}
              {renderMessages()}

              {/* Input */}
              {renderInputArea()}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }

  // Embedded mode (for home page) - just renders content, no container
  return (
    <div className="flex flex-col h-full">
      {renderMessages()}
      {renderInputArea()}
    </div>
  );
}
