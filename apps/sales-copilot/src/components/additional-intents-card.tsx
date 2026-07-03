import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Lightbulb, ChevronRight, Check, X, MapPin, Phone, Calendar, Mail, CheckSquare, Building2, Users, TrendingUp, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { getLocale, t, pickLabel, localeBcp47, type Locale } from '@/lib/i18n';
import { useCopilot } from '@/contexts/copilot-context';
import { useCreateActivity } from '@/generated/hooks/use-activity';
import { useCreateOpportunity } from '@/generated/hooks/use-opportunity';
import { useCreateAccount } from '@/generated/hooks/use-account';
import { useCreateContact } from '@/generated/hooks/use-contact';
import { useAccountList } from '@/generated/hooks/use-account';
import type { Account } from '@/generated/models/account-model';
import type { Activity, ActivityType } from '@/generated/models/activity-model';

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
  visit: Calendar,
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

const EntityTypeLabels: Record<string, { zh: string; en: string; de: string; fr: string; es: string }> = {
  activity: { zh: '活动', en: 'Activity', de: 'Aktivität', fr: 'Activité', es: 'Actividad' },
  opportunity: { zh: '商机', en: 'Opportunity', de: 'Verkaufschance', fr: 'Opportunité', es: 'Oportunidad' },
  account: { zh: '客户', en: 'Account', de: 'Konto', fr: 'Compte', es: 'Cuenta' },
  contact: { zh: '联系人', en: 'Contact', de: 'Kontakt', fr: 'Contact', es: 'Contacto' },
};

