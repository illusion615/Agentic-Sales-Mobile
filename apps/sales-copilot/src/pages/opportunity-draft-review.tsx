import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  MoreHorizontal,
  Pencil,
  Check,
  X,
  ChevronDown,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Mic,
  Mail,
  MapPin,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';
import { useActivity, useUpdateActivity } from '@/generated/hooks/use-activity';
import { useAccountList } from '@/generated/hooks/use-account';
import { useOpportunityList } from '@/generated/hooks/use-opportunity';
import { getLocale, type Locale } from '@/lib/i18n';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFirstMount } from '@/hooks/use-first-mount';

// i18n translations
const translations = {
  'zh-Hans': {
    oppDraft: '商机草稿',
    aiGenerated: 'AI 生成',
    pendingConfirm: '待确认',
    generatedFrom: '由 Activity #{id} 自动生成',
    account: '客户',
    stage: '阶段',
    amount: '金额',
    expectedClose: '预计成交日',
    nextAction: '下一步动作',
    owner: 'Owner',
    modifiedFields: '已修改 {count} 个字段，原 AI 值保留为 tooltip',
    sourceTracing: '来源追溯',
    abandon: '放弃',
    submit: '提交',
    submittedToQueue: '已入队，ERP 写回中',
    abandonedDraft: '已放弃草稿',
    regenerate: '重新让 AI 生成',
    rejectDraft: '拒绝草稿',
    processingAI: '正在处理 AI 草稿...',
    noActivity: '未找到活动记录',
    viewInReview: '在 OpportunityDraftReview 中打开',
    // Stage labels
    prospecting: '探索',
    qualification: '资质',
    proposal: '方案',
    negotiation: '谈判',
    won: '赢单',
    lost: '丢单',
    // Sources
    recordingMention: '录音 {time} 提到{content}',
    emailSource: '客户邮件 {date}',
    lastVisitSource: '上次拜访 {date}',
  },
  'en-US': {
    oppDraft: 'Opportunity Draft',
    aiGenerated: 'AI Generated',
    pendingConfirm: 'Pending',
    generatedFrom: 'Auto-generated from Activity #{id}',
    account: 'Account',
    stage: 'Stage',
    amount: 'Amount',
    expectedClose: 'Expected Close',
    nextAction: 'Next Action',
    owner: 'Owner',
    modifiedFields: '{count} field(s) modified, original AI values preserved as tooltip',
    sourceTracing: 'Source Tracing',
    abandon: 'Abandon',
    submit: 'Submit',
    submittedToQueue: 'Submitted to queue, ERP write-back in progress',
    abandonedDraft: 'Draft abandoned',
    regenerate: 'Regenerate with AI',
    rejectDraft: 'Reject Draft',
    processingAI: 'Processing AI draft...',
    noActivity: 'Activity not found',
    viewInReview: 'Open in OpportunityDraftReview',
    // Stage labels
    prospecting: 'Prospecting',
    qualification: 'Qualification',
    proposal: 'Proposal',
    negotiation: 'Negotiation',
    won: 'Won',
    lost: 'Lost',
    // Sources
    recordingMention: 'Recording at {time} mentioned {content}',
    emailSource: 'Client email {date}',
    lastVisitSource: 'Last visit {date}',
  },
};

function t(key: keyof (typeof translations)['zh-Hans'], locale: Locale, params?: Record<string, string | number>): string {
  let text = translations[locale][key] ?? translations['zh-Hans'][key] ?? key;
  if (params) {
    Object.entries(params).forEach(([k, v]: [string, string | number]) => {
      text = text.replace(`{${k}}`, String(v));
    });
  }
  return text;
}

