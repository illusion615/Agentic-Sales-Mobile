import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lightbulb, ChevronRight, Check, X, MapPin, Phone, Calendar, Mail, CheckSquare, Building2, Users, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { getLocale, type Locale } from '@/lib/i18n';
import { useCopilot } from '@/contexts/copilot-context';
import { useCreateActivity } from '@/generated/hooks/use-activity';
import { useCreateOpportunity } from '@/generated/hooks/use-opportunity';
import { useCreateAccount } from '@/generated/hooks/use-account';
import { useCreateContact } from '@/generated/hooks/use-contact';
import { toast } from 'sonner';

export interface AdditionalIntentForm {
  type: 'activity' | 'opportunity' | 'account' | 'contact';
  data: Record<string, unknown>;
  reason: string;
  batchIndex: number;
}

export interface AdditionalIntentsData {
  message: string;
  forms: AdditionalIntentForm[];
}

interface AdditionalIntentsCardProps {
  messageId: string;
  additionalIntents: AdditionalIntentsData;
}

const ActivityTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  visit: MapPin,
  call: Phone,
  meeting: Calendar,
  email: Mail,
  other: CheckSquare,
};

const EntityTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  activity: Calendar,
  opportunity: TrendingUp,
  account: Building2,
  contact: Users,
};

const EntityTypeLabels: Record<string, { zh: string; en: string }> = {
  activity: { zh: '活动', en: 'Activity' },
  opportunity: { zh: '商机', en: 'Opportunity' },
  account: { zh: '客户', en: 'Account' },
  contact: { zh: '联系人', en: 'Contact' },
};

