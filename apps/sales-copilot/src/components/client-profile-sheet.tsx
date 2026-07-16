import { useMemo, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Building2,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  ListChecks,
  BarChart3,
  AlertTriangle,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { GlassCard } from '@/components/glass-card';
import { useAccount } from '@/generated/hooks/use-account';
import { useActivityList } from '@/generated/hooks/use-activity';
import { useOpportunityList } from '@/generated/hooks/use-opportunity';
import type { Activity } from '@/generated/models/activity-model';
import type { Opportunity } from '@/generated/models/opportunity-model';
import { getLocale, t } from '@/lib/i18n';

interface ClientProfileSheetProps {
  accountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const stageProgress: Record<string, number> = {
  prospecting: 10,
  qualification: 30,
  proposal: 50,
  negotiation: 75,
  won: 100,
  lost: 0,
};

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatCurrency(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

export function ClientProfileSheet({ accountId, open, onOpenChange }: ClientProfileSheetProps) {
  const [currentScreen, setCurrentScreen] = useState(0);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const dragStartX = useRef<number>(0);
  const locale = getLocale();

  const { data: account } = useAccount(accountId);
  const { data: allActivities = [] } = useActivityList();
  const { data: allOpportunities = [] } = useOpportunityList();

  // Filter activities for this account - visits only, sorted by date desc
  const recentVisits = useMemo(() => {
    return allActivities
      .filter((a: Activity) => a.account?.id === accountId)
      .filter((a: Activity) => {
        const typeLabel = a.type;
        return typeLabel === 'visit' || typeLabel === 'meeting' || typeLabel === 'call';
      })
      .sort((a: Activity, b: Activity) => 
        new Date(b.scheduleddate).getTime() - new Date(a.scheduleddate).getTime()
      )
      .slice(0, 3);
  }, [allActivities, accountId]);

  // Get open opportunities
  const openOpportunities = useMemo(() => {
    return allOpportunities
      .filter((o: Opportunity) => o.account?.id === accountId)
      .filter((o: Opportunity) => o.stage !== 'won' && o.stage !== 'lost')
      .sort((a: Opportunity, b: Opportunity) => (b.totalamount || 0) - (a.totalamount || 0))
      .slice(0, 3);
  }, [allOpportunities, accountId]);

  // Extract follow-up actions from recent activities
  const followUpActions = useMemo(() => {
    const actions: { id: string; text: string; date: string; completed: boolean }[] = [];
    
    allActivities
      .filter((a: Activity) => a.account?.id === accountId)
      .sort((a: Activity, b: Activity) => 
        new Date(b.scheduleddate).getTime() - new Date(a.scheduleddate).getTime()
      )
      .slice(0, 5)
      .forEach((activity: Activity) => {
        const statusLabel = activity.status;
        const isCompleted = statusLabel === 'completed';
        
        // Extract action items from notes or use title
        if (activity.notes) {
          actions.push({
            id: activity.id,
            text: activity.notes.length > 60 ? activity.notes.slice(0, 60) + '...' : activity.notes,
            date: activity.scheduleddate,
            completed: isCompleted,
          });
        } else {
          actions.push({
            id: activity.id,
            text: activity.title,
            date: activity.scheduleddate,
            completed: isCompleted,
          });
        }
      });
    
    return actions.slice(0, 4);
  }, [allActivities, accountId]);

  // Procurement trends - derive from opportunity data (last 6 months)
  const procurementTrends = useMemo(() => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const recentOpps = allOpportunities
      .filter((o: Opportunity) => o.account?.id === accountId)
      .filter((o: Opportunity) => {
        const createDate = o.createdon ? new Date(o.createdon) : null;
        return createDate && createDate >= sixMonthsAgo;
      });
    
    // Group by category (using opportunity name patterns)
    const categories: Record<string, { count: number; value: number }> = {};
    recentOpps.forEach((opp: Opportunity) => {
      const name = opp.name1 || 'Other';
      // Extract category from name (simplified)
      let category = 'Other';
      if (name.toLowerCase().includes('platform') || name.toLowerCase().includes('system')) {
        category = 'Platform/System';
      } else if (name.toLowerCase().includes('license') || name.toLowerCase().includes('suite')) {
        category = 'License/Suite';
      } else if (name.toLowerCase().includes('service') || name.toLowerCase().includes('support')) {
        category = 'Services';
      } else if (name.toLowerCase().includes('analytics') || name.toLowerCase().includes('data')) {
        category = 'Analytics/Data';
      } else if (name.toLowerCase().includes('automation') || name.toLowerCase().includes('integration')) {
        category = 'Automation';
      }
      
      if (!categories[category]) {
        categories[category] = { count: 0, value: 0 };
      }
      categories[category].count++;
      categories[category].value += opp.totalamount || 0;
    });
    
    return Object.entries(categories)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 4);
  }, [allOpportunities, accountId]);

  const totalProcurementValue = procurementTrends.reduce((sum, t) => sum + t.value, 0);

  // Navigation
  const goBack = () => {
    if (currentScreen > 0) {
      setSwipeDirection('right');
      setCurrentScreen(currentScreen - 1);
    }
  };

  const goForward = () => {
    if (currentScreen < 2) {
      setSwipeDirection('left');
      setCurrentScreen(currentScreen + 1);
    }
  };

  const handleDragStart = (e: React.PointerEvent) => {
    dragStartX.current = e.clientX;
  };

  const handleDragEnd = (e: React.PointerEvent) => {
    const diff = dragStartX.current - e.clientX;
    const threshold = 50;

    if (diff > threshold && currentScreen < 2) {
      goForward();
    } else if (diff < -threshold && currentScreen > 0) {
      goBack();
    }
  };

  const screenTitles = [
    t('visitSummary', locale),
    t('opportunityProgress', locale),
    t('actionsProcurement', locale),
  ];

  if (!account) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl px-0 pb-0">
        <SheetHeader className="px-5 pb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center flex-shrink-0">
              <Building2 className="w-6 h-6 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-left text-lg truncate">{account.name1}</SheetTitle>
              <p className="text-xs text-muted-foreground">
                {account.industry || 'Uncategorized'}
              </p>
            </div>
          </div>
        </SheetHeader>

        {/* Screen Indicator */}
        <div className="flex items-center justify-center gap-2 py-3 border-b border-border/30">
          <button 
            onClick={goBack}
            disabled={currentScreen === 0}
            className="p-1 rounded-full hover:bg-muted disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-2">
            {[0, 1, 2].map((idx: number) => (
              <button
                key={idx}
                onClick={() => {
                  setSwipeDirection(idx > currentScreen ? 'left' : 'right');
                  setCurrentScreen(idx);
                }}
                className={`w-2 h-2 rounded-full transition-all ${
                  idx === currentScreen 
                    ? 'bg-primary w-6' 
                    : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                }`}
              />
            ))}
          </div>
          
          <button 
            onClick={goForward}
            disabled={currentScreen === 2}
            className="p-1 rounded-full hover:bg-muted disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Screen Title */}
        <div className="px-5 py-3">
          <h3 className="text-sm font-semibold text-foreground">
            {screenTitles[currentScreen]}
          </h3>
        </div>

        {/* Swipeable Content */}
        <div
          className="flex-1 overflow-y-auto px-5 pb-8 touch-pan-x"
          onPointerDown={handleDragStart}
          onPointerUp={handleDragEnd}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentScreen}
              initial={{ opacity: 0, x: swipeDirection === 'left' ? 100 : swipeDirection === 'right' ? -100 : 0 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: swipeDirection === 'left' ? -100 : swipeDirection === 'right' ? 100 : 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' as const }}
              className="space-y-4"
            >
              {/* Screen 1: Recent Visits Summary */}
              {currentScreen === 0 && (
                <>
                  {recentVisits.length === 0 ? (
                    <div className="text-center py-12">
                      <Calendar className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">
                        {t('noVisitsRecorded', locale)}
                      </p>
                    </div>
                  ) : (
                    recentVisits.map((activity: Activity, index: number) => {
                      const typeLabel = activity.type;
                      const statusLabel = activity.status;
                      const isCompleted = statusLabel === 'completed';
                      
                      return (
                        <GlassCard key={activity.id} className="space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                {typeLabel === 'visit' ? (
                                  <MapPin className="w-4 h-4 text-primary" />
                                ) : typeLabel === 'meeting' ? (
                                  <Calendar className="w-4 h-4 text-primary" />
                                ) : (
                                  <Phone className="w-4 h-4 text-primary" />
                                )}
                              </div>
                              <div>
                                <h4 className="text-sm font-medium text-foreground">
                                  {activity.title}
                                </h4>
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(activity.scheduleddate)} • {typeLabel}
                                </p>
                              </div>
                            </div>
                            <Badge 
                              variant={isCompleted ? 'secondary' : 'outline'}
                              className="text-[10px]"
                            >
                              {isCompleted ? '✓' : '○'} {statusLabel}
                            </Badge>
                          </div>
                          
                          {activity.notes && (
                            <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2 leading-relaxed">
                              {activity.notes}
                            </p>
                          )}
                          
                          {activity.opportunity && (
                            <div className="flex items-center gap-1 text-xs text-primary">
                              <Target className="w-3 h-3" />
                              <span>{activity.opportunity.name1}</span>
                            </div>
                          )}
                        </GlassCard>
                      );
                    })
                  )}
                </>
              )}

              {/* Screen 2: Open Opportunities Progress */}
              {currentScreen === 1 && (
                <>
                  {openOpportunities.length === 0 ? (
                    <div className="text-center py-12">
                      <Target className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">
                        {t('noOpenOpportunities', locale)}
                      </p>
                    </div>
                  ) : (
                    openOpportunities.map((opp: Opportunity) => {
                      const progress = stageProgress[opp.stage as string] || 0;
                      const stageLabel = opp.stage;
                      const trend = opp.confidenceTrend;
                      const TrendIcon = trend === 'up' 
                        ? TrendingUp 
                        : trend === 'down' 
                          ? TrendingDown 
                          : Minus;
                      const trendColor = trend === 'up'
                        ? 'text-emerald-500'
                        : trend === 'down'
                          ? 'text-rose-500'
                          : 'text-muted-foreground';
                      
                      return (
                        <GlassCard key={opp.id} className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-medium text-foreground truncate">
                                {opp.name1}
                              </h4>
                              <p className="text-lg font-bold text-foreground">
                                {formatCurrency(opp.totalamount || 0)}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <TrendIcon className={`w-4 h-4 ${trendColor}`} />
                              <span className="text-sm font-medium text-foreground">
                                {opp.confidence}%
                              </span>
                            </div>
                          </div>
                          
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{stageLabel}</span>
                              <span className="text-muted-foreground">
                                {t('closeLabel', locale)}: {formatDate(opp.expectedclosedate)}
                              </span>
                            </div>
                            <Progress value={progress} className="h-2" />
                          </div>
                          
                          {opp.blocker && (
                            <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2">
                              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                              <span>{opp.blocker}</span>
                            </div>
                          )}
                          
                          {opp.lastaction && (
                            <p className="text-xs text-muted-foreground">
                              <span className="font-medium">{t('lastActionShort', locale)}:</span> {opp.lastaction}
                            </p>
                          )}
                        </GlassCard>
                      );
                    })
                  )}
                </>
              )}

              {/* Screen 3: Follow-up Actions & Procurement Trends */}
              {currentScreen === 2 && (
                <>
                  {/* Follow-up Actions */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <ListChecks className="w-4 h-4 text-primary" />
                      <span>{t('followUpActions', locale)}</span>
                    </div>
                    
                    {followUpActions.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">
                        {t('noFollowUpActions', locale)}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {followUpActions.map((action) => (
                          <div 
                            key={action.id}
                            className={`flex items-start gap-3 p-3 rounded-xl ${
                              action.completed 
                                ? 'bg-muted/30' 
                                : 'bg-card border border-border/50'
                            }`}
                          >
                            <div className={`mt-0.5 ${
                              action.completed ? 'text-emerald-500' : 'text-muted-foreground'
                            }`}>
                              {action.completed ? (
                                <CheckCircle2 className="w-4 h-4" />
                              ) : (
                                <Clock className="w-4 h-4" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm ${
                                action.completed 
                                  ? 'text-muted-foreground line-through' 
                                  : 'text-foreground'
                              }`}>
                                {action.text}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {formatDate(action.date)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Procurement Trends */}
                  <div className="space-y-3 pt-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <BarChart3 className="w-4 h-4 text-primary" />
                      <span>
                        {t('procurementTrends', locale)}
                      </span>
                    </div>
                    
                    {procurementTrends.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">
                        {t('noProcurementData', locale)}
                      </p>
                    ) : (
                      <GlassCard className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {t('totalValue', locale)}
                          </span>
                          <span className="text-lg font-bold text-foreground">
                            {formatCurrency(totalProcurementValue)}
                          </span>
                        </div>
                        
                        <div className="space-y-2">
                          {procurementTrends.map((trend) => {
                            const percentage = totalProcurementValue > 0 
                              ? (trend.value / totalProcurementValue) * 100 
                              : 0;
                            
                            return (
                              <div key={trend.name} className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-foreground">{trend.name}</span>
                                  <span className="text-muted-foreground">
                                    {formatCurrency(trend.value)} ({trend.count})
                                  </span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <motion.div
                                    className="h-full bg-primary rounded-full"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${percentage}%` }}
                                    transition={{ duration: 0.5, delay: 0.1 }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </GlassCard>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </SheetContent>
    </Sheet>
  );
}
