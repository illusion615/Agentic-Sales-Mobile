/**
 * Form Card Components for Copilot Chat
 * Renders editable draft forms for Activity, Opportunity, Account, and Contact
 * within the chat interface for user confirmation.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Check, X, Calendar, User, Building2, Phone, Mail, MapPin, DollarSign, TrendingUp, FileText, Tag, ChevronRight, ChevronDown, Target } from 'lucide-react';
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
import { toast } from 'sonner';
import { initialize } from '@microsoft/power-apps/app';
import { format } from 'date-fns';

// Hooks for creating records (use mutations for cache invalidation)
import { useCreateActivity } from '@/generated/hooks/use-activity';
import { useCreateOpportunity } from '@/generated/hooks/use-opportunity';
import { useCreateAccount, useAccountList } from '@/generated/hooks/use-account';
import { useOpportunityList } from '@/generated/hooks/use-opportunity';
import { useContactList } from '@/generated/hooks/use-contact';
import type { Activity, ActivityTypeKey, ActivityDraftstatusKey } from '@/generated/models/activity-model';
import type { Opportunity, OpportunityStageKey } from '@/generated/models/opportunity-model';
import type { Account, AccountRegionKey, AccountTierKey } from '@/generated/models/account-model';
import { useUser } from '@/hooks/use-user';
import { useCreateContact } from '@/generated/hooks/use-contact';
import type { Contact } from '@/generated/models/contact-model';

export interface FormCardData {
  type: 'activity' | 'opportunity' | 'account' | 'contact';
  isNew: boolean;
  existingId?: string;
  data: Record<string, unknown>;
  status?: 'pending' | 'confirmed' | 'modified';
  createdRecordId?: string;
}

interface FormCardProps {
  formCard: FormCardData;
  messageId: string;
  onStatusChange?: (status: 'confirmed' | 'modified') => void;
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
  className 
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number | undefined;
  onChange: (value: string) => void;
  type?: 'text' | 'select' | 'date' | 'textarea' | 'number';
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className={cn('flex items-start gap-2 py-1', className)}>
      <Icon className="w-4 h-4 text-muted-foreground mt-2 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-xs text-muted-foreground">{label}</span>
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
          <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-8 w-full justify-start text-left font-normal text-sm mt-0.5",
                  !value && "text-muted-foreground"
                )}
              >
                <Calendar className="mr-2 h-3.5 w-3.5" />
                {value ? String(value) : placeholder || 'Select date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={value ? new Date(String(value)) : undefined}
                onSelect={(date: Date | undefined) => {
                  if (date) {
                    onChange(format(date, 'yyyy-MM-dd'));
                  }
                  setIsOpen(false);
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
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
        <ContactSelector
          value={formData.contactId as string}
          onChange={(id: string, name: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, contactId: id, contactName: name }))}
          accountId={formData.accountId as string}
          locale={locale}
        />
        {/* I-8 Slice A: hide result/nextStep when activity is planned (event hasn't happened) */}
        {formData.temporalMode !== 'planned' && (
          <>
            <EditableField 
              icon={FileText} 
              label={locale === 'zh-Hans' ? '结果' : 'Result'} 
              value={formData.result as string}
              onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, result: v }))}
              type="textarea"
              placeholder={locale === 'zh-Hans' ? '输入活动结果' : 'Enter activity result'}
            />
            <EditableField 
              icon={TrendingUp} 
              label={locale === 'zh-Hans' ? '下一步' : 'Next Step'} 
              value={formData.nextStep as string}
              onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, nextStep: v }))}
              type="textarea"
              placeholder={locale === 'zh-Hans' ? '输入下一步计划' : 'Enter next step'}
            />
          </>
        )}
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

      <div className="bg-muted/30 rounded-lg p-3 space-y-1">
        <EditableField 
          icon={FileText} 
          label={locale === 'zh-Hans' ? '名称' : 'Name'} 
          value={formData.name as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, name: v }))}
          placeholder={locale === 'zh-Hans' ? '输入商机名称' : 'Enter opportunity name'}
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
  const regionOptions = [
    { value: '华东', label: locale === 'zh-Hans' ? '华东' : 'East China' },
    { value: '华北', label: locale === 'zh-Hans' ? '华北' : 'North China' },
    { value: '华南', label: locale === 'zh-Hans' ? '华南' : 'South China' },
    { value: '西南', label: locale === 'zh-Hans' ? '西南' : 'Southwest China' },
  ];

  const tierOptions = [
    { value: 'S', label: locale === 'zh-Hans' ? 'S级' : 'S-Tier' },
    { value: 'A', label: locale === 'zh-Hans' ? 'A级' : 'A-Tier' },
    { value: 'B', label: locale === 'zh-Hans' ? 'B级' : 'B-Tier' },
    { value: 'C', label: locale === 'zh-Hans' ? 'C级' : 'C-Tier' },
  ];

  const tier = formData.tier as string || '';
  const tierLabel = tierOptions.find((t: { value: string; label: string }) => t.value === tier)?.label || tier;

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
        <EditableField 
          icon={Building2} 
          label={locale === 'zh-Hans' ? '名称' : 'Name'} 
          value={formData.name as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, name: v }))}
          placeholder={locale === 'zh-Hans' ? '输入客户名称' : 'Enter account name'}
        />
        <EditableField 
          icon={Tag} 
          label={locale === 'zh-Hans' ? '行业' : 'Industry'} 
          value={formData.industry as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, industry: v }))}
          placeholder={locale === 'zh-Hans' ? '输入行业' : 'Enter industry'}
        />
        <EditableField 
          icon={MapPin} 
          label={locale === 'zh-Hans' ? '区域' : 'Region'} 
          value={formData.region as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, region: v }))}
          type="select"
          options={regionOptions}
        />
        <EditableField 
          icon={Tag} 
          label={locale === 'zh-Hans' ? '等级' : 'Tier'} 
          value={formData.tier as string}
          onChange={(v: string) => setFormData((prev: Record<string, unknown>) => ({ ...prev, tier: v }))}
          type="select"
          options={tierOptions}
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

