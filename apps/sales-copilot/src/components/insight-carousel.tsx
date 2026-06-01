import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'motion/react';
import { Sparkles, RefreshCw, ExternalLink, TrendingUp, AlertTriangle, Target, Users, Calendar, Lightbulb, Play, Pause, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLocale, t, getThinkingDotStyle, type Locale, type ThinkingDotStyle } from '@/lib/i18n';
import { useNavigate } from 'react-router-dom';
import { useBusinessInsightList } from '@/generated/hooks/use-business-insight';
import type { BusinessInsight as DataverseBusinessInsight } from '@/generated/models/business-insight-model';

// Helper to check if an insight is activity-related (exported for use in home.tsx)
export function isActivityRelatedInsightUtil(insight: DataverseBusinessInsight): boolean {
  const titleLower = (insight.title || '').toLowerCase();
  const summaryLower = (insight.summary || '').toLowerCase();
  // Check if it matches follow-up/agenda/todo patterns
  const activityPatterns = [
    '跟进', '待办', '活动', 'follow-up', 'agenda', 'todo', 'task', 'activity',
    '今日跟进', 'follow up', '计划', 'schedule', '日程'
  ];
  return activityPatterns.some(pattern => 
    titleLower.includes(pattern) || summaryLower.includes(pattern)
  );
}

interface ReferenceRecord {
  id: string;
  name: string;
  type: 'opportunity' | 'client' | 'activity';
  route: string;
}
interface InsightCard {
  id: string;
  title: string;
  summary: string; // Full insight text (CSS line-clamp handles overflow)
  rationale: string; // AI explanation - displayed in details section
  icon: React.ReactNode;
  type: 'info' | 'warning' | 'success';
  references: ReferenceRecord[];
}

interface InsightCarouselProps {
  customInsightText: string[] | null;
  kpiData: {
    followUpsToday: number;
    closingThisWeek: number;
    atRiskCount: number;
    pendingFollowUpCount: number;
    performancePercent: number;
  };
  isRefreshing: boolean;
  refreshingStatus?: string;
  onRefresh: () => void;

  onViewDetails: () => void;
  // Brief Me sync props
  isVoicePlaying?: boolean;
  voiceCurrentIndex?: number;
  onCardCountReady?: (count: number) => void;
  // Optional: override business insights data
  businessInsights?: DataverseBusinessInsight[];
  // Filter out activity-related insights (they will be shown in Agenda card)
  excludeActivityInsights?: boolean;
}


