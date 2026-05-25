import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Moon, Sun, Globe, HelpCircle, LogOut, Volume2, Play, Type, Palette, CircleDot, LayoutGrid, Speech, X, Zap, MessageSquare, Gauge, LayoutDashboard, Database, Bug, FileCode, ChevronRight, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';

import { useUser } from '@/hooks/use-user';
import { useAppSettings } from '@/hooks/use-app-settings';
import { getLocale, setLocale, t, getVoicesForLocale, getSelectedVoice, setSelectedVoice, getFontSizeConfig, setFontSizeConfig, getAutoPlayAgentResponse, setAutoPlayAgentResponse, getColorTheme, setColorTheme, colorThemeLabels, getThinkingDotStyle, setThinkingDotStyle, thinkingDotStyleLabels, getOrganizeInStructureCard, setOrganizeInStructureCard, getVoiceSummaryEnabled, setVoiceSummaryEnabled, getCopilotInAllScreens, setCopilotInAllScreens, getSelectedSystemVoiceName, setSelectedSystemVoiceName, getSimulateStreaming, setSimulateStreaming, getHomeHeaderWidget, setHomeHeaderWidget, homeHeaderWidgetLabels, extractVoiceName, getCopilotDockLayout, setCopilotDockLayout, copilotDockLayoutLabels, type Locale, type VoiceOption, type FontSizeOption, type ColorTheme, type ThinkingDotStyle, type HomeHeaderWidget, type CopilotDockLayout } from '@/lib/i18n';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  const { data: user } = useUser();
  
  // Load settings from database
  const { settings: appSettings, isLoading: isLoadingSettings, isFetched: isSettingsFetched } = useAppSettings();
  const [locale, setLocaleState] = useState<Locale>(getLocale);
  const [isDark, setIsDark] = useState(true);
  const [selectedVoice, setSelectedVoiceState] = useState(getSelectedVoice);
  const voicesForLocale = getVoicesForLocale(locale);
  const [isPlaying, setIsPlaying] = useState(false);
  const [systemVoicesLoaded, setSystemVoicesLoaded] = useState(false);
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedSystemVoice, setSelectedSystemVoiceState] = useState<string>(() => getSelectedSystemVoiceName() || '');

  // Font size state
  const [chatFontSize, setChatFontSize] = useState<FontSizeOption>(() => getFontSizeConfig().chat);
  const [uiFontSize, setUIFontSize] = useState<FontSizeOption>(() => getFontSizeConfig().ui);
  const [autoPlayResponse, setAutoPlayResponseState] = useState(getAutoPlayAgentResponse);
  const [colorTheme, setColorThemeState] = useState<ColorTheme>(() => getColorTheme());
  const [thinkingDotStyle, setThinkingDotStyleState] = useState<ThinkingDotStyle>(() => getThinkingDotStyle());
  const [organizeInStructureCard, setOrganizeInStructureCardState] = useState(() => getOrganizeInStructureCard());
  const [voiceSummaryEnabled, setVoiceSummaryEnabledState] = useState(() => getVoiceSummaryEnabled());
  const [copilotInAllScreens, setCopilotInAllScreensState] = useState(() => getCopilotInAllScreens());
  const [copilotDockLayout, setCopilotDockLayoutState] = useState<CopilotDockLayout>(() => getCopilotDockLayout());
  const [simulateStreaming, setSimulateStreamingState] = useState(() => getSimulateStreaming());
  const [homeHeaderWidget, setHomeHeaderWidgetState] = useState<HomeHeaderWidget>(() => getHomeHeaderWidget());

  // Track if database settings have been loaded
  const [dbSettingsLoaded, setDbSettingsLoaded] = useState(false);

  // Load settings from database when available (takes priority over localStorage)
  useEffect(() => {
    // Only run when query has completed and we haven't loaded yet
    if (!isSettingsFetched || dbSettingsLoaded) return;
    setDbSettingsLoaded(true);
  }, [isSettingsFetched, dbSettingsLoaded]);



  // Load system voices
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
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
    setLocale(newLocale); // setLocale dispatches the 'locale-changed' event
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

  const handleCopilotDockLayoutChange = (layout: string) => {
    const l = layout as CopilotDockLayout;
    setCopilotDockLayoutState(l);
    setCopilotDockLayout(l);
  };

  const handleSimulateStreamingChange = (enabled: boolean) => {
    setSimulateStreamingState(enabled);
    setSimulateStreaming(enabled);
  };

  const handleHomeHeaderWidgetChange = (widget: string) => {
    const newWidget = widget as HomeHeaderWidget;
    setHomeHeaderWidgetState(newWidget);
    setHomeHeaderWidget(newWidget);
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



  const getInitials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.split(' ');
    return parts[0]?.charAt(0)?.toUpperCase() || 'U';
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'linear-gradient(180deg, var(--scm-gradient-start) 0%, var(--scm-gradient-end) 100%)' }}>
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50 safe-area-top">
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
      <main className={cn('flex-1 px-4 overflow-y-auto scrollbar-hide', isOverlay ? 'pb-8' : 'pb-32')}>
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
              <SettingsItem
                icon={LayoutDashboard}
                label={locale === 'zh-Hans' ? '主页顶部显示' : 'Home Header Display'}
                rightElement={
                  <Select value={homeHeaderWidget} onValueChange={handleHomeHeaderWidgetChange}>
                    <SelectTrigger className="w-36 h-8 text-sm bg-transparent border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date-time">{locale === 'zh-Hans' ? '日期和时间' : 'Date & Time'}</SelectItem>
                      <SelectItem value="performance">{locale === 'zh-Hans' ? '我的绩效' : 'My Performance'}</SelectItem>
                      <SelectItem value="task-completion">{locale === 'zh-Hans' ? '今日任务完成率' : 'Task Completion'}</SelectItem>
                      <SelectItem value="pipeline-forecast">{locale === 'zh-Hans' ? '本季度成交/预测' : 'Pipeline/Forecast'}</SelectItem>
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

          {/* AI Assistant Configuration */}
          <motion.div variants={itemVariants} className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              {locale === 'zh-Hans' ? 'AI 助手配置' : 'AI Assistant Configuration'}
            </h3>
            <div className="glass-card p-4 space-y-3">
              {/* Information Structure toggles */}
              <div className="space-y-2">
                <SettingsItem
                  icon={LayoutGrid}
                  label={t('organizeInStructureCard', locale)}
                  rightElement={
                    <Switch
                      checked={organizeInStructureCard}
                      onCheckedChange={handleOrganizeInStructureCardChange}
                      className="data-[state=checked]:bg-primary"
                    />
                  }
                />
                <SettingsItem
                  icon={Speech}
                  label={t('voiceSummary', locale)}
                  rightElement={
                    <Switch
                      checked={voiceSummaryEnabled}
                      onCheckedChange={handleVoiceSummaryEnabledChange}
                      className="data-[state=checked]:bg-primary"
                    />
                  }
                />
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
                    ? '启用后，Ask Copilot 输入框将显示在所有页面底部，包括设置页'
                    : 'When enabled, Ask Copilot input will appear at the bottom of all screens, including Settings'}
                </p>
              </div>

              {/* Copilot dock layout (widescreen) */}
              <div className="pt-3 border-t border-border/30">
                <SettingsItem
                  icon={Monitor}
                  label={locale === 'zh-Hans' ? '宽屏模式 Copilot 布局' : 'Widescreen Copilot Layout'}
                  rightElement={
                    <div className="flex rounded-lg overflow-hidden border border-border/60">
                      {(['float', 'left', 'right'] as CopilotDockLayout[]).map((opt) => (
                        <button
                          key={opt}
                          onClick={() => handleCopilotDockLayoutChange(opt)}
                          className={cn(
                            'px-3 py-1 text-xs font-medium transition-colors',
                            copilotDockLayout === opt
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-background hover:bg-muted text-muted-foreground'
                          )}
                        >
                          {locale === 'zh-Hans' ? copilotDockLayoutLabels[opt].zh : copilotDockLayoutLabels[opt].en}
                        </button>
                      ))}
                    </div>
                  }
                />
                <p className="text-xs text-muted-foreground mt-1 pl-8">
                  {locale === 'zh-Hans'
                    ? '在宽屏幕设备上将 Copilot 面板固定到左侧或右侧，或保持浮动弹出'
                    : 'Dock the Copilot panel to the left or right side on wide screens, or keep it floating'}
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

              {/* New bottom dock (ActionDock) toggle */}
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
                              // Get premium and natural tier voice names from voiceOptions
                              const premiumNaturalVoiceNames = voicesForLocale
                                .filter((v: VoiceOption) => v.tier === 'premium' || v.tier === 'natural')
                                .map((v: VoiceOption) => extractVoiceName(v.id).toLowerCase());
                              
                              // Filter system voices to only those matching premium/natural tiers
                              const filteredVoices = systemVoices.filter((v: SpeechSynthesisVoice) => {
                                const voiceNameLower = v.name.toLowerCase();
                                const matchesLang = v.lang.startsWith(langCode);
                                const matchesTier = premiumNaturalVoiceNames.some((name: string) => voiceNameLower.includes(name));
                                return matchesLang && matchesTier;
                              });
                              
                              // Fallback: if no premium/natural voices found, show all voices for the language
                              const voicesToShow = filteredVoices.length > 0 
                                ? filteredVoices 
                                : systemVoices.filter((v: SpeechSynthesisVoice) => v.lang.startsWith(langCode));
                              
                              return (
                                <>
                                  {voicesToShow.length > 0 && (
                                    <>
                                      <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium">
                                        {locale === 'zh-Hans' ? 'Premium & Natural' : 'Premium & Natural'}
                                      </div>
                                      {voicesToShow.map((voice: SpeechSynthesisVoice) => (
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

          {/* Help & Feedback Section */}
          <motion.div variants={itemVariants} className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              {locale === 'zh-Hans' ? '帮助与反馈' : 'Help & Feedback'}
            </h3>
            <div className="glass-card p-3 rounded-xl space-y-2">
              <button
                onClick={() => {
                  if (onClose) onClose();
                  navigate('/help-feedback');
                }}
                className="w-full flex items-center gap-3 px-2 py-3 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <HelpCircle className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-foreground">
                    {locale === 'zh-Hans' ? '技能与工具指南' : 'Skills & Tools Guide'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {locale === 'zh-Hans' ? '了解所有可用的技能及其使用方法' : 'Learn all available skills and how to use them'}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
              <button
                onClick={() => {
                  if (onClose) onClose();
                  navigate('/debug/code-review');
                }}
                className="w-full flex items-center gap-3 px-2 py-3 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <FileCode className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-foreground">
                    {locale === 'zh-Hans' ? '代码审查报告' : 'Code Review Report'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {locale === 'zh-Hans' ? '查看最新的代码质量分析' : 'View latest code quality analysis'}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
              <div className="border-t border-border/30 pt-2">
                <p className="text-xs text-muted-foreground px-2">
                  {locale === 'zh-Hans'
                    ? '此部分提供帮助文档、调试工具和反馈渠道'
                    : 'This section provides help documentation, debugging tools, and feedback channels'}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Sign Out */}
          <div className="pt-4 space-y-2">
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