// Main Form Card Component
export function FormCard({ formCard, messageId, onStatusChange }: FormCardProps) {
  const navigate = useNavigate();
  const locale: Locale = getLocale();
  const copilot = useCopilot();
  const { data: user } = useUser();
  const [isConfirming, setIsConfirming] = useState(false);
  const [status, setStatus] = useState<'pending' | 'confirmed' | 'modified'>(formCard.status || 'pending');
  const [createdRecordId, setCreatedRecordId] = useState<string | null>(formCard.createdRecordId || null);
  // Use ref to keep the latest createdRecordId available immediately (for async operations)
  const createdRecordIdRef = useRef<string | null>(formCard.createdRecordId || null);
  
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
    setIsConfirming(true);
    try {
      const { type } = formCard;

      await initialize();
      if (type === 'activity') {
        // Create activity
        const typeKeyMap: Record<string, ActivityTypeKey> = {
          visit: 'TypeKey0',
          call: 'TypeKey1',
          meeting: 'TypeKey2',
          email: 'TypeKey3',
          other: 'TypeKey4',
        };
        const activityType = formData.type as string || 'visit';
        const typeKey = typeKeyMap[activityType] || 'TypeKey0';
        
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
        
        // Build notes field - combine notes, result, and nextStep
        const notesParts: string[] = [];
        if (formData.notes) notesParts.push(formData.notes as string);
        if (formData.result) notesParts.push(`结果: ${formData.result}`);
        if (formData.nextStep) notesParts.push(`下一步: ${formData.nextStep}`);

        // I-8 Slice A: map temporalMode -> draftstatusKey
        // planned   -> Confirmed (open activity scheduled in the future)
        // completed -> Completed (activity already happened)
        // unspecified / undefined -> Draft (zero-regression default)
        const temporalMode = formData.temporalMode as 'planned' | 'completed' | 'unspecified' | undefined;
        const draftstatusKey: ActivityDraftstatusKey =
          temporalMode === 'completed' ? 'DraftstatusKey2'
          : temporalMode === 'planned' ? 'DraftstatusKey1'
          : 'DraftstatusKey0';

        const createInput: Omit<Activity, 'id'> = {
          title: formData.title as string || '',
          typeKey,
          draftstatusKey,
          ownerid: user?.objectId || 'unknown',
          scheduleddate: formData.scheduledDate as string || new Date().toISOString(),
          notes: notesParts.join(' | ') || '',
          ...(targetAccount && { account: { id: targetAccount.id, name1: targetAccount.name1 } }),
          ...(targetOpportunity && { opportunity: { id: targetOpportunity.id, name1: targetOpportunity.name1 } }),
          ...(targetContact && { contact: { id: targetContact.id, fullname: targetContact.fullname } }),
        };
        const createdActivity = await createActivity.mutateAsync(createInput);
        setCreatedRecordId(createdActivity.id);
        createdRecordIdRef.current = createdActivity.id;
        // Pass the created record ID to persist it in session storage
        copilot.updateFormCardStatus(messageId, 'confirmed', undefined, createdActivity.id);
        toast.success(locale === 'zh-Hans' ? '活动已创建' : 'Activity created');
      } else if (type === 'opportunity') {
        // Create opportunity
        const stageKeyMap: Record<string, OpportunityStageKey> = {
          prospecting: 'StageKey0',
          qualification: 'StageKey1',
          proposal: 'StageKey2',
          negotiation: 'StageKey3',
          won: 'StageKey4',
          lost: 'StageKey5',
        };
        const stage = formData.stage as string || 'prospecting';
        const stageKey = stageKeyMap[stage] || 'StageKey0';
        
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
          toast.error(locale === 'zh-Hans' ? '未找到关联客户，请先创建客户' : 'Account not found, please create account first');
          setIsConfirming(false);
          return;
        }
        
        const createdOpp = await createOpportunity.mutateAsync({
          name1: formData.name as string || '',
          account: { id: targetAccount.id, name1: targetAccount.name1 },
          totalamount: formData.amount as number || 0,
          stageKey,
          confidence: formData.confidence as number || 50,
          expectedclosedate: formData.expectedCloseDate as string || '',
          lastaction: formData.lastAction as string || '',
          ownerid: user?.objectId || 'unknown',
        } as Omit<Opportunity, 'id'>);
        setCreatedRecordId(createdOpp.id);
        createdRecordIdRef.current = createdOpp.id;
        copilot.updateFormCardStatus(messageId, 'confirmed', undefined, createdOpp.id);
        toast.success(locale === 'zh-Hans' ? '商机已创建' : 'Opportunity created');
      } else if (type === 'account') {
        // Create account
        const regionKeyMap: Record<string, AccountRegionKey> = {
          '华东': 'RegionKey0',
          '华北': 'RegionKey1',
          '华南': 'RegionKey2',
          '西南': 'RegionKey3',
        };
        const tierKeyMap: Record<string, AccountTierKey> = {
          S: 'TierKey0',
          A: 'TierKey1',
          B: 'TierKey2',
          C: 'TierKey3',
        };
        const region = formData.region as string || '';
        const tier = formData.tier as string || '';
        const regionKey = regionKeyMap[region] || 'RegionKey0';
        const tierKey = tierKeyMap[tier] || 'TierKey3';
        
        const createdAccount = await createAccount.mutateAsync({
          name1: formData.name as string || '',
          industry: formData.industry as string || '',
          regionKey,
          tierKey,
          phone: formData.phone as string || '',
          email: formData.email as string || '',
          address: formData.address as string || '',
          notes: formData.notes as string || '',
          ownerid: user?.objectId || 'unknown',
        } as Omit<Account, 'id'>);
        setCreatedRecordId(createdAccount.id);
        createdRecordIdRef.current = createdAccount.id;
        copilot.updateFormCardStatus(messageId, 'confirmed', undefined, createdAccount.id);
        toast.success(locale === 'zh-Hans' ? '客户已创建' : 'Account created');
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
          toast.error(locale === 'zh-Hans' ? '未找到关联客户，请先创建客户' : 'Account not found, please create account first');
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
        toast.success(locale === 'zh-Hans' ? '联系人已创建' : 'Contact created');

        // I-2 Round 3: if this contact was created via awaiting-clarification flow,
        // resume the parked intent (e.g., the original activity creation) with the new contactId.
        // Also forward the resolved account so the resumed Activity form pre-fills it correctly.
        copilot.completeParkedIntentWithNewContact(
          createdContact.id,
          formData.fullName as string || '',
          targetAccount.id,
          targetAccount.name1 || '',
        );
      }

      setStatus('confirmed');
      // updateFormCardStatus already called above with createdRecordId for each type
      onStatusChange?.('confirmed');
    } catch (error) {
      console.error('Failed to create record:', error);
      toast.error(locale === 'zh-Hans' ? '创建失败，请重试' : 'Failed to create, please try again');
    } finally {
      setIsConfirming(false);
    }
  };

  // Handle cancel - just close/dismiss (in this case we keep it but user can start fresh)
  const handleCancel = () => {
    // Reset form data to original
    setFormData(formCard.data);
  };

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
        className="glass-card p-3 rounded-xl cursor-pointer hover:bg-muted/30 active:scale-[0.98] transition-all"
        onClick={handleConfirmedClick}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {formCard.type === 'activity' && <Calendar className="w-4 h-4 text-primary" />}
            {formCard.type === 'contact' && <User className="w-4 h-4 text-purple-600" />}
            {formCard.type === 'opportunity' && <TrendingUp className="w-4 h-4 text-green-600" />}
            {formCard.type === 'account' && <Building2 className="w-4 h-4 text-blue-600" />}
            <span className="text-sm font-medium text-foreground">
              {formData.title as string || formData.name as string || formData.fullName as string || ''}
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
    </motion.div>
  );
}
