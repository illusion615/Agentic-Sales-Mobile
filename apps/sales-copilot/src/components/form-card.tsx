/**
 * Form Card Components for Copilot Chat
 * Renders editable draft forms for Activity, Opportunity, Account, and Contact
 * within the chat interface for user confirmation.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Check, X, Calendar, User, Users, Building2, Phone, Mail, MapPin, DollarSign, TrendingUp, FileText, Tag, ChevronRight, ChevronDown, Target, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { getLocale, type Locale } from '@/lib/i18n';
import { formatCurrencyCompact } from '@/lib/format-currency';
import { useCopilot } from '@/contexts/copilot-context';
import { format } from 'date-fns/format';

// Hooks for creating records (use mutations for cache invalidation)
import { useCreateActivity } from '@/generated/hooks/use-activity';
import { useCreateOpportunity } from '@/generated/hooks/use-opportunity';
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

export interface FormCardData {
  type: 'activity' | 'opportunity' | 'account' | 'contact';
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
  onStatusChange?: (status: 'confirmed' | 'modified' | 'cancelled') => void;
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
  const [isOpen, setIsOpen] = useState(false);
  const isMissing = required && (value === undefined || value === null || String(value).trim() === '');
  
  return (
    <div className={cn('flex items-start gap-2 py-1', className)}>
      <Icon className={cn('w-4 h-4 mt-2 flex-shrink-0', isMissing ? 'text-destructive' : 'text-muted-foreground')} />
      <div className="flex-1 min-w-0">
        <span className={cn('text-xs', isMissing ? 'text-destructive' : 'text-muted-foreground')}>
          {label}{required && <span className="text-destructive"> *</span>}
        </span>
        {type === 'select' && options ? (
          <Select value={String(value || '')} onValueChange={onChange}>
            <SelectTrigger className="h-8 text-sm mt-0.5 w-full min-w-0">
              <SelectValue placeholder={placeholder || label} />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt: { value: string; label: string }) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : type === 'date' ? (
          <input
            type="date"
            aria-label={label}
            title={label}
            className="h-8 w-full rounded-md border border-input bg-transparent dark:bg-input/30 px-3 py-1 text-sm mt-0.5 text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            value={value ? String(value) : ''}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : type === 'textarea' ? (
          <Textarea
            value={String(value || '')}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
            placeholder={placeholder}
            className="min-h-[60px] text-sm mt-0.5 resize-none"
          />
        ) : type === 'number' ? (
          <Input
            type="number"
            value={String(value || '')}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
            placeholder={placeholder}
            className="h-8 text-sm mt-0.5"
          />
        ) : (
          <Input
            type="text"
            value={String(value || '')}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
            placeholder={placeholder}
            className="h-8 text-sm mt-0.5"
          />
        )}
        {isMissing && (
          <p className="mt-1 text-[11px] text-destructive">
            {missingHint || (getLocale() === 'zh-Hans' ? `请填写${label}` : `${label} is required`)}
          </p>
        )}
      </div>
    </div>
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
  
  return (
    <div className="flex items-start gap-2 py-1">
      <Building2 className="w-4 h-4 text-muted-foreground mt-2 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-xs text-muted-foreground">
          {locale === 'zh-Hans' ? '客户' : 'Account'}
        </span>
        <Select 
          value={value || ''} 
          onValueChange={(val: string) => {
            const account = accounts.find((a: Account) => a.id === val);
            if (account) {
              onChange(account.id, account.name1 || '');
            }
          }}
        >
          <SelectTrigger className="h-8 text-sm mt-0.5 w-full min-w-0">
            <SelectValue placeholder={locale === 'zh-Hans' ? '选择客户' : 'Select account'} />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((account: Account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name1}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
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
  
  return (
    <div className="flex items-start gap-2 py-1">
      <Target className="w-4 h-4 text-muted-foreground mt-2 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-xs text-muted-foreground">
          {locale === 'zh-Hans' ? '关联商机' : 'Opportunity'}
        </span>
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
          <SelectTrigger className="h-8 text-sm mt-0.5 w-full min-w-0">
            <SelectValue placeholder={locale === 'zh-Hans' ? '选择商机（可选）' : 'Select opportunity (optional)'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              {locale === 'zh-Hans' ? '无' : 'None'}
            </SelectItem>
            {filteredOpportunities.map((opp: Opportunity) => (
              <SelectItem key={opp.id} value={opp.id}>
                {opp.name1}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// Contact selector component
function ContactSelector({ 
  value, 
  onChange,
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
  
  return (
    <div className="flex items-start gap-2 py-1">
      <User className="w-4 h-4 text-muted-foreground mt-2 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-xs text-muted-foreground">
          {locale === 'zh-Hans' ? '联系人' : 'Contact'}
        </span>
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
          <SelectTrigger className="h-8 text-sm mt-0.5 w-full min-w-0">
            <SelectValue placeholder={locale === 'zh-Hans' ? '选择联系人（可选）' : 'Select contact (optional)'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              {locale === 'zh-Hans' ? '无' : 'None'}
            </SelectItem>
            {filteredContacts.map((contact: Contact) => (
              <SelectItem key={contact.id} value={contact.id}>
                {contact.fullname}{contact.title ? ` (${contact.title})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
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

  return (
    <div className="flex items-start gap-2 py-1">
      <Users className="w-4 h-4 text-muted-foreground mt-2 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-xs text-muted-foreground">
          {locale === 'zh-Hans' ? '参会人' : 'Attendees'}
        </span>
        {attendees.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1 mb-1">
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
                  aria-label={locale === 'zh-Hans' ? '移除' : 'Remove'}
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
          <SelectTrigger className="h-8 text-sm mt-0.5 w-full min-w-0">
            <SelectValue placeholder={locale === 'zh-Hans' ? '添加参会人' : 'Add attendee'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="add">
              {locale === 'zh-Hans' ? '添加参会人…' : 'Add attendee…'}
            </SelectItem>
            {available.map((contact: Contact) => (
              <SelectItem key={contact.id} value={contact.id}>
                {contact.fullname}{contact.title ? ` (${contact.title})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
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
    { value: 'visit', label: locale === 'zh-Hans' ? '拜访' : 'Visit' },
    { value: 'call', label: locale === 'zh-Hans' ? '电话' : 'Call' },
    { value: 'meeting', label: locale === 'zh-Hans' ? '会议' : 'Meeting' },
    { value: 'email', label: locale === 'zh-Hans' ? '邮件' : 'Email' },
    { value: 'other', label: locale === 'zh-Hans' ? '其他' : 'Other' },
  ];

  const activityType = formData.type as string || 'visit';
  const typeLabel = typeOptions.find((t: { value: string; label: string }) => t.value === activityType)?.label || activityType;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Calendar className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm text-foreground truncate">
            {locale === 'zh-Hans' ? '新建活动' : 'New Activity'}
          </h4>
          <span className="text-xs text-muted-foreground">{typeLabel}</span>
        </div>
      </div>

      <div className="bg-muted/30 rounded-lg p-3 space-y-1">
        <EditableField 
          icon={FileText} 
          label={locale === 'zh-Hans' ? '标题' : 'Title'} 
          value={formData.title as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, title: v }))}
          placeholder={locale === 'zh-Hans' ? '输入活动标题' : 'Enter activity title'}
          required
        />
        <EditableField 
          icon={Tag} 
          label={locale === 'zh-Hans' ? '类型' : 'Type'} 
          value={formData.type as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, type: v }))}
          type="select"
          options={typeOptions}
        />
        <AccountSelector
          value={formData.accountId as string}
          onChange={(id: string, name: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, accountId: id, accountName: name }))}
          locale={locale}
        />
        <EditableField 
          icon={Calendar} 
          label={locale === 'zh-Hans' ? '日期' : 'Date'} 
          value={formData.scheduledDate as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, scheduledDate: v }))}
          type="date"
          placeholder={locale === 'zh-Hans' ? '选择日期' : 'Select date'}
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
          label={locale === 'zh-Hans' ? '详情' : 'Details'}
          value={formData.result as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, result: v }))}
          type="textarea"
          placeholder={
            formData.temporalMode === 'planned'
              ? (locale === 'zh-Hans' ? '输入目的 / 议程 / 背景，便于日后回忆' : 'Add purpose / agenda / context for later recall')
              : (locale === 'zh-Hans' ? '输入活动结果或讨论要点' : 'Enter outcome or discussion points')
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
          {locale === 'zh-Hans' ? '取消' : 'Cancel'}
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
            {locale === 'zh-Hans' ? '为什么推荐' : 'Why this was suggested'}
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
    { value: 'prospecting', label: locale === 'zh-Hans' ? '发现' : 'Prospecting' },
    { value: 'qualification', label: locale === 'zh-Hans' ? '资质' : 'Qualification' },
    { value: 'proposal', label: locale === 'zh-Hans' ? '提案' : 'Proposal' },
    { value: 'negotiation', label: locale === 'zh-Hans' ? '谈判' : 'Negotiation' },
    { value: 'won', label: locale === 'zh-Hans' ? '成交' : 'Won' },
    { value: 'lost', label: locale === 'zh-Hans' ? '失败' : 'Lost' },
  ];

  const stage = formData.stage as string || 'prospecting';
  const stageLabel = stageOptions.find((s: { value: string; label: string }) => s.value === stage)?.label || stage;

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

      <OpportunitySignalsHeader formData={formData} locale={locale} />

      <div className="bg-muted/30 rounded-lg p-3 space-y-1">
        <EditableField 
          icon={FileText} 
          label={locale === 'zh-Hans' ? '名称' : 'Name'} 
          value={formData.name as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, name: v }))}
          placeholder={locale === 'zh-Hans' ? '输入商机名称' : 'Enter opportunity name'}
          required
        />
        <AccountSelector
          value={formData.accountId as string}
          onChange={(id: string, name: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, accountId: id, accountName: name }))}
          locale={locale}
        />
        <EditableField 
          icon={DollarSign} 
          label={locale === 'zh-Hans' ? '金额' : 'Amount'} 
          value={formData.amount as number}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, amount: Number(v) || 0 }))}
          type="number"
          placeholder="0"
        />
        <EditableField 
          icon={Tag} 
          label={locale === 'zh-Hans' ? '阶段' : 'Stage'} 
          value={formData.stage as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, stage: v }))}
          type="select"
          options={stageOptions}
        />
        <EditableField 
          icon={TrendingUp} 
          label={locale === 'zh-Hans' ? '信心度' : 'Confidence'} 
          value={formData.confidence as number}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, confidence: Math.min(100, Math.max(0, Number(v) || 50)) }))}
          type="number"
          placeholder="50"
        />
        <EditableField 
          icon={Calendar} 
          label={locale === 'zh-Hans' ? '预计成交' : 'Expected Close'} 
          value={formData.expectedCloseDate as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, expectedCloseDate: v }))}
          type="date"
          placeholder={locale === 'zh-Hans' ? '选择日期' : 'Select date'}
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
          {locale === 'zh-Hans' ? '取消' : 'Cancel'}
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
function AccountFormCard({ data, formData, setFormData, onConfirm, onCancel, isConfirming, locale }: {
  data: Record<string, unknown>;
  formData: Record<string, unknown>;
  setFormData: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  onConfirm: () => void;
  onCancel: () => void;
  isConfirming: boolean;
  locale: Locale;
}) {
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
        </div>
      </div>

      <div className="bg-muted/30 rounded-lg p-3 space-y-1">
        <EditableField 
          icon={Building2} 
          label={locale === 'zh-Hans' ? '名称' : 'Name'} 
          value={formData.name as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, name: v }))}
          placeholder={locale === 'zh-Hans' ? '输入客户名称' : 'Enter account name'}
          required
        />
        <EditableField 
          icon={Tag} 
          label={locale === 'zh-Hans' ? '行业' : 'Industry'} 
          value={formData.industry as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, industry: v }))}
          placeholder={locale === 'zh-Hans' ? '输入行业' : 'Enter industry'}
        />
        <EditableField 
          icon={Phone} 
          label={locale === 'zh-Hans' ? '电话' : 'Phone'} 
          value={formData.phone as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, phone: v }))}
          placeholder={locale === 'zh-Hans' ? '输入电话' : 'Enter phone'}
        />
        <EditableField 
          icon={Mail} 
          label={locale === 'zh-Hans' ? '邮箱' : 'Email'} 
          value={formData.email as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, email: v }))}
          placeholder={locale === 'zh-Hans' ? '输入邮箱' : 'Enter email'}
        />
        <EditableField 
          icon={FileText} 
          label={locale === 'zh-Hans' ? '备注' : 'Notes'} 
          value={formData.notes as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, notes: v }))}
          type="textarea"
          placeholder={locale === 'zh-Hans' ? '输入备注信息' : 'Enter notes'}
        />
        <EditableField 
          icon={MapPin} 
          label={locale === 'zh-Hans' ? '地址' : 'Address'} 
          value={formData.address as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, address: v }))}
          placeholder={locale === 'zh-Hans' ? '输入地址' : 'Enter address'}
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
          {locale === 'zh-Hans' ? '取消' : 'Cancel'}
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
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
          <User className="w-4 h-4 text-purple-600" />
        </div>
        <div>
          <h4 className="font-medium text-sm text-foreground">
            {locale === 'zh-Hans' ? '新建联系人' : 'New Contact'}
          </h4>
          {typeof formData.title === 'string' && formData.title && <span className="text-xs text-muted-foreground">{formData.title}</span>}
        </div>
      </div>

      <div className="bg-muted/30 rounded-lg p-3 space-y-1">
        <EditableField 
          icon={User} 
          label={locale === 'zh-Hans' ? '姓名' : 'Name'} 
          value={formData.fullName as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, fullName: v }))}
          placeholder={locale === 'zh-Hans' ? '输入姓名' : 'Enter name'}
          required
        />
        <AccountSelector
          value={formData.accountId as string}
          onChange={(id: string, name: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, accountId: id, accountName: name }))}
          locale={locale}
        />
        <EditableField 
          icon={Tag} 
          label={locale === 'zh-Hans' ? '职位' : 'Title'} 
          value={formData.title as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, title: v }))}
          placeholder={locale === 'zh-Hans' ? '输入职位' : 'Enter title'}
        />
        <EditableField 
          icon={Phone} 
          label={locale === 'zh-Hans' ? '电话' : 'Phone'} 
          value={formData.phone as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, phone: v }))}
          placeholder={locale === 'zh-Hans' ? '输入电话' : 'Enter phone'}
        />
        <EditableField 
          icon={Mail} 
          label={locale === 'zh-Hans' ? '邮箱' : 'Email'} 
          value={formData.email as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, email: v }))}
          placeholder={locale === 'zh-Hans' ? '输入邮箱' : 'Enter email'}
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
          {locale === 'zh-Hans' ? '取消' : 'Cancel'}
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

// ── Saved-card read-only summary helpers ───────────────────────────────────
type SummaryIcon = React.ComponentType<{ className?: string }>;

const ACTIVITY_TYPE_LABELS: Record<string, [string, string]> = {
  visit: ['拜访', 'Visit'],
  call: ['电话', 'Call'],
  meeting: ['会议', 'Meeting'],
  email: ['邮件', 'Email'],
  other: ['其他', 'Other'],
};

const STAGE_LABELS: Record<string, [string, string]> = {
  prospecting: ['发现', 'Prospecting'],
  qualification: ['资质', 'Qualification'],
  proposal: ['提案', 'Proposal'],
  negotiation: ['谈判', 'Negotiation'],
  won: ['成交', 'Won'],
  lost: ['失败', 'Lost'],
};

/** Format an ISO/date string for compact display; falls back to the raw value. */
function formatCardDate(dateStr: string | undefined, locale: Locale): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return format(d, locale === 'zh-Hans' ? 'yyyy年M月d日' : 'MMM d, yyyy');
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

