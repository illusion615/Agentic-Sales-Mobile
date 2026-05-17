import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Phone,
  Calendar,
  CheckSquare,
  Mail,
  Clock,
  ChevronRight,
  MapPin,
  Plus,
  LayoutGrid,
  ChevronLeft,
  Sparkles,
} from 'lucide-react';
import { MobileLayout } from '@/components/mobile-layout';
import { FloatingQuickActions } from '@/components/floating-quick-actions';
import { GlassCard, GlassListItem } from '@/components/glass-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useActivityList } from '@/generated/hooks/use-activity';
import { useQueryClient } from '@tanstack/react-query';
import { ActivityTypeKeyToLabel, ActivityDraftstatusKeyToLabel, ActivityOutcomeKeyToLabel } from '@/generated/models/activity-model';
import type { Activity as DataverseActivity, ActivityTypeKey, ActivityDraftstatusKey } from '@/generated/models/activity-model';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { useCopilot } from '@/contexts/copilot-context';
import { getLocale } from '@/lib/i18n';
import { PullToRefresh } from '@/components/pull-to-refresh';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, addWeeks, addMonths, subDays, subWeeks, subMonths, isSameDay, isSameMonth, eachDayOfInterval, getDay } from 'date-fns';

const activityIcons: Record<string, typeof Phone> = {
  visit: MapPin,
  call: Phone,
  meeting: Calendar,
  email: Mail,
  other: CheckSquare,
};

