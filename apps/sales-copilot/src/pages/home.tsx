import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence, useDragControls, type PanInfo } from 'motion/react';
import { Settings, Sparkles, Plus, Eye, Radio, Mic, WifiOff, ArrowUp, SquarePen, Maximize2, X, Square, Copy, Forward, ThumbsDown, ChevronRight, ChevronDown, Play, Pause, Loader2, Volume2, VolumeX, Bell, RefreshCw, SkipForward, SkipBack, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';
import { useActivityList, useUpdateActivity } from '@/generated/hooks/use-activity';
import { useOpportunityList } from '@/generated/hooks/use-opportunity';
import { useAccountList } from '@/generated/hooks/use-account';

import { useCopilotConversationList, useUpdateCopilotConversation, useCreateCopilotConversation } from '@/generated/hooks/use-copilot-conversation';
import { useCreateBusinessInsight, useBusinessInsightList, useDeleteBusinessInsight } from '@/generated/hooks/use-business-insight';
import type { BusinessInsightTypeKey, BusinessInsightReferencetypeKey } from '@/generated/models/business-insight-model';


import { useLocale } from '@/lib/i18n';
import { t, getGreeting, getChatFontClass, getThinkingDotStyle, getAutoPlayAgentResponse, getSelectedVoice, findMatchingSystemVoice, getVoiceSummaryEnabled, getLLMConfig, generateVoiceSummary, getAgentFramework, getHomeHeaderWidget, type Locale, type ThinkingDotStyle, type HomeHeaderWidget } from '@/lib/i18n';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { formatCurrencyCompact, formatCurrencyFull } from '@/lib/format-currency';

import { SettingsPanel } from '@/components/settings-panel';
import type { Activity } from '@/generated/models/activity-model';
import type { Opportunity, OpportunityStageKey } from '@/generated/models/opportunity-model';
import type { Account } from '@/generated/models/account-model';
import type { CopilotConversation } from '@/generated/models/copilot-conversation-model';
import { OpportunityStageKeyToLabel, ActivityDraftstatusKeyToLabel, ActivityTypeKeyToLabel } from '@/generated/models';
import {
  getCopilotConfig,
} from '@/services/copilot-service';
import { DynamicDataRenderer, tryParseJson } from '@/components/dynamic-data-renderer';
import { FormCard } from '@/components/form-card';
import { RecordListCard } from '@/components/record-list-card';
// InsightCarousel removed from home page (insights are now shown inside the
// bell-triggered Insights sheet). Keep the path available via brief-me page.
import { KPICards, type KPIData, type AgendaItem, type AtRiskClient } from '@/components/kpi-card';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import type { BusinessInsight } from '@/generated/models/business-insight-model';
import { useCopilot, type ChatMessage } from '@/contexts/copilot-context';



// Use ChatMessage from context for unified type across all pages

interface QuickActionProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}

// Live Date & Time Clock component
function DateTimeClock({ locale }: { locale: Locale }) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDate = (date: Date) => {
    if (locale === 'zh-Hans') {
      const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const weekday = weekdays[date.getDay()];
      return `${month}月${day}日 ${weekday}`;
    } else {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(locale === 'zh-Hans' ? 'zh-CN' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: locale !== 'zh-Hans',
    });
  };

  return (
    <div>
      <p className="text-sm text-muted-foreground leading-none">{formatDate(currentTime)}</p>
      <p className="text-2xl font-bold text-foreground leading-tight mt-0.5 tabular-nums">{formatTime(currentTime)}</p>
    </div>
  );
}

// Home Header Widget - displays selected metric in top-left
function HomeHeaderWidgetDisplay({ 
  locale, 
  widget,
  kpiData
}: { 
  locale: Locale; 
  widget: HomeHeaderWidget;
  kpiData: {
    agendaCompleted: number;
    agendaItems: { id: string }[];
    quarterlyWonAmount: number;
    quarterlyTarget: number;
    activitiesThisWeek: number;
    weeklyTarget: number;
  };
}) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // Only update time if date-time widget is selected
    if (widget !== 'date-time') return;
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, [widget]);

  const formatDate = (date: Date) => {
    if (locale === 'zh-Hans') {
      const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const weekday = weekdays[date.getDay()];
      return `${month}月${day}日 ${weekday}`;
    } else {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(locale === 'zh-Hans' ? 'zh-CN' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: locale !== 'zh-Hans',
    });
  };

  // Calculate task completion rate
  const taskCompletionRate = kpiData.agendaItems.length > 0 
    ? Math.round((kpiData.agendaCompleted / kpiData.agendaItems.length) * 100) 
    : 0;

  // Calculate quarterly forecast using quarterly performance data
  const quarterlyForecast = kpiData.quarterlyWonAmount;
  const quarterlyTargetValue = kpiData.quarterlyTarget;
  const quarterlyProgress = quarterlyTargetValue > 0 ? Math.round((quarterlyForecast / quarterlyTargetValue) * 100) : 0;

  // Calculate performance percentage
  const performancePercent = kpiData.weeklyTarget > 0 
    ? Math.round((kpiData.activitiesThisWeek / kpiData.weeklyTarget) * 100) 
    : 0;

  switch (widget) {
    case 'date-time':
      return (
        <div>
          <p className="text-sm text-muted-foreground leading-none">{formatDate(currentTime)}</p>
          <p className="text-2xl font-bold text-foreground leading-tight mt-0.5 tabular-nums">{formatTime(currentTime)}</p>
        </div>
      );
    case 'performance':
      return (
        <div>
          <p className="text-sm text-muted-foreground leading-none">{locale === 'zh-Hans' ? '我的业绩' : 'My Performance'}</p>
          <p className="text-2xl font-bold text-foreground leading-tight mt-0.5 tabular-nums">{performancePercent}%</p>
        </div>
      );
    case 'task-completion':
      return (
        <div>
          <p className="text-sm text-muted-foreground leading-none">{locale === 'zh-Hans' ? '今日任务完成率' : "Today's Task Completion"}</p>
          <p className="text-2xl font-bold text-foreground leading-tight mt-0.5 tabular-nums">
            {taskCompletionRate}% 
            <span className="text-sm font-normal text-muted-foreground">
              ({kpiData.agendaCompleted}/{kpiData.agendaItems.length})
            </span>
          </p>
        </div>
      );
    case 'pipeline-forecast':
    default:
      return (
        <div>
          <p className="text-sm text-muted-foreground leading-none">{locale === 'zh-Hans' ? '本季度业绩完成率' : 'Quarterly Goal Progress'}</p>
          <p className="text-2xl font-bold text-foreground leading-tight mt-0.5 tabular-nums">
            {quarterlyProgress}%
            <span className="text-sm font-normal text-muted-foreground ml-1.5">
              ({formatCurrencyCompact(quarterlyForecast)} / {formatCurrencyCompact(quarterlyTargetValue)})
            </span>
          </p>
        </div>
      );
  }
}

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
} as const;

// Quick Action Chip
function QuickActionChip({ icon: Icon, label, onClick }: QuickActionProps) {
  return (
    <motion.button
      variants={itemVariants}
      onClick={onClick}
      className={cn(
        'flex-1 py-2.5 px-3 rounded-xl',
        'glass-card-hover',
        'text-[0.8125rem] font-medium text-foreground',
        'flex items-center justify-center gap-2',
        'active:scale-95 transition-transform'
      )}
    >
      <Icon className="w-4 h-4 text-primary flex-shrink-0" />
      <span className="leading-tight whitespace-nowrap">{label}</span>
    </motion.button>
  );
}

// Helper to check if stage is won or lost
function isClosedStage(stageKey: OpportunityStageKey): boolean {
  const label = OpportunityStageKeyToLabel[stageKey];
  return label === 'won' || label === 'lost';
}

function isWonStage(stageKey: OpportunityStageKey): boolean {
  return OpportunityStageKeyToLabel[stageKey] === 'won';
}

// MarkdownContent removed - now using shared MarkdownRenderer component

// Stage Progress Component for Opportunity Cards
const stages = ['Qualify', 'Develop', 'Propose', 'Close'];

function StageProgress({ currentStage, confidence }: { currentStage: number; confidence: number }) {
  return (
    <div className="flex gap-1 mb-2">
      {stages.map((_, idx: number) => (
        <div
          key={idx}
          className={cn(
            'h-1 flex-1 rounded-full transition-colors',
            idx <= currentStage
              ? confidence >= 70
                ? 'bg-green-500'
                : confidence >= 40
                ? 'bg-yellow-500'
                : 'bg-red-500'
              : 'bg-muted'
          )}
        />
      ))}
    </div>
  );
}

// Stage Card Component
function StageCard({ stageCard, onClick }: { stageCard: NonNullable<ChatMessage['stageCard']>; onClick?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as const }}
      className="glass-card p-3 rounded-xl cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={onClick}
    >
      <StageProgress currentStage={stageCard.stageIndex} confidence={stageCard.confidence} />
      <div className="flex justify-between items-start mb-1">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm text-foreground truncate">{stageCard.title}</h4>
          <p className="text-xs text-muted-foreground truncate">{stageCard.account}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-sm font-semibold text-foreground">{stageCard.value}</span>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{stageCard.stage}</span>
        <span>•</span>
        <span className={cn(
          stageCard.confidence >= 70 ? 'text-green-600 dark:text-green-400' :
          stageCard.confidence >= 40 ? 'text-yellow-600 dark:text-yellow-400' :
          'text-red-600 dark:text-red-400'
        )}>
          {stageCard.confidence}% confidence
        </span>
        <span>•</span>
        <span>Close: {stageCard.closeDate}</span>
      </div>
    </motion.div>
  );
}


// Parse saved messages from JSON
function parseMessages(json: string): ChatMessage[] {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed.map((msg: { 
        role?: string; 
        content?: string; 
        timestamp?: string; 
        agentName?: string;
        functionDisplayName?: string;
      }, idx: number) => ({
        id: `msg-${idx}`,
        type: msg.role === 'user' ? 'user' : 'agent',
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content || '',
        timestamp: msg.timestamp || new Date().toISOString(),
        agentName: msg.agentName,
        functionDisplayName: msg.functionDisplayName,
      } as ChatMessage));
    }
  } catch {
    // Invalid JSON
  }
  return [];
}

