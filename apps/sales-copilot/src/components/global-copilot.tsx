import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowUp, X, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLocale, getCopilotInAllScreens, getLLMConfig, getAgentFramework, type Locale } from '@/lib/i18n';
import { useCopilotConfigured } from '@/hooks/use-copilot-configured';
import { getCopilotConfig } from '@/services/copilot-service';
import { toast } from 'sonner';
import { useCopilot } from '@/contexts/copilot-context';
import { CopilotPanel } from '@/components/copilot-panel';

// Web Speech API type declarations
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

export function GlobalCopilot() {
  const location = useLocation();
  const [enabled, setEnabled] = useState(() => getCopilotInAllScreens());
  const [localInputValue, setLocalInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Array<{ file: File; preview: string; type: 'image' | 'file' }>>([]);
  const locale: Locale = getLocale();
  
  const { isOpen, openPanel, sendMessage, setInputValue, isRecording, setIsRecording, inputPlaceholder } = useCopilot();
  
  // Default placeholder
  const defaultPlaceholder = locale === 'zh-Hans' ? '向 Copilot 提问...' : 'Ask Copilot...';
  const placeholder = inputPlaceholder || defaultPlaceholder;

  // Listen for settings changes
  useEffect(() => {
    const handleChange = (e: CustomEvent<boolean>) => {
      setEnabled(e.detail);
    };
    window.addEventListener('copilotinallscreens-changed', handleChange as EventListener);
    return () => window.removeEventListener('copilotinallscreens-changed', handleChange as EventListener);
  }, []);

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



  // Check if AI assistant is configured for visibility (reactive to async settings hydration)
  const isCopilotConfigured = useCopilotConfigured();
  const isHomePage = location.pathname === '/' || location.pathname === '/home';
  const isSettingsPage = location.pathname === '/settings';
  const shouldShowCopilot = !isSettingsPage && isCopilotConfigured && (isHomePage || enabled);

  if (!shouldShowCopilot) {
    return null;
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && localInputValue.trim()) {
      handleSendMessage(localInputValue);
    }
  };

  const handleInputFocus = () => {
    // Check if AI assistant is configured based on selected framework
    const framework = getAgentFramework();
    if (framework === 'local-agent') {
      const llm = getLLMConfig();
      if (!llm?.enabled || !llm?.endpoint) {
        toast.info(
          locale === 'zh-Hans'
            ? '请先在设置中配置 BYOM 端点'
            : 'Please configure BYOM endpoint in Settings first'
        );
        return;
      }
    } else {
      const config = getCopilotConfig();
      if (!config?.tokenEndpoint) {
        toast.info(
          locale === 'zh-Hans'
            ? '请先在设置中配置 Copilot Studio，或切换到本地轻量级框架'
            : 'Please configure Copilot Studio in Settings, or switch to Local Lightweight Agent'
        );
        return;
      }
    }
    // Open the copilot panel overlay
    openPanel();
  };

  const handleSendMessage = (text: string) => {
    // Check if AI assistant is configured based on selected framework
    const framework = getAgentFramework();
    if (framework === 'local-agent') {
      const llm = getLLMConfig();
      if (!llm?.enabled || !llm?.endpoint) {
        toast.info(
          locale === 'zh-Hans'
            ? '请先在设置中配置 BYOM 端点'
            : 'Please configure BYOM endpoint in Settings first'
        );
        return;
      }
    } else {
      const config = getCopilotConfig();
      if (!config?.tokenEndpoint) {
        toast.info(
          locale === 'zh-Hans'
            ? '请先在设置中配置 Copilot Studio，或切换到本地轻量级框架'
            : 'Please configure Copilot Studio in Settings, or switch to Local Lightweight Agent'
        );
        return;
      }
    }
    // Open panel and send message
    openPanel();
    setInputValue(text);
    sendMessage(text);
    setLocalInputValue('');
  };

  return (
    <>
      {/* Copilot Panel Overlay */}
      <CopilotPanel mode="overlay" />
      
      {/* Input Bar (only show when panel is not open) */}
      {!isOpen && (
        <div 
          className="fixed bottom-0 left-0 right-0 z-50 safe-area-bottom pointer-events-none"
          style={{ background: 'linear-gradient(to top, var(--scm-gradient-start) 60%, transparent)' }}
        >
          <div className="flex flex-col items-center px-4 pb-6 pointer-events-auto">
            {/* Attachment Preview */}
            {attachments.length > 0 && (
              <div className="w-full max-w-md mb-2">
                <div className="flex gap-2 flex-wrap bg-background/80 backdrop-blur-sm rounded-xl p-2">
                  {attachments.map((attachment, index: number) => (
                    <div key={index} className="relative group">
                      {attachment.type === 'image' ? (
                        <div className="w-12 h-12 rounded-lg overflow-hidden border border-border/50">
                          <img
                            src={attachment.preview}
                            alt="Attachment"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-lg border border-border/50 bg-muted/50 flex flex-col items-center justify-center">
                          <Paperclip className="w-4 h-4 text-muted-foreground" />
                          <span className="text-[6px] text-muted-foreground mt-0.5 px-1 truncate max-w-full">
                            {attachment.file.name.length > 6 ? attachment.file.name.slice(0, 6) + '...' : attachment.file.name}
                          </span>
                        </div>
                      )}
                      <button
                        onClick={() => handleRemoveAttachment(index)}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Input Box - Neon Glow Effect */}
            <div className="w-full max-w-md">
              <div className="relative p-[2px] rounded-2xl">
                {/* Neon glow border effect - slow flowing animation */}
                <div className="absolute inset-0 rounded-2xl neon-glow-blur" />
                <div className="absolute inset-0 rounded-2xl neon-glow" />
                
                {/* Input container - solid opaque background to block glow inside */}
                <div className="relative flex items-center gap-2 px-4 py-2 rounded-[14px] bg-background" style={{ backgroundColor: 'var(--background)' }}>
                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {/* Camera/Attachment Button - Left side */}
                  <button
                    onClick={handleAttachmentClick}
                    className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full transition-colors"
                    aria-label={locale === 'zh-Hans' ? '添加附件' : 'Add attachment'}
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>

                  {/* Input Field */}
                  <input
                    ref={inputRef}
                    type="text"
                    value={localInputValue}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocalInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={handleInputFocus}
                    placeholder={placeholder}
                    className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground"
                  />

                  {/* Send Button - Arrow Up style */}
                  <button
                    onClick={() => localInputValue.trim() && handleSendMessage(localInputValue)}
                    disabled={!localInputValue.trim()}
                    className={cn(
                      'w-10 h-10 flex items-center justify-center transition-all',
                      localInputValue.trim()
                        ? 'text-primary hover:brightness-125'
                        : 'text-muted-foreground cursor-not-allowed'
                    )}
                    aria-label={locale === 'zh-Hans' ? '发送' : 'Send'}
                  >
                    <ArrowUp className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