/**
 * Build the collapsed one-line summary + the expanded read-only rows for a saved
 * record, organized per record type so users can review without navigating away.
 */
function buildSavedCardDetails(
  type: FormCardData['type'],
  formData: Record<string, unknown>,
  locale: Locale,
): { summary: string; rows: Array<{ icon: SummaryIcon; label: string; value: string }> } {
  const tr = (zh: string, en: string) => (locale === 'zh-Hans' ? zh : en);
  const idx = locale === 'zh-Hans' ? 0 : 1;
  const str = (k: string) => (typeof formData[k] === 'string' ? (formData[k] as string).trim() : '');
  const rows: Array<{ icon: SummaryIcon; label: string; value: string }> = [];
  let summary = '';

  if (type === 'activity') {
    const at = str('type') || 'visit';
    const atLabel = ACTIVITY_TYPE_LABELS[at]?.[idx] || at;
    const dateStr = formatCardDate(str('scheduledDate'), locale);
    const accName = str('accountName');
    const oppName = str('opportunityName');
    const attendees = (formData.attendees as Array<{ id: string; fullname: string }>) || [];
    const attendeeNames = attendees.map((a) => a.fullname).filter(Boolean).join(', ');
    const contactName = str('contactName');
    const isPlanned = str('temporalMode') === 'planned';

    summary = [atLabel, dateStr, oppName || accName].filter(Boolean).join(' · ');
    rows.push({ icon: Tag, label: tr('类型', 'Type'), value: atLabel });
    rows.push({
      icon: Calendar,
      label: isPlanned ? tr('计划日期', 'Scheduled') : tr('日期', 'Date'),
      value: dateStr,
    });
    rows.push({ icon: Building2, label: tr('客户', 'Account'), value: accName });
    rows.push({ icon: Target, label: tr('关联商机', 'Opportunity'), value: oppName });
    if (at === 'visit' || at === 'meeting') {
      rows.push({ icon: Users, label: tr('参会人', 'Attendees'), value: attendeeNames });
    } else {
      rows.push({ icon: User, label: tr('联系人', 'Contact'), value: contactName });
    }
    rows.push({ icon: FileText, label: tr('结果', 'Result'), value: str('result') });
  } else if (type === 'opportunity') {
    const stage = str('stage') || 'prospecting';
    const stageLabel = STAGE_LABELS[stage]?.[idx] || stage;
    const amount = typeof formData.amount === 'number' ? formData.amount : Number(str('amount'));
    const amountStr = amount ? formatCurrencyCompact(amount) : '';
    const confidence = typeof formData.confidence === 'number' ? formData.confidence : Number(str('confidence'));
    const confStr = Number.isFinite(confidence) && confidence > 0 ? `${confidence}%` : '';
    const closeStr = formatCardDate(str('expectedCloseDate'), locale);

    summary = [stageLabel, amountStr].filter(Boolean).join(' · ');
    rows.push({ icon: Building2, label: tr('客户', 'Account'), value: str('accountName') });
    rows.push({ icon: DollarSign, label: tr('金额', 'Amount'), value: amountStr });
    rows.push({ icon: Tag, label: tr('阶段', 'Stage'), value: stageLabel });
    rows.push({ icon: TrendingUp, label: tr('信心度', 'Confidence'), value: confStr });
    rows.push({ icon: Calendar, label: tr('预计成交', 'Expected Close'), value: closeStr });
  } else if (type === 'account') {
    summary = [str('industry'), str('phone')].filter(Boolean).join(' · ');
    rows.push({ icon: Tag, label: tr('行业', 'Industry'), value: str('industry') });
    rows.push({ icon: Phone, label: tr('电话', 'Phone'), value: str('phone') });
    rows.push({ icon: Mail, label: tr('邮箱', 'Email'), value: str('email') });
    rows.push({ icon: MapPin, label: tr('地址', 'Address'), value: str('address') });
    rows.push({ icon: FileText, label: tr('备注', 'Notes'), value: str('notes') });
  } else if (type === 'contact') {
    summary = [str('title'), str('accountName')].filter(Boolean).join(' · ');
    rows.push({ icon: Tag, label: tr('职位', 'Title'), value: str('title') });
    rows.push({ icon: Building2, label: tr('客户', 'Account'), value: str('accountName') });
    rows.push({ icon: Phone, label: tr('电话', 'Phone'), value: str('phone') });
    rows.push({ icon: Mail, label: tr('邮箱', 'Email'), value: str('email') });
  }

  return { summary, rows: rows.filter((r) => r.value) };
}

