import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'motion/react';
import { ChevronRight, ChevronLeft, ChevronDown, Calendar, Target, Phone, MapPin, FileText, CheckCircle2, Clock, X, Lightbulb, AlertTriangle, TrendingUp, Sparkles, Mail, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrencyCompact } from '@/lib/format-currency';
import { getLocale } from '@/lib/i18n';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import type { BusinessInsight } from '@/generated/models/business-insight-model';
import type { Activity, ActivityTypeKey } from '@/generated/models/activity-model';
import { ActivityTypeKeyToLabel } from '@/generated/models/activity-model';

// Animation variants
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
} as const;

export interface AgendaItem {
  id: string;
  type: 'call' | 'visit' | 'meeting' | 'email' | 'other' | 'proposal' | 'follow-up';
  label: string;
  description?: string;
  accountName?: string;
  address?: string;
  scheduledDate?: Date;
}

export interface HotOpportunity {
  id: string;
  name: string;
  amount: number;
  stage: string;
}

export interface AtRiskClient {
  id: string;
  name: string;
}

export interface ActivityInsight {
  id: string;
  title: string;
  summary: string;
  rationale: string;
  type: 'info' | 'warning' | 'success';
}

export interface KPIData {
  // Today's Agenda
  agendaItems: AgendaItem[];
  agendaCompleted: number;
  
  // Overdue items (scheduled between Monday 00:00 and now, NOT completed)
  overdueItems?: AgendaItem[];
  
  // Quarterly Performance (replaces Hot Opportunities)
  quarterlyWonAmount: number;
  quarterlyTarget: number;
  quarterlyWonCount: number;
  quarterlyTotalCount: number;
  closingThisWeek: number;
  
  // Client Coverage
  clientsTouchedThisWeek: number;
  totalClients: number;
  clientsAtRisk: number;
  clientsAtRiskList: AtRiskClient[];
  
  // Weekly Momentum
  activitiesThisWeek: number;
  weeklyTarget: number;
  visitCount: number;
  callCount: number;
}


interface KPICardsProps {
  data: KPIData;
  onNavigate: (path: string) => void;
  onMarkDone?: (itemId: string) => void;
  onReschedule?: (itemId: string, newDate: Date) => void;
  // Activity-related business insights to display in agenda card
  activityInsights?: BusinessInsight[];
  // All activities for calendar month view
  allActivities?: Activity[];
  // Callback when a calendar day is clicked
  onCalendarDayClick?: (date: Date) => void;
  // Callback when clicking on overdue count in header
  onProcessOverdue?: () => void;
  // Optional controlled state for the activity-insights sheet (so an external
  // trigger such as the home-header bell can open it). When provided, these
  // override the internal state; otherwise the component manages it itself.
  insightsSheetOpen?: boolean;
  onInsightsSheetOpenChange?: (open: boolean) => void;
}


