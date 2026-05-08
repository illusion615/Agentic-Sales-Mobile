/**
 * Form Card Components for Copilot Chat
 * Renders read-only draft forms for Activity, Opportunity, and Account
 * within the chat interface for user confirmation.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Check, Pencil, X, Calendar, User, Building2, Phone, Mail, MapPin, DollarSign, TrendingUp, FileText, Clock, Tag, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getLocale, type Locale } from '@/lib/i18n';
import { useCopilot } from '@/contexts/copilot-context';
import { toast } from 'sonner';
import { initialize } from '@microsoft/power-apps/app';

// Hooks for creating records (use mutations for cache invalidation)
import { useCreateActivity } from '@/generated/hooks/use-activity';
import { useCreateOpportunity } from '@/generated/hooks/use-opportunity';
import { useCreateAccount, useAccountList } from '@/generated/hooks/use-account';
import type { Activity, ActivityTypekey, ActivityDraftstatuskey } from '@/generated/models/activity-model';
import type { Opportunity, OpportunityStagekey } from '@/generated/models/opportunity-model';
import type { Account, AccountRegionkey, AccountTierkey } from '@/generated/models/account-model';
import { AccountRegionkeyToLabel, AccountTierkeyToLabel } from '@/generated/models/account-model';
import { useUser } from '@/hooks/use-user';

export interface FormCardData {
  type: 'activity' | 'opportunity' | 'account';
  isNew: boolean;
  existingId?: string;
  data: Record<string, unknown>;
  status?: 'pending' | 'confirmed' | 'modified';
}

interface FormCardProps {
  formCard: FormCardData;
  messageId: string;
  onStatusChange?: (status: 'confirmed' | 'modified') => void;
}

// Field row component for consistent styling
function FieldRow({ icon: Icon, label, value, className }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number | undefined;
  className?: string;
}) {
  if (!value && value !== 0) return null;
  return (
    <div className={cn('flex items-start gap-2 py-1.5', className)}>
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-xs text-muted-foreground">{label}</span>
        <p className="text-sm text-foreground truncate">{String(value)}</p>
      </div>
    </div>
  );
}

// Activity Form Card
function ActivityFormCard({ data, onConfirm, onModify, isConfirming, locale }: {
  data: Record<string, unknown>;
  onConfirm: () => void;
  onModify: () => void;
  isConfirming: boolean;
  locale: Locale;
}) {
  const typeLabels: Record<string, { zh: string; en: string }> = {
    visit: { zh: '拜访', en: 'Visit' },
    call: { zh: '电话', en: 'Call' },
    meeting: { zh: '会议', en: 'Meeting' },
    email: { zh: '邮件', en: 'Email' },
    other: { zh: '其他', en: 'Other' },
  };

  const activityType = data.type as string || 'visit';
  const typeLabel = locale === 'zh-Hans' 
    ? typeLabels[activityType]?.zh || activityType
    : typeLabels[activityType]?.en || activityType;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Calendar className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h4 className="font-medium text-sm text-foreground">
            {locale === 'zh-Hans' ? '新建活动' : 'New Activity'}
          </h4>
          <span className="text-xs text-muted-foreground">{typeLabel}</span>
        </div>
      </div>

      <div className="bg-muted/30 rounded-lg p-3 space-y-1">
        <FieldRow icon={FileText} label={locale === 'zh-Hans' ? '标题' : 'Title'} value={data.title as string} />
        <FieldRow icon={Building2} label={locale === 'zh-Hans' ? '客户' : 'Account'} value={data.accountName as string} />
        <FieldRow icon={User} label={locale === 'zh-Hans' ? '联系人' : 'Contact'} value={data.contactName as string} />
        <FieldRow icon={Calendar} label={locale === 'zh-Hans' ? '日期' : 'Date'} value={data.scheduledDate as string} />
        <FieldRow icon={FileText} label={locale === 'zh-Hans' ? '结果' : 'Result'} value={data.result as string} />
        <FieldRow icon={TrendingUp} label={locale === 'zh-Hans' ? '下一步' : 'Next Step'} value={data.nextStep as string} />
        {typeof data.notes === 'string' && data.notes && (
          <FieldRow icon={FileText} label={locale === 'zh-Hans' ? '备注' : 'Notes'} value={data.notes} />
        )}
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onModify}
          disabled={isConfirming}
          className="flex-1"
        >
          <Pencil className="w-3.5 h-3.5 mr-1.5" />
          {locale === 'zh-Hans' ? '修改' : 'Modify'}
        </Button>
        <Button
          size="sm"
          onClick={onConfirm}
          disabled={isConfirming}
          className="flex-1"
        >
          {isConfirming ? (
            <span className="animate-pulse">{locale === 'zh-Hans' ? '保存中...' : 'Saving...'}</span>
          ) : (
            <>
              <Check className="w-3.5 h-3.5 mr-1.5" />
              {locale === 'zh-Hans' ? '确认' : 'Confirm'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// Opportunity Form Card
function OpportunityFormCard({ data, onConfirm, onModify, isConfirming, locale }: {
  data: Record<string, unknown>;
  onConfirm: () => void;
  onModify: () => void;
  isConfirming: boolean;
  locale: Locale;
}) {
  const stageLabels: Record<string, { zh: string; en: string }> = {
    prospecting: { zh: '发现', en: 'Prospecting' },
    qualification: { zh: '资质', en: 'Qualification' },
    proposal: { zh: '提案', en: 'Proposal' },
    negotiation: { zh: '谈判', en: 'Negotiation' },
    won: { zh: '成交', en: 'Won' },
    lost: { zh: '失败', en: 'Lost' },
  };

  const stage = data.stage as string || 'prospecting';
  const stageLabel = locale === 'zh-Hans'
    ? stageLabels[stage]?.zh || stage
    : stageLabels[stage]?.en || stage;

  const amount = data.amount as number || 0;
  const formattedAmount = locale === 'zh-Hans'
    ? `¥${(amount / 10000).toFixed(1)}万`
    : `$${(amount / 1000).toFixed(0)}k`;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-green-600" />
        </div>
        <div>
          <h4 className="font-medium text-sm text-foreground">
            {locale === 'zh-Hans' ? '新建商机' : 'New Opportunity'}
          </h4>
          <span className="text-xs text-muted-foreground">{stageLabel}</span>
        </div>
      </div>

      <div className="bg-muted/30 rounded-lg p-3 space-y-1">
        <FieldRow icon={FileText} label={locale === 'zh-Hans' ? '名称' : 'Name'} value={data.name as string} />
        <FieldRow icon={Building2} label={locale === 'zh-Hans' ? '客户' : 'Account'} value={data.accountName as string} />
        <FieldRow icon={DollarSign} label={locale === 'zh-Hans' ? '金额' : 'Amount'} value={formattedAmount} />
        <FieldRow icon={Tag} label={locale === 'zh-Hans' ? '阶段' : 'Stage'} value={stageLabel} />
        <FieldRow icon={TrendingUp} label={locale === 'zh-Hans' ? '信心度' : 'Confidence'} value={`${data.confidence || 50}%`} />
        <FieldRow icon={Calendar} label={locale === 'zh-Hans' ? '预计成交' : 'Expected Close'} value={data.expectedCloseDate as string} />
        {typeof data.lastAction === 'string' && data.lastAction && (
          <FieldRow icon={FileText} label={locale === 'zh-Hans' ? '最近动作' : 'Last Action'} value={data.lastAction} />
        )}
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onModify}
          disabled={isConfirming}
          className="flex-1"
        >
          <Pencil className="w-3.5 h-3.5 mr-1.5" />
          {locale === 'zh-Hans' ? '修改' : 'Modify'}
        </Button>
        <Button
          size="sm"
          onClick={onConfirm}
          disabled={isConfirming}
          className="flex-1"
        >
          {isConfirming ? (
            <span className="animate-pulse">{locale === 'zh-Hans' ? '保存中...' : 'Saving...'}</span>
          ) : (
            <>
              <Check className="w-3.5 h-3.5 mr-1.5" />
              {locale === 'zh-Hans' ? '确认' : 'Confirm'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// Account Form Card
function AccountFormCard({ data, onConfirm, onModify, isConfirming, locale }: {
  data: Record<string, unknown>;
  onConfirm: () => void;
  onModify: () => void;
  isConfirming: boolean;
  locale: Locale;
}) {
  // Region labels - handle both key format (Regionkey0) and display format (华东)
  const regionKeyToDisplay: Record<string, { zh: string; en: string }> = {
    'Regionkey0': { zh: '华东', en: 'East China' },
    'Regionkey1': { zh: '华北', en: 'North China' },
    'Regionkey2': { zh: '华南', en: 'South China' },
    'Regionkey3': { zh: '西南', en: 'Southwest China' },
    '华东': { zh: '华东', en: 'East China' },
    '华北': { zh: '华北', en: 'North China' },
    '华南': { zh: '华南', en: 'South China' },
    '西南': { zh: '西南', en: 'Southwest China' },
  };

  // Tier labels - handle both key format (Tierkey0) and display format (S)
  const tierKeyToDisplay: Record<string, { zh: string; en: string }> = {
    'Tierkey0': { zh: 'S级', en: 'S-Tier' },
    'Tierkey1': { zh: 'A级', en: 'A-Tier' },
    'Tierkey2': { zh: 'B级', en: 'B-Tier' },
    'Tierkey3': { zh: 'C级', en: 'C-Tier' },
    'S': { zh: 'S级', en: 'S-Tier' },
    'A': { zh: 'A级', en: 'A-Tier' },
    'B': { zh: 'B级', en: 'B-Tier' },
    'C': { zh: 'C级', en: 'C-Tier' },
  };

  const region = data.region as string || '';
  const tier = data.tier as string || '';
  const regionLabel = locale === 'zh-Hans' 
    ? regionKeyToDisplay[region]?.zh || region
    : regionKeyToDisplay[region]?.en || region;
  const tierLabel = locale === 'zh-Hans'
    ? tierKeyToDisplay[tier]?.zh || tier
    : tierKeyToDisplay[tier]?.en || tier;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
          <Building2 className="w-4 h-4 text-blue-600" />
        </div>
        <div>
          <h4 className="font-medium text-sm text-foreground">
            {locale === 'zh-Hans' ? '新建客户' : 'New Account'}
          </h4>
          {tier && <span className="text-xs text-muted-foreground">{tierLabel}</span>}
        </div>
      </div>

      <div className="bg-muted/30 rounded-lg p-3 space-y-1">
        <FieldRow icon={Building2} label={locale === 'zh-Hans' ? '名称' : 'Name'} value={data.name as string} />
        <FieldRow icon={Tag} label={locale === 'zh-Hans' ? '行业' : 'Industry'} value={data.industry as string} />
        <FieldRow icon={MapPin} label={locale === 'zh-Hans' ? '区域' : 'Region'} value={regionLabel} />
        <FieldRow icon={Tag} label={locale === 'zh-Hans' ? '等级' : 'Tier'} value={tierLabel} />
        <FieldRow icon={Phone} label={locale === 'zh-Hans' ? '电话' : 'Phone'} value={data.phone as string} />
        <FieldRow icon={Mail} label={locale === 'zh-Hans' ? '邮箱' : 'Email'} value={data.email as string} />
        <FieldRow icon={MapPin} label={locale === 'zh-Hans' ? '地址' : 'Address'} value={data.address as string} />
        {typeof data.notes === 'string' && data.notes && (
          <FieldRow icon={FileText} label={locale === 'zh-Hans' ? '备注' : 'Notes'} value={data.notes} />
        )}
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onModify}
          disabled={isConfirming}
          className="flex-1"
        >
          <Pencil className="w-3.5 h-3.5 mr-1.5" />
          {locale === 'zh-Hans' ? '修改' : 'Modify'}
        </Button>
        <Button
          size="sm"
          onClick={onConfirm}
          disabled={isConfirming}
          className="flex-1"
        >
          {isConfirming ? (
            <span className="animate-pulse">{locale === 'zh-Hans' ? '保存中...' : 'Saving...'}</span>
          ) : (
            <>
              <Check className="w-3.5 h-3.5 mr-1.5" />
              {locale === 'zh-Hans' ? '确认' : 'Confirm'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// Confirmed status badge
function ConfirmedBadge({ locale }: { locale: Locale }) {
  return (
    <div className="flex items-center gap-1.5 text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-md">
      <Check className="w-3.5 h-3.5" />
      <span className="text-xs font-medium">
        {locale === 'zh-Hans' ? '已保存' : 'Saved'}
      </span>
    </div>
  );
}

// Main Form Card Component
export function FormCard({ formCard, messageId, onStatusChange }: FormCardProps) {
  const navigate = useNavigate();
  const locale: Locale = getLocale();
  const copilot = useCopilot();
  const { data: user } = useUser();
  const [isConfirming, setIsConfirming] = useState(false);
  const [status, setStatus] = useState<'pending' | 'confirmed' | 'modified'>(formCard.status || 'pending');
  const [createdRecordId, setCreatedRecordId] = useState<string | null>(null);

  // Use mutation hooks for proper cache invalidation
  const createActivity = useCreateActivity();
  const createOpportunity = useCreateOpportunity();
  const createAccount = useCreateAccount();

  // Handle confirmation - create the record
  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      const { type, data } = formCard;

      await initialize();
      if (type === 'activity') {
        // Create activity
        const typeKeyMap: Record<string, ActivityTypekey> = {
          visit: 'Typekey0',
          call: 'Typekey1',
          meeting: 'Typekey2',
          email: 'Typekey3',
          other: 'Typekey4',
        };
        const activityType = data.type as string || 'visit';
        const typeKey = typeKeyMap[activityType] || 'Typekey0';
        
        // Find account by name for lookup
        const accounts = await import('@/generated/services/account-service').then(m => m.AccountService.getAll());
        const targetAccount = accounts.find((a: Account) => a.name1 === data.accountName);
        
        const createInput: Omit<Activity, 'id'> = {
          title: data.title as string || '',
          typeKey,
          draftstatusKey: 'Draftstatuskey0' as ActivityDraftstatuskey,
          ownerid: user?.objectId || 'unknown',
          scheduleddate: data.scheduledDate as string || new Date().toISOString(),
          notes: `${data.result || ''}\n\n下一步: ${data.nextStep || ''}`,
          // Set account lookup if found
          ...(targetAccount && { account: { id: targetAccount.id, name1: targetAccount.name1 } }),
        };
        const createdActivity = await createActivity.mutateAsync(createInput);
        setCreatedRecordId(createdActivity.id);
        toast.success(locale === 'zh-Hans' ? '活动已创建' : 'Activity created');
      } else if (type === 'opportunity') {
        // Create opportunity
        const stageKeyMap: Record<string, OpportunityStagekey> = {
          prospecting: 'Stagekey0',
          qualification: 'Stagekey1',
          proposal: 'Stagekey2',
          negotiation: 'Stagekey3',
          won: 'Stagekey4',
          lost: 'Stagekey5',
        };
        const stage = data.stage as string || 'prospecting';
        const stageKey = stageKeyMap[stage] || 'Stagekey0';
        
        // Find account by name for lookup
        const accounts = await import('@/generated/services/account-service').then(m => m.AccountService.getAll());
        const targetAccount = accounts.find((a: Account) => a.name1 === data.accountName);
        
        if (!targetAccount) {
          toast.error(locale === 'zh-Hans' ? '未找到关联客户，请先创建客户' : 'Account not found, please create account first');
          setIsConfirming(false);
          return;
        }
        
        const createdOpp = await createOpportunity.mutateAsync({
          name1: data.name as string || '',
          // Account lookup is required
          account: { id: targetAccount.id, name1: targetAccount.name1 },
          totalamount: data.amount as number || 0,
          stageKey,
          confidence: data.confidence as number || 50,
          expectedclosedate: data.expectedCloseDate as string || '',
          lastaction: data.lastAction as string || '',
          ownerid: user?.objectId || 'unknown',
        } as Omit<Opportunity, 'id'>);
        setCreatedRecordId(createdOpp.id);

        toast.success(locale === 'zh-Hans' ? '商机已创建' : 'Opportunity created');
      } else if (type === 'account') {
        // Create account
        const regionKeyMap: Record<string, AccountRegionkey> = {
          '华东': 'Regionkey0',
          '华北': 'Regionkey1',
          '华南': 'Regionkey2',
          '西南': 'Regionkey3',
        };
        const tierKeyMap: Record<string, AccountTierkey> = {
          S: 'Tierkey0',
          A: 'Tierkey1',
          B: 'Tierkey2',
          C: 'Tierkey3',
        };
        const region = data.region as string || '';
        const tier = data.tier as string || '';
        const regionKey = regionKeyMap[region] || 'Regionkey0';
        const tierKey = tierKeyMap[tier] || 'Tierkey3';
        
        const createdAccount = await createAccount.mutateAsync({
          name1: data.name as string || '',
          industry: data.industry as string || '',
          regionKey,
          tierKey,
          phone: data.phone as string || '',
          email: data.email as string || '',
          address: data.address as string || '',
          ownerid: user?.objectId || 'unknown',
        } as Omit<Account, 'id'>);
        setCreatedRecordId(createdAccount.id);

        toast.success(locale === 'zh-Hans' ? '客户已创建' : 'Account created');
      }

      setStatus('confirmed');
      onStatusChange?.('confirmed');
    } catch (error) {
      console.error('Failed to create record:', error);
      toast.error(locale === 'zh-Hans' ? '创建失败，请重试' : 'Failed to create, please try again');
    } finally {
      setIsConfirming(false);
    }
  };

  // Handle modification - navigate to edit page
  const handleModify = () => {
    const { type, data, existingId } = formCard;
    
    // Close copilot panel
    copilot.closePanel();
    
    // Navigate to appropriate edit page with pre-filled data
    if (type === 'activity') {
      // Navigate to activity capture with draft data in state
      navigate('/activity-capture', { 
        state: { draftData: data }
      });
    } else if (type === 'opportunity') {
      if (existingId) {
        navigate(`/opportunity/${existingId}?edit=true`);
      } else {
        navigate('/opportunity-draft-review', {
          state: { draftData: data }
        });
      }
    } else if (type === 'account') {
      if (existingId) {
        // Navigate to existing client detail with edit mode
        navigate(`/clients/${existingId}?edit=true`);
      } else {
        // Navigate to clients page with draft data for new account creation
        navigate('/clients', {
          state: { draftData: data, isNew: true }
        });
      }
    }
    
    setStatus('modified');
    onStatusChange?.('modified');
  };

  // If already confirmed, show simplified view with click to navigate
  if (status === 'confirmed') {
    const handleConfirmedClick = () => {
      const { type } = formCard;
      
      // Close copilot panel first
      copilot.closePanel();
      
      // Navigate to the created record after a small delay for panel collapse animation
      setTimeout(() => {
        if (type === 'activity') {
          // Navigate to activity capture page
          navigate('/activity-capture', { state: { highlightId: createdRecordId } });
        } else if (type === 'opportunity') {
          // Navigate to opportunity review or detail page
          if (createdRecordId) {
            navigate('/opportunity-review', { state: { opportunityId: createdRecordId } });
          } else {
            navigate('/opportunity-review');
          }
        } else if (type === 'account') {
          // Navigate to account detail page
          if (createdRecordId) {
            navigate(`/accounts/${createdRecordId}`);
          } else {
            navigate('/accounts');
          }
        }
      }, 150);
    };
    
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card p-3 rounded-xl cursor-pointer hover:bg-muted/30 active:scale-[0.98] transition-all"
        onClick={handleConfirmedClick}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {formCard.type === 'activity' && <Calendar className="w-4 h-4 text-primary" />}
            {formCard.type === 'opportunity' && <TrendingUp className="w-4 h-4 text-green-600" />}
            {formCard.type === 'account' && <Building2 className="w-4 h-4 text-blue-600" />}
            <span className="text-sm font-medium text-foreground">
              {formCard.data.title as string || formCard.data.name as string || ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ConfirmedBadge locale={locale} />
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
      </motion.div>
    );
  }

  // Render the appropriate form card based on type
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as const }}
      className="glass-card p-4 rounded-xl"
    >
      {formCard.type === 'activity' && (
        <ActivityFormCard
          data={formCard.data}
          onConfirm={handleConfirm}
          onModify={handleModify}
          isConfirming={isConfirming}
          locale={locale}
        />
      )}
      {formCard.type === 'opportunity' && (
        <OpportunityFormCard
          data={formCard.data}
          onConfirm={handleConfirm}
          onModify={handleModify}
          isConfirming={isConfirming}
          locale={locale}
        />
      )}
      {formCard.type === 'account' && (
        <AccountFormCard
          data={formCard.data}
          onConfirm={handleConfirm}
          onModify={handleModify}
          isConfirming={isConfirming}
          locale={locale}
        />
      )}
    </motion.div>
  );
}
