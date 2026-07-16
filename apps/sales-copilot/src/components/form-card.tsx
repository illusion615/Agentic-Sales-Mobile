/**
 * Form Card Components for Copilot Chat
 * Renders editable draft forms for Activity, Opportunity, Account, and Contact
 * within the chat interface for user confirmation.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Check, X, Calendar, User, Users, Building2, Phone, Mail, MapPin, DollarSign, TrendingUp, FileText, Tag, ChevronRight, ChevronDown, Target, Sparkles, Bug, Lightbulb, Image, CircleDot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { getLocale, t, getCompactDraftForms, type Locale } from '@/lib/i18n';
import { useCopilot } from '@/contexts/copilot-context';
import { format } from 'date-fns/format';

// Hooks for creating records (use mutations for cache invalidation)
import { useCreateActivity } from '@/generated/hooks/use-activity';
import { useCreateOpportunity } from '@/generated/hooks/use-opportunity';
import { getCurrencyCatalog, getPreferredCurrencyId, setPreferredCurrencyId, getBaseCurrencySymbol } from '@/lib/base-currency';
import { useCreateAccount, useAccountList } from '@/generated/hooks/use-account';
import { useOpportunityList } from '@/generated/hooks/use-opportunity';
import { useContactList } from '@/generated/hooks/use-contact';
import { touchAccountLastContacted } from '@/lib/account-touch';
import type { Activity } from '@/generated/models/activity-model';
import type { Opportunity } from '@/generated/models/opportunity-model';
import type { Account } from '@/generated/models/account-model';
import { useUser } from '@/hooks/use-user';
import { useCreateContact } from '@/generated/hooks/use-contact';
import type { Contact } from '@/generated/models/contact-model';
import { getAttachments, dropAttachments, uploadAttachmentsToActivity } from '@/lib/attachments';
import { useCreateAppFeedback } from '@/hooks/use-app-feedback';
import type { AppFeedback } from '@/generated/models/app-feedback-model';
import { CURRENT_VERSION } from '@/data/changelog';
import { collectSafeFeedbackDiagnostics, safeFeedbackPage } from '@/lib/feedback-diagnostics';
import { uploadFeedbackScreenshots } from '@/lib/feedback-attachments';
import { recordDetailRoute, recordListRoute } from '@/lib/record-route';
import { buildSavedCardDetails, formCardPrimaryText, type SavedCardRowKey } from '@/lib/form-card-display';
import {
  activityDraftDateLabelKey,
  activityDraftDetailsPlaceholderKey,
  activityStatusForDraftMode,
  resolveActivityDraftMode,
} from '@/lib/activity-draft-mode';
import { TimeDurationFields } from '@/components/schedule-picker';
import { combineDateTime, timeFromISO, DEFAULT_DURATION_MINUTES } from '@/lib/activity-schedule';

export interface FormCardData {
  type: 'activity' | 'opportunity' | 'account' | 'contact' | 'feedback';
  isNew: boolean;
  existingId?: string;
  data: Record<string, unknown>;
  status?: 'pending' | 'confirmed' | 'modified' | 'cancelled';
  createdRecordId?: string;
  /** Attachment ids (resolved from the attachment store) to upload as Notes after create. */
  attachmentIds?: string[];
}

interface FormCardProps {
  formCard: FormCardData;
  messageId: string;
  batchIndex?: number;
  onStatusChange?: (status: 'confirmed' | 'modified' | 'cancelled') => void;
}

// Reactive "compact draft forms" flag — recomputes live when the setting toggles.
function useCompactDraftForms(): boolean {
  const [compact, setCompact] = useState(() => getCompactDraftForms());
  useEffect(() => {
    const handler = (e: Event) => setCompact((e as CustomEvent<boolean>).detail);
    window.addEventListener('compactdraftforms-changed', handler);
    return () => window.removeEventListener('compactdraftforms-changed', handler);
  }, []);
  return compact;
}

/**
 * Shared field wrapper for all draft-form rows (EditableField + the custom
 * selectors). In the default layout the label sits above the control; in compact
 * mode the label moves inline to the left (fixed width) and vertical padding is
 * tightened, roughly halving each row's height.
 */
function FieldShell({ icon: Icon, label, required, isMissing, compact, alignTop, className, children }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  required?: boolean;
  isMissing?: boolean;
  compact: boolean;
  /** Tall controls (textarea, attendee chips) top-align the icon/label instead of centering. */
  alignTop?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const labelNode = (
    <span className={cn('text-xs', isMissing ? 'text-destructive' : 'text-muted-foreground')}>
      {label}{required && <span className="text-destructive"> *</span>}
    </span>
  );
  if (compact) {
    // Compact mode hides the per-field icon to reclaim horizontal space; the
    // inline label alone identifies the field.
    return (
      <div className={cn('flex gap-2 py-0.5', alignTop ? 'items-start' : 'items-center', className)}>
        <div className={cn('w-20 shrink-0 leading-tight', alignTop && 'mt-1.5')}>{labelNode}</div>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    );
  }
  return (
    <div className={cn('flex items-start gap-2 py-1', className)}>
      <Icon className={cn('w-4 h-4 mt-2 flex-shrink-0', isMissing ? 'text-destructive' : 'text-muted-foreground')} />
      <div className="flex-1 min-w-0">
        {labelNode}
        {children}
      </div>
    </div>
  );
}

/**
 * Width-controlled date field (button + inline calendar). Used in compact mode
 * because the native <input type="date"> has an intrinsic min-width on mobile
 * WebKit that overflows narrow inline columns. The calendar renders IN-FLOW
 * below the button (not a portal/popover) because Radix's Floating-UI popover
 * mis-positions inside the copilot sheet's portaled + scrolled context (it landed
 * off-screen above the viewport). Emits a 'yyyy-MM-dd' string to preserve the
 * same value contract as the native input.
 */
function DateField({ value, onChange, inputCls, label, placeholder }: {
  value: string | number | undefined;
  onChange: (value: string) => void;
  inputCls: string;
  label: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const str = value != null ? String(value) : '';
  // Parse date-only strings as local midnight so the calendar highlights the
  // correct day regardless of timezone.
  const parsed = str ? new Date(str.length <= 10 ? `${str}T00:00:00` : str) : undefined;
  const selected = parsed && !isNaN(parsed.getTime()) ? parsed : undefined;
  return (
    <div className="min-w-0">
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen((o) => !o)}
        className={cn('w-full min-w-0 justify-between text-left font-normal px-3', inputCls)}
      >
        <span className="truncate">{str ? str.slice(0, 10) : (placeholder || label)}</span>
        <Calendar className="ml-2 h-4 w-4 shrink-0 text-muted-foreground opacity-50" />
      </Button>
      {open && (
        <div className="mt-1 w-fit max-w-full overflow-x-auto rounded-md border bg-popover shadow-md">
          <CalendarComponent
            mode="single"
            selected={selected}
            onSelect={(date?: Date) => { if (date) { onChange(format(date, 'yyyy-MM-dd')); setOpen(false); } }}
          />
        </div>
      )}
    </div>
  );
}