export default function HomeDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isOffline] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use shared copilot context instead of local state
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Chat panel state - UI only, messages come from context
  const [chatPanelExpanded, setChatPanelExpanded] = useState(false);
  const [chatPanelFullScreen, setChatPanelFullScreen] = useState(false);

  const [longPressMessage, setLongPressMessage] = useState<ChatMessage | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedSource, setSelectedSource] = useState<{ type: string; id: string; label: string } | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [playingInlineId, setPlayingInlineId] = useState<string | null>(null);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  // Bell icon now opens the unified insights sheet (KPICards owns the JSX,
  // we just control open state from here so the bell can trigger it).
  const [insightsSheetOpen, setInsightsSheetOpen] = useState(false);
  const [isRefreshingInsight, setIsRefreshingInsight] = useState(false);
  const [insightRefreshStatus, setInsightRefreshStatus] = useState<string>('');
  // Pull-to-refresh state
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const pullStartYRef = useRef<number | null>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const [customInsightText, setCustomInsightText] = useState<string[] | null>(null);
  const [briefTranscripts, setBriefTranscripts] = useState<string[]>(() => {
    // Load saved transcripts from localStorage
    const saved = localStorage.getItem('briefTranscripts');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [homeHeaderWidget, setHomeHeaderWidgetState] = useState<HomeHeaderWidget>(() => getHomeHeaderWidget());

  // Listen for home header widget changes from settings
  useEffect(() => {
    const handleWidgetChange = (e: CustomEvent<HomeHeaderWidget>) => {
      setHomeHeaderWidgetState(e.detail);
    };
    window.addEventListener('homeheaderwidget-changed', handleWidgetChange as EventListener);
    return () => window.removeEventListener('homeheaderwidget-changed', handleWidgetChange as EventListener);
  }, []);
  
  // Brief Me audio player state
  const [briefMeExpanded, setBriefMeExpanded] = useState(false);
  const [briefMeIsPlaying, setBriefMeIsPlaying] = useState(false);
  const [briefMeSpeed, setBriefMeSpeed] = useState(1);
  const [briefMeCurrentTime, setBriefMeCurrentTime] = useState(0);
  const [briefMeTotalTime, setBriefMeTotalTime] = useState(0);
  const [briefMeCurrentIndex, setBriefMeCurrentIndex] = useState(0);
  const briefMeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const briefMeStartTimeRef = useRef<number>(0);
  const briefMeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const lastAutoPlayedIdRef = useRef<string | null>(null);
  const speechSynthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
  
  // FIX: Refs to prevent infinite loop in conversation load/save
  const loadedConvRef = useRef<string | null>(null);
  const lastSavedRef = useRef<string>('');

  // User data
  const { data: user } = useUser();
  const locale: Locale = useLocale();
  
  // Check if copilot is configured (either Copilot Studio or BYOM)
  const copilotStudioConfig = getCopilotConfig();
  const llmConfigCheck = getLLMConfig();
  const isCopilotConfigured = !!copilotStudioConfig?.tokenEndpoint || (!!llmConfigCheck?.enabled && !!llmConfigCheck?.endpoint);
  const thinkingDotStyle: ThinkingDotStyle = getThinkingDotStyle();

  // Shared copilot context - use context's messages and sendMessage
  const copilot = useCopilot();
  const isInitializingCopilot = copilot.isConnecting;
  
  // Derive chat state from context for unified experience across all pages
  const chatMessages = copilot.messages;
  const setChatMessages = copilot.setMessages;
  const inputValue = copilot.inputValue;
  const setInputValue = copilot.setInputValue;
  const isSending = copilot.isSending;
  const setIsSending = copilot.setIsSending;
  const copilotConnected = copilot.isConnected;
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

  // Data queries
  const { data: activities = [], refetch: refetchActivities } = useActivityList();
  const { data: opportunities = [], refetch: refetchOpportunities } = useOpportunityList();
  const { data: accounts = [], refetch: refetchAccounts } = useAccountList();

  const { data: conversations = [], isLoading: isLoadingConversations } = useCopilotConversationList();
  const updateConversation = useUpdateCopilotConversation();
  const createConversation = useCreateCopilotConversation();
  const { data: businessInsights = [], refetch: refetchBusinessInsights, isLoading: isLoadingBusinessInsights } = useBusinessInsightList({ filter: 'isactive eq true', orderBy: ['displayorder asc'] });
  const createBusinessInsight = useCreateBusinessInsight();
  const deleteBusinessInsight = useDeleteBusinessInsight();
  const updateActivity = useUpdateActivity();

  // Activity-related filtering removed: the unified Insights sheet now shows
  // all business insights regardless of reference type.

  const userId = user?.objectId;

  // Get source data for drawer
  const sourceData = useMemo(() => {
    if (!selectedSource) return null;
    
    switch (selectedSource.type) {
      case 'account':
        return accounts.find((a: Account) => a.id === selectedSource.id);
      case 'opportunity':
        return opportunities.find((o: Opportunity) => o.id === selectedSource.id);
      case 'activity':
        return activities.find((a: Activity) => a.id === selectedSource.id);
      default:
        return null;
    }
  }, [selectedSource, accounts, opportunities, activities]);

  // KPI Calculations - new comprehensive KPI data
  const kpiData: KPIData = useMemo(() => {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - today.getDay());
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + (7 - today.getDay()));

    // Active opportunities (not won/lost)
    const activeOpps = opportunities.filter(
      (o: Opportunity) => !isClosedStage(o.stageKey)
    );

    // Hot opportunities - top 3 active opportunities by amount
    // If there are opportunities with close dates within 30 days or confidence >= 50%, prioritize those
    // Otherwise, show the top 3 by amount regardless
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    // First try to find opportunities with close dates or high confidence
    let hotOpps = activeOpps
      .filter((o: Opportunity) => {
        const closeDate = o.expectedclosedate ? new Date(o.expectedclosedate) : null;
        const confidence = o.confidence ?? 0;
        const closingSoon = closeDate && closeDate >= today && closeDate <= thirtyDaysFromNow;
        const highConfidence = confidence >= 50;
        return closingSoon || highConfidence;
      })
      .sort((a: Opportunity, b: Opportunity) => (b.totalamount || 0) - (a.totalamount || 0))
      .slice(0, 3);
    
    // If no opportunities match the strict criteria, fall back to top 3 by amount
    if (hotOpps.length === 0) {
      hotOpps = activeOpps
        .sort((a: Opportunity, b: Opportunity) => (b.totalamount || 0) - (a.totalamount || 0))
        .slice(0, 3);
    }

    const hotOpportunitiesValue = hotOpps.reduce((sum: number, o: Opportunity) => sum + (o.totalamount || 0), 0);

    // Closing this week
    const closingThisWeek = activeOpps.filter((o: Opportunity) => {
      const closeDate = o.expectedclosedate ? new Date(o.expectedclosedate) : null;
      return closeDate && closeDate <= weekEnd;
    }).length;

    // Client coverage - contacted within last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const clientsTouchedThisWeek = accounts.filter((a: Account) => {
      const lastContact = a.lastcontactedon ? new Date(a.lastcontactedon) : null;
      return lastContact && lastContact >= sevenDaysAgo;
    }).length;

    // Clients at risk - not contacted in 14+ days
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const clientsAtRiskFiltered = accounts.filter((a: Account) => {
      const lastContact = a.lastcontactedon ? new Date(a.lastcontactedon) : null;
      return !lastContact || lastContact < fourteenDaysAgo;
    });
    const clientsAtRisk = clientsAtRiskFiltered.length;
    const clientsAtRiskList: AtRiskClient[] = clientsAtRiskFiltered.map((a: Account) => ({
      id: a.id,
      name: a.name1 || 'Unnamed',
    }));

    // Activities this week (count all activities as demo)
    const activitiesThisWeek = activities.length;
    const weeklyTarget = 15; // Default target

    // Activity breakdown - use typeKey
    const visitCount = activities.filter((a: Activity) => {
      const typeLabel = ActivityTypeKeyToLabel[a.typeKey];
      return typeLabel === 'visit' || typeLabel === 'meeting';
    }).length;
    
    const callCount = activities.filter((a: Activity) => {
      const typeLabel = ActivityTypeKeyToLabel[a.typeKey];
      return typeLabel === 'call';
    }).length;

    // Generate agenda items from activities scheduled for today
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    
    const todayActivities = activities.filter((a: Activity) => {
      if (!a.scheduleddate) return false;
      const scheduled = new Date(a.scheduleddate);
      return scheduled >= todayStart && scheduled <= todayEnd;
    });
    
    const agendaItems: AgendaItem[] = todayActivities.slice(0, 5).map((a: Activity, idx: number) => {
      const typeLabel = ActivityTypeKeyToLabel[a.typeKey];
      const type = typeLabel === 'call' ? 'call' :
                   typeLabel === 'visit' || typeLabel === 'meeting' ? 'visit' :
                   typeLabel === 'email' ? 'proposal' : 'follow-up';
      // Look up account address by account ID
      const linkedAccount = a.account?.id ? accounts.find((acc: Account) => acc.id === a.account?.id) : undefined;
      return {
        id: a.id || `agenda-${idx}`,
        type,
        label: a.title || `${type} task`,
        accountName: a.account?.name1,
        address: linkedAccount?.address,
      };
    });

    // Overdue items - any activity scheduled BEFORE today that is NOT completed
    // This includes activities from this week before today AND any older activities
    const overdueActivities = activities.filter((a: Activity) => {
      if (!a.scheduleddate) return false;
      const scheduled = new Date(a.scheduleddate);
      // Any activity scheduled before today (not including today)
      const isBeforeToday = scheduled < todayStart;
      // NOT completed
      const isNotCompleted = ActivityDraftstatusKeyToLabel[a.draftstatusKey] !== 'completed';
      return isBeforeToday && isNotCompleted;
    });
    
    const overdueItems: AgendaItem[] = overdueActivities.map((a: Activity, idx: number) => {
      const typeLabel = ActivityTypeKeyToLabel[a.typeKey];
      const type = typeLabel === 'call' ? 'call' :
                   typeLabel === 'visit' || typeLabel === 'meeting' ? 'visit' :
                   typeLabel === 'email' ? 'proposal' : 'follow-up';
      // Look up account address by account ID
      const linkedAccount = a.account?.id ? accounts.find((acc: Account) => acc.id === a.account?.id) : undefined;
      return {
        id: a.id || `overdue-${idx}`,
        type,
        label: a.title || `${type} task`,
        accountName: a.account?.name1,
        address: linkedAccount?.address,
        description: a.notes,
        scheduledDate: new Date(a.scheduleddate!),
      };
    });

    // No fallback placeholder data - show real data only

    const agendaCompleted = todayActivities.filter(
      (a: Activity) => ActivityDraftstatusKeyToLabel[a.draftstatusKey] === 'completed'
    ).length;

    // Quarterly Performance calculation
    // Get current quarter boundaries
    const currentQuarter = Math.floor(today.getMonth() / 3);
    const quarterStart = new Date(today.getFullYear(), currentQuarter * 3, 1);
    const quarterEnd = new Date(today.getFullYear(), (currentQuarter + 1) * 3, 0, 23, 59, 59, 999);
    
    // Won opportunities this quarter.
    // Some "won" records in the back end ship without `closedon` populated
    // (the field is optional), which used to silently drop them from the KPI.
    // Fall back through `closedon → expectedclosedate → createdon`, and if
    // none are present treat the record as in-quarter so genuinely won deals
    // never disappear from the dashboard.
    const wonOpportunities = opportunities.filter((o: Opportunity) => {
      if (!isWonStage(o.stageKey)) return false;
      const dateStr = o.closedon || o.expectedclosedate || o.createdon;
      if (!dateStr) return true;
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return true;
      return d >= quarterStart && d <= quarterEnd;
    });
    const quarterlyWonAmount = wonOpportunities.reduce((sum: number, o: Opportunity) => sum + (o.totalamount || 0), 0);
    const quarterlyWonCount = wonOpportunities.length;
    
    // All opportunities in pipeline this quarter (active + won this quarter)
    const quarterlyTotalCount = activeOpps.length + quarterlyWonCount;
    
    // Quarterly target - could be from settings, for now use a reasonable default based on pipeline
    // Use 150% of current won amount as target, minimum $100,000
    const estimatedQuarterlyTarget = Math.max(100000, quarterlyWonAmount > 0 ? quarterlyWonAmount * 1.5 : hotOpportunitiesValue * 0.8);
    const quarterlyTarget = estimatedQuarterlyTarget;

    // Generate hot opportunities list


    return {
      // Today's Agenda
      agendaItems,
      agendaCompleted: Math.min(agendaCompleted, agendaItems.length),
      overdueItems: overdueItems.sort((a, b) => b.scheduledDate!.getTime() - a.scheduledDate!.getTime()), // Most recent first
      
      // Quarterly Performance (replaces Hot Opportunities)
      quarterlyWonAmount,
      quarterlyTarget,
      quarterlyWonCount,
      quarterlyTotalCount,
      closingThisWeek,
      
      // Client Coverage
      clientsTouchedThisWeek: clientsTouchedThisWeek,
      totalClients: accounts.length,
      clientsAtRisk: clientsAtRisk,
      clientsAtRiskList: clientsAtRiskList,
      
      // Weekly Momentum
      activitiesThisWeek: activitiesThisWeek,
      weeklyTarget,
      visitCount: visitCount,
      callCount: callCount,
    };
  }, [activities, opportunities, accounts]);

  // Extract stable primitive values from kpiData to avoid object reference changes
  const kpiSummary = useMemo(() => ({
    agendaCount: kpiData.agendaItems.length,
    quarterlyWonAmount: kpiData.quarterlyWonAmount,
    quarterlyTarget: kpiData.quarterlyTarget,
    quarterlyWonCount: kpiData.quarterlyWonCount,
    quarterlyTotalCount: kpiData.quarterlyTotalCount,
    clientsTouched: kpiData.clientsTouchedThisWeek,
    totalClients: kpiData.totalClients,
    clientsAtRisk: kpiData.clientsAtRisk,
    activitiesThisWeek: kpiData.activitiesThisWeek,
    weeklyTarget: kpiData.weeklyTarget,
    visitCount: kpiData.visitCount,
    callCount: kpiData.callCount,
    // Stringify arrays once for stable comparison
    agendaItemsJson: JSON.stringify(kpiData.agendaItems.map((item: AgendaItem) => ({ type: item.type, label: item.label }))),
  }), [
    kpiData.agendaItems,
    kpiData.quarterlyWonAmount,
    kpiData.quarterlyTarget,
    kpiData.quarterlyWonCount,
    kpiData.quarterlyTotalCount,
    kpiData.clientsTouchedThisWeek,
    kpiData.totalClients,
    kpiData.clientsAtRisk,
    kpiData.activitiesThisWeek,
    kpiData.weeklyTarget,
    kpiData.visitCount,
    kpiData.callCount,
  ]);



  // Set page context for copilot agent awareness
  useEffect(() => {
    const quarterlyProgress = kpiSummary.quarterlyTarget > 0 ? Math.round((kpiSummary.quarterlyWonAmount / kpiSummary.quarterlyTarget) * 100) : 0;
    copilot.setPageContext({
      currentPage: 'Home / Dashboard',
      summary: locale === 'zh-Hans'
        ? `首页仪表盘：${kpiSummary.agendaCount}个待办事项，本季度业绩完成率${quarterlyProgress}%（已成交$${(kpiSummary.quarterlyWonAmount / 1000).toFixed(0)}K / 目标$${(kpiSummary.quarterlyTarget / 1000).toFixed(0)}K），${kpiSummary.clientsTouched}/${kpiSummary.totalClients}个客户本周已联系，${kpiSummary.clientsAtRisk}个客户需要跟进`
        : `Home dashboard: ${kpiSummary.agendaCount} agenda items, Q performance ${quarterlyProgress}% (won $${(kpiSummary.quarterlyWonAmount / 1000).toFixed(0)}K / target $${(kpiSummary.quarterlyTarget / 1000).toFixed(0)}K), ${kpiSummary.clientsTouched}/${kpiSummary.totalClients} clients contacted this week, ${kpiSummary.clientsAtRisk} clients need follow-up`,
      pageData: {
        todayAgenda: JSON.parse(kpiSummary.agendaItemsJson),
        quarterlyPerformance: {
          wonAmount: kpiSummary.quarterlyWonAmount,
          target: kpiSummary.quarterlyTarget,
          wonCount: kpiSummary.quarterlyWonCount,
          totalCount: kpiSummary.quarterlyTotalCount,
          progressPercent: quarterlyProgress,
        },
        clientCoverage: {
          touched: kpiSummary.clientsTouched,
          total: kpiSummary.totalClients,
          atRisk: kpiSummary.clientsAtRisk,
        },
        weeklyMomentum: {
          activities: kpiSummary.activitiesThisWeek,
          target: kpiSummary.weeklyTarget,
          visits: kpiSummary.visitCount,
          calls: kpiSummary.callCount,
        },
      },
    });
    
    return () => {
      // Clear context when leaving the page
      copilot.setPageContext(null);
    };
  }, [kpiSummary, locale, copilot.setPageContext]);

  // Load conversation history - ONE-SHOT per conversation to prevent loops
  useEffect(() => {
    // Guard: Don't load if no conversations yet or still loading
    if (!conversations || conversations.length === 0) return;
    
    const userConvos = conversations.filter((c: CopilotConversation) => c.ownerid === userId);
    if (userConvos.length === 0) return;
    
    const latest = userConvos.sort((a: CopilotConversation, b: CopilotConversation) => 
      new Date(b.lastactiveon).getTime() - new Date(a.lastactiveon).getTime()
    )[0];
    
    // Guard: Already loaded this conversation - prevents loop
    if (loadedConvRef.current === latest.id) return;
    
    // Set conversation ID
    setCurrentConversationId(latest.id);
    loadedConvRef.current = latest.id;
    
    // Only set messages if local state is empty (initial load)
    if (chatMessages.length === 0) {
      const parsed = parseMessages(latest.messagesjson);
      setChatMessages(parsed);
      // Also update lastSavedRef to prevent immediate save-back
      lastSavedRef.current = latest.messagesjson || '';
    }
  }, [conversations, userId]); // NOT depending on chatMessages - load is one-shot

  // Save messages to conversation - with content-comparison to prevent loops
  useEffect(() => {
    if (!currentConversationId || chatMessages.length === 0) return;
    
    // Guard: Don't save while streaming is in progress
    const isStreaming = chatMessages.some((m: ChatMessage) => m.isStreaming || m.isThinking);
    if (isStreaming) return;
    
    // Convert ChatMessage[] to serializable format
    const filteredMessages = chatMessages
      .filter((m: ChatMessage) => !m.isThinking && !m.isStreaming)
      .map((m: ChatMessage) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        agentName: m.agentName,
        functionDisplayName: m.functionDisplayName,
      }));
    
    const messagesJson = JSON.stringify(filteredMessages);
    // Guard: No change since last save - prevents loop
    if (messagesJson === lastSavedRef.current) return;
    lastSavedRef.current = messagesJson;
    
    // Debounce save by 500ms to avoid spamming during rapid updates
    const saveTimer = setTimeout(() => {
      updateConversation.mutate({
        id: currentConversationId,
        changedFields: {
          messagesjson: messagesJson,
          lastactiveon: new Date().toISOString(),
        },
      });
    }, 500);
    
    return () => clearTimeout(saveTimer);
  }, [chatMessages, currentConversationId, updateConversation]);

  // Note: Removed auto-expand behavior - user should manually open Copilot panel
  // Connection status indicator shows whether Copilot is configured (gray/orange/green)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Auto-play agent response with TTS when enabled
  useEffect(() => {
    if (!getAutoPlayAgentResponse()) return;
    
    // Find the latest agent message
    const agentMessages = chatMessages.filter((m: ChatMessage) => m.type === 'agent');
    if (agentMessages.length === 0) return;
    
    const latestMessage = agentMessages[agentMessages.length - 1];
    
    // Don't replay if we already played this message
    if (lastAutoPlayedIdRef.current === latestMessage.id) return;
    
    // Mark as played
    lastAutoPlayedIdRef.current = latestMessage.id;
    
    // Cancel any ongoing speech
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    
    // Function to speak text
    const speakText = (text: string) => {
      if (!text.trim()) return;
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = locale === 'zh-Hans' ? 'zh-CN' : 'en-US';
        const selectedVoiceId = getSelectedVoice();
        const matchingVoice = findMatchingSystemVoice(selectedVoiceId, locale);
        if (matchingVoice) {
          utterance.voice = matchingVoice;
        }
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        speechSynthesisRef.current = utterance;
        window.speechSynthesis.speak(utterance);
      }
    };
    
    // Extract plain text from content (remove markdown/json)
    let textToSpeak = latestMessage.content;
    try {
      // If it's JSON, try to extract meaningful text
      const parsed = JSON.parse(textToSpeak);
      if (Array.isArray(parsed)) {
        textToSpeak = parsed.map((item: Record<string, unknown>) => {
          const name = item.name || item.title || item.subject || item.displayName || '';
          return String(name);
        }).filter(Boolean).join('. ');
      } else if (typeof parsed === 'object') {
        textToSpeak = JSON.stringify(parsed);
      }
    } catch {
      // Not JSON, use as-is but strip markdown
      textToSpeak = textToSpeak
        .replace(/\*\*([^*]+)\*\*/g, '$1') // Bold
        .replace(/\*([^*]+)\*/g, '$1') // Italic
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
        .replace(/#{1,6}\s+/g, '') // Headers
        .replace(/`[^`]+`/g, '') // Inline code
        .replace(/```[\s\S]*?```/g, ''); // Code blocks
    }
    
    if (!textToSpeak.trim()) return;
    
    // Check if voice summary is enabled and custom LLM is configured
    const llmConfig = getLLMConfig();
    const voiceSummaryEnabled = getVoiceSummaryEnabled();
    
    if (voiceSummaryEnabled && llmConfig && llmConfig.enabled) {
      // Use LLM to generate voice summary
      generateVoiceSummary(latestMessage.content, locale).then((result) => {
        if (result.success && result.summary) {
          speakText(result.summary);
        } else {
          // Fallback to original text if summary generation fails
          speakText(textToSpeak);
        }
      }).catch(() => {
        // Fallback to original text on error
        speakText(textToSpeak);
      });
    } else {
      // Use original text directly
      speakText(textToSpeak);
    }
  }, [chatMessages, locale]);


  // Click outside to collapse chat panel
  useEffect(() => {
    if (!chatPanelExpanded) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (chatPanelRef.current && !chatPanelRef.current.contains(target)) {
        setChatPanelExpanded(false);
      }
    };
    
    // Add a small delay to prevent immediate collapse when clicking to expand
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [chatPanelExpanded]);

  // Pull to refresh
  const handleRefresh = useCallback(async () => {
    await Promise.all([refetchActivities(), refetchOpportunities(), refetchAccounts()]);
    toast.success(locale === 'zh-Hans' ? '已刷新' : 'Refreshed');
  }, [refetchActivities, refetchOpportunities, refetchAccounts, locale]);

  // Quick actions
  const handleNewVisit = () => {
    const firstAccount = accounts[0];
    if (firstAccount) {
      navigate(`/activity/${firstAccount.id}`);
    } else {
      navigate('/activity-capture');
    }
  };

  const handleAskCopilot = () => {
    // Open the chat panel in full screen mode
    setChatPanelFullScreen(true);
  };

  const handleViewOpportunities = () => {
    navigate('/opportunity-review');
  };

  // Overdue agenda handlers
  const handleMarkOverdueDone = useCallback(async (activityId: string) => {
    try {
      await updateActivity.mutateAsync({
        id: activityId,
        changedFields: { draftstatusKey: 'DraftstatusKey2' as const } // 'completed'
      });
      toast.success(locale === 'zh-Hans' ? '已标记完成' : 'Marked as done');
      refetchActivities();
    } catch (error) {
      console.error('Failed to mark activity as done:', error);
      toast.error(locale === 'zh-Hans' ? '操作失败' : 'Operation failed');
    }
  }, [updateActivity, refetchActivities, locale]);

  const handleRescheduleOverdue = useCallback(async (activityId: string, newDate: Date) => {
    try {
      await updateActivity.mutateAsync({
        id: activityId,
        changedFields: { scheduleddate: newDate.toISOString() }
      });
      toast.success(locale === 'zh-Hans' ? '已重新安排' : 'Rescheduled');
      refetchActivities();
    } catch (error) {
      console.error('Failed to reschedule activity:', error);
      toast.error(locale === 'zh-Hans' ? '操作失败' : 'Operation failed');
    }
  }, [updateActivity, refetchActivities, locale]);

  // Brief Me insight texts for TTS - USE STORED BRIEF TRANSCRIPT, not card titles
  const briefMeInsightTexts = useMemo(() => {
    // Priority 1: Check localStorage for the full brief transcript (generated during AI insight generation)
    const storedTranscript = localStorage.getItem('sales-copilot-brief-transcript');
    if (storedTranscript && storedTranscript.trim().length > 0) {
      // Return as a single-element array since it's one continuous speech
      return [storedTranscript];
    }
    
    // Priority 2: If custom insight text is provided (from current session AI generation), use that
    if (customInsightText && customInsightText.length > 0) {
      return customInsightText;
    }
    
    // Priority 3: Fallback - combine business insight titles into a basic script
    // This is a fallback for when transcript wasn't generated
    if (businessInsights && businessInsights.length > 0) {
      const insightTexts = businessInsights.map((insight: { title: string; summary: string; detailsjson: string }) => {
        try {
          const details = JSON.parse(insight.detailsjson || '[]');
          if (Array.isArray(details) && details.length > 0) {
            return `${insight.title}：${details.join(' ')}`;
          }
        } catch {
          // Fall back to summary if parsing fails
        }
        return `${insight.title}：${insight.summary}`;
      });
      
      // Combine into a single continuous speech
      const intro = locale === 'zh-Hans'
        ? '您好，这是今天的业务简报。'
        : 'Good morning! Here is your business briefing for today.';
      const outro = locale === 'zh-Hans'
        ? '以上是今天的业务要点，祝您今天工作顺利！'
        : 'That concludes your briefing. Have a productive day!';
      
      return [intro + ' ' + insightTexts.join(' ') + ' ' + outro];
    }
    
    // No insights available - return empty array
    return [];
  }, [customInsightText, businessInsights, locale]);

  // Brief Me handlers - auto-generate insights if none exist
  const handleBriefMe = async () => {
    if (briefMeExpanded) {
      // Stop playing and collapse
      handleBriefMeStop();
      setBriefMeExpanded(false);
    } else {
      // Check if we have business insights to play
      if (briefMeInsightTexts.length === 0) {
        // No insights available - generate them first
        toast.info(locale === 'zh-Hans' ? '正在生成每日简报...' : 'Generating daily briefing...');
        await handleRefreshInsight();
        // After generation, refetch to get the new insights
        const { data: newInsights } = await refetchBusinessInsights();
        if (!newInsights || newInsights.length === 0) {
          toast.error(locale === 'zh-Hans' ? '无法生成简报，请检查 AI 配置' : 'Failed to generate briefing. Please check AI settings.');
          return;
        }
      }
      
      // Expand and start playing
      setBriefMeExpanded(true);
      setBriefMeCurrentIndex(0);
      setBriefMeCurrentTime(0);
      // Calculate total time (rough estimate: 150 words per minute at 1x speed)
      const totalWords = briefMeInsightTexts.join(' ').split(/\s+/).length;
      const estimatedSeconds = Math.ceil((totalWords / 150) * 60);
      setBriefMeTotalTime(estimatedSeconds);
      // Auto-start playing after a short delay
      setTimeout(() => {
        handleBriefMePlay();
      }, 300);
    }
  };

  // Play insight at a specific index - used for auto-advance
  const playInsightAtIndex = useCallback((index: number) => {
    if (!('speechSynthesis' in window)) {
      toast.error(locale === 'zh-Hans' ? '您的浏览器不支持语音播放' : 'Your browser does not support speech synthesis');
      return;
    }
    
    // Cancel any existing speech
    window.speechSynthesis.cancel();
    
    const textToSpeak = briefMeInsightTexts[index];
    if (!textToSpeak) return;
    
    // Split text into paragraphs for natural pauses
    // Paragraphs are separated by double newlines or multiple newlines
    const paragraphs = textToSpeak
      .split(/\n\n+/)
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0);
    
    // If no clear paragraphs, split by sentences for some pausing
    const segments = paragraphs.length > 1 
      ? paragraphs 
      : textToSpeak.split(/(?<=[。！？.!?])/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);
    
    let currentSegment = 0;
    
    const speakNextSegment = () => {
      if (currentSegment >= segments.length) {
        // Finished all segments in this insight, move to next insight
        const nextIndex = index + 1;
        if (nextIndex < briefMeInsightTexts.length) {
          setBriefMeCurrentIndex(nextIndex);
          // Play next insight with a longer pause between insights
          setTimeout(() => {
            playInsightAtIndex(nextIndex);
          }, 800);
        } else {
          // Finished all insights
          setBriefMeIsPlaying(false);
          if (briefMeTimerRef.current) {
            clearInterval(briefMeTimerRef.current);
          }
        }
        return;
      }
      
      const segment = segments[currentSegment];
      const utterance = new SpeechSynthesisUtterance(segment);
      utterance.lang = locale === 'zh-Hans' ? 'zh-CN' : 'en-US';
      utterance.rate = briefMeSpeed;
      
      const selectedVoiceId = getSelectedVoice();
      const matchingVoice = findMatchingSystemVoice(selectedVoiceId, locale);
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }
      
      utterance.onend = () => {
        currentSegment++;
        // Add a natural pause between paragraphs (500ms)
        setTimeout(speakNextSegment, 500);
      };
      
      utterance.onerror = () => {
        setBriefMeIsPlaying(false);
        if (briefMeTimerRef.current) {
          clearInterval(briefMeTimerRef.current);
        }
      };
      
      briefMeUtteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    };
    
    briefMeStartTimeRef.current = Date.now();
    setBriefMeIsPlaying(true);
    speakNextSegment();
    
    // Start timer for current time
    if (briefMeTimerRef.current) {
      clearInterval(briefMeTimerRef.current);
    }
    briefMeTimerRef.current = setInterval(() => {
      setBriefMeCurrentTime((prev: number) => Math.min(prev + 1, briefMeTotalTime));
    }, 1000);
  }, [briefMeInsightTexts, briefMeSpeed, briefMeTotalTime, locale]);

  const handleBriefMePlay = () => {
    playInsightAtIndex(briefMeCurrentIndex);
  };

  const handleBriefMePause = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.pause();
      setBriefMeIsPlaying(false);
      if (briefMeTimerRef.current) {
        clearInterval(briefMeTimerRef.current);
      }
    }
  };

  const handleBriefMeResume = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume();
      setBriefMeIsPlaying(true);
      briefMeStartTimeRef.current = Date.now();
      briefMeTimerRef.current = setInterval(() => {
        setBriefMeCurrentTime((prev: number) => Math.min(prev + 1, briefMeTotalTime));
      }, 1000);
    }
  };

  const handleBriefMeStop = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setBriefMeIsPlaying(false);
    setBriefMeCurrentTime(0);
    setBriefMeCurrentIndex(0);
    if (briefMeTimerRef.current) {
      clearInterval(briefMeTimerRef.current);
    }
  };

  const handleBriefMeSpeedToggle = () => {
    const speeds = [0.75, 1, 1.25, 1.5, 2];
    const currentIdx = speeds.indexOf(briefMeSpeed);
    const nextSpeed = speeds[(currentIdx + 1) % speeds.length];
    setBriefMeSpeed(nextSpeed);
    // If currently playing, restart with new speed
    if (briefMeIsPlaying) {
      window.speechSynthesis.cancel();
      setTimeout(() => playInsightAtIndex(briefMeCurrentIndex), 100);
    }
  };

  const handleBriefMePrev = () => {
    if (briefMeCurrentIndex > 0) {
      window.speechSynthesis.cancel();
      const prevIndex = briefMeCurrentIndex - 1;
      setBriefMeCurrentIndex(prevIndex);
      if (briefMeIsPlaying) {
        setTimeout(() => playInsightAtIndex(prevIndex), 100);
      }
    }
  };

  const handleBriefMeNext = () => {
    if (briefMeCurrentIndex < briefMeInsightTexts.length - 1) {
      window.speechSynthesis.cancel();
      const nextIndex = briefMeCurrentIndex + 1;
      setBriefMeCurrentIndex(nextIndex);
      if (briefMeIsPlaying) {
        setTimeout(() => playInsightAtIndex(nextIndex), 100);
      }
    }
  };

  const handleBriefMeClose = () => {
    handleBriefMeStop();
    setBriefMeExpanded(false);
  };

  const formatBriefMeTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Cleanup Brief Me on unmount
  useEffect(() => {
    return () => {
      if (briefMeTimerRef.current) {
        clearInterval(briefMeTimerRef.current);
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Refresh business insight - uses configured agent framework
  const handleRefreshInsight = async () => {
    if (isRefreshingInsight) return;
    
    const llmConfig = getLLMConfig();
    const agentFramework = getAgentFramework();

    // Only local-agent framework is supported for insight refresh
    // Copilot Studio session is managed by CopilotContext for chat interactions
    if (agentFramework !== 'local-agent' || !llmConfig || !llmConfig.enabled || !llmConfig.endpoint) {
      toast.error(locale === 'zh-Hans' ? '请先配置并启用自定义 LLM 模型' : 'Please configure and enable a custom LLM first');
      return;
    }

    if (!llmConfig || !llmConfig.enabled || !llmConfig.endpoint) {
      toast.error(locale === 'zh-Hans' ? '请先配置智能体框架' : 'Please configure an agent framework first');
      return;
    }
    
    setIsRefreshingInsight(true);
    setInsightRefreshStatus(locale === 'zh-Hans' ? '正在收集数据...' : 'Gathering data...');
    toast.info(t('refreshingInsight', locale));
    
    try {
      let agentResponse = '';
      
      // Update status for LLM analysis
      setInsightRefreshStatus(locale === 'zh-Hans' ? '正在分析业务数据...' : 'Analyzing business data...');

      // Build detailed context with specific names and data for richer insights (used by both branches)
      const todayAgendaDetails = kpiData.agendaItems.slice(0, 5).map((item: AgendaItem) => 
        `${item.type}: ${item.label}`
      ).join('; ');
      
      // Calculate quarterly performance progress
      const qProgress = kpiData.quarterlyTarget > 0 ? Math.round((kpiData.quarterlyWonAmount / kpiData.quarterlyTarget) * 100) : 0;
      const quarterlyPerformanceDetails = `已成交 $${(kpiData.quarterlyWonAmount / 1000).toFixed(0)}K / 目标 $${(kpiData.quarterlyTarget / 1000).toFixed(0)}K (完成率 ${qProgress}%)`;
      
      const atRiskClientsDetails = kpiData.clientsAtRiskList.slice(0, 5).map((client: AtRiskClient) => 
        `${client.name}`
      ).join('; ');
      
      if (agentFramework === 'local-agent' && llmConfig?.enabled) {
        // Use local agent with BYOM to generate insights directly
        const systemPrompt = locale === 'zh-Hans'
          ? `你是一个销售助手，负责分析销售数据并生成有价值的业务洞察。

【最重要规则 - 必须严格遵守】
- 只能使用下方数据中明确列出的客户名、商机名、活动名
- 绝对禁止编造、杜撰任何不存在于下方数据中的名称
- 如果某类数据显示"暂无"或空，则不要生成相关洞察
- 如果风险客户为0个，不要提及任何风险客户

请用中文回复。

=== 今日待办事项 (${kpiData.agendaItems.length}项) ===
${todayAgendaDetails || '暂无待办'}

=== 季度业绩 ===
${quarterlyPerformanceDetails}

=== 风险客户 (${kpiData.clientsAtRisk}个需要关注) ===
${atRiskClientsDetails || '暂无风险客户'}

=== 其他统计 ===
- 客户覆盖率：本周已联系 ${kpiData.clientsTouchedThisWeek}/${kpiData.totalClients} 个客户
- 活动完成度：${kpiData.activitiesThisWeek}/${kpiData.weeklyTarget}`
          : `You are a sales assistant that analyzes sales data and generates actionable business insights.

[MOST CRITICAL RULE - MUST STRICTLY FOLLOW]
- ONLY use client names, opportunity names, and activity names that are EXPLICITLY listed in the data below
- ABSOLUTELY FORBIDDEN to fabricate, invent, or make up any names not present in the data
- If a data category shows "No data" or empty, do NOT generate insights about it
- If at-risk clients count is 0, do NOT mention any at-risk clients

=== Today's Agenda (${kpiData.agendaItems.length} items) ===
${todayAgendaDetails || 'No agenda items'}

=== Quarterly Performance ===
Won $${(kpiData.quarterlyWonAmount / 1000).toFixed(0)}K / Target $${(kpiData.quarterlyTarget / 1000).toFixed(0)}K (${qProgress}% complete)

=== At-Risk Clients (${kpiData.clientsAtRisk} need attention) ===
${atRiskClientsDetails || 'No at-risk clients'}

=== Other Metrics ===
- Client coverage: ${kpiData.clientsTouchedThisWeek}/${kpiData.totalClients} clients contacted this week
- Activity progress: ${kpiData.activitiesThisWeek}/${kpiData.weeklyTarget}`;
        
        const userPrompt = locale === 'zh-Hans'
          ? '请给我今日的业务洞察简报，包括：1）最需要优先处理的事项；2）需要重点跟进的商机；3）需要主动联系的风险客户。每个洞察要具体到客户名和商机名。'
          : 'Give me today\'s business insight briefing, including: 1) Top priority items to address; 2) Key opportunities to follow up; 3) At-risk clients to proactively contact. Be specific with client and opportunity names.';
        
        // Update status for generating response
        setInsightRefreshStatus(locale === 'zh-Hans' ? '正在生成洞察...' : 'Generating insights...');
        // Call LLM directly using generateVoiceSummary with custom prompts
        const summaryResult = await generateVoiceSummary(userPrompt, locale, systemPrompt, llmConfig);
        
        if (summaryResult.success && summaryResult.summary) {
          agentResponse = summaryResult.summary;
        } else {
          throw new Error(summaryResult.error || 'Failed to generate response from LLM');
        }
      }
      
      if (!agentResponse) {
        throw new Error('No response generated');
      }
      
      // Update status for saving insights
      setInsightRefreshStatus(locale === 'zh-Hans' ? '正在保存洞察...' : 'Saving insights...');
      
      // Step 1: Generate insight bullet points for cards
      // Generate insights with rationale in JSON format
      // Build raw data string directly for insight generation (avoid LLM fabrication)
      const rawDataForInsights = locale === 'zh-Hans'
        ? `=== 今日待办事项 (${kpiData.agendaItems.length}项) ===
${todayAgendaDetails || '暂无待办'}

=== 季度业绩 ===
${quarterlyPerformanceDetails}

=== 风险客户 (${kpiData.clientsAtRisk}个需要关注) ===
${atRiskClientsDetails || '暂无风险客户'}

=== 其他统计 ===
- 本周即将成交：${kpiData.closingThisWeek}个商机
- 客户覆盖率：本周已联系 ${kpiData.clientsTouchedThisWeek}/${kpiData.totalClients} 个客户
- 活动完成度：${kpiData.activitiesThisWeek}/${kpiData.weeklyTarget}`
        : `=== Today's Agenda (${kpiData.agendaItems.length} items) ===
${todayAgendaDetails || 'No agenda items'}

=== Quarterly Performance ===
Won $${(kpiData.quarterlyWonAmount / 1000).toFixed(0)}K / Target $${(kpiData.quarterlyTarget / 1000).toFixed(0)}K (${qProgress}% complete)

=== At-Risk Clients (${kpiData.clientsAtRisk} need attention) ===
${atRiskClientsDetails || 'No at-risk clients'}

=== Other Metrics ===
- Closing this week: ${kpiData.closingThisWeek} opportunities
- Client coverage: ${kpiData.clientsTouchedThisWeek}/${kpiData.totalClients} clients contacted this week
- Activity progress: ${kpiData.activitiesThisWeek}/${kpiData.weeklyTarget}`;

      const insightSystemPrompt = locale === 'zh-Hans'
        ? `你是一个业务洞察生成器。基于以下业务数据，生成 5-6 条业务洞察。

【最重要规则 - 必须严格遵守】
- 只能使用下方"业务数据"中明确列出的客户名、商机名、活动名
- 绝对禁止编造、杜撰任何不存在于数据中的名称
- 如果数据中没有风险客户（显示"暂无风险客户"或数量为0），不要生成风险相关的洞察
- 如果数据为空或"暂无"，如实反映，不要凭空填充

每条洞察必须包含：
1. insight: 简洁的洞察要点（不超过20字）
2. rationale: 具体解释（限200字以内），必须包含：
   - 引用原始数据中的具体数字（如金额、天数、百分比）
   - 只提及数据中真实存在的客户名或商机名
   - 说明数据之间的关联或趋势
   - 给出具体的建议行动
3. type: 洞察类型（followup/closing/risk/revisit/performance/opportunity/client/activity）

【禁止】
- 不要编造不存在于数据中的客户名或商机名
- 不要使用"基于数据分析""根据历史记录"等模糊描述
- 不要只说"需要关注"而不说明具体原因

返回JSON数组格式：
[
  {"insight": "洞察要点", "rationale": "具体原因和建议", "type": "类型"}
]

只返回JSON数组，不要其他文字。`
        : `You are a business insight generator. Based on the following business data, generate 5-6 business insights.

[MOST CRITICAL RULE - MUST STRICTLY FOLLOW]
- ONLY use client names, opportunity names, and activity names that are EXPLICITLY listed in the "Business Data" below
- ABSOLUTELY FORBIDDEN to fabricate, invent, or make up any names not present in the data
- If there are no at-risk clients in the data (shows "No at-risk clients" or count is 0), do NOT generate risk-related insights
- If data is empty or shows "No data", reflect that honestly - do NOT fill in with made-up content

Each insight must include:
1. insight: A concise insight point (max 10 words)
2. rationale: Specific explanation (max 200 words) with:
   - Concrete numbers from the data (amounts, days, percentages)
   - ONLY mention client or opportunity names that actually exist in the data
   - Data relationships or trends
   - Specific recommended action
3. type: Insight type (followup/closing/risk/revisit/performance/opportunity/client/activity)

[FORBIDDEN]
- Do NOT fabricate client names or opportunity names not present in the data
- Do NOT use vague phrases like "based on data analysis" or "according to records"
- Do NOT just say "needs attention" without explaining why

Return JSON array format:
[
  {"insight": "Insight point", "rationale": "Specific reason and recommendation", "type": "type"}
]

Return only the JSON array, no other text.`;
      
      // Pass raw data directly to insight generation instead of agentResponse
      const insightResult = await generateVoiceSummary(rawDataForInsights, locale, insightSystemPrompt, llmConfig || undefined);
      
      if (!insightResult.success || !insightResult.summary) {
        throw new Error(insightResult.error || 'Failed to generate insight');
      }
      
      // Parse the JSON response
      let parsedInsights: Array<{ insight: string; rationale: string; type: string }> = [];
      try {
        // Try to extract JSON from the response (may have markdown code blocks)
        let jsonStr = insightResult.summary.trim();
        // Remove markdown code blocks if present
        if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
        }
        parsedInsights = JSON.parse(jsonStr);
      } catch (parseError) {
        console.error('Failed to parse insights JSON, falling back to line parsing:', parseError);
        // Fallback to old behavior if JSON parsing fails
        const insightLines = insightResult.summary
          .split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => line.length > 0)
          .slice(0, 6);
        parsedInsights = insightLines.map((line: string) => ({
          insight: line,
          rationale: locale === 'zh-Hans' ? '基于业务数据分析生成' : 'Generated from business data analysis',
          type: 'activity'
        }));
      }
      
      // Extract insight lines for brief transcript
      const insightLines = parsedInsights.map((item: { insight: string }) => item.insight);
      
      // Step 2: Generate comprehensive brief transcript for TTS playback
      // Build the insight list as a string first
      const insightListText = insightLines.map((line: string, i: number) => (i + 1) + '. ' + line).join('\n');
      
      const briefTranscriptPromptZh = `你是一个专业的销售助理，正在为销售人员播报今日的业务简报。请基于以下业务洞察内容，生成一段完整、流畅、自然的语音播报稿。

要求：
1. 以友好专业的语气开场，简短问候后直接进入正题
2. 依次介绍每个洞察点，使用口语化的过渡词连接
3. 提到具体的客户名称、商机名称、金额等关键信息
4. 每个洞察点给出明确的行动建议
5. 结尾简短有力，鼓励销售人员行动
6. 整段播报控制在 1-2 分钟内朗读完成
7. 不要使用 markdown 格式，返回纯文本
8. 【重要】在每个洞察点之间用空行分隔，形成自然段落，便于朗读时停顿
9. 【重要】每个段落结尾用句号，段落之间留空行

业务洞察内容：
${insightListText}

原始业务数据摘要：
${agentResponse}`;
      
      const briefTranscriptPromptEn = `You are a professional sales assistant delivering today's business briefing. Based on the business insights below, generate a complete, fluent, natural voice briefing script.

Requirements:
1. Start with a friendly, professional greeting then get straight to the point
2. Cover each insight with natural conversational transitions
3. Mention specific client names, opportunity names, amounts, and other key details
4. Give clear action recommendations for each insight
5. End with a brief, motivating call to action
6. Keep the entire briefing to about 1-2 minutes when read aloud
7. Do not use markdown formatting, return plain text only
8. [IMPORTANT] Separate each insight point with a blank line to create natural paragraphs for pauses during reading
9. [IMPORTANT] End each paragraph with a period, leave blank lines between paragraphs

Business insights:
${insightListText}

Original business data summary:
${agentResponse}`;
      
      const briefTranscriptPrompt = locale === 'zh-Hans' ? briefTranscriptPromptZh : briefTranscriptPromptEn;
      
      const briefTranscriptResult = await generateVoiceSummary(
        locale === 'zh-Hans' ? '请生成今日业务简报的语音播报稿' : 'Generate today\'s business briefing voice script',
        locale,
        briefTranscriptPrompt,
        llmConfig || undefined
      );
      
      // Get the brief transcript (fallback to agentResponse if generation fails)
      const briefTranscript = briefTranscriptResult.success && briefTranscriptResult.summary
        ? briefTranscriptResult.summary
        : agentResponse;
      
      // Save the full brief transcript to localStorage for TTS playback
      localStorage.setItem('sales-copilot-brief-transcript', briefTranscript);
      
      if (insightLines.length > 0) {
        
        // Delete ALL existing insights before creating new ones (replace instead of append)
        const { data: existingInsights } = await refetchBusinessInsights();
        if (existingInsights && existingInsights.length > 0) {
          // Delete all existing insights to prevent accumulation
          await Promise.all(existingInsights.map((insight: { id: string }) => 
            deleteBusinessInsight.mutateAsync(insight.id)
          ));
        }
        

        // Save new insights to Dataverse
        const now = new Date().toISOString();
        const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // Valid for 24 hours
        
        const savePromises = parsedInsights.map((item: { insight: string; rationale: string; type: string }, idx: number) => {
          // Get category info for title and typeKey based on insight type
          const typeMapping: Record<string, { title: string; typeKey: BusinessInsightTypeKey }> = {
            'followup': {
              title: locale === 'zh-Hans' ? '今日跟进提醒' : 'Follow-up Alert',
              typeKey: 'TypeKey1' as BusinessInsightTypeKey
            },
            'closing': {
              title: locale === 'zh-Hans' ? '本周成交预测' : 'Closing This Week',
              typeKey: 'TypeKey2' as BusinessInsightTypeKey
            },
            'risk': {
              title: locale === 'zh-Hans' ? '风险商机警告' : 'At-Risk Alert',
              typeKey: 'TypeKey0' as BusinessInsightTypeKey
            },
            'revisit': {
              title: locale === 'zh-Hans' ? '待回访客户' : 'Pending Revisit',
              typeKey: 'TypeKey0' as BusinessInsightTypeKey
            },
            'performance': {
              title: locale === 'zh-Hans' ? '业绩达成分析' : 'Performance Analysis',
              typeKey: 'TypeKey2' as BusinessInsightTypeKey
            },
            'opportunity': {
              title: locale === 'zh-Hans' ? '商机动态' : 'Opportunity Update',
              typeKey: 'TypeKey1' as BusinessInsightTypeKey
            },
            'client': {
              title: locale === 'zh-Hans' ? '客户洞察' : 'Client Insight',
              typeKey: 'TypeKey1' as BusinessInsightTypeKey
            },
            'activity': {
              title: locale === 'zh-Hans' ? '活动动态' : 'Activity Update',
              typeKey: 'TypeKey1' as BusinessInsightTypeKey
            }
          };
          
          const categoryInfo = typeMapping[item.type] || {
            title: locale === 'zh-Hans' ? `智能洞察 #${idx + 1}` : `Smart Insight #${idx + 1}`,
            typeKey: 'TypeKey1' as BusinessInsightTypeKey
          };
          
          return createBusinessInsight.mutateAsync({
            title: categoryInfo.title,
            summary: item.insight.length > 80 ? item.insight.substring(0, 80) + '...' : item.insight,
            detailsjson: JSON.stringify([item.insight]),
            rationale: item.rationale, // Full rationale (Dataverse field increased to support longer text)
            displayorder: idx,
            generatedon: now,
            isactive: true,
            ownerid: userId || '',
            referenceidsjson: '[]',
            referencetypeKey: 'ReferencetypeKey0' as BusinessInsightReferencetypeKey,
            typeKey: categoryInfo.typeKey,
            validuntil: validUntil,
          });
        });
        
        await Promise.all(savePromises);
        
        // Clear custom insight text so the component uses database data
        setCustomInsightText(null);
        
        // Refetch business insights to get the new data
        await refetchBusinessInsights();
        
        toast.success(t('insightRefreshed', locale));
      } else {
        throw new Error(insightResult.error || 'Failed to generate insight');
      }
    } catch (error) {
      console.error('[Insight Refresh] Error:', error);
      // Show more specific error message
      const errorMessage = error instanceof Error ? error.message : 'Something went wrong';
      if (errorMessage.includes('No response')) {
        toast.error(locale === 'zh-Hans' 
          ? '未收到代理响应，请稍后重试' 
          : 'No response from the assistant. Please try again later.');
      } else if (errorMessage.includes('Network error') || errorMessage.includes('Failed to fetch')) {
        toast.error(locale === 'zh-Hans' 
          ? '网络连接失败，请检查网络后重试' 
          : 'Network connection failed. Please check your connection and try again.');
      } else if (errorMessage.includes('CORS')) {
        toast.error(locale === 'zh-Hans' 
          ? 'CORS 错误：请检查 LLM 端点配置' 
          : 'CORS error: Please check your LLM endpoint configuration');
      } else if (errorMessage.includes('timed out') || errorMessage.includes('timeout')) {
        toast.error(locale === 'zh-Hans' 
          ? 'AI 响应超时，请稍后重试或检查 LLM 服务状态' 
          : 'AI response timed out. Please try again or check your LLM service status.');
      } else {
        toast.error(t('insightRefreshFailed', locale));
      }
    } finally {
      setIsRefreshingInsight(false);
      setInsightRefreshStatus('');
    }
  };

  // State for clearing insights
  const [isClearingInsights, setIsClearingInsights] = useState(false);

  // Clear all business insights
  const handleClearAllInsights = async () => {
    if (isClearingInsights) return;
    setIsClearingInsights(true);
    
    try {
      const { data: allInsights } = await refetchBusinessInsights();
      
      if (!allInsights || allInsights.length === 0) {
        toast.info(locale === 'zh-Hans' ? '没有需要清除的洞察数据' : 'No insights to clear');
        return;
      }
      
      // Delete insights one by one with progress
      const totalCount = allInsights.length;
      toast.loading(locale === 'zh-Hans' ? `正在清除 ${totalCount} 条洞察数据...` : `Clearing ${totalCount} insights...`, { id: 'clearing-insights' });
      
      for (const insight of allInsights) {
        await deleteBusinessInsight.mutateAsync(insight.id);
      }
      
      setCustomInsightText(null);
      await refetchBusinessInsights();
      
      toast.dismiss('clearing-insights');
      toast.success(locale === 'zh-Hans' ? `已清除 ${totalCount} 条历史洞察数据` : `Cleared ${totalCount} historical insights`);
    } catch (error) {
      console.error('[Clear Insights] Error:', error);
      toast.dismiss('clearing-insights');
      toast.error(locale === 'zh-Hans' ? '清除失败，请重试' : 'Failed to clear insights. Please try again.');
    } finally {
      setIsClearingInsights(false);
    }
  };

  // Use context's sendMessage for unified agent framework handling
  const sendMessage = copilot.sendMessage;

  // Handle clear insights URL param
  useEffect(() => {
    const clearInsights = searchParams.get('clearInsights');
    if (clearInsights === 'true') {
      searchParams.delete('clearInsights');
      setSearchParams(searchParams, { replace: true });
      handleClearAllInsights();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle global copilot navigation
  useEffect(() => {
    const openChat = searchParams.get('openChat');
    const message = searchParams.get('message');
    
    if (openChat === 'true') {
      setChatPanelExpanded(true);
      // Clear the query params
      searchParams.delete('openChat');
      searchParams.delete('message');
      setSearchParams(searchParams, { replace: true });
      
      // Focus the input and send message if provided
      setTimeout(() => {
        if (message) {
          setInputValue(message);
          sendMessage(message);
        } else {
          inputRef.current?.focus();
        }
      }, 300);
    }
  }, [searchParams, setSearchParams, sendMessage]);

  // Handle enter key - send through shared copilot
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && inputValue.trim()) {
      e.preventDefault();
      copilot.openPanel();
      copilot.setInputValue(inputValue);
      copilot.sendMessage(inputValue);
      setInputValue('');
    }
  };

  // Handle input focus - open shared copilot panel
  const handleInputFocus = () => {
    copilot.openPanel();
  };

  // Handle new conversation - delegates to context for Direct Line session management
  const handleNewConversation = async () => {
    if (isCreatingConversation) return;
    setIsCreatingConversation(true);
    
    try {
      // Let context handle Direct Line session reset
      await copilot.startNewConversation();

      const newConvo = await createConversation.mutateAsync({
        ownerid: userId || '',
        startedon: new Date().toISOString(),
        messagesjson: '[]',
        lastactiveon: new Date().toISOString(),
      });
      setCurrentConversationId(newConvo.id);
      setChatMessages([]);
      toast.success(locale === 'zh-Hans' ? '已创建新会话' : 'New conversation created');
    } finally {
      setIsCreatingConversation(false);
    }
  };

  // Handle full screen toggle
  const handleFullScreen = () => {
    setChatPanelFullScreen(true);
    setChatPanelExpanded(false);
  };

  // Handle close full screen
  const handleCloseFullScreen = () => {
    setChatPanelFullScreen(false);
  };

  // Handle collapse panel
  const handleCollapsePanel = () => {
    setChatPanelExpanded(false);
  };

  // Long press action handler
  const handleLongPressAction = (action: 'copy' | 'playVoice' | 'forward' | 'feedback') => {
    if (!longPressMessage) return;
    
    switch (action) {
      case 'copy':
        navigator.clipboard.writeText(longPressMessage.content);
        toast.success(locale === 'zh-Hans' ? '已复制到剪贴板' : 'Copied to clipboard');
        break;
      case 'playVoice':
        // Play voice using Web Speech API
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          let textToSpeak = longPressMessage.content;
          try {
            const parsed = JSON.parse(textToSpeak);
            if (Array.isArray(parsed)) {
              textToSpeak = parsed.map((item: Record<string, unknown>) => {
                const name = item.name || item.title || item.subject || item.displayName || '';
                return String(name);
              }).filter(Boolean).join('. ');
            }
          } catch {
            textToSpeak = textToSpeak
              .replace(/\*\*([^*]+)\*\*/g, '$1')
              .replace(/\*([^*]+)\*/g, '$1')
              .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
              .replace(/#{1,6}\s+/g, '')
              .replace(/`[^`]+`/g, '')
              .replace(/```[\s\S]*?```/g, '');
          }
          
          const speakFinalText = (text: string) => {
            if (!text.trim()) return;
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = locale === 'zh-Hans' ? 'zh-CN' : 'en-US';
            const selectedVoiceId = getSelectedVoice();
            const matchingVoice = findMatchingSystemVoice(selectedVoiceId, locale);
            if (matchingVoice) {
              utterance.voice = matchingVoice;
            }
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            window.speechSynthesis.speak(utterance);
            toast.success(locale === 'zh-Hans' ? '正在播放语音...' : 'Playing voice...');
          };
          
          // Check if voice summary is enabled and custom LLM is configured
          const llmConfig = getLLMConfig();
          const voiceSummaryEnabled = getVoiceSummaryEnabled();
          
          if (voiceSummaryEnabled && llmConfig && llmConfig.enabled && textToSpeak.trim()) {
            toast.info(locale === 'zh-Hans' ? '正在生成语音摘要...' : 'Generating voice summary...');
            generateVoiceSummary(longPressMessage.content, locale).then((result) => {
              if (result.success && result.summary) {
                speakFinalText(result.summary);
              } else {
                speakFinalText(textToSpeak);
              }
            }).catch(() => {
              speakFinalText(textToSpeak);
            });
          } else if (textToSpeak.trim()) {
            speakFinalText(textToSpeak);
          }
        } else {
          toast.error(locale === 'zh-Hans' ? '您的浏览器不支持语音播放' : 'Your browser does not support speech synthesis');
        }
        break;
        break;
      case 'forward':
        toast.success(locale === 'zh-Hans' ? '已转发到 Teams' : 'Forwarded to Teams');
        break;
      case 'feedback':
        toast.success(locale === 'zh-Hans' ? '反馈已提交' : 'Feedback submitted');
        break;
    }
    setLongPressMessage(null);
  };

  // Long press handlers for agent messages
  const handleMessageTouchStart = (message: ChatMessage) => {
    longPressTimerRef.current = setTimeout(() => {
      setLongPressMessage(message);
    }, 500); // 500ms for long press
  };

  const handleMessageTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Voice mic handlers
  const handleMicPointerDown = () => {
    recordTimerRef.current = setTimeout(() => {
      setIsRecording(true);
      toast.info(locale === 'zh-Hans' ? '开始录音...' : 'Recording...', { duration: 1500 });
    }, 300);
  };

  const handleMicPointerUp = () => {
    if (recordTimerRef.current) {
      clearTimeout(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (isRecording) {
      setIsRecording(false);
      toast.success(locale === 'zh-Hans' ? '录音完成，正在处理...' : 'Processing...', { duration: 2000 });
      // Mock voice-to-text
      const mockTranscript = locale === 'zh-Hans' ? '今天有哪些客户需要跟进？' : 'Which customers need follow-up today?';
      sendMessage(mockTranscript);
    }
  };

  // Avatar initial - first name first letter (used in sidebar)
  const getInitial = (name?: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    return parts[0][0].toUpperCase();
  };

  // Get context-aware quick actions based on conversation
  const getQuickActions = useCallback(() => {
    const lastMessages = chatMessages.slice(-3);
    const hasOpportunityContext = lastMessages.some((m: ChatMessage) => 
      m.content.toLowerCase().includes('opportunity') || 
      m.content.toLowerCase().includes('deal')
    );
    const hasAccountContext = lastMessages.some((m: ChatMessage) => 
      m.content.toLowerCase().includes('account') || 
      m.content.toLowerCase().includes('customer')
    );
    const hasScheduleContext = lastMessages.some((m: ChatMessage) => 
      m.content.toLowerCase().includes('schedule') || 
      m.content.toLowerCase().includes('meeting')
    );

    // Default actions
    if (chatMessages.length === 0) {
      return [
        { text: locale === 'zh-Hans' ? '今日待办' : "Today's tasks", query: locale === 'zh-Hans' ? '今天有哪些待办事项？' : 'What are my tasks for today?' },
        { text: locale === 'zh-Hans' ? '商机状态' : 'Pipeline status', query: locale === 'zh-Hans' ? '我的商机状态如何？' : 'What is my pipeline status?' },
        { text: locale === 'zh-Hans' ? '客户跟进' : 'Follow-ups', query: locale === 'zh-Hans' ? '哪些客户需要跟进？' : 'Which customers need follow-up?' },
      ];
    }

    // Context-aware actions
    if (hasOpportunityContext) {
      return [
        { text: locale === 'zh-Hans' ? '风险商机' : 'At-risk deals', query: locale === 'zh-Hans' ? '哪些商机有风险？' : 'Which deals are at risk?' },
        { text: locale === 'zh-Hans' ? '本周成交' : 'Closing this week', query: locale === 'zh-Hans' ? '本周有哪些商机要成交？' : 'What deals are closing this week?' },
        { text: locale === 'zh-Hans' ? '商机详情' : 'Deal details', query: locale === 'zh-Hans' ? '告诉我更多详情' : 'Tell me more details' },
      ];
    }

    if (hasAccountContext) {
      return [
        { text: locale === 'zh-Hans' ? '联系记录' : 'Contact history', query: locale === 'zh-Hans' ? '最近的联系记录' : 'Show recent contact history' },
        { text: locale === 'zh-Hans' ? '相关商机' : 'Related deals', query: locale === 'zh-Hans' ? '这个客户有哪些商机？' : 'What deals are associated?' },
        { text: locale === 'zh-Hans' ? '新建拜访' : 'New visit', query: locale === 'zh-Hans' ? '我想记录一次拜访' : 'I want to log a visit' },
      ];
    }

    if (hasScheduleContext) {
      return [
        { text: locale === 'zh-Hans' ? '明日日程' : 'Tomorrow', query: locale === 'zh-Hans' ? '明天的日程是什么？' : "What's my schedule tomorrow?" },
        { text: locale === 'zh-Hans' ? '安排会议' : 'Schedule meeting', query: locale === 'zh-Hans' ? '帮我安排一个会议' : 'Help me schedule a meeting' },
        { text: locale === 'zh-Hans' ? '准备事项' : 'Prep notes', query: locale === 'zh-Hans' ? '帮我准备会议资料' : 'Help me prepare for the meeting' },
      ];
    }

    // General follow-up actions
    return [
      { text: locale === 'zh-Hans' ? '更多详情' : 'More details', query: locale === 'zh-Hans' ? '告诉我更多详情' : 'Tell me more details' },
      { text: locale === 'zh-Hans' ? '今日待办' : "Today's tasks", query: locale === 'zh-Hans' ? '今天有哪些待办事项？' : 'What are my tasks for today?' },
      { text: locale === 'zh-Hans' ? '帮助' : 'Help', query: locale === 'zh-Hans' ? '你能帮我做什么？' : 'What can you help me with?' },
    ];
  }, [chatMessages, locale]);

  const quickActions = useMemo(() => getQuickActions(), [getQuickActions]);

  // Chat panel content renderer
  const renderChatContent = (isFullScreen: boolean, onDragHandlePointerDown?: (e: React.PointerEvent) => void) => (
    <div className={cn(
      'flex flex-col h-full',
      isFullScreen ? 'pt-14' : ''
    )}>
      {/* Drag handle for swipe down to collapse - only show in expanded mode */}
      {!isFullScreen && chatPanelExpanded && (
        <div 
          className="flex justify-center py-2 cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={onDragHandlePointerDown}
        >
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>
      )}
      {/* Chat header - only show in expanded/full modes */}
      {!isFullScreen && chatPanelExpanded && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <button
            onClick={handleCollapsePanel}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:brightness-125 active:brightness-75"
            aria-label={locale === 'zh-Hans' ? '收起' : 'Collapse'}
          >
            <ChevronDown className="w-4 h-4 text-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">Ask Copilot</span>
            {copilotConnected && (
              <span className="w-2 h-2 bg-green-500 rounded-full" />
            )}

          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleNewConversation}
              disabled={isCreatingConversation}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:brightness-125 active:brightness-75 disabled:opacity-50"
              aria-label={locale === 'zh-Hans' ? '新建会话' : 'New conversation'}
            >
              {isCreatingConversation ? (
                <Loader2 className="w-4 h-4 text-foreground animate-spin" />
              ) : (
                <SquarePen className="w-4 h-4 text-foreground" />
              )}
            </button>
            <button
              onClick={handleFullScreen}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:brightness-125 active:brightness-75"
              aria-label={locale === 'zh-Hans' ? '全屏' : 'Full screen'}
            >
              <Maximize2 className="w-4 h-4 text-foreground" />
            </button>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className={cn(
        'flex-1 overflow-y-auto scrollbar-hide px-3 py-3',
        isFullScreen ? 'pb-20' : ''
      )}>
        {isInitializingCopilot ? (
          <div className="flex flex-col h-full items-center justify-center">
            <Loader2 className="w-6 h-6 text-primary animate-spin mb-3" />
            <p className="text-sm text-muted-foreground">
              {locale === 'zh-Hans' ? '正在连接 Copilot...' : 'Connecting to Copilot...'}
            </p>
          </div>
        ) : isLoadingConversations ? (
          <div className="flex flex-col h-full items-center justify-center">
            <Loader2 className="w-6 h-6 text-primary animate-spin mb-3" />
            <p className="text-sm text-muted-foreground">
              {locale === 'zh-Hans' ? '加载会话记录...' : 'Loading conversation history...'}
            </p>
          </div>
        ) : chatMessages.length === 0 ? (
          <div className="flex flex-col h-full justify-center px-4">
            <p className="text-sm font-medium text-foreground mb-4">
              {locale === 'zh-Hans' ? '我可以帮助您：' : 'I can help you with:'}
            </p>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs text-primary font-medium">1</span>
                </span>
                <span className="text-sm text-muted-foreground">
                  {locale === 'zh-Hans' ? '查询客户信息和商机状态' : 'Query customer info and opportunity status'}
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs text-primary font-medium">2</span>
                </span>
                <span className="text-sm text-muted-foreground">
                  {locale === 'zh-Hans' ? '获取今日日程和待办事项' : 'Get today\'s schedule and to-do items'}
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs text-primary font-medium">3</span>
                </span>
                <span className="text-sm text-muted-foreground">
                  {locale === 'zh-Hans' ? '分析销售趋势和业绩数据' : 'Analyze sales trends and performance data'}
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs text-primary font-medium">4</span>
                </span>
                <span className="text-sm text-muted-foreground">
                  {locale === 'zh-Hans' ? '生成拜访报告和会议纪要' : 'Generate visit reports and meeting notes'}
                </span>
              </li>
            </ul>
            <p className="text-xs text-muted-foreground mt-6 text-center">
              {locale === 'zh-Hans' ? '输入问题或按住麦克风开始对话' : 'Type a question or hold the mic to start'}
            </p>
          </div>
        ) : (
          <>
            {chatMessages.map((message: ChatMessage) => (
              <div key={message.id} className={cn(
                'mb-3',
                message.type === 'user' ? 'flex justify-end' : ''
              )}>
                {/* Stage Card */}
                {message.type === 'stage-card' && message.stageCard && (
                  <StageCard
                    stageCard={message.stageCard}
                    onClick={() => navigate('/opportunity-review', { state: { opportunityId: message.stageCard!.opportunityId } })}
                  />
                )}
                
                {/* Record List Card (query results) */}
                {message.recordList && (
                  <RecordListCard
                    type={message.recordList.type}
                    records={message.recordList.records.map((r) => ({ ...r, type: message.recordList!.type }))}
                    title={message.recordList.title}
                  />
                )}
                
                {/* Form Card (draft Activity/Opportunity/Account) */}
                {message.type === 'form-card' && message.formCard && (
                  <FormCard
                    formCard={message.formCard}
                    messageId={message.id}
                    onStatusChange={(status) => {
                      // Update message status in context
                      copilot.setMessages((prev) => prev.map((m) => {
                        if (m.id !== message.id) return m;
                        return {
                          ...m,
                          formCard: m.formCard ? { ...m.formCard, status } : undefined,
                        };
                      }));
                    }}
                  />
                )}
                
                {/* User Message */}
                {message.type === 'user' && (
                  <div className="max-w-[85%]">
                    {/* Audio playback button if has audio */}
                    {message.audioUrl && (
                      <div className="flex justify-end mb-1">
                        <button
                          onClick={() => {
                            if (playingAudioId === message.id) {
                              audioRef.current?.pause();
                              setPlayingAudioId(null);
                            } else {
                              if (audioRef.current) {
                                audioRef.current.src = message.audioUrl!;
                                audioRef.current.play();
                                setPlayingAudioId(message.id);
                              }
                            }
                          }}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-primary/20 text-primary text-[10px]"
                        >
                          {playingAudioId === message.id ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                          <span>{message.audioDuration ? `${Math.floor(message.audioDuration / 60)}:${String(message.audioDuration % 60).padStart(2, '0')}` : '0:00'}</span>
                        </button>
                      </div>
                    )}
                    <div
                      className={cn('px-3 py-2 rounded-2xl rounded-br-md user-message-bubble', getChatFontClass())}
                    >
                      {message.content}
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-1 text-right">
                      {new Date(message.timestamp).toLocaleTimeString(locale === 'zh-Hans' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                )}
                
                {/* Agent Message */}
                {message.type === 'agent' && (() => {
                  // Thinking state - show progress steps
                  if (message.isThinking && message.thinkingSteps) {
                    return (
                      <div className="flex flex-col gap-1 max-w-[85%]">
                        <div className="px-3 py-2 rounded-2xl rounded-bl-md bg-muted/50 border border-border">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                            <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                            <span>{locale === 'zh-Hans' ? '思考中...' : 'Thinking...'}</span>
                          </div>
                          <div className="space-y-1.5">
                            {message.thinkingSteps.map((step, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs">
                                {step.status === 'completed' ? (
                                  <span className="text-primary">✓</span>
                                ) : step.status === 'active' ? (
                                  <span className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                                ) : (
                                  <span className="text-muted-foreground">○</span>
                                )}
                                <span className={cn(
                                  step.status === 'completed' && 'text-primary',
                                  step.status === 'active' && 'text-foreground font-medium',
                                  step.status === 'pending' && 'text-muted-foreground'
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
                      </div>
                    );
                  }
                  
                  // Completed response
                  const { isJson, isEmpty } = tryParseJson(message.content);
                  return (
                    <div
                      onContextMenu={(e: React.MouseEvent<HTMLDivElement>) => {
                        e.preventDefault();
                        setLongPressMessage(message);
                      }}
                      onTouchStart={() => handleMessageTouchStart(message)}
                      onTouchEnd={handleMessageTouchEnd}
                      onTouchCancel={handleMessageTouchEnd}
                    >
                      {/* Show completed thinking steps in collapsed form */}
                      {message.thinkingSteps && message.thinkingSteps.length > 0 && (
                        <details className="mb-2 text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                            <span>🧠</span>
                            <span>{locale === 'zh-Hans' ? '查看思考过程' : 'View thinking process'}</span>
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
                        /* Empty JSON response - show friendly message */
                        <div className={cn('text-foreground', getChatFontClass())}>
                          <p className="text-sm text-muted-foreground">
                            {locale === 'zh-Hans' 
                              ? '抱歉，未能找到您请求的数据。请尝试换一种方式提问或检查您的查询条件。'
                              : "Sorry, I couldn't find the data you requested. Please try rephrasing your question or check your search criteria."}
                          </p>
                        </div>
                      ) : isJson ? (
                        /* Render JSON data as interactive table */
                        <DynamicDataRenderer content={message.content} />
                      ) : (
                        /* Render as markdown text */
                        <MarkdownRenderer content={message.content} className={cn('text-foreground', getChatFontClass())} />
                      )}
                      
                      {/* Sources */}
                      {message.sources && message.sources.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {message.sources.map((source) => (
                            <button
                              key={source.id}
                              onClick={() => setSelectedSource(source)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-muted border border-border text-[9px] hover:bg-muted/80 transition-colors"
                            >
                              <span className="text-foreground font-medium">{source.label}</span>
                              <span className="text-muted-foreground">· {source.detail}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      
                      <div className="flex items-center gap-1.5 mt-1">
                        {message.agentName && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-medium border bg-primary/20 text-primary border-primary/30">
                            {message.agentName}
                          </span>
                        )}
                        {message.functionDisplayName && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium border bg-accent/50 text-accent-foreground border-accent">
                            <span>🛠️</span>
                            {message.functionDisplayName}
                          </span>
                        )}
                        <span className="text-[9px] text-muted-foreground">
                          {new Date(message.timestamp).toLocaleTimeString(locale === 'zh-Hans' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {/* Copy and Play buttons - only for markdown (non-JSON) */}
                        {!isJson && (
                          <>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(message.content);
                                toast.success(locale === 'zh-Hans' ? '已复制' : 'Copied');
                              }}
                              className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                              aria-label={locale === 'zh-Hans' ? '复制' : 'Copy'}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (playingInlineId === message.id) {
                                  // Stop playing
                                  window.speechSynthesis.cancel();
                                  setPlayingInlineId(null);
                                } else {
                                  // Start playing
                                  let textToSpeak = message.content
                                    .replace(/\*\*([^*]+)\*\*/g, '$1')
                                    .replace(/\*([^*]+)\*/g, '$1')
                                    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
                                    .replace(/#{1,6}\s+/g, '')
                                    .replace(/`[^`]+`/g, '')
                                    .replace(/```[\s\S]*?```/g, '');
                                  
                                  const speakFinalText = (text: string) => {
                                    if ('speechSynthesis' in window && text.trim()) {
                                      window.speechSynthesis.cancel();
                                      const utterance = new SpeechSynthesisUtterance(text);
                                      utterance.lang = locale === 'zh-Hans' ? 'zh-CN' : 'en-US';
                                      const selectedVoiceId = getSelectedVoice();
                                      const matchingVoice = findMatchingSystemVoice(selectedVoiceId, locale);
                                      if (matchingVoice) utterance.voice = matchingVoice;
                                      utterance.rate = 1.0;
                                      utterance.pitch = 1.0;
                                      utterance.onend = () => setPlayingInlineId(null);
                                      utterance.onerror = () => setPlayingInlineId(null);
                                      setPlayingInlineId(message.id);
                                      window.speechSynthesis.speak(utterance);
                                    }
                                  };
                                  
                                  // Check if voice summary is enabled and custom LLM is configured
                                  const llmConfig = getLLMConfig();
                                  const voiceSummaryEnabled = getVoiceSummaryEnabled();
                                  
                                  if (voiceSummaryEnabled && llmConfig && llmConfig.enabled && textToSpeak.trim()) {
                                    setPlayingInlineId(message.id);
                                    generateVoiceSummary(message.content, locale).then((result) => {
                                      if (result.success && result.summary) {
                                        speakFinalText(result.summary);
                                      } else {
                                        speakFinalText(textToSpeak);
                                      }
                                    }).catch(() => {
                                      speakFinalText(textToSpeak);
                                    });
                                  } else if (textToSpeak.trim()) {
                                    speakFinalText(textToSpeak);
                                  }
                                }
                              }}
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                              aria-label={playingInlineId === message.id ? (locale === 'zh-Hans' ? '停止' : 'Stop') : (locale === 'zh-Hans' ? '播放' : 'Play')}
                            >
                              {playingInlineId === message.id ? (
                                <VolumeX className="w-3.5 h-3.5" />
                              ) : (
                                <Volume2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))}
            {/* Thinking dots - only show when isSending AND no thinking message is already displayed */}
            {isSending && !chatMessages.some((m: ChatMessage) => m.isThinking) && (
              <div className="flex justify-start mb-3 pl-1">
                {thinkingDotStyle === 'bounce' && (
                  <div className="flex items-center gap-1">
                    <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0 }} />
                    <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.15 }} />
                    <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.3 }} />
                  </div>
                )}
                {thinkingDotStyle === 'pulse' && (
                  <div className="flex items-center gap-1">
                    <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }} transition={{ duration: 1, repeat: Infinity, delay: 0 }} />
                    <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }} transition={{ duration: 1, repeat: Infinity, delay: 0.2 }} />
                    <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }} transition={{ duration: 1, repeat: Infinity, delay: 0.4 }} />
                  </div>
                )}
                {thinkingDotStyle === 'wave' && (
                  <div className="flex items-center gap-1">
                    <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ y: [0, -4, 0, 4, 0] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0, ease: 'easeInOut' as const }} />
                    <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ y: [0, -4, 0, 4, 0] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.2, ease: 'easeInOut' as const }} />
                    <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ y: [0, -4, 0, 4, 0] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.4, ease: 'easeInOut' as const }} />
                  </div>
                )}
                {thinkingDotStyle === 'fade' && (
                  <div className="flex items-center gap-1">
                    <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0 }} />
                    <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }} />
                    <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.6 }} />
                  </div>
                )}
                {thinkingDotStyle === 'orbit' && (
                  <div className="relative w-5 h-5 flex items-center justify-center">
                    <span className="absolute w-1.5 h-1.5 bg-primary/30 rounded-full" />
                    <motion.span
                      className="absolute w-1.5 h-1.5 bg-primary rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' as const }}
                      style={{ transformOrigin: 'center', x: 6 }}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Action Pills - above input */}
      <div className="px-3 pb-2 pt-1 border-t border-border/20">
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action: { text: string; query: string }, idx: number) => (
            <button
              key={idx}
              onClick={() => sendMessage(action.query)}
              disabled={isSending}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium',
                'bg-muted/50 hover:bg-muted text-foreground',
                'border border-border/50 hover:border-border',
                'transition-all active:scale-95',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {action.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col overflow-hidden bg-scm-gradient">

      {/* Offline Banner */}
      <AnimatePresence>
        {isOffline && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-amber-500/90 text-amber-950 px-4 py-2 flex items-center justify-center gap-2 text-helper font-medium safe-area-top"
          >
            <WifiOff className="w-4 h-4" />
            <span>{t('offline', locale)}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main
        ref={mainContentRef}
        className={cn(
          'flex-1 pt-safe px-4 overflow-y-auto scrollbar-hide transition-all duration-300',
          chatPanelExpanded ? 'pb-[55vh]' : 'pb-44'
        )}
        onTouchStart={(e: React.TouchEvent) => {
          if (mainContentRef.current && mainContentRef.current.scrollTop <= 0) {
            pullStartYRef.current = e.touches[0].clientY;
          }
        }}
        onTouchMove={(e: React.TouchEvent) => {
          if (pullStartYRef.current === null || isPullRefreshing) return;
          if (mainContentRef.current && mainContentRef.current.scrollTop > 0) {
            pullStartYRef.current = null;
            setPullDistance(0);
            return;
          }
          const currentY = e.touches[0].clientY;
          const diff = currentY - pullStartYRef.current;
          if (diff > 0) {
            // Resistance factor for natural feel
            setPullDistance(Math.min(diff * 0.5, 100));
          }
        }}
        onTouchEnd={async () => {
          if (pullDistance >= 60 && !isPullRefreshing) {
            setIsPullRefreshing(true);
            setPullDistance(60);
            try {
              await Promise.all([
                refetchActivities(),
                refetchOpportunities(),
                refetchAccounts(),
                refetchBusinessInsights()
              ]);
              toast.success(locale === 'zh-Hans' ? '已刷新' : 'Refreshed');
            } catch (err) {
              console.error('Refresh failed:', err);
            } finally {
              setIsPullRefreshing(false);
              setPullDistance(0);
            }
          } else {
            setPullDistance(0);
          }
          pullStartYRef.current = null;
        }}
      >
        {/* Pull-to-refresh indicator */}
        {(pullDistance > 0 || isPullRefreshing) && (
          <div
            className={cn(
              'flex justify-center items-center transition-all duration-200',
              isPullRefreshing ? 'h-[60px] mb-2' : pullDistance >= 60 ? 'h-[60px]' : pullDistance >= 40 ? 'h-10' : pullDistance >= 20 ? 'h-5' : 'h-0'
            )}
          >
            {isPullRefreshing ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
                <span className="text-sm text-muted-foreground">
                  {locale === 'zh-Hans' ? '刷新中...' : 'Refreshing...'}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <ArrowUp
                  className={cn(
                    'w-5 h-5 text-primary transition-transform duration-200',
                    pullDistance >= 60 ? 'rotate-180' : ''
                  )}
                />
                <span className="text-xs text-muted-foreground">
                  {pullDistance >= 60
                    ? (locale === 'zh-Hans' ? '松开刷新' : 'Release to refresh')
                    : (locale === 'zh-Hans' ? '下拉刷新' : 'Pull to refresh')}
                </span>
              </div>
            )}
          </div>
        )}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="space-y-5 py-2 pt-6"
        >
          {/* Greeting Header */}
          <motion.div variants={itemVariants} className="flex items-center justify-between">
            <HomeHeaderWidgetDisplay locale={locale} widget={homeHeaderWidget} kpiData={kpiData} />
            {/* Notification & Settings Icons */}
            <div className="flex items-center gap-1">
              {/* Product Manual Icon */}
              <button
                onClick={() => navigate('/products')}
                className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted/50 active:bg-muted transition-colors"
                aria-label={locale === 'zh-Hans' ? '产品手册' : 'Product Manual'}
              >
                <BookOpen className="w-5 h-5 text-foreground" />
              </button>
              {/* Notification Icon -- now opens the unified insights sheet.
                  Badge shows the total count of active business insights. */}
              <div className="relative inline-flex">
                <button
                  onClick={() => setInsightsSheetOpen(true)}
                  className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted/50 active:bg-muted transition-colors relative"
                  aria-label={locale === 'zh-Hans' ? '洞察' : 'Insights'}
                >
                  <Bell className="w-5 h-5 text-foreground" />
                  {businessInsights.length > 0 && (
                    <span
                      className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold border-2 border-background"
                    >
                      {businessInsights.length > 99 ? '99+' : businessInsights.length}
                    </span>
                  )}
                </button>
              </div>
              {/* Settings with Connection Status */}
              <button
                onClick={() => {
                  // On tablet/desktop, open sheet overlay; on mobile, navigate
                  if (window.innerWidth >= 768) {
                    setSettingsOpen(true);
                  } else {
                    navigate('/settings');
                  }
                }}
                className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted/50 active:bg-muted transition-colors relative"
                aria-label="Settings"
              >
                <Settings className="w-5 h-5 text-foreground" />
                {/* Connection Status Indicator - only show when NOT connected */}
                {!isCopilotConfigured && (
                  <span 
                    className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-muted-foreground/50 rounded-full border-2 border-background"
                    title={locale === 'zh-Hans' ? '未配置' : 'Not configured'}
                  />
                )}
              </button>
            </div>
          </motion.div>


          {/* KPI Cards - New comprehensive design */}
          <motion.div variants={itemVariants}>
            <KPICards
              data={kpiData}
              onNavigate={navigate}
              onMarkDone={handleMarkOverdueDone}
              onReschedule={handleRescheduleOverdue}
              activityInsights={businessInsights}
              allActivities={activities}
              insightsSheetOpen={insightsSheetOpen}
              onInsightsSheetOpenChange={setInsightsSheetOpen}
              onCalendarDayClick={(date: Date) => {
                // Navigate to activities page with day view and selected date
                // Use local date components to avoid timezone offset issues with toISOString()
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const dateStr = `${year}-${month}-${day}`;
                navigate(`/activities?view=day&date=${dateStr}`);
              }}
            />
          </motion.div>

          {/* Daily Briefing carousel removed: all insights are now consolidated
              into the bell-triggered Insights sheet inside KPICards. */}


        </motion.div>
      </main>



      {/* Expandable Chat Panel */}
      <AnimatePresence>
        {isCopilotConfigured && chatPanelExpanded && !chatPanelFullScreen && (
          <motion.div
            ref={chatPanelRef}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.3, bottom: 0.5 }}
            onDragEnd={(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
              // If dragged up more than 80px or with velocity > 500, expand to full screen
              if (info.offset.y < -80 || info.velocity.y < -500) {
                setChatPanelFullScreen(true);
              }
              // If dragged down more than 80px or with velocity > 500, collapse
              else if (info.offset.y > 80 || info.velocity.y > 500) {
                setChatPanelExpanded(false);
              }
            }}
            initial={{ height: 0, y: 0 }}
            animate={{ height: '50vh', y: 0 }}
            exit={{ height: 0, y: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="fixed bottom-[88px] left-0 right-0 z-40 bg-background/98 backdrop-blur-xl overflow-hidden"
            style={{ 
              borderTopLeftRadius: 20, 
              borderTopRightRadius: 20,
              boxShadow: '0 -8px 32px -4px rgba(0, 0, 0, 0.15), 0 -4px 16px -4px rgba(0, 0, 0, 0.1)'
            }}
          >
            {renderChatContent(false, (e: React.PointerEvent) => dragControls.start(e))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Brief Me is now non-blocking - audio plays in background while user can interact with page */}

      {/* Fixed Bottom Area - Quick Actions + Voice Mic */}
      <div className={cn(
        'fixed left-0 right-0 z-40 safe-area-bottom pointer-events-none bg-scm-fade-up',
        isCopilotConfigured ? 'bottom-20' : 'bottom-0'
      )}>
        <div className="flex flex-col items-center px-4 pb-4 pointer-events-auto">
          {/* Quick Action Buttons - Hide when chat expanded or brief me expanded */}
          <AnimatePresence mode="wait">
            {!chatPanelExpanded && !briefMeExpanded && (
              <motion.div
                key="quick-actions"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25, ease: 'easeOut' as const }}
                className="flex items-center justify-center gap-2"
              >
                <button
                  onClick={handleNewVisit}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5',
                    'rounded-full glass-card-hover',
                    'text-xs font-medium text-foreground',
                    'active:scale-95 transition-transform'
                  )}
                >
                  <Plus className="w-4 h-4 text-primary" />
                  <span>{t('newVisit', locale)}</span>
                </button>

                <button
                  onClick={handleViewOpportunities}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5',
                    'rounded-full glass-card-hover',
                    'text-xs font-medium text-foreground',
                    'active:scale-95 transition-transform'
                  )}
                >
                  <Eye className="w-4 h-4 text-primary" />
                  <span>{t('viewOpportunities', locale)}</span>
                </button>

                <button
                  onClick={handleBriefMe}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5',
                    'rounded-full glass-card-hover',
                    'text-xs font-medium text-foreground',
                    'active:scale-95 transition-transform'
                  )}
                >
                  <Radio className="w-4 h-4 text-primary" />
                  <span>{t('briefMe', locale)}</span>
                </button>
              </motion.div>
            )}

            {/* Brief Me Audio Player - replaces quick actions */}
            {!chatPanelExpanded && briefMeExpanded && (
              <motion.div
                key="brief-me-player"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] as const }}
                className="flex items-center justify-center mb-4"
              >
                <div
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5',
                    'rounded-full glass-card',
                    'border border-primary/30 bg-primary/5'
                  )}
                >
                  {/* Speed button */}
                  <button
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      handleBriefMeSpeedToggle();
                    }}
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-muted/50 hover:bg-muted text-xs font-semibold text-foreground transition-colors"
                    title={locale === 'zh-Hans' ? '\u64ad\u653e\u901f\u5ea6' : 'Playback speed'}
                  >
                    {briefMeSpeed}x
                  </button>
                  
                  {/* Prev button */}
                  <button
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      handleBriefMePrev();
                    }}
                    disabled={briefMeCurrentIndex === 0}
                    className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                    aria-label={locale === 'zh-Hans' ? '上一条' : 'Previous'}
                    title={locale === 'zh-Hans' ? '上一条' : 'Previous'}
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>
                  
                  {/* Play/Pause button */}
                  <button
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      if (briefMeIsPlaying) {
                        handleBriefMePause();
                      } else {
                        if (window.speechSynthesis.paused) {
                          handleBriefMeResume();
                        } else {
                          handleBriefMePlay();
                        }
                      }
                    }}
                    className="w-12 h-12 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    aria-label={briefMeIsPlaying ? (locale === 'zh-Hans' ? '暂停' : 'Pause') : (locale === 'zh-Hans' ? '播放' : 'Play')}
                    title={briefMeIsPlaying ? (locale === 'zh-Hans' ? '暂停' : 'Pause') : (locale === 'zh-Hans' ? '播放' : 'Play')}
                  >
                    {briefMeIsPlaying ? (
                      <Pause className="w-5 h-5" />
                    ) : (
                      <Play className="w-5 h-5 ml-0.5" />
                    )}
                  </button>
                  
                  {/* Next button */}
                  <button
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      handleBriefMeNext();
                    }}
                    disabled={briefMeCurrentIndex >= briefMeInsightTexts.length - 1}
                    className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                    aria-label={locale === 'zh-Hans' ? '下一条' : 'Next'}
                    title={locale === 'zh-Hans' ? '下一条' : 'Next'}
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                  
                  {/* Time display */}
                  <div className="flex items-center gap-1 text-xs font-mono text-muted-foreground min-w-[70px] justify-center">
                    <span>{formatBriefMeTime(briefMeCurrentTime)}</span>
                    <span>/</span>
                    <span>{formatBriefMeTime(briefMeTotalTime)}</span>
                  </div>
                  
                  {/* Close button */}
                  <button
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      handleBriefMeClose();
                    }}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={locale === 'zh-Hans' ? '关闭' : 'Close'}
                    title={locale === 'zh-Hans' ? '关闭' : 'Close'}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>


          {/* Collapse button when expanded */}

        </div>
      </div>

      {/* Full Screen Chat Panel */}
      <AnimatePresence>
        {isCopilotConfigured && chatPanelFullScreen && (
          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="fixed inset-0 z-[100] bg-background"
          >
            {/* Full screen header */}
            <header className="fixed top-0 left-0 right-0 z-40 glass-surface border-b border-border/50 safe-area-top">
              <div className="flex items-center justify-between h-14 px-4">
                <button
                  onClick={handleCloseFullScreen}
                  className="w-10 h-10 flex items-center justify-center transition-all hover:brightness-125 active:brightness-75"
                  aria-label={locale === 'zh-Hans' ? '关闭' : 'Close'}
                >
                  <X className="w-5 h-5 text-foreground" />
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-title text-foreground">Ask Copilot</span>
                  {copilotConnected && (
                    <span className="w-2 h-2 bg-green-500 rounded-full" />
                  )}
                </div>
                <button
                  onClick={handleNewConversation}
                  disabled={isCreatingConversation}
                  className="w-10 h-10 flex items-center justify-center transition-all hover:brightness-125 active:brightness-75 disabled:opacity-50"
                  aria-label={locale === 'zh-Hans' ? '新建会话' : 'New conversation'}
                >
                  {isCreatingConversation ? (
                    <Loader2 className="w-5 h-5 text-foreground animate-spin" />
                  ) : (
                    <SquarePen className="w-5 h-5 text-foreground" />
                  )}
                </button>
              </div>
            </header>

            {/* Full screen chat content */}
            {renderChatContent(true)}

            {/* Full screen input bar */}
            <div className="fixed bottom-0 left-0 right-0 z-40 glass-surface border-t border-border/50 safe-area-bottom">
              <div className="flex items-center h-14 px-3">
                <div className="relative flex-1">
                  {/* Mic Button */}
                  <motion.button
                    onPointerDown={handleMicPointerDown}
                    onPointerUp={handleMicPointerUp}
                    onPointerLeave={handleMicPointerUp}
                    whileTap={{ scale: 0.95 }}
                    disabled={isOffline || isSending}
                    className={cn(
                      'absolute left-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center transition-all touch-none',
                      isOffline || isSending ? 'opacity-50 cursor-not-allowed' :
                      isRecording ? 'text-primary' : 'text-muted-foreground hover:brightness-150'
                    )}
                    style={{ touchAction: 'none' }}
                  >
                    <Mic className={cn('w-5 h-5', isRecording && 'animate-pulse')} />
                  </motion.button>
                  
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === 'Enter' && inputValue.trim() && !isSending) {
                        sendMessage(inputValue);
                      }
                    }}
                    placeholder={locale === 'zh-Hans' ? '输入消息...' : 'Type a message...'}
                    disabled={isOffline || isSending}
                    className={cn(
                      'w-full h-10 pl-10 pr-10 rounded-full text-body',
                      'bg-muted border border-border',
                      'text-foreground placeholder:text-muted-foreground',
                      'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50',
                      'disabled:opacity-50'
                    )}
                  />
                  
                  {/* Send Button */}
                  {isSending ? (
                    <motion.button
                      onClick={() => setIsSending(false)}
                      whileTap={{ scale: 0.95 }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-red-500 transition-all hover:brightness-125"
                    >
                      <Square className="w-4 h-4 fill-current" />
                    </motion.button>
                  ) : (
                    <motion.button
                      onClick={() => inputValue.trim() && sendMessage(inputValue)}
                      whileTap={{ scale: 0.95 }}
                      disabled={!inputValue.trim() || isOffline}
                      className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center transition-all hover:brightness-150"
                    >
                      <ArrowUp className={cn('w-5 h-5', inputValue.trim() && !isOffline ? 'text-primary' : 'text-muted-foreground')} />
                    </motion.button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Long Press Menu */}
      <Sheet open={!!longPressMessage} onOpenChange={() => setLongPressMessage(null)}>
        <SheetContent side="bottom" className="bg-card border-t border-border rounded-t-3xl">
          <SheetHeader className="sr-only">
            <SheetTitle>{locale === 'zh-Hans' ? '消息操作' : 'Message Actions'}</SheetTitle>
          </SheetHeader>
          <div className="py-2 space-y-1">
            <button
              onClick={() => handleLongPressAction('copy')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted transition-colors"
            >
              <Copy className="w-5 h-5 text-foreground" />
              <span className="text-body text-foreground">{locale === 'zh-Hans' ? '复制' : 'Copy'}</span>
            </button>
            <button
              onClick={() => handleLongPressAction('playVoice')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted transition-colors"
            >
              <Play className="w-5 h-5 text-foreground" />
              <span className="text-body text-foreground">{locale === 'zh-Hans' ? '播放语音' : 'Play Voice'}</span>
            </button>
            <button
              onClick={() => handleLongPressAction('forward')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted transition-colors"
            >
              <Forward className="w-5 h-5 text-foreground" />
              <span className="text-body text-foreground">{locale === 'zh-Hans' ? '转发到 Teams' : 'Forward to Teams'}</span>
            </button>
            <button
              onClick={() => handleLongPressAction('feedback')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted transition-colors"
            >
              <ThumbsDown className="w-5 h-5 text-foreground" />
              <span className="text-body text-foreground">{locale === 'zh-Hans' ? '反馈不准' : 'Report inaccurate'}</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Source Detail Sheet */}
      <Sheet open={!!selectedSource} onOpenChange={() => setSelectedSource(null)}>
        <SheetContent side="bottom" className="bg-card border-t border-border rounded-t-3xl">
          <SheetHeader className="pb-3 border-b border-border">
            <SheetTitle className="text-foreground">
              {selectedSource?.label || (locale === 'zh-Hans' ? '来源详情' : 'Source Details')}
            </SheetTitle>
          </SheetHeader>
          <div className="py-4">
            {selectedSource?.type === 'account' && sourceData && 'name1' in sourceData && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">{locale === 'zh-Hans' ? '客户名称' : 'Account Name'}</p>
                  <p className="text-sm text-foreground font-medium">{(sourceData as Account).name1}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{locale === 'zh-Hans' ? '地址' : 'Address'}</p>
                  <p className="text-sm text-foreground">{(sourceData as Account).address || '-'}</p>
                </div>
                <button
                  onClick={() => {
                    setSelectedSource(null);
                    navigate(`/accounts/${selectedSource.id}`);
                  }}
                  className="w-full mt-2 py-2 px-4 rounded-xl bg-primary text-white text-sm font-medium"
                >
                  {locale === 'zh-Hans' ? '查看详情' : 'View Details'}
                </button>
              </div>
            )}
            {selectedSource?.type === 'opportunity' && sourceData && 'name1' in sourceData && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">{locale === 'zh-Hans' ? '商机名称' : 'Opportunity Name'}</p>
                  <p className="text-sm text-foreground font-medium">{(sourceData as Opportunity).name1}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{locale === 'zh-Hans' ? '总金额' : 'Total Amount'}</p>
                  <p className="text-sm text-foreground">${((sourceData as Opportunity).totalamount || 0).toLocaleString()}</p>
                </div>
                <button
                  onClick={() => {
                    setSelectedSource(null);
                    navigate('/opportunity-review', { state: { opportunityId: selectedSource.id } });
                  }}
                  className="w-full mt-2 py-2 px-4 rounded-xl bg-primary text-white text-sm font-medium"
                >
                  {locale === 'zh-Hans' ? '查看详情' : 'View Details'}
                </button>
              </div>
            )}
            {selectedSource?.type === 'activity' && sourceData && 'title' in sourceData && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">{locale === 'zh-Hans' ? '活动主题' : 'Activity Subject'}</p>
                  <p className="text-sm text-foreground font-medium">{(sourceData as Activity).title}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{locale === 'zh-Hans' ? '活动日期' : 'Date'}</p>
                  <p className="text-sm text-foreground">{(sourceData as Activity).scheduleddate ? new Date((sourceData as Activity).scheduleddate as string).toLocaleDateString() : '-'}</p>
                </div>
                <button
                  onClick={() => {
                    setSelectedSource(null);
                    const activityData = sourceData as Activity;
                    navigate(`/activity/${activityData.account?.id || activityData.id}`);
                  }}
                  className="w-full mt-2 py-2 px-4 rounded-xl bg-primary text-white text-sm font-medium"
                >
                  {locale === 'zh-Hans' ? '查看详情' : 'View Details'}
                </button>
              </div>
            )}
            {/* Fallback when sourceData is not found */}
            {selectedSource && !sourceData && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {locale === 'zh-Hans' 
                    ? `无法在本地加载 ${selectedSource.type} 类型的记录。该记录可能已被删除或ID类型不匹配。`
                    : `Unable to load ${selectedSource.type} record locally. The record may have been deleted or the ID type is mismatched.`}
                </p>
                <p className="text-xs text-muted-foreground font-mono bg-muted/50 p-2 rounded">
                  ID: {selectedSource.id}
                </p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Hidden Audio Element for voice playback */}
      <audio
        ref={audioRef}
        onEnded={() => setPlayingAudioId(null)}
        className="hidden"
      />


      {/* Notification Overlay */}
      <AnimatePresence>
        {notificationOpen && (
          <>
            {/* Dark backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-[60]"
              onClick={() => setNotificationOpen(false)}
            />
            {/* Notification Panel */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2, ease: 'easeOut' as const }}
              className="fixed top-16 left-4 right-4 z-[60] bg-background border border-border rounded-2xl shadow-2xl overflow-hidden max-h-[70vh] safe-area-top"
            >
              <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card">
                <h3 className="text-base font-semibold text-foreground">
                  {locale === 'zh-Hans' ? '通知' : 'Notifications'}
                </h3>
                <div className="flex items-center gap-3">
                  <span
                    onClick={() => toast.success(locale === 'zh-Hans' ? '已全部标为已读' : 'All marked as read')}
                    className="text-xs text-primary font-medium cursor-pointer hover:underline"
                  >
                    {locale === 'zh-Hans' ? '全部标为已读' : 'Mark all as read'}
                  </span>
                  <button
                    onClick={() => setNotificationOpen(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
                    aria-label={locale === 'zh-Hans' ? '关闭通知' : 'Close notifications'}
                    title={locale === 'zh-Hans' ? '关闭通知' : 'Close notifications'}
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto max-h-[50vh]">
                {/* Sample notifications */}
                <div className="px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer border-l-4 border-green-500 bg-green-500/5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-5 h-5 text-green-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground font-medium">
                        {locale === 'zh-Hans' ? '商机更新' : 'Opportunity Update'}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {locale === 'zh-Hans' ? '"华为云服务" 商机阶段已更新为"提案"' : '"Huawei Cloud Service" opportunity stage updated to "Propose"'}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1.5">
                        {locale === 'zh-Hans' ? '10分钟前' : '10 minutes ago'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer border-l-4 border-blue-500 bg-blue-500/5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                      <Eye className="w-5 h-5 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground font-medium">
                        {locale === 'zh-Hans' ? '拜访提醒' : 'Visit Reminder'}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {locale === 'zh-Hans' ? '下午2点与"腾讯科技"的拜访即将开始' : 'Your 2 PM visit with "Tencent Tech" is starting soon'}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1.5">
                        {locale === 'zh-Hans' ? '30分钟前' : '30 minutes ago'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer border-l-4 border-orange-500 bg-orange-500/5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                      <Radio className="w-5 h-5 text-orange-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground font-medium">
                        {locale === 'zh-Hans' ? '日报生成完成' : 'Daily Report Ready'}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {locale === 'zh-Hans' ? '您的每日销售简报已生成，点击查看' : 'Your daily sales brief is ready. Tap to view'}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1.5">
                        {locale === 'zh-Hans' ? '2小时前' : '2 hours ago'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <Bell className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground font-medium">
                        {locale === 'zh-Hans' ? '系统通知' : 'System Notice'}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {locale === 'zh-Hans' ? '您的月度报告已准备就绪' : 'Your monthly report is ready for review'}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1.5">
                        {locale === 'zh-Hans' ? '昨天' : 'Yesterday'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-4 py-3 border-t border-border bg-card">
                <button
                  onClick={() => {
                    setNotificationOpen(false);
                    toast.info(locale === 'zh-Hans' ? '通知中心即将推出' : 'Notification center coming soon');
                  }}
                  className="w-full text-center text-sm text-primary font-medium hover:underline"
                >
                  {locale === 'zh-Hans' ? '查看全部通知' : 'View all notifications'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {/* Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.nav
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed top-0 left-0 bottom-0 w-72 bg-card border-r border-border/30 z-50 safe-area-top safe-area-bottom"
            >
              <div className="p-4 pt-6">
                <div className="flex items-center gap-3 mb-8">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold text-white bg-avatar-brand"
                  >
                    {getInitial(user?.fullName)}
                  </div>
                  <div>
                    <p className="text-title text-foreground">{user?.fullName || 'Sales User'}</p>
                    <p className="text-helper text-muted-foreground">{user?.userPrincipalName || ''}</p>
                  </div>
                </div>

                <div className="space-y-1">
                  {[
                    { label: t('home', locale), path: '/home', active: true },
                    { label: t('accounts', locale), path: '/accounts' },
                    { label: t('opportunities', locale), path: '/opportunities' },
                    { label: t('activities', locale), path: '/activities' },
                    { label: t('contacts', locale), path: '/contacts' },
                    { label: t('settings', locale), path: '/settings' },
                  ].map((item: { label: string; path: string; active?: boolean }) => (
                    <button
                      key={item.path}
                      onClick={() => {
                        setSidebarOpen(false);
                        navigate(item.path);
                      }}
                      className={cn(
                        'w-full text-left px-4 py-3 rounded-xl text-body transition-colors',
                        item.active
                          ? 'bg-primary/20 text-primary font-medium'
                          : 'text-foreground hover:bg-white/5'
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
      
      {/* Settings Panel Sheet (tablet/desktop) */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="w-[420px] max-w-[90vw] p-0 overflow-hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>{locale === 'zh-Hans' ? '设置' : 'Settings'}</SheetTitle>
          </SheetHeader>
          <SettingsPanel onClose={() => setSettingsOpen(false)} isOverlay={true} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
