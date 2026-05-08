import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Moon, Sun, Globe, HelpCircle, LogOut, Volume2, Play, Loader2, CheckCircle2, XCircle, Type, Palette, CircleDot, LayoutGrid, Speech, X, Zap, Bot, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUser } from '@/hooks/use-user';
import { getLocale, setLocale, t, getVoicesForLocale, getSelectedVoice, setSelectedVoice, getFontSizeConfig, setFontSizeConfig, getAutoPlayAgentResponse, setAutoPlayAgentResponse, getColorTheme, setColorTheme, colorThemeLabels, getThinkingDotStyle, setThinkingDotStyle, thinkingDotStyleLabels, getOrganizeInStructureCard, setOrganizeInStructureCard, getVoiceSummaryEnabled, setVoiceSummaryEnabled, getCopilotInAllScreens, setCopilotInAllScreens, getLLMConfig, setLLMConfig, testBYOMConnection, clearAzureADTokenCache, findMatchingSystemVoice, getSelectedSystemVoiceName, setSelectedSystemVoiceName, getSimulateStreaming, setSimulateStreaming, type Locale, type VoiceOption, type FontSizeOption, type ColorTheme, type ThinkingDotStyle, type LLMProvider, type LLMConfig, type AzureAuthType } from '@/lib/i18n';
import { getCopilotConfig, saveCopilotConfig, clearCopilotConfig, testConnection } from '@/services/copilot-service';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
} as const;

interface SettingsItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  danger?: boolean;
  rightElement?: React.ReactNode;
}

function SettingsItem({ icon: Icon, label, onClick, danger, rightElement }: SettingsItemProps) {
  return (
    <motion.div
      variants={itemVariants}
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-1 py-2',
        onClick && 'cursor-pointer hover:bg-white/5 rounded-lg transition-colors',
        danger ? 'text-destructive' : 'text-foreground'
      )}
    >
      <Icon className="w-5 h-5" />
      <span className="text-body flex-1">{label}</span>
      {rightElement}
    </motion.div>
  );
}

interface SettingsPanelProps {
  onClose?: () => void;
  isOverlay?: boolean;
}