export function AdditionalIntentsCard({ messageId, additionalIntents }: AdditionalIntentsCardProps) {
  const locale: Locale = getLocale();
  const { updateFormCardStatus } = useCopilot();
  
  // Get mutation hooks for each entity type
  const createActivityMutation = useCreateActivity();
  const createOpportunityMutation = useCreateOpportunity();
  const createAccountMutation = useCreateAccount();
  const createContactMutation = useCreateContact();
  
  // Track status of each form
  const [formStatuses, setFormStatuses] = useState<Record<number, 'pending' | 'confirmed' | 'skipped'>>({});
  const [isSubmitting, setIsSubmitting] = useState<number | null>(null);
  
  const handleConfirm = async (form: AdditionalIntentForm, index: number) => {
    setIsSubmitting(index);
    
    try {
      // Execute the appropriate create mutation based on type
      switch (form.type) {
        case 'activity':
          await createActivityMutation.mutateAsync(form.data as Parameters<typeof createActivityMutation.mutateAsync>[0]);
          break;
        case 'opportunity':
          await createOpportunityMutation.mutateAsync(form.data as Parameters<typeof createOpportunityMutation.mutateAsync>[0]);
          break;
        case 'account':
          await createAccountMutation.mutateAsync(form.data as Parameters<typeof createAccountMutation.mutateAsync>[0]);
          break;
        case 'contact':
          await createContactMutation.mutateAsync(form.data as Parameters<typeof createContactMutation.mutateAsync>[0]);
          break;
      }
      
      setFormStatuses(prev => ({ ...prev, [index]: 'confirmed' }));
      toast.success(locale === 'zh-Hans' 
        ? `${EntityTypeLabels[form.type].zh}已创建` 
        : `${EntityTypeLabels[form.type].en} created`);
    } catch (error: unknown) {
      toast.error(locale === 'zh-Hans' 
        ? `创建失败: ${error instanceof Error ? error.message : '未知错误'}` 
        : `Failed to create: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(null);
    }
  };
  
  const handleSkip = (index: number) => {
    setFormStatuses(prev => ({ ...prev, [index]: 'skipped' }));
  };
  
  // Get display info for an activity type
  const getActivityIcon = (data: Record<string, unknown>) => {
    const actType = (data.type as string) || 'other';
    return ActivityTypeIcons[actType] || CheckSquare;
  };
  
  const getFormTitle = (form: AdditionalIntentForm): string => {
    const data = form.data;
    switch (form.type) {
      case 'activity':
        return (data.subject as string) || (data.title as string) || (locale === 'zh-Hans' ? '新活动' : 'New Activity');
      case 'opportunity':
        return (data.name as string) || (data.title as string) || (locale === 'zh-Hans' ? '新商机' : 'New Opportunity');
      case 'account':
        return (data.name as string) || (locale === 'zh-Hans' ? '新客户' : 'New Account');
      case 'contact':
        return (data.fullName as string) || (data.name as string) || (locale === 'zh-Hans' ? '新联系人' : 'New Contact');
      default:
        return locale === 'zh-Hans' ? '新记录' : 'New Record';
    }
  };
  
  const getFormSubtitle = (form: AdditionalIntentForm): string | null => {
    const data = form.data;
    switch (form.type) {
      case 'activity': {
        const actType = data.type as string;
        const typeLabel = actType === 'visit' ? (locale === 'zh-Hans' ? '拜访' : 'Visit')
          : actType === 'call' ? (locale === 'zh-Hans' ? '电话' : 'Call')
          : actType === 'meeting' ? (locale === 'zh-Hans' ? '会议' : 'Meeting')
          : actType === 'email' ? (locale === 'zh-Hans' ? '邮件' : 'Email')
          : (locale === 'zh-Hans' ? '其他' : 'Other');
        const scheduledDate = data.scheduledDate as string;
        if (scheduledDate) {
          return `${typeLabel} · ${new Date(scheduledDate).toLocaleDateString(locale === 'zh-Hans' ? 'zh-CN' : 'en-US')}`;
        }
        return typeLabel;
      }
      case 'opportunity': {
        const stage = data.stage as string;
        const value = data.estimatedValue as number;
        const parts: string[] = [];
        if (stage) parts.push(stage);
        if (value) parts.push(`¥${value.toLocaleString()}`);
        return parts.length > 0 ? parts.join(' · ') : null;
      }
      case 'account':
        return (data.industry as string) || null;
      case 'contact':
        return (data.jobTitle as string) || (data.email as string) || null;
      default:
        return null;
    }
  };
  
  const pendingForms = additionalIntents.forms.filter((_, idx) => !formStatuses[idx]);
  const allProcessed = pendingForms.length === 0;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' as const }}
      className="max-w-full mt-3"
    >
      {/* Header */}
      <div className="flex items-start gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
          <Lightbulb className="w-4 h-4 text-purple-500" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            {additionalIntents.message || (locale === 'zh-Hans' ? '我还发现了以下可能需要记录的内容：' : 'I also found these items you might want to record:')}
          </p>
        </div>
      </div>
      
      {/* Forms List */}
      <div className="space-y-2 pl-10">
        <AnimatePresence mode="popLayout">
          {additionalIntents.forms.map((form: AdditionalIntentForm, idx: number) => {
            const status = formStatuses[idx];
            const Icon = form.type === 'activity' ? getActivityIcon(form.data) : EntityTypeIcons[form.type];
            const title = getFormTitle(form);
            const subtitle = getFormSubtitle(form);
            const isLoading = isSubmitting === idx;
            
            return (
              <motion.div
                key={`${messageId}-${idx}`}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10, height: 0 }}
                transition={{ delay: idx * 0.1, duration: 0.2 }}
                className={cn(
                  'rounded-xl border p-3 transition-all',
                  status === 'confirmed' 
                    ? 'bg-green-500/10 border-green-500/30' 
                    : status === 'skipped'
                    ? 'bg-muted/50 border-border/50 opacity-60'
                    : 'bg-card border-border hover:border-primary/50'
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                    status === 'confirmed' ? 'bg-green-500/20' : 'bg-primary/10'
                  )}>
                    {status === 'confirmed' ? (
                      <Check className="w-5 h-5 text-green-500" />
                    ) : (
                      <Icon className={cn(
                        'w-5 h-5',
                        status === 'skipped' ? 'text-muted-foreground' : 'text-primary'
                      )} />
                    )}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'px-1.5 py-0.5 rounded text-[10px] font-medium',
                        status === 'confirmed'
                          ? 'bg-green-500/20 text-green-600'
                          : status === 'skipped'
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-primary/10 text-primary'
                      )}>
                        {EntityTypeLabels[form.type][locale === 'zh-Hans' ? 'zh' : 'en']}
                      </span>
                    </div>
                    <p className={cn(
                      'text-sm font-medium mt-1 truncate',
                      status === 'skipped' ? 'text-muted-foreground' : 'text-foreground'
                    )}>
                      {title}
                    </p>
                    {subtitle && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {subtitle}
                      </p>
                    )}
                    {/* Reason */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1.5 italic">
                      <Lightbulb className="w-3 h-3 flex-shrink-0" />
                      <span>{form.reason}</span>
                    </div>
                  </div>
                  
                  {/* Actions */}
                  {!status && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSkip(idx)}
                        disabled={isLoading}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleConfirm(form, idx)}
                        disabled={isLoading}
                        className="h-8 px-3"
                      >
                        {isLoading ? (
                          <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <Check className="w-4 h-4 mr-1" />
                            {locale === 'zh-Hans' ? '确认' : 'Confirm'}
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                  
                  {/* Status indicator */}
                  {status === 'confirmed' && (
                    <span className="text-xs text-green-600 flex-shrink-0">
                      {locale === 'zh-Hans' ? '已创建' : 'Created'}
                    </span>
                  )}
                  {status === 'skipped' && (
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {locale === 'zh-Hans' ? '已跳过' : 'Skipped'}
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      
      {/* All processed message */}
      {allProcessed && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs text-muted-foreground mt-3 pl-10"
        >
          {locale === 'zh-Hans' ? '所有发现的项目已处理完毕' : 'All discovered items have been processed'}
        </motion.p>
      )}
    </motion.div>
  );
}