const activityColors: Record<string, string> = {
  visit: 'bg-primary',
  call: 'bg-[#0D8F8C]',
  meeting: 'bg-[#6366F1]',
  email: 'bg-[#10B981]',
  other: 'bg-muted-foreground',
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
    },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  show: { opacity: 1, x: 0 },
} as const;

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isToday(dateStr: string): boolean {
  const date = new Date(dateStr);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function ActivityItem({ activity }: { activity: DataverseActivity }) {
  const navigate = useNavigate();
  const typeLabel = ActivityTypeKeyToLabel[activity.typeKey];
  const Icon = activityIcons[typeLabel] || CheckSquare;
  const color = activityColors[typeLabel] || 'bg-muted';
  const statusLabel = ActivityDraftstatusKeyToLabel[activity.draftstatusKey];
  const isCompleted = statusLabel === 'completed';

  return (
    <GlassListItem
      onClick={() => navigate(`/activities/${activity.id}`)}
      className="cursor-pointer hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div
          className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}
        >
          <Icon className="w-5 h-5 text-white" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3
              className={`text-sm font-medium truncate flex-1 ${
                isCompleted
                  ? 'text-muted-foreground line-through'
                  : 'text-foreground'
              }`}
            >
              {activity.title}
            </h3>
            <Badge variant="outline" className="text-[10px] capitalize flex-shrink-0">
              {statusLabel}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {activity.account?.name1 || 'No account'}
          </p>
        </div>

        {/* Time & Arrow */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            {formatTime(activity.scheduleddate)}
          </span>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
    </GlassListItem>
  );
}

type ViewMode = 'day' | 'week' | 'month';

export default function ActivitiesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialView = searchParams.get('view') as ViewMode | null;
  const initialDateParam = searchParams.get('date');
  const initialDate = initialDateParam ? new Date(initialDateParam + 'T00:00:00') : new Date();
  const [viewMode, setViewMode] = useState<ViewMode>(initialView && ['day', 'week', 'month'].includes(initialView) ? initialView : 'day');
  const [currentDate, setCurrentDate] = useState(initialDate);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const locale = getLocale();

  // Copilot context for agent awareness
  const copilot = useCopilot();
  const dragStartX = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const queryClient = useQueryClient();
  const { data: activities = [], isLoading } = useActivityList({
    orderBy: ['scheduleddate desc'],
  });

  // Pull to refresh handler
  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['activity-list'] });
  }, [queryClient]);

  // Filter activities based on view mode and current date
  const filteredActivities = useMemo(() => {
    return activities.filter((activity: DataverseActivity) => {
      const activityDate = new Date(activity.scheduleddate);
      
      if (viewMode === 'day') {
        return isSameDay(activityDate, currentDate);
      } else if (viewMode === 'week') {
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
        return activityDate >= weekStart && activityDate <= weekEnd;
      } else {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        return activityDate >= monthStart && activityDate <= monthEnd;
      }
    });
  }, [activities, viewMode, currentDate]);

  // Group activities by date for week/month views
  const activitiesByDate = useMemo(() => {
    const grouped: Record<string, DataverseActivity[]> = {};
    filteredActivities.forEach((activity: DataverseActivity) => {
      const dateKey = format(new Date(activity.scheduleddate), 'yyyy-MM-dd');
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(activity);
    });
    return grouped;
  }, [filteredActivities]);

  const pendingCount = filteredActivities.filter(
    (a: DataverseActivity) => ActivityDraftstatusKeyToLabel[a.draftstatusKey] !== 'completed'
  ).length;

  // Set page context for Copilot agent awareness
  useEffect(() => {
    // For Day View only, ship a rich per-activity payload so the agent can
    // narrate a daily report without an extra fetch. Other views stay light.
    const dayActivitiesPayload = viewMode === 'day'
      ? filteredActivities.map((a: DataverseActivity) => ({
          id: a.id,
          title: a.title,
          type: ActivityTypeKeyToLabel[a.typeKey],
          status: ActivityDraftstatusKeyToLabel[a.draftstatusKey],
          outcome: a.outcomeKey ? ActivityOutcomeKeyToLabel[a.outcomeKey] : undefined,
          scheduledAt: a.scheduleddate,
          accountName: a.account?.name1,
          contactName: a.contact?.fullname,
          opportunityName: a.opportunity?.name1,
          notes: a.notes ? String(a.notes).slice(0, 200) : undefined,
        }))
      : undefined;

    copilot.setPageContext({
      currentPage: locale === 'zh-Hans' ? '活动列表' : 'Activities List',
      summary: locale === 'zh-Hans'
        ? `活动列表: ${viewMode === 'day' ? '今日' : viewMode === 'week' ? '本周' : '本月'}共${filteredActivities.length}个活动，${pendingCount}个待完成`
        : `Activities list: ${filteredActivities.length} activities in ${viewMode} view, ${pendingCount} pending`,
      pageData: {
        viewMode,
        currentDate: currentDate.toISOString(),
        totalActivities: filteredActivities.length,
        pendingCount,
        activitiesByDate: Object.keys(activitiesByDate).map((dateKey) => ({
          date: dateKey,
          count: activitiesByDate[dateKey].length,
        })),
        ...(dayActivitiesPayload ? { dayActivities: dayActivitiesPayload } : {}),
      },
    });
    
    return () => {
      copilot.setPageContext(null);
    };
  }, [viewMode, currentDate, filteredActivities.length, pendingCount, activitiesByDate, locale, copilot.setPageContext]);

  // Navigation functions
  const goBack = () => {
    setSwipeDirection('right');
    if (viewMode === 'day') {
      setCurrentDate(subDays(currentDate, 1));
    } else if (viewMode === 'week') {
      setCurrentDate(subWeeks(currentDate, 1));
    } else {
      setCurrentDate(subMonths(currentDate, 1));
    }
  };

  const goForward = () => {
    setSwipeDirection('left');
    if (viewMode === 'day') {
      setCurrentDate(addDays(currentDate, 1));
    } else if (viewMode === 'week') {
      setCurrentDate(addWeeks(currentDate, 1));
    } else {
      setCurrentDate(addMonths(currentDate, 1));
    }
  };

  // Swipe handling
  const handleDragStart = (e: React.PointerEvent) => {
    dragStartX.current = e.clientX;
  };

  const handleDragEnd = (e: React.PointerEvent) => {
    const dragEndX = e.clientX;
    const diff = dragStartX.current - dragEndX;
    const threshold = 50;

    if (diff > threshold) {
      goForward();
    } else if (diff < -threshold) {
      goBack();
    }
  };

  // Get title based on view mode
  const getViewTitle = () => {
    if (viewMode === 'day') {
      const today = new Date();
      if (isSameDay(currentDate, today)) {
        return 'Today';
      }
      return format(currentDate, 'EEE, MMM d');
    } else if (viewMode === 'week') {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
      return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d')}`;
    } else {
      return format(currentDate, 'MMMM yyyy');
    }
  };

  // Get days for month calendar grid
  const getMonthDays = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const startDay = getDay(monthStart);
    const calendarStart = subDays(monthStart, startDay);
    const days = eachDayOfInterval({ start: calendarStart, end: addDays(monthEnd, 6 - getDay(monthEnd)) });
    return days;
  };

  // Get days for week view
  const getWeekDays = () => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
  };

  if (isLoading) {
    return (
      <MobileLayout title="Activities">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </MobileLayout>
    );
  }

  const viewModeLabels: Record<ViewMode, string> = {
    day: 'Day',
    week: 'Week',
    month: 'Month',
  };

  // Open Copilot with a pre-canned daily-report ask. The Day View pageContext
  // already includes per-activity titles, statuses, outcomes, account/contact/
  // opportunity links, and notes, so the agent has full context to narrate.
  const handleGenerateDailyReport = () => {
    const dateLabel = format(currentDate, 'yyyy-MM-dd');
    const prompt = locale === 'zh-Hans'
      ? `生成 ${dateLabel} 的工作日报：根据当前页面上的任务列表（含完成状态、结果、关联的客户/联系人/商机、备注），输出四个部分：1）今日完成情况；2）关键成果（推动了哪些商机或客户）；3）未完成任务与原因；4）明日建议。`
      : `Generate a daily report for ${dateLabel}: use the task list currently on this page (statuses, outcomes, linked accounts/contacts/opportunities, notes) and produce four sections: 1) today's completion; 2) key wins (which opportunities or accounts moved forward); 3) pending tasks and why; 4) suggestions for tomorrow.`;
    copilot.openPanel(true);
    copilot.sendMessage(prompt);
  };

  return (
    <MobileLayout
      title="Activities"
      hideVoiceButton={true}
      headerRight={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <LayoutGrid className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(['day', 'week', 'month'] as ViewMode[]).map((mode: ViewMode) => (
              <DropdownMenuItem
                key={mode}
                onClick={() => setViewMode(mode)}
                className={viewMode === mode ? 'bg-accent' : ''}
              >
                {viewModeLabels[mode]} View
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <PullToRefresh onRefresh={handleRefresh} className="flex-1 overflow-y-auto pb-40">
        <div className="py-4 space-y-4">
          {/* Navigation Header */}
          <div className="flex items-center justify-between px-1">
            <Button variant="ghost" size="icon" onClick={goBack} className="h-8 w-8">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h2 className="text-base font-semibold text-foreground">{getViewTitle()}</h2>
            <Button variant="ghost" size="icon" onClick={goForward} className="h-8 w-8">
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          {/* Task Summary */}
          <GlassCard className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {viewMode === 'day' ? "Today's Tasks" : `Tasks in ${viewModeLabels[viewMode]}`}
              </h2>
              <p className="text-xs text-muted-foreground">
                {pendingCount} {pendingCount === 1 ? 'task' : 'tasks'} pending
              </p>
            </div>
            <div className="flex items-center gap-2">
              {viewMode === 'day' && (
                <button
                  type="button"
                  onClick={handleGenerateDailyReport}
                  aria-label={locale === 'zh-Hans' ? '生成今日工作日报' : 'Generate daily report'}
                  title={locale === 'zh-Hans' ? '生成今日工作日报' : 'Generate daily report'}
                  className="h-9 w-9 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center justify-center"
                >
                  <Sparkles className="w-4 h-4" />
                </button>
              )}
              <div className="w-12 h-12 rounded-full accent-gradient flex items-center justify-center">
                <span className="text-white text-xl font-bold">
                  {pendingCount}
                </span>
              </div>
            </div>
          </GlassCard>

          {/* Swipeable Calendar Content */}
          <div
            ref={containerRef}
            className="touch-pan-x select-none"
            onPointerDown={handleDragStart}
            onPointerUp={handleDragEnd}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={`${viewMode}-${currentDate.toISOString()}`}
                initial={{ opacity: 0, x: swipeDirection === 'left' ? 100 : swipeDirection === 'right' ? -100 : 0 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: swipeDirection === 'left' ? -100 : swipeDirection === 'right' ? 100 : 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' as const }}
              >
                {/* Day View */}
                {viewMode === 'day' && (
                  <div className="space-y-3">
                    {filteredActivities.length === 0 ? (
                      <Empty className="py-8">
                        <EmptyHeader>
                          <EmptyTitle>No activities</EmptyTitle>
                          <EmptyDescription>No activities scheduled for this day</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    ) : (
                      filteredActivities.map((activity: DataverseActivity) => (
                        <motion.div
                          key={activity.id}
                          variants={itemVariants}
                          initial="hidden"
                          animate="show"
                        >
                          <ActivityItem activity={activity} />
                        </motion.div>
                      ))
                    )}
                  </div>
                )}

                {/* Week View */}
                {viewMode === 'week' && (
                  <div className="space-y-3">
                    {/* First Row: Sun-Wed */}
                    <div className="grid grid-cols-4 gap-2">
                      {getWeekDays().slice(0, 4).map((day: Date) => {
                        const dateKey = format(day, 'yyyy-MM-dd');
                        const dayActivities = activitiesByDate[dateKey] || [];
                        const isCurrentDay = isSameDay(day, new Date());
                        return (
                          <div
                            key={dateKey}
                            className={`min-h-[140px] p-2 rounded-xl border cursor-pointer transition-all ${
                              isCurrentDay
                                ? 'border-primary bg-primary/10 shadow-sm'
                                : 'border-border/50 bg-card/50 hover:bg-card/80'
                            }`}
                            onClick={() => {
                              setCurrentDate(day);
                              setViewMode('day');
                            }}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase">
                                {format(day, 'EEE')}
                              </span>
                              <span className={`text-sm font-semibold ${isCurrentDay ? 'text-primary' : 'text-foreground'}`}>
                                {format(day, 'd')}
                              </span>
                            </div>
                            <div className="space-y-1">
                              {dayActivities.slice(0, 3).map((activity: DataverseActivity) => {
                                const typeLabel = ActivityTypeKeyToLabel[activity.typeKey];
                                const color = activityColors[typeLabel] || 'bg-muted';
                                return (
                                  <div
                                    key={activity.id}
                                    className={`${color} text-white text-[10px] px-1.5 py-1 rounded-md truncate`}
                                  >
                                    <span className="font-medium">{formatTime(activity.scheduleddate)}</span>
                                  </div>
                                );
                              })}
                              {dayActivities.length > 3 && (
                                <div className="text-[10px] text-muted-foreground text-center">
                                  +{dayActivities.length - 3} more
                                </div>
                              )}
                              {dayActivities.length === 0 && (
                                <div className="text-[10px] text-muted-foreground/50 text-center pt-4">
                                  No tasks
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Second Row: Thu-Sat */}
                    <div className="grid grid-cols-3 gap-2">
                      {getWeekDays().slice(4, 7).map((day: Date) => {
                        const dateKey = format(day, 'yyyy-MM-dd');
                        const dayActivities = activitiesByDate[dateKey] || [];
                        const isCurrentDay = isSameDay(day, new Date());
                        return (
                          <div
                            key={dateKey}
                            className={`min-h-[140px] p-2 rounded-xl border cursor-pointer transition-all ${
                              isCurrentDay
                                ? 'border-primary bg-primary/10 shadow-sm'
                                : 'border-border/50 bg-card/50 hover:bg-card/80'
                            }`}
                            onClick={() => {
                              setCurrentDate(day);
                              setViewMode('day');
                            }}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase">
                                {format(day, 'EEE')}
                              </span>
                              <span className={`text-sm font-semibold ${isCurrentDay ? 'text-primary' : 'text-foreground'}`}>
                                {format(day, 'd')}
                              </span>
                            </div>
                            <div className="space-y-1">
                              {dayActivities.slice(0, 4).map((activity: DataverseActivity) => {
                                const typeLabel = ActivityTypeKeyToLabel[activity.typeKey];
                                const color = activityColors[typeLabel] || 'bg-muted';
                                return (
                                  <div
                                    key={activity.id}
                                    className={`${color} text-white text-[10px] px-1.5 py-1 rounded-md truncate`}
                                  >
                                    <span className="font-medium">{formatTime(activity.scheduleddate)}</span>
                                  </div>
                                );
                              })}
                              {dayActivities.length > 4 && (
                                <div className="text-[10px] text-muted-foreground text-center">
                                  +{dayActivities.length - 4} more
                                </div>
                              )}
                              {dayActivities.length === 0 && (
                                <div className="text-[10px] text-muted-foreground/50 text-center pt-6">
                                  No tasks
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Month View */}
                {viewMode === 'month' && (
                  <div className="space-y-2">
                    {/* Month day headers */}
                    <div className="grid grid-cols-7 gap-1 text-center">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day: string) => (
                        <div key={day} className="text-xs font-medium text-muted-foreground py-1">
                          {day}
                        </div>
                      ))}
                    </div>
                    {/* Month calendar grid */}
                    <div className="grid grid-cols-7 gap-1">
                      {getMonthDays().map((day: Date) => {
                        const dateKey = format(day, 'yyyy-MM-dd');
                        const dayActivities = activitiesByDate[dateKey] || [];
                        const isCurrentMonth = isSameMonth(day, currentDate);
                        const isCurrentDay = isSameDay(day, new Date());
                        return (
                          <div
                            key={dateKey}
                            className={`aspect-square p-1 rounded-lg flex flex-col items-center cursor-pointer transition-colors ${
                              isCurrentDay
                                ? 'bg-primary text-primary-foreground'
                                : isCurrentMonth
                                ? 'bg-card/50 hover:bg-card'
                                : 'bg-muted/30 text-muted-foreground'
                            }`}
                            onClick={() => {
                              setCurrentDate(day);
                              setViewMode('day');
                            }}
                          >
                            <span className="text-xs font-medium">{format(day, 'd')}</span>
                            {dayActivities.length > 0 && (
                              <div className="flex gap-0.5 mt-0.5">
                                {dayActivities.slice(0, 3).map((activity: DataverseActivity, idx: number) => {
                                  const typeLabel = ActivityTypeKeyToLabel[activity.typeKey];
                                  const color = activityColors[typeLabel] || 'bg-muted';
                                  return (
                                    <div
                                      key={activity.id}
                                      className={`w-1.5 h-1.5 rounded-full ${isCurrentDay ? 'bg-primary-foreground' : color}`}
                                    />
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </PullToRefresh>

      <FloatingQuickActions
        actions={[
          {
            id: 'log-activity',
            icon: Plus,
            label: 'Log New Activity',
            onClick: () => navigate('/activity-capture'),
          },
        ]}
      />
    </MobileLayout>
  );
}