export function InsightCarousel({
  customInsightText,
  kpiData,
  isRefreshing,
  refreshingStatus,
  onRefresh,

  onViewDetails,
  isVoicePlaying = false,
  voiceCurrentIndex,
  onCardCountReady,
  businessInsights: externalInsights,
  excludeActivityInsights = false,
}: InsightCarouselProps) {
  const locale: Locale = getLocale();
  const navigate = useNavigate();
  const thinkingDotStyle: ThinkingDotStyle = getThinkingDotStyle();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [mobileAutoPlay, setMobileAutoPlay] = useState(true);
  const [timerProgress, setTimerProgress] = useState(0);
  const [expandedRefs, setExpandedRefs] = useState<Record<string, boolean>>({});
  const [tabletCardWidth, setTabletCardWidth] = useState(220);
  const containerRef = useRef<HTMLDivElement>(null);
  const carouselContainerRef = useRef<HTMLDivElement>(null);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch business insights from Dataverse
  const { data: dataverseInsights = [] } = useBusinessInsightList({
    filter: 'isactive eq true',
    orderBy: ['displayorder asc'],
  });

  // Helper to check if an insight is activity-related
  const isActivityRelatedInsight = useCallback((insight: DataverseBusinessInsight): boolean => {
    const titleLower = (insight.title || '').toLowerCase();
    const summaryLower = (insight.summary || '').toLowerCase();
    // Check if it matches follow-up/agenda/todo patterns
    const activityPatterns = [
      '跟进', '待办', '活动', 'follow-up', 'agenda', 'todo', 'task', 'activity',
      '今日跟进', 'follow up', '计划', 'schedule', '日程'
    ];
    return activityPatterns.some(pattern => 
      titleLower.includes(pattern) || summaryLower.includes(pattern)
    );
  }, []);

  // Use external insights if provided, otherwise use Dataverse data (NO sample data fallback)
  // Optionally filter out activity-related insights
  const rawInsights: DataverseBusinessInsight[] = useMemo(() => {
    let insights: DataverseBusinessInsight[];
    if (externalInsights && externalInsights.length > 0) {
      insights = externalInsights;
    } else {
      // Return Dataverse insights only - no fallback to sample data
      insights = dataverseInsights;
    }
    
    // Filter out activity-related insights if excludeActivityInsights is true
    if (excludeActivityInsights) {
      insights = insights.filter((insight: DataverseBusinessInsight) => !isActivityRelatedInsight(insight));
    }
    
    return insights;
  }, [externalInsights, dataverseInsights, excludeActivityInsights, isActivityRelatedInsight]);

  // Helper function to categorize insight text and generate appropriate title/icon
  const getCategoryInfo = useCallback((text: string, idx: number): { title: string; icon: React.ReactNode; type: 'info' | 'warning' | 'success'; rationale: string } => {
    const lowerText = text.toLowerCase();
    
    // Check for follow-up/todo patterns
    if (lowerText.includes('跟进') || lowerText.includes('待办') || lowerText.includes('follow-up') || lowerText.includes('agenda') || lowerText.includes('todo')) {
      return {
        title: locale === 'zh-Hans' ? '今日跟进提醒' : 'Follow-up Alert',
        icon: <Calendar className="w-4 h-4" />,
        type: 'info',
        rationale: locale === 'zh-Hans' 
          ? '基于您的日程安排和任务到期时间，识别出今日需要跟进的关键事项。' 
          : 'Identified based on your calendar schedule and task due dates that require attention today.'
      };
    }
    
    // Check for closing/deal patterns
    if (lowerText.includes('成交') || lowerText.includes('即将') || lowerText.includes('closing') || lowerText.includes('deal') || lowerText.includes('close this week')) {
      return {
        title: locale === 'zh-Hans' ? '本周成交预测' : 'Closing This Week',
        icon: <Target className="w-4 h-4" />,
        type: 'success',
        rationale: locale === 'zh-Hans' 
          ? '分析了商机预计成交日期和当前阶段进展，筛选出本周最有可能成交的商机。' 
          : 'Analyzed opportunity close dates and current stage progress to identify deals most likely to close this week.'
      };
    }
    
    // Check for risk/warning patterns
    if (lowerText.includes('风险') || lowerText.includes('警告') || lowerText.includes('risk') || lowerText.includes('warning') || lowerText.includes('at-risk') || lowerText.includes('churn')) {
      return {
        title: locale === 'zh-Hans' ? '风险商机警告' : 'At-Risk Alert',
        icon: <AlertTriangle className="w-4 h-4" />,
        type: 'warning',
        rationale: locale === 'zh-Hans' 
          ? '检测到商机长时间无进展或信心指数下降，需要立即关注以避免流失。' 
          : 'Detected opportunities with stalled progress or declining confidence scores that need immediate attention to prevent loss.'
      };
    }
    
    // Check for revisit/inactive patterns
    if (lowerText.includes('回访') || lowerText.includes('未联系') || lowerText.includes('inactive') || lowerText.includes('revisit') || lowerText.includes('days')) {
      return {
        title: locale === 'zh-Hans' ? '待回访客户' : 'Pending Revisit',
        icon: <Users className="w-4 h-4" />,
        type: 'warning',
        rationale: locale === 'zh-Hans' 
          ? '根据客户最后联系时间分析，这些客户超过14天未有互动记录，建议尽快跟进。' 
          : 'Based on last contact date analysis, these clients have no interaction records for over 14 days and should be contacted soon.'
      };
    }
    
    // Check for performance/analysis patterns
    if (lowerText.includes('业绩') || lowerText.includes('达成') || lowerText.includes('目标') || lowerText.includes('performance') || lowerText.includes('target') || lowerText.includes('achieved')) {
      return {
        title: locale === 'zh-Hans' ? '业绩达成分析' : 'Performance Analysis',
        icon: <TrendingUp className="w-4 h-4" />,
        type: 'success',
        rationale: locale === 'zh-Hans' 
          ? '对比本周活动数据与周目标，计算当前业绩达成率和剩余差距。' 
          : 'Compared this week\'s activity data against weekly targets to calculate current achievement rate and remaining gap.'
      };
    }
    
    // Check for opportunity/pipeline patterns
    if (lowerText.includes('商机') || lowerText.includes('管道') || lowerText.includes('opportunity') || lowerText.includes('pipeline')) {
      return {
        title: locale === 'zh-Hans' ? '商机动态' : 'Opportunity Update',
        icon: <Target className="w-4 h-4" />,
        type: 'info',
        rationale: locale === 'zh-Hans' 
          ? '汇总分析了销售管道中各阶段商机的数量和金额分布情况。' 
          : 'Aggregated and analyzed the quantity and value distribution of opportunities across pipeline stages.'
      };
    }
    
    // Check for client/customer patterns
    if (lowerText.includes('客户') || lowerText.includes('client') || lowerText.includes('customer') || lowerText.includes('account')) {
      return {
        title: locale === 'zh-Hans' ? '客户洞察' : 'Client Insight',
        icon: <Users className="w-4 h-4" />,
        type: 'info',
        rationale: locale === 'zh-Hans' 
          ? '基于客户互动频率和业务价值综合评估，识别需要重点维护的客户。' 
          : 'Based on comprehensive assessment of client interaction frequency and business value to identify key accounts requiring attention.'
      };
    }
    
    // Default fallback with numbered index
    return {
      title: locale === 'zh-Hans' ? `智能洞察 #${idx + 1}` : `Smart Insight #${idx + 1}`,
      icon: <Lightbulb className="w-4 h-4" />,
      type: 'info',
      rationale: locale === 'zh-Hans' 
        ? '综合分析您的销售数据、客户互动和商机进展生成的个性化建议。' 
        : 'Personalized recommendation generated from comprehensive analysis of your sales data, client interactions, and opportunity progress.'
    };
  }, [locale]);

  // Convert business insights to InsightCard format
  const insightCards: InsightCard[] = useMemo(() => {
    // If custom text is provided (from AI generation), use that
    if (customInsightText && customInsightText.length > 0) {
      return customInsightText.map((text: string, idx: number) => {
        const categoryInfo = getCategoryInfo(text, idx);
        return {
          id: `custom-${idx}`,
          title: categoryInfo.title,
          summary: text,
          rationale: categoryInfo.rationale,
          icon: categoryInfo.icon,
          type: categoryInfo.type,
          references: [],
        };
      });
    }

    // Convert Dataverse business insights to InsightCard format
    return rawInsights.map((insight: DataverseBusinessInsight) => {
      // Parse JSON fields
      let details: string[] = [];
      let referenceIds: string[] = [];
      try {
        details = JSON.parse(insight.detailsjson || '[]');
        referenceIds = JSON.parse(insight.referenceidsjson || '[]');
      } catch {
        // Keep empty arrays if parsing fails
      }

      // Determine the icon based on type
      const getIcon = () => {
        switch (insight.type) {
          case 'warning': return <AlertTriangle className="w-4 h-4" />;
          case 'success': return <TrendingUp className="w-4 h-4" />;
          default: return <Users className="w-4 h-4" />;
        }
      };

      // Map type to InsightCard type
      const cardType: 'info' | 'warning' | 'success' = insight.type === 'warning' ? 'warning' : insight.type === 'success' ? 'success' : 'info';

      // Build references from IDs
      const isClientRef = insight.referenceType === 'client';
      const references: ReferenceRecord[] = referenceIds.map((id: string) => ({
        id,
        name: id, // In real usage, you'd resolve this to a name
        type: isClientRef ? 'client' as const : 'opportunity' as const,
        route: isClientRef ? `/accounts/${id}` : `/opportunities/${id}`,
      }));

      // Use rationale from Dataverse if available, otherwise fall back to category-based rationale
      const fallbackRationale = getCategoryInfo(details.join(' ') || insight.summary || insight.title, 0).rationale;
      
      return {
        id: insight.id,
        title: insight.title,
        summary: insight.summary || (details.length > 0 ? details[0] : ''),
        rationale: insight.rationale && insight.rationale.trim() ? insight.rationale : fallbackRationale,
        icon: getIcon(),
        type: cardType,
        references,
      };
    });
  }, [customInsightText, rawInsights, locale, getCategoryInfo]);

  // Check if mobile or tablet and calculate tablet card width based on actual container
  useEffect(() => {
    const calculateLayout = () => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      setIsTablet(width >= 768 && width < 1024);
      
      // For tablet mode, measure actual container width and calculate card size for exactly 3 cards
      if (width >= 768 && width < 1024 && carouselContainerRef.current) {
        const containerWidth = carouselContainerRef.current.offsetWidth;
        const gap = 16; // gap-4 = 16px
        const totalGaps = 2 * gap; // 2 gaps between 3 cards
        const cardWidth = (containerWidth - totalGaps) / 3;
        setTabletCardWidth(Math.floor(cardWidth));
      }
    };
    
    // Initial calculation with a small delay to ensure DOM is ready
    const timer = setTimeout(calculateLayout, 50);
    
    window.addEventListener('resize', calculateLayout);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', calculateLayout);
    };
  }, []);

  // Notify parent of card count when it changes
  useEffect(() => {
    onCardCountReady?.(insightCards.length);
  }, [insightCards.length, onCardCountReady]);

  // Reset currentIndex when insightCards changes and current index is out of bounds
  useEffect(() => {
    if (insightCards.length === 0) {
      setCurrentIndex(0);
    } else if (currentIndex >= insightCards.length) {
      setCurrentIndex(Math.max(0, insightCards.length - 1));
    }
  }, [insightCards.length, currentIndex]);

  // Sync with voice player index when Brief Me is playing
  useEffect(() => {
    if (isVoicePlaying && voiceCurrentIndex !== undefined) {
      setCurrentIndex(voiceCurrentIndex);
    }
  }, [isVoicePlaying, voiceCurrentIndex]);

  // Auto-play for mobile (10 seconds) - disabled when voice is playing
  useEffect(() => {
    // Clear existing timers
    if (autoPlayRef.current) {
      clearInterval(autoPlayRef.current);
      autoPlayRef.current = null;
    }
    if (progressRef.current) {
      clearInterval(progressRef.current);
      progressRef.current = null;
    }

    if (!isMobile || isVoicePlaying || !mobileAutoPlay) {
      setTimerProgress(0);
      return;
    }
    
    // Reset progress when card changes
    setTimerProgress(0);
    const duration = 10000; // 10 seconds
    const updateInterval = 50; // Update every 50ms for smooth animation
    
    // Progress timer
    progressRef.current = setInterval(() => {
      setTimerProgress((prev: number) => {
        const next = prev + (updateInterval / duration) * 100;
        return next >= 100 ? 100 : next;
      });
    }, updateInterval);
    
    // Auto-advance timer
    autoPlayRef.current = setInterval(() => {
      setCurrentIndex((prev: number) => (prev + 1) % insightCards.length);
      setTimerProgress(0);
    }, duration);

    return () => {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
      }
      if (progressRef.current) {
        clearInterval(progressRef.current);
      }
    };
  }, [isMobile, isVoicePlaying, mobileAutoPlay, insightCards.length, currentIndex]);

  // Auto-play for desktop (6 seconds) - disabled when voice is playing
  useEffect(() => {
    if (isMobile || isVoicePlaying) return;
    
    autoPlayRef.current = setInterval(() => {
      setCurrentIndex((prev: number) => (prev + 1) % insightCards.length);
    }, 6000);

    return () => {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
      }
    };
  }, [isMobile, isVoicePlaying, insightCards.length]);

  // Handle swipe (mobile and tablet)
  const handleDragEnd = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 50;
    const velocity = 300;

    if (info.offset.x < -threshold || info.velocity.x < -velocity) {
      // Swipe left - next card(s)
      if (isTablet) {
        // On tablet, advance by 3 cards (visible count)
        setCurrentIndex((prev: number) => Math.min(prev + 3, Math.max(0, insightCards.length - 3)));
      } else {
        setCurrentIndex((prev: number) => Math.min(prev + 1, insightCards.length - 1));
      }
    } else if (info.offset.x > threshold || info.velocity.x > velocity) {
      // Swipe right - previous card(s)
      if (isTablet) {
        setCurrentIndex((prev: number) => Math.max(prev - 3, 0));
      } else {
        setCurrentIndex((prev: number) => Math.max(prev - 1, 0));
      }
    }
  }, [insightCards.length, isTablet]);

  // Handle reference click
  const handleReferenceClick = (e: React.MouseEvent, route: string) => {
    e.stopPropagation();
    navigate(route);
  };

  // Type color mapping
  const typeColors = {
    info: 'bg-blue-500/10 border-blue-500/20',
    warning: 'bg-amber-500/10 border-amber-500/20',
    success: 'bg-emerald-500/10 border-emerald-500/20',
  };

  const typeIconBg = {
    info: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
    warning: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
    success: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
  };

  const typeTextColors = {
    info: 'text-blue-600 dark:text-blue-400',
    warning: 'text-amber-600 dark:text-amber-400',
    success: 'text-emerald-600 dark:text-emerald-400',
  };

  // Toggle reference expansion for a specific card
  const toggleRefsExpanded = (cardId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedRefs((prev: Record<string, boolean>) => ({ ...prev, [cardId]: !prev[cardId] }));
  };

  // Render a single card content
  const renderCardContent = (card: InsightCard, isActive: boolean = true) => {
    const isExpanded = expandedRefs[card.id] || false;
    
    return (
      <div className="flex flex-col h-full relative">
        {/* AI Generated Icon - Top Right */}
        <div className="absolute top-0 right-0">
          <Sparkles className="w-4 h-4 text-primary/60" />
        </div>

        {/* Card Header */}
        <div className="flex items-start gap-3 mb-2 pr-6">
          <div className={cn('p-2 rounded-lg flex-shrink-0', typeIconBg[card.type])}>
            {card.icon}
          </div>
          <div className="flex-1 min-w-0">
            {/* Category Title */}
            <h4 className={cn('text-sm font-semibold', typeTextColors[card.type])}>{card.title}</h4>
            {/* Summary — full text, CSS line-clamp limits visible lines */}
            <p className="text-sm text-foreground mt-0.5 leading-relaxed line-clamp-2">{card.summary}</p>
          </div>
        </div>

        {/* Details - AI Rationale displayed as bullet points */}
        <div className="mb-3 flex-1">
          <div className="text-xs leading-relaxed space-y-1.5">
            {card.rationale.split(/[。\.]/g).filter((line: string) => line.trim()).map((line: string, i: number) => (
              <p key={i} className="text-foreground/80 pl-4 relative before:content-[''] before:absolute before:left-0 before:top-[0.55em] before:w-1.5 before:h-1.5 before:rounded-full before:bg-muted-foreground/50">
                {line.trim()}
              </p>
            ))}
          </div>
        </div>

        {/* Reference Records - Collapsible */}
        {card.references.length > 0 && isActive && (
          <div className="pt-2 border-t border-border/50">
            <button
              onClick={(e: React.MouseEvent) => toggleRefsExpanded(card.id, e)}
              className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              <span>{locale === 'zh-Hans' ? '相关记录' : 'References'}</span>
              <span className="text-muted-foreground/60">({card.references.length})</span>
              {isExpanded ? (
                <ChevronUp className="w-3 h-3 ml-auto" />
              ) : (
                <ChevronDown className="w-3 h-3 ml-auto" />
              )}
            </button>
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' as const }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {card.references.slice(0, 3).map((ref: ReferenceRecord) => (
                      <button
                        key={ref.id}
                        onClick={(e: React.MouseEvent) => handleReferenceClick(e, ref.route)}
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px]',
                          'bg-muted/50 hover:bg-muted text-foreground',
                          'transition-colors cursor-pointer group'
                        )}
                      >
                        <span>{ref.name}</span>
                        <ExternalLink className="w-3 h-3 opacity-50 group-hover:opacity-100 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <p className="text-base font-bold text-foreground">
          {t('dailyBriefing', locale)}
        </p>
        <div className="flex items-center gap-1">

          {isRefreshing ? (
            <div className="flex items-center gap-2 px-2 py-1">
              {/* Thinking dots based on user preference */}
              {thinkingDotStyle === 'bounce' && (
                <div className="flex items-center gap-0.5">
                  <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.5, repeat: Infinity, delay: 0 }} />
                  <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.5, repeat: Infinity, delay: 0.1 }} />
                  <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.5, repeat: Infinity, delay: 0.2 }} />
                </div>
              )}
              {thinkingDotStyle === 'pulse' && (
                <div className="flex items-center gap-0.5">
                  <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0 }} />
                  <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0.15 }} />
                  <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0.3 }} />
                </div>
              )}
              {thinkingDotStyle === 'wave' && (
                <div className="flex items-center gap-0.5">
                  <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ y: [0, -3, 0, 3, 0] }} transition={{ duration: 1, repeat: Infinity, delay: 0, ease: 'easeInOut' as const }} />
                  <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ y: [0, -3, 0, 3, 0] }} transition={{ duration: 1, repeat: Infinity, delay: 0.15, ease: 'easeInOut' as const }} />
                  <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ y: [0, -3, 0, 3, 0] }} transition={{ duration: 1, repeat: Infinity, delay: 0.3, ease: 'easeInOut' as const }} />
                </div>
              )}
              {thinkingDotStyle === 'fade' && (
                <div className="flex items-center gap-0.5">
                  <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0 }} />
                  <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.25 }} />
                  <motion.span className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.5 }} />
                </div>
              )}
              {thinkingDotStyle === 'orbit' && (
                <div className="relative w-4 h-4 flex items-center justify-center">
                  <span className="absolute w-1 h-1 bg-primary/30 rounded-full" />
                  <motion.span
                    className="absolute w-1 h-1 bg-primary rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' as const }}
                    style={{ transformOrigin: 'center center', x: 4 }}
                  />
                </div>
              )}
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {refreshingStatus || (locale === 'zh-Hans' ? '正在分析...' : 'Analyzing...')}
              </span>
            </div>
          ) : (
            <button
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onRefresh();
              }}
              className={cn(
                'w-7 h-7 flex items-center justify-center rounded-full',
                'hover:bg-muted/50 active:bg-muted transition-colors'
              )}
              aria-label={locale === 'zh-Hans' ? '刷新洞察' : 'Refresh insight'}
            >
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Carousel Container */}
      <div ref={containerRef} className="relative">
        {/* Empty State - No insights yet */}
        {insightCards.length === 0 ? (
          <div className="p-6 rounded-2xl border glass-card min-h-[200px] flex flex-col items-center justify-center text-center">
            <Sparkles className="w-8 h-8 text-primary/60 mb-3" />
            <h4 className="text-base font-semibold text-foreground mb-1">
              {locale === 'zh-Hans' ? '暂无商机洞察' : 'No Business Insights Yet'}
            </h4>
            <p className="text-sm text-muted-foreground mb-4 max-w-[280px]">
              {locale === 'zh-Hans'
                ? '点击右上角刷新按钮，使用 AI 生成今日商机洞察'
                : 'Click the refresh button above to generate AI-powered business insights'}
            </p>
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 rounded-lg',
                'bg-primary text-primary-foreground text-sm font-medium',
                'hover:bg-primary/90 active:scale-95 transition-all',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
              {locale === 'zh-Hans' ? '生成洞察' : 'Generate Insights'}
            </button>
          </div>
        ) : isMobile ? (
          <div ref={carouselContainerRef} className="overflow-hidden">
            <motion.div
              className="relative"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragEnd={handleDragEnd}
              style={{ touchAction: 'pan-y' }}
            >
              <AnimatePresence mode="wait">
                {insightCards[currentIndex] && (
                  <motion.div
                    key={currentIndex}
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] as const }}
                    className={cn(
                      'p-4 rounded-2xl border',
                      'glass-card min-h-[200px]',
                      typeColors[insightCards[currentIndex].type]
                    )}
                  >
                    {renderCardContent(insightCards[currentIndex])}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Mobile Dots with Play/Pause */}
            <div className="flex items-center justify-center gap-2 mt-3">
              {/* Play/Pause button with progress ring */}
              <button
                onClick={() => setMobileAutoPlay((prev: boolean) => !prev)}
                className="relative w-6 h-6 flex items-center justify-center"
                aria-label={mobileAutoPlay ? 'Pause auto-scroll' : 'Play auto-scroll'}
              >
                {/* Background circle */}
                <svg className="absolute inset-0 w-6 h-6 -rotate-90">
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-primary/20"
                  />
                  {/* Progress arc */}
                  {mobileAutoPlay && (
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      className="text-primary transition-all duration-100"
                      strokeDasharray={`${2 * Math.PI * 10}`}
                      strokeDashoffset={`${2 * Math.PI * 10 * (1 - timerProgress / 100)}`}
                    />
                  )}
                </svg>
                {/* Icon */}
                <span className="relative z-10">
                  {mobileAutoPlay ? (
                    <Pause className="w-2.5 h-2.5 text-primary" />
                  ) : (
                    <Play className="w-2.5 h-2.5 text-primary ml-0.5" />
                  )}
                </span>
              </button>
              {/* Dots */}
              <div className="flex gap-1.5">
                {insightCards.map((_: InsightCard, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentIndex(idx)}
                    className={cn(
                      'w-2 h-2 rounded-full transition-all duration-300',
                      idx === currentIndex
                        ? 'bg-primary w-4'
                        : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                    )}
                    aria-label={`Go to insight ${idx + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : isTablet ? (
          /* Tablet: Swipeable 3-card gallery with snap behavior */
          <div ref={carouselContainerRef} className="overflow-hidden">
            <motion.div
              className="relative"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.15}
              onDragEnd={handleDragEnd}
              style={{ touchAction: 'pan-y' }}
            >
              <motion.div
                className="flex gap-4"
                animate={{ x: -currentIndex * (tabletCardWidth + 16) }}
                transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const }}
              >
                {insightCards.map((card: InsightCard, idx: number) => (
                  <motion.div
                    key={card.id}
                    className={cn(
                      'flex-shrink-0 p-4 rounded-xl border',
                      'glass-card transition-all duration-300',
                      'min-h-[320px]',
                      idx >= currentIndex && idx < currentIndex + 3
                        ? 'opacity-100 shadow-lg'
                        : 'opacity-40',
                      typeColors[card.type]
                    )}
                    style={{ width: tabletCardWidth }}
                    onClick={() => setCurrentIndex(Math.floor(idx / 3) * 3)}
                  >
                    <div className="flex flex-col h-full overflow-y-auto scrollbar-hide">
                      {renderCardContent(card, idx >= currentIndex && idx < currentIndex + 3)}
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>

            {/* Tablet Indicator Dots - one per group of 3 */}
            <div className="flex justify-center gap-1.5 mt-3">
              {Array.from({ length: Math.ceil(insightCards.length / 3) }).map((_: unknown, idx: number) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx * 3)}
                  className={cn(
                    'w-2 h-2 rounded-full transition-all duration-300',
                    Math.floor(currentIndex / 3) === idx
                      ? 'bg-primary w-4'
                      : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                  )}
                  aria-label={`Go to insight group ${idx + 1}`}
                />
              ))}
            </div>
          </div>
        ) : (
          /* Desktop/Tablet: Horizontal card gallery with flexible sizing */
          <div className="relative">
            {/* Cards flex container - tablet shows ~3 cards, desktop scrolls */}
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
              {insightCards.map((card: InsightCard, idx: number) => (
                <motion.div
                  key={card.id}
                  className={cn(
                    'flex-shrink-0 p-4 rounded-xl border',
                    'glass-card transition-all duration-300',
                    'min-w-[220px] max-w-[280px] min-h-[320px]',
                    idx === currentIndex
                      ? 'shadow-lg'
                      : 'opacity-60 hover:opacity-90',
                    typeColors[card.type]
                  )}
                  style={{ flex: '1 1 220px' }}
                  onClick={() => setCurrentIndex(idx)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex flex-col h-full overflow-y-auto scrollbar-hide">
                    {renderCardContent(card, idx === currentIndex)}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Desktop Indicator Dots */}
            <div className="flex justify-center gap-1.5 mt-3">
              {insightCards.map((_: InsightCard, idx: number) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={cn(
                    'w-2 h-2 rounded-full transition-all duration-300',
                    idx === currentIndex
                      ? 'bg-primary w-4'
                      : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                  )}
                  aria-label={`Go to insight ${idx + 1}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
