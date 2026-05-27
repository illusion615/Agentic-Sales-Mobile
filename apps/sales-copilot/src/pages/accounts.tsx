import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Building2, Phone, ChevronRight, AlertTriangle, Search, Users, Sparkles, RefreshCw, Loader2 } from 'lucide-react';
import { MobileLayout } from '@/components/mobile-layout';
import { cn } from '@/lib/utils';
import { useAccountList } from '@/generated/hooks/use-account';
import { useContactList } from '@/generated/hooks/use-contact';
import { useQueryClient } from '@tanstack/react-query';
import type { Account } from '@/generated/models/account-model';import type { Contact } from '@/generated/models/contact-model';import { getRegionEnglish } from '@/lib/display-labels';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { useCopilot } from '@/contexts/copilot-context';
import { getLocale, generateVoiceSummary } from '@/lib/i18n';
import { PullToRefresh } from '@/components/pull-to-refresh';
import { useFirstMount } from '@/hooks/use-first-mount';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] } },
} as const;

function getDaysSinceContact(dateStr?: string): number {
  if (!dateStr) return 999;
  const date = new Date(dateStr);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getContactStatus(daysSince: number): { label: string; color: string; isAtRisk: boolean } {
  if (daysSince <= 7) return { label: 'Recent', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', isAtRisk: false };
  if (daysSince <= 14) return { label: 'Active', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', isAtRisk: false };
  if (daysSince <= 30) return { label: 'Cooling', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', isAtRisk: false };
  return { label: 'At Risk', color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400', isAtRisk: true };
}

export default function ClientsPage() {
  const navigate = useNavigate();
  const firstMount = useFirstMount('accounts');
  const [searchQuery, setSearchQuery] = useState('');
  const locale = getLocale();

  // Copilot context for agent awareness
  const copilot = useCopilot();
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [showAtRiskOnly, setShowAtRiskOnly] = useState(false);

  // Fetch from Dataverse only
  const { data: accounts = [], isLoading: isLoadingAccounts } = useAccountList();
  const { data: contacts = [] } = useContactList();
  const queryClient = useQueryClient();

  // Debug logging for account IDs
  useEffect(() => {
    if (accounts.length > 0) {
      console.log('[AccountsList] Accounts loaded:', accounts.map((a: Account) => ({
        id: a.id,
        name: a.name1,
        hasId: !!a.id,
      })));
    }
  }, [accounts]);

  // Pull to refresh handler
  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['account-list'] }),
      queryClient.invalidateQueries({ queryKey: ['contact-list'] }),
    ]);
  }, [queryClient]);

  // Helper to get contacts by account ID
  const getContactsByAccountId = (accountId: string): Contact[] => {
    return contacts.filter((c: Contact) => c.account?.id === accountId);
  };

  // Enrich accounts with contact status
  const enrichedAccounts = useMemo(() => {
    return accounts.map((account: Account) => {
      const daysSince = getDaysSinceContact(account.lastcontactedon || account.lastinteractiondate);
      const contactStatus = getContactStatus(daysSince);
      const accountContacts = getContactsByAccountId(account.id);
      return { ...account, daysSince, contactStatus, contactCount: accountContacts.length };
    });
  }, [accounts, contacts]);

  // Apply filters
  const filteredAccounts = useMemo(() => {
    return enrichedAccounts.filter((account) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = account.name1?.toLowerCase().includes(query);
        const matchesIndustry = account.industry?.toLowerCase().includes(query);
        if (!matchesName && !matchesIndustry) return false;
      }
      // Tier filter
      if (tierFilter !== 'all' && String(account.tier) !== tierFilter) return false;
      // At risk filter
      if (showAtRiskOnly && !account.contactStatus.isAtRisk) return false;
      return true;
    });
  }, [enrichedAccounts, searchQuery, tierFilter, showAtRiskOnly]);

  // Stats
  const totalClients = accounts.length;
  const atRiskCount = enrichedAccounts.filter((a) => a.contactStatus.isAtRisk).length;
  const contactedThisWeek = enrichedAccounts.filter((a) => a.daysSince <= 7).length;

  // ─── AI Summary ───
  interface AISummarySlide { title: string; content: string }
  const AI_CACHE_KEY = 'client-coverage-ai-summary';
  const AI_TTL = 30 * 60 * 1000;
  const [aiSlides, setAiSlides] = useState<AISummarySlide[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  const generateAISummary = useCallback(async () => {
    if (enrichedAccounts.length === 0) return;
    setAiLoading(true);
    try {
      const clientData = enrichedAccounts.map((a) => ({
        name: a.name1, tier: a.tier, industry: a.industry,
        daysSinceContact: a.daysSince, status: a.contactStatus.label,
        contactCount: a.contactCount, region: a.region,
        creditStatus: a.creditStatus, paymentStatus: a.paymentStatus,
      }));

      const isZh = locale === 'zh-Hans';
      const systemPrompt = isZh
        ? `你是销售经理的AI助手。基于客户覆盖数据，生成恰好4个摘要卡片，JSON数组格式。
每张卡片关注不同角度：
1. 覆盖概况 - 客户总体健康度、联系频率分布
2. 风险客户 - 需要紧急跟进的客户及建议行动
3. 高价值客户 - S/A级客户的维护情况和建议
4. 跟进策略 - 本周应优先联系哪些客户，按什么节奏
返回格式：[{"title":"标题","content":"内容（2-3句，简洁可操作）"}]
只返回JSON数组。`
        : `You are an AI assistant for a sales manager. Based on client coverage data, generate exactly 4 summary cards as a JSON array.
Each card focuses on a different angle:
1. Coverage Overview - overall health, contact frequency distribution
2. At-Risk Clients - clients needing urgent follow-up with suggested actions
3. Key Accounts - S/A tier maintenance status and recommendations
4. Follow-up Strategy - which clients to prioritize this week and at what cadence
Return format: [{"title":"Title","content":"Content (2-3 sentences, concise and actionable)"}]
Return ONLY the JSON array.`;

      const result = await generateVoiceSummary(JSON.stringify(clientData), locale, systemPrompt, undefined, undefined, 'json');
      if (result.success && result.summary) {
        const jsonMatch = result.summary.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as AISummarySlide[];
          setAiSlides(parsed);
          setCurrentSlide(0);
          localStorage.setItem(AI_CACHE_KEY, JSON.stringify({ ts: Date.now(), slides: parsed }));
        }
      }
    } catch (e) { console.error('[ClientCoverage] AI summary error:', e); }
    finally { setAiLoading(false); }
  }, [enrichedAccounts, locale]);

  useEffect(() => {
    if (enrichedAccounts.length === 0) return;
    try {
      const cached = localStorage.getItem(AI_CACHE_KEY);
      if (cached) {
        const { ts, slides } = JSON.parse(cached);
        if (Date.now() - ts < AI_TTL && slides?.length > 0) { setAiSlides(slides); return; }
      }
    } catch { /* ignore */ }
    generateAISummary();
  }, [enrichedAccounts.length > 0]);

  const handleCarouselScroll = () => {
    if (!carouselRef.current) return;
    const el = carouselRef.current;
    setCurrentSlide(Math.round(el.scrollLeft / el.offsetWidth));
  };

  // Set page context for Copilot agent awareness
  useEffect(() => {
    copilot.setPageContext({
      currentPage: locale === 'zh-Hans' ? '客户列表' : 'Accounts List',
      summary: locale === 'zh-Hans'
        ? `客户列表: 共${totalClients}个客户，${atRiskCount}个需要跟进，${contactedThisWeek}个本周已联系`
        : `Accounts list: ${totalClients} total accounts, ${atRiskCount} at risk, ${contactedThisWeek} contacted this week`,
      pageData: {
        totalAccounts: totalClients,
        atRiskCount,
        contactedThisWeek,
        currentFilter: tierFilter,
        showAtRiskOnly,
        searchQuery,
        displayedCount: filteredAccounts.length,
      },
    });
    
    return () => {
      copilot.setPageContext(null);
    };
  }, [totalClients, atRiskCount, contactedThisWeek, tierFilter, showAtRiskOnly, searchQuery, filteredAccounts.length, locale, copilot.setPageContext]);

  if (isLoadingAccounts) {
    return (
      <MobileLayout title="Client Coverage">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout title="Client Coverage">
      <PullToRefresh onRefresh={handleRefresh} className="flex-1 overflow-y-auto pb-32">
        <motion.div
          variants={containerVariants}
          initial={firstMount ? 'hidden' : false}
          animate="show"
          className="space-y-4 py-4"
        >
          {/* Stats Summary */}
          <motion.div variants={itemVariants} className="grid grid-cols-3 gap-2">
            <div className="glass-card p-3 text-center" style={{ borderRadius: 16 }}>
              <p className="text-2xl font-bold text-foreground">{totalClients}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="glass-card p-3 text-center" style={{ borderRadius: 16 }}>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{contactedThisWeek}</p>
              <p className="text-xs text-muted-foreground">This Week</p>
            </div>
            <div className="glass-card p-3 text-center" style={{ borderRadius: 16 }}>
              <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">{atRiskCount}</p>
              <p className="text-xs text-muted-foreground">At Risk</p>
            </div>
          </motion.div>

          {/* AI Summary Carousel */}
          <motion.div variants={itemVariants}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] font-medium text-foreground">
                  {locale === 'zh-Hans' ? 'AI 客户洞察' : 'AI Client Insights'}
                </span>
              </div>
              <button
                onClick={generateAISummary}
                disabled={aiLoading}
                className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 disabled:opacity-50"
              >
                {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                {locale === 'zh-Hans' ? '刷新' : 'Refresh'}
              </button>
            </div>
            {aiLoading && aiSlides.length === 0 ? (
              <div className="glass-card p-6 flex items-center justify-center gap-2" style={{ borderRadius: 16 }}>
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-[11px] text-muted-foreground">
                  {locale === 'zh-Hans' ? '正在分析客户数据...' : 'Analyzing client data...'}
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
                      style={{ width: 'calc(100vw - 48px)', maxWidth: '400px', borderRadius: 16 }}
                    >
                      <p className="text-[11px] font-semibold text-primary mb-1">{slide.title}</p>
                      <p className="text-[11px] text-foreground leading-relaxed">{slide.content}</p>
                    </div>
                  ))}
                </div>
                {aiSlides.length > 1 && (
                  <div className="flex justify-center gap-1.5 mt-2">
                    {aiSlides.map((_, idx) => (
                      <span key={idx} className={cn('w-1.5 h-1.5 rounded-full transition-colors', idx === currentSlide ? 'bg-primary' : 'bg-muted-foreground/30')} />
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </motion.div>

          {/* Search & Filters */}
          <motion.div variants={itemVariants} className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                className="pl-9 h-10 bg-muted/50 border-0"
              />
            </div>
            <div className="flex gap-2">
              <Select value={tierFilter} onValueChange={setTierFilter}>
                <SelectTrigger className="flex-1 h-9 bg-muted/50 border-0">
                  <SelectValue placeholder="Tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tiers</SelectItem>
                  {['S', 'A', 'B', 'C'].map((label) => (
                    <SelectItem key={label} value={label}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant={showAtRiskOnly ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowAtRiskOnly(!showAtRiskOnly)}
                className={cn(
                  'gap-1.5 h-9',
                  showAtRiskOnly && 'bg-rose-500 hover:bg-rose-600 text-white border-0'
                )}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                At Risk
              </Button>
            </div>
          </motion.div>

          {/* Client List */}
          <motion.div variants={itemVariants} className="space-y-2">
            {filteredAccounts.length === 0 ? (
              <Empty className="py-12">
                <EmptyHeader>
                  <EmptyTitle>No clients found</EmptyTitle>
                  <EmptyDescription>
                    {accounts.length === 0 
                      ? 'Add clients in Dataverse to see them here'
                      : 'Try adjusting your search or filters'
                    }
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              filteredAccounts.map((account) => (
                <motion.div
                  key={account.id}
                  variants={itemVariants}
                  className="glass-card p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  style={{ borderRadius: 16 }}
                  onClick={() => navigate(`/accounts/${account.id}`)}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-primary-foreground" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-sm font-medium text-foreground truncate flex-1">
                          {account.name1}
                        </h3>
                        {account.tier && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                            {account.tier}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mb-1.5">
                        {account.industry || 'Uncategorized'}
                        {account.region && ` • ${getRegionEnglish(account.region)}`}
                      </p>
                      <div className="flex items-center gap-3 text-xs">
                        <span className={cn('px-1.5 py-0.5 rounded-md text-[10px] font-medium', account.contactStatus.color)}>
                          {account.contactStatus.isAtRisk && <AlertTriangle className="w-2.5 h-2.5 inline mr-0.5" />}
                          {account.daysSince}d ago
                        </span>
                        {account.phone && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Phone className="w-3 h-3" />
                            <span className="truncate max-w-[80px]">{account.phone}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Arrow */}
                    <ChevronRight className="w-4 h-4 text-muted-foreground/50 flex-shrink-0 mt-1" />
                  </div>
                </motion.div>
              ))
            )}
          </motion.div>

          {/* Footer hint */}
          {filteredAccounts.length > 0 && (
            <motion.div variants={itemVariants} className="text-center text-xs text-muted-foreground py-2">
              Showing {filteredAccounts.length} of {totalClients} clients
            </motion.div>
          )}
        </motion.div>
      </PullToRefresh>
    </MobileLayout>
  );
}
