import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Send,
  Pencil,
  Loader2,
  Check,
  X,
  Sparkles,
  FileText,
  Calendar,
  User,
  Building2,
  MessageSquare,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';
import { useAccountList } from '@/generated/hooks/use-account';
import { useCreateActivity } from '@/generated/hooks/use-activity';
import { isCopilotStudioAvailable } from '@/services/copilot-service';
import { getLocale, getLLMConfig, generateVoiceSummary, type Locale } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCopilot, type ExtractedVisitData } from '@/contexts/copilot-context';

// Form state for manual editing
interface VisitFormData {
  accountId: string;
  contactName: string;
  visitDate: Date;
  visitType: 'in-person' | 'phone' | 'video' | 'email';
  summary: string;
  outcome: string;
  nextSteps: string;
}

type InputMode = 'copilot' | 'manual';
type FlowState = 'input' | 'processing' | 'review' | 'saving';

const visitTypeLabels = {
  'in-person': { zh: '现场拜访', en: 'In-Person' },
  'phone': { zh: '电话', en: 'Phone Call' },
  'video': { zh: '视频会议', en: 'Video Call' },
  'email': { zh: '邮件', en: 'Email' },
};

const translations = {
  'zh-Hans': {
    title: '记录拜访',
    copilotMode: 'AI 助手',
    manualMode: '手动填写',
    inputPlaceholder: '描述您的客户拜访情况...',
    inputHint: '例如：今天拜访了华为的张经理，讨论了云服务合作，客户很感兴趣，下周安排产品演示',
    holdToSpeak: '按住说话',
    processing: '正在分析...',
    reviewTitle: '确认拜访信息',
    confidence: '置信度',
    account: '客户',
    contact: '联系人',
    visitDate: '拜访日期',
    visitType: '拜访类型',
    summary: '拜访摘要',
    outcome: '拜访结果',
    nextSteps: '后续计划',
    opportunitySignal: '商机信号',
    selectAccount: '选择客户',
    enterContact: '输入联系人姓名',
    enterSummary: '输入拜访摘要',
    enterOutcome: '输入拜访结果',
    enterNextSteps: '输入后续计划',
    reInput: '重新输入',
    confirm: '确认保存',
    saving: '保存中...',
    saved: '拜访记录已保存',
    saveFailed: '保存失败，请重试',
    copilotNotConfigured: 'Copilot 未配置，请在设置中配置 Token Endpoint',
    noAccountsFound: '未找到客户',
    aiExtracted: 'AI 提取',
    editField: '编辑',
    cancel: '取消',
    pickDate: '选择日期',
  },
  'en-US': {
    title: 'Log Visit',
    copilotMode: 'AI Assistant',
    manualMode: 'Manual Entry',
    inputPlaceholder: 'Describe your customer visit...',
    inputHint: 'Example: Met with John from Microsoft today, discussed cloud partnership, client is interested, scheduling demo next week',
    holdToSpeak: 'Hold to speak',
    processing: 'Analyzing...',
    reviewTitle: 'Confirm Visit Details',
    confidence: 'Confidence',
    account: 'Account',
    contact: 'Contact',
    visitDate: 'Visit Date',
    visitType: 'Visit Type',
    summary: 'Summary',
    outcome: 'Outcome',
    nextSteps: 'Next Steps',
    opportunitySignal: 'Opportunity Signal',
    selectAccount: 'Select account',
    enterContact: 'Enter contact name',
    enterSummary: 'Enter visit summary',
    enterOutcome: 'Enter visit outcome',
    enterNextSteps: 'Enter next steps',
    reInput: 'Re-enter',
    confirm: 'Confirm & Save',
    saving: 'Saving...',
    saved: 'Visit logged successfully',
    saveFailed: 'Failed to save, please retry',
    copilotNotConfigured: 'Copilot not configured. Please set Token Endpoint in Settings.',
    noAccountsFound: 'No accounts found',
    aiExtracted: 'AI Extracted',
    editField: 'Edit',
    cancel: 'Cancel',
    pickDate: 'Pick a date',
  },
};

