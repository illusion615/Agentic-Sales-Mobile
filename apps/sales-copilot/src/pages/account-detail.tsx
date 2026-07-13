import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Building2,
  Phone,
  Mail,
  MapPin,
  Globe,
  Calendar,
  Clock,
  Edit,
  Plus,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  User,
  Trash2,
  Save,
  Sparkles,
  RefreshCw,
  X,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ActivityStatusBadge } from '@/components/activity-status-badge';
import { MobileLayout } from '@/components/mobile-layout';
import { GlassCard } from '@/components/glass-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { FloatingQuickActions } from '@/components/floating-quick-actions';
import { AISummaryCard } from '@/components/ai-summary-card';
import { MarkdownContent } from '@/components/markdown-content';
import { useAccount, useUpdateAccount, useDeleteAccount } from '@/generated/hooks/use-account';
import { useQueryClient } from '@tanstack/react-query';
import { useContactList } from '@/generated/hooks/use-contact';
import { useOpportunityList } from '@/generated/hooks/use-opportunity';
import { useActivityList } from '@/generated/hooks/use-activity';
import { useEntityAISummary, useWithAISummaryTrigger } from '@/hooks/use-ai-summary-trigger';
import type { Opportunity } from '@/generated/models/opportunity-model';
import type { Activity } from '@/generated/models/activity-model';
import type { Contact } from '@/generated/models/contact-model';
import { toast } from '@/lib/toast-utils';
import { getLocale, t } from '@/lib/i18n';
import { industryLabel } from '@/lib/industry';
import { useCopilot } from '@/contexts/copilot-context';
import { PullToRefresh } from '@/components/pull-to-refresh';
import {
  triggerAccountEnrichment,
  applyEnrichmentToAccount,
  splitEnrichment,
} from '@/services/account-enrichment-service';

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

function formatCurrency(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString();
}