// Main Form Card Component
export function FormCard({ formCard, messageId, onStatusChange }: FormCardProps) {
  const navigate = useNavigate();
  const locale: Locale = getLocale();
  const copilot = useCopilot();
  const { data: user } = useUser();
  const [isConfirming, setIsConfirming] = useState(false);
  const [status, setStatus] = useState<'pending' | 'confirmed' | 'modified' | 'cancelled'>(formCard.status || 'pending');
  const [validationError, setValidationError] = useState<string | null>(null);
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
  const [formData, setFormData] = useState<Record<string, unknown>>(formCard.data);

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

  // Handle confirmation - create the record
  const handleConfirm = async () => {
    if (isConfirming) return; // guard against double-tap / modal remount races
    setIsConfirming(true);
    setValidationError(null);
    try {
      const { type } = formCard;

      if (type === 'activity') {
        const activityType = (formData.type as string) || 'visit';
        
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
        
        // Map temporalMode -> status
        const temporalMode = formData.temporalMode as 'planned' | 'completed' | 'unspecified' | undefined;
        const status: Activity['status'] =
          temporalMode === 'completed' ? 'completed'
          : 'open';

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
          scheduleddate: formData.scheduledDate as string || new Date().toISOString(),
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
        copilot.updateFormCardStatus(messageId, 'confirmed', undefined, createdActivity.id);
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
          setValidationError(locale === 'zh-Hans' ? '未找到关联客户，请先创建客户' : 'Account not found, please create account first');
          setIsConfirming(false);
          return;
        }

        // Validate required fields before saving
        const oppName = (formData.name as string || '').trim();
        if (!oppName) {
          setValidationError(locale === 'zh-Hans' ? '商机名称为必填项' : 'Opportunity name is required');
          setIsConfirming(false);
          return;
        }
        
        const createdOpp = await createOpportunity.mutateAsync({
          name1: oppName,
          account: { id: targetAccount.id, name1: targetAccount.name1 },
          totalamount: formData.amount as number || 0,
          stage,
          confidence: formData.confidence as number || 50,
          expectedclosedate: (formData.expectedCloseDate as string) || undefined,
          lastaction: formData.lastAction as string || '',
          ownerid: user?.objectId || 'unknown',
        } as Omit<Opportunity, 'id'>);
        setCreatedRecordId(createdOpp.id);
        createdRecordIdRef.current = createdOpp.id;
        copilot.updateFormCardStatus(messageId, 'confirmed', undefined, createdOpp.id);
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
        copilot.updateFormCardStatus(messageId, 'confirmed', undefined, createdAccount.id);
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
          setValidationError(locale === 'zh-Hans' ? '未找到关联客户，请先创建客户' : 'Account not found, please create account first');
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
        copilot.updateFormCardStatus(messageId, 'confirmed', undefined, createdContact.id);

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
    copilot.updateFormCardStatus(messageId, 'cancelled');
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
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {formCard.type === 'activity' && <Calendar className="w-4 h-4 text-muted-foreground" />}
            {formCard.type === 'contact' && <User className="w-4 h-4 text-muted-foreground" />}
            {formCard.type === 'opportunity' && <TrendingUp className="w-4 h-4 text-muted-foreground" />}
            {formCard.type === 'account' && <Building2 className="w-4 h-4 text-muted-foreground" />}
            <span className="text-sm font-medium text-muted-foreground line-through">
              {formData.title as string || formData.name as string || formData.fullName as string || ''}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground bg-muted/30 px-2 py-1 rounded-md">
            <X className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">
              {locale === 'zh-Hans' ? '已取消' : 'Cancelled'}
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
            navigate(`/accounts/${recordId}`);
          } else {
            navigate('/accounts');
          }
        } else if (type === 'contact') {
          navigate('/accounts');
        }
      }, 150);
    };
    
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card rounded-xl overflow-hidden"
      >
        {(() => {
          const { summary, rows } = buildSavedCardDetails(formCard.type, formData, locale);
          const title = (formData.title as string) || (formData.name as string) || (formData.fullName as string) || '';
          return (
            <>
              <button
                type="button"
                onClick={() => setIsExpanded((v) => !v)}
                data-state={isExpanded ? 'open' : 'closed'}
                className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {formCard.type === 'activity' && <Calendar className="w-5 h-5 text-primary shrink-0" />}
                  {formCard.type === 'contact' && <User className="w-5 h-5 text-purple-600 shrink-0" />}
                  {formCard.type === 'opportunity' && <TrendingUp className="w-5 h-5 text-green-600 shrink-0" />}
                  {formCard.type === 'account' && <Building2 className="w-5 h-5 text-blue-600 shrink-0" />}
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
                    {rows.map((r, i) => (
                      <ReadOnlyRow key={i} icon={r.icon} label={r.label} value={r.value} />
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleConfirmedClick}
                    className="w-full mt-2.5"
                  >
                    {locale === 'zh-Hans' ? '查看完整详情' : 'Open full details'}
                    <ChevronRight className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
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
    >
      {formCard.type === 'activity' && formCard.attachmentIds && formCard.attachmentIds.length > 0 && (
        <div className="mb-3">
          <div className="text-helper text-muted-foreground mb-1.5">
            {locale === 'zh-Hans' ? `附件 (${formCard.attachmentIds.length})` : `Attachments (${formCard.attachmentIds.length})`}
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
      {validationError && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
          <X className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{validationError}</span>
        </div>
      )}
    </motion.div>
  );
}