function t(key: keyof typeof translations['zh-Hans'], locale: Locale): string {
  return translations[locale][key] || translations['en-US'][key] || key;
}

// Confidence indicator component
function ConfidenceIndicator({ confidence, locale }: { confidence: number; locale: Locale }) {
  const getColor = () => {
    if (confidence >= 80) return 'bg-emerald-500';
    if (confidence >= 50) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{t('confidence', locale)}</span>
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${confidence}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' as const }}
          className={cn('h-full rounded-full', getColor())}
        />
      </div>
      <span className="text-xs font-medium text-foreground">{confidence}%</span>
    </div>
  );
}

// Editable field component for review mode
function EditableField({
  label,
  value,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  editComponent,
  icon: Icon,
  aiExtracted,
  locale,
}: {
  label: string;
  value: string;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  editComponent: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  aiExtracted?: boolean;
  locale: Locale;
}) {
  return (
    <div className="py-3 border-b border-border/30 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Icon className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-muted-foreground">{label}</span>
              {aiExtracted && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                  <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                  {t('aiExtracted', locale)}
                </span>
              )}
            </div>
            {isEditing ? (
              <div className="space-y-2">
                {editComponent}
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={onCancel} className="h-7 px-2 text-xs">
                    <X className="w-3 h-3 mr-1" />
                    {t('cancel', locale)}
                  </Button>
                  <Button size="sm" onClick={onSave} className="h-7 px-2 text-xs">
                    <Check className="w-3 h-3 mr-1" />
                    OK
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-foreground truncate">{value || '—'}</p>
            )}
          </div>
        </div>
        {!isEditing && (
          <button
            onClick={onEdit}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted/50 transition-colors flex-shrink-0"
            aria-label={t('editField', locale)}
          >
            <Pencil className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function VisitLogPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: user } = useUser();
  const locale: Locale = getLocale();
  const preselectedAccountId = searchParams.get('accountId');

  // Data
  const { data: accounts = [] } = useAccountList();
  const createActivity = useCreateActivity();

  // Copilot state
  const isCopilotConfigured = isCopilotStudioAvailable();
  const llmConfig = getLLMConfig();
  const isLLMConfigured = !!llmConfig?.enabled;

  // UI state - default to manual if copilot not configured
  const [inputMode, setInputMode] = useState<InputMode>(isCopilotConfigured ? 'copilot' : 'manual');
  const [flowState, setFlowState] = useState<FlowState>('input');
  const [inputText, setInputText] = useState('');

  const [extractedData, setExtractedData] = useState<ExtractedVisitData | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);

  // Form state (for manual mode and editing)
  const [formData, setFormData] = useState<VisitFormData>({
    accountId: preselectedAccountId || '',
    contactName: '',
    visitDate: new Date(),
    visitType: 'in-person',
    summary: '',
    outcome: '',
    nextSteps: '',
  });

  // Temp edit values
  const [tempEditValue, setTempEditValue] = useState('');
  const [tempDateValue, setTempDateValue] = useState<Date | undefined>(undefined);

  // Refs
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Copilot context
  const copilot = useCopilot();

  // Set page context for Copilot
  useEffect(() => {
    const selectedAccount = accounts.find((a) => a.id === formData.accountId);
    copilot.setPageContext({
      currentPage: locale === 'zh-Hans' ? '记录拜访' : 'Visit Log',
      summary: locale === 'zh-Hans'
        ? `正在记录拜访。模式: ${inputMode === 'copilot' ? 'AI助手' : '手动填写'}，状态: ${flowState}，${selectedAccount ? `客户: ${selectedAccount.name1}` : '未选择客户'}`
        : `Logging a visit. Mode: ${inputMode === 'copilot' ? 'AI Assistant' : 'Manual Entry'}, State: ${flowState}, ${selectedAccount ? `Account: ${selectedAccount.name1}` : 'No account selected'}`,
      pageData: {
        inputMode,
        flowState,
        selectedAccountId: formData.accountId || null,
        selectedAccountName: selectedAccount?.name1 || null,
        contactName: formData.contactName || null,
        visitDate: formData.visitDate.toISOString(),
        visitType: formData.visitType,
        hasSummary: !!formData.summary,
        hasOutcome: !!formData.outcome,
        hasNextSteps: !!formData.nextSteps,
        extractedConfidence: extractedData?.confidence || null,
      },
    });

    return () => {
      copilot.setPageContext(null);
    };
  }, [inputMode, flowState, formData, extractedData?.confidence, accounts, locale, copilot.setPageContext]);

  // Find account by name (for AI extraction)
  const findAccountByName = useCallback((name: string) => {
    const normalizedName = name.toLowerCase().trim();
    return accounts.find((a) => 
      a.name1?.toLowerCase().includes(normalizedName) ||
      normalizedName.includes(a.name1?.toLowerCase() || '')
    );
  }, [accounts]);

  // Extract data using BYOM LLM
  const extractWithLLM = useCallback(async (text: string): Promise<ExtractedVisitData | null> => {
    const systemPrompt = locale === 'zh-Hans'
      ? `你是一个销售拜访信息提取助手。从用户的自然语言描述中提取以下字段：
- accountName: 客户/公司名称
- contactName: 联系人姓名
- visitDate: 拜访日期 (如果提到"今天"返回today，"昨天"返回yesterday，具体日期返回YYYY-MM-DD格式)
- visitType: 拜访类型 (in-person/phone/video/email)
- summary: 拜访摘要
- outcome: 拜访结果
- nextSteps: 后续计划
- opportunitySignal: 商机信号/意向
- confidence: 你对提取结果的置信度 (0-100)

仅返回JSON格式，不要其他文字。如果某字段无法从文本中提取，设为null。`
      : `You are a sales visit information extraction assistant. Extract the following fields from the user's natural language description:
- accountName: Customer/company name
- contactName: Contact person name
- visitDate: Visit date (if "today" return "today", "yesterday" return "yesterday", specific dates return YYYY-MM-DD format)
- visitType: Visit type (in-person/phone/video/email)
- summary: Visit summary
- outcome: Visit outcome
- nextSteps: Next steps
- opportunitySignal: Opportunity signal/intent
- confidence: Your confidence in the extraction (0-100)

Return ONLY JSON format, no other text. If a field cannot be extracted from the text, set it to null.`;

    const result = await generateVoiceSummary(text, locale, systemPrompt);
    
    if (!result.success || !result.summary) {
      return null;
    }

    try {
      // Try to parse the JSON response
      let jsonStr = result.summary;
      // Handle markdown code blocks
      if (jsonStr.includes('```json')) {
        jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      } else if (jsonStr.includes('```')) {
        jsonStr = jsonStr.replace(/```\s*/g, '');
      }
      
      const parsed = JSON.parse(jsonStr.trim());
      
      // Parse visit date
      let visitDate: Date | undefined;
      if (parsed.visitDate === 'today') {
        visitDate = new Date();
      } else if (parsed.visitDate === 'yesterday') {
        visitDate = new Date();
        visitDate.setDate(visitDate.getDate() - 1);
      } else if (parsed.visitDate) {
        visitDate = new Date(parsed.visitDate);
      }

      // Find matching account
      const matchedAccount = parsed.accountName ? findAccountByName(parsed.accountName) : undefined;

      return {
        accountId: matchedAccount?.id,
        accountName: parsed.accountName || undefined,
        contactName: parsed.contactName || undefined,
        visitDate,
        visitType: parsed.visitType || undefined,
        summary: parsed.summary || undefined,
        outcome: parsed.outcome || undefined,
        nextSteps: parsed.nextSteps || undefined,
        opportunitySignal: parsed.opportunitySignal || undefined,
        confidence: parsed.confidence || 70,
      };
    } catch {
      console.error('Failed to parse LLM response');
      return null;
    }
  }, [locale, findAccountByName]);

  // Extract data using Copilot Studio - delegates to context for centralized connector execution
  const extractWithCopilot = useCallback(async (text: string): Promise<ExtractedVisitData | null> => {
    if (!isCopilotConfigured) return null;

    // Delegate Copilot Studio execution to the centralized context
    return copilot.extractVisitData(text, findAccountByName);
  }, [isCopilotConfigured, copilot, findAccountByName]);

  // Process natural language input
  const processInput = useCallback(async () => {
    if (!inputText.trim()) return;

    setFlowState('processing');

    try {
      let extracted: ExtractedVisitData | null = null;

      // Try BYOM LLM first (faster, local)
      if (isLLMConfigured) {
        extracted = await extractWithLLM(inputText);
      }
      
      // Fallback to Copilot Studio
      if (!extracted && isCopilotConfigured) {
        extracted = await extractWithCopilot(inputText);
      }

      if (extracted) {
        setExtractedData(extracted);
        // Update form data with extracted values
        setFormData((prev) => ({
          ...prev,
          accountId: extracted.accountId || prev.accountId,
          contactName: extracted.contactName || prev.contactName,
          visitDate: extracted.visitDate || prev.visitDate,
          visitType: extracted.visitType || prev.visitType,
          summary: extracted.summary || prev.summary,
          outcome: extracted.outcome || prev.outcome,
          nextSteps: extracted.nextSteps || prev.nextSteps,
        }));
        setFlowState('review');
      } else {
        // Fallback: use input as summary
        setFormData((prev) => ({
          ...prev,
          summary: inputText,
        }));
        setExtractedData({
          summary: inputText,
          visitDate: new Date(),
          confidence: 30,
        });
        setFlowState('review');
        toast.info(locale === 'zh-Hans' ? 'AI 提取受限，请手动补充信息' : 'AI extraction limited, please complete manually');
      }
    } catch (error) {
      console.error('Processing failed:', error);
      toast.error(locale === 'zh-Hans' ? '处理失败，请重试' : 'Processing failed, please retry');
      setFlowState('input');
    }
  }, [inputText, isLLMConfigured, isCopilotConfigured, extractWithLLM, extractWithCopilot, locale]);



  // Save visit
  const saveVisit = useCallback(async () => {
    setFlowState('saving');

    try {
      const selectedAccount = accounts.find((a) => a.id === formData.accountId);
      
      await createActivity.mutateAsync({
        title: `${t('title', locale)} - ${selectedAccount?.name1 || formData.contactName || 'Visit'}`,
        type: 'visit', // visit type
        draftStatus: 'confirmed', // confirmed
        ownerid: user?.objectId || '',
        scheduleddate: formData.visitDate.toISOString(),
        notes: [
          formData.summary,
          formData.outcome ? `${t('outcome', locale)}: ${formData.outcome}` : '',
          formData.nextSteps ? `${t('nextSteps', locale)}: ${formData.nextSteps}` : '',
        ].filter(Boolean).join('\n\n'),
      });

      toast.success(t('saved', locale));
      navigate('/');
    } catch (error) {
      console.error('Save failed:', error);
      toast.error(t('saveFailed', locale));
      setFlowState('review');
    }
  }, [formData, accounts, user, locale, createActivity, navigate]);

  // Handle field edit
  const startEdit = (field: string, currentValue: string | Date) => {
    setEditingField(field);
    if (currentValue instanceof Date) {
      setTempDateValue(currentValue);
    } else {
      setTempEditValue(currentValue);
    }
  };

  const saveEdit = (field: keyof VisitFormData) => {
    if (field === 'visitDate' && tempDateValue) {
      setFormData((prev) => ({ ...prev, [field]: tempDateValue }));
    } else {
      setFormData((prev) => ({ ...prev, [field]: tempEditValue }));
    }
    setEditingField(null);
    setTempEditValue('');
    setTempDateValue(undefined);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setTempEditValue('');
    setTempDateValue(undefined);
  };

  // Reset to input state
  const resetToInput = () => {
    setFlowState('input');
    setExtractedData(null);
    setInputText('');
  };

  // Get account display name
  const getAccountName = () => {
    const account = accounts.find((a) => a.id === formData.accountId);
    return account?.name1 || extractedData?.accountName || '—';
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50 safe-area-top">
        <div className="flex items-center justify-between h-14 px-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted active:bg-muted/80 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-base font-semibold text-foreground">{t('title', locale)}</h1>
          <div className="w-10" />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pt-14 pb-24 px-4 overflow-y-auto scrollbar-hide">
        <div className="py-4 space-y-4">
          {/* Mode Toggle - only show if copilot is available */}
          {isCopilotConfigured && flowState === 'input' && (
            <div className="flex items-center gap-2 p-1 bg-muted/50 rounded-xl">
              <button
                onClick={() => setInputMode('copilot')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all',
                  inputMode === 'copilot'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Sparkles className="w-4 h-4" />
                {t('copilotMode', locale)}
              </button>
              <button
                onClick={() => setInputMode('manual')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all',
                  inputMode === 'manual'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <FileText className="w-4 h-4" />
                {t('manualMode', locale)}
              </button>
            </div>
          )}

          {/* Input Mode: Copilot */}
          {flowState === 'input' && inputMode === 'copilot' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Natural language input */}
              <div className="glass-card rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">
                    {locale === 'zh-Hans' ? '用自然语言描述您的拜访' : 'Describe your visit in natural language'}
                  </span>
                </div>
                <Textarea
                  ref={inputRef}
                  value={inputText}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputText(e.target.value)}
                  placeholder={t('inputPlaceholder', locale)}
                  className="min-h-[120px] resize-none bg-muted/30 border-border/50"
                />
                <p className="text-xs text-muted-foreground">
                  {t('inputHint', locale)}
                </p>
              </div>

            </motion.div>
          )}

          {/* Input Mode: Manual Form */}
          {flowState === 'input' && inputMode === 'manual' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card rounded-xl p-4 space-y-4"
            >
              {/* Account Selection */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{t('account', locale)}</label>
                <Select
                  value={formData.accountId || 'none'}
                  onValueChange={(val: string) => setFormData((prev) => ({ ...prev, accountId: val === 'none' ? '' : val }))}
                >
                  <SelectTrigger className="bg-muted/30">
                    <SelectValue placeholder={t('selectAccount', locale)} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('selectAccount', locale)}</SelectItem>
                    {accounts.filter((a) => a.id).map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name1}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Contact Name */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{t('contact', locale)}</label>
                <Input
                  value={formData.contactName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData((prev) => ({ ...prev, contactName: e.target.value }))}
                  placeholder={t('enterContact', locale)}
                  className="bg-muted/30"
                />
              </div>

              {/* Visit Date */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{t('visitDate', locale)}</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal bg-muted/30">
                      <Calendar className="mr-2 h-4 w-4" />
                      {format(formData.visitDate, 'PPP')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <CalendarComponent
                      mode="single"
                      selected={formData.visitDate}
                      onSelect={(date: Date | undefined) => date && setFormData((prev) => ({ ...prev, visitDate: date }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Visit Type */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{t('visitType', locale)}</label>
                <Select
                  value={formData.visitType}
                  onValueChange={(val: string) => setFormData((prev) => ({ ...prev, visitType: val as VisitFormData['visitType'] }))}
                >
                  <SelectTrigger className="bg-muted/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(visitTypeLabels).map(([key, labels]) => (
                      <SelectItem key={key} value={key}>
                        {locale === 'zh-Hans' ? labels.zh : labels.en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Summary */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{t('summary', locale)}</label>
                <Textarea
                  value={formData.summary}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData((prev) => ({ ...prev, summary: e.target.value }))}
                  placeholder={t('enterSummary', locale)}
                  className="min-h-[80px] resize-none bg-muted/30"
                />
              </div>

              {/* Outcome */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{t('outcome', locale)}</label>
                <Input
                  value={formData.outcome}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData((prev) => ({ ...prev, outcome: e.target.value }))}
                  placeholder={t('enterOutcome', locale)}
                  className="bg-muted/30"
                />
              </div>

              {/* Next Steps */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{t('nextSteps', locale)}</label>
                <Input
                  value={formData.nextSteps}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData((prev) => ({ ...prev, nextSteps: e.target.value }))}
                  placeholder={t('enterNextSteps', locale)}
                  className="bg-muted/30"
                />
              </div>
            </motion.div>
          )}

          {/* Processing State */}
          {flowState === 'processing' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 space-y-4"
            >
              <div className="relative">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' as const }}
                  className="w-16 h-16 rounded-full border-2 border-primary/20 border-t-primary"
                />
                <Sparkles className="w-6 h-6 text-primary absolute inset-0 m-auto" />
              </div>
              <p className="text-sm text-muted-foreground">{t('processing', locale)}</p>
            </motion.div>
          )}

          {/* Review State */}
          {flowState === 'review' && extractedData && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Confidence Header */}
              <div className="glass-card rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-foreground">{t('reviewTitle', locale)}</h2>
                  <ConfidenceIndicator confidence={extractedData.confidence} locale={locale} />
                </div>
              </div>

              {/* Extracted Fields */}
              <div className="glass-card rounded-xl px-4">
                {/* Account */}
                <EditableField
                  label={t('account', locale)}
                  value={getAccountName()}
                  isEditing={editingField === 'accountId'}
                  onEdit={() => startEdit('accountId', formData.accountId)}
                  onSave={() => saveEdit('accountId')}
                  onCancel={cancelEdit}
                  icon={Building2}
                  aiExtracted={!!extractedData.accountName}
                  locale={locale}
                  editComponent={
                    <Select
                      value={tempEditValue || 'none'}
                      onValueChange={setTempEditValue}
                    >
                      <SelectTrigger className="bg-muted/30">
                        <SelectValue placeholder={t('selectAccount', locale)} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('selectAccount', locale)}</SelectItem>
                        {accounts.filter((a) => a.id).map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name1}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  }
                />

                {/* Contact */}
                <EditableField
                  label={t('contact', locale)}
                  value={formData.contactName}
                  isEditing={editingField === 'contactName'}
                  onEdit={() => startEdit('contactName', formData.contactName)}
                  onSave={() => saveEdit('contactName')}
                  onCancel={cancelEdit}
                  icon={User}
                  aiExtracted={!!extractedData.contactName}
                  locale={locale}
                  editComponent={
                    <Input
                      value={tempEditValue}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTempEditValue(e.target.value)}
                      placeholder={t('enterContact', locale)}
                      className="bg-muted/30"
                    />
                  }
                />

                {/* Visit Date */}
                <EditableField
                  label={t('visitDate', locale)}
                  value={format(formData.visitDate, 'PPP')}
                  isEditing={editingField === 'visitDate'}
                  onEdit={() => startEdit('visitDate', formData.visitDate)}
                  onSave={() => saveEdit('visitDate')}
                  onCancel={cancelEdit}
                  icon={Calendar}
                  aiExtracted={!!extractedData.visitDate}
                  locale={locale}
                  editComponent={
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal bg-muted/30">
                          <Calendar className="mr-2 h-4 w-4" />
                          {tempDateValue ? format(tempDateValue, 'PPP') : t('pickDate', locale)}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <CalendarComponent
                          mode="single"
                          selected={tempDateValue}
                          onSelect={setTempDateValue}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  }
                />

                {/* Summary */}
                <EditableField
                  label={t('summary', locale)}
                  value={formData.summary}
                  isEditing={editingField === 'summary'}
                  onEdit={() => startEdit('summary', formData.summary)}
                  onSave={() => saveEdit('summary')}
                  onCancel={cancelEdit}
                  icon={MessageSquare}
                  aiExtracted={!!extractedData.summary}
                  locale={locale}
                  editComponent={
                    <Textarea
                      value={tempEditValue}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTempEditValue(e.target.value)}
                      placeholder={t('enterSummary', locale)}
                      className="min-h-[80px] resize-none bg-muted/30"
                    />
                  }
                />

                {/* Outcome */}
                <EditableField
                  label={t('outcome', locale)}
                  value={formData.outcome}
                  isEditing={editingField === 'outcome'}
                  onEdit={() => startEdit('outcome', formData.outcome)}
                  onSave={() => saveEdit('outcome')}
                  onCancel={cancelEdit}
                  icon={Check}
                  aiExtracted={!!extractedData.outcome}
                  locale={locale}
                  editComponent={
                    <Input
                      value={tempEditValue}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTempEditValue(e.target.value)}
                      placeholder={t('enterOutcome', locale)}
                      className="bg-muted/30"
                    />
                  }
                />

                {/* Next Steps */}
                <EditableField
                  label={t('nextSteps', locale)}
                  value={formData.nextSteps}
                  isEditing={editingField === 'nextSteps'}
                  onEdit={() => startEdit('nextSteps', formData.nextSteps)}
                  onSave={() => saveEdit('nextSteps')}
                  onCancel={cancelEdit}
                  icon={ChevronRight}
                  aiExtracted={!!extractedData.nextSteps}
                  locale={locale}
                  editComponent={
                    <Input
                      value={tempEditValue}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTempEditValue(e.target.value)}
                      placeholder={t('enterNextSteps', locale)}
                      className="bg-muted/30"
                    />
                  }
                />

                {/* Opportunity Signal (if detected) */}
                {extractedData.opportunitySignal && (
                  <div className="py-3 border-b border-border/30 last:border-0">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Sparkles className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">{t('opportunitySignal', locale)}</span>
                        <p className="text-sm text-primary font-medium">{extractedData.opportunitySignal}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Saving State */}
          {flowState === 'saving' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 space-y-4"
            >
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">{t('saving', locale)}</p>
            </motion.div>
          )}
        </div>
      </main>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 glass-surface border-t border-border/50 p-4 safe-area-bottom">
        {flowState === 'input' && inputMode === 'copilot' && (
          <Button
            onClick={processInput}
            disabled={!inputText.trim()}
            className="w-full h-12 accent-gradient text-white font-medium"
          >
            <Send className="w-4 h-4 mr-2" />
            {locale === 'zh-Hans' ? '提取信息' : 'Extract Info'}
          </Button>
        )}

        {flowState === 'input' && inputMode === 'manual' && (
          <Button
            onClick={() => {
              setExtractedData({
                ...formData,
                confidence: 100,
              });
              setFlowState('review');
            }}
            disabled={!formData.summary.trim()}
            className="w-full h-12 accent-gradient text-white font-medium"
          >
            <ChevronRight className="w-4 h-4 mr-2" />
            {locale === 'zh-Hans' ? '预览并确认' : 'Preview & Confirm'}
          </Button>
        )}

        {flowState === 'review' && (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={resetToInput}
              className="flex-1 h-12"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              {t('reInput', locale)}
            </Button>
            <Button
              onClick={saveVisit}
              className="flex-1 h-12 accent-gradient text-white font-medium"
            >
              <Check className="w-4 h-4 mr-2" />
              {t('confirm', locale)}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