// Editable field component
function EditableField({
  icon: Icon, 
  label, 
  value, 
  onChange,
  type = 'text',
  options,
  placeholder,
  className,
  required = false,
  missingHint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number | undefined;
  onChange: (value: string) => void;
  type?: 'text' | 'select' | 'date' | 'textarea' | 'number';
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  className?: string;
  /** §8: mark a required field; when empty, show an inline red hint below it. */
  required?: boolean;
  /** Custom hint text shown when a required field is empty. */
  missingHint?: string;
}) {
  const compact = useCompactDraftForms();
  const isMissing = required && (value === undefined || value === null || String(value).trim() === '');
  // Control sizing: compact drops the label-gap margin and shrinks the height.
  const inputCls = compact ? 'h-7 text-sm' : 'h-8 text-sm mt-0.5';

  const control =
    type === 'select' && options ? (
      <Select value={String(value || '')} onValueChange={onChange}>
        <SelectTrigger className={cn(inputCls, 'w-full min-w-0')}>
          <SelectValue placeholder={placeholder || label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt: { value: string; label: string }) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : type === 'date' ? (
      compact ? (
        <DateField value={value} onChange={onChange} inputCls={inputCls} label={label} placeholder={placeholder} />
      ) : (
        <input
          type="date"
          aria-label={label}
          title={label}
          className={cn(
            'w-full min-w-0 rounded-md border border-input bg-transparent dark:bg-input/30 px-3 py-1 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            inputCls,
          )}
          value={value ? String(value) : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    ) : type === 'textarea' ? (
      <Textarea
        value={String(value || '')}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn('text-sm resize-none', compact ? 'min-h-[34px]' : 'min-h-[60px] mt-0.5')}
      />
    ) : type === 'number' ? (
      <Input
        type="number"
        value={String(value || '')}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
    ) : (
      <Input
        type="text"
        value={String(value || '')}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
    );

  return (
    <FieldShell icon={Icon} label={label} required={required} isMissing={isMissing} compact={compact} alignTop={type === 'textarea'} className={className}>
      {control}
      {isMissing && (
        <p className={cn('text-[11px] text-destructive', compact ? 'mt-0.5' : 'mt-1')}>
          {missingHint || t('fieldRequired', getLocale(), { label })}
        </p>
      )}
    </FieldShell>
  );
}

// Account selector component
function AccountSelector({ 
  value, 
  onChange, 
  locale 
}: { 
  value: string | undefined; 
  onChange: (accountId: string, accountName: string) => void;
  locale: Locale;
}) {
  const { data: accounts = [] } = useAccountList();
  const compact = useCompactDraftForms();

  return (
    <FieldShell icon={Building2} label={t('account', locale)} compact={compact}>
        <Select 
          value={value || ''} 
          onValueChange={(val: string) => {
            const account = accounts.find((a: Account) => a.id === val);
            if (account) {
              onChange(account.id, account.name1 || '');
            }
          }}
        >
          <SelectTrigger className={cn(compact ? 'h-7 text-sm' : 'h-8 text-sm mt-0.5', 'w-full min-w-0')}>
            <SelectValue placeholder={t('formSelectAccount', locale)} />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((account: Account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name1}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
    </FieldShell>
  );
}

// Opportunity selector component
function OpportunitySelector({ 
  value, 
  onChange,
  accountId,
  locale 
}: { 
  value: string | undefined; 
  onChange: (opportunityId: string, opportunityName: string) => void;
  accountId?: string;
  locale: Locale;
}) {
  const { data: opportunities = [] } = useOpportunityList();
  
  // Filter by account if provided
  const filteredOpportunities = accountId 
    ? opportunities.filter((o: Opportunity) => o.account?.id === accountId)
    : opportunities;
  const compact = useCompactDraftForms();

  return (
    <FieldShell icon={Target} label={t('linkedOpportunity', locale)} compact={compact}>
        <Select 
          value={value || 'none'} 
          onValueChange={(val: string) => {
            if (val === 'none') {
              onChange('', '');
            } else {
              const opp = filteredOpportunities.find((o: Opportunity) => o.id === val);
              if (opp) {
                onChange(opp.id, opp.name1 || '');
              }
            }
          }}
        >
          <SelectTrigger className={cn(compact ? 'h-7 text-sm' : 'h-8 text-sm mt-0.5', 'w-full min-w-0')}>
            <SelectValue placeholder={t('formSelectOpportunity', locale)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              {t('none', locale)}
            </SelectItem>
            {filteredOpportunities.map((opp: Opportunity) => (
              <SelectItem key={opp.id} value={opp.id}>
                {opp.name1}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
    </FieldShell>
  );
}

// Amount + inline currency picker — one field so the amount and its currency read
// as a single unit (compact currency dropdown showing the ISO code sits to the
// right of the number input). Default currency = the user's preference, not base.
function AmountCurrencyField({
  amount,
  onAmountChange,
  currencyId,
  onCurrencyChange,
  locale,
}: {
  amount: number | undefined;
  onAmountChange: (value: string) => void;
  currencyId: string | undefined;
  onCurrencyChange: (currencyId: string) => void;
  locale: Locale;
}) {
  const compact = useCompactDraftForms();
  const inputCls = compact ? 'h-7 text-sm' : 'h-8 text-sm mt-0.5';
  const currencies = getCurrencyCatalog();
  const current = currencyId || getPreferredCurrencyId();
  // Always show a currency, even before the catalog loads: fall back to a single
  // base-currency entry so the picker is never empty.
  const items = currencies.length > 0
    ? currencies.map((c) => ({ id: c.id, code: c.iso || c.symbol || '?' }))
    : [{ id: current || '__base__', code: getBaseCurrencySymbol() }];
  const selectedId = current || items[0]?.id;
  return (
    <FieldShell icon={DollarSign} label={t('amount', locale)} compact={compact}>
      <div className="flex items-center gap-1.5 min-w-0">
        <Input
          type="number"
          value={String(amount || '')}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onAmountChange(e.target.value)}
          placeholder="0"
          className={cn(inputCls, 'flex-1 min-w-0')}
        />
        <Select value={selectedId} onValueChange={(val: string) => { if (val && val !== '__base__') onCurrencyChange(val); }}>
          <SelectTrigger className={cn(inputCls, 'w-auto shrink-0 gap-1 px-2 font-medium')} aria-label={t('currency', locale)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((it) => (
              <SelectItem key={it.id} value={it.id}>{it.code}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </FieldShell>
  );
}

// Contact selector component
function ContactSelector({ 
  value,   onChange,
  accountId,
  locale 
}: { 
  value: string | undefined; 
  onChange: (contactId: string, contactName: string) => void;
  accountId?: string;
  locale: Locale;
}) {
  const { data: contacts = [] } = useContactList();
  
  // Filter by account if provided
  const filteredContacts = accountId 
    ? contacts.filter((c: Contact) => c.account?.id === accountId)
    : contacts;
  const compact = useCompactDraftForms();

  return (
    <FieldShell icon={User} label={t('contact', locale)} compact={compact}>
        <Select 
          value={value || 'none'} 
          onValueChange={(val: string) => {
            if (val === 'none') {
              onChange('', '');
            } else {
              const contact = filteredContacts.find((c: Contact) => c.id === val);
              if (contact) {
                onChange(contact.id, contact.fullname || '');
              }
            }
          }}
        >
          <SelectTrigger className={cn(compact ? 'h-7 text-sm' : 'h-8 text-sm mt-0.5', 'w-full min-w-0')}>
            <SelectValue placeholder={t('formSelectContact', locale)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              {t('none', locale)}
            </SelectItem>
            {filteredContacts.map((contact: Contact) => (
              <SelectItem key={contact.id} value={contact.id}>
                {contact.fullname}{contact.title ? ` (${contact.title})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
    </FieldShell>
  );
}

// Multi-attendee selector for meetings / visits.
// Stores attendees in formData.attendees as Array<{ id, fullname }>.
function MultiContactSelector({
  attendees,
  onChange,
  accountId,
  suggestedNames,
  locale,
}: {
  attendees: Array<{ id: string; fullname: string }>;
  onChange: (next: Array<{ id: string; fullname: string }>) => void;
  accountId?: string;
  suggestedNames?: string[];
  locale: Locale;
}) {
  const { data: contacts = [] } = useContactList();
  const filteredContacts = accountId
    ? contacts.filter((c: Contact) => c.account?.id === accountId)
    : contacts;
  const selectedIds = new Set(attendees.map((a) => a.id));
  const available = filteredContacts.filter((c: Contact) => !selectedIds.has(c.id));

  // Auto-prefill attendees from LLM-recognized names (once contacts have loaded).
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current) return;
    if (attendees.length > 0) { prefilledRef.current = true; return; }
    const names = (suggestedNames || []).map((n) => n.trim()).filter(Boolean);
    if (names.length === 0 || contacts.length === 0) return;

    const pool = accountId ? contacts.filter((c: Contact) => c.account?.id === accountId) : contacts;
    const matched: Array<{ id: string; fullname: string }> = [];
    const seen = new Set<string>();
    for (const name of names) {
      const lower = name.toLowerCase();
      const hit =
        pool.find((c: Contact) => (c.fullname || '').toLowerCase() === lower) ||
        pool.find((c: Contact) => {
          const f = (c.fullname || '').toLowerCase();
          return f.includes(lower) || lower.includes(f);
        });
      if (hit && !seen.has(hit.id)) {
        seen.add(hit.id);
        matched.push({ id: hit.id, fullname: hit.fullname || name });
      }
    }
    if (matched.length > 0) {
      prefilledRef.current = true;
      onChange(matched);
    }
  }, [contacts, suggestedNames, accountId, attendees.length, onChange]);

  const compact = useCompactDraftForms();

  return (
    <FieldShell icon={Users} label={t('attendees', locale)} compact={compact} alignTop={attendees.length > 0}>
        {attendees.length > 0 && (
          <div className={cn('flex flex-wrap gap-1.5 mb-1', compact ? 'mt-0.5' : 'mt-1')}>
            {attendees.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5"
              >
                {a.fullname}
                <button
                  type="button"
                  onClick={() => onChange(attendees.filter((x) => x.id !== a.id))}
                  className="hover:text-destructive"
                  aria-label={t('remove', locale)}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <Select
          value="add"
          onValueChange={(val: string) => {
            if (val === 'add') return;
            const contact = filteredContacts.find((c: Contact) => c.id === val);
            if (contact) onChange([...attendees, { id: contact.id, fullname: contact.fullname || '' }]);
          }}
        >
          <SelectTrigger className={cn(compact ? 'h-7 text-sm' : 'h-8 text-sm mt-0.5', 'w-full min-w-0')}>
            <SelectValue placeholder={t('addAttendee', locale)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="add">
              {t('addAttendeeEllipsis', locale)}
            </SelectItem>
            {available.map((contact: Contact) => (
              <SelectItem key={contact.id} value={contact.id}>
                {contact.fullname}{contact.title ? ` (${contact.title})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
    </FieldShell>
  );
}

// Activity Form Card
function ActivityFormCard({ data, formData, setFormData, onConfirm, onCancel, isConfirming, locale }: {
  data: Record<string, unknown>;
  formData: Record<string, unknown>;
  setFormData: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  onConfirm: () => void;
  onCancel: () => void;
  isConfirming: boolean;
  locale: Locale;
}) {
  const typeOptions = [
    { value: 'visit', label: t('typeVisit', locale) },
    { value: 'call', label: t('typeCall', locale) },
    { value: 'meeting', label: t('typeMeeting', locale) },
    { value: 'email', label: t('typeEmail', locale) },
  ];

  // Native Dataverse activity tables only cover visit/meeting (appointment),
  // call (phonecall) and email — there is no table for a generic "other" type,
  // so it is not offered. Coerce any legacy/stray value to a representable type.
  const rawType = (formData.type as string) || 'visit';
  const activityType = typeOptions.some((o) => o.value === rawType) ? rawType : 'meeting';
  const typeLabel = typeOptions.find((t: { value: string; label: string }) => t.value === activityType)?.label || activityType;
  const activityMode = resolveActivityDraftMode({
    temporalMode: formData.temporalMode,
    scheduledDate: formData.scheduledDate,
  });
  const compact = useCompactDraftForms();

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      <div className={cn('flex items-center gap-2', compact ? 'mb-1.5' : 'mb-3')}>
        <div className={cn('rounded-lg bg-primary/10 flex items-center justify-center', compact ? 'w-7 h-7' : 'w-8 h-8')}>
          <Calendar className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm text-foreground truncate">
            {t('newActivity', locale)}
          </h4>
          <span className="text-xs text-muted-foreground">{typeLabel}</span>
        </div>
      </div>

      <div className={cn('bg-muted/30 rounded-lg', compact ? 'p-2.5 space-y-0' : 'p-3 space-y-1')}>
        <EditableField 
          icon={FileText} 
          label={t('fieldTitle', locale)} 
          value={formData.title as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, title: v }))}
          placeholder={t('enterActivityTitle', locale)}
          required
        />
        <EditableField 
          icon={Tag} 
          label={t('fieldType', locale)} 
          value={activityType}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, type: v }))}
          type="select"
          options={typeOptions}
        />
        <FieldShell icon={CircleDot} label={t('fieldStatus', locale)} compact={compact}>
          <ToggleGroup
            type="single"
            value={activityMode}
            onValueChange={(value: string) => {
              if (value !== 'planned' && value !== 'completed') return;
              setFormData((prev: Record<string, unknown>) => ({ ...prev, temporalMode: value }));
            }}
            variant="outline"
            size="sm"
            className="w-full"
            aria-label={t('fieldStatus', locale)}
            data-testid="activity-status-toggle"
            data-activity-mode={activityMode}
          >
            <ToggleGroupItem value="planned" aria-label={t('statusPlanned', locale)}>
              {t('statusPlanned', locale)}
            </ToggleGroupItem>
            <ToggleGroupItem value="completed" aria-label={t('statusCompleted', locale)}>
              {t('statusCompleted', locale)}
            </ToggleGroupItem>
          </ToggleGroup>
        </FieldShell>
        <AccountSelector
          value={formData.accountId as string}
          onChange={(id: string, name: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, accountId: id, accountName: name }))}
          locale={locale}
        />
        <EditableField 
          icon={Calendar} 
          label={t(activityDraftDateLabelKey(activityMode), locale)}
          value={formData.scheduledDate as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, scheduledDate: v }))}
          type="date"
          placeholder={t('selectDate', locale)}
        />
        <TimeDurationFields
          time={(formData.scheduledTime as string) || timeFromISO(formData.scheduledDate as string)}
          durationMinutes={(formData.durationMinutes as number) || DEFAULT_DURATION_MINUTES}
          onTimeChange={(v) => setFormData((prev: Record<string, unknown>) => ({ ...prev, scheduledTime: v }))}
          onDurationChange={(v) => setFormData((prev: Record<string, unknown>) => ({ ...prev, durationMinutes: v }))}
          locale={locale}
          className="px-0.5"
        />
        <OpportunitySelector
          value={formData.opportunityId as string}
          onChange={(id: string, name: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, opportunityId: id, opportunityName: name }))}
          accountId={formData.accountId as string}
          locale={locale}
        />
        {/* Native appointment (visit/meeting) participants are attendees — multi-select.
            Native phonecall/email/other use a single contact (From/To semantics). */}
        {(activityType === 'visit' || activityType === 'meeting') ? (
          <MultiContactSelector
            attendees={(formData.attendees as Array<{ id: string; fullname: string }>) || []}
            onChange={(next) => setFormData((prev: Record<string, unknown>) => ({ ...prev, attendees: next }))}
            accountId={formData.accountId as string}
            suggestedNames={[
              ...((formData.contactNames as string[]) || []),
              ...(formData.contactName ? [formData.contactName as string] : []),
            ]}
            locale={locale}
          />
        ) : (
          <ContactSelector
            value={formData.contactId as string}
            onChange={(id: string, name: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, contactId: id, contactName: name }))}
            accountId={formData.accountId as string}
            locale={locale}
          />
        )}
        {/* Free-text context → persisted to the Dataverse `description` column. Shown for BOTH planned
            and completed activities: for a planned task it captures the purpose/agenda/background so the
            user can recall why the task exists; for a completed one it captures the outcome/discussion. */}
        <EditableField
          icon={FileText}
          label={t('details', locale)}
          value={formData.result as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, result: v }))}
          type="textarea"
          placeholder={
            t(activityDraftDetailsPlaceholderKey(activityMode), locale)
          }
        />
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={isConfirming}
          className="flex-1"
        >
          <X className="w-3.5 h-3.5 mr-1.5" />
          {t('cancel', locale)}
        </Button>
        <Button
          size="sm"
          onClick={onConfirm}
          disabled={isConfirming}
          className="flex-1"
        >
          {isConfirming ? (
            <span className="animate-pulse">{t('saving', locale)}</span>
          ) : (
            <>
              <Check className="w-3.5 h-3.5 mr-1.5" />
              {t('confirm', locale)}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// I-8 Slice B-1 hybrid: tiny header that explains WHY the LLM auto-suggested
// this opportunity (signals + confidence). Renders only when _signals are
// present in formData (i.e. the opp came from a completed-activity narrative).
function OpportunitySignalsHeader({ formData, locale }: {
  formData: Record<string, unknown>;
  locale: Locale;
}) {
  const signals = formData._signals as Array<{ type: 'amount'|'timeline'|'product'|'strongIntent'|'weakIntent'; quote: string }> | undefined;
  const confidence = formData._signalConfidence as number | undefined;
  if (!signals || !Array.isArray(signals) || signals.length === 0) return null;
  const score = Math.max(0, Math.min(100, Number(confidence) || 0));
  // Tier mapping mirrors confidence.ts: >=70 high (green), >=40 medium (amber)
  const tier: 'high' | 'medium' | 'low' = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
  const dotsFilled = Math.round(score / 20);
  const tierColor =
    tier === 'high' ? 'text-green-600 bg-green-500/10 border-green-500/30'
    : tier === 'medium' ? 'text-amber-600 bg-amber-500/10 border-amber-500/30'
    : 'text-muted-foreground bg-muted/30 border-border';
  const dotColor =
    tier === 'high' ? 'bg-green-500'
    : tier === 'medium' ? 'bg-amber-500'
    : 'bg-muted-foreground/40';
  const typeLabel = (t: string) => {
    if (locale === 'zh-Hans') {
      return ({ amount: '金额', timeline: '时间', product: '产品', strongIntent: '强意向', weakIntent: '弱意向' } as Record<string, string>)[t] || t;
    }
    return ({ amount: 'Amount', timeline: 'Timeline', product: 'Product', strongIntent: 'Strong intent', weakIntent: 'Interest' } as Record<string, string>)[t] || t;
  };
  return (
    <div className={`rounded-lg border px-3 py-2 mb-2 ${tierColor}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">
            {t('whySuggested', locale)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${i < dotsFilled ? dotColor : 'bg-muted-foreground/20'}`}
            />
          ))}
          <span className="text-[10px] font-semibold ml-1 opacity-80">{score}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {signals.map((s, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-md bg-background/60 px-1.5 py-0.5 text-[10px] border border-border/40"
            title={s.quote}
          >
            <span className="font-medium">{typeLabel(s.type)}</span>
            <span className="italic opacity-75 max-w-[140px] truncate">“{s.quote}”</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// Opportunity Form Card
function OpportunityFormCard({ data, formData, setFormData, onConfirm, onCancel, isConfirming, locale }: {
  data: Record<string, unknown>;
  formData: Record<string, unknown>;
  setFormData: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  onConfirm: () => void;
  onCancel: () => void;
  isConfirming: boolean;
  locale: Locale;
}) {
  const stageOptions = [
    { value: 'prospecting', label: t('stageProspecting', locale) },
    { value: 'qualification', label: t('stageQualification', locale) },
    { value: 'proposal', label: t('stageProposal', locale) },
    { value: 'negotiation', label: t('stageNegotiation', locale) },
    { value: 'won', label: t('stageWon', locale) },
    { value: 'lost', label: t('stageLost', locale) },
  ];

  const stage = formData.stage as string || 'prospecting';
  const stageLabel = stageOptions.find((s: { value: string; label: string }) => s.value === stage)?.label || stage;
  const compact = useCompactDraftForms();

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      <div className={cn('flex items-center gap-2', compact ? 'mb-1.5' : 'mb-3')}>
        <div className={cn('rounded-lg bg-green-500/10 flex items-center justify-center', compact ? 'w-7 h-7' : 'w-8 h-8')}>
          <TrendingUp className="w-4 h-4 text-green-600" />
        </div>
        <div>
          <h4 className="font-medium text-sm text-foreground">
            {t('newOpportunity', locale)}
          </h4>
          <span className="text-xs text-muted-foreground">{stageLabel}</span>
        </div>
      </div>

      <OpportunitySignalsHeader formData={formData} locale={locale} />

      <div className={cn('bg-muted/30 rounded-lg', compact ? 'p-2.5 space-y-0' : 'p-3 space-y-1')}>
        <EditableField 
          icon={FileText} 
          label={t('fieldName', locale)} 
          value={formData.name as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, name: v }))}
          placeholder={t('enterOpportunityName', locale)}
          required
        />
        <AccountSelector
          value={formData.accountId as string}
          onChange={(id: string, name: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, accountId: id, accountName: name }))}
          locale={locale}
        />
        <AmountCurrencyField
          amount={formData.amount as number}
          onAmountChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, amount: Number(v) || 0 }))}
          currencyId={formData.currencyId as string}
          onCurrencyChange={(id: string) => {
            setPreferredCurrencyId(id);
            setFormData((prev: Record<string, unknown>) => ({ ...prev, currencyId: id }));
          }}
          locale={locale}
        />
        <EditableField 
          icon={Tag} 
          label={t('fieldStage', locale)} 
          value={formData.stage as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, stage: v }))}
          type="select"
          options={stageOptions}
        />
        <EditableField 
          icon={TrendingUp} 
          label={t('confidence', locale)} 
          value={formData.confidence as number}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, confidence: Math.min(100, Math.max(0, Number(v) || 50)) }))}
          type="number"
          placeholder="50"
        />
        <EditableField 
          icon={Calendar} 
          label={t('expectedClose', locale)} 
          value={formData.expectedCloseDate as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, expectedCloseDate: v }))}
          type="date"
          placeholder={t('selectDate', locale)}
        />

      </div>

      <div className="flex gap-2 pt-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={isConfirming}
          className="flex-1"
        >
          <X className="w-3.5 h-3.5 mr-1.5" />
          {t('cancel', locale)}
        </Button>
        <Button
          size="sm"
          onClick={onConfirm}
          disabled={isConfirming}
          className="flex-1"
        >
          {isConfirming ? (
            <span className="animate-pulse">{t('saving', locale)}</span>
          ) : (
            <>
              <Check className="w-3.5 h-3.5 mr-1.5" />
              {t('confirm', locale)}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// Account Form Card
function AccountFormCard({ data, formData, setFormData, onConfirm, onCancel, isConfirming, locale }: {
  data: Record<string, unknown>;
  formData: Record<string, unknown>;
  setFormData: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  onConfirm: () => void;
  onCancel: () => void;
  isConfirming: boolean;
  locale: Locale;
}) {
  const compact = useCompactDraftForms();
  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      <div className={cn('flex items-center gap-2', compact ? 'mb-1.5' : 'mb-3')}>
        <div className={cn('rounded-lg bg-blue-500/10 flex items-center justify-center', compact ? 'w-7 h-7' : 'w-8 h-8')}>
          <Building2 className="w-4 h-4 text-blue-600" />
        </div>
        <div>
          <h4 className="font-medium text-sm text-foreground">
            {t('newAccount', locale)}
          </h4>
        </div>
      </div>

      <div className={cn('bg-muted/30 rounded-lg', compact ? 'p-2.5 space-y-0' : 'p-3 space-y-1')}>
        <EditableField 
          icon={Building2} 
          label={t('fieldName', locale)} 
          value={formData.name as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, name: v }))}
          placeholder={t('enterAccountName', locale)}
          required
        />
        <EditableField 
          icon={Tag} 
          label={t('fieldIndustry', locale)} 
          value={formData.industry as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, industry: v }))}
          placeholder={t('enterIndustry', locale)}
        />
        <EditableField 
          icon={Phone} 
          label={t('fieldPhone', locale)} 
          value={formData.phone as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, phone: v }))}
          placeholder={t('enterPhone', locale)}
        />
        <EditableField 
          icon={Mail} 
          label={t('fieldEmail', locale)} 
          value={formData.email as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, email: v }))}
          placeholder={t('enterEmail', locale)}
        />
        <EditableField 
          icon={FileText} 
          label={t('notes', locale)} 
          value={formData.notes as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, notes: v }))}
          type="textarea"
          placeholder={t('enterNotes', locale)}
        />
        <EditableField 
          icon={MapPin} 
          label={t('fieldAddress', locale)} 
          value={formData.address as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, address: v }))}
          placeholder={t('enterAddress', locale)}
        />
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={isConfirming}
          className="flex-1"
        >
          <X className="w-3.5 h-3.5 mr-1.5" />
          {t('cancel', locale)}
        </Button>
        <Button
          size="sm"
          onClick={onConfirm}
          disabled={isConfirming}
          className="flex-1"
        >
          {isConfirming ? (
            <span className="animate-pulse">{t('saving', locale)}</span>
          ) : (
            <>
              <Check className="w-3.5 h-3.5 mr-1.5" />
              {t('confirm', locale)}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// Contact Form Card
function ContactFormCard({ data, formData, setFormData, onConfirm, onCancel, isConfirming, locale }: {
  data: Record<string, unknown>;
  formData: Record<string, unknown>;
  setFormData: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  onConfirm: () => void;
  onCancel: () => void;
  isConfirming: boolean;
  locale: Locale;
}) {
  const compact = useCompactDraftForms();
  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      <div className={cn('flex items-center gap-2', compact ? 'mb-1.5' : 'mb-3')}>
        <div className={cn('rounded-lg bg-purple-500/10 flex items-center justify-center', compact ? 'w-7 h-7' : 'w-8 h-8')}>
          <User className="w-4 h-4 text-purple-600" />
        </div>
        <div>
          <h4 className="font-medium text-sm text-foreground">
            {t('newContact', locale)}
          </h4>
          {typeof formData.title === 'string' && formData.title && <span className="text-xs text-muted-foreground">{formData.title}</span>}
        </div>
      </div>

      <div className={cn('bg-muted/30 rounded-lg', compact ? 'p-2.5 space-y-0' : 'p-3 space-y-1')}>
        <EditableField 
          icon={User} 
          label={t('fieldFullName', locale)} 
          value={formData.fullName as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, fullName: v }))}
          placeholder={t('enterName', locale)}
          required
        />
        <AccountSelector
          value={formData.accountId as string}
          onChange={(id: string, name: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, accountId: id, accountName: name }))}
          locale={locale}
        />
        <EditableField 
          icon={Tag} 
          label={t('fieldJobTitle', locale)} 
          value={formData.title as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, title: v }))}
          placeholder={t('enterJobTitle', locale)}
        />
        <EditableField 
          icon={Phone} 
          label={t('fieldPhone', locale)} 
          value={formData.phone as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, phone: v }))}
          placeholder={t('enterPhone', locale)}
        />
        <EditableField 
          icon={Mail} 
          label={t('fieldEmail', locale)} 
          value={formData.email as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, email: v }))}
          placeholder={t('enterEmail', locale)}
        />
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={isConfirming}
          className="flex-1"
        >
          <X className="w-3.5 h-3.5 mr-1.5" />
          {t('cancel', locale)}
        </Button>
        <Button
          size="sm"
          onClick={onConfirm}
          disabled={isConfirming}
          className="flex-1"
        >
          {isConfirming ? (
            <span className="animate-pulse">{t('saving', locale)}</span>
          ) : (
            <>
              <Check className="w-3.5 h-3.5 mr-1.5" />
              {t('confirm', locale)}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function FeedbackFormCard({ formData, setFormData, onConfirm, onCancel, isConfirming, locale, screenshotCount }: {
  formData: Record<string, unknown>;
  setFormData: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  onConfirm: () => void;
  onCancel: () => void;
  isConfirming: boolean;
  locale: Locale;
  screenshotCount: number;
}) {
  const isZh = locale === 'zh-Hans';
  const feedbackType = formData.feedbackType === 'enhancement' ? 'enhancement' : 'bug';
  const title = String(formData.title || '').trim();
  const description = String(formData.description || '').trim();
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center',
          feedbackType === 'bug' ? 'bg-red-500/10' : 'bg-amber-500/10',
        )}>
          {feedbackType === 'bug'
            ? <Bug className="w-4 h-4 text-red-600" />
            : <Lightbulb className="w-4 h-4 text-amber-600" />}
        </div>
        <div>
          <h4 className="font-medium text-sm text-foreground">{isZh ? '提交产品反馈' : 'Submit product feedback'}</h4>
          <p className="text-xs text-muted-foreground">{isZh ? '确认后保存到反馈中心' : 'Saved to Feedback Center after confirmation'}</p>
        </div>
      </div>

      <div className="bg-muted/30 rounded-lg p-3 space-y-2">
        <EditableField
          icon={Tag}
          label={isZh ? '类型' : 'Type'}
          value={feedbackType}
          onChange={(value) => setFormData((prev) => ({ ...prev, feedbackType: value }))}
          type="select"
          options={[
            { value: 'bug', label: isZh ? '缺陷' : 'Bug' },
            { value: 'enhancement', label: isZh ? '改进建议' : 'Improvement' },
          ]}
          required
        />
        <EditableField
          icon={FileText}
          label={isZh ? '标题' : 'Title'}
          value={title}
          onChange={(value) => setFormData((prev) => ({ ...prev, title: value }))}
          placeholder={isZh ? '一句话概括问题或建议' : 'Summarize the problem or request'}
          required
        />
        <EditableField
          icon={FileText}
          label={feedbackType === 'bug' ? (isZh ? '实际表现' : 'Actual behavior') : (isZh ? '改进内容' : 'Requested improvement')}
          value={description}
          onChange={(value) => setFormData((prev) => ({ ...prev, description: value }))}
          type="textarea"
          required
        />
        <EditableField
          icon={Check}
          label={isZh ? '期望结果' : 'Expected outcome'}
          value={formData.expectedOutcome as string}
          onChange={(value) => setFormData((prev) => ({ ...prev, expectedOutcome: value }))}
          type="textarea"
        />
        {feedbackType === 'bug' && (
          <EditableField
            icon={ChevronRight}
            label={isZh ? '复现步骤' : 'Reproduction steps'}
            value={formData.reproductionSteps as string}
            onChange={(value) => setFormData((prev) => ({ ...prev, reproductionSteps: value }))}
            type="textarea"
          />
        )}
        {screenshotCount > 0 && (
          <div className="flex items-center gap-2 rounded-md bg-background/60 px-3 py-2 text-xs text-muted-foreground" data-testid="feedback-screenshot-count">
            <Image className="w-4 h-4 text-primary" />
            {isZh ? `将上传 ${screenshotCount} 张截图` : `${screenshotCount} screenshot${screenshotCount > 1 ? 's' : ''} will be uploaded`}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onCancel} disabled={isConfirming} className="flex-1">
          <X className="w-3.5 h-3.5 mr-1.5" />{isZh ? '取消' : 'Cancel'}
        </Button>
        <Button size="sm" onClick={onConfirm} disabled={isConfirming || !title || !description} className="flex-1" data-testid="submit-feedback">
          {isConfirming ? (isZh ? '提交中…' : 'Submitting…') : <><Check className="w-3.5 h-3.5 mr-1.5" />{isZh ? '提交反馈' : 'Submit feedback'}</>}
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
        {t('saved', locale)}
      </span>
    </div>
  );
}

