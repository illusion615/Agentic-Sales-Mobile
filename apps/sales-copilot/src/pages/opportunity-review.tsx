import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, MoreHorizontal, AlertTriangle, TrendingUp, TrendingDown, Minus, Clock, Sparkles, RefreshCw, Loader2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOpportunityList } from '@/generated/hooks/use-opportunity';
import { useUser } from '@/hooks/use-user';
import { getLocale, t, pickLabel, type Locale } from '@/lib/i18n';
import { useFirstMount } from '@/hooks/use-first-mount';
import type { Opportunity } from '@/generated/models/opportunity-model';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
} as const;

const stageConfig: Record<string, { zh: string; en: string; de: string; fr: string; es: string; color: string; bgLight: string }> = {
  prospecting: { zh: '探索', en: 'Prospecting', de: 'Akquise', fr: 'Prospection', es: 'Prospección', color: 'bg-blue-500', bgLight: 'bg-blue-500/20' },
  qualification: { zh: '资质', en: 'Qualification', de: 'Qualifizierung', fr: 'Qualification', es: 'Calificación', color: 'bg-cyan-500', bgLight: 'bg-cyan-500/20' },
  proposal: { zh: '方案', en: 'Proposal', de: 'Angebot', fr: 'Proposition', es: 'Propuesta', color: 'bg-amber-500', bgLight: 'bg-amber-500/20' },
  negotiation: { zh: '谈判', en: 'Negotiation', de: 'Verhandlung', fr: 'Négociation', es: 'Negociación', color: 'bg-purple-500', bgLight: 'bg-purple-500/20' },
  won: { zh: '赢单', en: 'Won', de: 'Gewonnen', fr: 'Gagné', es: 'Ganada', color: 'bg-green-500', bgLight: 'bg-green-500/20' },
  lost: { zh: '丢单', en: 'Lost', de: 'Verloren', fr: 'Perdu', es: 'Perdida', color: 'bg-red-500', bgLight: 'bg-red-500/20' },
};

function isClosedStage(stage: string): boolean {
  return stage === 'won' || stage === 'lost';
}

function getDaysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDaysUntil(days: number, locale: Locale): string {
  if (days < 0) return t('overdueDays', locale, { days: Math.abs(days) });
  if (days === 0) return t('today', locale);
  if (days === 1) return t('tomorrow', locale);
  return t('inDays', locale, { days });
}

/** Determines if an opportunity needs urgent attention */
function needsAction(opp: Opportunity): boolean {
  if ((opp.confidence ?? 100) < 50) return true;
  if (opp.blocker) return true;
  if (opp.expectedclosedate) {
    const days = getDaysUntil(opp.expectedclosedate);
    if (days <= 30) return true;
  }
  return false;
}

/** Sort by urgency: overdue first, then soonest close date, then lowest confidence */
function sortByUrgency(a: Opportunity, b: Opportunity): number {
  const daysA = a.expectedclosedate ? getDaysUntil(a.expectedclosedate) : 999;
  const daysB = b.expectedclosedate ? getDaysUntil(b.expectedclosedate) : 999;
  if (daysA !== daysB) return daysA - daysB;
  return (a.confidence ?? 100) - (b.confidence ?? 100);
}

const TrendIcon = ({ trend }: { trend?: string }) => {
  if (trend === 'up') return <TrendingUp className="w-3 h-3 text-green-500" />;
  if (trend === 'down') return <TrendingDown className="w-3 h-3 text-red-500" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
};

// ─── AI Summary types ───
interface AISummarySlide {
  title: string;
  content: string;
}

const AI_SUMMARY_CACHE_KEY = 'opp-review-ai-summary';
const AI_SUMMARY_TTL = 30 * 60 * 1000; // 30 minutes

