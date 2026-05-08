import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowUp, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLocale, getCopilotInAllScreens, getLLMConfig, getAgentFramework, type Locale } from '@/lib/i18n';
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
  const recognitionRef = useRef<SpeechRecognition | null>(null);
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

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognitionAPI) {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = locale === 'zh-Hans' ? 'zh-CN' : 'en-US';
      recognitionRef.current = recognition;
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [locale]);

  // Start voice recognition
  const startRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      toast.error(
        locale === 'zh-Hans'
          ? '您的浏览器不支持语音识别'
          : 'Your browser does not support speech recognition'
      );
      return;
    }

    recognition.onstart = () => {
      setIsRecording(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setLocalInputValue(transcript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('[Speech Recognition] Error:', event.error);
      setIsRecording(false);
      
      if (event.error === 'not-allowed') {
        toast.error(
          locale === 'zh-Hans'
            ? '请允许麦克风权限以使用语音输入'
            : 'Please allow microphone access to use voice input'
        );
      } else if (event.error !== 'aborted') {
        toast.error(
          locale === 'zh-Hans'
            ? `语音识别错误: ${event.error}`
            : `Speech recognition error: ${event.error}`
        );
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
      // Auto-send if we have transcribed text
      if (localInputValue.trim()) {
        handleSendMessage(localInputValue);
      }
    };

    try {
      recognition.start();
    } catch (err) {
      console.error('[Speech Recognition] Start error:', err);
      setIsRecording(false);
    }
  }, [locale, localInputValue, setIsRecording]);

  // Stop voice recognition
  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
  }, [setIsRecording]);

  // Toggle recording
  const handleMicClick = useCallback(() => {
    if (isRecording) {
      stopRecognition();
    } else {
      openPanel();
      startRecognition();
    }
  }, [isRecording, openPanel, startRecognition, stopRecognition]);

  // Check if copilot is configured (either Copilot Studio or BYOM)
  const copilotConfig = getCopilotConfig();
  const llmConfig = getLLMConfig();
  const isCopilotConfigured = !!copilotConfig?.tokenEndpoint || (!!llmConfig?.enabled && !!llmConfig?.endpoint);

  // Don't show on settings page
  const isSettingsPage = location.pathname === '/settings';
  
  // Hide completely if neither copilot nor BYOM is configured, or setting is disabled
  if (!enabled || !isCopilotConfigured || isSettingsPage) {
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
            {/* Input Box - Neon Glow Effect */}
            <div className="w-full max-w-md">
              <div className="relative p-[2px] rounded-2xl">
                {/* Neon glow border effect - slow flowing animation */}
                <div className="absolute inset-0 rounded-2xl neon-glow-blur" />
                <div className="absolute inset-0 rounded-2xl neon-glow" />
                
                {/* Input container - solid opaque background to block glow inside */}
                <div className="relative flex items-center gap-2 px-4 py-2 rounded-[14px] bg-background" style={{ backgroundColor: 'var(--background)' }}>
                  {/* Mic Button - Left side */}
                  <button
                    onClick={handleMicClick}
                    className={cn(
                      'w-10 h-10 flex items-center justify-center transition-all',
                      isRecording
                        ? 'text-rose-500 animate-pulse'
                        : 'text-muted-foreground hover:brightness-150'
                    )}
                    aria-label={locale === 'zh-Hans' ? '语音输入' : 'Voice input'}
                  >
                    <Mic className="w-5 h-5" />
                  </button>

                  {/* Input Field */}
                  <input
                    ref={inputRef}
                    type="text"
                    value={localInputValue}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocalInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={handleInputFocus}
                    placeholder={isRecording ? (locale === 'zh-Hans' ? '正在聆听...' : 'Listening...') : placeholder}
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