export function AdditionalIntentsCard({ messageId, additionalIntents }: AdditionalIntentsCardProps) {
  const locale: Locale = getLocale();
  const { updateFormCardStatus, closePanel } = useCopilot();
  const navigate = useNavigate();
  
  // Get mutation hooks for each entity type
  const createActivityMutation = useCreateActivity();
  const createOpportunityMutation = useCreateOpportunity();
  const createAccountMutation = useCreateAccount();
  const createContactMutation = useCreateContact();
  // Accounts for resolving a suggested activity's accountName → id so the
  // created record links to its account (and shows under it).
  const { data: accounts = [] } = useAccountList();
  
  // Track status of each form — persist to localStorage so status survives panel close/reopen
  const storageKey = `intent-status-${messageId}`;
  const [formStatuses, setFormStatuses] = useState<Record<number, 'pending' | 'confirmed' | 'skipped'>>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return {};
  });
  // Created record ids per form index, so a confirmed card can deep-link to the
  // real record detail (also serves as proof the create actually persisted).
  const createdKey = `intent-created-${messageId}`;
  const [createdRecords, setCreatedRecords] = useState<Record<number, { id: string; type: string }>>(() => {
    try {
      const stored = localStorage.getItem(createdKey);
      if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return {};
  });
  const [isSubmitting, setIsSubmitting] = useState<number | null>(null);
  // Per-card scheduled-date override (ISO yyyy-mm-dd) and which card's scheduler is open.
  const [dateOverrides, setDateOverrides] = useState<Record<number, string>>({});
  const [scheduleOpen, setScheduleOpen] = useState<number | null>(null);

  // Resolve the effective scheduled date for a card: user override → form data.
  const effectiveDate = (form: AdditionalIntentForm, index: number): string | undefined => {
    return dateOverrides[index] ?? (form.data.scheduledDate as string | undefined);
  };

  const toISODate = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const setCardDate = (index: number, iso: string) => {
    setDateOverrides((prev) => ({ ...prev, [index]: iso }));
    setScheduleOpen(null);
  };

  // Persist status changes
  const updateStatus = (index: number, status: 'confirmed' | 'skipped') => {
    setFormStatuses(prev => {
      const next = { ...prev, [index]: status };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  
  // Map an additional-intent activity form (LLM draft shape) to the Activity
  // model shape ActivityService.create expects. Resolves the account by name so
  // the created activity links to it.
  const toActivityCreatePayload = (data: Record<string, unknown>): Omit<Activity, 'id'> => {
    const title = (data.title as string) || (data.subject as string) || '';
    const type = ((data.type as string) || 'visit') as ActivityType;
    const scheduleddate = (data.scheduledDate as string) || (data.scheduleddate as string) || new Date().toISOString().split('T')[0];
    const notes = (data.notes as string) || undefined;
    const accountName = (data.accountName as string) || '';
    const matched = accountName
      ? accounts.find((a: Account) => a.name1?.toLowerCase() === accountName.toLowerCase())
      : undefined;

    const payload: Omit<Activity, 'id'> = {
      title,
      type,
      scheduleddate,
      status: 'open',
      ownerid: '',
      ...(notes ? { notes } : {}),
      ...(matched ? { account: { id: matched.id, name1: matched.name1 } } : {}),
    };
    return payload;
  };

  const handleConfirm = async (form: AdditionalIntentForm, index: number) => {
    setIsSubmitting(index);

    // Apply the user's scheduled-date choice (if any) before creating.
    const chosenDate = dateOverrides[index];
    const formData = chosenDate ? { ...form.data, scheduledDate: chosenDate } : form.data;

    try {
      // Execute the appropriate create mutation based on type, capturing the
      // created record's id so the confirmed card can deep-link to its detail.
      let createdId: string | undefined;
      switch (form.type) {
        case 'activity': {
          // The suggestPlan / additional-intent form uses the LLM "draft" shape
          // (camelCase `scheduledDate`, `accountName` string). ActivityService
          // expects the Activity model shape (lowercase `scheduleddate`,
          // `account: {id}`). Without this mapping the date never reaches the
          // Dataverse payload, and appointments (visit/meeting) hard-fail with
          // "An appointment must have scheduled start and scheduled end set."
          const r = await createActivityMutation.mutateAsync(
            toActivityCreatePayload(formData) as Parameters<typeof createActivityMutation.mutateAsync>[0]
          );
          createdId = (r as { id?: string })?.id;
          break;
        }
        case 'opportunity': {
          const r = await createOpportunityMutation.mutateAsync(formData as Parameters<typeof createOpportunityMutation.mutateAsync>[0]);
          createdId = (r as { id?: string })?.id;
          break;
        }
        case 'account': {
          const r = await createAccountMutation.mutateAsync(formData as Parameters<typeof createAccountMutation.mutateAsync>[0]);
          createdId = (r as { id?: string })?.id;
          break;
        }
        case 'contact': {
          const r = await createContactMutation.mutateAsync(formData as Parameters<typeof createContactMutation.mutateAsync>[0]);
          createdId = (r as { id?: string })?.id;
          break;
        }
      }

      if (createdId) {
        setCreatedRecords((prev) => {
          const next = { ...prev, [index]: { id: createdId as string, type: form.type } };
          try { localStorage.setItem(createdKey, JSON.stringify(next)); } catch { /* ignore */ }
          return next;
        });
      }
      updateStatus(index, 'confirmed');
      // Inline status update reflects the save in-conversation; no toast.
    } catch (error: unknown) {
      // Toast is shown by the global MutationCache.onError handler.
      console.error('Failed to create entity from additional intent:', error);
    } finally {
      setIsSubmitting(null);
    }
  };
  
  const handleSkip = (index: number) => {
    updateStatus(index, 'skipped');
  };

  // Deep-link a confirmed card to its record detail. Contacts have no detail
  // route, so they land on the accounts list.
  const openRecord = (index: number) => {
    const rec = createdRecords[index];
    if (!rec) return;
    closePanel();
    switch (rec.type) {
      case 'activity': navigate(`/activities/${rec.id}`); break;
      case 'opportunity': navigate(`/opportunities/${rec.id}`); break;
      case 'account': navigate(`/accounts/${rec.id}`); break;
      case 'contact': navigate('/accounts'); break;
    }
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
        return (data.subject as string) || (data.title as string) || (t('newRecordActivity', locale));
      case 'opportunity':
        return (data.name as string) || (data.title as string) || (t('newRecordOpportunity', locale));
      case 'account':
        return (data.name as string) || (t('newRecordAccount', locale));
      case 'contact':
        return (data.fullName as string) || (data.name as string) || (t('newRecordContact', locale));
      default:
        return t('newRecordGeneric', locale);
    }
  };
  
  const getFormSubtitle = (form: AdditionalIntentForm, index: number): string | null => {
    const data = form.data;
    switch (form.type) {
      case 'activity': {
        const actType = data.type as string;
        const typeLabel = actType === 'visit' ? (t('typeVisit', locale))
          : actType === 'call' ? (t('typeCall', locale))
          : actType === 'meeting' ? (t('typeMeeting', locale))
          : actType === 'email' ? (t('typeEmail', locale))
          : (t('typeOther', locale));
        const scheduledDate = effectiveDate(form, index);
        if (scheduledDate) {
          return `${typeLabel} · ${new Date(scheduledDate).toLocaleDateString(localeBcp47(locale))}`;
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
            {additionalIntents.message || (t('additionalIntentsIntro', locale))}
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
            const subtitle = getFormSubtitle(form, idx);
            const isLoading = isSubmitting === idx;
            const createdRec = createdRecords[idx];
            const isNavigable = status === 'confirmed' && !!createdRec;
            
            return (
              <motion.div
                key={`${messageId}-${idx}`}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10, height: 0 }}
                transition={{ delay: idx * 0.1, duration: 0.2 }}
                onClick={isNavigable ? () => openRecord(idx) : undefined}
                role={isNavigable ? 'button' : undefined}
                tabIndex={isNavigable ? 0 : undefined}
                onKeyDown={isNavigable ? (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRecord(idx); }
                } : undefined}
                className={cn(
                  'rounded-xl border p-3 transition-all',
                  status === 'confirmed' 
                    ? 'bg-green-500/10 border-green-500/30' 
                    : status === 'skipped'
                    ? 'bg-muted/50 border-border/50 opacity-60'
                    : 'bg-card border-border hover:border-primary/50',
                  isNavigable && 'cursor-pointer hover:bg-green-500/15 hover:border-green-500/50'
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
                        {pickLabel(EntityTypeLabels[form.type], locale)}
                      </span>
                      {/* Status indicator inline */}
                      {status === 'confirmed' && (
                        <span className="text-xs text-green-600 inline-flex items-center gap-0.5">
                          {t('createdLabel', locale)}
                          {isNavigable && (
                            <>
                              <span className="text-muted-foreground mx-0.5">·</span>
                              <span className="text-primary">
                                {t('viewDetails', locale)}
                              </span>
                              <ChevronRight className="w-3 h-3 text-primary" />
                            </>
                          )}
                        </span>
                      )}
                      {status === 'skipped' && (
                        <span className="text-xs text-muted-foreground">
                          {t('skippedLabel', locale)}
                        </span>
                      )}
                    </div>
                    <p className={cn(
                      'text-sm font-medium mt-1',
                      status === 'skipped' ? 'text-muted-foreground' : 'text-foreground'
                    )}>
                      {title}
                    </p>
                    {subtitle && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {subtitle}
                      </p>
                    )}
                    {/* Reason */}
                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground mt-1.5 italic">
                      <Lightbulb className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      <span>{form.reason}</span>
                    </div>
                  </div>
                </div>
                  
                {/* Actions - below card content, full width */}
                {!status && (
                  <>
                    {/* Schedule picker (activity only) — lets the user pick a real day
                        instead of accepting the suggested "today". */}
                    {form.type === 'activity' && (
                      <div className="mt-2.5 pt-2 border-t border-border/30">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setScheduleOpen(scheduleOpen === idx ? null : idx)}
                          disabled={isLoading}
                          className="h-8 w-full justify-start text-xs text-muted-foreground hover:text-foreground"
                        >
                          <CalendarClock className="w-3.5 h-3.5 mr-1.5" />
                          {t('scheduleLabel', locale)}
                          <span className="ml-auto text-foreground">
                            {effectiveDate(form, idx)
                              ? new Date(effectiveDate(form, idx) as string).toLocaleDateString(localeBcp47(locale))
                              : ''}
                          </span>
                        </Button>
                        {scheduleOpen === idx && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {[
                              { key: 'today', label: t('today', locale), offset: 0 },
                              { key: 'tomorrow', label: t('tomorrow', locale), offset: 1 },
                              { key: 'dayafter', label: t('dayAfter', locale), offset: 2 },
                            ].map((opt) => {
                              const d = new Date();
                              d.setDate(d.getDate() + opt.offset);
                              const iso = toISODate(d);
                              const active = effectiveDate(form, idx) === iso;
                              return (
                                <button
                                  key={opt.key}
                                  type="button"
                                  onClick={() => setCardDate(idx, iso)}
                                  className={cn(
                                    'px-2.5 py-1 rounded-full text-xs border transition-colors',
                                    active
                                      ? 'bg-primary text-primary-foreground border-primary'
                                      : 'bg-card text-muted-foreground border-border hover:border-primary/50'
                                  )}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                            <label className="px-2.5 py-1 rounded-full text-xs border border-border bg-card text-muted-foreground hover:border-primary/50 cursor-pointer inline-flex items-center">
                              {t('custom', locale)}
                              <input
                                type="date"
                                className="sr-only"
                                onChange={(e) => { if (e.target.value) setCardDate(idx, e.target.value); }}
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    )}
                    <div className={cn(
                      'flex items-center gap-2 mt-2.5',
                      form.type !== 'activity' && 'pt-2 border-t border-border/30'
                    )}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSkip(idx)}
                        disabled={isLoading}
                        className="flex-1 h-8 text-muted-foreground"
                      >
                        <X className="w-3.5 h-3.5 mr-1" />
                        {t('skip', locale)}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleConfirm(form, idx)}
                        disabled={isLoading}
                        className="flex-1 h-8"
                      >
                        {isLoading ? (
                          <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5 mr-1" />
                            {t('confirmCreate', locale)}
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                )}
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
          {t('allItemsProcessed', locale)}
        </motion.p>
      )}
    </motion.div>
  );
}