export default function OpportunityReviewPage() {
  const navigate = useNavigate();
  const locale: Locale = getLocale();
  const firstMount = useFirstMount('opportunity-review');
  const { data: opportunities = [] } = useOpportunityList();
  const { data: user } = useUser();

  // Reads are already security-trimmed by Dataverse to the opportunities this
  // user can access — no client-side owner filter.
  const activeOpps = useMemo(() =>
    opportunities
      .filter((o: Opportunity) => !isClosedStage(o.stage))
      .sort(sortByUrgency),
    [opportunities]
  );

  const actionRequired = useMemo(() => activeOpps.filter(needsAction), [activeOpps]);
  const onTrack = useMemo(() => activeOpps.filter((o) => !needsAction(o)), [activeOpps]);

  // Stage distribution
  const stageDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of activeOpps) {
      counts[o.stage] = (counts[o.stage] || 0) + 1;
    }
    return Object.entries(counts).map(([stage, count]) => ({
      stage,
      count,
      pct: activeOpps.length > 0 ? (count / activeOpps.length) * 100 : 0,
    }));
  }, [activeOpps]);

  // ─── AI Summary Carousel ───
  const [aiSlides, setAiSlides] = useState<AISummarySlide[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  const totalPipeline = activeOpps.reduce((s, o) => s + (o.totalamount || 0), 0);
  const atRiskCount = activeOpps.filter((o) => (o.confidence ?? 100) < 50).length;

  const generateAISummary = useCallback(async () => {
    if (activeOpps.length === 0) return;
    setAiLoading(true);
    try {
      const pipelineData = activeOpps.map((o) => ({
        name: o.name1,
        account: o.account?.name1 || '',
        amount: o.totalamount,
        stage: o.stage,
        confidence: o.confidence ?? 0,
        trend: o.confidenceTrend || 'flat',
        closeDate: o.expectedclosedate || '',
        blocker: o.blocker || '',
        lastAction: o.lastaction || '',
      }));

      const { executeFunction } = await import('@/lib/function-executor');
      const result = await executeFunction('summarizeEntities', {
        data: JSON.stringify(pipelineData),
        entityType: 'opportunity',
      }, { locale });

      if (result.success && result.data) {
        const parsed = result.data as AISummarySlide[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAiSlides(parsed);
          setCurrentSlide(0);
          localStorage.setItem(AI_SUMMARY_CACHE_KEY, JSON.stringify({ ts: Date.now(), slides: parsed, locale }));
        } else {
          console.warn('[OppReview] AI summary: unexpected data shape');
        }
      } else {
        console.warn('[OppReview] AI summary failed:', result.error || 'no summary');
      }
    } catch (e) {
      console.error('[OppReview] AI summary error:', e);
    } finally {
      setAiLoading(false);
    }
  }, [activeOpps, locale]);

  // Load cached summary or auto-generate. Cache is locale-scoped: insights in a
  // different language are ignored so switching language regenerates them.
  useEffect(() => {
    if (activeOpps.length === 0) return;
    try {
      const cached = localStorage.getItem(AI_SUMMARY_CACHE_KEY);
      if (cached) {
        const { ts, slides, locale: cachedLocale } = JSON.parse(cached);
        if (Date.now() - ts < AI_SUMMARY_TTL && slides?.length > 0 && cachedLocale === locale) {
          setAiSlides(slides);
          return;
        }
      }
    } catch { /* ignore */ }
    generateAISummary();
  }, [activeOpps.length > 0, locale]); // regenerate when data arrives or language changes

  // Carousel scroll sync
  const handleCarouselScroll = () => {
    if (!carouselRef.current) return;
    const el = carouselRef.current;
    const slideWidth = el.offsetWidth;
    const idx = Math.round(el.scrollLeft / slideWidth);
    setCurrentSlide(idx);
  };

  const getAccountName = (accountRef: { id: string; name1: string } | undefined) => {
    if (!accountRef) return '';
    return accountRef.name1 || '';
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toLocaleString()}`;
  };

  const getStageConfig = (stage: string) => {
    return stageConfig[stage] || stageConfig.prospecting;
  };

  // ─── Opportunity Card ───
  const renderOppCard = (opp: Opportunity) => {
    const stage = getStageConfig(opp.stage);
    const isAtRisk = (opp.confidence ?? 100) < 50;
    const daysUntil = opp.expectedclosedate ? getDaysUntil(opp.expectedclosedate) : null;

    return (
      <motion.div
        key={opp.id}
        variants={itemVariants}
        className="glass-card p-4 cursor-pointer hover:bg-muted/30 active:bg-muted/50 transition-colors"
        onClick={() => navigate(`/opportunities/${opp.id}`)}
        role="button"
        tabIndex={0}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            navigate(`/opportunities/${opp.id}`);
          }
        }}
      >
        {/* Row 1: Name + Amount */}
        <div className="flex items-start justify-between mb-1.5">
          <div className="flex-1 min-w-0">
            <h3 className="text-body font-medium text-foreground truncate">{opp.name1}</h3>
            <p className="text-helper text-muted-foreground truncate">
              {getAccountName(opp.account)}
            </p>
          </div>
          <p className="text-title font-bold text-foreground ml-3 shrink-0">
            {formatCurrency(opp.totalamount || 0)}
          </p>
        </div>

        {/* Row 2: Stage + Confidence + Trend + Days */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium text-white', stage.color)}>
            {pickLabel(stage, locale)}
          </span>
          <span className="flex items-center gap-1 text-helper text-muted-foreground">
            {opp.confidence ?? 0}%
            <TrendIcon trend={opp.confidenceTrend} />
          </span>
          {isAtRisk && (
            <span className="flex items-center gap-1 text-amber-500 text-helper font-medium">
              <AlertTriangle className="w-3 h-3" />
              {t('riskLabel', locale)}
            </span>
          )}
          {daysUntil !== null && (
            <span className={cn(
              'flex items-center gap-1 text-[11px] ml-auto',
              daysUntil < 0 ? 'text-red-500 font-medium' : daysUntil <= 7 ? 'text-amber-500' : 'text-muted-foreground'
            )}>
              <Clock className="w-3 h-3" />
              {formatDaysUntil(daysUntil, locale)}
            </span>
          )}
        </div>

        {/* Row 3: Blocker (if any) */}
        {opp.blocker && (
          <div className="mt-2 px-2 py-1 rounded-md bg-red-500/10 border border-red-500/20">
            <p className="text-[11px] text-red-400 line-clamp-1">
              ⚠ {opp.blocker}
            </p>
          </div>
        )}

        {/* Row 4: Last Action (if any) */}
        {opp.lastaction && (
          <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-1 italic">
            {t('lastColon', locale)}{opp.lastaction}
          </p>
        )}
      </motion.div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50 safe-area-top">
        <div className="flex items-center justify-between h-14 px-4">
          <button
            onClick={() => navigate('/')}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted active:bg-muted/80 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-title text-foreground">
            {t('opportunityReview', locale)}
          </h1>
          <button
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted active:bg-muted/80 transition-colors"
            aria-label="More"
          >
            <MoreHorizontal className="w-5 h-5 text-foreground" />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 pt-14 overflow-y-auto scrollbar-hide safe-area-top">
        <motion.div
          variants={containerVariants}
          initial={firstMount ? 'hidden' : false}
          animate="show"
          className="space-y-3 py-4 pb-32"
        >
          {/* ─── Summary Card with metrics ─── */}
          <motion.div variants={itemVariants} className="mx-4 glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-helper text-muted-foreground">
                  {t('activePipeline', locale)}
                </p>
                <p className="text-[1.25rem] font-bold text-foreground">
                  {formatCurrency(totalPipeline)}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center min-w-[150px]">
                <div>
                  <p className="text-title font-bold text-foreground">{activeOpps.length}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {t('oppsShort', locale)}
                  </p>
                </div>
                <div>
                  <p className={cn('text-title font-bold', atRiskCount > 0 ? 'text-amber-500' : 'text-green-500')}>
                    {atRiskCount}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {t('atRiskShort', locale)}
                  </p>
                </div>
                <div>
                  <p className="text-title font-bold text-foreground">{actionRequired.length}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {t('actionShort', locale)}
                  </p>
                </div>
              </div>
            </div>

            {/* Stage Distribution Bar */}
            {stageDistribution.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex h-2 rounded-full overflow-hidden">
                  {stageDistribution.map(({ stage, pct }) => {
                    const cfg = getStageConfig(stage);
                    return (
                      <div
                        key={stage}
                        className={cn('h-full', cfg.color)}
                        style={{ width: `${pct}%` }}
                      />
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {stageDistribution.map(({ stage, count }) => {
                    const cfg = getStageConfig(stage);
                    return (
                      <span key={stage} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span className={cn('w-2 h-2 rounded-full', cfg.color)} />
                        {pickLabel(cfg, locale)} {count}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>

          {/* ─── AI Summary Carousel ─── */}
          <motion.div variants={itemVariants} className="mx-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span className="text-helper font-medium text-foreground">
                  {t('aiSummaryLabel', locale)}
                </span>
              </div>
              <button
                onClick={generateAISummary}
                disabled={aiLoading}
                className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 disabled:opacity-50"
              >
                {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                {t('refresh', locale)}
              </button>
            </div>

            {aiLoading && aiSlides.length === 0 ? (
              <div className="glass-card p-6 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-helper text-muted-foreground">
                  {t('analyzingPipeline', locale)}
                </span>
              </div>
            ) : aiSlides.length > 0 ? (
              <>
                <div
                  ref={carouselRef}
                  onScroll={handleCarouselScroll}
                  className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-3"
                  style={{ scrollbarWidth: 'none' }}
                >
                  {aiSlides.map((slide, idx) => (
                    <div
                      key={idx}
                      className="glass-card p-3.5 snap-center shrink-0"
                      style={{ width: 'calc(100vw - 48px)', maxWidth: '400px' }}
                    >
                      <p className="text-helper font-semibold text-primary mb-1">{slide.title}</p>
                      <p className="text-helper text-foreground leading-relaxed">{slide.content}</p>
                    </div>
                  ))}
                </div>
                {/* Pagination dots */}
                {aiSlides.length > 1 && (
                  <div className="flex justify-center gap-1.5 mt-2">
                    {aiSlides.map((_, idx) => (
                      <span
                        key={idx}
                        className={cn(
                          'w-1.5 h-1.5 rounded-full transition-colors',
                          idx === currentSlide ? 'bg-primary' : 'bg-muted-foreground/30'
                        )}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </motion.div>

          {/* ─── Action Required Section ─── */}
          {actionRequired.length > 0 && (
            <motion.div variants={itemVariants} className="px-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <h2 className="text-helper font-semibold text-foreground">
                  {locale === 'zh-Hans'
                    ? `需要行动 (${actionRequired.length})`
                    : `Action Required (${actionRequired.length})`}
                </h2>
              </div>
              <div className="space-y-2.5">
                {actionRequired.map(renderOppCard)}
              </div>
            </motion.div>
          )}

          {/* ─── On Track Section ─── */}
          {onTrack.length > 0 && (
            <motion.div variants={itemVariants} className="px-4">
              <div className="flex items-center gap-2 mb-2">
                <ChevronRight className="w-3.5 h-3.5 text-green-500" />
                <h2 className="text-helper font-semibold text-foreground">
                  {locale === 'zh-Hans'
                    ? `正常跟进 (${onTrack.length})`
                    : `On Track (${onTrack.length})`}
                </h2>
              </div>
              <div className="space-y-2.5">
                {onTrack.map(renderOppCard)}
              </div>
            </motion.div>
          )}

          {activeOpps.length === 0 && (
            <motion.div variants={itemVariants} className="text-center py-12 px-4">
              <p className="text-body text-muted-foreground">
                {t('noActiveOpps', locale)}
              </p>
            </motion.div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
