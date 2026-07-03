import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence, useDragControls, type PanInfo } from 'motion/react';
import { Settings, Sparkles, Eye, Radio, Mic, WifiOff, ArrowUp, SquarePen, Maximize2, X, Square, Copy, Forward, ThumbsDown, ChevronRight, ChevronDown, Play, Pause, Loader2, Volume2, VolumeX, Bell, RefreshCw, SkipForward, SkipBack, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';
import { useActivityList, useUpdateActivity } from '@/generated/hooks/use-activity';
import { useOpportunityList } from '@/generated/hooks/use-opportunity';
import { useAccountList } from '@/generated/hooks/use-account';

import { useUpdateCopilotConversation, useCreateCopilotConversation } from '@/generated/hooks/use-copilot-conversation';
import { useCreateBusinessInsight, useBusinessInsightList, useDeleteBusinessInsight } from '@/generated/hooks/use-business-insight';
import { useLocale } from '@/lib/i18n';
import { t, getGreeting, getChatFontClass, getThinkingDotStyle, getAutoPlayAgentResponse, getSelectedVoice, findMatchingSystemVoice, getVoiceSummaryEnabled, generateVoiceSummary, getAgentFramework, getHomeHeaderWidget, speechLang, localeBcp47, type Locale, type ThinkingDotStyle, type HomeHeaderWidget } from '@/lib/i18n';
import { splitIntoSegments } from '@/lib/speech';
import { useSpeechPlayer, type SpeechTrack } from '@/hooks/use-speech-player';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { formatCurrencyCompact, formatCurrencyFull } from '@/lib/format-currency';

import { SettingsPanel } from '@/components/settings-panel';
import type { Activity } from '@/generated/models/activity-model';import type { Opportunity } from '@/generated/models/opportunity-model';import type { Account } from '@/generated/models/account-model';import { useCopilotConfigured } from '@/hooks/use-copilot-configured';
import { useFirstMount } from '@/hooks/use-first-mount';
import { maybeStartOnboarding } from '@/lib/onboarding';
import { DynamicDataRenderer, tryParseJson } from '@/components/dynamic-data-renderer';
import { FormCard } from '@/components/form-card';
import { RecordListCard } from '@/components/record-list-card';
// InsightCarousel removed from home page (insights are now shown inside the
// bell-triggered Insights sheet). Keep the path available via brief-me page.
import { KPICards, type KPIData, type AgendaItem, type AtRiskClient } from '@/components/kpi-card';
import { MarkdownContent } from '@/components/markdown-content';
import type { BusinessInsight } from '@/generated/models/business-insight-model';import { useCopilot, type ChatMessage } from '@/contexts/copilot-context';
import { useCopilotSideDocked } from '@/components/global-copilot';
import {
  clearCopilotConversationLogId,
  getCopilotConversationLogBounds,
  readCopilotConversationLogId,
  toCopilotConversationLogMessages,
  writeCopilotConversationLogId,
} from '@/lib/copilot-conversation-log';

// Stable empty-array references for react-query list defaults. Using an inline
// `= []` default creates a NEW array on every render while `data` is undefined
// (during load/refetch), which would change the identity of `kpiData`/`kpiSummary`
// every render and drive the page-context effect into an infinite re-render loop.
const EMPTY_ACTIVITIES: Activity[] = [];
const EMPTY_OPPORTUNITIES: Opportunity[] = [];
const EMPTY_ACCOUNTS: Account[] = [];

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
    return date.toLocaleTimeString(localeBcp47(locale), {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: locale !== 'zh-Hans',
    });
  };

  return (
    <div>
      <p className="text-xs text-muted-foreground leading-none">{formatDate(currentTime)}</p>
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
    return date.toLocaleTimeString(localeBcp47(locale), {
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
          <p className="text-xs text-muted-foreground leading-none">{formatDate(currentTime)}</p>
          <p className="text-2xl font-bold text-foreground leading-tight mt-0.5 tabular-nums">{formatTime(currentTime)}</p>
        </div>
      );
    case 'performance':
      return (
        <div>
          <p className="text-sm text-muted-foreground leading-none">{t('myPerformance', locale)}</p>
          <p className="text-2xl font-bold text-foreground leading-tight mt-0.5 tabular-nums">{performancePercent}%</p>
        </div>
      );
    case 'task-completion':
      return (
        <div>
          <p className="text-sm text-muted-foreground leading-none">{t('todayTaskCompletion', locale)}</p>
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
          <p className="text-sm text-muted-foreground leading-none">{t('quarterlyGoalProgress', locale)}</p>
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
function isClosedStage(stage: string): boolean {
  const label = stage;
  return label === 'won' || label === 'lost';
}

function isWonStage(stage: string): boolean {
  return stage === 'won';
}

// Uses shared MarkdownContent component from @/components/markdown-content

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


export default function HomeDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isOffline] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Use shared copilot context instead of local state
  
  // Chat panel state - UI only, messages come from context

  const [selectedSource, setSelectedSource] = useState<{ type: string; id: string; label: string } | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [playingInlineId, setPlayingInlineId] = useState<string | null>(null);
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

  // First-launch onboarding tour (runs once; re-runnable from Settings/Help).
  useEffect(() => {
    maybeStartOnboarding();
  }, []);

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
  const [briefMeCurrentSegmentIndex, setBriefMeCurrentSegmentIndex] = useState(0);
  const [briefMeSegmentCount, setBriefMeSegmentCount] = useState(0);
  const [briefMeCurrentSegmentLabel, setBriefMeCurrentSegmentLabel] = useState('');
  const briefMeStartTimeRef = useRef<number>(0);
  const briefMeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Mirror the speed in a ref so the shared player always reads the latest rate
  // (a speed toggle takes effect immediately, even mid-async-playback start).
  const briefMeSpeedRef = useRef(briefMeSpeed);
  briefMeSpeedRef.current = briefMeSpeed;
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Auto-play: track the message count at mount time so we only speak
  // messages that arrive AFTER the panel opened. Existing messages are ignored.
  const initialMessageCountRef = useRef<number | null>(null);
  const lastAutoPlayedIdRef = useRef<string | null>(null);
  
  // Track the last log snapshot we wrote so background saves stay deduplicated.
  const lastSavedRef = useRef<string>('');
  const lastQueuedLogRef = useRef<string>('');
  const creatingConversationRef = useRef(false);

  // User data
  const { data: user } = useUser();
  const locale: Locale = useLocale();
  
  // Check if copilot is configured (either Copilot Studio or BYOM) — reactive to async settings hydration
  const isCopilotConfigured = useCopilotConfigured();
  const firstMount = useFirstMount('home');

  const thinkingDotStyle: ThinkingDotStyle = getThinkingDotStyle();

  // Shared copilot context - use context's messages and sendMessage
  const copilot = useCopilot();
  const isInitializingCopilot = copilot.isConnecting;
  const { docked: isSideDocked } = useCopilotSideDocked();
  
  // Derive chat state from context for unified experience across all pages
  const chatMessages = copilot.messages;
  const inputValue = copilot.inputValue;
  const setInputValue = copilot.setInputValue;
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(() => readCopilotConversationLogId());

  // Data queries — each loads independently, page renders immediately with loading states
  const { data: activities = EMPTY_ACTIVITIES, refetch: refetchActivities, isLoading: isLoadingActivities } = useActivityList();
  const { data: opportunities = EMPTY_OPPORTUNITIES, refetch: refetchOpportunities, isLoading: isLoadingOpportunities } = useOpportunityList();
  const { data: accounts = EMPTY_ACCOUNTS, refetch: refetchAccounts, isLoading: isLoadingAccounts } = useAccountList();
  const isDataLoading = isLoadingActivities || isLoadingOpportunities || isLoadingAccounts;

  // Prefetch all detail page chunks once home data starts loading — the user
  // will likely navigate to one of these from the agenda or copilot results.
  useEffect(() => {
    if (!isDataLoading) {
      import('@/lib/prefetch').then(({ prefetchForEntityTypes }) =>
        prefetchForEntityTypes(['activity', 'account', 'opportunity', 'contact'])
      );
    }
  }, [isDataLoading]);

  const updateConversation = useUpdateCopilotConversation();
  const createConversation = useCreateCopilotConversation();
  const { data: businessInsights = [], refetch: refetchBusinessInsights, isLoading: isLoadingBusinessInsights } = useBusinessInsightList({ filter: 'isactive eq true', orderBy: ['displayorder asc'] });
  const createBusinessInsight = useCreateBusinessInsight();
  const deleteBusinessInsight = useDeleteBusinessInsight();
  const updateActivity = useUpdateActivity();

  // Read/unread tracking for insights so the bell badge reflects what the user
  // has actually seen or heard. Read state is persisted by insight id; because
  // regenerating insights mints new ids, fresh insights naturally become unread.
  const [readInsightIds, setReadInsightIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('sales-copilot-read-insights');
      return new Set<string>(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set<string>();
    }
  });
  const markInsightRead = useCallback((id: string) => {
    if (!id) return;
    setReadInsightIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem('sales-copilot-read-insights', JSON.stringify([...next]));
      } catch {
        // ignore storage failures
      }
      return next;
    });
  }, []);

  // Current sales rep (Dataverse systemuserid, lowercased). Used to STAMP
  // ownership on records this user creates and to scope destructive deletes to
  // their own rows. It is NOT used to filter reads: Dataverse already trims
  // retrieveMultiple to the records this user can read (owner / owner team /
  // access team / business-unit depth) based on their security role, so any
  // client-side owner filter would be both useless for security and wrong
  // (it would hide team/shared records the user is legitimately allowed to see).
  const userId = user?.objectId?.toLowerCase();

  const unreadInsightCount = businessInsights.filter((i: { id: string }) => !readInsightIds.has(i.id)).length;


  // Activity-related filtering removed: the unified Insights sheet now shows
  // all business insights regardless of reference type.

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

    // Active opportunities (not won/lost). Reads are already security-trimmed by
    // Dataverse to what this user can access — no client-side owner filter.
    const activeOpps = opportunities.filter(
      (o: Opportunity) => !isClosedStage(o.stage)
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

    // Client coverage - contacted within last 7 days.
    // `account.lastcontactedon` is not reliably maintained when activities are
    // created/completed, so derive the effective last-contact date per account
    // from the activity log (max scheduleddate among activities tied to that
    // account) and merge with `lastcontactedon` as a fallback.
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const lastActivityByAccount = new Map<string, Date>();
    for (const a of activities) {
      const accId = a.account?.id;
      if (!accId || !a.scheduleddate) continue;
      const d = new Date(a.scheduleddate);
      if (Number.isNaN(d.getTime())) continue;
      const prev = lastActivityByAccount.get(accId);
      if (!prev || d > prev) lastActivityByAccount.set(accId, d);
    }
    const effectiveLastContact = (a: Account): Date | null => {
      const fromActivity = a.id ? lastActivityByAccount.get(a.id) : undefined;
      return fromActivity || null;
    };

    const clientsTouchedThisWeek = accounts.filter((a: Account) => {
      const lastContact = effectiveLastContact(a);
      return lastContact && lastContact >= sevenDaysAgo;
    }).length;

    // Clients at risk - not contacted in 14+ days
    const clientsAtRiskFiltered = accounts.filter((a: Account) => {
      const lastContact = effectiveLastContact(a);
      return !lastContact || lastContact < fourteenDaysAgo;
    });
    const clientsAtRisk = clientsAtRiskFiltered.length;
    const clientsAtRiskList: AtRiskClient[] = clientsAtRiskFiltered.map((a: Account) => {
      const lastContact = effectiveLastContact(a);
      const lastContactDays = lastContact
        ? Math.floor((Date.now() - lastContact.getTime()) / (24 * 60 * 60 * 1000))
        : null;
      return {
        id: a.id,
        name: a.name1 || 'Unnamed',
        lastContactDays,
      };
    });

    // Weekly Momentum — count only THIS user's activities scheduled within the
    // current week. Previously this counted `activities.length` (every activity
    // ever, all users), so the momentum % was always wildly inflated. Use a
    // midnight-normalized [Sunday, next Sunday) window so the bounds don't drift
    // with the current time of day, and owner-scope to match the opportunity KPIs.
    const weekWindowStart = new Date(today);
    weekWindowStart.setHours(0, 0, 0, 0);
    weekWindowStart.setDate(weekWindowStart.getDate() - today.getDay());
    const weekWindowEnd = new Date(weekWindowStart);
    weekWindowEnd.setDate(weekWindowEnd.getDate() + 7);

    const weekActivities = activities.filter((a: Activity) => {
      if (!a.scheduleddate) return false;
      const d = new Date(a.scheduleddate);
      return !Number.isNaN(d.getTime()) && d >= weekWindowStart && d < weekWindowEnd;
    });

    const activitiesThisWeek = weekActivities.length;
    const weeklyTarget = 15; // Default target

    // Activity breakdown - use type
    const visitCount = weekActivities.filter((a: Activity) => {
      const typeLabel = a.type;
      return typeLabel === 'visit' || typeLabel === 'meeting';
    }).length;

    const callCount = weekActivities.filter((a: Activity) => {
      const typeLabel = a.type;
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
      const typeLabel = a.type;
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
      const isNotCompleted = a.status !== 'completed';
      return isBeforeToday && isNotCompleted;
    });
    
    const overdueItems: AgendaItem[] = overdueActivities.map((a: Activity, idx: number) => {
      const typeLabel = a.type;
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
      (a: Activity) => a.status === 'completed'
    ).length;

    // Quarterly Performance calculation
    // Get current quarter boundaries
    const currentQuarter = Math.floor(today.getMonth() / 3);
    const quarterStart = new Date(today.getFullYear(), currentQuarter * 3, 1);
    const quarterEnd = new Date(today.getFullYear(), (currentQuarter + 1) * 3, 0, 23, 59, 59, 999);
    
    // Won opportunities this quarter.
    // Strictly attribute by `closedon` (actual close date). Any won opp without
    // `closedon` is a data bug at write time — fix it in updateOpportunity, do
    // NOT silently absorb it here, otherwise the same opp would be counted in
    // every quarter forever.
    const wonOpportunities = opportunities.filter((o: Opportunity) => {
      if (!isWonStage(o.stage)) return false;
      if (!o.closedon) return false;
      const d = new Date(o.closedon);
      if (Number.isNaN(d.getTime())) return false;
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
  }, [activities, opportunities, accounts, userId]);

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

  // New session (or a freshly mounted empty local conversation) should start a new log record.
  useEffect(() => {
    if (chatMessages.length !== 0) return;
    setCurrentConversationId(null);
    lastSavedRef.current = '';
    lastQueuedLogRef.current = '';
    creatingConversationRef.current = false;
    clearCopilotConversationLogId();
  }, [chatMessages.length]);

  // Write Dataverse conversation logs from the local session, but never hydrate UI from them.
  useEffect(() => {
    if (!userId) return;

    const logMessages = toCopilotConversationLogMessages(chatMessages);
    if (logMessages.length === 0) return;

    const logBounds = getCopilotConversationLogBounds(logMessages);
    if (!logBounds) return;

    const messagesJson = JSON.stringify(logMessages);
    if (messagesJson === lastSavedRef.current || messagesJson === lastQueuedLogRef.current) return;
    lastQueuedLogRef.current = messagesJson;

    let cancelled = false;
    const saveTimer = setTimeout(() => {
      void (async () => {
        const shouldCreate = !currentConversationId;
        if (shouldCreate && creatingConversationRef.current) return;
        if (shouldCreate) creatingConversationRef.current = true;

        try {
          if (shouldCreate) {
            const created = await createConversation.mutateAsync({
              ownerid: userId,
              startedon: logBounds.startedOn,
              lastactiveon: logBounds.lastActiveOn,
              messagesjson: messagesJson,
            });
            if (cancelled) return;
            setCurrentConversationId(created.id);
            writeCopilotConversationLogId(created.id);
          } else {
            await updateConversation.mutateAsync({
              id: currentConversationId,
              changedFields: {
                messagesjson: messagesJson,
                lastactiveon: logBounds.lastActiveOn,
              },
            });
            if (cancelled) return;
          }

          lastSavedRef.current = messagesJson;
        } catch (error) {
          console.warn('[home] Failed to persist copilot conversation log:', error);
          lastQueuedLogRef.current = '';
          if (!cancelled && currentConversationId) {
            setCurrentConversationId(null);
            clearCopilotConversationLogId();
          }
        } finally {
          if (shouldCreate) creatingConversationRef.current = false;
        }
      })();
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(saveTimer);
    };
  }, [chatMessages, createConversation, currentConversationId, updateConversation, userId]);

  // Note: Removed auto-expand behavior - user should manually open Copilot panel
  // Connection status indicator shows whether Copilot is configured (gray/orange/green)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Shared player for auto-spoken agent replies (same engine as everywhere else).
  const chatAutoPlayer = useSpeechPlayer({
    getLang: () => speechLang(locale),
    getVoice: () => findMatchingSystemVoice(getSelectedVoice(), locale),
  });

  // Auto-play agent response with TTS when enabled
  useEffect(() => {
    if (!getAutoPlayAgentResponse()) return;
    
    // On first run, snapshot the current message count as baseline.
    // Only messages arriving AFTER this point are eligible for auto-play.
    if (initialMessageCountRef.current === null) {
      initialMessageCountRef.current = chatMessages.length;
      return;
    }
    // No new messages since baseline — nothing to play.
    if (chatMessages.length <= initialMessageCountRef.current) return;
    
    // Find the latest agent message that should be auto-played.
    const agentMessages = chatMessages.filter((m: ChatMessage) => {
      if (m.type !== 'agent') return false;
      // Skip thinking / streaming states
      if (m.isThinking || m.isStreaming) return false;
      // Queue messages: only allow the final summary
      if (m.queueId) return m.taskRole === 'summary';
      // Skip task overview / announce narration from legacy path
      if (m.taskRole === 'overview' || m.taskRole === 'announce' || m.taskRole === 'substep') return false;
      return true;
    });
    if (agentMessages.length === 0) return;
    
    const latestMessage = agentMessages[agentMessages.length - 1];
    
    // Don't replay if we already played this message
    if (lastAutoPlayedIdRef.current === latestMessage.id) return;
    
    // Mark as played
    lastAutoPlayedIdRef.current = latestMessage.id;

    // Function to speak text via the shared player. The text passed in is
    // already plain (markdown/JSON stripped below), so it is spoken as one
    // utterance (segments:[text]) to match the prior behaviour exactly.
    const speakText = (text: string) => {
      if (!text.trim()) return;
      chatAutoPlayer.play([{ id: latestMessage.id, text, segments: [text] }]);
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
    
    // Check if voice summary is enabled
    const voiceSummaryEnabled = getVoiceSummaryEnabled();
    
    if (voiceSummaryEnabled) {
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



  // Pull to refresh
  const handleRefresh = useCallback(async () => {
    await Promise.all([refetchActivities(), refetchOpportunities(), refetchAccounts()]);
  }, [refetchActivities, refetchOpportunities, refetchAccounts, locale]);

  // Overdue agenda handlers
  const handleMarkOverdueDone = useCallback(async (activityId: string) => {
    try {
      await updateActivity.mutateAsync({
        id: activityId,
        changedFields: { status: 'completed' as const }
      });
      // The item leaves the overdue list on refetch; no toast.
      refetchActivities();
    } catch (error) {
      // Toast is shown by the global MutationCache.onError handler.
      console.error('Failed to mark activity as done:', error);
    }
  }, [updateActivity, refetchActivities, locale]);

  const handleRescheduleOverdue = useCallback(async (activityId: string, newDate: Date) => {
    try {
      await updateActivity.mutateAsync({
        id: activityId,
        changedFields: { scheduleddate: newDate.toISOString() }
      });
      // The item moves out of the overdue list on refetch; no toast.
      refetchActivities();
    } catch (error) {
      // Toast is shown by the global MutationCache.onError handler.
      console.error('Failed to reschedule activity:', error);
    }
  }, [updateActivity, refetchActivities, locale]);

  // Brief Me insight texts for TTS.
  // Built per-insight-card (one array element == one card) and in the SAME order
  // the Insights sheet renders them, so playback advancing `briefMeCurrentIndex`
  // can drive the sheet to page to the card currently being read aloud.
  const briefMeInsightTexts = useMemo(() => {
    // Primary: speak each business insight card as its own segment so the sheet
    // can follow the voice card-by-card. Reads are already security-trimmed by Dataverse.
    if (businessInsights && businessInsights.length > 0) {
      return businessInsights.map((insight: { title: string; summary: string; detailsjson: string; rationale?: string }) => {
        let body = insight.summary || '';
        try {
          const details = JSON.parse(insight.detailsjson || '[]');
          if (Array.isArray(details) && details.length > 0) {
            body = details.join(' ');
          }
        } catch {
          // keep summary
        }
        const rationale = insight.rationale && insight.rationale.trim() ? insight.rationale : '';
        return [insight.title, body, rationale].filter(Boolean).join('. ');
      });
    }

    // Fallback: current-session AI generation text (no Dataverse cards yet).
    if (customInsightText && customInsightText.length > 0) {
      return customInsightText;
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
        await handleRefreshInsight();
        // After generation, refetch to get the new insights
        const { data: newInsights } = await refetchBusinessInsights();
        if (!newInsights || newInsights.length === 0) {
          return;
        }
      }
      
      // Expand and start playing
      setBriefMeExpanded(true);
      setBriefMeCurrentIndex(0);
      setBriefMeCurrentTime(0);
      setBriefMeCurrentSegmentIndex(0);
      setBriefMeSegmentCount(0);
      setBriefMeCurrentSegmentLabel('');
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

  // Build one TTS track per insight card, pre-segmented for natural pauses, in
  // the SAME order the Insights sheet renders them so playback can drive the
  // sheet to follow the card being read.
  const buildInsightTracks = useCallback((): SpeechTrack[] => {
    return briefMeInsightTexts.map((text: string, i: number) => ({
      id: `insight-${i}`,
      segments: splitIntoSegments(text),
    }));
  }, [briefMeInsightTexts]);

  // Shared speech player — owns the audio mechanics + mobile gesture unlock.
  // The Insight UI keeps its own player bar; this only feeds it state.
  const insightPlayer = useSpeechPlayer({
    getLang: () => speechLang(locale),
    getVoice: () => findMatchingSystemVoice(getSelectedVoice(), locale),
    getRate: () => briefMeSpeedRef.current,
    trackPauseMs: 800,
    segmentPauseMs: 500,
    onTrackChange: (index: number, track: SpeechTrack) => {
      setBriefMeCurrentIndex(index);
      setBriefMeSegmentCount(track.segments?.length ?? 0);
      setBriefMeCurrentSegmentIndex(0);
    },
    onSegmentChange: (_trackIndex: number, segIndex: number, text: string) => {
      setBriefMeCurrentSegmentIndex(segIndex);
      setBriefMeCurrentSegmentLabel(text);
    },
    onEnd: () => {
      setBriefMeIsPlaying(false);
      if (briefMeTimerRef.current) clearInterval(briefMeTimerRef.current);
    },
  });

  // Play insight at a specific index. Delegates audio to the shared player and
  // keeps the legacy briefMe* state in sync for the existing player bar.
  const playInsightAtIndex = useCallback((index: number) => {
    const tracks = buildInsightTracks();
    if (tracks.length === 0) return;
    briefMeStartTimeRef.current = Date.now();
    setBriefMeIsPlaying(true);
    insightPlayer.play(tracks, index);

    // Drive the elapsed-time readout (independent of the audio engine).
    if (briefMeTimerRef.current) clearInterval(briefMeTimerRef.current);
    briefMeTimerRef.current = setInterval(() => {
      setBriefMeCurrentTime((prev: number) => Math.min(prev + 1, briefMeTotalTime));
    }, 1000);
  }, [buildInsightTracks, insightPlayer, briefMeTotalTime]);

  const handleBriefMePlay = () => {
    playInsightAtIndex(briefMeCurrentIndex);
  };

  const handleBriefMePause = () => {
    insightPlayer.pause();
    setBriefMeIsPlaying(false);
    if (briefMeTimerRef.current) {
      clearInterval(briefMeTimerRef.current);
    }
  };

  const handleBriefMeResume = () => {
    insightPlayer.resume();
    setBriefMeIsPlaying(true);
    briefMeStartTimeRef.current = Date.now();
    if (briefMeTimerRef.current) clearInterval(briefMeTimerRef.current);
    briefMeTimerRef.current = setInterval(() => {
      setBriefMeCurrentTime((prev: number) => Math.min(prev + 1, briefMeTotalTime));
    }, 1000);
  };

  const handleBriefMeStop = () => {
    insightPlayer.stop();
    setBriefMeIsPlaying(false);
    setBriefMeCurrentTime(0);
    setBriefMeCurrentIndex(0);
    setBriefMeCurrentSegmentIndex(0);
    setBriefMeSegmentCount(0);
    setBriefMeCurrentSegmentLabel('');
    if (briefMeTimerRef.current) {
      clearInterval(briefMeTimerRef.current);
    }
  };

  const handleBriefMeSpeedToggle = () => {
    const speeds = [0.75, 1, 1.25, 1.5, 2];
    const currentIdx = speeds.indexOf(briefMeSpeed);
    const nextSpeed = speeds[(currentIdx + 1) % speeds.length];
    setBriefMeSpeed(nextSpeed);
    // Re-speak the current insight at the new rate (the player reads the speed
    // from briefMeSpeedRef, so the change applies immediately).
    if (briefMeIsPlaying) {
      insightPlayer.restart();
    }
  };

  const handleBriefMePrev = () => {
    if (briefMeCurrentIndex > 0) {
      const prevIndex = briefMeCurrentIndex - 1;
      setBriefMeCurrentIndex(prevIndex);
      if (briefMeIsPlaying) {
        playInsightAtIndex(prevIndex);
      }
    }
  };

  const handleBriefMeNext = () => {
    if (briefMeCurrentIndex < briefMeInsightTexts.length - 1) {
      const nextIndex = briefMeCurrentIndex + 1;
      setBriefMeCurrentIndex(nextIndex);
      if (briefMeIsPlaying) {
        playInsightAtIndex(nextIndex);
      }
    }
  };

  const handleBriefMeClose = () => {
    handleBriefMeStop();
    setBriefMeExpanded(false);
  };

  // Page-scoped ActionDock chips intentionally NOT registered on Home: the
  // collapsed copilot dock now surfaces the contextual suggestion pills instead.
  // (Previously "New Visit" / "View Opps" lived here but duplicated the home
  // quick-action area and bottom nav, and blocked the suggestion pills.)

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

    if (briefMeExpanded) {
      handleBriefMeStop();
      setBriefMeExpanded(false);
    }
    
    const agentFramework = getAgentFramework();

    // Only local-agent framework is supported for insight refresh
    if (agentFramework !== 'local-agent') {
      return;
    }
    
    setIsRefreshingInsight(true);
    setInsightRefreshStatus(t('gatheringData', locale));
    try {
      let agentResponse = '';
      
      // Update status for LLM analysis
      setInsightRefreshStatus(t('analyzingBusinessData', locale));

      // Build detailed context with specific names and data for richer insights (used by both branches)
      const todayAgendaDetails = kpiData.agendaItems.slice(0, 5).map((item: AgendaItem) => 
        `${item.type}: ${item.label}`
      ).join('; ');
      
      // Calculate quarterly performance progress
      const qProgress = kpiData.quarterlyTarget > 0 ? Math.round((kpiData.quarterlyWonAmount / kpiData.quarterlyTarget) * 100) : 0;
      const quarterlyPerformanceDetails = `已成交 $${(kpiData.quarterlyWonAmount / 1000).toFixed(0)}K / 目标 $${(kpiData.quarterlyTarget / 1000).toFixed(0)}K (完成率 ${qProgress}%)`;
      
      const atRiskClientsDetails = kpiData.clientsAtRiskList.slice(0, 5).map((client: AtRiskClient) => {
        const days = client.lastContactDays;
        const reason = days == null
          ? (t('neverContacted', locale))
          : (t('noContactForDays', locale, { days }));
        return `${client.name} (${reason})`;
      }).join('; ');
      
      if (agentFramework === 'local-agent') {
        // Use local agent with BYOM to generate insights directly
        const systemPrompt = `You are a sales assistant that analyzes sales data and generates actionable business insights.

[MOST CRITICAL RULE - MUST STRICTLY FOLLOW]
- ONLY use client names, opportunity names, and activity names that are EXPLICITLY listed in the data below
- ABSOLUTELY FORBIDDEN to fabricate, invent, or make up any names not present in the data
- If a data category shows "No data" or empty, do NOT generate insights about it
- If at-risk clients count is 0, do NOT mention any at-risk clients

=== Today's Agenda (${kpiData.agendaItems.length} items) ===
${todayAgendaDetails || 'No agenda items'}

=== Quarterly Performance ===
Won $${(kpiData.quarterlyWonAmount / 1000).toFixed(0)}K / Target $${(kpiData.quarterlyTarget / 1000).toFixed(0)}K (${qProgress}% complete)

=== At-Risk Clients (${kpiData.clientsAtRisk} need attention; criterion: no contact for 14+ days) ===
${atRiskClientsDetails || 'No at-risk clients'}

=== Other Metrics ===
- Client coverage: ${kpiData.clientsTouchedThisWeek}/${kpiData.totalClients} clients contacted this week
- Activity progress: ${kpiData.activitiesThisWeek}/${kpiData.weeklyTarget}`;
        
        const userPrompt = 'Give me today\'s business insight briefing, including: 1) Top priority items to address; 2) Key opportunities to follow up; 3) At-risk clients to proactively contact. Be specific with client and opportunity names.';
        
        // Update status for generating response
        setInsightRefreshStatus(t('generatingInsights', locale));
        // Call LLM directly using generateVoiceSummary with custom prompts
        const summaryResult = await generateVoiceSummary(userPrompt, locale, systemPrompt);
        
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
      setInsightRefreshStatus(t('savingInsights', locale));
      
      // Step 1: Generate insight bullet points for cards
      // Generate insights with rationale in JSON format
      // Build raw data string directly for insight generation (avoid LLM fabrication)
      const rawDataForInsights = `=== Today's Agenda (${kpiData.agendaItems.length} items) ===
${todayAgendaDetails || 'No agenda items'}

=== Quarterly Performance ===
Won $${(kpiData.quarterlyWonAmount / 1000).toFixed(0)}K / Target $${(kpiData.quarterlyTarget / 1000).toFixed(0)}K (${qProgress}% complete)

=== At-Risk Clients (${kpiData.clientsAtRisk} need attention; criterion: no contact for 14+ days) ===
${atRiskClientsDetails || 'No at-risk clients'}

=== Other Metrics ===
- Closing this week: ${kpiData.closingThisWeek} opportunities
- Client coverage: ${kpiData.clientsTouchedThisWeek}/${kpiData.totalClients} clients contacted this week
- Activity progress: ${kpiData.activitiesThisWeek}/${kpiData.weeklyTarget}`;

      const insightSystemPrompt = `You are a Senior Sales Coach, not a data-summarizing machine. Based on the following business data, generate 5-6 coaching-grade insights.

[ROLE - CORE]
- Your value is "diagnosis + prescription", not "summary + restatement"
- Every insight must answer three questions: What → Why (root cause) → How (concrete action)
- NEVER write empty phrases like "client is at risk", "needs attention", or "recommend follow-up" — you MUST state what the risk actually is, where it comes from, and the first concrete step to take

[DATA INTEGRITY - MUST STRICTLY FOLLOW]
- ONLY use client names, opportunity names, activity names, and numbers EXPLICITLY listed in the "Business Data" below
- ABSOLUTELY FORBIDDEN to fabricate any name or number not present in the data
- At-risk client data is annotated with the reason (e.g. "no contact for X days") — you MUST cite this specific reason in the rationale
- If a data category is empty (shows "No data" or 0), do NOT generate insights about it

Each insight must include:
1. insight: A one-line, specific statement of the problem or opportunity (max 12 words) — concrete, not vague
2. rationale: Coaching-grade analysis (80-150 words) that MUST include:
   - [Root cause] Use the data to explain WHY — e.g. for an at-risk client, state "no contact for X days, past the 14-day warning line"; for performance, state the exact gap amount and percentage
   - [Impact] What happens if this is left unaddressed (churn, missed closing window, target gap, etc.)
   - [Action] 1-2 concrete steps the rep can take TODAY (call / email / schedule a visit / what to prepare), naming the specific client or opportunity
3. type: Insight type (followup/closing/risk/revisit/performance/opportunity/client/activity)

[BAD EXAMPLE - DO NOT write like this]
- ✗ "Rush University and others are at risk and need attention" (doesn't say what the risk is, why, or what to do)
[GOOD EXAMPLE - write like this]
- ✓ "Rush University has had no contact for 21 days, well past the 14-day warning line — the relationship is cooling. Send a value-led re-engagement email today, and book a 15-minute call this week to check whether their procurement plan has shifted."

Return JSON array format:
[
  {"insight": "Insight point", "rationale": "Root cause + impact + concrete action", "type": "type"}
]

Return only the JSON array, no other text.`;
      
      // Pass raw data directly to insight generation instead of agentResponse.
      // NOTE: use 'text' (NOT 'json'): this platform's AI Builder JSON output mode
      // returns a boilerplate schema instead of our array, which silently fails to
      // parse and saves nothing. Text mode returns the JSON array as plain text and
      // the parser below (strip code fences + JSON.parse) handles it reliably.
      const insightResult = await generateVoiceSummary(rawDataForInsights, locale, insightSystemPrompt, undefined, undefined, 'text');
      
      if (!insightResult.success || !insightResult.summary) {
        throw new Error(insightResult.error || 'Failed to generate insight');
      }
      
      // Parse the JSON response
      let parsedInsights: Array<{ insight: string; rationale: string; type: string }> = [];
      try {
        // Try to extract JSON from the response (may have markdown code blocks
        // or surrounding prose when the model replies in text mode).
        let jsonStr = insightResult.summary.trim();
        // Remove markdown code blocks if present
        if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
        }
        // If there is leading/trailing prose, isolate the first JSON array block.
        if (!jsonStr.startsWith('[')) {
          const start = jsonStr.indexOf('[');
          const end = jsonStr.lastIndexOf(']');
          if (start !== -1 && end !== -1 && end > start) {
            jsonStr = jsonStr.slice(start, end + 1);
          }
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
          rationale: t('insightRationaleShort', locale),
          type: 'activity'
        }));
      }
      
      // Extract insight lines for brief transcript
      const insightLines = parsedInsights.map((item: { insight: string }) => item.insight);
      
      // Step 2: Generate comprehensive brief transcript for TTS playback
      // Build the insight list as a string first
      const insightListText = insightLines.map((line: string, i: number) => (i + 1) + '. ' + line).join('\n');
      
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
      
      const briefTranscriptPrompt = briefTranscriptPromptEn;
      
      const briefTranscriptResult = await generateVoiceSummary(
        'Generate today\'s business briefing voice script',
        locale,
        briefTranscriptPrompt,
      );
      
      // Get the brief transcript (fallback to agentResponse if generation fails)
      const briefTranscript = briefTranscriptResult.success && briefTranscriptResult.summary
        ? briefTranscriptResult.summary
        : agentResponse;
      
      // Save the full brief transcript to localStorage for TTS playback
      localStorage.setItem('sales-copilot-brief-transcript', briefTranscript);
      
      if (insightLines.length > 0) {

        // Save new insights to Dataverse FIRST, then remove the user's older
        // ones. We create first so we can read back the Dataverse-stamped owner
        // (`_ownerid_value`) of a brand-new row — that is the reliable identity
        // of the current user, obtained WITHOUT querying the systemuser table
        // (which the Code App runtime cannot read). This makes the "replace my
        // previous insights" cleanup both correct and multi-user safe.
        const now = new Date().toISOString();
        const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // Valid for 24 hours
        
        const savePromises = parsedInsights.map((item: { insight: string; rationale: string; type: string }, idx: number) => {
          // Map generated insight categories to the Dataverse choice labels accepted by BusinessInsight.type.
          const typeMapping: Record<string, { title: string; type: 'warning' | 'info' | 'success' }> = {
            'followup': {
              title: t('insightFollowUpAlert', locale),
              type: 'info'
            },
            'closing': {
              title: t('insightClosingThisWeek', locale),
              type: 'success'
            },
            'risk': {
              title: t('insightAtRiskAlert', locale),
              type: 'warning'
            },
            'revisit': {
              title: t('insightPendingRevisit', locale),
              type: 'warning'
            },
            'performance': {
              title: t('insightPerformanceAnalysis', locale),
              type: 'success'
            },
            'opportunity': {
              title: t('insightOpportunityUpdate', locale),
              type: 'info'
            },
            'client': {
              title: t('insightClientInsight', locale),
              type: 'success'
            },
            'activity': {
              title: t('insightActivityUpdate', locale),
              type: 'info'
            }
          };
          
          const categoryInfo = typeMapping[item.type] || {
            title: t('smartInsightNum', locale, { num: idx + 1 }),
            type: 'info' as const
          };
          
          return createBusinessInsight.mutateAsync({
            title: categoryInfo.title,
            summary: item.insight,
            detailsjson: JSON.stringify([item.insight]),
            rationale: item.rationale, // Full rationale (Dataverse field increased to support longer text)
            displayorder: idx,
            generatedon: now, // batch marker — used to distinguish this run's rows
            isactive: true,
            ownerid: userId || '',
            referenceidsjson: '[]',
            referenceType: 'client',
            type: categoryInfo.type,
            validuntil: validUntil,
          });
        });
        
        const created = await Promise.all(savePromises);
        const newIds = new Set(
          created.map((c: { id?: string }) => c?.id).filter((id): id is string => !!id)
        );

        // Re-read so we can see the Dataverse-stamped owner of the rows we just
        // created (this run is marked by generatedon === now).
        const { data: afterCreate } = await refetchBusinessInsights();
        const all = afterCreate || [];
        const myNewRows = all.filter(
          (r: { id: string; generatedon?: string }) => r.generatedon === now || newIds.has(r.id)
        );
        // The current user's Dataverse owner id, taken from a row we just made.
        const myOwnerId = (myNewRows[0]?.ownerid || '').toLowerCase();

        // Delete only THIS user's PRIOR insights (same owner, not part of this
        // run). Scoping by the Dataverse owner of our own fresh row guarantees
        // we never touch another rep's insights, and it also clears legacy rows
        // that were created before ownership stamping worked.
        if (myOwnerId) {
          const stale = all.filter(
            (r: { id: string; ownerid?: string; generatedon?: string }) =>
              (r.ownerid || '').toLowerCase() === myOwnerId &&
              r.generatedon !== now &&
              !newIds.has(r.id)
          );
          if (stale.length > 0) {
            await Promise.all(
              stale.map((insight: { id: string }) => deleteBusinessInsight.mutateAsync(insight.id))
            );
          }
        }

        // Clear custom insight text so the component uses database data
        setCustomInsightText(null);
        
        // Refetch business insights to get the new data
        await refetchBusinessInsights();
        
      } else {
        throw new Error(insightResult.error || 'Failed to generate insight');
      }
    } catch (error) {
      console.error('[Insight Refresh] Error:', error);
      // Show more specific error message
      const errorMessage = error instanceof Error ? error.message : 'Something went wrong';
      // Errors are logged to console; no toast to avoid noise
    } finally {
      setIsRefreshingInsight(false);
      setInsightRefreshStatus('');
    }
  };

  const handleInsightsPanelPlay = useCallback(async () => {
    // CRITICAL (mobile): unlock the speech engine synchronously inside this
    // user gesture BEFORE any await. Generating insights below is async (and may
    // hit the network), which would otherwise strip the gesture and leave iOS
    // silently blocking playback.
    insightPlayer.prime();

    if (briefMeIsPlaying) return;

    if (briefMeExpanded) {
      if (insightPlayer.state.isPaused) {
        handleBriefMeResume();
      } else {
        handleBriefMePlay();
      }
      return;
    }

    await handleBriefMe();
  }, [briefMeExpanded, briefMeIsPlaying, insightPlayer, handleBriefMe, handleBriefMePlay, handleBriefMeResume]);

  const handleInsightsPanelStop = useCallback(() => {
    handleBriefMeStop();
    setBriefMeExpanded(false);
  }, [handleBriefMeStop]);

  // D13: bind the audio player's lifecycle to the Insight panel. The player is
  // rendered as a floating bar only while the panel is CLOSED (briefMeExpanded
  // && !insightsSheetOpen), which used to leave it playing/visible after the
  // user dismissed the panel. Route every panel open/close through here so that
  // CLOSING the panel also stops playback and retires the player.
  const handleInsightsSheetOpenChange = useCallback((open: boolean) => {
    setInsightsSheetOpen(open);
    if (!open) handleInsightsPanelStop();
  }, [handleInsightsPanelStop]);

  // State for clearing insights
  const [isClearingInsights, setIsClearingInsights] = useState(false);

  // Clear all business insights
  const handleClearAllInsights = async () => {
    if (isClearingInsights) return;
    setIsClearingInsights(true);
    
    try {
      const { data: allInsights } = await refetchBusinessInsights();
      const all = allInsights || [];
      // We cannot resolve the current user's Dataverse owner id directly (the
      // systemuser table is not queryable from the Code App runtime). Derive it
      // from the most recently generated insight the user can see — in a
      // per-user panel that row belongs to the current user — and clear only
      // rows with that same owner, so we never delete another rep's insights.
      const newestFirst = [...all].sort(
        (a: { generatedon?: string }, b: { generatedon?: string }) =>
          (b.generatedon || '').localeCompare(a.generatedon || '')
      );
      const myOwnerId = (newestFirst[0]?.ownerid || '').toLowerCase();
      const myInsights = myOwnerId
        ? all.filter((insight: { ownerid?: string }) => (insight.ownerid || '').toLowerCase() === myOwnerId)
        : [];

      if (myInsights.length === 0) {
        toast.info(t('noInsightsToClear', locale));
        return;
      }
      
      // Delete insights one by one with progress
      const totalCount = myInsights.length;
      toast.loading(t('clearingInsights', locale, { count: totalCount }), { id: 'clearing-insights' });
      
      for (const insight of myInsights) {
        await deleteBusinessInsight.mutateAsync(insight.id);
      }
      
      setCustomInsightText(null);
      await refetchBusinessInsights();
      
      toast.dismiss('clearing-insights');
      toast.success(t('clearedInsights', locale, { count: totalCount }));
    } catch (error) {
      console.error('[Clear Insights] Error:', error);
      toast.dismiss('clearing-insights');
      toast.error(t('clearInsightsFailed', locale));
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


  // Handle new conversation - delegates to context for Copilot conversation reset
  // Long press action handler



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
        { text: t('qpTodayTasks', locale), query: t('qpTodayTasksQ', locale) },
        { text: t('qpPipelineStatus', locale), query: t('qpPipelineStatusQ', locale) },
        { text: t('qpFollowUps', locale), query: t('qpFollowUpsQ', locale) },
      ];
    }

    // Context-aware actions
    if (hasOpportunityContext) {
      return [
        { text: t('qpAtRiskDeals', locale), query: t('qpAtRiskDealsQ', locale) },
        { text: t('qpClosingThisWeek', locale), query: t('qpClosingThisWeekQ', locale) },
        { text: t('qpDealDetails', locale), query: t('qpMoreDetailsQ', locale) },
      ];
    }

    if (hasAccountContext) {
      return [
        { text: t('qpContactHistory', locale), query: t('qpContactHistoryQ', locale) },
        { text: t('qpRelatedDeals', locale), query: t('qpRelatedDealsQ', locale) },
        { text: t('qpNewVisit', locale), query: t('qpNewVisitQ', locale) },
      ];
    }

    if (hasScheduleContext) {
      return [
        { text: t('qpTomorrow', locale), query: t('qpTomorrowQ', locale) },
        { text: t('qpScheduleMeeting', locale), query: t('qpScheduleMeetingQ', locale) },
        { text: t('qpPrepNotes', locale), query: t('qpPrepNotesQ', locale) },
      ];
    }

    // General follow-up actions
    return [
      { text: t('qpMoreDetails', locale), query: t('qpMoreDetailsQ', locale) },
      { text: t('qpTodayTasks', locale), query: t('qpTodayTasksQ', locale) },
      { text: t('qpHelp', locale), query: t('qpHelpQ', locale) },
    ];
  }, [chatMessages, locale]);

  const quickActions = useMemo(() => getQuickActions(), [getQuickActions]);


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
          'pb-44',
          isSideDocked && 'pt-16'
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
              toast.success(t('refreshed', locale));
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
                  {t('refreshing', locale)}
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
                    ? (t('releaseToRefresh', locale))
                    : (t('pullToRefresh', locale))}
                </span>
              </div>
            )}
          </div>
        )}
        <motion.div
          variants={containerVariants}
          initial={firstMount ? 'hidden' : false}
          animate="show"
          className="space-y-5 pb-2"
        >
          {/* Greeting Header — sticky so it stays pinned while the page scrolls.
              -mx-4 px-4 extends the frosted background to the full width of <main>
              (which itself has px-4). z-30 keeps it above scrolling cards.
              In side-docked mode, switch to fixed positioning so the header
              spans across both the content area and the copilot panel. */}
          <motion.div
            variants={itemVariants}
            className={cn(
              'flex items-center justify-between bg-background/80 backdrop-blur-md',
              isSideDocked
                ? 'fixed top-0 left-0 right-0 z-50 h-14 px-4 border-b border-border/50'
                : 'sticky top-0 z-30 -mx-4 px-4 py-2'
            )}
          >
            <HomeHeaderWidgetDisplay locale={locale} widget={homeHeaderWidget} kpiData={kpiData} />
            {/* Notification & Settings Icons */}
            <div className="flex items-center gap-1">
              {/* Product Manual Icon */}
              <button
                onClick={() => navigate('/products')}
                data-tour="nav-products"
                className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted/50 active:bg-muted transition-colors"
                aria-label={t('productManual', locale)}
              >
                <BookOpen className="w-5 h-5 text-foreground" />
              </button>
              {/* Notification Icon -- now opens the unified insights sheet.
                  Badge shows the total count of active business insights. */}
              <div className="relative inline-flex">
                <button
                  onClick={() => setInsightsSheetOpen(true)}
                  data-tour="home-insights"
                  className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted/50 active:bg-muted transition-colors relative"
                  aria-label={t('insights', locale)}
                >
                  <Bell className="w-5 h-5 text-foreground" />
                  {unreadInsightCount > 0 && (
                    <span
                      className="absolute top-0.5 right-0 min-w-[16px] h-[16px] px-0.5 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold border-[1.5px] border-background"
                    >
                      {unreadInsightCount > 99 ? '99+' : unreadInsightCount}
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
                data-tour="nav-settings"
                className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted/50 active:bg-muted transition-colors relative"
                aria-label="Settings"
              >
                <Settings className="w-5 h-5 text-foreground" />
                {/* Connection Status Indicator - only show when NOT connected */}
                {!isCopilotConfigured && (
                  <span 
                    className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-muted-foreground/50 rounded-full border-2 border-background"
                    title={t('notConfigured', locale)}
                  />
                )}
              </button>
            </div>
          </motion.div>


          {/* KPI Cards - New comprehensive design */}
          <motion.div variants={itemVariants} data-tour="home-dashboard">
            <KPICards
              data={kpiData}
              isLoading={isDataLoading}
              onNavigate={navigate}
              onMarkDone={handleMarkOverdueDone}
              onReschedule={handleRescheduleOverdue}
              activityInsights={businessInsights}
              allActivities={activities}
              insightsSheetOpen={insightsSheetOpen}
              onInsightsSheetOpenChange={handleInsightsSheetOpenChange}
              onRefreshInsights={handleRefreshInsight}
              isRefreshingInsights={isRefreshingInsight}
              insightRefreshStatus={insightRefreshStatus}
              onPlayInsights={handleInsightsPanelPlay}
              onStopInsights={handleInsightsPanelStop}
              onPauseInsights={handleBriefMePause}
              onSpeedToggle={handleBriefMeSpeedToggle}
              playbackSpeed={briefMeSpeed}
              onPrevInsight={handleBriefMePrev}
              onNextInsight={handleBriefMeNext}
              canPrevInsight={briefMeCurrentIndex > 0}
              canNextInsight={briefMeCurrentIndex < briefMeInsightTexts.length - 1}
              activeInsightIndex={briefMeCurrentIndex}
              onInsightViewed={markInsightRead}
              isInsightPlaybackActive={briefMeIsPlaying}
              insightPlaybackElapsed={formatBriefMeTime(briefMeCurrentTime)}
              insightPlaybackTotal={formatBriefMeTime(briefMeTotalTime)}
              insightPlaybackParagraphLabel={briefMeCurrentSegmentLabel}
              insightPlaybackParagraphIndex={briefMeCurrentSegmentIndex}
              insightPlaybackParagraphCount={briefMeSegmentCount}
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



      {/* Brief Me playback controls now live inside the bell-triggered Insights
          sheet (KPICards). The standalone floating player has been removed. */}

      {/* Source Detail Sheet */}
      <Sheet open={!!selectedSource} onOpenChange={() => setSelectedSource(null)}>
        <SheetContent side="bottom" className="bg-card border-t border-border rounded-t-3xl">
          <SheetHeader className="pb-3 border-b border-border">
            <SheetTitle className="text-foreground">
              {selectedSource?.label || (t('sourceDetails', locale))}
            </SheetTitle>
          </SheetHeader>
          <div className="py-4">
            {selectedSource?.type === 'account' && sourceData && 'name1' in sourceData && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t('accountName', locale)}</p>
                  <p className="text-sm text-foreground font-medium">{(sourceData as Account).name1}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('fieldAddress', locale)}</p>
                  <p className="text-sm text-foreground">{(sourceData as Account).address || '-'}</p>
                </div>
                <button
                  onClick={() => {
                    setSelectedSource(null);
                    navigate(`/accounts/${selectedSource.id}`);
                  }}
                  className="w-full mt-2 py-2 px-4 rounded-xl bg-primary text-white text-sm font-medium"
                >
                  {t('viewDetails', locale)}
                </button>
              </div>
            )}
            {selectedSource?.type === 'opportunity' && sourceData && 'name1' in sourceData && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t('opportunityName', locale)}</p>
                  <p className="text-sm text-foreground font-medium">{(sourceData as Opportunity).name1}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('totalAmount', locale)}</p>
                  <p className="text-sm text-foreground">${((sourceData as Opportunity).totalamount || 0).toLocaleString()}</p>
                </div>
                <button
                  onClick={() => {
                    setSelectedSource(null);
                    navigate('/opportunity-review', { state: { opportunityId: selectedSource.id } });
                  }}
                  className="w-full mt-2 py-2 px-4 rounded-xl bg-primary text-white text-sm font-medium"
                >
                  {t('viewDetails', locale)}
                </button>
              </div>
            )}
            {selectedSource?.type === 'activity' && sourceData && 'title' in sourceData && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t('activitySubject', locale)}</p>
                  <p className="text-sm text-foreground font-medium">{(sourceData as Activity).title}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('activityDate', locale)}</p>
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
                  {t('viewDetails', locale)}
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
                  {t('notifications', locale)}
                </h3>
                <div className="flex items-center gap-3">
                  <span
                    onClick={() => toast.success(t('allMarkedRead', locale))}
                    className="text-xs text-primary font-medium cursor-pointer hover:underline"
                  >
                    {t('markAllRead', locale)}
                  </span>
                  <button
                    onClick={() => setNotificationOpen(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
                    aria-label={t('closeNotifications', locale)}
                    title={t('closeNotifications', locale)}
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
                        {t('notifOpportunityUpdate', locale)}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {t('notifOppBody', locale)}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1.5">
                        {t('min10Ago', locale)}
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
                        {t('notifVisitReminder', locale)}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {t('notifVisitBody', locale)}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1.5">
                        {t('min30Ago', locale)}
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
                        {t('notifDailyReportReady', locale)}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {t('notifDailyReportBody', locale)}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1.5">
                        {t('hours2Ago', locale)}
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
                        {t('notifSystemNotice', locale)}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {t('notifSystemBody', locale)}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1.5">
                        {t('yesterday', locale)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-4 py-3 border-t border-border bg-card">
                <button
                  onClick={() => {
                    setNotificationOpen(false);
                    toast.info(t('notifCenterComingSoon', locale));
                  }}
                  className="w-full text-center text-sm text-primary font-medium hover:underline"
                >
                  {t('viewAllNotifications', locale)}
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
            <SheetTitle>{t('settings', locale)}</SheetTitle>
          </SheetHeader>
          <SettingsPanel onClose={() => setSettingsOpen(false)} isOverlay={true} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
