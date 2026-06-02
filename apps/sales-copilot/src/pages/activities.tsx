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
  ChevronLeft,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';
import { MobileLayout } from '@/components/mobile-layout';
import { FloatingQuickActions } from '@/components/floating-quick-actions';
import { GlassCard } from '@/components/glass-card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useActivityList } from '@/generated/hooks/use-activity';
import { useQueryClient } from '@tanstack/react-query';
import type { Activity as DataverseActivity } from '@/generated/models/activity-model';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { useCopilot } from '@/contexts/copilot-context';
import { getLocale } from '@/lib/i18n';
import { getWeekStartDay } from '@/lib/i18n';
import { PullToRefresh } from '@/components/pull-to-refresh';
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

const activityDotColors: Record<string, string> = {
  visit: 'bg-primary',
  call: 'bg-[#0D8F8C]',
  meeting: 'bg-[#6366F1]',
  email: 'bg-[#10B981]',
  other: 'bg-muted-foreground/60',
};

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function isOverdue(activity: DataverseActivity): boolean {
  if (activity.status === 'completed') return false;
  const scheduled = new Date(activity.scheduleddate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return scheduled < today;
}

function getDaysOverdue(activity: DataverseActivity): number {
  const scheduled = new Date(activity.scheduleddate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  scheduled.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - scheduled.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Activity Card (enhanced) ───
function ActivityItem({ activity, showOverdue = false }: { activity: DataverseActivity; showOverdue?: boolean }) {
  const navigate = useNavigate();
  const locale = getLocale();
  const typeLabel = activity.type;
  const Icon = activityIcons[typeLabel] || CheckSquare;
  const color = activityColors[typeLabel] || 'bg-muted';
  const isCompleted = activity.status === 'completed';
  const overdue = showOverdue && isOverdue(activity);
  const daysOver = overdue ? getDaysOverdue(activity) : 0;

  return (
    <div
      onClick={() => navigate(`/activities/${activity.id}`)}
      className={cn(
        'glass-card p-3 cursor-pointer hover:bg-muted/30 active:bg-muted/50 transition-colors',
        overdue && 'border-red-500/30 bg-red-500/5'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5', color)}>
          <Icon className="w-4 h-4 text-white" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title - up to 2 lines */}
          <h3 className={cn(
            'text-[13px] font-medium leading-snug line-clamp-2',
            isCompleted ? 'text-muted-foreground line-through' : 'text-foreground'
          )}>
            {activity.title}
          </h3>
          
          {/* Account + Opportunity */}
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[11px] text-muted-foreground truncate">
              {activity.account?.name1 || ''}
            </span>
            {activity.opportunity?.name1 && (
              <>
                <span className="text-[11px] text-muted-foreground">·</span>
                <span className="text-[11px] text-primary/70 truncate">
                  {activity.opportunity.name1}
                </span>
              </>
            )}
          </div>

          {/* Status row: time + badges */}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <Clock className="w-2.5 h-2.5" />
              {formatTime(activity.scheduleddate)}
            </span>
            <span className={cn(
              'px-1.5 py-0 rounded text-[9px] font-medium',
              isCompleted ? 'bg-green-500/15 text-green-600' : 'bg-muted text-muted-foreground'
            )}>
              {activity.status}
            </span>
            {overdue && (
              <span className="flex items-center gap-0.5 text-[9px] font-medium text-red-500">
                <AlertTriangle className="w-2.5 h-2.5" />
                {daysOver}d {locale === 'zh-Hans' ? '逾期' : 'overdue'}
              </span>
            )}
          </div>
        </div>

        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-2" />
      </div>
    </div>
  );
}

type ViewMode = 'week' | 'month';

export default function ActivitiesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialView = searchParams.get('view') as ViewMode | null;
  const initialDateParam = searchParams.get('date');
  const initialDate = initialDateParam ? new Date(initialDateParam + 'T00:00:00') : new Date();
  const [viewMode, setViewMode] = useState<ViewMode>(initialView && ['week', 'month'].includes(initialView) ? initialView : 'week');
  const [currentDate, setCurrentDate] = useState(initialDate);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const locale = getLocale();

  const copilot = useCopilot();
  const dragStartX = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const queryClient = useQueryClient();
  const { data: activities = [], isLoading } = useActivityList({
    orderBy: ['scheduleddate desc'],
  });

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['activity-list'] });
  }, [queryClient]);

  // Filter activities based on view mode and current date
  const filteredActivities = useMemo(() => {
    return activities.filter((activity: DataverseActivity) => {
      const activityDate = new Date(activity.scheduleddate);
      if (viewMode === 'week') {
        const wso = getWeekStartDay() === 'monday' ? 1 : 0;
        const weekStart = startOfWeek(currentDate, { weekStartsOn: wso as 0 | 1 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: wso as 0 | 1 });
        return activityDate >= weekStart && activityDate <= weekEnd;
      } else {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        return activityDate >= monthStart && activityDate <= monthEnd;
      }
    });
  }, [activities, viewMode, currentDate]);

  // ─── Stats ───
  const completedCount = filteredActivities.filter((a: DataverseActivity) => a.status === 'completed').length;
  const totalCount = filteredActivities.length;
  const pendingCount = totalCount - completedCount;
  const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  
  // Overdue activities (not completed, scheduled before today)
  const overdueActivities = useMemo(() => 
    activities.filter((a: DataverseActivity) => isOverdue(a))
      .sort((a, b) => new Date(a.scheduleddate).getTime() - new Date(b.scheduleddate).getTime()),
    [activities]
  );

  // Group activities by date
  const activitiesByDate = useMemo(() => {
    const grouped: Record<string, DataverseActivity[]> = {};
    filteredActivities.forEach((activity: DataverseActivity) => {
      const dateKey = format(new Date(activity.scheduleddate), 'yyyy-MM-dd');
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(activity);
    });
    return grouped;
  }, [filteredActivities]);

  // Selected day activities split into groups
  const selectedDateKey = format(currentDate, 'yyyy-MM-dd');
  const selectedDayActivities = activitiesByDate[selectedDateKey] || [];
  const selectedDayPending = selectedDayActivities.filter((a) => a.status !== 'completed');
  const selectedDayCompleted = selectedDayActivities.filter((a) => a.status === 'completed');
  const [showCompleted, setShowCompleted] = useState(false);

  // Copilot page context
  useEffect(() => {
    const dayActivitiesPayload = viewMode === 'week'
      ? filteredActivities.map((a: DataverseActivity) => ({
          id: a.id, title: a.title, type: a.type, status: a.status,
          scheduledAt: a.scheduleddate,
          accountName: a.account?.name1, contactName: a.contact?.fullname,
          opportunityName: a.opportunity?.name1,
          notes: a.notes ? String(a.notes) : undefined,
        }))
      : undefined;

    copilot.setPageContext({
      currentPage: locale === 'zh-Hans' ? '活动列表' : 'Activities List',
      summary: locale === 'zh-Hans'
        ? `活动列表: ${viewMode === 'week' ? '本周' : '本月'}共${totalCount}个活动，已完成${completedCount}个(${completionRate}%)，${pendingCount}个待完成，${overdueActivities.length}个逾期`
        : `Activities: ${totalCount} total, ${completedCount} done (${completionRate}%), ${pendingCount} pending, ${overdueActivities.length} overdue`,
      pageData: {
        viewMode, currentDate: currentDate.toISOString(), totalActivities: totalCount,
        completedCount, pendingCount, overdueCount: overdueActivities.length,
        activitiesByDate: Object.keys(activitiesByDate).map((dk) => ({ date: dk, count: activitiesByDate[dk].length })),
        ...(dayActivitiesPayload ? { dayActivities: dayActivitiesPayload } : {}),
      },
    });
    return () => { copilot.setPageContext(null); };
  }, [viewMode, currentDate, totalCount, completedCount, pendingCount, overdueActivities.length, activitiesByDate, locale, copilot.setPageContext]);

  // Navigation
  const goBack = () => { setSwipeDirection('right'); viewMode === 'week' ? setCurrentDate(subWeeks(currentDate, 1)) : setCurrentDate(subMonths(currentDate, 1)); };
  const goForward = () => { setSwipeDirection('left'); viewMode === 'week' ? setCurrentDate(addWeeks(currentDate, 1)) : setCurrentDate(addMonths(currentDate, 1)); };

  const handleDragStart = (e: React.PointerEvent) => { dragStartX.current = e.clientX; };
  const handleDragEnd = (e: React.PointerEvent) => {
    const diff = dragStartX.current - e.clientX;
    if (diff > 50) goForward(); else if (diff < -50) goBack();
  };

  const getViewTitle = () => {
    if (viewMode === 'week') {
      const wso = getWeekStartDay() === 'monday' ? 1 : 0;
      const ws = startOfWeek(currentDate, { weekStartsOn: wso as 0 | 1 });
      const we = endOfWeek(currentDate, { weekStartsOn: wso as 0 | 1 });
      return `${format(ws, 'MMM d')} - ${format(we, 'MMM d')}`;
    }
    return format(currentDate, 'MMMM yyyy');
  };

  const getMonthDays = () => {
    const wso = getWeekStartDay() === 'monday' ? 1 : 0;
    const ms = startOfMonth(currentDate);
    const me = endOfMonth(currentDate);
    const sd = (getDay(ms) - wso + 7) % 7;
    const cs = subDays(ms, sd);
    const ed = (getDay(me) - wso + 7) % 7;
    return eachDayOfInterval({ start: cs, end: addDays(me, 6 - ed) });
  };

  const getWeekDays = () => {
    const wso = getWeekStartDay() === 'monday' ? 1 : 0;
    const ws = startOfWeek(currentDate, { weekStartsOn: wso as 0 | 1 });
    return eachDayOfInterval({ start: ws, end: addDays(ws, 6) });
  };

  const handleGenerateDailyReport = () => {
    const dateLabel = format(currentDate, 'yyyy-MM-dd');
    const prompt = locale === 'zh-Hans'
      ? `生成 ${dateLabel} 的工作日报：根据当前页面上的任务列表，输出：1）今日完成情况；2）关键成果；3）未完成任务与原因；4）明日建议。`
      : `Generate a daily report for ${dateLabel}: use the task list on this page and produce: 1) completion summary; 2) key wins; 3) pending tasks; 4) tomorrow's plan.`;
    copilot.openPanel(true);
    copilot.sendMessage(prompt);
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

  return (
    <MobileLayout
      title="Activities"
      hideVoiceButton={true}
      headerRight={
        <div className="flex rounded-md overflow-hidden border border-border/60">
          {(['week', 'month'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                'px-2.5 py-1 text-[10px] font-medium transition-colors',
                viewMode === mode ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted text-muted-foreground'
              )}
            >
              {mode === 'week' ? 'W' : 'M'}
            </button>
          ))}
        </div>
      }
    >
      <PullToRefresh onRefresh={handleRefresh} className="flex-1 overflow-y-auto pb-40">
        <div className="py-4 space-y-3">
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

          {/* ─── Enhanced Summary Card ─── */}
          <GlassCard className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  {viewMode === 'week' ? 'Weekly Progress' : `${format(currentDate, 'MMMM')} Progress`}
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {completedCount}/{totalCount} done · {pendingCount} pending
                  {overdueActivities.length > 0 && (
                    <span className="text-red-500"> · {overdueActivities.length} overdue</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {viewMode === 'week' && (
                  <button
                    type="button"
                    onClick={handleGenerateDailyReport}
                    aria-label="AI Report"
                    className="h-8 w-8 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center justify-center"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                  </button>
                )}
                <div className="relative w-11 h-11">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30" />
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3"
                      strokeDasharray={`${completionRate * 0.975} 100`}
                      strokeLinecap="round"
                      className="text-primary" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground">
                    {completionRate}%
                  </span>
                </div>
              </div>
            </div>
            {/* Progress bar with type distribution */}
            <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden flex">
              {totalCount > 0 && (
                <div className="bg-green-500 h-full transition-all" style={{ width: `${completionRate}%` }} />
              )}
            </div>
          </GlassCard>

          {/* Swipeable Calendar */}
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
                {/* ─── Week View ─── */}
                {viewMode === 'week' && (() => {
                  const weekDays = getWeekDays();
                  return (
                    <div className="space-y-3">
                      {/* Day selector with type dots */}
                      <div className="grid grid-cols-7 gap-1">
                        {weekDays.map((day: Date) => {
                          const dateKey = format(day, 'yyyy-MM-dd');
                          const dayActs = activitiesByDate[dateKey] || [];
                          const isSelected = isSameDay(day, currentDate);
                          const isTodayDay = isSameDay(day, new Date());
                          // Unique types for dots
                          const uniqueTypes = [...new Set(dayActs.map((a) => a.type))];
                          return (
                            <button
                              key={dateKey}
                              onClick={() => setCurrentDate(day)}
                              className={cn(
                                'flex flex-col items-center py-2 rounded-lg transition-all',
                                isSelected ? 'bg-primary/15 border border-primary' : isTodayDay ? 'border border-primary/40' : 'border border-transparent hover:bg-card/80'
                              )}
                            >
                              <span className="text-[10px] font-medium text-muted-foreground uppercase">{format(day, 'EEE')}</span>
                              <span className={cn(
                                'text-base font-semibold w-8 h-8 flex items-center justify-center rounded-full mt-0.5',
                                isSelected && 'bg-primary text-primary-foreground',
                                isTodayDay && !isSelected && 'text-primary'
                              )}>
                                {format(day, 'd')}
                              </span>
                              {/* Type color dots */}
                              {uniqueTypes.length > 0 ? (
                                <div className="flex gap-0.5 mt-0.5">
                                  {uniqueTypes.slice(0, 4).map((t) => (
                                    <span key={t} className={cn('w-1.5 h-1.5 rounded-full', activityDotColors[t] || 'bg-muted-foreground')} />
                                  ))}
                                </div>
                              ) : (
                                <div className="h-2 mt-0.5" /> // spacer
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* ─── Selected day: Pending tasks ─── */}
                      {selectedDayActivities.length === 0 ? (
                        <Empty className="py-8">
                          <EmptyHeader>
                            <EmptyTitle>No activities</EmptyTitle>
                            <EmptyDescription>No activities for {format(currentDate, 'EEE, MMM d')}</EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      ) : (
                        <div className="space-y-3">
                          {/* Pending */}
                          {selectedDayPending.length > 0 && (
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5 px-1">
                                <TrendingUp className="w-3 h-3 text-primary" />
                                <span className="text-[11px] font-semibold text-foreground">
                                  {locale === 'zh-Hans' ? `待办 (${selectedDayPending.length})` : `To Do (${selectedDayPending.length})`}
                                </span>
                              </div>
                              {selectedDayPending.map((a) => (
                                <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                                  <ActivityItem activity={a} />
                                </motion.div>
                              ))}
                            </div>
                          )}

                          {/* Completed (collapsible) */}
                          {selectedDayCompleted.length > 0 && (
                            <div className="space-y-1.5">
                              <button
                                onClick={() => setShowCompleted(!showCompleted)}
                                className="flex items-center gap-1.5 px-1 w-full text-left"
                              >
                                <CheckCircle2 className="w-3 h-3 text-green-500" />
                                <span className="text-[11px] font-semibold text-muted-foreground">
                                  {locale === 'zh-Hans' ? `已完成 (${selectedDayCompleted.length})` : `Done (${selectedDayCompleted.length})`}
                                </span>
                                <ChevronRight className={cn('w-3 h-3 text-muted-foreground ml-auto transition-transform', showCompleted && 'rotate-90')} />
                              </button>
                              {showCompleted && selectedDayCompleted.map((a) => (
                                <motion.div key={a.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                                  <ActivityItem activity={a} />
                                </motion.div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ─── Month View ─── */}
                {viewMode === 'month' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-7 gap-1 text-center">
                      {(getWeekStartDay() === 'monday'
                        ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
                        : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                      ).map((day: string) => (
                        <div key={day} className="text-xs font-medium text-muted-foreground py-1">{day}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {getMonthDays().map((day: Date) => {
                        const dateKey = format(day, 'yyyy-MM-dd');
                        const dayActs = activitiesByDate[dateKey] || [];
                        const isCurrentMonth = isSameMonth(day, currentDate);
                        const isCurrentDay = isSameDay(day, new Date());
                        const hasOverdue = dayActs.some((a) => isOverdue(a));
                        return (
                          <div
                            key={dateKey}
                            className={cn(
                              'aspect-square p-1 rounded-lg flex flex-col items-center cursor-pointer transition-colors',
                              isCurrentDay ? 'bg-primary text-primary-foreground' :
                              hasOverdue ? 'bg-red-500/10 border border-red-500/20' :
                              isCurrentMonth ? 'bg-card/50 hover:bg-card' : 'bg-muted/30 text-muted-foreground'
                            )}
                            onClick={() => { setCurrentDate(day); setViewMode('week'); }}
                          >
                            <span className="text-xs font-medium">{format(day, 'd')}</span>
                            {dayActs.length > 0 && (
                              <div className="flex gap-0.5 mt-0.5">
                                {dayActs.slice(0, 3).map((a) => (
                                  <div key={a.id} className={cn('w-1.5 h-1.5 rounded-full', isCurrentDay ? 'bg-primary-foreground' : activityDotColors[a.type] || 'bg-muted')} />
                                ))}
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
          { id: 'log-activity', icon: Plus, label: 'Log New Activity', onClick: () => navigate('/activity-capture') },
        ]}
      />
    </MobileLayout>
  );
}