export function SettingsPanel({ onClose, isOverlay = false }: SettingsPanelProps) {
  const { data: user } = useUser();
  const [locale, setLocaleState] = useState<Locale>(getLocale);
  const [isDark, setIsDark] = useState(true);
  const [selectedVoice, setSelectedVoiceState] = useState(getSelectedVoice);
  const voicesForLocale = getVoicesForLocale(locale);
  const [isPlaying, setIsPlaying] = useState(false);
  const [systemVoicesLoaded, setSystemVoicesLoaded] = useState(false);
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedSystemVoice, setSelectedSystemVoiceState] = useState<string>(() => getSelectedSystemVoiceName() || '');

  // Power Automate endpoint state
  const [copilotEndpoint, setCopilotEndpoint] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'none' | 'success' | 'error'>('none');

  // Font size state
  const [chatFontSize, setChatFontSize] = useState<FontSizeOption>(() => getFontSizeConfig().chat);
  const [uiFontSize, setUIFontSize] = useState<FontSizeOption>(() => getFontSizeConfig().ui);
  const [autoPlayResponse, setAutoPlayResponseState] = useState(getAutoPlayAgentResponse);
  const [colorTheme, setColorThemeState] = useState<ColorTheme>(() => getColorTheme());
  const [thinkingDotStyle, setThinkingDotStyleState] = useState<ThinkingDotStyle>(() => getThinkingDotStyle());
  const [organizeInStructureCard, setOrganizeInStructureCardState] = useState(() => getOrganizeInStructureCard());
  const [voiceSummaryEnabled, setVoiceSummaryEnabledState] = useState(() => getVoiceSummaryEnabled());
  const [copilotInAllScreens, setCopilotInAllScreensState] = useState(() => getCopilotInAllScreens());
  const [simulateStreaming, setSimulateStreamingState] = useState(() => getSimulateStreaming());

  // Power Automate LLM state
  const [llmProvider, setLLMProviderState] = useState<LLMProvider>('power-automate');
  const [llmApiKey, setLLMApiKey] = useState('');
  const [llmEndpoint, setLLMEndpoint] = useState('');
  const [llmDeploymentName, setLLMDeploymentName] = useState('');
  const [llmModel, setLLMModel] = useState('');
  const [llmEnabled, setLLMEnabled] = useState(false);
  const [isByomTesting, setIsByomTesting] = useState(false);
  const [byomTestStatus, setByomTestStatus] = useState<'none' | 'success' | 'error'>('none');
  // Azure AD Service Principal fields
  const [azureAuthType, setAzureAuthType] = useState<AzureAuthType>('api-key');
  const [azureTenantId, setAzureTenantId] = useState('');
  const [azureClientId, setAzureClientId] = useState('');
  const [azureClientSecret, setAzureClientSecret] = useState('');

  // Copilot Studio tool configuration
  const [copilotStudioEnabled, setCopilotStudioEnabled] = useState(false);
  const [copilotStudioEndpoint, setCopilotStudioEndpoint] = useState('');

  const [isCopilotStudioTesting, setIsCopilotStudioTesting] = useState(false);
  const [copilotStudioTestStatus, setCopilotStudioTestStatus] = useState<'none' | 'success' | 'error'>('none');
  // Load Copilot config on mount
  useEffect(() => {
    const config = getCopilotConfig();
    if (config) {
      setCopilotEndpoint(config.tokenEndpoint);
      setConnectionStatus('success');
    }
  }, []);

  // Load BYOM config on mount
  useEffect(() => {
    const config = getLLMConfig();
    if (config) {
      setLLMProviderState(config.provider);
      setLLMApiKey(config.apiKey || '');
      setLLMEndpoint(config.endpoint || '');
      setLLMDeploymentName(config.deploymentName || '');
      setLLMModel(config.model || '');
      setLLMEnabled(config.enabled);
      // Azure AD fields
      setAzureAuthType(config.azureAuthType || 'api-key');
      setAzureTenantId(config.azureTenantId || '');
      setAzureClientId(config.azureClientId || '');
      setAzureClientSecret(config.azureClientSecret || '');
    } else {
      // Default to power-automate for local-agent
      setLLMProviderState('power-automate');
    }
  }, []);

  // Load Copilot Studio config on mount
  useEffect(() => {
    const savedConfig = localStorage.getItem('copilot-studio-config');
    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig);
        setCopilotStudioEnabled(config.enabled ?? false);
        setCopilotStudioEndpoint(config.endpoint ?? '');
        setCopilotStudioEndpoint(config.endpoint ?? '');
        if (config.endpoint) {
          setCopilotStudioTestStatus('success');
        }
      } catch (e) {
        console.error('Failed to parse Copilot Studio config', e);
      }
    }
  }, []);

  // Save Copilot Studio config
  const saveCopilotStudioConfig = () => {
    const config = {
      enabled: copilotStudioEnabled,
      endpoint: copilotStudioEndpoint,
    };
    localStorage.setItem('copilot-studio-config', JSON.stringify(config));
  };
  // Auto-save Copilot Studio config
  useEffect(() => {
    const timeoutId = setTimeout(saveCopilotStudioConfig, 500);
    return () => clearTimeout(timeoutId);
  }, [copilotStudioEnabled, copilotStudioEndpoint]);

  const handleTestCopilotStudioConnection = async () => {
    if (!copilotStudioEndpoint) {
      toast.error(locale === 'zh-Hans' ? '请先配置 Copilot Studio 端点' : 'Please configure Copilot Studio endpoint first');
      return;
    }

    setIsCopilotStudioTesting(true);
    setCopilotStudioTestStatus('none');

    try {
      // Token endpoint test - fetch token from the endpoint
      const response = await fetch(copilotStudioEndpoint, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          setCopilotStudioTestStatus('success');
          if (!copilotStudioEnabled) {
            setCopilotStudioEnabled(true);
          }
          toast.success(locale === 'zh-Hans' ? 'Copilot Studio Token 端点连接成功' : 'Copilot Studio token endpoint connected successfully');
        } else {
          setCopilotStudioTestStatus('error');
          toast.error(locale === 'zh-Hans' ? '无效的 Token 响应' : 'Invalid token response');
        }
      } else {
        setCopilotStudioTestStatus('error');
        toast.error(locale === 'zh-Hans' ? `连接失败: ${response.statusText}` : `Connection failed: ${response.statusText}`);
      }
    } catch (err: unknown) {
      setCopilotStudioTestStatus('error');
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(locale === 'zh-Hans' ? `连接测试失败: ${errorMessage}` : `Connection test failed: ${errorMessage}`);
    } finally {
      setIsCopilotStudioTesting(false);
    }
  };

  const handleClearCopilotStudioConfig = () => {
    setCopilotStudioEnabled(false);
    setCopilotStudioEndpoint('');
    setCopilotStudioTestStatus('none');
    localStorage.removeItem('copilot-studio-config');
    toast.success(locale === 'zh-Hans' ? 'Copilot Studio 配置已清除' : 'Copilot Studio configuration cleared');
  };

  // Save BYOM config when it changes
  const saveLLMConfig = () => {
    if (!llmProvider) {
      setLLMConfig(null);
      return;
    }
    const config: LLMConfig = {
      provider: llmProvider,
      apiKey: llmApiKey || undefined,
      endpoint: llmEndpoint || undefined,
      deploymentName: llmDeploymentName || undefined,
      model: llmModel || undefined,
      enabled: llmEnabled,
      // Azure AD fields (only for azure-openai)
      azureAuthType: llmProvider === 'azure-openai' ? azureAuthType : undefined,
      azureTenantId: llmProvider === 'azure-openai' && azureAuthType === 'service-principal' ? azureTenantId || undefined : undefined,
      azureClientId: llmProvider === 'azure-openai' && azureAuthType === 'service-principal' ? azureClientId || undefined : undefined,
      azureClientSecret: llmProvider === 'azure-openai' && azureAuthType === 'service-principal' ? azureClientSecret || undefined : undefined,
    };

    setLLMConfig(config);
  };

  // Auto-save BYOM config with debounce
  useEffect(() => {
    if (!llmProvider) return;
    const timeoutId = setTimeout(saveLLMConfig, 500);
    return () => clearTimeout(timeoutId);
  }, [llmProvider, llmApiKey, llmEndpoint, llmDeploymentName, llmModel, llmEnabled, azureAuthType, azureTenantId, azureClientId, azureClientSecret]);

  const handleLLMProviderChange = (provider: string) => {
    setLLMProviderState(provider as LLMProvider);
    // Reset fields when provider changes
    setLLMApiKey('');
    setLLMEndpoint('');
    setLLMDeploymentName('');
    setLLMModel('');
    setByomTestStatus('none');
    // Reset Azure AD fields
    setAzureAuthType('api-key');
    setAzureTenantId('');
    setAzureClientId('');
    setAzureClientSecret('');
    clearAzureADTokenCache();
  };

  const handleClearLLMConfig = () => {
    setLLMProviderState('power-automate');
    setLLMApiKey('');
    setLLMEndpoint('');
    setLLMDeploymentName('');
    setLLMModel('');
    setLLMEnabled(false);
    setByomTestStatus('none');
    // Clear Azure AD fields
    setAzureAuthType('api-key');
    setAzureTenantId('');
    setAzureClientId('');
    setAzureClientSecret('');
    clearAzureADTokenCache();
    setLLMConfig(null);
    toast.success(locale === 'zh-Hans' ? 'BYOM 配置已清除' : 'BYOM configuration cleared');
  };

  const handleTestBYOMConnection = async () => {
    if (!llmProvider || !llmEndpoint) {
      toast.error(locale === 'zh-Hans' ? '请先配置提供商和端点' : 'Please configure provider and endpoint first');
      return;
    }
    
    setIsByomTesting(true);
    setByomTestStatus('none');
    
    try {
      const config: LLMConfig = {
        provider: llmProvider,
        apiKey: llmApiKey || undefined,
        endpoint: llmEndpoint || undefined,
        deploymentName: llmDeploymentName || undefined,
        model: llmModel || undefined,
        enabled: llmEnabled,
        // Azure AD fields
        azureAuthType: llmProvider === 'azure-openai' ? azureAuthType : undefined,
        azureTenantId: llmProvider === 'azure-openai' && azureAuthType === 'service-principal' ? azureTenantId || undefined : undefined,
        azureClientId: llmProvider === 'azure-openai' && azureAuthType === 'service-principal' ? azureClientId || undefined : undefined,
        azureClientSecret: llmProvider === 'azure-openai' && azureAuthType === 'service-principal' ? azureClientSecret || undefined : undefined,
      };
      
      const result = await testBYOMConnection(config);
      
      if (result.success) {
        setByomTestStatus('success');
        // Auto-enable when test is successful
        if (!llmEnabled) {
          setLLMEnabled(true);
        }
        const latencyText = result.latencyMs ? t('byomLatency', locale, { ms: result.latencyMs }) : '';
        toast.success(`${t('byomTestSuccess', locale)} ${latencyText} ${result.modelInfo ? `(${result.modelInfo})` : ''}`);
      } else {
        setByomTestStatus('error');
        toast.error(`${t('byomTestFailed', locale)}: ${result.error}`);
      }
    } catch (err: unknown) {
      setByomTestStatus('error');
      const errorMessage = err instanceof Error 
        ? err.message 
        : (locale === 'zh-Hans' ? '连接测试失败，请检查网络连接和配置' : 'Connection test failed. Please check your network connection and settings.');
      toast.error(errorMessage);
    } finally {
      setIsByomTesting(false);
    }
  };

  // Auto-save Copilot endpoint
  useEffect(() => {
    if (!copilotEndpoint.trim()) return;
    
    const timeoutId = setTimeout(() => {
      saveCopilotConfig({ tokenEndpoint: copilotEndpoint.trim() });
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [copilotEndpoint]);

  // Load system voices
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        setSystemVoices(voices);
        setSystemVoicesLoaded(true);
        // Initialize selected voice if not set
        if (!selectedSystemVoice && voices.length > 0) {
          const savedVoiceName = getSelectedSystemVoiceName();
          if (savedVoiceName) {
            setSelectedSystemVoiceState(savedVoiceName);
          } else {
            // Find a good default voice based on locale
            const chineseVoice = voices.find((v: SpeechSynthesisVoice) => v.lang.startsWith('zh'));
            const defaultVoice = chineseVoice || voices[0];
            setSelectedSystemVoiceState(defaultVoice.name);
            setSelectedSystemVoiceName(defaultVoice.name);
          }
        }
      }
    };
    
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // Listen for locale changes
  useEffect(() => {
    const handleLocaleChange = (e: CustomEvent<Locale>) => {
      setLocaleState(e.detail);
    };
    window.addEventListener('locale-changed', handleLocaleChange as EventListener);
    return () => window.removeEventListener('locale-changed', handleLocaleChange as EventListener);
  }, []);

  const handleLocaleChange = (newLocale: Locale) => {
    setLocaleState(newLocale);
    setLocale(newLocale);
    window.location.reload();
  };

  const handleChatFontSizeChange = (size: string) => {
    const newSize = size as FontSizeOption;
    setChatFontSize(newSize);
    setFontSizeConfig({ chat: newSize, ui: uiFontSize });
  };

  const handleUIFontSizeChange = (size: string) => {
    const newSize = size as FontSizeOption;
    setUIFontSize(newSize);
    setFontSizeConfig({ chat: chatFontSize, ui: newSize });
  };

  const handleColorThemeChange = (theme: string) => {
    const newTheme = theme as ColorTheme;
    setColorThemeState(newTheme);
    setColorTheme(newTheme);
  };

  const handleThinkingDotStyleChange = (style: ThinkingDotStyle) => {
    setThinkingDotStyleState(style);
    setThinkingDotStyle(style);
  };

  const handleVoiceChange = (voiceId: string) => {
    setSelectedVoiceState(voiceId);
    setSelectedVoice(voiceId);
  };

  const handleSystemVoiceChange = (voiceName: string) => {
    setSelectedSystemVoiceState(voiceName);
    setSelectedSystemVoiceName(voiceName);
  };

  const handleAutoPlayChange = (enabled: boolean) => {
    setAutoPlayResponseState(enabled);
    setAutoPlayAgentResponse(enabled);
  };

  const handleOrganizeInStructureCardChange = (enabled: boolean) => {
    setOrganizeInStructureCardState(enabled);
    setOrganizeInStructureCard(enabled);
  };

  const handleVoiceSummaryEnabledChange = (enabled: boolean) => {
    setVoiceSummaryEnabledState(enabled);
    setVoiceSummaryEnabled(enabled);
  };

  const handleCopilotInAllScreensChange = (enabled: boolean) => {
    setCopilotInAllScreensState(enabled);
    setCopilotInAllScreens(enabled);
  };

  const handleSimulateStreamingChange = (enabled: boolean) => {
    setSimulateStreamingState(enabled);
    setSimulateStreaming(enabled);
  };


  const playVoicePreview = async () => {
    if (isPlaying) return;
    
    window.speechSynthesis.cancel();
    
    // Get latest voices
    let voices = systemVoices;
    if (voices.length === 0) {
      voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) {
        await new Promise<void>((resolve) => {
          const checkVoices = () => {
            voices = window.speechSynthesis.getVoices();
            if (voices.length > 0) {
              resolve();
            } else {
              setTimeout(checkVoices, 100);
            }
          };
          checkVoices();
        });
      }
    }
    
    const sampleText = locale === 'zh-Hans' 
      ? '您好，我是您的销售助手，很高兴为您服务。'
      : 'Hello, I am your sales assistant. Nice to meet you.';
    
    const utterance = new SpeechSynthesisUtterance(sampleText);
    utterance.lang = locale === 'zh-Hans' ? 'zh-CN' : 'en-US';
    
    // Find the selected system voice directly by name
    const selectedVoice = voices.find((v: SpeechSynthesisVoice) => v.name === selectedSystemVoice);
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      console.log(`[Voice Preview] Using voice: ${selectedVoice.name} (lang: ${selectedVoice.lang})`);
    } else {
      // Fallback: try to find any voice for the current locale
      const langCode = locale === 'zh-Hans' ? 'zh' : 'en';
      const fallbackVoice = voices.find((v: SpeechSynthesisVoice) => v.lang.startsWith(langCode));
      if (fallbackVoice) {
        utterance.voice = fallbackVoice;
        console.log(`[Voice Preview] Fallback voice: ${fallbackVoice.name}`);
      } else {
        console.log('[Voice Preview] No matching voice found, using system default');
      }
    }
    
    utterance.rate = 0.95;
    utterance.pitch = 1;
    
    setIsPlaying(true);
    
    utterance.onend = () => {
      setIsPlaying(false);
    };
    
    utterance.onerror = () => {
      setIsPlaying(false);
    };
    
    window.speechSynthesis.speak(utterance);
  };

  // Update voice when locale changes
  useEffect(() => {
    const voices = getVoicesForLocale(locale);
    const currentVoice = voices.find((v: VoiceOption) => v.id === selectedVoice);
    if (!currentVoice && voices.length > 0) {
      handleVoiceChange(voices[0].id);
    }
  }, [locale, selectedVoice]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setIsDark(savedTheme === 'dark');
      document.documentElement.classList.remove('dark', 'light');
      document.documentElement.classList.add(savedTheme);
    } else {
      const root = document.documentElement;
      const isDarkMode = root.classList.contains('dark');
      setIsDark(isDarkMode);
      if (!isDarkMode && !root.classList.contains('light')) {
        root.classList.add('dark');
        setIsDark(true);
        localStorage.setItem('theme', 'dark');
      }
    }
  }, []);

  const toggleTheme = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    
    const html = document.documentElement;
    html.classList.remove('dark', 'light');
    html.classList.add(newIsDark ? 'dark' : 'light');
    
    document.body.classList.remove('dark', 'light');
    document.body.classList.add(newIsDark ? 'dark' : 'light');
    
    localStorage.setItem('theme', newIsDark ? 'dark' : 'light');
    
    document.body.style.display = 'none';
    document.body.offsetHeight;
    document.body.style.display = '';
  };

  const handleTestConnection = async () => {
    if (!copilotEndpoint.trim()) {
      toast.error(locale === 'zh-Hans' ? '请输入 Token Endpoint URL' : 'Please enter Token Endpoint URL');
      return;
    }

    setIsTesting(true);
    setConnectionStatus('none');

    const result = await testConnection(copilotEndpoint.trim());

    if (result.success) {
      saveCopilotConfig({ tokenEndpoint: copilotEndpoint.trim() });
      setConnectionStatus('success');
      toast.success(locale === 'zh-Hans' ? '连接成功！' : 'Connected successfully!');
    } else {
      setConnectionStatus('error');
      toast.error(locale === 'zh-Hans' ? `连接失败: ${result.error}` : `Connection failed: ${result.error}`);
    }

    setIsTesting(false);
  };

  const handleClearConfig = () => {
    clearCopilotConfig();
    setCopilotEndpoint('');
    setConnectionStatus('none');
    toast.success(locale === 'zh-Hans' ? '配置已清除' : 'Configuration cleared');
  };

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.split(' ');
    return parts[0]?.charAt(0)?.toUpperCase() || 'U';
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'linear-gradient(180deg, var(--scm-gradient-start) 0%, var(--scm-gradient-end) 100%)' }}>
      {/* Header */}
      <header className="sticky top-0 z-40 glass-surface border-b border-border/50 safe-area-top">
        <div className="flex items-center justify-between h-14 px-4">
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors"
            aria-label="Close"
          >
            {isOverlay ? <X className="w-5 h-5 text-foreground" /> : <ArrowLeft className="w-5 h-5 text-foreground" />}
          </button>
          <h1 className="text-title text-foreground">{t('settings', locale)}</h1>
          <div className="w-10" />
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 pb-8 px-4 overflow-y-auto scrollbar-hide">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="space-y-6 py-4"
        >
          {/* Profile Section */}
          <motion.div variants={itemVariants} className="px-2 py-4 flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-full flex-shrink-0 flex items-center justify-center text-lg font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #FF7A00 0%, #FF9933 100%)', aspectRatio: '1 / 1' }}
            >
              {getInitials(user?.fullName)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-title text-foreground truncate">{user?.fullName || 'Sales User'}</p>
              <p className="text-helper text-muted-foreground truncate">{user?.userPrincipalName || 'user@example.com'}</p>
            </div>
          </motion.div>


          {/* General Section */}
          <motion.div variants={itemVariants} className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              {locale === 'zh-Hans' ? '通用' : 'General'}
            </h3>
            <div className="space-y-2">
              <SettingsItem
                icon={Globe}
                label={locale === 'zh-Hans' ? '语言' : 'Language'}
                rightElement={
                  <Select value={locale} onValueChange={(val: string) => handleLocaleChange(val as Locale)}>
                    <SelectTrigger className="w-28 h-8 text-sm bg-transparent border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zh-Hans">中文</SelectItem>
                      <SelectItem value="en-US">English</SelectItem>
                    </SelectContent>
                  </Select>
                }
              />
            </div>
          </motion.div>

          {/* Style Section */}
          <motion.div variants={itemVariants} className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              {locale === 'zh-Hans' ? '风格' : 'Style'}
            </h3>
            <div className="space-y-2">
              <SettingsItem
                icon={isDark ? Moon : Sun}
                label={locale === 'zh-Hans' ? '深色模式' : 'Dark Mode'}
                rightElement={
                  <Switch
                    checked={isDark}
                    onCheckedChange={toggleTheme}
                    className="data-[state=checked]:bg-primary"
                  />
                }
              />
              <SettingsItem
                icon={Type}
                label={t('chatFontSize', locale)}
                rightElement={
                  <Select value={chatFontSize} onValueChange={handleChatFontSizeChange}>
                    <SelectTrigger className="w-28 h-8 text-sm bg-transparent border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">{t('fontSizeSmall', locale)}</SelectItem>
                      <SelectItem value="medium">{t('fontSizeMedium', locale)}</SelectItem>
                      <SelectItem value="large">{t('fontSizeLarge', locale)}</SelectItem>
                    </SelectContent>
                  </Select>
                }
              />
              <SettingsItem
                icon={Type}
                label={t('uiFontSize', locale)}
                rightElement={
                  <Select value={uiFontSize} onValueChange={handleUIFontSizeChange}>
                    <SelectTrigger className="w-28 h-8 text-sm bg-transparent border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">{t('fontSizeSmall', locale)}</SelectItem>
                      <SelectItem value="medium">{t('fontSizeMedium', locale)}</SelectItem>
                      <SelectItem value="large">{t('fontSizeLarge', locale)}</SelectItem>
                    </SelectContent>
                  </Select>
                }
              />
              <div className="w-full flex items-center gap-3 px-1 py-2">
                <Palette className="w-5 h-5" />
                <span className="text-body flex-1">{t('colorTheme', locale)}</span>
                <div className="flex gap-1.5">
                  {(Object.keys(colorThemeLabels) as ColorTheme[]).map((theme: ColorTheme) => (
                    <button
                      key={theme}
                      onClick={() => handleColorThemeChange(theme)}
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center transition-all border-2',
                        colorTheme === theme
                          ? 'border-foreground scale-110'
                          : 'border-transparent hover:scale-105'
                      )}

                      title={locale === 'zh-Hans' ? colorThemeLabels[theme].zh : colorThemeLabels[theme].en}
                      aria-label={locale === 'zh-Hans' ? colorThemeLabels[theme].zh : colorThemeLabels[theme].en}
                    >
                      <div
                        className="w-6 h-6 rounded-full"
                        style={{
                          background: `linear-gradient(135deg, ${colorThemeLabels[theme].colors[0]} 0%, ${colorThemeLabels[theme].colors[1]} 100%)`
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <SettingsItem
                icon={CircleDot}
                label={t('thinkingDotStyle', locale)}
                rightElement={
                  <Select value={thinkingDotStyle} onValueChange={(val: string) => handleThinkingDotStyleChange(val as ThinkingDotStyle)}>
                    <SelectTrigger className="w-28 h-8 text-sm bg-transparent border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(thinkingDotStyleLabels) as ThinkingDotStyle[]).map((style: ThinkingDotStyle) => (
                        <SelectItem key={style} value={style}>
                          {locale === 'zh-Hans' ? thinkingDotStyleLabels[style].zh : thinkingDotStyleLabels[style].en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
              />
            </div>
          </motion.div>

          {/* AI Assistant Configuration - Always show Power Automate Endpoint */}
          <motion.div variants={itemVariants} className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              {locale === 'zh-Hans' ? 'AI 助手配置' : 'AI Assistant Configuration'}
            </h3>
            <div className="glass-card p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                {locale === 'zh-Hans'
                  ? 'Power Automate Flow 作为 AI 功能调用后端，Copilot Studio 和本地数据操作作为工具函数'
                  : 'Power Automate Flow serves as the AI function calling backend, with Copilot Studio and local data operations as tool functions'}
              </p>
              
              {/* Power Automate Endpoint - Always show */}
              <div className="pt-3 border-t border-border/30 space-y-3">
                <div className="space-y-2">
                  <label className="text-helper text-muted-foreground">
                    {locale === 'zh-Hans' ? 'Power Automate Flow URL' : 'Power Automate Flow URL'}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={llmEndpoint}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        setLLMEndpoint(e.target.value);
                        setByomTestStatus('none');
                      }}
                      placeholder="https://...powerplatform.com/..."
                      className="flex-1 bg-muted/50 border-border/50 text-sm"
                    />
                    {byomTestStatus === 'success' && (
                      <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 my-auto" />
                    )}
                    {byomTestStatus === 'error' && (
                      <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 my-auto" />
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleTestBYOMConnection}
                    disabled={isByomTesting || !llmEndpoint}
                    className="flex-1"
                    variant={byomTestStatus === 'success' ? 'outline' : 'default'}
                  >
                    {isByomTesting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {locale === 'zh-Hans' ? '测试中...' : 'Testing...'}
                      </>
                    ) : byomTestStatus === 'success' ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
                        {locale === 'zh-Hans' ? '重新测试' : 'Re-test'}
                      </>
                    ) : byomTestStatus === 'error' ? (
                      <>
                        <XCircle className="w-4 h-4 mr-2 text-red-500" />
                        {locale === 'zh-Hans' ? '测试连接' : 'Test Connection'}
                      </>
                    ) : (
                      locale === 'zh-Hans' ? '测试连接' : 'Test Connection'
                    )}
                  </Button>
                  {llmEndpoint && (
                    <Button
                      onClick={() => {
                        setLLMEndpoint('');
                        setByomTestStatus('none');
                        setLLMEnabled(false);
                        setLLMConfig(null);
                        toast.success(locale === 'zh-Hans' ? '配置已清除' : 'Configuration cleared');
                      }}
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                    >
                      {locale === 'zh-Hans' ? '清除' : 'Clear'}
                    </Button>
                  )}
                </div>
              </div>

              {/* Information Structure toggles */}
              <div className="pt-3 border-t border-border/30 space-y-2">
                <div className={cn(
                  'transition-opacity',
                  !llmEndpoint && 'opacity-50'
                )}>
                  <SettingsItem
                    icon={LayoutGrid}
                    label={t('organizeInStructureCard', locale)}
                    rightElement={
                      <Switch
                        checked={organizeInStructureCard}
                        onCheckedChange={handleOrganizeInStructureCardChange}
                        disabled={!llmEndpoint}
                        className="data-[state=checked]:bg-primary"
                      />
                    }
                  />
                </div>
                <div className={cn(
                  'transition-opacity',
                  !llmEndpoint && 'opacity-50'
                )}>
                  <SettingsItem
                    icon={Speech}
                    label={t('voiceSummary', locale)}
                    rightElement={
                      <Switch
                        checked={voiceSummaryEnabled}
                        onCheckedChange={handleVoiceSummaryEnabledChange}
                        disabled={!llmEndpoint}
                        className="data-[state=checked]:bg-primary"
                      />
                    }
                  />
                </div>
                {!llmEndpoint && (
                  <p className="text-xs text-muted-foreground/70 px-1 pt-1">
                    {locale === 'zh-Hans'
                      ? '请先配置 Power Automate Endpoint'
                      : 'Configure Power Automate Endpoint first'}
                  </p>
                )}
              </div>

              {/* Display copilot in all screens toggle */}
              <div className="pt-3 border-t border-border/30">
                <SettingsItem
                  icon={LayoutGrid}
                  label={locale === 'zh-Hans' ? '在所有页面显示 Copilot' : 'Display Copilot in all screens'}
                  rightElement={
                    <Switch
                      checked={copilotInAllScreens}
                      onCheckedChange={handleCopilotInAllScreensChange}
                    />
                  }
                />
                <p className="text-xs text-muted-foreground mt-1 pl-8">
                  {locale === 'zh-Hans'
                    ? '启用后，Ask Copilot 输入框将显示在所有页面底部'
                    : 'When enabled, Ask Copilot input will appear at the bottom of all screens'}
                </p>
              </div>

              {/* Simulate streaming toggle */}
              <div className="pt-3 border-t border-border/30">
                <SettingsItem
                  icon={Zap}
                  label={locale === 'zh-Hans' ? '模拟流式输出' : 'Simulate Streaming'}
                  rightElement={
                    <Switch
                      checked={simulateStreaming}
                      onCheckedChange={handleSimulateStreamingChange}
                    />
                  }
                />
                <p className="text-xs text-muted-foreground mt-1 pl-8">
                  {locale === 'zh-Hans'
                    ? '启用后，AI 回复将逐字显示，模拟打字效果'
                    : 'When enabled, AI responses will appear word by word with typing effect'}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Agent Configuration Section */}
          <motion.div variants={itemVariants} className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              {locale === 'zh-Hans' ? 'Agent 配置' : 'Agent Configuration'}
            </h3>
            <div className="glass-card p-4 space-y-4">
              {/* Copilot Studio Tool Configuration */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {locale === 'zh-Hans' ? 'Copilot Studio 工具' : 'Copilot Studio Tool'}
                    </span>
                  </div>
                  <Switch
                    checked={copilotStudioEnabled}
                    onCheckedChange={setCopilotStudioEnabled}
                    disabled={!copilotStudioEndpoint}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {locale === 'zh-Hans'
                    ? 'Copilot Studio 作为 Power Automate 的工具函数，处理对话式 AI 交互'
                    : 'Copilot Studio as a tool function for Power Automate, handling conversational AI interactions'}
                </p>

                <div className="space-y-2">
                  <label className="text-helper text-muted-foreground">
                    {locale === 'zh-Hans' ? 'Token 端点' : 'Token Endpoint'}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={copilotStudioEndpoint}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        setCopilotStudioEndpoint(e.target.value);
                        setCopilotStudioTestStatus('none');
                      }}
                      placeholder="https://default...token.botframework.com/api/token"
                      className="flex-1 bg-muted/50 border-border/50 text-sm"
                    />
                    {copilotStudioTestStatus === 'success' && (
                      <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 my-auto" />
                    )}
                    {copilotStudioTestStatus === 'error' && (
                      <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 my-auto" />
                    )}
                  </div>
                </div>


                <div className="flex gap-2">
                  <Button
                    onClick={handleTestCopilotStudioConnection}
                    disabled={isCopilotStudioTesting || !copilotStudioEndpoint}
                    className="flex-1"
                    variant={copilotStudioTestStatus === 'success' ? 'outline' : 'default'}
                  >
                    {isCopilotStudioTesting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {locale === 'zh-Hans' ? '测试中...' : 'Testing...'}
                      </>
                    ) : copilotStudioTestStatus === 'success' ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
                        {locale === 'zh-Hans' ? '重新测试' : 'Re-test'}
                      </>
                    ) : copilotStudioTestStatus === 'error' ? (
                      <>
                        <XCircle className="w-4 h-4 mr-2 text-red-500" />
                        {locale === 'zh-Hans' ? '测试连接' : 'Test Connection'}
                      </>
                    ) : (
                      <>
                        <MessageSquare className="w-4 h-4 mr-2" />
                        {locale === 'zh-Hans' ? '测试连接' : 'Test Connection'}
                      </>
                    )}
                  </Button>
                  {copilotStudioEndpoint && (
                    <Button
                      onClick={handleClearCopilotStudioConfig}
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                    >
                      {locale === 'zh-Hans' ? '清除' : 'Clear'}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>



          {/* Voice Section */}
          <motion.div variants={itemVariants} className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              {locale === 'zh-Hans' ? '语音' : 'Voice'}
            </h3>
            <div className="space-y-2">
              <SettingsItem
                icon={Volume2}
                label={t('voiceSetting', locale)}
                rightElement={
                  <div className="flex items-center gap-2">
                    <Select value={selectedSystemVoice || ''} onValueChange={(name: string) => {
                      setSelectedSystemVoiceState(name);
                      setSelectedSystemVoiceName(name);
                    }}>
                      <SelectTrigger className="w-32 h-8 text-sm bg-transparent border-border/50">
                        <SelectValue placeholder={locale === 'zh-Hans' ? '选择声音' : 'Select voice'} />
                      </SelectTrigger>
                      <SelectContent>
                        {systemVoices.length === 0 ? (
                          <div className="px-2 py-2 text-xs text-muted-foreground">
                            {locale === 'zh-Hans' ? '正在加载声音...' : 'Loading voices...'}
                          </div>
                        ) : (
                          <>
                            {/* Group voices by language */}
                            {(() => {
                              const langCode = locale === 'zh-Hans' ? 'zh' : 'en';
                              const matchingVoices = systemVoices.filter((v: SpeechSynthesisVoice) => v.lang.startsWith(langCode));
                              const otherVoices = systemVoices.filter((v: SpeechSynthesisVoice) => !v.lang.startsWith(langCode));
                              
                              return (
                                <>
                                  {matchingVoices.length > 0 && (
                                    <>
                                      <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium">
                                        {locale === 'zh-Hans' ? '推荐' : 'Recommended'}
                                      </div>
                                      {matchingVoices.map((voice: SpeechSynthesisVoice) => (
                                        <SelectItem key={voice.name} value={voice.name}>
                                          {voice.name.replace(/Microsoft |Google |Apple /, '')}
                                        </SelectItem>
                                      ))}
                                    </>
                                  )}
                                  {otherVoices.length > 0 && (
                                    <>
                                      <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium border-t border-border/50 mt-1 pt-1.5">
                                        {locale === 'zh-Hans' ? '其他' : 'Other'}
                                      </div>
                                      {otherVoices.slice(0, 10).map((voice: SpeechSynthesisVoice) => (
                                        <SelectItem key={voice.name} value={voice.name}>
                                          {voice.name.replace(/Microsoft |Google |Apple /, '')}
                                        </SelectItem>
                                      ))}
                                    </>
                                  )}
                                </>
                              );
                            })()}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                    <button
                      onClick={playVoicePreview}
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center transition-all flex-shrink-0',
                        isPlaying
                          ? 'bg-primary text-primary-foreground animate-pulse'
                          : 'bg-primary/10 text-primary hover:bg-primary/20'
                      )}
                      aria-label={locale === 'zh-Hans' ? '播放预览' : 'Play preview'}
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  </div>
                }
              />
              <SettingsItem
                icon={Volume2}
                label={t('autoPlayAgentResponse', locale)}
                rightElement={
                  <Switch
                    checked={autoPlayResponse}
                    onCheckedChange={handleAutoPlayChange}
                    className="data-[state=checked]:bg-primary"
                  />
                }
              />
            </div>
          </motion.div>


          {/* Help & Sign Out */}
          <div className="pt-4 space-y-2">
            <SettingsItem icon={HelpCircle} label={locale === 'zh-Hans' ? '帮助与反馈' : 'Help & Feedback'} />
            <SettingsItem icon={LogOut} label={locale === 'zh-Hans' ? '退出登录' : 'Sign Out'} danger />
          </div>

          <motion.p variants={itemVariants} className="text-center text-helper text-muted-foreground pt-4">
            Sales Copilot Mobile v1.0.0
          </motion.p>
        </motion.div>
      </main>
    </div>
  );
}