// Activity type colors for calendar view
const activityTypeColors: Record<string, { bg: string; text: string; dot: string }> = {
  'visit': { bg: 'bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' },
  'call': { bg: 'bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  'meeting': { bg: 'bg-purple-500/20', text: 'text-purple-600 dark:text-purple-400', dot: 'bg-purple-500' },
  'email': { bg: 'bg-orange-500/20', text: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-500' },
  'other': { bg: 'bg-gray-500/20', text: 'text-gray-600 dark:text-gray-400', dot: 'bg-gray-500' },
};

// Icons for each activity type - matching activities.tsx exactly
const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'visit': MapPin,
  'call': Phone,
  'meeting': Calendar,
  'email': Mail,
  'other': CheckSquare,
  // Legacy types for backward compatibility
  'proposal': FileText,
  'follow-up': CheckCircle2,
};

// Use centralized currency formatting
function formatCurrencyValue(value: number): string {
  return formatCurrencyCompact(value);
}

// Progress ring with value in center
function ProgressRingWithValue({ 
  progress, 
  value, 
  size = 48, 
  strokeWidth = 4,
  colorClass
}: { 
  progress: number; 
  value: string;
  size?: number; 
  strokeWidth?: number;
  colorClass: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const clampedProgress = Math.min(Math.max(progress, 0), 100);
  const strokeDashoffset = circumference - (clampedProgress / 100) * circumference;
  
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={colorClass}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-bold text-foreground leading-none">{value}</span>
      </div>
    </div>

  );
}

export function KPICards({ data, onNavigate, onMarkDone, onReschedule, activityInsights = [], allActivities = [], onCalendarDayClick, onProcessOverdue, insightsSheetOpen: insightsSheetOpenProp, onInsightsSheetOpenChange }: KPICardsProps) {
  const locale = getLocale();

  const [rescheduleSheetOpen, setRescheduleSheetOpen] = useState(false);
  const [rescheduleItemId, setRescheduleItemId] = useState<string | null>(null);
  const [customDatePickerOpen, setCustomDatePickerOpen] = useState(false);
  const [selectedCustomDate, setSelectedCustomDate] = useState<Date | undefined>(undefined);
  // Remove insightCurrentIndex as it's no longer needed for swipe between calendar and insights
  const [overdueSheetOpen, setOverdueSheetOpen] = useState(false);
  const [overdueCurrentIndex, setOverdueCurrentIndex] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const [prevOverdueCount, setPrevOverdueCount] = useState<number | null>(null);
  const [agendaExpanded, setAgendaExpanded] = useState(false);
  const [insightsSheetOpenInternal, setInsightsSheetOpenInternal] = useState(false);
  const insightsSheetOpen = insightsSheetOpenProp ?? insightsSheetOpenInternal;
  const setInsightsSheetOpen = (open: boolean) => {
    if (onInsightsSheetOpenChange) onInsightsSheetOpenChange(open);
    else setInsightsSheetOpenInternal(open);
  };
  const [insightsSheetIndex, setInsightsSheetIndex] = useState(0);
  const constraintsRef = useRef<HTMLDivElement>(null);

  
  // Parse activity insights into display format
  const parsedActivityInsights: ActivityInsight[] = useMemo(() => {
    return activityInsights.map((insight: BusinessInsight) => {
      // Parse details JSON to get the insight text
      let summaryText = insight.summary || '';
      try {
        const details = JSON.parse(insight.detailsjson || '[]');
        if (Array.isArray(details) && details.length > 0) {
          summaryText = details[0];
        }
      } catch {
        // Keep original summary
      }
      
      // Get rationale text or generate fallback
      const rationaleText = insight.rationale && insight.rationale.trim()
        ? insight.rationale
        : (locale === 'zh-Hans'
          ? '基于您的销售数据和活动记录分析得出的个性化建议。'
          : 'Personalized recommendation based on your sales data and activity records.');
      
      // Determine type based on title/content
      let insightType: 'info' | 'warning' | 'success' = 'info';
      const lowerTitle = (insight.title || '').toLowerCase();
      const lowerSummary = summaryText.toLowerCase();
      if (lowerTitle.includes('风险') || lowerTitle.includes('risk') || lowerTitle.includes('warning') || lowerSummary.includes('overdue')) {
        insightType = 'warning';
      } else if (lowerTitle.includes('完成') || lowerTitle.includes('success') || lowerTitle.includes('completed')) {
        insightType = 'success';
      }
      
      return {
        id: insight.id,
        title: insight.title,
        summary: summaryText.length > 120 ? summaryText.substring(0, 120) + '...' : summaryText,
        rationale: rationaleText,
        type: insightType,
      };
    });
  }, [activityInsights, locale]);

  // Calendar month view data - group activities by date for the current month
  const calendarMonthData = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    // Get first and last day of current month
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
    
    // Filter activities for current month
    const monthActivities = allActivities.filter((activity: Activity) => {
      if (!activity.scheduleddate) return false;
      const activityDate = new Date(activity.scheduleddate);
      return activityDate >= firstDayOfMonth && activityDate <= lastDayOfMonth;
    });
    
    // Group activities by date
    const activitiesByDate: Record<string, { type: string; count: number }[]> = {};
    monthActivities.forEach((activity: Activity) => {
      const dateStr = new Date(activity.scheduleddate).toDateString();
      if (!activitiesByDate[dateStr]) {
        activitiesByDate[dateStr] = [];
      }
      const typeLabel = ActivityTypeKeyToLabel[activity.typeKey] || 'other';
      // Check if this type already exists for the date
      const existingType = activitiesByDate[dateStr].find((t: { type: string; count: number }) => t.type === typeLabel);
      if (existingType) {
        existingType.count++;
      } else {
        activitiesByDate[dateStr].push({ type: typeLabel, count: 1 });
      }
    });
    
    // Calculate statistics
    const totalActivities = monthActivities.length;
    const typeCounts: Record<string, number> = {};
    monthActivities.forEach((activity: Activity) => {
      const typeLabel = ActivityTypeKeyToLabel[activity.typeKey] || 'other';
      typeCounts[typeLabel] = (typeCounts[typeLabel] || 0) + 1;
    });
    
    // Get month name
    const monthName = locale === 'zh-Hans'
      ? `${currentMonth + 1}月`
      : now.toLocaleString('en-US', { month: 'long' });
    
    return {
      year: currentYear,
      month: currentMonth,
      monthName,
      firstDayOfMonth,
      lastDayOfMonth,
      activitiesByDate,
      totalActivities,
      typeCounts,
    };
  }, [allActivities, locale]);

  // Check if we have calendar data to display
  const hasCalendarView = allActivities.length > 0;

  // Track overdue count changes to trigger celebration
  useEffect(() => {
    const currentOverdueCount = data.overdueItems?.length ?? 0;
    // If we had overdue items before and now we have 0, celebrate!
    if (prevOverdueCount !== null && prevOverdueCount > 0 && currentOverdueCount === 0) {
      setShowCelebration(true);
      // Auto-hide celebration after animation
      const timer = setTimeout(() => setShowCelebration(false), 3000);
      return () => clearTimeout(timer);
    }
    setPrevOverdueCount(currentOverdueCount);
  }, [data.overdueItems?.length, prevOverdueCount]);

  // Confetti particle component - shoots from bottom corners diagonally upward
  const ConfettiParticle = ({ index }: { index: number }) => {
    const colors = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#f43f5e', '#06b6d4', '#84cc16'];
    const color = colors[index % colors.length];
    
    // Determine which side (left or right bottom corner)
    const isLeftSide = index % 2 === 0;
    
    // Random parameters for natural variation
    const randomDelay = Math.random() * 0.3;
    const randomDuration = 1.8 + Math.random() * 0.8;
    const size = 6 + Math.random() * 10;
    const shape = index % 3; // 0: square, 1: circle, 2: rectangle
    
    // Shooting angle - diagonal upward from corner
    // Left side shoots up-right, right side shoots up-left
    const baseAngle = isLeftSide ? 60 : 120; // degrees from horizontal
    const angleVariation = (Math.random() - 0.5) * 40; // ±20 degrees variation
    const angle = (baseAngle + angleVariation) * (Math.PI / 180);
    
    // Initial velocity
    const velocity = 400 + Math.random() * 200;
    
    // Calculate trajectory
    const peakX = Math.cos(angle) * velocity * 0.4;
    const peakY = -Math.sin(angle) * velocity * 0.4; // negative because Y increases downward
    
    // Starting position (bottom corners)
    const startX = isLeftSide ? 10 : 90; // percentage from left
    const startY = 100; // percentage from top (bottom of screen)
    
    // Rotation during flight
    const rotationAmount = (Math.random() - 0.5) * 1080;
    
    return (
      <motion.div
        className="absolute pointer-events-none"
        style={{
          left: `${startX}%`,
          bottom: 0,
          width: shape === 2 ? size * 1.5 : size,
          height: shape === 2 ? size * 0.6 : size,
          backgroundColor: color,
          borderRadius: shape === 1 ? '50%' : shape === 2 ? 2 : 0,
        }}
        initial={{ 
          x: 0, 
          y: 0, 
          opacity: 1, 
          rotate: 0,
          scale: 0.5
        }}
        animate={{
          // Parabolic motion: shoot up diagonally then fall
          x: [0, peakX * 0.5, peakX, peakX + (isLeftSide ? 30 : -30), peakX + (isLeftSide ? 50 : -50)],
          y: [0, peakY * 0.6, peakY, peakY + 150, peakY + 400],
          opacity: [1, 1, 1, 0.8, 0],
          rotate: [0, rotationAmount * 0.3, rotationAmount * 0.6, rotationAmount * 0.85, rotationAmount],
          scale: [0.5, 1, 1, 0.9, 0.7],
        }}
        transition={{
          duration: randomDuration,
          delay: randomDelay,
          ease: [0.25, 0.1, 0.25, 1] as const,
          times: [0, 0.25, 0.5, 0.75, 1],
        }}
      />
    );
  };

  
  // Get overdue items count
  const overdueCount = data.overdueItems?.length ?? 0;
  
  // Calculate derived values
  const coverageProgress = data.totalClients > 0 ? Math.round((data.clientsTouchedThisWeek / data.totalClients) * 100) : 0;
  const momentumProgress = data.weeklyTarget > 0 ? Math.round((data.activitiesThisWeek / data.weeklyTarget) * 100) : 0;
  
  // Color classes based on progress
  const getCoverageColor = () => {
    if (coverageProgress >= 80) return 'text-emerald-500';
    if (coverageProgress >= 50) return 'text-amber-500';
    return 'text-emerald-500';
  };
  
  const getMomentumColor = () => {
    if (momentumProgress >= 100) return 'text-emerald-500';
    if (momentumProgress >= 70) return 'text-amber-500';
    return 'text-violet-500';
  };
  
  // Reschedule quick date options
  const getQuickDates = () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(today);
    dayAfter.setDate(dayAfter.getDate() + 2);
    
    return { today, tomorrow, dayAfter };
  };

  // Celebration overlay when all overdue tasks are completed
  const CelebrationOverlay = () => {
    if (!showCelebration) return null;
    
    return (
      <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
        {/* Confetti particles */}
        {Array.from({ length: 50 }).map((_, i: number) => (
          <ConfettiParticle key={i} index={i} />
        ))}
        
        {/* Success message */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.4, ease: "easeOut" as const }}
        >
          <motion.div
            className="bg-card/95 backdrop-blur-sm rounded-2xl px-8 py-6 shadow-xl border border-border"
            initial={{ y: 20 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" as const }}
          >
            <div className="text-center">
              <motion.div
                className="text-5xl mb-3"
                animate={{ 
                  scale: [1, 1.2, 1],
                  rotate: [0, -10, 10, -10, 0]
                }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                🎉
              </motion.div>
              <p className="text-lg font-semibold text-foreground">
                {locale === 'zh-Hans' ? '太棒了！' : 'Awesome!'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {locale === 'zh-Hans' ? '所有逾期任务已处理完成' : 'All overdue tasks completed!'}
              </p>
            </div>
          </motion.div>
        </motion.div>
      </div>
    );
  };
  
  const handleRescheduleClick = (itemId: string) => {
    setRescheduleItemId(itemId);
    setCustomDatePickerOpen(false);
  };
  
  const handleOpenOverdueSheet = () => {
    setOverdueCurrentIndex(0);
    setOverdueSheetOpen(true);
  };
  
  const handleSwipeOverdue = (info: PanInfo) => {
    const swipeThreshold = 50;
    const sortedOverdue = data.overdueItems?.slice().sort((a: AgendaItem, b: AgendaItem) => {
      const dateA = a.scheduledDate?.getTime() ?? 0;
      const dateB = b.scheduledDate?.getTime() ?? 0;
      return dateB - dateA;
    }) ?? [];
    
    if (info.offset.x < -swipeThreshold && overdueCurrentIndex < sortedOverdue.length - 1) {
      setOverdueCurrentIndex(overdueCurrentIndex + 1);
    } else if (info.offset.x > swipeThreshold && overdueCurrentIndex > 0) {
      setOverdueCurrentIndex(overdueCurrentIndex - 1);
    }
  };
  
  // Calendar month view is now standalone - no longer combined with insights
  
  const handleCustomDateSelect = () => {
    if (selectedCustomDate && rescheduleItemId && onReschedule) {
      onReschedule(rescheduleItemId, selectedCustomDate);
    }
    setCustomDatePickerOpen(false);
    setRescheduleSheetOpen(false);
    setRescheduleItemId(null);
    setSelectedCustomDate(undefined);
  };
  
  const quickDates = getQuickDates();
  
  // Format date for overdue item display
  const formatOverdueDate = (date?: Date) => {
    if (!date) return '';
    const weekdays = locale === 'zh-Hans'
      ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekday = weekdays[date.getDay()];
    return `${weekday} ${month}/${day}`;
  };
  return (
    <>
      {/* Celebration animation when all overdue tasks completed */}
      <CelebrationOverlay />
      
      <div className="space-y-3">
      {/* Top Row - 3 KPI Cards */}
      <div className="grid grid-cols-3 gap-3">
        {/* Quarterly Performance (季度业绩完成率) */}
        <motion.div
          variants={itemVariants}
          className="glass-card p-3 cursor-pointer hover:bg-muted/50 transition-colors"
          style={{ borderRadius: 20 }}
          onClick={() => onNavigate('/opportunity-review')}
        >
          {/* Row 1: progress ring (left) + status tag (right) */}
          <div className="flex items-center justify-between gap-2 mb-2">
            {(() => {
              const quarterlyProgress = data.quarterlyTarget > 0 ? Math.round((data.quarterlyWonAmount / data.quarterlyTarget) * 100) : 0;
              const getQuarterlyColor = () => {
                if (quarterlyProgress >= 100) return 'text-emerald-500';
                if (quarterlyProgress >= 70) return 'text-amber-500';
                return 'text-primary';
              };
              return (
                <ProgressRingWithValue
                  progress={Math.min(quarterlyProgress, 100)}
                  value={`${Math.min(quarterlyProgress, 100)}%`}
                  size={40}
                  strokeWidth={3}
                  colorClass={getQuarterlyColor()}
                />
              );
            })()}
            {(() => {
              const progress = data.quarterlyTarget > 0 ? Math.round((data.quarterlyWonAmount / data.quarterlyTarget) * 100) : 0;
              if (progress >= 100) {
                return (
                  <span className="inline-flex shrink-0 items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" style={{ whiteSpace: 'nowrap' }}>
                    🎉 {locale === 'zh-Hans' ? '已达成' : 'Achieved'}
                  </span>
                );
              } else if (progress >= 70) {
                return (
                  <span className="inline-flex shrink-0 items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" style={{ whiteSpace: 'nowrap' }}>
                    {locale === 'zh-Hans' ? '接近目标' : 'On Track'}
                  </span>
                );
              } else {
                return (
                  <span className="inline-flex shrink-0 items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary" style={{ whiteSpace: 'nowrap' }}>
                    {locale === 'zh-Hans' ? '进行中' : 'Active'}
                  </span>
                );
              }
            })()}
          </div>

          {/* Row 2: label */}
          <p className="text-[10px] text-muted-foreground leading-tight">
            {locale === 'zh-Hans' ? '季度业绩完成率' : 'Quarterly Performance'}
          </p>
          {/* Row 3: value */}
          <p className="text-lg font-bold text-foreground leading-tight whitespace-nowrap mb-2">
            {formatCurrencyValue(data.quarterlyWonAmount)}
          </p>

          {/* Target and progress */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">{locale === 'zh-Hans' ? '目标' : 'Target'}</span>
              <span className="text-foreground/80 font-medium">{formatCurrencyValue(data.quarterlyTarget)}</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">{locale === 'zh-Hans' ? '成交/商机' : 'Won/Total'}</span>
              <span className="text-foreground/80 font-medium">{data.quarterlyWonCount}/{data.quarterlyTotalCount}</span>
            </div>
          </div>
        </motion.div>
        
        {/* Client Coverage */}
        <motion.div
          variants={itemVariants}
          className="glass-card p-3 cursor-pointer hover:bg-muted/50 transition-colors"
          style={{ borderRadius: 20 }}
          onClick={() => onNavigate('/accounts')}
        >
          {/* Row 1: progress ring (left) + status tag (right) */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <ProgressRingWithValue
              progress={coverageProgress}
              value={`${coverageProgress}%`}
              size={40}
              strokeWidth={3}
              colorClass={getCoverageColor()}
            />
            {(() => {
              if (coverageProgress >= 80) {
                return (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 whitespace-nowrap">
                    {locale === 'zh-Hans' ? '充分' : 'Strong'}
                  </span>
                );
              } else if (coverageProgress >= 50) {
                return (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 whitespace-nowrap">
                    {locale === 'zh-Hans' ? '一般' : 'OK'}
                  </span>
                );
              } else {
                return (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 whitespace-nowrap">
                    {locale === 'zh-Hans' ? '偏低' : 'Low'}
                  </span>
                );
              }
            })()}
          </div>

          {/* Row 2: label */}
          <p className="text-[10px] text-muted-foreground leading-tight">
            {locale === 'zh-Hans' ? '客户覆盖' : 'Client Coverage'}
          </p>
          {/* Row 3: value */}
          <p className="text-lg font-bold text-foreground leading-tight whitespace-nowrap mb-2">
            {data.clientsTouchedThisWeek}/{data.totalClients}
          </p>

          {/* At risk clients list */}
          {data.clientsAtRiskList.length > 0 && (
            <div className="space-y-0.5">
              {data.clientsAtRiskList.slice(0, 2).map((client: AtRiskClient) => (
                <div key={client.id} className="flex items-center gap-1 text-[10px] text-rose-600 dark:text-rose-400">
                  <span className="w-1 h-1 rounded-full bg-rose-500" />
                  <span className="truncate">{client.name}</span>
                </div>
              ))}
              {data.clientsAtRiskList.length > 2 && (
                <p className="text-[10px] text-muted-foreground/60 pl-2">
                  +{data.clientsAtRiskList.length - 2} {locale === 'zh-Hans' ? '更多' : 'more'}
                </p>
              )}
            </div>
          )}
        </motion.div>
        
        {/* Weekly Momentum */}
        <motion.div
          variants={itemVariants}
          className="glass-card p-3 cursor-pointer hover:bg-muted/50 transition-colors"
          style={{ borderRadius: 20 }}
          onClick={() => onNavigate('/activities?view=week')}
        >
          {/* Row 1: progress ring (left) + status tag (right) */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <ProgressRingWithValue
              progress={Math.min(momentumProgress, 100)}
              value={`${momentumProgress}%`}
              size={40}
              strokeWidth={3}
              colorClass={getMomentumColor()}
            />
            <span className={cn(
              "inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap",
              momentumProgress >= 100
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                : momentumProgress >= 70
                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                  : 'bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300'
            )}>
              {momentumProgress >= 100
                ? (locale === 'zh-Hans' ? '🎉 达成' : '🎉 Hit!')
                : momentumProgress >= 70
                  ? (locale === 'zh-Hans' ? '接近' : 'Close')
                  : (locale === 'zh-Hans' ? '加油' : 'Go!')}
            </span>
          </div>

          {/* Row 2: label */}
          <p className="text-[10px] text-muted-foreground leading-tight">
            {locale === 'zh-Hans' ? '本周动力' : 'Weekly Momentum'}
          </p>
          {/* Row 3: value */}
          <p className="text-lg font-bold text-foreground leading-tight whitespace-nowrap mb-2">
            {data.activitiesThisWeek}/{data.weeklyTarget}
          </p>

          {/* Activity breakdown */}
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-0.5">
              <MapPin className="w-2.5 h-2.5" />
              <span>{data.visitCount}</span>
            </div>
            <div className="flex items-center gap-0.5">
              <Phone className="w-2.5 h-2.5" />
              <span>{data.callCount}</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Today's Agenda - Full Width Row */}
      <motion.div
        variants={itemVariants}
        className="glass-card p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        style={{ borderRadius: 20 }}
        onClick={() => onNavigate('/activities')}
      >
        {/* Calendar Month View - STANDALONE CARD (no longer swipeable with insights) */}
        {hasCalendarView && (
          <div className="mb-4">
            <div className="flex flex-col gap-2">
              {/* Calendar header with total activities AND overdue count */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-primary/20 text-primary">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      {locale === 'zh-Hans' ? '本月活动日历' : 'Monthly Calendar'}
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {calendarMonthData.monthName} {calendarMonthData.year}
                    </p>
                  </div>
                </div>
                {/* Right side: Overdue button only. Insights moved to header
                    bell; total activities are already shown on Momentum. */}
                <div className="flex items-center gap-2">
                  {overdueCount > 0 && (
                    <button
                      type="button"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        if (onProcessOverdue) {
                          onProcessOverdue();
                        } else {
                          handleOpenOverdueSheet();
                        }
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/60 transition-colors"
                    >
                      <Clock className="w-3 h-3" />
                      <span className="text-xs font-medium">{overdueCount} {locale === 'zh-Hans' ? '逾期' : 'overdue'}</span>
                    </button>
                  )}
                </div>
              </div>
              
              {/* Mini calendar grid */}
              <div className="mt-2">
                {/* Weekday headers */}
                <div className="grid grid-cols-7 gap-0.5 mb-1">
                  {(locale === 'zh-Hans' ? ['日', '一', '二', '三', '四', '五', '六'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S']).map((day: string, i: number) => (
                    <div key={i} className="text-center text-[11px] text-muted-foreground font-medium">{day}</div>
                  ))}
                </div>
                {/* Calendar days */}
                <div className="grid grid-cols-7 gap-0.5">
                  {(() => {
                    const days: React.ReactNode[] = [];
                    const firstDayOfWeek = calendarMonthData.firstDayOfMonth.getDay();
                    const daysInMonth = calendarMonthData.lastDayOfMonth.getDate();
                    const today = new Date();
                    
                    // Empty cells for days before the 1st
                    for (let i = 0; i < firstDayOfWeek; i++) {
                      days.push(<div key={`empty-${i}`} className="h-8" />);
                    }
                    
                    // Days of the month
                    for (let day = 1; day <= daysInMonth; day++) {
                      const date = new Date(calendarMonthData.year, calendarMonthData.month, day);
                      const dateStr = date.toDateString();
                      const dayActivities = calendarMonthData.activitiesByDate[dateStr] || [];
                      const isToday = date.toDateString() === today.toDateString();
                      const hasActivities = dayActivities.length > 0;
                      
                      days.push(
                        <div
                          key={day}
                          className={cn(
                            'h-8 flex flex-col items-center justify-center rounded relative cursor-pointer hover:bg-muted transition-colors',
                            isToday && 'bg-primary/20 ring-1 ring-primary',
                            hasActivities && !isToday && 'bg-muted/50'
                          )}
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            if (onCalendarDayClick) {
                              onCalendarDayClick(date);
                            }
                          }}
                        >
                          <span className={cn(
                            'text-[13px] leading-none',
                            isToday ? 'font-bold text-primary' : 'text-foreground'
                          )}>{day}</span>
                          {/* Activity type dots */}
                          {hasActivities && (
                            <div className="flex gap-0.5 mt-0.5">
                              {dayActivities.slice(0, 3).map((act: { type: string; count: number }, idx: number) => (
                                <div
                                  key={idx}
                                  className={cn(
                                    'w-1 h-1 rounded-full',
                                    activityTypeColors[act.type]?.dot || 'bg-gray-500'
                                  )}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }
                    
                    return days;
                  })()}
                </div>
              </div>
              
              {/* Activity type legend */}
              <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-border/30">
                {Object.entries(calendarMonthData.typeCounts).map(([type, count]: [string, number]) => (
                  <div key={type} className="flex items-center gap-1">
                    <div className={cn('w-2 h-2 rounded-full', activityTypeColors[type]?.dot || 'bg-gray-500')} />
                    <span className={cn('text-[10px] font-medium', activityTypeColors[type]?.text || 'text-gray-600')}>
                      {type === 'visit' ? (locale === 'zh-Hans' ? '拜访' : 'Visit') :
                       type === 'call' ? (locale === 'zh-Hans' ? '电话' : 'Call') :
                       type === 'meeting' ? (locale === 'zh-Hans' ? '会议' : 'Meeting') :
                       type === 'email' ? (locale === 'zh-Hans' ? '邮件' : 'Email') :
                       (locale === 'zh-Hans' ? '其他' : 'Other')}
                      <span className="text-muted-foreground"> ({count})</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {/* Show placeholder if no calendar data */}
        {!hasCalendarView && (
          <div className="mb-4">
            <div className="flex items-center gap-3 py-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-blue-500/20 text-blue-600 dark:text-blue-400">
                <Calendar className="w-4 h-4" />
              </div>
              <p className="text-sm text-muted-foreground">
                {locale === 'zh-Hans' ? '暂无活动数据' : 'No activity data yet'}
              </p>
            </div>
          </div>
        )}

        {/* Today's Agenda - Task List */}
        <div
          className="rounded-lg overflow-hidden border border-primary/30"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          {/* Header bar - clickable to toggle */}
          <button
            type="button"
            onClick={() => setAgendaExpanded(!agendaExpanded)}
            className="w-full flex items-center justify-between px-3 py-2 bg-primary/10 text-primary cursor-pointer hover:bg-primary/15 transition-colors"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Calendar className="w-4 h-4" />
              {locale === 'zh-Hans' ? '今日待办' : "Today's Agenda"}
            </span>
            <span className="flex items-center gap-2">
              {data.agendaItems.length > 0 && (
                <span className="text-xs font-medium text-primary/70">
                  {data.agendaItems.length} {locale === 'zh-Hans' ? '项任务' : 'tasks'}
                </span>
              )}
              <motion.span
                animate={{ rotate: agendaExpanded ? 0 : -90 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-4 h-4" />
              </motion.span>
            </span>
          </button>
          
          {/* Task list - collapsible */}
          <AnimatePresence initial={false}>
            {agendaExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] as const }}
                className="overflow-hidden"
              >
                {data.agendaItems.length > 0 ? (
                  <div className="divide-y divide-border/50">
                    {data.agendaItems.map((item: AgendaItem) => {
                      const ItemIcon = typeIcons[item.type] || CheckCircle2;
                      return (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2 }}
                          className="p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => onNavigate(`/activities/${item.id}`)}
                        >
                          <div className="flex items-center gap-3">
                            {/* Icon */}
                            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <ItemIcon className="w-4 h-4 text-primary" />
                            </div>
                            {/* Task info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{item.label}</p>
                              {item.address && (
                                <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                  <MapPin className="w-3 h-3 flex-shrink-0" />
                                  {item.address}
                                </p>
                              )}
                              {item.accountName && !item.address && (
                                <p className="text-xs text-muted-foreground truncate">{item.accountName}</p>
                              )}
                            </div>
                            {/* Arrow */}
                            <ChevronRight className="w-5 h-5 text-muted-foreground/50 flex-shrink-0" />
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      {locale === 'zh-Hans' ? '今日暂无待办' : 'No agenda items for today'}
                    </p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        


      </motion.div>
      
      {/* Overdue Tasks Sheet with Swipe */}
      <Sheet open={overdueSheetOpen} onOpenChange={setOverdueSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl px-6 pb-8">
          <SheetHeader className="pb-2">
            <SheetTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-500" />
                {locale === 'zh-Hans' ? '逾期任务' : 'Overdue Tasks'}
              </span>
              {overdueCount > 1 && (
                <span className="text-sm font-normal text-muted-foreground">
                  {overdueCurrentIndex + 1} / {overdueCount}
                </span>
              )}
            </SheetTitle>
          </SheetHeader>
          
          {/* Swipeable task card */}
          {(() => {
            const sortedOverdue = data.overdueItems?.slice().sort((a: AgendaItem, b: AgendaItem) => {
              const dateA = a.scheduledDate?.getTime() ?? 0;
              const dateB = b.scheduledDate?.getTime() ?? 0;
              return dateB - dateA;
            }) ?? [];
            const currentItem = sortedOverdue[overdueCurrentIndex];
            const OverdueIcon = currentItem ? (typeIcons[currentItem.type] || CheckCircle2) : CheckCircle2;
            
            if (!currentItem) return null;
            
            return (
              <div className="relative mt-1" ref={constraintsRef}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentItem.id}
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    transition={{ duration: 0.2 }}
                    drag={overdueCount > 1 ? "x" : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.2}
                    onDragEnd={(_, info: PanInfo) => handleSwipeOverdue(info)}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    <div className="bg-muted/50 rounded-xl p-4">
                      {/* Task header */}
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                          <OverdueIcon className="w-6 h-6 text-amber-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-semibold text-foreground">{currentItem.label}</p>
                          {currentItem.address && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <MapPin className="w-3 h-3 flex-shrink-0" />
                              {currentItem.address}
                            </p>
                          )}
                          {currentItem.accountName && !currentItem.address && (
                            <p className="text-sm text-muted-foreground">{currentItem.accountName}</p>
                          )}
                        </div>
                      </div>
                      
                      {/* Task description */}
                      {currentItem.description && (
                        <div className="mb-3">
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {currentItem.description}
                          </p>
                        </div>
                      )}
                      
                      {/* Overdue date badge */}
                      <div className="flex items-center gap-2 mb-4">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
                          <Clock className="w-3 h-3 mr-1" />
                          {locale === 'zh-Hans' ? '原定: ' : 'Was due: '}{formatOverdueDate(currentItem.scheduledDate)}
                        </span>
                      </div>
                      
                      {/* Go to detail button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full h-9 text-primary hover:text-primary hover:bg-primary/10"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          setOverdueSheetOpen(false);
                          onNavigate(`/activities/${currentItem.id}`);
                        }}
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        {locale === 'zh-Hans' ? '查看详情' : 'Go to Detail'}
                        <ChevronRight className="w-4 h-4 ml-auto" />
                      </Button>
                      
                      {/* Dot indicators */}
                      {overdueCount > 1 && (
                        <div className="flex items-center justify-center gap-1.5 pt-3">
                          {Array.from({ length: overdueCount }).map((_, idx: number) => (
                            <button
                              key={idx}
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                setOverdueCurrentIndex(idx);
                              }}
                              className={cn(
                                "w-2 h-2 rounded-full transition-all",
                                idx === overdueCurrentIndex
                                  ? "bg-amber-500 w-4"
                                  : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                              )}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            );
          })()}
          
          {/* Action buttons */}
          {!customDatePickerOpen ? (
            <div className="space-y-3 pt-4">
              {/* Mark done and Cancel buttons - side by side */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-12 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-800/50"
                  onClick={() => {
                    const sortedOverdue = data.overdueItems?.slice().sort((a: AgendaItem, b: AgendaItem) => {
                      const dateA = a.scheduledDate?.getTime() ?? 0;
                      const dateB = b.scheduledDate?.getTime() ?? 0;
                      return dateB - dateA;
                    }) ?? [];
                    const currentItem = sortedOverdue[overdueCurrentIndex];
                    if (onMarkDone && currentItem) {
                      onMarkDone(currentItem.id);
                      if (overdueCurrentIndex >= overdueCount - 1) {
                        setOverdueCurrentIndex(Math.max(0, overdueCount - 2));
                      }
                      if (overdueCount <= 1) {
                        setOverdueSheetOpen(false);
                      }
                    }
                  }}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  {locale === 'zh-Hans' ? '标记完成' : 'Mark Done'}
                </Button>
                <Button
                  variant="outline"
                  className="h-12 bg-destructive/10 text-destructive border-destructive/40 hover:bg-destructive/20"
                  onClick={() => {
                    const sortedOverdue = data.overdueItems?.slice().sort((a: AgendaItem, b: AgendaItem) => {
                      const dateA = a.scheduledDate?.getTime() ?? 0;
                      const dateB = b.scheduledDate?.getTime() ?? 0;
                      return dateB - dateA;
                    }) ?? [];
                    const currentItem = sortedOverdue[overdueCurrentIndex];
                    if (onMarkDone && currentItem) {
                      onMarkDone(currentItem.id);
                      if (overdueCurrentIndex >= overdueCount - 1) {
                        setOverdueCurrentIndex(Math.max(0, overdueCount - 2));
                      }
                      if (overdueCount <= 1) {
                        setOverdueSheetOpen(false);
                      }
                    }
                  }}
                >
                  <X className="w-4 h-4 mr-2" />
                  {locale === 'zh-Hans' ? '取消任务' : 'Cancel Task'}
                </Button>
              </div>
              
              {/* Divider */}
              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    {locale === 'zh-Hans' ? '重新安排' : 'Reschedule'}
                  </span>
                </div>
              </div>
              
              {/* Reschedule options */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-12"
                  onClick={() => {
                    const sortedOverdue = data.overdueItems?.slice().sort((a: AgendaItem, b: AgendaItem) => {
                      const dateA = a.scheduledDate?.getTime() ?? 0;
                      const dateB = b.scheduledDate?.getTime() ?? 0;
                      return dateB - dateA;
                    }) ?? [];
                    const currentItem = sortedOverdue[overdueCurrentIndex];
                    if (currentItem && onReschedule) {
                      onReschedule(currentItem.id, quickDates.today);
                      if (overdueCurrentIndex >= overdueCount - 1) {
                        setOverdueCurrentIndex(Math.max(0, overdueCount - 2));
                      }
                      if (overdueCount <= 1) {
                        setOverdueSheetOpen(false);
                      }
                    }
                  }}
                >
                  {locale === 'zh-Hans' ? '今天' : 'Today'}
                </Button>
                <Button
                  variant="outline"
                  className="h-12"
                  onClick={() => {
                    const sortedOverdue = data.overdueItems?.slice().sort((a: AgendaItem, b: AgendaItem) => {
                      const dateA = a.scheduledDate?.getTime() ?? 0;
                      const dateB = b.scheduledDate?.getTime() ?? 0;
                      return dateB - dateA;
                    }) ?? [];
                    const currentItem = sortedOverdue[overdueCurrentIndex];
                    if (currentItem && onReschedule) {
                      onReschedule(currentItem.id, quickDates.tomorrow);
                      if (overdueCurrentIndex >= overdueCount - 1) {
                        setOverdueCurrentIndex(Math.max(0, overdueCount - 2));
                      }
                      if (overdueCount <= 1) {
                        setOverdueSheetOpen(false);
                      }
                    }
                  }}
                >
                  {locale === 'zh-Hans' ? '明天' : 'Tomorrow'}
                </Button>
                <Button
                  variant="outline"
                  className="h-12"
                  onClick={() => {
                    const sortedOverdue = data.overdueItems?.slice().sort((a: AgendaItem, b: AgendaItem) => {
                      const dateA = a.scheduledDate?.getTime() ?? 0;
                      const dateB = b.scheduledDate?.getTime() ?? 0;
                      return dateB - dateA;
                    }) ?? [];
                    const currentItem = sortedOverdue[overdueCurrentIndex];
                    if (currentItem && onReschedule) {
                      onReschedule(currentItem.id, quickDates.dayAfter);
                      if (overdueCurrentIndex >= overdueCount - 1) {
                        setOverdueCurrentIndex(Math.max(0, overdueCount - 2));
                      }
                      if (overdueCount <= 1) {
                        setOverdueSheetOpen(false);
                      }
                    }
                  }}
                >
                  {locale === 'zh-Hans' ? '后天' : 'Day after'}
                </Button>
                <Button
                  variant="outline"
                  className="h-12"
                  onClick={() => {
                    const sortedOverdue = data.overdueItems?.slice().sort((a: AgendaItem, b: AgendaItem) => {
                      const dateA = a.scheduledDate?.getTime() ?? 0;
                      const dateB = b.scheduledDate?.getTime() ?? 0;
                      return dateB - dateA;
                    }) ?? [];
                    const currentItem = sortedOverdue[overdueCurrentIndex];
                    if (currentItem) {
                      handleRescheduleClick(currentItem.id);
                      setCustomDatePickerOpen(true);
                    }
                  }}
                >
                  {locale === 'zh-Hans' ? '自定义日期' : 'Custom Date'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="pt-4">
              <CalendarPicker
                mode="single"
                selected={selectedCustomDate}
                onSelect={setSelectedCustomDate}
                disabled={(date: Date) => date < new Date()}
                className="mx-auto"
              />
              <div className="flex gap-3 mt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setCustomDatePickerOpen(false);
                    setSelectedCustomDate(undefined);
                  }}
                >
                  {locale === 'zh-Hans' ? '返回' : 'Back'}
                </Button>
                <Button
                  className="flex-1"
                  disabled={!selectedCustomDate}
                  onClick={() => {
                    const sortedOverdue = data.overdueItems?.slice().sort((a: AgendaItem, b: AgendaItem) => {
                      const dateA = a.scheduledDate?.getTime() ?? 0;
                      const dateB = b.scheduledDate?.getTime() ?? 0;
                      return dateB - dateA;
                    }) ?? [];
                    const currentItem = sortedOverdue[overdueCurrentIndex];
                    if (selectedCustomDate && currentItem && onReschedule) {
                      onReschedule(currentItem.id, selectedCustomDate);
                      if (overdueCurrentIndex >= overdueCount - 1) {
                        setOverdueCurrentIndex(Math.max(0, overdueCount - 2));
                      }
                      if (overdueCount <= 1) {
                        setOverdueSheetOpen(false);
                      }
                    }
                    setCustomDatePickerOpen(false);
                    setSelectedCustomDate(undefined);
                  }}
                >
                  {locale === 'zh-Hans' ? '确认' : 'Confirm'}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Activity Insights Sheet with Swipe */}
      <Sheet open={insightsSheetOpen} onOpenChange={setInsightsSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl px-6 pb-8">
          <SheetHeader className="pb-2">
            <SheetTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                {locale === 'zh-Hans' ? '洞察' : 'Insights'}
              </span>
              {parsedActivityInsights.length > 1 && (
                <span className="text-sm font-normal text-muted-foreground">
                  {insightsSheetIndex + 1} / {parsedActivityInsights.length}
                </span>
              )}
            </SheetTitle>
          </SheetHeader>
          
          {/* Swipeable insight card */}
          {(() => {
            const currentInsight = parsedActivityInsights[insightsSheetIndex];
            if (!currentInsight) return null;
            
            return (
              <div className="relative mt-1">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentInsight.id}
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    transition={{ duration: 0.2 }}
                    drag={parsedActivityInsights.length > 1 ? "x" : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.2}
                    onDragEnd={(_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
                      const swipeThreshold = 50;
                      if (info.offset.x < -swipeThreshold && insightsSheetIndex < parsedActivityInsights.length - 1) {
                        setInsightsSheetIndex(insightsSheetIndex + 1);
                      } else if (info.offset.x > swipeThreshold && insightsSheetIndex > 0) {
                        setInsightsSheetIndex(insightsSheetIndex - 1);
                      }
                    }}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    <div className="bg-muted/50 rounded-xl p-4">
                      {/* Insight header with icon */}
                      <div className="flex items-start gap-3 mb-3">
                        <div className={cn(
                          'w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0',
                          currentInsight.type === 'warning' && 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
                          currentInsight.type === 'success' && 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
                          currentInsight.type === 'info' && 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                        )}>
                          {currentInsight.type === 'warning' && <AlertTriangle className="w-6 h-6" />}
                          {currentInsight.type === 'success' && <TrendingUp className="w-6 h-6" />}
                          {currentInsight.type === 'info' && <Lightbulb className="w-6 h-6" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-muted-foreground mb-0.5">{currentInsight.title}</p>
                          <p className="text-base font-semibold text-foreground leading-snug">{currentInsight.summary}</p>
                        </div>
                      </div>
                      
                      {/* Rationale section */}
                      <div className="mb-4">
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {currentInsight.rationale}
                        </p>
                      </div>
                      
                      {/* Dot indicators */}
                      {parsedActivityInsights.length > 1 && (
                        <div className="flex items-center justify-center gap-1.5 pt-3">
                          {parsedActivityInsights.map((_: ActivityInsight, idx: number) => (
                            <button
                              key={idx}
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                setInsightsSheetIndex(idx);
                              }}
                              className={cn(
                                "w-2 h-2 rounded-full transition-all",
                                idx === insightsSheetIndex
                                  ? "bg-primary w-4"
                                  : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                              )}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
    </>
  );
}