// Confidence Bar Component
function ConfidenceBar({ confidence, locale }: { confidence: number; locale: Locale }) {
  const getColor = () => {
    if (confidence >= 80) return 'bg-emerald-500';
    if (confidence >= 50) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const getLabel = () => {
    if (confidence >= 80) return locale === 'zh-Hans' ? '高置信度' : 'High';
    if (confidence >= 50) return locale === 'zh-Hans' ? '中置信度' : 'Medium';
    return locale === 'zh-Hans' ? '低置信度' : 'Low';
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-helper text-muted-foreground">{getLabel()}</span>
      <div className="w-[80px] h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${confidence}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' as const }}
          className={cn('h-full rounded-full', getColor())}
        />
      </div>
      <span className="text-helper text-muted-foreground font-mono">{confidence}%</span>
    </div>
  );
}

// Editable Row Component
interface EditableRowProps {
  label: string;
  value: string;
  originalValue?: string;
  onEdit: (newValue: string) => void;
  isModified?: boolean;
  type?: 'text' | 'select' | 'date' | 'currency' | 'account';
  options?: Array<{ value: string; label: string }>;
  accounts?: Array<{ id: string; name1: string }>;
  locale: Locale;
}

function EditableRow({
  label,
  value,
  originalValue,
  onEdit,
  isModified,
  type = 'text',
  options,
  accounts,
  locale,
}: EditableRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [dateOpen, setDateOpen] = useState(false);

  const handleSave = useCallback(() => {
    onEdit(editValue);
    setIsEditing(false);
  }, [editValue, onEdit]);

  const handleCancel = useCallback(() => {
    setEditValue(value);
    setIsEditing(false);
  }, [value]);

  const formatDisplayValue = () => {
    if (type === 'currency') {
      const num = parseFloat(value) || 0;
      return num >= 1000 ? `$${(num / 1000).toFixed(0)}K` : `$${num.toLocaleString()}`;
    }
    if (type === 'date' && value) {
      return new Date(value).toLocaleDateString(locale === 'zh-Hans' ? 'zh-CN' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
    if (type === 'account' && accounts) {
      const acc = accounts.find((a) => a.id === value);
      return acc?.name1 || value;
    }
    if (type === 'select' && options) {
      const opt = options.find((o) => o.value === value);
      return opt?.label || value;
    }
    return value || '—';
  };

  return (
    <div className="relative py-3 border-b border-border/20 last:border-0">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-helper text-muted-foreground mb-0.5">{label}</p>
            {isModified && (
              <span
                className="w-2 h-2 rounded-full bg-primary"
                title={originalValue ? `AI: ${originalValue}` : undefined}
              />
            )}
          </div>
          {isEditing ? (
            <div className="flex items-center gap-2 mt-1">
              {type === 'text' && (
                <Input
                  value={editValue}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditValue(e.target.value)}
                  className="h-8 bg-muted border-border"
                  autoFocus
                />
              )}
              {type === 'currency' && (
                <Input
                  type="number"
                  value={editValue}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditValue(e.target.value)}
                  className="h-8 bg-muted border-border"
                  autoFocus
                />
              )}
              {type === 'select' && options && (
                <Select value={editValue} onValueChange={setEditValue}>
                  <SelectTrigger className="h-8 bg-muted border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.filter((o) => o.value).map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {type === 'account' && accounts && (
                <Select value={editValue} onValueChange={setEditValue}>
                  <SelectTrigger className="h-8 bg-muted border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.filter((a) => a.id).map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name1}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {type === 'date' && (
                <Popover open={dateOpen} onOpenChange={setDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-8 justify-start text-left font-normal bg-muted border-border"
                    >
                      {editValue ? format(new Date(editValue), 'PPP') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={editValue ? new Date(editValue) : undefined}
                      onSelect={(date: Date | undefined) => {
                        if (date) {
                          setEditValue(date.toISOString());
                          setDateOpen(false);
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              )}
              <button
                onClick={handleSave}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={handleCancel}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <p className="text-body text-foreground">{formatDisplayValue()}</p>
          )}
        </div>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted active:bg-muted/80 transition-colors"
            aria-label="Edit"
          >
            <Pencil className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}

// Source Chip Component
interface SourceData {
  id: string;
  type: 'recording' | 'email' | 'visit';
  time?: string;
  date?: string;
  content?: string;
  rawData?: Record<string, unknown>;
}

function SourceChip({
  source,
  locale,
  onTap,
}: {
  source: SourceData;
  locale: Locale;
  onTap: () => void;
}) {
  const getLabel = () => {
    if (source.type === 'recording') {
      return t('recordingMention', locale, {
        time: source.time || '00:42',
        content: source.content || '',
      });
    }
    if (source.type === 'email') {
      return t('emailSource', locale, { date: source.date || '' });
    }
    return t('lastVisitSource', locale, { date: source.date || '' });
  };

  const getIcon = (): React.ComponentType<{ className?: string }> => {
    if (source.type === 'recording') return Mic;
    if (source.type === 'email') return Mail;
    return MapPin;
  };

  return (
    <button
      onClick={onTap}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted border border-border text-helper text-foreground/80 hover:bg-muted/80 transition-colors"
    >
      {(() => { const Icon = getIcon(); return <Icon className="w-4 h-4" />; })()}
      <span className="truncate max-w-[200px]">{getLabel()}</span>
      <ChevronDown className="w-3 h-3 text-muted-foreground" />
    </button>
  );
}

// OpportunityDraft interface
interface OpportunityDraft {
  accountId: string;
  stage: string;
  amount: number;
  expectedCloseDate: string;
  nextAction: string;
  ownerId: string;
  confidence: number;
  sources: SourceData[];
}

export default function OpportunityDraftReviewPage() {
  const navigate = useNavigate();
  const { activityId } = useParams<{ activityId: string }>();
  const [searchParams] = useSearchParams();
  const activityIdFromQuery = searchParams.get('activityId');
  const finalActivityId = activityId || activityIdFromQuery || '';
  const firstMount = useFirstMount(`opportunity-draft-review:${finalActivityId}`);

  const locale: Locale = getLocale();
  const { data: user } = useUser();
  const { data: activity, isLoading: activityLoading, error: activityError } = useActivity(finalActivityId);
  const { data: accounts = [] } = useAccountList();
  const { data: opportunities = [] } = useOpportunityList();
  const updateActivity = useUpdateActivity();

  const [isProcessing, setIsProcessing] = useState(true);
  const [draft, setDraft] = useState<OpportunityDraft | null>(null);
  const [modifiedFields, setModifiedFields] = useState<Set<string>>(new Set());
  const [originalValues, setOriginalValues] = useState<Record<string, string>>({});
  const [sourceDrawerOpen, setSourceDrawerOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<SourceData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAbandoning, setIsAbandoning] = useState(false);

  const userId = user?.objectId || '';

  // Simulate AI draft generation
  useEffect(() => {
    if (!activity && !activityLoading) {
      setIsProcessing(false);
      return;
    }

    if (activity) {
      // Simulate Flow_ActivityToOpportunity call
      const timer = setTimeout(() => {
        // Generate mock draft based on activity data
        const mockDraft: OpportunityDraft = {
          accountId: activity.account?.id || accounts[0]?.id || '',
          stage: 'proposal', // proposal
          amount: 620000,
          expectedCloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          nextAction: locale === 'zh-Hans' ? '下周签约' : 'Sign contract next week',
          ownerId: userId,
          confidence: 78,
          sources: [
            {
              id: '1',
              type: 'recording',
              time: '00:42',
              content: locale === 'zh-Hans' ? '金额 ¥620 万' : 'amount $620K',
              rawData: { transcript: '...提到金额大概在620万左右...' },
            },
            {
              id: '2',
              type: 'email',
              date: '2026-04-18',
              rawData: { subject: 'Re: 项目报价', body: '...' },
            },
            {
              id: '3',
              type: 'visit',
              date: '2026-04-12',
              rawData: { notes: '客户对方案满意，有意推进' },
            },
          ],
        };

        setDraft(mockDraft);
        setOriginalValues({
          accountId: mockDraft.accountId,
          stage: mockDraft.stage,
          amount: String(mockDraft.amount),
          expectedCloseDate: mockDraft.expectedCloseDate,
          nextAction: mockDraft.nextAction,
          ownerId: mockDraft.ownerId,
        });
        setIsProcessing(false);
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [activity, activityLoading, accounts, locale, userId]);

  const handleFieldEdit = useCallback(
    (field: keyof OpportunityDraft, newValue: string) => {
      if (!draft) return;

      setDraft((prev) => {
        if (!prev) return prev;
        const updated = { ...prev };
        if (field === 'amount') {
          updated.amount = parseFloat(newValue) || 0;
        } else if (field === 'stage') {
          updated.stage = newValue;
        } else {
          (updated as Record<string, unknown>)[field] = newValue;
        }
        return updated;
      });

      // Track modification
      if (originalValues[field] !== newValue) {
        setModifiedFields((prev) => new Set(prev).add(field));
      } else {
        setModifiedFields((prev) => {
          const updated = new Set(prev);
          updated.delete(field);
          return updated;
        });
      }
    },
    [draft, originalValues]
  );

  const handleSourceTap = useCallback((source: SourceData) => {
    setSelectedSource(source);
    setSourceDrawerOpen(true);
  }, []);

  const handleAbandon = useCallback(async () => {
    if (isAbandoning || isSubmitting) return; // guard against double-tap
    setIsAbandoning(true);
    try {
      if (finalActivityId) {
        await updateActivity.mutateAsync({
          id: finalActivityId,
          changedFields: { status: 'open' },
        });
      }
      toast.info(t('abandonedDraft', locale));
      navigate('/home');
    } catch {
      // Global MutationCache.onError surfaces the real error; let the user retry.
      setIsAbandoning(false);
    }
  }, [finalActivityId, updateActivity, locale, navigate, isAbandoning, isSubmitting]);

  const handleSubmit = useCallback(async () => {
    if (!draft) return;
    setIsSubmitting(true);

    try {
      // Simulate inserting into OpportunityWriteQueue
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Update activity with confirmed status
      if (finalActivityId) {
        await updateActivity.mutateAsync({
          id: finalActivityId,
          changedFields: { status: 'open' },
        });
      }

      toast.success(t('submittedToQueue', locale));
      navigate('/home');
    } catch (error: unknown) {
      // Toast is shown by the global MutationCache.onError handler.
      console.error('Submit failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [draft, finalActivityId, updateActivity, locale, navigate]);

  const handleRegenerate = useCallback(() => {
    setIsProcessing(true);
    setDraft(null);
    setModifiedFields(new Set());
    // Re-trigger the effect
    setTimeout(() => {
      if (activity) {
        const newDraft: OpportunityDraft = {
          accountId: activity.account?.id || accounts[0]?.id || '',
          stage: 'proposal',
          amount: 580000,
          expectedCloseDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
          nextAction: locale === 'zh-Hans' ? '本周回访确认' : 'Follow up this week',
          ownerId: userId,
          confidence: 82,
          sources: [
            {
              id: '1',
              type: 'recording',
              time: '01:15',
              content: locale === 'zh-Hans' ? '金额 ¥580 万' : 'amount $580K',
              rawData: { transcript: '...讨论后金额调整为580万...' },
            },
          ],
        };
        setDraft(newDraft);
        setOriginalValues({
          accountId: newDraft.accountId,
          stage: newDraft.stage,
          amount: String(newDraft.amount),
          expectedCloseDate: newDraft.expectedCloseDate,
          nextAction: newDraft.nextAction,
          ownerId: newDraft.ownerId,
        });
        setIsProcessing(false);
      }
    }, 2000);
  }, [activity, accounts, locale, userId]);

  const handleReject = useCallback(async () => {
    if (finalActivityId) {
      await updateActivity.mutateAsync({
        id: finalActivityId,
        changedFields: { status: 'canceled' },
      });
    }
    toast.info(t('abandonedDraft', locale));
    navigate('/home');
  }, [finalActivityId, updateActivity, locale, navigate]);

  // Stage options
  const stageOptions = ['prospecting', 'qualification', 'proposal', 'negotiation']
    .map((label) => ({
      value: label,
      label: t(label as keyof (typeof translations)['zh-Hans'], locale),
    }));

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.08 },
    },
  } as const;

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0 },
  } as const;

  return (
    <div className="min-h-screen flex flex-col bg-background">
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
          <h1 className="text-title text-foreground">{t('oppDraft', locale)}</h1>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted active:bg-muted/80 transition-colors"
                aria-label="More"
              >
                <MoreHorizontal className="w-5 h-5 text-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleRegenerate}>
                <RefreshCw className="w-4 h-4 mr-2" />
                {t('regenerate', locale)}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleReject} className="text-red-400">
                <X className="w-4 h-4 mr-2" />
                {t('rejectDraft', locale)}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 pt-14 pb-24 px-4 overflow-y-auto scrollbar-hide">
        <AnimatePresence mode="wait">
          {isProcessing ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20"
            >
              <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin mb-4" />
              <p className="text-body text-muted-foreground">{t('processingAI', locale)}</p>
            </motion.div>
          ) : activityError || !activity || !draft ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20"
            >
              <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-body text-muted-foreground">{t('noActivity', locale)}</p>
              <Button variant="outline" className="mt-4" onClick={() => navigate('/home')}>
                {locale === 'zh-Hans' ? '返回首页' : 'Back to Home'}
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="content"
              variants={containerVariants}
              initial={firstMount ? 'hidden' : false}
              animate="show"
              className="space-y-4 py-4"
            >
              {/* Status Card */}
              <motion.div variants={itemVariants} className="glass-card rounded-[20px] p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-title text-foreground">{t('aiGenerated', locale)}</h3>
                  <span
                    className="px-2.5 py-1 rounded-full text-[10px] font-medium"
                    style={{
                      background: 'rgba(96, 165, 250, 0.18)',
                      color: '#93C5FD',
                    }}
                  >
                    {t('pendingConfirm', locale)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-helper text-muted-foreground">
                    {t('generatedFrom', locale, { id: finalActivityId.slice(0, 8) })}
                  </p>
                  <ConfidenceBar confidence={draft.confidence} locale={locale} />
                </div>
              </motion.div>

              {/* Field Editing Card */}
              <motion.div variants={itemVariants} className="glass-card rounded-[20px] overflow-hidden">
                <div className="px-4">
                  <EditableRow
                    label={t('account', locale)}
                    value={draft.accountId}
                    originalValue={originalValues.accountId}
                    onEdit={(v: string) => handleFieldEdit('accountId', v)}
                    isModified={modifiedFields.has('accountId')}
                    type="account"
                    accounts={accounts}
                    locale={locale}
                  />
                  <EditableRow
                    label={t('stage', locale)}
                    value={draft.stage}
                    originalValue={originalValues.stage}
                    onEdit={(v: string) => handleFieldEdit('stage', v)}
                    isModified={modifiedFields.has('stage')}
                    type="select"
                    options={stageOptions}
                    locale={locale}
                  />
                  <EditableRow
                    label={t('amount', locale)}
                    value={String(draft.amount)}
                    originalValue={originalValues.amount}
                    onEdit={(v: string) => handleFieldEdit('amount', v)}
                    isModified={modifiedFields.has('amount')}
                    type="currency"
                    locale={locale}
                  />
                  <EditableRow
                    label={t('expectedClose', locale)}
                    value={draft.expectedCloseDate}
                    originalValue={originalValues.expectedCloseDate}
                    onEdit={(v: string) => handleFieldEdit('expectedCloseDate', v)}
                    isModified={modifiedFields.has('expectedCloseDate')}
                    type="date"
                    locale={locale}
                  />
                  <EditableRow
                    label={t('nextAction', locale)}
                    value={draft.nextAction}
                    originalValue={originalValues.nextAction}
                    onEdit={(v: string) => handleFieldEdit('nextAction', v)}
                    isModified={modifiedFields.has('nextAction')}
                    type="text"
                    locale={locale}
                  />
                  <EditableRow
                    label={t('owner', locale)}
                    value={draft.ownerId}
                    originalValue={originalValues.ownerId}
                    onEdit={(v: string) => handleFieldEdit('ownerId', v)}
                    isModified={modifiedFields.has('ownerId')}
                    type="text"
                    locale={locale}
                  />
                </div>

                {/* Modified fields hint */}
                {modifiedFields.size > 0 && (
                  <div className="px-4 py-2 border-t border-border/20">
                    <p className="text-helper text-muted-foreground">
                      {t('modifiedFields', locale, { count: modifiedFields.size })}
                    </p>
                  </div>
                )}
              </motion.div>

              {/* Source Tracing Card */}
              <motion.div variants={itemVariants} className="glass-card rounded-[20px] p-4">
                <h3 className="text-title text-foreground mb-3">{t('sourceTracing', locale)}</h3>
                <div className="flex flex-wrap gap-2">
                  {draft.sources.map((source) => (
                    <SourceChip
                      key={source.id}
                      source={source}
                      locale={locale}
                      onTap={() => handleSourceTap(source)}
                    />
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Action Bar */}
      {!isProcessing && draft && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' as const }}
          className="fixed bottom-0 left-0 right-0 glass-surface border-t border-border/50 p-4 safe-area-bottom"
        >
          <div className="flex items-center gap-3">
            <button
              onClick={handleAbandon}
              disabled={isSubmitting || isAbandoning}
              className="flex-shrink-0 py-3.5 px-6 rounded-xl text-body font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isAbandoning && (
                <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
              )}
              {t('abandon', locale)}
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || isAbandoning}
              className="flex-1 py-3.5 rounded-xl accent-gradient text-body font-semibold text-white shadow-lg shadow-primary/30 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  {t('submit', locale)}
                </>
              )}
            </button>
          </div>
        </motion.div>
      )}

      {/* Source Drawer */}
      <Sheet open={sourceDrawerOpen} onOpenChange={setSourceDrawerOpen}>
        <SheetContent side="bottom" className="h-[70vh] bg-card border-t border-border">
          <SheetHeader className="border-b border-border/20 pb-4">
            <SheetTitle className="text-foreground flex items-center gap-2">
              {selectedSource?.type === 'recording' ? (
                <><Mic className="w-5 h-5" /> {locale === 'zh-Hans' ? '录音片段' : 'Recording Segment'}</>
              ) : selectedSource?.type === 'email' ? (
                <><Mail className="w-5 h-5" /> {locale === 'zh-Hans' ? '邮件内容' : 'Email Content'}</>
              ) : (
                <><MapPin className="w-5 h-5" /> {locale === 'zh-Hans' ? '拜访记录' : 'Visit Record'}</>
              )}
            </SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-4">
            {selectedSource?.rawData && (
              <div className="glass-card rounded-xl p-4">
                <pre className="text-helper text-foreground/80 whitespace-pre-wrap font-mono">
                  {JSON.stringify(selectedSource.rawData, null, 2)}
                </pre>
              </div>
            )}
            <button
              onClick={() => {
                setSourceDrawerOpen(false);
                // In real implementation, navigate to detailed view
              }}
              className="w-full py-3 rounded-xl border border-primary/50 text-primary text-body font-medium flex items-center justify-center gap-2 hover:bg-primary/10 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              {t('viewInReview', locale)}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Home indicator */}
      <div className="fixed bottom-1 left-1/2 -translate-x-1/2 w-[110px] h-1 bg-foreground/20 rounded-full safe-area-bottom" />
    </div>
  );
}