function getDaysSince(dateStr?: string): number {
  if (!dateStr) return 999;
  const date = new Date(dateStr);
  const now = new Date();
  return Math.ceil(Math.abs(now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function getActivityTypeIcon(type: string | null | undefined): React.ComponentType<{ className?: string }> {
  switch (type) {
    case 'visit': return Calendar;
    case 'call': return Phone;
    case 'meeting': return Calendar;
    case 'email': return Mail;
    default: return CheckSquare;
  }
}

/** Ensure an outbound link has an http(s) scheme; neutralizes javascript: values. */
function normalizeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url.replace(/^\/+/, '')}`;
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(searchParams.get('edit') === 'true');
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichFeedback, setEnrichFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [isMarketingExpanded, setIsMarketingExpanded] = useState(true);
  const locale = getLocale();

  // Edit form state
  const [editForm, setEditForm] = useState({
    name1: '',
    industry: '',
    website: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
  });

  // Fetch data from Dataverse
  const { data: account, isLoading: isLoadingAccount, error } = useAccount(id || '');

  // Prefetch related entity detail chunks (opportunity, activity, contact)
  useEffect(() => {
    import('@/lib/prefetch').then(({ prefetchRelated }) => prefetchRelated('account'));
  }, []);

  // Debug logging for account fetch issues
  useEffect(() => {
    if (id) {
      console.log('[AccountDetail] Fetching account with ID:', id);
    }
    if (error) {
      console.error('[AccountDetail] Error fetching account:', {
        id,
        error: error instanceof Error ? error.message : String(error),
        errorObj: error,
      });
    }
    if (account) {
      console.log('[AccountDetail] Account loaded successfully:', {
        id: account.id,
        name: account.name1,
      });
    }
  }, [id, error, account]);
  const { data: allContacts = [] } = useContactList();
  const { data: allOpportunities = [] } = useOpportunityList();
  const { data: allActivities = [] } = useActivityList();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();
  const queryClient = useQueryClient();

  // Pull to refresh handler
  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['account', id] }),
      queryClient.invalidateQueries({ queryKey: ['contact-list'] }),
      queryClient.invalidateQueries({ queryKey: ['opportunity-list'] }),
      queryClient.invalidateQueries({ queryKey: ['activity-list'] }),
    ]);
  }, [queryClient, id]);

  // After a Marketing Insight refresh, regenerate Sales Insight so it reflects
  // the new public facts (combined with pipeline + activities).
  const [salesRegenQueued, setSalesRegenQueued] = useState(false);

  // On-demand enrichment: ask the Account Enrichment Agent to refresh this
  // account's public master fields and description intelligence block.
  const handleEnrich = useCallback(async () => {
    if (!account || isEnriching) return;
    setIsEnriching(true);
    setEnrichFeedback(null);
    try {
      const res = await triggerAccountEnrichment(account, locale);
      if (!res.success || !res.result) throw new Error(res.error || 'Enrichment failed');
      if (res.result.status === 'skipped') {
        setEnrichFeedback({
          kind: 'error',
          text: res.result.reason || (locale === 'zh-Hans' ? '未找到足够的公开信息。' : 'Not enough public information found.'),
        });
      } else {
        await applyEnrichmentToAccount(account, res.result);
        setEnrichFeedback({
          kind: 'success',
          text: locale === 'zh-Hans' ? '客户情报已更新。' : 'Customer intelligence updated.',
        });
        await queryClient.invalidateQueries({ queryKey: ['account', id] });
        await queryClient.invalidateQueries({ queryKey: ['aISummary-list'] });
        setSalesRegenQueued(true);
      }
    } catch (err: unknown) {
      setEnrichFeedback({
        kind: 'error',
        text: err instanceof Error && err.message
          ? err.message
          : (locale === 'zh-Hans' ? '刷新失败，请稍后重试' : 'Refresh failed, please try again'),
      });
    } finally {
      setIsEnriching(false);
    }
  }, [account, id, locale, isEnriching, queryClient]);

  // AI Summary hooks
  const { summary: aiSummary, isLoading: isLoadingAISummary, isGenerating, isExpired, isFailed, localeMismatch, refetch: refetchAISummary } = useEntityAISummary('account', id || '');
  // Marketing Insight is stored as a separate AISummary record (type='marketing').
  const { summary: marketingRecord } = useEntityAISummary('account', id || '', 'marketing');
  const { triggerForEntity, isTriggering } = useWithAISummaryTrigger();

  // Initialize edit form when account loads
  useMemo(() => {
    if (account && isEditMode) {
      setEditForm({
        name1: account.name1 || '',
        industry: account.industry || '',
        website: account.website || '',
        phone: account.phone || '',
        email: account.email || '',
        address: account.address || '',
        notes: account.notes || '',
      });
    }
  }, [account, isEditMode]);

  // Filter related data
  const contacts = useMemo(() => 
    allContacts.filter((c: Contact) => c.account?.id === id), [allContacts, id]);
  const opportunities = useMemo(() => 
    allOpportunities.filter((o: Opportunity) => o.account?.id === id), [allOpportunities, id]);
  const activities = useMemo(() => 
    allActivities.filter((a: Activity) => a.account?.id === id), [allActivities, id]);

  // Local state for immediate refresh feedback
  const [isRefreshingAI, setIsRefreshingAI] = useState(false);

  const handleRefreshAISummary = useCallback(() => {
    if (!account) return;
    setIsRefreshingAI(true);
    triggerForEntity('account', account.id, { ...account } as Record<string, unknown>, {
      opportunities: opportunities.map((o: Opportunity) => ({ id: o.id, name: o.name1, stage: o.stage, amount: o.totalamount })),
      activities: activities.map((a: Activity) => ({ id: a.id, title: a.title, type: a.type, date: a.scheduleddate })),
      contacts: contacts.map((c: Contact) => ({ id: c.id, name: c.fullname, title: c.title })),
      marketingInsight: marketingRecord?.summary || '',
    });
    setTimeout(() => {
      refetchAISummary();
      setIsRefreshingAI(false);
    }, 500);
  }, [account, opportunities, activities, contacts, triggerForEntity, refetchAISummary, marketingRecord]);

  // Regenerate the insight when the user switched language since it was generated.
  useEffect(() => {
    if (localeMismatch && account && !isGenerating && !isTriggering && !isRefreshingAI) {
      handleRefreshAISummary();
    }
  }, [localeMismatch, account, isGenerating, isTriggering, isRefreshingAI, handleRefreshAISummary]);

  // After enrichment refreshes the Marketing Insight facts, regenerate Sales
  // Insight so it is derived from the latest facts + pipeline + activities.
  useEffect(() => {
    if (salesRegenQueued && account && !isEnriching && !isTriggering && !isRefreshingAI) {
      setSalesRegenQueued(false);
      handleRefreshAISummary();
    }
  }, [salesRegenQueued, account, isEnriching, isTriggering, isRefreshingAI, handleRefreshAISummary]);

  // Calculate stats
  const totalPipelineValue = opportunities.reduce(
    (sum: number, opp: Opportunity) => sum + (opp.totalamount || 0),
    0
  );
  const wonStage = 'won';
  const lostStage = 'lost';
  const activeDeals = opportunities.filter(
    (opp: Opportunity) => opp.stage !== wonStage && opp.stage !== lostStage
  );

  const daysSinceContact = 999; // computed from activities instead

  // Copilot context for agent awareness
  const copilot = useCopilot();

  // Set page context for Copilot agent awareness
  useEffect(() => {
    if (!account) return;
    
    copilot.setPageContext({
      currentPage: locale === 'zh-Hans' ? '客户详情' : 'Account Detail',
      summary: locale === 'zh-Hans'
        ? `查看客户: ${account.name1}，行业: ${account.industry || '未分类'}，管线价值: ${formatCurrency(totalPipelineValue)}，${activeDeals.length}个活跃商机，${contacts.length}个联系人`
        : `Viewing account: ${account.name1}, Industry: ${account.industry || 'Uncategorized'}, Pipeline: ${formatCurrency(totalPipelineValue)}, ${activeDeals.length} active deals, ${contacts.length} contacts`,
      pageData: {
        accountId: account.id,
        accountName: account.name1,
        industry: account.industry,
        phone: account.phone,
        email: account.email,
        website: account.website,
        address: account.address,
        contactsCount: contacts.length,
        opportunitiesCount: opportunities.length,
        activitiesCount: activities.length,
        totalPipelineValue,
        notes: account.notes,
      },
    });
    
    return () => {
      copilot.setPageContext(null);
    };
  }, [account, contacts.length, opportunities.length, activities.length, totalPipelineValue, daysSinceContact, activeDeals.length, locale, copilot.setPageContext]);

  const handleDelete = async () => {
    if (!account) return;
    if (deleteAccount.isPending) return; // guard against double-tap
    try {
      await deleteAccount.mutateAsync(account.id);
      // Returning to the list (item now gone) is the feedback; no toast.
      navigate('/accounts');
    } catch (error: unknown) {
      toast.error('Failed to delete client');
    }
  };

  const handleSave = async () => {
    if (!account) return;
    if (updateAccount.isPending) return; // guard against double-tap
    try {
      const updatedData = {
        name1: editForm.name1,
        industry: editForm.industry,
        website: editForm.website,
        phone: editForm.phone,
        email: editForm.email,
        address: editForm.address,
        notes: editForm.notes,
      };
      
      await updateAccount.mutateAsync({
        id: account.id,
        changedFields: updatedData,
      });
      
      // Trigger AI summary generation in the background
      triggerForEntity('account', account.id, {
        ...account,
        ...updatedData,
      } as Record<string, unknown>, {
        opportunities: opportunities.map((o: Opportunity) => ({ id: o.id, name: o.name1, stage: o.stage, amount: o.totalamount })),
        activities: activities.map((a: Activity) => ({ id: a.id, title: a.title, type: a.type, date: a.scheduleddate })),
        contacts: contacts.map((c: Contact) => ({ id: c.id, name: c.fullname, title: c.title })),
      });
      // Exiting edit mode reveals the updated fields inline; no toast.
      setIsEditMode(false);
    } catch (error: unknown) {
      toast.error('Failed to update client');
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    if (account) {
      setEditForm({
        name1: account.name1 || '',
        industry: account.industry || '',
        website: account.website || '',
        phone: account.phone || '',
        email: account.email || '',
        address: account.address || '',
        notes: account.notes || '',
      });
    }
  };

  if (isLoadingAccount) {
    return (
      <MobileLayout title={t('accountDetailsTitle', locale)}>
        <div className="px-4 pb-40 space-y-4 mt-4">
          {/* Header card skeleton */}
          <div className="glass-card p-4 animate-pulse rounded-[20px]">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-muted/50" />
              <div className="flex-1 space-y-2">
                <div className="h-6 w-3/4 rounded bg-muted/50" />
                <div className="h-4 w-1/2 rounded bg-muted/40" />
                <div className="flex gap-2"><div className="h-5 w-20 rounded-full bg-muted/40" /><div className="h-5 w-16 rounded-full bg-muted/40" /></div>
              </div>
            </div>
          </div>
          {/* Info rows skeleton */}
          <div className="glass-card p-4 animate-pulse space-y-3 rounded-[20px]">
            {[0,1,2,3].map(i => <div key={i} className="flex justify-between"><div className="h-4 w-20 rounded bg-muted/40" /><div className="h-4 w-36 rounded bg-muted/50" /></div>)}
          </div>
          {/* List skeleton */}
          <div className="glass-card p-4 animate-pulse space-y-3 rounded-[20px]">
            <div className="h-5 w-24 rounded bg-muted/50" />
            {[0,1,2].map(i => <div key={i} className="h-12 rounded-lg bg-muted/30" />)}
          </div>
        </div>
      </MobileLayout>
    );
  }

  if (error || !account) {
    // Log error details for debugging
    if (error) {
      console.error('[AccountDetail] Error loading account:', {
        id,
        error: error instanceof Error ? error.message : error,
      });
    }
    
    return (
      <MobileLayout title={t('clientTitle', locale)}>
        <Empty className="py-20">
          <EmptyHeader>
            <Building2 className="w-16 h-16 mx-auto mb-4 text-muted-foreground/40" />
            <EmptyTitle>{t('clientNotFound', locale)}</EmptyTitle>
            <EmptyDescription>
              {locale === 'zh-Hans' 
                ? '该记录可能已被删除，或此 ID 不属于客户表' 
                : 'This record may have been deleted, or the ID does not belong to the Accounts table'}
            </EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/accounts')}>
            {t('backToClients', locale)}
          </Button>
        </Empty>
      </MobileLayout>
    );
  }

  const deleteButton = (
    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogTrigger asChild>
        <button
          className="p-2 rounded-full hover:bg-destructive/10 transition-colors"
          aria-label="Delete client"
        >
          <Trash2 className="w-5 h-5 text-destructive" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Client</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this client? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleteAccount.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteAccount.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // View-mode header actions: Edit (primary entry, was a hidden dock chip) + Delete.
  const viewHeaderActions = (
    <div className="flex items-center gap-1">
      <button
        onClick={() => setIsEditMode(true)}
        className="p-2 rounded-full hover:bg-muted/50 transition-colors"
        aria-label={t('editClient', locale)}
      >
        <Edit className="w-5 h-5 text-foreground" />
      </button>
      {deleteButton}
    </div>
  );

  // Edit Mode UI
  if (isEditMode) {
    return (
      <MobileLayout title="Edit Client" hideVoiceButton headerRight={deleteButton}>
        <motion.div
          className="py-4 space-y-4 pb-32"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' as const }}
        >
          <GlassCard className="space-y-4">
            <div className="space-y-3">
              <div>
                <Label htmlFor="name">Company Name *</Label>
                <Input
                  id="name"
                  value={editForm.name1}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, name1: e.target.value })}
                  placeholder="Enter company name"
                />
              </div>

              <div>
                <Label htmlFor="industry">Industry</Label>
                <Input
                  id="industry"
                  value={editForm.industry}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, industry: e.target.value })}
                  placeholder="e.g., Technology, Healthcare"
                />
              </div>

              <div>
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  type="url"
                  value={editForm.website}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, website: e.target.value })}
                  placeholder="https://company.com"
                />
              </div>

              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={editForm.phone}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, phone: e.target.value })}
                  placeholder="+1 (555) 000-0000"
                />
              </div>

              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={editForm.email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="contact@company.com"
                />
              </div>

              <div>
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={editForm.address}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, address: e.target.value })}
                  placeholder="Street address, City, Country"
                />
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={editForm.notes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditForm({ ...editForm, notes: e.target.value })}
                  placeholder="Additional notes..."
                  className="min-h-[100px]"
                />
              </div>
            </div>
          </GlassCard>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={handleCancelEdit}
            >
              <X className="w-4 h-4" />
              Cancel
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={handleSave}
              disabled={!editForm.name1 || updateAccount.isPending}
            >
              {updateAccount.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save
                </>
              )}
            </Button>
          </div>
        </motion.div>
      </MobileLayout>
    );
  }

  // Marketing Insight facts come from the shared AISummary store (type='marketing').
  // The customer profile lives in the account description, shown in the header card.
  const enrichmentBody = (marketingRecord?.summary || '').trim();
  const marketingUpdated = marketingRecord?.generatedOn ? String(marketingRecord.generatedOn).slice(0, 10) : '';
  // Customer profile is written to the description by enrichment; strip any legacy
  // managed block so only the human-readable profile shows in the header.
  const profileText = splitEnrichment(account.notes).human;

  // View Mode UI
  return (
    <MobileLayout title="Client Details" hideVoiceButton headerRight={viewHeaderActions}>
      <PullToRefresh onRefresh={handleRefresh} className="flex-1 overflow-y-auto">
        <motion.div
          className="py-4 space-y-4 pb-48"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' as const }}
        >
        {/* Header Card */}
        <GlassCard className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center flex-shrink-0">
              <Building2 className="w-7 h-7 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-bold text-foreground truncate">{account.name1}</h1>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                {industryLabel(account.industry) || 'Uncategorized'}
              </p>
              <div className="flex flex-wrap gap-2">
                {daysSinceContact <= 14 ? (
                  <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-200 dark:border-emerald-900">
                    <CheckCircle2 className="w-3 h-3" />
                    Active
                  </Badge>
                ) : daysSinceContact > 30 ? (
                  <Badge variant="outline" className="gap-1 text-rose-600 border-rose-200 dark:border-rose-900">
                    <AlertTriangle className="w-3 h-3" />
                    At Risk
                  </Badge>
                ) : null}
              </div>
              {(account.website || account.phone || account.email || account.address) && (
                <div className="mt-2 space-y-1">
                  {account.website && (
                    <a
                      href={normalizeUrl(account.website)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                      <Globe className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{account.website}</span>
                    </a>
                  )}
                  {account.phone && (
                    <a
                      href={`tel:${account.phone}`}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{account.phone}</span>
                    </a>
                  )}
                  {account.email && (
                    <a
                      href={`mailto:${account.email}`}
                      className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{account.email}</span>
                    </a>
                  )}
                  {account.address && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{account.address}</span>
                    </div>
                  )}
                </div>
              )}
              {profileText && (
                <p className="mt-2 text-xs text-muted-foreground/90 leading-relaxed">
                  {profileText}
                </p>
              )}
            </div>
            {/* AI enrich — top-right of the account card */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {isEnriching && (
                <span className="text-xs text-muted-foreground animate-pulse">
                  {locale === 'zh-Hans' ? '获取中…' : 'Fetching…'}
                </span>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => handleEnrich()}
                disabled={isEnriching}
                aria-label={locale === 'zh-Hans' ? '刷新市场情报' : 'Refresh marketing insight'}
                title={locale === 'zh-Hans' ? '刷新市场情报' : 'Refresh marketing insight'}
              >
                <RefreshCw className={cn('w-4 h-4', isEnriching && 'animate-spin')} />
              </Button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-border/50">
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">
                {formatCurrency(totalPipelineValue)}
              </p>
              <p className="text-xs text-muted-foreground">Pipeline</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">{activeDeals.length}</p>
              <p className="text-xs text-muted-foreground">Active Deals</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">{daysSinceContact}d</p>
              <p className="text-xs text-muted-foreground">Since Contact</p>
            </div>
          </div>
        </GlassCard>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-4 bg-muted/50">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="contacts">Contacts ({contacts.length})</TabsTrigger>
            <TabsTrigger value="opportunities">Deals ({opportunities.length})</TabsTrigger>
            <TabsTrigger value="activities">Activities ({activities.length})</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            {/* Marketing Insight (enrichment) — collapsible; always shown so refresh is available */}
            <GlassCard className="overflow-hidden">
              {/* Header (collapsible, matches Sales Insight) */}
              <div
                className="w-full flex items-center gap-3 text-left cursor-pointer"
                onClick={() => setIsMarketingExpanded(!isMarketingExpanded)}
                role="button"
                tabIndex={0}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setIsMarketingExpanded(!isMarketingExpanded);
                  }
                }}
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-foreground">
                    {locale === 'zh-Hans' ? '\u5e02\u573a\u60c5\u62a5' : 'Marketing Insight'}
                  </h3>
                  {marketingUpdated && (
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      {marketingUpdated}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isMarketingExpanded ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              </div>

              {/* Expandable content */}
              <AnimatePresence initial={false}>
                {isMarketingExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' as const }}
                  >
                    <div className="pt-4 mt-4 border-t border-border/50 space-y-3">
                      {/* Agent call feedback — shown while running and after it returns */}
                      {(isEnriching || enrichFeedback) && (
                        <div
                          className={cn(
                            'rounded-lg px-3 py-2 text-xs',
                            enrichFeedback?.kind === 'error'
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                              : 'bg-primary/5 text-muted-foreground',
                          )}
                        >
                          <div className="flex items-start gap-2">
                            {isEnriching && <Loader2 className="w-3.5 h-3.5 animate-spin mt-0.5 shrink-0 text-primary" />}
                            <div className="min-w-0 flex-1">
                              {isEnriching ? (
                                <span className="leading-relaxed">
                                  {locale === 'zh-Hans'
                                    ? '\u6b63\u5728\u8c03\u7528 Enrichment Agent\uff0c\u4ece\u516c\u5f00\u7f51\u7edc\u83b7\u53d6\u5ba2\u6237\u4fe1\u606f\u2026'
                                    : 'Calling the enrichment agent to fetch public info from the web\u2026'}
                                </span>
                              ) : (
                                <MarkdownContent content={enrichFeedback!.text} className="text-xs leading-relaxed" />
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {enrichmentBody && (
                        <MarkdownContent content={enrichmentBody} className="text-sm text-muted-foreground leading-relaxed" />
                      )}
                      {!enrichmentBody && !isEnriching && !enrichFeedback && (
                        <p className="text-sm text-muted-foreground/70">
                          {locale === 'zh-Hans'
                            ? '\u6682\u65e0\u5e02\u573a\u60c5\u62a5\u3002\u70b9\u53f3\u4e0a\u89d2\u5237\u65b0\uff0c\u4ece\u516c\u5f00\u7f51\u7edc\u83b7\u53d6\u5ba2\u6237\u4fe1\u606f\u3002'
                            : 'No marketing insight yet. Tap refresh to fetch public details from the web.'}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassCard>

            {/* AI Insights */}
            <AISummaryCard
              title={locale === 'zh-Hans' ? '销售洞察' : 'Sales Insight'}
              summary={aiSummary}
              isLoading={isLoadingAISummary}
              isGenerating={isGenerating}
              isExpired={isExpired}
              isFailed={isFailed}
              isRefreshing={isRefreshingAI || isTriggering}
              onRefresh={handleRefreshAISummary}
            />
          </TabsContent>

          {/* Contacts Tab */}
          <TabsContent value="contacts" className="mt-4 space-y-3">
            {contacts.length === 0 ? (
              <Empty className="py-8">
                <EmptyHeader>
                  <User className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
                  <EmptyTitle>No contacts</EmptyTitle>
                  <EmptyDescription>Add contacts in Dataverse to see them here</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              contacts.map((contact: Contact) => (
                <motion.div
                  key={contact.id}
                  variants={itemVariants}
                  className="glass-card p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  style={{ borderRadius: 14 }}
                  onClick={() => navigate(`/contacts/${contact.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-foreground">
                        {contact.fullname}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        {contact.title}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {contact.phone && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            window.open(`tel:${contact.phone}`);
                          }}
                        >
                          <Phone className="w-4 h-4" />
                        </Button>
                      )}
                      {contact.email && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            window.open(`mailto:${contact.email}`);
                          }}
                        >
                          <Mail className="w-4 h-4" />
                        </Button>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </TabsContent>

          {/* Opportunities Tab */}
          <TabsContent value="opportunities" className="mt-4 space-y-3">
            {opportunities.length === 0 ? (
              <Empty className="py-8">
                <EmptyHeader>
                  <TrendingUp className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
                  <EmptyTitle>No opportunities</EmptyTitle>
                  <EmptyDescription>Create deals in Dataverse to track them here</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              opportunities.map((opp: Opportunity) => (
                <motion.div
                  key={opp.id}
                  variants={itemVariants}
                  className="glass-card p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  style={{ borderRadius: 14 }}
                  onClick={() => navigate(`/opportunities/${opp.id}`)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-foreground truncate flex-1">
                      {opp.name1}
                    </h4>
                    <span className="text-sm font-semibold text-foreground ml-2">
                      {formatCurrency(opp.totalamount || 0)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="text-[10px]">
                      {opp.stage}
                    </Badge>
                    {opp.confidence && (
                      <span className="text-muted-foreground">
                        {opp.confidence}% confidence
                      </span>
                    )}
                    {opp.expectedclosedate && (
                      <span className="text-muted-foreground">
                        → {formatDate(opp.expectedclosedate)}
                      </span>
                    )}
                  </div>
                </motion.div>
              ))
            )}
          </TabsContent>

          {/* Activities Tab */}
          <TabsContent value="activities" className="mt-4 space-y-3">
            {activities.length === 0 ? (
              <Empty className="py-8">
                <EmptyHeader>
                  <Clock className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
                  <EmptyTitle>No activities</EmptyTitle>
                  <EmptyDescription>Log activities to track engagement</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              activities.map((activity: Activity) => (
                <motion.div
                  key={activity.id}
                  variants={itemVariants}
                  className="glass-card p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  style={{ borderRadius: 14 }}
                  onClick={() => navigate(`/activities/${activity.id}`)}
                >
                  <div className="flex gap-3">
                    {(() => {
                      const Icon = getActivityTypeIcon(activity.type);
                      return (
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-4 h-4 text-primary" />
                        </div>
                      );
                    })()}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-medium text-foreground truncate">
                          {activity.title}
                        </h4>
                        {activity.status && (
                          <ActivityStatusBadge activity={activity} size="sm" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mb-1">
                        {formatDate(activity.scheduleddate)}
                        {activity.type && ` • ${activity.type}`}
                      </p>
                      {activity.notes && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {activity.notes}
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </motion.div>
      </PullToRefresh>

      <FloatingQuickActions
        actions={[
          {
            id: 'new-activity',
            icon: Plus,
            label: t('newActivity', locale),
            onClick: () => navigate(`/activity/${id}`),
          },
        ]}
      />
    </MobileLayout>
  );
}
