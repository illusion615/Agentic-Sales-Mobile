import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { ChevronRight, Building2, Target, Calendar, Users, FileText, Package } from 'lucide-react';
import { getLocale, type Locale } from '@/lib/i18n';
import { useCopilot } from '@/contexts/copilot-context';

// Simple markdown renderer - handles basic formatting without external dependencies
function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  
  const flushList = () => {
    if (listItems.length > 0 && listType) {
      const ListTag = listType;
      elements.push(
        <ListTag
          key={`list-${elements.length}`}
          className={cn(
            'text-sm text-foreground/90 pl-4 mb-2 space-y-1',
            listType === 'ul' ? 'list-disc' : 'list-decimal'
          )}
        >
          {listItems.map((item: string, idx: number) => (
            <li key={idx} className="text-sm text-foreground/90">{renderInline(item)}</li>
          ))}
        </ListTag>
      );
      listItems = [];
      listType = null;
    }
  };
  
  const renderInline = (text: string): React.ReactNode => {
    // Bold: **text** or __text__
    // Italic: *text* or _text_
    // Code: `text`
    // Links: [text](url)
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let key = 0;
    
    while (remaining.length > 0) {
      // Check for code
      const codeMatch = remaining.match(/^`([^`]+)`/);
      if (codeMatch) {
        parts.push(
          <code key={key++} className="bg-muted px-1 py-0.5 rounded text-xs font-mono text-primary">
            {codeMatch[1]}
          </code>
        );
        remaining = remaining.slice(codeMatch[0].length);
        continue;
      }
      
      // Check for bold
      const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/) || remaining.match(/^__([^_]+)__/);
      if (boldMatch) {
        parts.push(<strong key={key++} className="font-semibold text-foreground">{boldMatch[1]}</strong>);
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }
      
      // Check for italic
      const italicMatch = remaining.match(/^\*([^*]+)\*/) || remaining.match(/^_([^_]+)_/);
      if (italicMatch) {
        parts.push(<em key={key++} className="italic text-foreground/80">{italicMatch[1]}</em>);
        remaining = remaining.slice(italicMatch[0].length);
        continue;
      }
      
      // Check for links
      const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        parts.push(
          <a key={key++} href={linkMatch[2]} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            {linkMatch[1]}
          </a>
        );
        remaining = remaining.slice(linkMatch[0].length);
        continue;
      }
      
      // Regular text - take until next special character
      const nextSpecial = remaining.search(/[`*_\[]/);
      if (nextSpecial === -1) {
        parts.push(remaining);
        break;
      } else if (nextSpecial === 0) {
        // Special char but no match - treat as regular
        parts.push(remaining[0]);
        remaining = remaining.slice(1);
      } else {
        parts.push(remaining.slice(0, nextSpecial));
        remaining = remaining.slice(nextSpecial);
      }
    }
    
    return parts.length === 1 ? parts[0] : parts;
  };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Code block fence
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${i}`} className="bg-muted p-3 rounded-lg overflow-x-auto mb-2 text-xs font-mono">
            {codeBlockContent.join('\n')}
          </pre>
        );
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        flushList();
        inCodeBlock = true;
      }
      continue;
    }
    
    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }
    
    // Headers
    const h3Match = line.match(/^### (.+)/);
    if (h3Match) {
      flushList();
      elements.push(<h3 key={`h3-${i}`} className="text-sm font-semibold text-foreground mt-2 mb-1">{renderInline(h3Match[1])}</h3>);
      continue;
    }
    
    const h2Match = line.match(/^## (.+)/);
    if (h2Match) {
      flushList();
      elements.push(<h2 key={`h2-${i}`} className="text-base font-semibold text-foreground mt-3 mb-2">{renderInline(h2Match[1])}</h2>);
      continue;
    }
    
    const h1Match = line.match(/^# (.+)/);
    if (h1Match) {
      flushList();
      elements.push(<h1 key={`h1-${i}`} className="text-lg font-bold text-foreground mt-4 mb-2">{renderInline(h1Match[1])}</h1>);
      continue;
    }
    
    // Blockquote
    const blockquoteMatch = line.match(/^> (.+)/);
    if (blockquoteMatch) {
      flushList();
      elements.push(
        <blockquote key={`bq-${i}`} className="border-l-2 border-primary/50 pl-3 italic text-muted-foreground my-2">
          {renderInline(blockquoteMatch[1])}
        </blockquote>
      );
      continue;
    }
    
    // Horizontal rule
    if (line.match(/^[-*_]{3,}$/)) {
      flushList();
      elements.push(<hr key={`hr-${i}`} className="border-border my-3" />);
      continue;
    }
    
    // Unordered list
    const ulMatch = line.match(/^[*-] (.+)/);
    if (ulMatch) {
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
      }
      listItems.push(ulMatch[1]);
      continue;
    }
    
    // Ordered list
    const olMatch = line.match(/^\d+\. (.+)/);
    if (olMatch) {
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
      }
      listItems.push(olMatch[1]);
      continue;
    }
    
    // Empty line
    if (line.trim() === '') {
      flushList();
      continue;
    }
    
    // Regular paragraph
    flushList();
    elements.push(
      <p key={`p-${i}`} className="text-sm text-foreground/90 mb-2 leading-relaxed">
        {renderInline(line)}
      </p>
    );
  }
  
  // Flush any remaining list
  flushList();
  
  // Flush any remaining code block
  if (inCodeBlock && codeBlockContent.length > 0) {
    elements.push(
      <pre key="code-final" className="bg-muted p-3 rounded-lg overflow-x-auto mb-2 text-xs font-mono">
        {codeBlockContent.join('\n')}
      </pre>
    );
  }
  
  return <div className="prose prose-sm dark:prose-invert max-w-none">{elements}</div>;
}

// Types for parsed JSON data
interface DataItem {
  [key: string]: unknown;
}

interface ParsedData {
  type: 'array' | 'object' | 'primitive';
  entityType: EntityType | null;
  data: DataItem[] | DataItem | unknown;
  columns: string[];
}

type EntityType = 'activity' | 'opportunity' | 'account' | 'contact' | 'product' | 'order' | 'unknown';

// Entity detection patterns
const entityPatterns: Record<EntityType, string[]> = {
  activity: ['activity', 'activities', 'visit', 'visits', 'task', 'tasks', 'meeting', 'meetings', 'call', 'calls', 'scheduleddate', 'draftstatusKey', 'typeKey'],
  opportunity: ['opportunity', 'opportunities', 'deal', 'deals', 'pipeline', 'stageKey', 'totalamount', 'expectedclosedate', 'confidence'],
  account: ['account', 'accounts', 'customer', 'customers', 'client', 'clients', 'company', 'companies', 'tierKey', 'creditstatusKey', 'regionKey'],
  contact: ['contact', 'contacts', 'person', 'people', 'employee', 'employees'],
  product: ['product', 'products', 'item', 'items', 'sku', 'inventory'],
  order: ['order', 'orders', 'invoice', 'invoices', 'purchase'],
  unknown: [],
};

// Entity icons
const entityIcons: Record<EntityType, typeof Building2> = {
  activity: Calendar,
  opportunity: Target,
  account: Building2,
  contact: Users,
  product: Package,
  order: FileText,
  unknown: FileText,
};

// Field display name mapping
const fieldDisplayNames: Record<string, Record<string, string>> = {
  'en-US': {
    id: 'ID',
    name1: 'Name',
    title: 'Title',
    account: 'Account',
    opportunity: 'Opportunity',
    scheduleddate: 'Scheduled Date',
    createdon: 'Created On',
    closedon: 'Closed On',
    expectedclosedate: 'Expected Close',
    totalamount: 'Amount',
    confidence: 'Confidence',
    stageKey: 'Stage',
    draftstatusKey: 'Status',
    typeKey: 'Type',
    outcomeKey: 'Outcome',
    ownerid: 'Owner',
    notes: 'Notes',
    address: 'Address',
    phone: 'Phone',
    email: 'Email',
    industry: 'Industry',
    tierKey: 'Tier',
    regionKey: 'Region',
    lastcontactedon: 'Last Contacted',
    blocker: 'Blocker',
    lastaction: 'Last Action',
  },
  'zh-Hans': {
    id: 'ID',
    name1: '名称',
    title: '标题',
    account: '客户',
    opportunity: '商机',
    scheduleddate: '计划日期',
    createdon: '创建时间',
    closedon: '关闭时间',
    expectedclosedate: '预计成交',
    totalamount: '金额',
    confidence: '信心度',
    stageKey: '阶段',
    draftstatusKey: '状态',
    typeKey: '类型',
    outcomeKey: '结果',
    ownerid: '负责人',
    notes: '备注',
    address: '地址',
    phone: '电话',
    email: '邮箱',
    industry: '行业',
    tierKey: '等级',
    regionKey: '区域',
    lastcontactedon: '最后联系',
    blocker: '障碍',
    lastaction: '最近动作',
  },
};

// Key label mappings for enum values
const keyLabelMappings: Record<string, Record<string, string>> = {
  stageKey: {
    Stagekey0: 'Prospecting',
    Stagekey1: 'Qualification',
    Stagekey2: 'Proposal',
    Stagekey3: 'Negotiation',
    Stagekey4: 'Won',
    Stagekey5: 'Lost',
  },
  draftstatusKey: {
    Draftstatuskey0: 'Draft',
    Draftstatuskey1: 'Confirmed',
    Draftstatuskey2: 'Completed',
    Draftstatuskey3: 'Cancelled',
  },
  typeKey: {
    Typekey0: 'Visit',
    Typekey1: 'Call',
    Typekey2: 'Meeting',
    Typekey3: 'Email',
    Typekey4: 'Other',
  },
  outcomeKey: {
    Outcomekey0: '成功',
    Outcomekey1: '拖延',
    Outcomekey2: '人员变动',
    Outcomekey3: '承诺后推迟',
    Outcomekey4: '无结果',
  },
  tierKey: {
    Tierkey0: 'S',
    Tierkey1: 'A',
    Tierkey2: 'B',
    Tierkey3: 'C',
  },
  regionKey: {
    Regionkey0: '华东',
    Regionkey1: '华北',
    Regionkey2: '华南',
    Regionkey3: '西南',
  },
  confidencetrendKey: {
    Confidencetrendkey0: '↑',
    Confidencetrendkey1: '↓',
    Confidencetrendkey2: '→',
  },
};

// Try to parse JSON from content
export function tryParseJson(content: string): { isJson: boolean; data: unknown; isEmpty: boolean } {
  const trimmed = content.trim();
  
  // Check if it looks like JSON
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
    return { isJson: false, data: null, isEmpty: false };
  }
  
  try {
    const parsed = JSON.parse(trimmed);
    
    // Verify it's actually data (not just a simple string/number)
    if (typeof parsed === 'object' && parsed !== null) {
      // Check if it's an array
      if (Array.isArray(parsed)) {
        // Empty array - return isEmpty flag
        if (parsed.length === 0) return { isJson: true, data: parsed, isEmpty: true };
        // Check if items are objects (not primitives)
        if (typeof parsed[0] !== 'object' || parsed[0] === null) return { isJson: false, data: null, isEmpty: false };
        return { isJson: true, data: parsed, isEmpty: false };
      }
      // Single object - check if empty or just has message/error property
      const keys = Object.keys(parsed);
      // Empty object - return isEmpty flag
      if (keys.length === 0) return { isJson: true, data: parsed, isEmpty: true };
      // If it's just a simple message object, treat as non-JSON
      if (keys.length === 1 && (keys[0] === 'message' || keys[0] === 'error')) {
        return { isJson: false, data: null, isEmpty: false };
      }
      return { isJson: true, data: parsed, isEmpty: false };
    }
    return { isJson: false, data: null, isEmpty: false };
  } catch {
    return { isJson: false, data: null, isEmpty: false };
  }
}

// Detect entity type from data
function detectEntityType(data: unknown): EntityType {
  const jsonStr = JSON.stringify(data).toLowerCase();
  
  for (const [entityType, patterns] of Object.entries(entityPatterns)) {
    if (entityType === 'unknown') continue;
    for (const pattern of patterns) {
      if (jsonStr.includes(pattern.toLowerCase())) {
        return entityType as EntityType;
      }
    }
  }
  
  return 'unknown';
}

// Parse and analyze JSON data
function parseData(data: unknown): ParsedData {
  if (Array.isArray(data)) {
    const entityType = detectEntityType(data);
    const columns = data.length > 0 && typeof data[0] === 'object' && data[0] !== null
      ? Object.keys(data[0] as object)
      : [];
    return {
      type: 'array',
      entityType,
      data: data as DataItem[],
      columns,
    };
  } else if (typeof data === 'object' && data !== null) {
    const entityType = detectEntityType(data);
    const columns = Object.keys(data as object);
    return {
      type: 'object',
      entityType,
      data: data as DataItem,
      columns,
    };
  }
  
  return {
    type: 'primitive',
    entityType: null,
    data,
    columns: [],
  };
}

// Priority columns to show first - expanded for more common field patterns
const priorityColumns = [
  'name1', 'name', 'title', 'subject', 'label', 'displayName', 'display_name',
  'id', 'accountId', 'account_id', 'account',
  'opportunity', 'opportunityId', 'opportunity_id',
  'totalamount', 'amount', 'value', 'price', 'total',
  'confidence', 'probability',
  'stageKey', 'stage', 'status', 'state', 'draftstatusKey',
  'scheduleddate', 'date', 'dueDate', 'due_date', 'expectedclosedate', 'close_date',
  'description', 'notes', 'details'
];

// Columns to hide
const hiddenColumns = ['ownerid', 'createdon', 'modifiedon', 'createdBy', 'modifiedBy'];

// Format cell value for display
function formatCellValue(key: string, value: unknown, locale: Locale): string {
  if (value === null || value === undefined) return '-';
  
  // Handle nested objects (like account, opportunity references)
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if ('name1' in obj) return String(obj.name1);
    if ('title' in obj) return String(obj.title);
    if ('id' in obj) return String(obj.id).slice(0, 8) + '...';
    return JSON.stringify(value);
  }
  
  // Handle key mappings
  if (key.endsWith('Key') && typeof value === 'string') {
    const mapping = keyLabelMappings[key];
    if (mapping && mapping[value]) {
      return mapping[value];
    }
  }
  
  // Handle dates
  if (key.includes('date') || key.includes('on') || key === 'createdon' || key === 'closedon') {
    const dateStr = String(value);
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString(locale === 'zh-Hans' ? 'zh-CN' : 'en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
      }
    } catch {
      // Not a valid date
    }
  }
  
  // Handle amounts
  if (key === 'totalamount' || key.includes('amount') || key.includes('price')) {
    const num = Number(value);
    if (!isNaN(num)) {
      return '¥' + num.toLocaleString();
    }
  }
  
  // Handle confidence percentage
  if (key === 'confidence') {
    return `${value}%`;
  }
  
  return String(value);
}

// Get navigation path for entity
function getNavigationPath(entityType: EntityType, item: DataItem): string | null {
  // Try to find an id field from various common patterns
  const id = (item.id || item.Id || item.ID || item.opportunityId || item.accountId || item.activityId) as string | undefined;
  
  switch (entityType) {
    case 'activity': {
      // Navigate to activity detail (via account if available)
      const accountRef = item.account as { id?: string } | undefined;
      const accountId = accountRef?.id || item.accountId || item.account_id;
      if (accountId) {
        return `/activity/${accountId}`;
      }
      // If we have the activity id, pass it as state
      if (id) {
        return `/activity-capture`;
      }
      return `/activity-capture`;
    }
    case 'opportunity': {
      // Navigate to opportunity review with the specific opportunity
      if (id) {
        return `/opportunity-review`;
      }
      return `/opportunity-review`;
    }
    case 'account': {
      if (id) {
        return `/accounts/${id}`;
      }
      return `/accounts`;
    }
    case 'contact':  
      return id ? `/contacts/${id}` : `/contacts`;
    default:
      // For unknown types, try to navigate based on available data
      if (id) {
        // Check if data suggests it's an opportunity
        if ('stageKey' in item || 'totalamount' in item || 'confidence' in item) {
          return `/opportunity-review`;
        }
        if ('scheduleddate' in item || 'draftstatusKey' in item) {
          return `/activity-capture`;
        }
      }
      return null;
  }
}

// Stage badge colors
const stageBadgeColors: Record<string, string> = {
  Stagekey0: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Stagekey1: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  Stagekey2: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  Stagekey3: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  Stagekey4: 'bg-green-500/20 text-green-400 border-green-500/30',
  Stagekey5: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const statusBadgeColors: Record<string, string> = {
  Draftstatuskey0: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  Draftstatuskey1: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Draftstatuskey2: 'bg-green-500/20 text-green-400 border-green-500/30',
  Draftstatuskey3: 'bg-red-500/20 text-red-400 border-red-500/30',
};

interface DynamicDataRendererProps {
  content: string;
}

export function DynamicDataRenderer({ content }: DynamicDataRendererProps) {
  const navigate = useNavigate();
  const locale = getLocale();
  const { closePanel } = useCopilot();
  
  const parsedResult = useMemo(() => {
    const { isJson, data } = tryParseJson(content);
    if (!isJson || !data) return null;
    return parseData(data);
  }, [content]);
  
  // Sort columns by priority - must be called unconditionally
  const sortedColumns = useMemo(() => {
    if (!parsedResult || parsedResult.type === 'primitive') return [];
    return parsedResult.columns
      .filter((col: string) => !hiddenColumns.includes(col))
      .sort((a: string, b: string) => {
        const aIdx = priorityColumns.indexOf(a);
        const bIdx = priorityColumns.indexOf(b);
        if (aIdx === -1 && bIdx === -1) return 0;
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        return aIdx - bIdx;
      })
      .slice(0, 5); // Limit to 5 columns for mobile
  }, [parsedResult]);
  
  // If not JSON, render as markdown text
  // If not JSON, render as markdown text
  if (!parsedResult || parsedResult.type === 'primitive') {
    return <SimpleMarkdown content={content} />;
  }
  
  const { entityType, data } = parsedResult;
  const resolvedEntityType: EntityType = entityType || 'unknown';
  const Icon = entityIcons[resolvedEntityType];
  
  // Handle item click - collapse panel smoothly then navigate
  const handleItemClick = (item: DataItem) => {
    const path = getNavigationPath(resolvedEntityType, item);
    if (path) {
      // Smoothly collapse the copilot panel first
      closePanel();
      // Pass the full item data and opportunityId if available
      const opportunityId = (item.id || item.Id || item.opportunityId) as string | undefined;
      // Small delay to allow panel collapse animation to start
      setTimeout(() => {
        navigate(path, { state: { item, opportunityId } });
      }, 150);
    }
  };
  
  // Render a single item card (for both array items and single object)
  // Render a single item card (for both array items and single object)
  const renderItemCard = (item: DataItem, index: number) => {
    const path = getNavigationPath(resolvedEntityType, item);
    const isClickable = !!path;
    
    // Get primary display value - try many common field names
    const primaryValue = (
      item.name1 || item.name || item.title || item.subject || 
      item.label || item.displayName || item.display_name ||
      item.accountName || item.account_name ||
      item.opportunityName || item.opportunity_name ||
      (typeof item.account === 'object' && item.account !== null ? (item.account as Record<string, unknown>).name1 || (item.account as Record<string, unknown>).name : null) ||
      item.id || '-'
    ) as string;
    
    // Get secondary info based on entity type
    let secondaryInfo: React.ReactNode = null;
    if (resolvedEntityType === 'opportunity') {
      const amount = item.totalamount || item.amount || item.value;
      const amountStr = amount ? `¥${Number(amount).toLocaleString()}` : '';
      const confidence = item.confidence || item.probability;
      const confidenceStr = confidence ? `${confidence}%` : '';
      const stage = (item.stageKey || item.stage || item.status) as string | undefined;
      secondaryInfo = (
        <div className="flex items-center gap-2 mt-1">
          {amountStr && <span className="text-xs font-medium text-primary">{amountStr}</span>}
          {confidenceStr && <span className="text-xs text-muted-foreground">• {confidenceStr}</span>}
          {stage && (
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded border',
              stageBadgeColors[stage] || 'bg-muted text-muted-foreground'
            )}>
              {keyLabelMappings.stageKey?.[stage] || stage}
            </span>
          )}
        </div>
      );
    } else if (resolvedEntityType === 'activity') {
      const accountObj = item.account as { name1?: string; name?: string } | undefined;
      const accountName = String(accountObj?.name1 || accountObj?.name || item.accountName || '');
      const status = (item.draftstatusKey || item.status || item.state) as string | undefined;
      const dateValue = item.scheduleddate || item.date || item.dueDate;
      const dateStr = dateValue ? formatCellValue('scheduleddate', dateValue, locale) : '';
      secondaryInfo = (
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {accountName && <span className="text-xs text-muted-foreground">{accountName}</span>}
          {dateStr && <span className="text-xs text-muted-foreground">• {dateStr}</span>}
          {status && (
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded border',
              statusBadgeColors[status] || 'bg-muted text-muted-foreground'
            )}>
              {keyLabelMappings.draftstatusKey?.[status] || status}
            </span>
          )}
        </div>
      );
    } else if (resolvedEntityType === 'account') {
      const tier = (item.tierKey || item.tier) as string | undefined;
      const region = (item.regionKey || item.region) as string | undefined;
      const industryValue = typeof item.industry === 'string' ? item.industry : null;
      secondaryInfo = (
        <div className="flex items-center gap-2 mt-1">
          {tier && <span className="text-xs font-medium text-primary">{keyLabelMappings.tierKey?.[tier] || tier}</span>}
          {region && <span className="text-xs text-muted-foreground">• {keyLabelMappings.regionKey?.[region] || region}</span>}
          {industryValue && <span className="text-xs text-muted-foreground">• {industryValue}</span>}
        </div>
      );
    } else {
      // Generic secondary info - show first few non-id fields that have values
      const infoFields = sortedColumns
        .filter((col: string) => col !== 'id' && col !== 'name1' && col !== 'title' && col !== 'name')
        .slice(0, 3);
      const displayValues = infoFields
        .map((col: string) => ({ col, value: item[col] }))
        .filter(({ value }) => value !== null && value !== undefined && value !== '');
      
      if (displayValues.length > 0) {
        secondaryInfo = (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {displayValues.map(({ col, value }, idx: number) => (
              <span key={col} className="text-xs text-muted-foreground">
                {idx > 0 && '• '}{formatCellValue(col, value, locale)}
              </span>
            ))}
          </div>
        );
      }
    }
    
    return (
      <motion.div
        key={String(item.id) || String(index)}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05, duration: 0.2 }}
        onClick={() => isClickable && handleItemClick(item)}
        className={cn(
          'p-3 rounded-xl border border-border/50 bg-muted/30',
          isClickable && 'cursor-pointer hover:bg-muted/50 hover:border-border active:scale-[0.98] transition-all'
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{primaryValue}</p>
              {secondaryInfo}
            </div>
          </div>
          {isClickable && (
            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
          )}
        </div>
      </motion.div>
    );
  };
  
  // Render array data as list
  if (parsedResult.type === 'array') {
    const items = data as DataItem[];
    const itemCount = items.length;
    const entityLabel = resolvedEntityType !== 'unknown' 
      ? (resolvedEntityType.charAt(0).toUpperCase() + resolvedEntityType.slice(1) + 's') 
      : 'Data';
    
    return (
      <div className="space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-foreground">
              {locale === 'zh-Hans' ? `${itemCount} 条记录` : `${itemCount} records`}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {entityLabel}
          </span>
        </div>
        
        {/* Items */}
        <div className="space-y-2">
          {items.slice(0, 10).map((item: DataItem, idx: number) => renderItemCard(item, idx))}
          {items.length > 10 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              {locale === 'zh-Hans' ? `还有 ${items.length - 10} 条记录...` : `And ${items.length - 10} more...`}
            </p>
          )}
        </div>
      </div>
    );
  }
  
  // Render single object as detail card
  if (parsedResult.type === 'object') {
    return renderItemCard(data as DataItem, 0);
  }
  
  return null;
}

export default DynamicDataRenderer;
