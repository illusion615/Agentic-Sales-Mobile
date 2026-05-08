import { useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Building2,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Clock,
  Edit,
  Plus,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  User,
  Trash2,
  Save,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { useAccount, useUpdateAccount, useDeleteAccount } from '@/generated/hooks/use-account';
import { useContactList } from '@/generated/hooks/use-contact';
import { useOpportunityList } from '@/generated/hooks/use-opportunity';
import { useActivityList } from '@/generated/hooks/use-activity';
import {
  AccountTierkeyToLabel,
  AccountRegionkeyToLabel,
  AccountCreditstatuskeyToLabel,
} from '@/generated/models/account-model';
import type { AccountTierkey, AccountRegionkey, AccountCreditstatuskey } from '@/generated/models/account-model';
import { OpportunityStagekeyToLabel } from '@/generated/models/opportunity-model';
import type { Opportunity, OpportunityStagekey } from '@/generated/models/opportunity-model';
import { ActivityTypekeyToLabel, ActivityDraftstatuskeyToLabel } from '@/generated/models/activity-model';
import type { Activity, ActivityTypekey, ActivityDraftstatuskey } from '@/generated/models/activity-model';
import type { Contact } from '@/generated/models/contact-model';
import { getRegionEnglish } from '@/lib/display-labels';
import { toast } from 'sonner';
import { getLocale } from '@/lib/i18n';

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

function getActivityTypeIcon(typeKey: ActivityTypekey | null | undefined): string {
  switch (typeKey) {
    case 'Typekey0': return '📍'; // visit
    case 'Typekey1': return '📞'; // call
    case 'Typekey2': return '📅'; // meeting
    case 'Typekey3': return '✉️'; // email
    default: return '📌';
  }
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(searchParams.get('edit') === 'true');
  const locale = getLocale();

  // Edit form state
  const [editForm, setEditForm] = useState({
    name1: '',
    industry: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
    tierKey: '' as AccountTierkey | '',
    regionKey: '' as AccountRegionkey | '',
  });

  // Fetch data from Dataverse
  const { data: account, isLoading: isLoadingAccount } = useAccount(id || '');
  const { data: allContacts = [] } = useContactList();
  const { data: allOpportunities = [] } = useOpportunityList();
  const { data: allActivities = [] } = useActivityList();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();

  // Initialize edit form when account loads
  useMemo(() => {
    if (account && isEditMode) {
      setEditForm({
        name1: account.name1 || '',
        industry: account.industry || '',
        phone: account.phone || '',
        email: account.email || '',
        address: account.address || '',
        notes: account.notes || '',
        tierKey: (account.tierKey as AccountTierkey) || '',
        regionKey: (account.regionKey as AccountRegionkey) || '',
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

  // Calculate stats
  const totalPipelineValue = opportunities.reduce(
    (sum: number, opp: Opportunity) => sum + (opp.totalamount || 0),
    0
  );
  const wonStageKey = 'Stagekey4';
  const lostStageKey = 'Stagekey5';
  const activeDeals = opportunities.filter(
    (opp: Opportunity) => opp.stageKey !== wonStageKey && opp.stageKey !== lostStageKey
  );
  const daysSinceContact = getDaysSince(account?.lastcontactedon || account?.lastinteractiondate);

  const handleDelete = async () => {
    if (!account) return;
    try {
      await deleteAccount.mutateAsync(account.id);
      toast.success('Client deleted');
      navigate('/clients');
    } catch (error: unknown) {
      toast.error('Failed to delete client');
    }
  };

  const handleSave = async () => {
    if (!account) return;
    try {
      await updateAccount.mutateAsync({
        id: account.id,
        changedFields: {
          name1: editForm.name1,
          industry: editForm.industry,
          phone: editForm.phone,
          email: editForm.email,
          address: editForm.address,
          notes: editForm.notes,
          tierKey: editForm.tierKey || undefined,
          regionKey: editForm.regionKey || undefined,
        },
      });
      toast.success('Client updated');
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
        phone: account.phone || '',
        email: account.email || '',
        address: account.address || '',
        notes: account.notes || '',
        tierKey: (account.tierKey as AccountTierkey) || '',
        regionKey: (account.regionKey as AccountRegionkey) || '',
      });
    }
  };

  if (isLoadingAccount) {
    return (
      <MobileLayout title="Client">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </MobileLayout>
    );
  }

  if (!account) {
    return (
      <MobileLayout title="Client">
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <Building2 className="w-16 h-16 text-muted-foreground/40" />
          <p className="text-muted-foreground">Client not found</p>
          <Button variant="outline" onClick={() => navigate('/clients')}>
            Back to Clients
          </Button>
        </div>
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
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="tier">Tier</Label>
                  <Select
                    value={editForm.tierKey || 'none'}
                    onValueChange={(val: string) => setEditForm({ ...editForm, tierKey: val === 'none' ? '' : val as AccountTierkey })}
                  >
                    <SelectTrigger id="tier">
                      <SelectValue placeholder="Select tier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {Object.entries(AccountTierkeyToLabel).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="region">Region</Label>
                  <Select
                    value={editForm.regionKey || 'none'}
                    onValueChange={(val: string) => setEditForm({ ...editForm, regionKey: val === 'none' ? '' : val as AccountRegionkey })}
                  >
                    <SelectTrigger id="region">
                      <SelectValue placeholder="Select region" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {Object.entries(AccountRegionkeyToLabel).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{getRegionEnglish(label)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
              <Save className="w-4 h-4" />
              Save
            </Button>
          </div>
        </motion.div>
      </MobileLayout>
    );
  }

  // View Mode UI
  return (
    <MobileLayout title="Client Details" hideVoiceButton headerRight={deleteButton}>
      {/* Main scrollable content */}
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
                {account.tierKey && (
                  <Badge variant="secondary" className="flex-shrink-0">
                    {AccountTierkeyToLabel[account.tierKey as AccountTierkey]}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                {account.industry || 'Uncategorized'}
                {account.regionKey && ` • ${getRegionEnglish(AccountRegionkeyToLabel[account.regionKey as AccountRegionkey])}`}
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
                {account.creditstatusKey && account.creditstatusKey !== 'Creditstatuskey0' && (
                  <Badge variant="outline" className="gap-1 text-amber-600 border-amber-200 dark:border-amber-900">
                    {AccountCreditstatuskeyToLabel[account.creditstatusKey as AccountCreditstatuskey]}
                  </Badge>
                )}
              </div>
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
            <TabsTrigger value="activities">Activities</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            {/* Contact Info */}
            <GlassCard>
              <h3 className="text-sm font-medium text-foreground mb-3">Contact Info</h3>
              <div className="space-y-3">
                {account.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">{account.phone}</span>
                  </div>
                )}
                {account.email && (
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">{account.email}</span>
                  </div>
                )}
                {account.address && (
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">{account.address}</span>
                  </div>
                )}
              </div>
            </GlassCard>

            {/* Last Interaction */}
            <GlassCard>
              <h3 className="text-sm font-medium text-foreground mb-3">Last Interaction</h3>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-foreground">
                    {formatDate(account.lastcontactedon || account.lastinteractiondate)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {daysSinceContact} days ago
                  </p>
                </div>
              </div>
            </GlassCard>

            {/* Notes */}
            {account.notes && (
              <GlassCard>
                <h3 className="text-sm font-medium text-foreground mb-2">Notes</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {account.notes}
                </p>
              </GlassCard>
            )}
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
                  className="glass-card p-3"
                  style={{ borderRadius: 14 }}
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
                    <div className="flex gap-2">
                      {contact.phone && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => window.open(`tel:${contact.phone}`)}
                        >
                          <Phone className="w-4 h-4" />
                        </Button>
                      )}
                      {contact.email && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => window.open(`mailto:${contact.email}`)}
                        >
                          <Mail className="w-4 h-4" />
                        </Button>
                      )}
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
                      {OpportunityStagekeyToLabel[opp.stageKey as OpportunityStagekey]}
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
                    <div className="text-xl flex-shrink-0">
                      {getActivityTypeIcon(activity.typeKey)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-medium text-foreground truncate">
                          {activity.title}
                        </h4>
                        {activity.draftstatusKey && (
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px]',
                              activity.draftstatusKey === 'Draftstatuskey2' && 'text-emerald-600 border-emerald-200'
                            )}
                          >
                            {ActivityDraftstatuskeyToLabel[activity.draftstatusKey as ActivityDraftstatuskey]}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mb-1">
                        {formatDate(activity.scheduleddate)}
                        {activity.typeKey && ` • ${ActivityTypekeyToLabel[activity.typeKey as ActivityTypekey]}`}
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

      {/* Quick Actions - positioned above global copilot */}
      <div className="fixed bottom-20 left-0 right-0 z-40 safe-area-bottom pointer-events-none" style={{ background: 'linear-gradient(to top, var(--background) 40%, transparent)' }}>
        <div className="flex items-center justify-center gap-2 px-4 pointer-events-auto">
          <button
            onClick={() => navigate('/activity-capture')}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5',
              'rounded-full glass-card-hover',
              'text-xs font-medium text-foreground',
              'active:scale-95 transition-transform'
            )}
          >
            <Plus className="w-4 h-4 text-primary" />
            <span>{locale === 'zh-Hans' ? '新建活动' : 'New Activity'}</span>
          </button>
          <button
            onClick={() => setIsEditMode(true)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5',
              'rounded-full glass-card-hover',
              'text-xs font-medium text-foreground',
              'active:scale-95 transition-transform'
            )}
          >
            <Edit className="w-4 h-4 text-primary" />
            <span>{locale === 'zh-Hans' ? '编辑' : 'Edit'}</span>
          </button>
        </div>
      </div>
    </MobileLayout>
  );
}
