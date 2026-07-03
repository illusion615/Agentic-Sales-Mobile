import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Moon, Sun, Globe, HelpCircle, LogOut, Volume2, Play, Type, Palette, CircleDot, LayoutGrid, Speech, X, Zap, MessageSquare, LayoutDashboard, Database, Bug, FileCode, ChevronRight, Monitor, Calendar, Maximize, Bot, Sparkles, Compass, Rows3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { ThinkingIndicator } from '@/components/thinking-indicator';
import { Button } from '@/components/ui/button';

import { useUser } from '@/hooks/use-user';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useCopilotConfigured } from '@/hooks/use-copilot-configured';
import { getCopilotConfig } from '@/services/copilot-service';
import { getPromptResolutionStatus, PROMPT_RESOLUTION_EVENT } from '@/services/prompt-resolver';
import { getLocale, setLocale, t, getVoicesForLocale, getSelectedVoice, setSelectedVoice, getFontSizeConfig, setFontSizeConfig, getAutoPlayAgentResponse, setAutoPlayAgentResponse, getColorTheme, setColorTheme, colorThemeLabels, getThinkingDotStyle, setThinkingDotStyle, thinkingDotStyleLabels, getVoiceSummaryEnabled, setVoiceSummaryEnabled, getCopilotInAllScreens, setCopilotInAllScreens, getSelectedSystemVoiceName, setSelectedSystemVoiceName, getSimulateStreaming, setSimulateStreaming, getDebugMode, setDebugMode, getHomeHeaderWidget, setHomeHeaderWidget, homeHeaderWidgetLabels, extractVoiceName, getCopilotDockLayout, setCopilotDockLayout, copilotDockLayoutLabels, getWeekStartDay, setWeekStartDay, getCopilotFullscreenDefault, setCopilotFullscreenDefault, getCompactDraftForms, setCompactDraftForms, getAgendaDefaultExpanded, setAgendaDefaultExpanded, getCopilotListDefaultView, setCopilotListDefaultView, getCopilotListTopN, setCopilotListTopN, SUPPORTED_LOCALES, LOCALE_META, speechLang, localeLangPrefix, pickLabel, type Locale, type VoiceOption, type FontSizeOption, type ColorTheme, type ThinkingDotStyle, type HomeHeaderWidget, type CopilotDockLayout, type WeekStartDay, type CopilotListDefaultView } from '@/lib/i18n';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSpeechPlayer } from '@/hooks/use-speech-player';
import {
  getFeedbackEnabled,
  setFeedbackEnabled,
  getScenarioStyle,
  setScenarioStyle,
  fireFeedback,
  SCENARIOS,
  STYLE_META,
  FEEDBACK_SCENARIO_ORDER,
  type FeedbackScenario,
  type FeedbackStyleId,
} from '@/lib/feedback';
import { startOnboarding } from '@/lib/onboarding';
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
  // Copilot connection status (reactive): the agent the app will actually call,
  // and whether configuration has resolved. The agent name comes ONLY from the
  // Setting table (authoritative) → cache. There is no hardcoded fallback: when
  // it's missing the UI must tell the user to contact an administrator.
  const isCopilotConfigured = useCopilotConfigured();
  const resolvedAgentName = appSettings.copilotStudioAgentName || getCopilotConfig().agentName;
  const agentFromSettingTable = !!appSettings.copilotStudioAgentName;
  const hasAgent = !!resolvedAgentName;
  // AI prompt resolution status (reactive): which AI model GUID the app resolved
  // for this environment, and whether it's ready or still on the build-time fallback.
  const [promptStatus, setPromptStatus] = useState(getPromptResolutionStatus);
  useEffect(() => {
    const update = () => setPromptStatus(getPromptResolutionStatus());
    window.addEventListener(PROMPT_RESOLUTION_EVENT, update);
    return () => window.removeEventListener(PROMPT_RESOLUTION_EVENT, update);
  }, []);
  const [locale, setLocaleState] = useState<Locale>(getLocale);
  const [isDark, setIsDark] = useState(true);
  const [selectedVoice, setSelectedVoiceState] = useState(getSelectedVoice);
  const [systemVoicesLoaded, setSystemVoicesLoaded] = useState(false);
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedSystemVoice, setSelectedSystemVoiceState] = useState<string>(() => getSelectedSystemVoiceName() || '');

  // Voice preview — driven by the shared speech player (mobile-safe priming).
  const voicePreviewPlayer = useSpeechPlayer({
    getLang: () => speechLang(locale),
    getRate: () => 0.95,
    getVoice: () => {
      const voices = systemVoices.length > 0 ? systemVoices : window.speechSynthesis.getVoices();
      const exact = voices.find((v: SpeechSynthesisVoice) => v.name === selectedSystemVoice);
      if (exact) return exact;
      const langCode = localeLangPrefix(locale);
      return voices.find((v: SpeechSynthesisVoice) => v.lang.startsWith(langCode)) || null;
    },
  });
  const isPlaying = voicePreviewPlayer.state.isActive;

  // Font size state
  const [chatFontSize, setChatFontSize] = useState<FontSizeOption>(() => getFontSizeConfig().chat);
  const [uiFontSize, setUIFontSize] = useState<FontSizeOption>(() => getFontSizeConfig().ui);
  const [autoPlayResponse, setAutoPlayResponseState] = useState(getAutoPlayAgentResponse);
  const [colorTheme, setColorThemeState] = useState<ColorTheme>(() => getColorTheme());
  const [thinkingDotStyle, setThinkingDotStyleState] = useState<ThinkingDotStyle>(() => getThinkingDotStyle());
  const [feedbackEnabled, setFeedbackEnabledState] = useState(() => getFeedbackEnabled());
  const [feedbackStyles, setFeedbackStylesState] = useState<Record<FeedbackScenario, FeedbackStyleId>>(() => ({
    success: getScenarioStyle('success'),
    milestone: getScenarioStyle('milestone'),
    failure: getScenarioStyle('failure'),
    warning: getScenarioStyle('warning'),
  }));
  const [voiceSummaryEnabled, setVoiceSummaryEnabledState] = useState(() => getVoiceSummaryEnabled());
  const [copilotInAllScreens, setCopilotInAllScreensState] = useState(() => getCopilotInAllScreens());
  const [copilotDockLayout, setCopilotDockLayoutState] = useState<CopilotDockLayout>(() => getCopilotDockLayout());
  const [simulateStreaming, setSimulateStreamingState] = useState(() => getSimulateStreaming());
  const [debugMode, setDebugModeState] = useState(() => getDebugMode());
  const [copilotFullscreenDefault, setCopilotFullscreenDefaultState] = useState(() => getCopilotFullscreenDefault());
  const [compactDraftForms, setCompactDraftFormsState] = useState(() => getCompactDraftForms());
  const [agendaDefaultExpanded, setAgendaDefaultExpandedState] = useState(() => getAgendaDefaultExpanded());
  const [copilotListDefaultView, setCopilotListDefaultViewState] = useState<CopilotListDefaultView>(() => getCopilotListDefaultView());
  const [copilotListTopN, setCopilotListTopNState] = useState<number>(() => getCopilotListTopN());
  const [homeHeaderWidget, setHomeHeaderWidgetState] = useState<HomeHeaderWidget>(() => getHomeHeaderWidget());
  const [weekStartDay, setWeekStartDayState] = useState<WeekStartDay>(() => getWeekStartDay());

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

  const handleFeedbackEnabledChange = (enabled: boolean) => {
    setFeedbackEnabledState(enabled);
    setFeedbackEnabled(enabled);
  };

  const handleFeedbackStyleChange = (scenario: FeedbackScenario, style: FeedbackStyleId) => {
    setFeedbackStylesState((prev) => ({ ...prev, [scenario]: style }));
    setScenarioStyle(scenario, style);
    // Live preview: play the chosen animation immediately (skips if 'none').
    fireFeedback(scenario);
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

  const handleDebugModeChange = (enabled: boolean) => {
    setDebugModeState(enabled);
    setDebugMode(enabled);
  };

  const handleCopilotFullscreenDefaultChange = (enabled: boolean) => {
    setCopilotFullscreenDefaultState(enabled);
    setCopilotFullscreenDefault(enabled);
  };

  const handleCompactDraftFormsChange = (enabled: boolean) => {
    setCompactDraftFormsState(enabled);
    setCompactDraftForms(enabled);
  };

  const handleAgendaDefaultExpandedChange = (enabled: boolean) => {
    setAgendaDefaultExpandedState(enabled);
    setAgendaDefaultExpanded(enabled);
  };

  const handleCopilotListDefaultViewChange = (view: string) => {
    const next = view as CopilotListDefaultView;
    setCopilotListDefaultViewState(next);
    setCopilotListDefaultView(next);
  };

  const handleCopilotListTopNChange = (value: string) => {
    const next = Number.parseInt(value, 10);
    if (!Number.isFinite(next)) return;
    setCopilotListTopNState(next);
    setCopilotListTopN(next);
  };

  const handleHomeHeaderWidgetChange = (widget: string) => {
    const newWidget = widget as HomeHeaderWidget;
    setHomeHeaderWidgetState(newWidget);
    setHomeHeaderWidget(newWidget);
  };

  const handleWeekStartDayChange = (day: string) => {
    const d = day as WeekStartDay;
    setWeekStartDayState(d);
    setWeekStartDay(d);
  };


  const playVoicePreview = () => {
    if (voicePreviewPlayer.state.isActive) return;
    const sampleText = locale === 'zh-Hans'
      ? '您好，我是您的销售助手，很高兴为您服务。'
      : 'Hello, I am your sales assistant. Nice to meet you.';
    voicePreviewPlayer.play([{ id: 'voice-preview', text: sampleText }]);
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
              {t('general', locale)}
            </h3>
            <div className="glass-card p-4 space-y-2">
              <SettingsItem
                icon={Globe}
                label={t('language', locale)}
                rightElement={
                  <Select value={locale} onValueChange={(val: string) => handleLocaleChange(val as Locale)}>
                    <SelectTrigger className="w-32 h-8 text-sm bg-transparent border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_LOCALES.map((loc) => (
                        <SelectItem key={loc} value={loc}>{LOCALE_META[loc].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
              />
              <SettingsItem
                icon={LayoutDashboard}
                label={t('homeHeaderDisplay', locale)}
                rightElement={
                  <Select value={homeHeaderWidget} onValueChange={handleHomeHeaderWidgetChange}>
                    <SelectTrigger className="w-36 h-8 text-sm bg-transparent border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date-time">{t('widgetDateTime', locale)}</SelectItem>
                      <SelectItem value="performance">{t('widgetMyPerformance', locale)}</SelectItem>
                      <SelectItem value="task-completion">{t('widgetTaskCompletion', locale)}</SelectItem>
                      <SelectItem value="pipeline-forecast">{t('widgetPipelineForecast', locale)}</SelectItem>
                    </SelectContent>
                  </Select>
                }
              />
              <SettingsItem
                icon={Calendar}
                label={t('weekStartsOn', locale)}
                rightElement={
                  <div className="flex rounded-lg overflow-hidden border border-border/60">
                    {(['sunday', 'monday'] as WeekStartDay[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => handleWeekStartDayChange(d)}
                        className={cn(
                          'px-3 py-1 text-xs font-medium transition-colors',
                          weekStartDay === d
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background hover:bg-muted text-muted-foreground'
                        )}
                      >
                        {d === 'sunday'
                          ? (t('weekdaySun', locale))
                          : (t('weekdayMon', locale))}
                      </button>
                    ))}
                  </div>
                }
              />
              <SettingsItem
                icon={Calendar}
                label={t('expandAgendaDefault', locale)}
                rightElement={
                  <Switch
                    checked={agendaDefaultExpanded}
                    onCheckedChange={handleAgendaDefaultExpandedChange}
                    className="data-[state=checked]:bg-primary"
                  />
                }
              />
              <SettingsItem
                icon={Compass}
                label={t('appTour', locale)}
                onClick={() => {
                  if (onClose) onClose();
                  // Let the home screen mount so spotlight anchors are present.
                  window.setTimeout(() => startOnboarding(locale), 500);
                }}
                rightElement={<ChevronRight className="w-4 h-4 text-muted-foreground" />}
              />
            </div>
          </motion.div>

          {/* Style Section */}
          <motion.div variants={itemVariants} className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              {t('styleSection', locale)}
            </h3>
            <div className="glass-card p-4 space-y-2">
              <SettingsItem
                icon={isDark ? Moon : Sun}
                label={t('darkMode', locale)}
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

                      title={pickLabel(colorThemeLabels[theme], locale)}
                      aria-label={pickLabel(colorThemeLabels[theme], locale)}
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
                          <span className="flex items-center gap-2">
                            <ThinkingIndicator style={style} />
                            <span>{pickLabel(thinkingDotStyleLabels[style], locale)}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
              />
              {/* ── Scenario feedback animations ── */}
              <SettingsItem
                icon={Sparkles}
                label={t('scenarioFeedback', locale)}
                rightElement={
                  <Switch checked={feedbackEnabled} onCheckedChange={handleFeedbackEnabledChange} />
                }
              />
              {feedbackEnabled && (
                <div className="pl-8 pr-1 space-y-2">
                  {FEEDBACK_SCENARIO_ORDER.map((scenario: FeedbackScenario) => {
                    const meta = SCENARIOS[scenario];
                    return (
                      <div key={scenario} className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">
                            {pickLabel(meta.label, locale)}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {pickLabel(meta.hint, locale)}
                          </p>
                        </div>
                        <Select
                          value={feedbackStyles[scenario]}
                          onValueChange={(val: string) => handleFeedbackStyleChange(scenario, val as FeedbackStyleId)}
                        >
                          <SelectTrigger className="w-28 h-8 text-sm bg-transparent border-border/50 shrink-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {meta.styles.map((styleId: FeedbackStyleId) => (
                              <SelectItem key={styleId} value={styleId}>
                                {pickLabel(STYLE_META[styleId].label, locale)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>

          {/* AI Assistant Configuration */}
          <motion.div variants={itemVariants} className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              {t('aiAssistantConfig', locale)}
            </h3>
            <div className="glass-card p-4 space-y-3">
              {/* ── List display ── */}
              <p className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wide">
                {t('listDisplay', locale)}
              </p>
              {/* Record list display behavior */}
              <div className="space-y-3">
                <SettingsItem
                  icon={LayoutGrid}
                  label={t('copilotListDefaultState', locale)}
                  rightElement={
                    <Select value={copilotListDefaultView} onValueChange={handleCopilotListDefaultViewChange}>
                      <SelectTrigger className="w-28 h-8 text-sm bg-transparent border-border/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="expanded">{t('expanded', locale)}</SelectItem>
                        <SelectItem value="collapsed">{t('collapsed', locale)}</SelectItem>
                      </SelectContent>
                    </Select>
                  }
                />
                <SettingsItem
                  icon={LayoutGrid}
                  label={t('defaultListSize', locale)}
                  rightElement={
                    <Select value={String(copilotListTopN)} onValueChange={handleCopilotListTopNChange}>
                      <SelectTrigger className="w-24 h-8 text-sm bg-transparent border-border/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[3, 5, 10, 20].map((n) => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  }
                />
                <p className="text-xs text-muted-foreground mt-1 pl-8">
                  {locale === 'zh-Hans'
                    ? '当结果超过 Top N 时，先显示前 N 条，并在底部显示剩余条数，可点击展开全部。'
                    : 'When results exceed Top N, Copilot shows the first N records and a remaining count that can expand all.'}
                </p>
              </div>

              {/* Display copilot in all screens toggle */}
              <div className="pt-3 border-t border-border/30">
                {/* ── Copilot panel ── */}
                <p className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wide mb-2">
                  {t('copilotPanel', locale)}
                </p>
                <SettingsItem
                  icon={LayoutGrid}
                  label={t('displayCopilotAllScreens', locale)}
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
                  label={t('widescreenCopilotLayout', locale)}
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
                          {pickLabel(copilotDockLayoutLabels[opt], locale)}
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

              {/* Copilot fullscreen by default toggle */}
              <div className="pt-3 border-t border-border/30">
                <SettingsItem
                  icon={Maximize}
                  label={t('fullscreenCopilotDefault', locale)}
                  rightElement={
                    <Switch
                      checked={copilotFullscreenDefault}
                      onCheckedChange={handleCopilotFullscreenDefaultChange}
                    />
                  }
                />
                <p className="text-xs text-muted-foreground mt-1 pl-8">
                  {locale === 'zh-Hans'
                    ? '启用后，点击对话框将以全屏模式展开 Copilot（仅移动端）'
                    : 'When enabled, tapping the input opens Copilot in fullscreen mode (mobile only)'}
                </p>
              </div>

              {/* Compact draft forms toggle */}
              <div className="pt-3 border-t border-border/30">
                <SettingsItem
                  icon={Rows3}
                  label={t('compactDraftForms', locale)}
                  rightElement={
                    <Switch
                      checked={compactDraftForms}
                      onCheckedChange={handleCompactDraftFormsChange}
                    />
                  }
                />
                <p className="text-xs text-muted-foreground mt-1 pl-8">
                  {t('compactDraftFormsDesc', locale)}
                </p>
              </div>

              {/* New bottom dock (ActionDock) toggle */}
            </div>
          </motion.div>



          {/* Voice Section */}
          <motion.div variants={itemVariants} className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              {t('voiceSection', locale)}
            </h3>
            <div className="glass-card p-4 space-y-2">
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
                        <SelectValue placeholder={t('selectVoice', locale)} />
                      </SelectTrigger>
                      <SelectContent>
                        {systemVoices.length === 0 ? (
                          <div className="px-2 py-2 text-xs text-muted-foreground">
                            {t('loadingVoices', locale)}
                          </div>
                        ) : (
                          <>
                            {/* Group voices by language */}
                            {(() => {
                              const langCode = localeLangPrefix(locale);
                              const forLang = systemVoices.filter((v: SpeechSynthesisVoice) => v.lang.startsWith(langCode));
                              // D11: only show HIGH-QUALITY voices. Browser system voices carry no
                              // tier metadata, but the high-quality ones reliably signal themselves
                              // via name keywords (Natural / Neural / Online / Premium / Enhanced /
                              // Eloquence) or by being cloud-backed (localService === false). Filter
                              // on those real signals rather than the Azure voiceOptions names, which
                              // rarely match the browser's own voice names.
                              const QUALITY_RE = /natural|neural|online|premium|enhanced|eloquence|wavenet|studio/i;
                              const hq = forLang.filter((v: SpeechSynthesisVoice) =>
                                QUALITY_RE.test(v.name) || v.localService === false
                              );
                              // Fallback: if the platform exposes no obviously-premium voice, show all
                              // for the language so the picker is never empty.
                              const voicesToShow = hq.length > 0 ? hq : forLang;
                              
                              return (
                                <>
                                  {voicesToShow.length > 0 && (
                                    <>
                                      <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium">
                                        {hq.length > 0
                                          ? (t('highQualityVoices', locale))
                                          : (t('availableVoices', locale))}
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
                      aria-label={t('playPreview', locale)}
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
          </motion.div>

          {/* Help & Feedback Section */}
          <motion.div variants={itemVariants} className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              {t('helpFeedback', locale)}
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
                    {t('skillsToolsGuide', locale)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('skillsGuideDesc', locale)}
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
                    {t('codeReviewReport', locale)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('codeReviewDesc', locale)}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
              {/* Debug mode toggle — gates developer-only UI like the Frame log icon */}
              <div className="border-t border-border/30 pt-2">
                <SettingsItem
                  icon={Bug}
                  label={t('debugMode', locale)}
                  rightElement={
                    <Switch
                      checked={debugMode}
                      onCheckedChange={handleDebugModeChange}
                      className="data-[state=checked]:bg-primary"
                    />
                  }
                />
                <p className="text-xs text-muted-foreground px-2 -mt-1">
                  {locale === 'zh-Hans'
                    ? '开启后在 Copilot 面板显示 Frame 思考记录图标'
                    : 'Shows the Frame reasoning-log icon on the Copilot panel when enabled'}
                </p>
              </div>
              {/* Copilot connection status (moved here from a standalone section) */}
              <div className="border-t border-border/30 pt-2">
                <SettingsItem
                  icon={Bot}
                  label={t('copilotConnection', locale)}
                  rightElement={
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'w-2.5 h-2.5 rounded-full',
                          !isSettingsFetched
                            ? 'bg-muted-foreground/40'
                            : (isCopilotConfigured && hasAgent)
                              ? 'bg-green-500'
                              : 'bg-amber-500'
                        )}
                      />
                      <span className="text-sm text-muted-foreground">
                        {!isSettingsFetched
                          ? (t('checking', locale))
                          : (isCopilotConfigured && hasAgent)
                            ? (t('connected', locale))
                            : (t('notConfigured', locale))}
                      </span>
                    </div>
                  }
                />
                <SettingsItem
                  icon={MessageSquare}
                  label={t('currentAgent', locale)}
                  rightElement={
                    hasAgent ? (
                      <div className="flex flex-col items-end max-w-[60%]">
                        <span className="text-sm text-foreground font-mono truncate max-w-full">
                          {resolvedAgentName}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {agentFromSettingTable
                            ? (t('fromSettingTable', locale))
                            : (t('cached', locale))}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-amber-600 dark:text-amber-500 text-right max-w-[65%]">
                        {t('notConfigured', locale)}
                      </span>
                    )
                  }
                />
                {isSettingsFetched && !hasAgent && (
                  <p className="text-xs text-muted-foreground px-2 pt-1 leading-relaxed">
                    {locale === 'zh-Hans'
                      ? '尚未配置知识库 Agent。请联系管理员在 Setting 表中设置 copilot_studio_agent_name。'
                      : 'No knowledge-base agent is configured. Please contact your administrator to set copilot_studio_agent_name in the Setting table.'}
                  </p>
                )}
              </div>
              {/* AI prompt resolution status */}
              <div className="border-t border-border/30 pt-2">
                <SettingsItem
                  icon={Sparkles}
                  label={t('aiPromptStatus', locale)}
                  rightElement={
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'w-2.5 h-2.5 rounded-full',
                          promptStatus.state === 'checking'
                            ? 'bg-muted-foreground/40 animate-pulse'
                            : promptStatus.state === 'fallback'
                              ? 'bg-amber-500'
                              : 'bg-green-500'
                        )}
                      />
                      <span className="text-sm text-muted-foreground">
                        {promptStatus.state === 'checking'
                          ? (t('resolving', locale))
                          : promptStatus.state === 'resolved'
                            ? (t('ready', locale))
                            : promptStatus.state === 'cached'
                              ? (t('readyCached', locale))
                              : (t('defaultConfig', locale))}
                      </span>
                    </div>
                  }
                />
                <SettingsItem
                  icon={FileCode}
                  label={t('modelName', locale)}
                  rightElement={
                    <span className="text-sm text-foreground font-mono truncate max-w-[60%] text-right">
                      {promptStatus.modelName}
                    </span>
                  }
                />
                {promptStatus.state === 'fallback' && (
                  <p className="text-xs text-muted-foreground px-2 pt-1 leading-relaxed">
                    {locale === 'zh-Hans'
                      ? '正在使用内置默认 Prompt 配置。若 AI 回复异常，请确认当前环境已导入并发布名为 SalesCopilotCorePrompt 的 AI 模型，且账号具有读取权限。'
                      : 'Using the built-in default prompt configuration. If AI replies fail, confirm the AI model named SalesCopilotCorePrompt is imported and published in this environment and that your account has read access.'}
                  </p>
                )}
              </div>
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
            <SettingsItem icon={LogOut} label={t('signOut', locale)} danger />
          </div>

          <motion.p variants={itemVariants} className="text-center text-helper text-muted-foreground pt-4">
            Sales Copilot Mobile · build {__BUILD_TIMESTAMP__}
          </motion.p>
        </motion.div>
      </main>
    </div>
  );
}