// ── Saved-card read-only summary helpers ───────────────────────────────────
type SummaryIcon = React.ComponentType<{ className?: string }>;

/** Per-row icon for the expanded saved card, keyed by the stable field id the
 *  display helper emits so the pure builder stays free of JSX/icon concerns. */
const SAVED_ROW_ICONS: Record<SavedCardRowKey, SummaryIcon> = {
  opportunity: Target,
  attendees: Users,
  contact: User,
  close: Calendar,
  confidence: TrendingUp,
  email: Mail,
  address: MapPin,
  notes: FileText,
  phone: Phone,
  feedbackDetail: FileText,
  expectedOutcome: Check,
  reproductionSteps: ChevronRight,
};

/** Distinct saved-card header glyph per activity subtype. The summary already
 *  spells out the type, but a matching icon speeds visual scanning. */
function activityHeaderIcon(activityType: string): SummaryIcon {
  switch (activityType) {
    case 'call': return Phone;
    case 'meeting': return Users;
    case 'email': return Mail;
    case 'visit': return MapPin;
    default: return Calendar;
  }
}

/** A single read-only label/value row in the expanded saved card. */
function ReadOnlyRow({ icon: Icon, label, value }: { icon: SummaryIcon; label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 py-1">
      <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="text-[11px] text-muted-foreground block leading-tight">{label}</span>
        <p className="text-sm text-foreground break-words leading-snug">{value}</p>
      </div>
    </div>
  );
}

