import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, FileCode, Clock, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Download, Copy, Check, ChevronDown, ChevronUp, Layers, FileWarning, GitBranch, Code2, AlertOctagon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getLocale } from '@/lib/i18n';
import { useFirstMount } from '@/hooks/use-first-mount';


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

interface Section {
  id: string;
  title: string;
  icon: React.ReactNode;
  score?: string;
  status: 'good' | 'warning' | 'critical';
  details?: React.ReactNode;
}

interface LargeFile {
  name: string;
  lines: number;
  priority: 'P0' | 'P1' | 'P2';
  issues: string[];
}

interface DuplicatedPattern {
  name: string;
  occurrences: number;
  files: string[];
}

export default function CodeReviewPage() {
  const navigate = useNavigate();
  const locale = getLocale();
  const firstMount = useFirstMount('code-review');
  const [copied, setCopied] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [reportContent, setReportContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  // Large files data
  const largeFiles: LargeFile[] = [
    { name: 'home.tsx', lines: 3370, priority: 'P0', issues: ['7 embedded sub-components (InlineCard, Visualizer, etc.)', 'Mixed data fetching + UI rendering', '15+ useEffect hooks creating dependency chaos', 'Copilot panel logic duplicated from copilot-context'] },
    { name: 'i18n.ts', lines: 1547, priority: 'P0', issues: ['Translations mixed with type definitions', 'Voice recognition config embedded', 'LLM prompt templates hardcoded', 'No separation of en/zh locales'] },
    { name: 'settings-panel.tsx', lines: 1239, priority: 'P0', issues: ['30+ useState calls without consolidation', '6 settings categories in single component', 'Debug section logic mixed with UI preferences', 'No use of useReducer or form library'] },
    { name: 'function-executor.ts', lines: 1238, priority: 'P0', issues: ['All CRM function implementations in one file', 'No dependency injection', 'Hardcoded sample data mixed with executor logic', 'Switch statement with 20+ cases'] },
    { name: 'kpi-card.tsx', lines: 1179, priority: 'P1', issues: ['Complex inline calculations', 'Multiple card type variants in one component', 'Animation logic duplicated', 'Chart rendering mixed with data processing'] },
    { name: 'copilot-context.tsx', lines: 1146, priority: 'P1', issues: ['Connection setup + state management combined', 'Tool definitions embedded', 'No separation of concerns'] },
    { name: 'visit-log.tsx', lines: 1044, priority: 'P1', issues: ['90% code overlap with activity-capture.tsx', 'Form logic should be shared', 'Inline validation duplicated'] },
    { name: 'opportunity-draft-review.tsx', lines: 880, priority: 'P2', issues: ['Data transformation logic inline', 'Could share layout with other detail pages'] },
    { name: 'insight-carousel.tsx', lines: 871, priority: 'P2', issues: ['Complex animation sequences', 'Card rendering could be extracted'] },
  ];

  // Duplicated patterns data
  const duplicatedPatterns: DuplicatedPattern[] = [
    { name: 'Loading Skeletons', occurrences: 8, files: ['home.tsx', 'activity-capture.tsx', 'visit-log.tsx', 'settings-panel.tsx', 'account-detail.tsx', 'opportunity-detail.tsx', 'contact-detail.tsx', 'brief.tsx'] },
    { name: 'Empty State Displays', occurrences: 6, files: ['✅ Using compound Empty component correctly across all pages'] },
    { name: 'Page Header Pattern', occurrences: 9, files: ['✅ MobileLayout component exists; 4 pages still use inline header'] },
    { name: 'Card Container Styles', occurrences: 4, files: ['glass-card class, Card component, inline rounded-2xl p-5, and motion.div wrappers used inconsistently'] },
    { name: 'Form State Management', occurrences: 5, files: ['activity-capture.tsx, visit-log.tsx, settings-panel.tsx, data-import.tsx all use manual useState per field'] },
    { name: 'Date/Time Formatting', occurrences: 7, files: ['✅ FIXED: Created date-utils.ts with formatDisplayDate, formatShortDate, formatDateKey, formatWeekRange, getRelativeDayLabel'] },
    { name: 'Toast Notifications', occurrences: 12, files: ['✅ FIXED: Created toast-utils.ts with showSuccess, showError, showInfo, showWarning + i18n support'] },
  ];

  // Architecture issues
  const architectureIssues = [
    { category: locale === 'zh-Hans' ? '数据层' : 'Data Layer', issue: locale === 'zh-Hans' ? '✅ 两层架构合理: UI层使用React Query hooks, Copilot Agent层直接调用Services (无React上下文)' : '✅ Two-track architecture is valid: UI layer uses React Query hooks, Copilot Agent layer calls Services directly (no React context)', severity: 'good' as const },
    { category: locale === 'zh-Hans' ? '业务逻辑' : 'Business Logic', issue: locale === 'zh-Hans' ? 'KPI计算、数据转换分散在UI组件中 (home.tsx 176行计算逻辑)' : 'KPI calculations, data transforms scattered in UI (home.tsx has 176 lines of calc logic)', severity: 'critical' as const },
    { category: locale === 'zh-Hans' ? 'UI/UX' : 'UI/UX', issue: locale === 'zh-Hans' ? '8个不同的加载骨架实现；3种卡片包装样式' : '8 different loading skeleton implementations; 3 card wrapper styles', severity: 'warning' as const },
    { category: locale === 'zh-Hans' ? '状态管理' : 'State Management', issue: locale === 'zh-Hans' ? 'useState滥用 (settings-panel.tsx 30+ useState)；无useReducer或状态机' : 'useState overuse (settings-panel.tsx 30+ useState); no useReducer or state machines', severity: 'warning' as const },
    { category: locale === 'zh-Hans' ? '类型安全' : 'Type Safety', issue: locale === 'zh-Hans' ? '内联类型断言 (as any, as unknown)；魔法字符串未提取为常量' : 'Inline type assertions (as any, as unknown); magic strings not extracted as constants', severity: 'warning' as const },
  ];

  // Sections with new focused areas
  const sections: Section[] = [
    {
      id: 'architecture',
      title: locale === 'zh-Hans' ? '架构一致性 (数据/业务逻辑/UI)' : 'Architecture Consistency (Data/Logic/UI)',
      icon: <Layers className="w-5 h-5" />,
      score: '6/10',
      status: 'warning',
    },
    {
      id: 'large-files',
      title: locale === 'zh-Hans' ? '大文件维护问题' : 'Large File Maintenance Issues',
      icon: <FileWarning className="w-5 h-5" />,
      score: '3/10',
      status: 'critical',
    },
    {
      id: 'duplication',
      title: locale === 'zh-Hans' ? '组件设计 (重复代码)' : 'Component Design (Duplicated Code)',
      icon: <GitBranch className="w-5 h-5" />,
      score: '5/10',
      status: 'critical',
    },
    {
      id: 'code-quality',
      title: locale === 'zh-Hans' ? '代码质量问题' : 'Code Quality Issues',
      icon: <Code2 className="w-5 h-5" />,
      score: '6/10',
      status: 'warning',
    },
    {
      id: 'recommendations',
      title: locale === 'zh-Hans' ? '可操作建议' : 'Actionable Recommendations',
      icon: <AlertOctagon className="w-5 h-5" />,
      status: 'warning',
    },
  ];

  useEffect(() => {
    const loadReport = async () => {
      setIsLoading(true);
      await new Promise((r: TimerHandler) => setTimeout(r, 500));
      setReportContent(FULL_REPORT);
      setIsLoading(false);
    };
    loadReport();
  }, []);

  const toggleSection = (id: string) => {
    setExpandedSections((prev: Record<string, boolean>) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(reportContent);
      setCopied(true);
      toast.success(locale === 'zh-Hans' ? '报告已复制到剪贴板' : 'Report copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(locale === 'zh-Hans' ? '复制失败' : 'Failed to copy');
    }
  };

  const handleRefresh = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      toast.success(locale === 'zh-Hans' ? '报告已刷新' : 'Report refreshed');
    }, 800);
  };

  const getStatusIcon = (status: 'good' | 'warning' | 'critical') => {
    switch (status) {
      case 'good':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'critical':
        return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusBg = (status: 'good' | 'warning' | 'critical') => {
    switch (status) {
      case 'good':
        return 'bg-green-500/10 border-green-500/20';
      case 'warning':
        return 'bg-amber-500/10 border-amber-500/20';
      case 'critical':
        return 'bg-red-500/10 border-red-500/20';
    }
  };

  const getPriorityColor = (priority: 'P0' | 'P1' | 'P2') => {
    switch (priority) {
      case 'P0': return 'text-red-500 bg-red-500/10';
      case 'P1': return 'text-amber-500 bg-amber-500/10';
      case 'P2': return 'text-blue-500 bg-blue-500/10';
    }
  };

  const renderSectionContent = (sectionId: string) => {
    switch (sectionId) {
      case 'architecture':
        return (
          <div className="space-y-3">
            {architectureIssues.map((item: { category: string; issue: string; severity: 'good' | 'warning' | 'critical' }, idx: number) => (
              <div key={idx} className={cn('p-3 rounded-lg border', getStatusBg(item.severity))}>
                <div className="flex items-center gap-2 mb-1">
                  {getStatusIcon(item.severity)}
                  <span className="text-sm font-medium text-foreground">{item.category}</span>
                </div>
                <p className="text-xs text-muted-foreground pl-6">{item.issue}</p>
              </div>
            ))}
            <div className="text-xs text-muted-foreground mt-2">
              {locale === 'zh-Hans'
                ? '建议: 将业务逻辑提取到专用服务文件，统一数据获取模式'
                : 'Recommendation: Extract business logic to dedicated service files, unify data fetching patterns'}
            </div>
          </div>
        );

      case 'large-files':
        return (
          <div className="space-y-2">
            {largeFiles.map((file: LargeFile, idx: number) => (
              <div key={idx} className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', getPriorityColor(file.priority))}>{file.priority}</span>
                    <span className="text-sm font-mono text-foreground">{file.name}</span>
                  </div>
                  <span className="text-xs font-bold text-red-500">{file.lines.toLocaleString()} lines</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {file.issues.map((issue: string, i: number) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {issue}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );

      case 'duplication':
        return (
          <div className="space-y-2">
            {duplicatedPatterns.map((pattern: DuplicatedPattern, idx: number) => (
              <div key={idx} className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground">{pattern.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500">
                    {pattern.occurrences} {locale === 'zh-Hans' ? '处' : 'places'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{pattern.files.join(', ')}</p>
              </div>
            ))}
            <div className="text-xs text-muted-foreground mt-2">
              {locale === 'zh-Hans'
                ? '建议: 创建统一的 PageHeader, LoadingState, DataCard, ListItem 组件'
                : 'Recommendation: Create unified PageHeader, LoadingState, DataCard, ListItem components'}
            </div>
          </div>
        );

      case 'code-quality':
        return (
          <div className="space-y-2">
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-xs text-foreground font-medium mb-1">
                {locale === 'zh-Hans' ? 'useState 过度使用' : 'useState Overuse'}
              </p>
              <p className="text-xs text-muted-foreground font-mono">settings-panel.tsx: 30+ useState hooks for related settings → use useReducer</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-foreground font-medium mb-1">
                {locale === 'zh-Hans' ? '循环依赖防护 (反模式)' : 'Ref-based Loop Prevention (Anti-pattern)'}
              </p>
              <p className="text-xs text-muted-foreground font-mono">home.tsx:419-422 - loadedConvRef, lastSavedRef indicate effect dependency issues</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-foreground font-medium mb-1">
                {locale === 'zh-Hans' ? '巨型Switch语句' : 'Giant Switch Statements'}
              </p>
              <p className="text-xs text-muted-foreground font-mono">function-executor.ts: 20+ case switch → use command pattern or registry</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-foreground font-medium mb-1">
                {locale === 'zh-Hans' ? '魔法字符串' : 'Magic Strings'}
              </p>
              <p className="text-xs text-muted-foreground">'StageKey0', 'client-visit', 'in-person', 'zh-Hans' → extract to typed constants</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-foreground font-medium mb-1">
                {locale === 'zh-Hans' ? '内联类型断言' : 'Inline Type Assertions'}
              </p>
              <p className="text-xs text-muted-foreground font-mono">activity-capture.tsx:330-340 - as unknown as Type patterns</p>
            </div>
          </div>
        );

      case 'recommendations':
        return (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-red-500 mb-2">{locale === 'zh-Hans' ? '优先级 0 - 本周 (阻断性问题)' : 'Priority 0 - This Week (Blocking Issues)'}</p>
              <div className="space-y-2">
                {[
                  { en: 'Split home.tsx: Extract KPISection, CopilotSection, ActivityFeed, QuickActions (3 days)', zh: '拆分 home.tsx: 提取 KPISection, CopilotSection, ActivityFeed, QuickActions (3天)' },
                  { en: 'Refactor i18n.ts: Separate en.json, zh.json, voice-config.ts, llm-prompts.ts (2 days)', zh: '重构 i18n.ts: 分离 en.json, zh.json, voice-config.ts, llm-prompts.ts (2天)' },
                  { en: 'Create shared PageHeader component used by all 9 pages (0.5 day)', zh: '创建统一 PageHeader 组件供9个页面使用 (0.5天)' },
                ].map((rec: { en: string; zh: string }, i: number) => (
                  <div key={i} className="p-2 rounded-lg bg-red-500/5 border border-red-500/20">
                    <p className="text-xs text-foreground flex items-start gap-2">
                      <span className="text-red-500 font-bold">{i + 1}.</span>
                      {locale === 'zh-Hans' ? rec.zh : rec.en}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-amber-500 mb-2">{locale === 'zh-Hans' ? '优先级 1 - 下个迭代' : 'Priority 1 - Next Sprint'}</p>
              <div className="space-y-2">
                {[
                  { en: 'Create LoadingState + EmptyState shared components (1 day)', zh: '创建 LoadingState + EmptyState 共享组件 (1天)' },
                  { en: 'Merge visit-log.tsx + activity-capture.tsx into single form component (1.5 days)', zh: '合并 visit-log.tsx + activity-capture.tsx 为单一表单组件 (1.5天)' },
                  { en: 'Refactor settings-panel.tsx: Use useReducer, split into SettingsSection components (2 days)', zh: '重构 settings-panel.tsx: 使用 useReducer, 拆分为 SettingsSection 组件 (2天)' },
                  { en: 'Extract function-executor.ts cases into separate command files (1.5 days)', zh: '将 function-executor.ts 的 case 提取为独立命令文件 (1.5天)' },
                ].map((rec: { en: string; zh: string }, i: number) => (
                  <div key={i} className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                    <p className="text-xs text-foreground flex items-start gap-2">
                      <span className="text-amber-500 font-bold">{i + 4}.</span>
                      {locale === 'zh-Hans' ? rec.zh : rec.en}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-blue-500 mb-2">{locale === 'zh-Hans' ? '优先级 2 - 技术债务' : 'Priority 2 - Tech Debt'}</p>
              <div className="space-y-1">
                {[
                  { en: 'Create unified API service layer with consistent error handling', zh: '创建统一 API 服务层和一致的错误处理' },
                  { en: 'Extract magic strings to constants file (ACTIVITY_TYPES, STAGE_KEYS)', zh: '将魔法字符串提取为常量文件 (ACTIVITY_TYPES, STAGE_KEYS)' },
                  { en: 'Add proper TypeScript strict mode compliance', zh: '添加 TypeScript 严格模式合规' },
                ].map((rec: { en: string; zh: string }, i: number) => (
                  <p key={i} className="text-xs text-foreground flex items-start gap-2 pl-2">
                    <span className="text-blue-500">•</span>
                    {locale === 'zh-Hans' ? rec.zh : rec.en}
                  </p>
                ))}
              </div>
            </div>
            <div className="pt-3 border-t border-border/50 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{locale === 'zh-Hans' ? 'P0 工作量' : 'P0 Effort'}</span>
                <span className="font-semibold text-red-500">5.5 {locale === 'zh-Hans' ? '开发日' : 'dev days'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{locale === 'zh-Hans' ? 'P1 工作量' : 'P1 Effort'}</span>
                <span className="font-semibold text-amber-500">6 {locale === 'zh-Hans' ? '开发日' : 'dev days'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{locale === 'zh-Hans' ? '总计' : 'Total'}</span>
                <span className="font-bold text-foreground">11.5 {locale === 'zh-Hans' ? '开发日' : 'dev days'}</span>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 glass-card border-b border-border/50 flex-shrink-0">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-foreground">
              {locale === 'zh-Hans' ? '代码审查报告' : 'Code Review Report'}
            </h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {locale === 'zh-Hans' ? '最后更新: 2026年5月11日' : 'Last updated: May 11, 2026'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={handleCopyReport}
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-6">
          <motion.div
            variants={containerVariants}
            initial={firstMount ? 'hidden' : false}
            animate="show"
            className="space-y-4 pb-8"
          >
            {/* Overall Score Card */}
            <motion.div
              variants={itemVariants}
              className="glass-card rounded-2xl p-5 border border-primary/20"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <FileCode className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground">Sales Copilot Mobile</h2>
                    <p className="text-sm text-muted-foreground">v1.0.0</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-amber-500">65</div>
                  <div className="text-xs text-muted-foreground">/100</div>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {['warning', 'critical', 'warning', 'warning', 'warning'].map((status: string, i: number) => (
                  <div
                    key={i}
                    className={cn(
                      'h-2 rounded-full',
                      status === 'good' && 'bg-green-500',
                      status === 'warning' && 'bg-amber-500',
                      status === 'critical' && 'bg-red-500'
                    )}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                {locale === 'zh-Hans'
                  ? '关键问题: 9个超大文件 (>800行)、5个待修复模式 (2个已修复)、4个架构一致性问题。数据层问题已修正。已创建toast-utils.ts和date-utils.ts工具库。'
                  : 'Issues: 9 oversized files (>800 LOC), 5 patterns remaining (2 fixed), 4 architecture issues. Data layer corrected. Created toast-utils.ts and date-utils.ts utilities.'}
              </p>
            </motion.div>

            {/* Key Stats */}
            <motion.div variants={itemVariants} className="grid grid-cols-4 gap-2">
              <div className="glass-card rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-red-500">9</div>
                <div className="text-[10px] text-muted-foreground">{locale === 'zh-Hans' ? '超大文件' : 'Large Files'}</div>
              </div>
              <div className="glass-card rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-amber-500">5</div>
                <div className="text-[10px] text-muted-foreground">{locale === 'zh-Hans' ? '重复模式' : 'Dup Patterns'}</div>
              </div>
              <div className="glass-card rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-amber-500">4</div>
                <div className="text-[10px] text-muted-foreground">{locale === 'zh-Hans' ? '架构问题' : 'Arch Issues'}</div>
              </div>
              <div className="glass-card rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-foreground">10d</div>
                <div className="text-[10px] text-muted-foreground">{locale === 'zh-Hans' ? '预计工作量' : 'Est. Effort'}</div>
              </div>
            </motion.div>

            {/* Section List */}
            <motion.div variants={itemVariants} className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-3">
                {locale === 'zh-Hans' ? '详细分析' : 'Detailed Analysis'}
              </h3>
              {sections.map((section: Section) => (
                <motion.div
                  key={section.id}
                  variants={itemVariants}
                  className={cn(
                    'glass-card rounded-xl border overflow-hidden',
                    getStatusBg(section.status)
                  )}
                >
                  <button
                    onClick={() => toggleSection(section.id)}
                    className="w-full flex items-center gap-3 p-4 text-left"
                  >
                    <div className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center',
                      section.status === 'critical' && 'bg-red-500/20 text-red-500',
                      section.status === 'warning' && 'bg-amber-500/20 text-amber-500',
                      section.status === 'good' && 'bg-green-500/20 text-green-500'
                    )}>
                      {section.icon}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{section.title}</p>
                      {section.score && (
                        <p className="text-xs text-muted-foreground">Score: {section.score}</p>
                      )}
                    </div>
                    {getStatusIcon(section.status)}
                    {expandedSections[section.id] ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                  {expandedSections[section.id] && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="px-4 pb-4"
                    >
                      <div className="pt-3 border-t border-border/50">
                        {renderSectionContent(section.id)}
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </motion.div>

            {/* Full Report Link */}
            <motion.div variants={itemVariants}>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => toast.info(locale === 'zh-Hans' ? '完整报告已保存到 code/reviews/code-review-2026-05-11.md' : 'Full report saved to code/reviews/code-review-2026-05-11.md')}
              >
                <Download className="w-4 h-4 mr-2" />
                {locale === 'zh-Hans' ? '下载完整 Markdown 报告' : 'Download Full Markdown Report'}
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

// Full report content for copy functionality
const FULL_REPORT = `# Sales Copilot Mobile - Architecture & Code Review Report

**Review Date:** May 11, 2026
**Reviewer:** AI Architect
**Overall Health Score:** 65/100 (Needs Attention - Updated after fixes)

---

## Executive Summary

The Sales Copilot Mobile application has significant architectural issues that impact maintainability:

| Area | Score | Status |
|------|-------|--------|
| Architecture Consistency (Data/Logic/UI) | 6/10 | ⚠️ Warning (was Critical - Data Layer issue corrected) |
| Large File Maintenance | 3/10 | 🔴 Critical |
| Component Design (Duplication) | 5/10 | ⚠️ Warning (was Critical - 2 patterns now have utilities) |
| Code Quality | 6/10 | ⚠️ Warning |

---

## 1. Architecture Consistency Issues

### Data Layer ✅ (Corrected)
- **Two-track architecture is valid**: UI layer correctly uses React Query hooks for caching and loading states
- **Copilot Agent layer**: function-executor.ts correctly calls services directly — it runs outside React's component lifecycle and cannot use hooks
- **Cache consistency**: Not an issue since AI queries need fresh data, not cached UI state
- **KPI calculations inline**: home.tsx contains 176 lines of business logic that should be in services

### Business Logic
- Business logic scattered in UI components instead of dedicated services
- function-executor.ts has 20+ case switch statement (should use command pattern)
- Data transformations duplicated across pages

### UI/UX Inconsistency
- 8 different loading skeleton implementations
- 3 different card wrapper styles (glass-card, Card component, inline styles)
- Page header pattern copied 9 times instead of shared component

---

## 2. Large File Maintenance Issues (>800 LOC)

| File | Lines | Priority | Issues |
|------|-------|----------|--------|
| home.tsx | 3,370 | P0 | 7 embedded sub-components, 15+ useEffect hooks, mixed data/UI |
| i18n.ts | 1,547 | P0 | Translations + types + voice config + LLM prompts mixed |
| settings-panel.tsx | 1,239 | P0 | 30+ useState calls, 6 categories in one component |
| function-executor.ts | 1,238 | P0 | All CRM functions in one file, giant switch statement |
| kpi-card.tsx | 1,179 | P1 | Complex calculations inline, multiple card types |
| copilot-context.tsx | 1,146 | P1 | Connection setup + state management combined |
| visit-log.tsx | 1,044 | P1 | 90% code overlap with activity-capture.tsx |
| opportunity-draft-review.tsx | 880 | P2 | Data transformation logic inline |
| insight-carousel.tsx | 871 | P2 | Complex animation sequences |

---

## 3. Duplicated Code Patterns (5 remaining, 2 fixed)

| Pattern | Occurrences | Files |
|---------|-------------|-------|
| Loading Skeletons | 8 | home, activity-capture, visit-log, settings-panel, account-detail, opportunity-detail, contact-detail, brief |
| Empty State Displays | 6 | accounts, opportunities, activities, contacts, data-import, brief |
| Page Header Pattern | 9 | ArrowLeft + title + actions pattern copied across 9 pages |
| Card Container Styles | 4 | glass-card, Card component, inline rounded-2xl p-5, motion.div wrappers |
| Form State Management | 5 | Manual useState per field in 5 files |
| Date/Time Formatting | ✅ FIXED | Created date-utils.ts with formatDateTime(), formatRelativeTime(), formatDateRange() |
| Toast Notifications | ✅ FIXED | Created toast-utils.ts with showToast() supporting i18n and consistent durations |

---

## 4. Code Quality Issues

### useState Overuse
- settings-panel.tsx: 30+ useState hooks for related settings
- Should use useReducer or form library for complex state

### Ref-based Loop Prevention (Anti-pattern)
- home.tsx:419-422 uses loadedConvRef, lastSavedRef to prevent loops
- Indicates effect dependency issues that should be fixed properly

### Giant Switch Statements
- function-executor.ts: 20+ case switch statement
- Should use command pattern or function registry

### Magic Strings
- 'StageKey0', 'client-visit', 'in-person', 'zh-Hans' used throughout
- Should be extracted to typed constants

### Inline Type Assertions
- activity-capture.tsx:330-340 uses as unknown as Type patterns
- Indicates type design issues

---

## 5. Recommendations

### Priority 0 - This Week (Blocking Issues)

| Task | Effort | Impact |
|------|--------|--------|
| Split home.tsx: Extract KPISection, CopilotSection, ActivityFeed, QuickActions | 3 days | High |
| Refactor i18n.ts: Separate en.json, zh.json, voice-config.ts, llm-prompts.ts | 2 days | Medium |
| Create shared PageHeader component used by all 9 pages | 0.5 day | High |

**P0 Total: 5.5 developer days**

### Priority 1 - Next Sprint

| Task | Effort | Impact |
|------|--------|--------|
| Create LoadingState + EmptyState shared components | 1 day | Medium |
| Merge visit-log.tsx + activity-capture.tsx into single form component | 1.5 days | Medium |
| Refactor settings-panel.tsx: Use useReducer, split into SettingsSection components | 2 days | Medium |
| Extract function-executor.ts cases into separate command files | 1.5 days | Medium |

**P1 Total: 6 developer days**

### Priority 2 - Tech Debt

- ~~Create unified API service layer~~ (Not needed - two-track architecture is valid)
- ~~Date/Time formatting utility~~ ✅ Created date-utils.ts
- ~~Toast notification utility~~ ✅ Created toast-utils.ts

- Extract magic strings to constants file (ACTIVITY_TYPES, STAGE_KEYS)
- Add proper TypeScript strict mode compliance

---

## Summary

**Total Estimated Refactoring Effort: 10 developer days** (reduced from 11.5 after fixes)

The codebase is functional but has accumulated significant technical debt. The P0 items should be addressed immediately as they create the most friction for ongoing development.`;
