import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  User,
  Phone,
  Mail,
  Building2,
  Briefcase,
  Edit,
  Trash2,
  Save,
  X,
  ChevronRight,
  TrendingUp,
  Clock,
  MapPin,
  Calendar,
  CheckSquare,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MobileLayout } from '@/components/mobile-layout';
import { GlassCard } from '@/components/glass-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useContact, useUpdateContact, useDeleteContact } from '@/generated/hooks/use-contact';
import { useQueryClient } from '@tanstack/react-query';
import { useAccountList } from '@/generated/hooks/use-account';
import { useOpportunityList } from '@/generated/hooks/use-opportunity';
import { useActivityList } from '@/generated/hooks/use-activity';
import type { Opportunity } from '@/generated/models/opportunity-model';import type { Activity } from '@/generated/models/activity-model';import type { Account } from '@/generated/models/account-model';import { toast } from 'sonner';
import { getLocale, t } from '@/lib/i18n';
import { useCopilot } from '@/contexts/copilot-context';
import { PullToRefresh } from '@/components/pull-to-refresh';

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

function getActivityTypeIcon(type: string | null | undefined): React.ComponentType<{ className?: string }> {
  switch (type) {
    case 'visit': return Calendar; // visit
    case 'call': return Phone; // call
    case 'meeting': return Calendar; // meeting
    case 'email': return Mail; // email
    default: return CheckSquare;
  }
}

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(searchParams.get('edit') === 'true');
  const locale = getLocale();

  // Edit form state
  const [editForm, setEditForm] = useState({
    fullname: '',
    email: '',
    phone: '',
    title: '',
    accountId: '',
  });

  // Fetch data
  const { data: contact, isLoading: isLoadingContact, error } = useContact(id || '');
  const { data: accounts = [] } = useAccountList();
  const { data: allOpportunities = [] } = useOpportunityList();
  const { data: allActivities = [] } = useActivityList();

  // Prefetch related entity detail chunks (account, opportunity, activity)
  useEffect(() => {
    import('@/lib/prefetch').then(({ prefetchRelated }) => prefetchRelated('contact'));
  }, []);
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();
  const queryClient = useQueryClient();

  // Pull to refresh handler
  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['contact', id] }),
      queryClient.invalidateQueries({ queryKey: ['account-list'] }),
      queryClient.invalidateQueries({ queryKey: ['opportunity-list'] }),
      queryClient.invalidateQueries({ queryKey: ['activity-list'] }),
    ]);
  }, [queryClient, id]);

  // Initialize edit form when contact loads
  useMemo(() => {
    if (contact && isEditMode) {
      setEditForm({
        fullname: contact.fullname || '',
        email: contact.email || '',
        phone: contact.phone || '',
        title: contact.title || '',
        accountId: contact.account?.id || '',
      });
    }
  }, [contact, isEditMode]);

  // Get account data
  const accountData = useMemo(() => {
    if (!contact?.account?.id) return undefined;
    return accounts.find((a: Account) => a.id === contact.account?.id);
  }, [contact, accounts]);

  // Filter opportunities and activities related to the contact's account
  const opportunities = useMemo(() => 
    allOpportunities.filter((o: Opportunity) => o.account?.id === contact?.account?.id), 
    [allOpportunities, contact]);
  
  const activities = useMemo(() =>
    allActivities.filter((a: Activity) => a.account?.id === contact?.account?.id),
    [allActivities, contact]);

  // Copilot context for agent awareness
  const copilot = useCopilot();

  // Set page context for Copilot agent awareness
  useEffect(() => {
    if (!contact) return;
    
    copilot.setPageContext({
      currentPage: locale === 'zh-Hans' ? '联系人详情' : 'Contact Detail',
      summary: locale === 'zh-Hans'
        ? `查看联系人: ${contact.fullname}，职位: ${contact.title || '未设置'}，公司: ${accountData?.name1 || '无关联客户'}，${opportunities.length}个相关商机`
        : `Viewing contact: ${contact.fullname}, Title: ${contact.title || 'Not set'}, Company: ${accountData?.name1 || 'No linked account'}, ${opportunities.length} related opportunities`,
      pageData: {
        contactId: contact.id,
        contactName: contact.fullname,
        title: contact.title,
        email: contact.email,
        phone: contact.phone,
        accountId: contact.account?.id,
        accountName: accountData?.name1,
        opportunitiesCount: opportunities.length,
        activitiesCount: activities.length,
      },
    });
    
    return () => {
      copilot.setPageContext(null);
    };
  }, [contact, accountData, opportunities.length, activities.length, locale, copilot.setPageContext]);

  const handleDelete = async () => {
    if (!contact) return;
    if (deleteContact.isPending) return; // guard against double-tap
    try {
      await deleteContact.mutateAsync(contact.id);
      // Returning to the list (item now gone) is the feedback; no toast.
      navigate('/contacts');
    } catch (err: unknown) {
      toast.error('Failed to delete contact');
    }
  };

  const handleSave = async () => {
    if (!contact) return;
    if (updateContact.isPending) return; // guard against double-tap
    try {
      const selectedAccount = accounts.find((a: Account) => a.id === editForm.accountId);
      await updateContact.mutateAsync({
        id: contact.id,
        changedFields: {
          fullname: editForm.fullname,
          email: editForm.email || undefined,
          phone: editForm.phone || undefined,
          title: editForm.title || undefined,
          account: selectedAccount ? { id: selectedAccount.id, name1: selectedAccount.name1 } : contact.account,
        },
      });
      // Exiting edit mode reveals the updated fields inline; no toast.
      setIsEditMode(false);
    } catch (err: unknown) {
      toast.error('Failed to update contact');
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    if (contact) {
      setEditForm({
        fullname: contact.fullname || '',
        email: contact.email || '',
        phone: contact.phone || '',
        title: contact.title || '',
        accountId: contact.account?.id || '',
      });
    }
  };

  if (isLoadingContact) {
    return (
      <MobileLayout title={t('contactDetails', locale)}>
        <div className="px-4 pb-40 space-y-4 mt-4">
          <div className="glass-card p-4 animate-pulse" style={{ borderRadius: 20 }}>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-muted/50" />
              <div className="flex-1 space-y-2">
                <div className="h-6 w-2/3 rounded bg-muted/50" />
                <div className="h-4 w-1/2 rounded bg-muted/40" />
              </div>
            </div>
          </div>
          <div className="glass-card p-4 animate-pulse space-y-3" style={{ borderRadius: 20 }}>
            {[0,1,2,3].map(i => <div key={i} className="flex justify-between"><div className="h-4 w-20 rounded bg-muted/40" /><div className="h-4 w-32 rounded bg-muted/50" /></div>)}
          </div>
          <div className="glass-card p-4 animate-pulse space-y-3" style={{ borderRadius: 20 }}>
            <div className="h-5 w-28 rounded bg-muted/50" />
            {[0,1].map(i => <div key={i} className="h-12 rounded-lg bg-muted/30" />)}
          </div>
        </div>
      </MobileLayout>
    );
  }

  if (error || !contact) {
    return (
      <MobileLayout title="Contact">
        <Empty className="py-20">
          <EmptyHeader>
            <User className="w-16 h-16 mx-auto mb-4 text-muted-foreground/40" />
            <EmptyTitle>Contact not found</EmptyTitle>
            <EmptyDescription>This record may have been deleted</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/contacts')}>
            Back to Contacts
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
          aria-label="Delete contact"
        >
          <Trash2 className="w-5 h-5 text-destructive" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Contact</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this contact? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleteContact.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteContact.isPending ? (
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
        aria-label={t('editContact', locale)}
      >
        <Edit className="w-5 h-5 text-foreground" />
      </button>
      {deleteButton}
    </div>
  );

  // Edit Mode UI
  if (isEditMode) {
    return (
      <MobileLayout title="Edit Contact" hideVoiceButton headerRight={deleteButton}>
        <motion.div
          className="py-4 space-y-4 pb-32"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' as const }}
        >
          <GlassCard className="space-y-4">
            <div className="space-y-3">
              <div>
                <Label htmlFor="fullname">Full Name *</Label>
                <Input
                  id="fullname"
                  value={editForm.fullname}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, fullname: e.target.value })}
                  placeholder="Enter full name"
                />
              </div>

              <div>
                <Label htmlFor="title">Job Title</Label>
                <Input
                  id="title"
                  value={editForm.title}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, title: e.target.value })}
                  placeholder="e.g., Sales Manager"
                />
              </div>

              <div>
                <Label htmlFor="account">Account</Label>
                <Select
                  value={editForm.accountId || 'none'}
                  onValueChange={(val: string) => setEditForm({ ...editForm, accountId: val === 'none' ? '' : val })}
                >
                  <SelectTrigger id="account">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {accounts.filter((a: Account) => a.id).map((account: Account) => (
                      <SelectItem key={account.id} value={account.id}>{account.name1}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={editForm.email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="contact@example.com"
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
              disabled={!editForm.fullname || updateContact.isPending}
            >
              {updateContact.isPending ? (
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

  // View Mode UI
  return (
    <MobileLayout title="Contact Details" hideVoiceButton headerRight={viewHeaderActions}>
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
              <User className="w-7 h-7 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-foreground truncate">{contact.fullname}</h1>
              {contact.title && (
                <p className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
                  <Briefcase className="w-3.5 h-3.5" />
                  {contact.title}
                </p>
              )}
              {contact.account?.name1 && (
                <button
                  className="text-sm text-primary flex items-center gap-1 hover:underline"
                  onClick={() => navigate(`/accounts/${contact.account?.id}`)}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  {contact.account.name1}
                  <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Contact Actions */}
          <div className="flex gap-2 pt-4 border-t border-border/50">
            {contact.phone && (
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => window.open(`tel:${contact.phone}`)}
              >
                <Phone className="w-4 h-4" />
                Call
              </Button>
            )}
            {contact.email && (
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => window.open(`mailto:${contact.email}`)}
              >
                <Mail className="w-4 h-4" />
                Email
              </Button>
            )}
          </div>
        </GlassCard>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-3 bg-muted/50">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="opportunities">Deals ({opportunities.length})</TabsTrigger>
            <TabsTrigger value="activities">Activities ({activities.length})</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            {/* Contact Info */}
            <GlassCard>
              <h3 className="text-sm font-medium text-foreground mb-3">Contact Info</h3>
              <div className="space-y-3">
                {contact.email && (
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">{contact.email}</span>
                  </div>
                )}
                {contact.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">{contact.phone}</span>
                  </div>
                )}
                {!contact.email && !contact.phone && (
                  <p className="text-sm text-muted-foreground">No contact info available</p>
                )}
              </div>
            </GlassCard>

            {/* Account Info */}
            {accountData && (
              <GlassCard>
                <h3 className="text-sm font-medium text-foreground mb-3">Account</h3>
                <div
                  className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 -mx-3 px-3 py-2 rounded-lg transition-colors"
                  onClick={() => navigate(`/accounts/${accountData.id}`)}
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{accountData.name1}</p>
                    <p className="text-xs text-muted-foreground">{accountData.industry || 'Uncategorized'}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </GlassCard>
            )}
          </TabsContent>

          {/* Opportunities Tab */}
          <TabsContent value="opportunities" className="mt-4 space-y-3">
            {opportunities.length === 0 ? (
              <Empty className="py-8">
                <EmptyHeader>
                  <TrendingUp className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
                  <EmptyTitle>No opportunities</EmptyTitle>
                  <EmptyDescription>No deals linked to this contact's account</EmptyDescription>
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
                  <EmptyDescription>No activities linked to this contact's account</EmptyDescription>
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
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px]',
                              activity.status === 'completed' && 'text-emerald-600 border-emerald-200'
                            )}
                          >
                            {activity.status}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(activity.scheduleddate)}
                        {activity.type && ` • ${activity.type}`}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </motion.div>
      </PullToRefresh>

    </MobileLayout>
  );
}