// Main Form Card Component
export function FormCard({ formCard, messageId, batchIndex, onStatusChange }: FormCardProps) {
  const navigate = useNavigate();
  const locale: Locale = getLocale();
  const copilot = useCopilot();
  const { data: user } = useUser();
  const [isConfirming, setIsConfirming] = useState(false);
  const [status, setStatus] = useState<'pending' | 'confirmed' | 'modified' | 'cancelled'>(formCard.status || 'pending');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submissionWarning, setSubmissionWarning] = useState<string | null>(null);
  const [createdRecordId, setCreatedRecordId] = useState<string | null>(formCard.createdRecordId || null);
  // Use ref to keep the latest createdRecordId available immediately (for async operations)
  const createdRecordIdRef = useRef<string | null>(formCard.createdRecordId || null);
  // Saved-card expand toggle: reveals a read-only summary so users can review in place.
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Sync status and createdRecordId from props when they change (e.g., after context update)
  useEffect(() => {
    if (formCard.status && formCard.status !== status) {
      setStatus(formCard.status);
    }
  }, [formCard.status]);
  
  useEffect(() => {
    if (formCard.createdRecordId && formCard.createdRecordId !== createdRecordId) {
      setCreatedRecordId(formCard.createdRecordId);
      createdRecordIdRef.current = formCard.createdRecordId;
    }
  }, [formCard.createdRecordId]);
  
  // Editable form data state - initialized from formCard.data
  const [formData, setFormData] = useState<Record<string, unknown>>(() => {
    if (formCard.type !== 'activity') return formCard.data;
    return {
      ...formCard.data,
      temporalMode: resolveActivityDraftMode({
        temporalMode: formCard.data.temporalMode,
        scheduledDate: formCard.data.scheduledDate,
      }),
    };
  });

  // Sync formData when formCard.data changes (e.g., after user selects a match)
  // Use JSON comparison to avoid unnecessary updates
  const formCardDataJSON = JSON.stringify(formCard.data);
  useEffect(() => {
    // Only update if formCard.data has different values than current formData
    // This preserves user edits while allowing updates from pendingIntent
    const currentDataJSON = JSON.stringify(formData);
    if (formCardDataJSON !== currentDataJSON) {
      // Merge new data with existing formData, preferring non-empty values from formCard.data
      setFormData((prev) => {
        const merged = { ...prev };
        const newData = formCard.data;
        for (const key in newData) {
          // Only update if the new value is non-empty and the previous value was empty
          const newValue = newData[key];
          const prevValue = prev[key];
          if (newValue !== undefined && newValue !== '' && (prevValue === undefined || prevValue === '')) {
            merged[key] = newValue;
          }
        }
        return merged;
      });
    }
  }, [formCardDataJSON]);

  // Use mutation hooks for proper cache invalidation
  const createActivity = useCreateActivity();
  const createOpportunity = useCreateOpportunity();
  const createAccount = useCreateAccount();
  const createContact = useCreateContact();
  const createFeedback = useCreateAppFeedback();

  // Handle confirmation - create the record
  const handleConfirm = async () => {
    if (isConfirming) return; // guard against double-tap / modal remount races
    setIsConfirming(true);
    setValidationError(null);
    try {
      const { type } = formCard;

      if (type === 'feedback') {
        const feedbackType = formData.feedbackType === 'enhancement' ? 'enhancement' : 'bug';
        const title = String(formData.title || '').trim();
        const description = String(formData.description || '').trim();
        if (!title || !description) {
          setValidationError(locale === 'zh-Hans' ? '标题和描述不能为空' : 'Title and description are required');
          return;
        }
        const diagnostics = collectSafeFeedbackDiagnostics();
        const createdFeedback = await createFeedback.mutateAsync({
          title,
          type: feedbackType,
          description,
          expectedOutcome: String(formData.expectedOutcome || '').trim(),
          reproductionSteps: String(formData.reproductionSteps || '').trim(),
          currentPage: safeFeedbackPage(String(formData.currentPage || '')),
          appVersion: CURRENT_VERSION,
          buildId: __BUILD_TIMESTAMP__,
          locale,
          ...diagnostics,
          source: 'copilot',
          status: 'collected',
          clientRequestId: String(formData.clientRequestId || ''),
          submittedOn: new Date().toISOString(),
        } as Omit<AppFeedback, 'id'>);
        setCreatedRecordId(createdFeedback.id);
        createdRecordIdRef.current = createdFeedback.id;
        if (formCard.attachmentIds?.length) {
          const screenshots = getAttachments(formCard.attachmentIds);
          const upload = await uploadFeedbackScreenshots(createdFeedback.id, screenshots);
          if (upload.failed > 0) {
            setSubmissionWarning(locale === 'zh-Hans'
              ? `反馈已保存，但 ${upload.failed} 张截图上传失败`
              : `Feedback was saved, but ${upload.failed} screenshot upload${upload.failed > 1 ? 's' : ''} failed`);
          }
          dropAttachments(formCard.attachmentIds);
        }
        copilot.updateFormCardStatus(messageId, 'confirmed', batchIndex, createdFeedback.id, formData);
        await copilot.formCardSaved({
          messageId,
          type: 'feedback',
          recordId: createdFeedback.id,
          recordName: title,
        });
      } else if (type === 'activity') {
        // Only visit/call/meeting/email are backed by native Dataverse tables.
        // Coerce any legacy/stray value (e.g. a pre-existing 'other' draft) to a
        // representable type so the create path never receives an invalid type.
        const rawType = (formData.type as string) || 'visit';
        const activityType = ['visit', 'call', 'meeting', 'email'].includes(rawType) ? rawType : 'meeting';
        
        // Use accountId directly if provided
        let targetAccount: Account | undefined;
        const accountIdFromData = formData.accountId as string;
        
        if (accountIdFromData) {
          const accounts = await import('@/generated/services/account-service').then(m => m.AccountService.getAll());
          targetAccount = accounts.find((a: Account) => a.id === accountIdFromData);
        } else if (formData.accountName) {
          const accounts = await import('@/generated/services/account-service').then(m => m.AccountService.getAll());
          const accountNameLower = (formData.accountName as string || '').toLowerCase().trim();
          targetAccount = accounts.find((a: Account) => a.name1?.toLowerCase() === accountNameLower);
          if (!targetAccount && accountNameLower) {
            targetAccount = accounts.find((a: Account) => {
              const name = (a.name1 || '').toLowerCase();
              return name.includes(accountNameLower) || accountNameLower.includes(name);
            });
          }
        }
        
        // Find opportunity by ID or name if provided
        let targetOpportunity: Opportunity | undefined;
        const opportunityIdFromData = formData.opportunityId as string;
        
        if (opportunityIdFromData) {
          const opportunities = await import('@/generated/services/opportunity-service').then(m => m.OpportunityService.getAll());
          targetOpportunity = opportunities.find((o: Opportunity) => o.id === opportunityIdFromData);
        } else if (formData.opportunityName) {
          const opportunities = await import('@/generated/services/opportunity-service').then(m => m.OpportunityService.getAll());
          const opportunityNameLower = (formData.opportunityName as string || '').toLowerCase().trim();
          targetOpportunity = opportunities.find((o: Opportunity) => o.name1?.toLowerCase() === opportunityNameLower);
          if (!targetOpportunity && opportunityNameLower) {
            targetOpportunity = opportunities.find((o: Opportunity) => {
              const name = (o.name1 || '').toLowerCase();
              return name.includes(opportunityNameLower) || opportunityNameLower.includes(name);
            });
          }
        }
        
        // Find contact by ID or name if provided
        let targetContact: Contact | undefined;
        const contactIdFromData = formData.contactId as string;
        if (contactIdFromData) {
          const contacts = await import('@/generated/services/contact-service').then(m => m.ContactService.getAll());
          targetContact = contacts.find((c: Contact) => c.id === contactIdFromData);
        } else if (formData.contactName) {
          const contacts = await import('@/generated/services/contact-service').then(m => m.ContactService.getAll());
          const contactNameLower = (formData.contactName as string || '').toLowerCase().trim();
          targetContact = contacts.find((c: Contact) => c.fullname?.toLowerCase() === contactNameLower);
          if (!targetContact && contactNameLower) {
            targetContact = contacts.find((c: Contact) => {
              const name = (c.fullname || '').toLowerCase();
              return name.includes(contactNameLower) || contactNameLower.includes(name);
            });
          }
        }
        
        const activityMode = resolveActivityDraftMode({
          temporalMode: formData.temporalMode,
          scheduledDate: formData.scheduledDate,
        });
        const status: Activity['status'] = activityStatusForDraftMode(activityMode);

        const resultText = ((formData.result as string) || '').trim();
        const notesText = ((formData.notes as string) || '').trim();
        const activityNotes = [resultText, notesText]
          .filter(Boolean)
          .join('\n\n');

        const createInput: Omit<Activity, 'id'> = {
          title: formData.title as string || '',
          type: activityType as Activity['type'],
          status,
          ownerid: user?.objectId || 'unknown',
          scheduleddate: combineDateTime(
            (formData.scheduledDate as string) || new Date().toISOString(),
            (formData.scheduledTime as string) || timeFromISO(formData.scheduledDate as string),
          ),
          durationMinutes: (formData.durationMinutes as number) || DEFAULT_DURATION_MINUTES,
          notes: activityNotes,
          ...(targetAccount && { account: { id: targetAccount.id, name1: targetAccount.name1 } }),
          ...(targetOpportunity && { opportunity: { id: targetOpportunity.id, name1: targetOpportunity.name1 } }),
        };
        // Native appointment (visit/meeting) participants are attendees only.
        // Native phonecall/email use a single contact (From/To). Avoid storing both.
        const attendees = (formData.attendees as Array<{ id: string; fullname: string }>) || [];
        if (activityType === 'visit' || activityType === 'meeting') {
          if (attendees.length > 0) {
            createInput.contacts = attendees.map((a) => ({ id: a.id, fullname: a.fullname, role: 'required' as const }));
          }
        } else if (targetContact) {
          createInput.contact = { id: targetContact.id, fullname: targetContact.fullname };
        }
        const createdActivity = await createActivity.mutateAsync(createInput);
        // Bump account's last-contacted timestamp so dashboards stay accurate.
        if (targetAccount?.id) {
          await touchAccountLastContacted(targetAccount.id, createInput.scheduleddate);
        }
        setCreatedRecordId(createdActivity.id);
        createdRecordIdRef.current = createdActivity.id;
        // Upload composer attachments as Notes (annotation) bound to this activity.
        if (formCard.attachmentIds?.length) {
          const atts = getAttachments(formCard.attachmentIds);
          if (atts.length) {
            await uploadAttachmentsToActivity(
              createdActivity.id,
              createInput.type,
              atts,
            );
            dropAttachments(formCard.attachmentIds);
            // Attachment outcome is reflected inline on the confirmed card; no toast.
          }
        }
        // Pass the created record ID to persist it in session storage
        copilot.updateFormCardStatus(messageId, 'confirmed', batchIndex, createdActivity.id, {
          ...formData,
          temporalMode: activityMode,
          accountId: targetAccount?.id ?? formData.accountId,
          accountName: targetAccount?.name1 ?? formData.accountName,
          opportunityId: targetOpportunity?.id ?? formData.opportunityId,
          opportunityName: targetOpportunity?.name1 ?? formData.opportunityName,
          contactId: targetContact?.id ?? formData.contactId,
          contactName: targetContact?.fullname ?? formData.contactName,
        });
        copilot.formCardSaved({
          messageId,
          type: 'activity',
          recordId: createdActivity.id,
          accountId: targetAccount?.id,
          accountName: targetAccount?.name1,
          opportunityId: targetOpportunity?.id,
          opportunityName: targetOpportunity?.name1,
          contactId: targetContact?.id,
          contactName: targetContact?.fullname,
        });
      } else if (type === 'opportunity') {
        const stage = (formData.stage as string) || 'prospecting';
        
        let targetAccount: Account | undefined;
        const accountIdFromData = formData.accountId as string;
        
        if (accountIdFromData) {
          const accounts = await import('@/generated/services/account-service').then(m => m.AccountService.getAll());
          targetAccount = accounts.find((a: Account) => a.id === accountIdFromData);
        } else {
          const accounts = await import('@/generated/services/account-service').then(m => m.AccountService.getAll());
          const oppAccountNameLower = (formData.accountName as string || '').toLowerCase().trim();
          targetAccount = accounts.find((a: Account) => a.name1?.toLowerCase() === oppAccountNameLower);
          if (!targetAccount && oppAccountNameLower) {
            targetAccount = accounts.find((a: Account) => {
              const name = (a.name1 || '').toLowerCase();
              return name.includes(oppAccountNameLower) || oppAccountNameLower.includes(name);
            });
          }
        }
        
        if (!targetAccount) {
          setValidationError(t('accountNotFoundCreate', locale));
          setIsConfirming(false);
          return;
        }

        // Validate required fields before saving
        const oppName = (formData.name as string || '').trim();
        if (!oppName) {
          setValidationError(t('opportunityNameRequired', locale));
          setIsConfirming(false);
          return;
        }
        
        const createdOpp = await createOpportunity.mutateAsync({
          name1: oppName,
          account: { id: targetAccount.id, name1: targetAccount.name1 },
          totalamount: formData.amount as number || 0,
          currencyId: (formData.currencyId as string) || getPreferredCurrencyId() || undefined,
          stage,
          confidence: formData.confidence as number || 50,
          expectedclosedate: (formData.expectedCloseDate as string) || undefined,
          lastaction: formData.lastAction as string || '',
          ownerid: user?.objectId || 'unknown',
        } as Omit<Opportunity, 'id'>);
        setCreatedRecordId(createdOpp.id);
        createdRecordIdRef.current = createdOpp.id;
        copilot.updateFormCardStatus(messageId, 'confirmed', batchIndex, createdOpp.id, {
          ...formData,
          accountId: targetAccount.id,
          accountName: targetAccount.name1 ?? formData.accountName,
        });
        // Unified queue / legacy resume.
        copilot.formCardSaved({
          messageId,
          type: 'opportunity',
          recordId: createdOpp.id,
          recordName: oppName,
          accountId: targetAccount.id,
          accountName: targetAccount.name1 || '',
        });
      } else if (type === 'account') {
        const createdAccount = await createAccount.mutateAsync({
          name1: formData.name as string || '',
          industry: formData.industry as string || '',
          phone: formData.phone as string || '',
          email: formData.email as string || '',
          address: formData.address as string || '',
          notes: formData.notes as string || '',
          ownerid: user?.objectId || 'unknown',
        } as Omit<Account, 'id'>);
        setCreatedRecordId(createdAccount.id);
        createdRecordIdRef.current = createdAccount.id;
        copilot.updateFormCardStatus(messageId, 'confirmed', batchIndex, createdAccount.id, formData);
        // Unified queue / legacy resume.
        copilot.formCardSaved({
          messageId,
          type: 'account',
          recordId: createdAccount.id,
          recordName: formData.name as string || '',
        });
      } else if (type === 'contact') {
        // Create contact
        let targetAccount: Account | undefined;
        const accountIdFromData = formData.accountId as string;
        
        if (accountIdFromData) {
          const accounts = await import('@/generated/services/account-service').then(m => m.AccountService.getAll());
          targetAccount = accounts.find((a: Account) => a.id === accountIdFromData);
        } else {
          const accounts = await import('@/generated/services/account-service').then(m => m.AccountService.getAll());
          const contactAccountNameLower = (formData.accountName as string || '').toLowerCase().trim();
          targetAccount = accounts.find((a: Account) => a.name1?.toLowerCase() === contactAccountNameLower);
          if (!targetAccount && contactAccountNameLower) {
            targetAccount = accounts.find((a: Account) => {
              const name = (a.name1 || '').toLowerCase();
              return name.includes(contactAccountNameLower) || contactAccountNameLower.includes(name);
            });
          }
        }
        
        if (!targetAccount) {
          setValidationError(t('accountNotFoundCreate', locale));
          setIsConfirming(false);
          return;
        }
        
        const createdContact = await createContact.mutateAsync({
          fullname: formData.fullName as string || '',
          account: { id: targetAccount.id, name1: targetAccount.name1 },
          title: formData.title as string || '',
          phone: formData.phone as string || '',
          email: formData.email as string || '',
        } as Omit<Contact, 'id'>);
        setCreatedRecordId(createdContact.id);
        createdRecordIdRef.current = createdContact.id;
        copilot.updateFormCardStatus(messageId, 'confirmed', batchIndex, createdContact.id, {
          ...formData,
          accountId: targetAccount.id,
          accountName: targetAccount.name1 ?? formData.accountName,
        });

        // Unified queue / legacy resume.
        copilot.formCardSaved({
          messageId,
          type: 'contact',
          recordId: createdContact.id,
          recordName: formData.fullName as string || '',
          accountId: targetAccount.id,
          accountName: targetAccount.name1 || '',
        });
      }

      setStatus('confirmed');
      // updateFormCardStatus already called above with createdRecordId for each type
      onStatusChange?.('confirmed');
    } catch (error) {
      console.error('Failed to create record:', error);
      // Toast is shown by the global MutationCache.onError handler in query-client.ts.
    } finally {
      setIsConfirming(false);
    }
  };

  // Handle cancel - collapse the card and advance the queue.
  const handleCancel = () => {
    setStatus('cancelled');
    onStatusChange?.('cancelled');
    copilot.updateFormCardStatus(messageId, 'cancelled', batchIndex, undefined, formData);
    // Notify queue / context so a multi-step flow advances past this cancelled step
    // instead of stalling the entire queue.
    copilot.formCardCancelled(messageId);
  };

  // If cancelled, show a compact collapsed card so subsequent cards are clearly the active one.
  if (status === 'cancelled') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card p-3 rounded-xl opacity-60"
        data-form-card-type={formCard.type}
        data-form-card-status="cancelled"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {formCard.type === 'activity' && <Calendar className="w-4 h-4 text-muted-foreground" />}
            {formCard.type === 'contact' && <User className="w-4 h-4 text-muted-foreground" />}
            {formCard.type === 'opportunity' && <TrendingUp className="w-4 h-4 text-muted-foreground" />}
            {formCard.type === 'account' && <Building2 className="w-4 h-4 text-muted-foreground" />}
            {formCard.type === 'feedback' && <Bug className="w-4 h-4 text-muted-foreground" />}
            <span className="text-sm font-medium text-muted-foreground line-through">
              {formCardPrimaryText(formCard.type, formData)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground bg-muted/30 px-2 py-1 rounded-md">
            <X className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">
              {t('cancelled2', locale)}
            </span>
          </div>
        </div>
      </motion.div>
    );
  }

  // If already confirmed, show simplified view with click to navigate
  if (status === 'confirmed') {
    const handleConfirmedClick = () => {
      const { type } = formCard;
      // Use ref first (most reliable), then state, then prop as fallback
      const recordId = createdRecordIdRef.current || createdRecordId || formCard.createdRecordId;
      
      console.log('[FormCard] handleConfirmedClick - type:', type, 'recordId:', recordId, 'ref:', createdRecordIdRef.current, 'state:', createdRecordId, 'prop:', formCard.createdRecordId);
      
      copilot.closePanel();
      
      setTimeout(() => {
        if (type === 'activity') {
          // Navigate to activity capture page with edit mode using the created record ID
          if (recordId) {
            navigate(`/activity-capture?edit=${recordId}`);
          } else {
            navigate('/activity-capture');
          }
        } else if (type === 'opportunity') {
          if (recordId) {
            navigate('/opportunity-review', { state: { opportunityId: recordId } });
          } else {
            navigate('/opportunity-review');
          }
        } else if (type === 'account') {
          if (recordId) {
            navigate(recordDetailRoute('account', recordId));
          } else {
            navigate(recordListRoute('account'));
          }
        } else if (type === 'contact') {
          navigate(recordId
            ? recordDetailRoute('contact', recordId)
            : recordListRoute('contact'));
        }
      }, 150);
    };
    
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card rounded-xl overflow-hidden"
        data-form-card-type={formCard.type}
        data-form-card-status="confirmed"
      >
        {(() => {
          const { summary, rows, description } = buildSavedCardDetails(formCard.type, formData, locale);
          const title = formCardPrimaryText(formCard.type, formData);
          const ActivityIcon = activityHeaderIcon(typeof formData.type === 'string' ? formData.type : 'visit');
          return (
            <>
              <button
                type="button"
                onClick={() => setIsExpanded((v) => !v)}
                data-state={isExpanded ? 'open' : 'closed'}
                className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {formCard.type === 'activity' && <ActivityIcon className="w-5 h-5 text-primary shrink-0" />}
                  {formCard.type === 'contact' && <User className="w-5 h-5 text-purple-600 shrink-0" />}
                  {formCard.type === 'opportunity' && <TrendingUp className="w-5 h-5 text-green-600 shrink-0" />}
                  {formCard.type === 'account' && <Building2 className="w-5 h-5 text-blue-600 shrink-0" />}
                  {formCard.type === 'feedback' && <Bug className="w-5 h-5 text-red-600 shrink-0" />}
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-foreground block truncate">{title}</span>
                    {summary && (
                      <span className="text-[11px] text-muted-foreground block truncate">{summary}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <ConfirmedBadge locale={locale} />
                  <ChevronDown
                    className={cn(
                      'w-4 h-4 text-muted-foreground transition-transform',
                      isExpanded && 'rotate-180',
                    )}
                  />
                </div>
              </button>

              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="border-t border-border/50 px-3 pt-2 pb-3"
                >
                  <div className="space-y-0.5">
                    {rows.map((r) => (
                      <ReadOnlyRow key={r.key} icon={SAVED_ROW_ICONS[r.key]} label={r.label} value={r.value} />
                    ))}
                  </div>
                  {description && (
                    <p className="mt-1.5 text-sm text-foreground/90 whitespace-pre-wrap break-words leading-snug">
                      {description}
                    </p>
                  )}
                  {formCard.type !== 'feedback' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleConfirmedClick}
                      className="w-full mt-2.5"
                    >
                      {t('openFullDetails', locale)}
                      <ChevronRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  )}
                  {submissionWarning && (
                    <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400" role="status">
                      <Image className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span>{submissionWarning}</span>
                    </div>
                  )}
                </motion.div>
              )}
            </>
          );
        })()}
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
      data-form-card-type={formCard.type}
      data-form-card-status="pending"
    >
      {(formCard.type === 'activity' || formCard.type === 'feedback') && formCard.attachmentIds && formCard.attachmentIds.length > 0 && (
        <div className="mb-3">
          <div className="text-helper text-muted-foreground mb-1.5">
            {t('attachmentsCount', locale, { count: formCard.attachmentIds.length })}
          </div>
          <div className="flex gap-2 flex-wrap">
            {getAttachments(formCard.attachmentIds).map((att) => (
              att.type === 'image' ? (
                <div key={att.id} className="w-14 h-14 rounded-lg overflow-hidden border border-border/50">
                  <img src={att.dataUrl} alt={att.name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div key={att.id} className="w-14 h-14 rounded-lg border border-border/50 bg-muted/50 flex flex-col items-center justify-center px-1">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-[7px] text-muted-foreground mt-0.5 truncate max-w-full">
                    {att.name.length > 8 ? att.name.slice(0, 8) + '…' : att.name}
                  </span>
                </div>
              )
            ))}
          </div>
        </div>
      )}
      {formCard.type === 'activity' && (
        <ActivityFormCard
          data={formCard.data}
          formData={formData}
          setFormData={setFormData}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          isConfirming={isConfirming}
          locale={locale}
        />
      )}
      {formCard.type === 'opportunity' && (
        <OpportunityFormCard
          data={formCard.data}
          formData={formData}
          setFormData={setFormData}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          isConfirming={isConfirming}
          locale={locale}
        />
      )}
      {formCard.type === 'account' && (
        <AccountFormCard
          data={formCard.data}
          formData={formData}
          setFormData={setFormData}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          isConfirming={isConfirming}
          locale={locale}
        />
      )}
      {formCard.type === 'contact' && (
        <ContactFormCard
          data={formCard.data}
          formData={formData}
          setFormData={setFormData}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          isConfirming={isConfirming}
          locale={locale}
        />
      )}
      {formCard.type === 'feedback' && (
        <FeedbackFormCard
          formData={formData}
          setFormData={setFormData}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          isConfirming={isConfirming}
          locale={locale}
          screenshotCount={getAttachments(formCard.attachmentIds).filter((attachment) => attachment.type === 'image').length}
        />
      )}
      {validationError && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
          <X className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{validationError}</span>
        </div>
      )}
    </motion.div>
  );
}
