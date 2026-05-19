import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Users,
  Briefcase,
  Calendar,
  Package,
  Target,
  FileText,
  MessageSquare,
  ClipboardList,
  TrendingUp,
  Search,
  Plus,
  Pencil,
  Trash2,
  Filter,
  BarChart3,
  RefreshCw,
  Zap,
  Sparkles,
  Brain,
  ChevronDown,
  ChevronRight,
  Info,
  Lightbulb,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useLocale, type Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useFirstMount } from '@/hooks/use-first-mount';

interface SkillGroup {
  id: string;
  name: string;
  nameZh: string;
  icon: React.ElementType;
  description: string;
  descriptionZh: string;
  skills: Skill[];
}

interface Skill {
  id: string;
  name: string;
  nameZh: string;
  description: string;
  descriptionZh: string;
  voiceExamples?: string[];
  voiceExamplesZh?: string[];
}

// Based on actual function-registry.ts and function-executor.ts implementations
const skillGroups: SkillGroup[] = [
  {
    id: 'multi-intent',
    name: 'Multi-Intent Intelligence',
    nameZh: '多意图智能识别',
    icon: Sparkles,
    description: 'Automatically extracts multiple intents from a single natural language statement and creates corresponding records',
    descriptionZh: '从单条自然语言描述中自动提取多个意图并创建相应记录',
    skills: [
      {
        id: 'multiIntentExtraction',
        name: 'Smart Intent Extraction',
        nameZh: '智能意图提取',
        description: 'Analyzes natural language to identify multiple implicit intents: activity logging, opportunity discovery, and follow-up scheduling. Automatically generates batch drafts for all detected intents.',
        descriptionZh: '分析自然语言以识别多个隐含意图：活动记录、商机发现和后续安排。自动为所有检测到的意图生成批量草稿。',
        voiceExamples: [
          'I visited King\'s College Hospital and discussed OR procurement, they\'re looking for new devices and will open bidding soon. We\'ll introduce the new product next week.',
          'Met with Dr. Smith at Royal London about the ICU upgrade - $2M budget, decision by June. Need to send proposal by Friday.',
          'Called Charité about the monitoring system demo. They want to schedule a site visit and bring their IT team.',
        ],
        voiceExamplesZh: [
          '我拜访了King\'s College Hospital，讨论了手术室采购，他们需要新设备并即将招标。下周我们要介绍新产品。',
          '在Royal London与Smith医生会面讨论ICU升级 - 200万预算，6月前决定。需要周五前发送提案。',
          '给Charité打电话讨论监护系统演示。他们想安排现场参观并带IT团队。',
        ],
      },
      {
        id: 'activityInformationExtraction',
        name: 'Complete Activity Information Extraction',
        nameZh: '活动完整信息提取',
        description: 'When logging an activity, Agent scans for: A) Basic associations (Account, Contact, existing Opportunity); B) Opportunity signals (purchase intent, budget, timeline, product interest) -> creates Opportunity draft; C) Follow-up plans (next visit, materials to send, demo) -> creates follow-up Activity draft; D) New contacts mentioned (decision makers, key contacts) -> creates Contact draft.',
        descriptionZh: '记录活动时，Agent扫描：A) 基础关联（客户、联系人、已有商机）；B) 商机信号（采购意向、预算、时间线、产品兴趣）-> 创建商机草稿；C) 跟进计划（下次拜访、要发送的资料、演示）-> 创建跟进活动草稿；D) 提到的新联系人（决策者、关键联系人）-> 创建联系人草稿。',
        voiceExamples: [
          "I visited King's Hospital today, met with Dr. Chen the new CMO. We discussed their ICU upgrade project, they have a budget of 2M and plan to decide in Q3. I'll arrange a product demo next Tuesday.",
        ],
        voiceExamplesZh: [
          '今天拜访了King\'s医院，见了新任CMO陈医生。讨论了ICU升级项目，预算200万，计划Q3决定。我下周二安排产品演示。',
        ],
      },
      {
        id: 'updateWithMultiIntent',
        name: 'Update with Multi-Intent Extraction',
        nameZh: '更新时多意图提取',
        description: 'When updating records (marking activities complete, updating opportunities), Agent also extracts additional intents. Example: "mark this meeting as completed, customer is interested, will arrange demo next Monday" triggers: 1) Update activity to completed, 2) Draft opportunity (interest signal), 3) Draft follow-up activity (demo).',
        descriptionZh: '更新记录时（标记活动完成、更新商机），Agent同样提取额外意图。例如："将会议标记为完成，客户感兴趣，下周一安排演示"会触发：1）更新活动为已完成，2）草拟商机（兴趣信号），3）草拟跟进活动（演示）。',
        voiceExamples: [
          'Mark this meeting as completed. Customer showed strong interest. Schedule demo for next Wednesday.',
        ],
        voiceExamplesZh: [
          '将会议标记为完成。客户表现出强烈兴趣。安排下周三演示。',
        ],
      },
      {
        id: 'batchDraft',
        name: 'Batch Record Creation',
        nameZh: '批量记录创建',
        description: 'Creates multiple draft records (activities, opportunities, contacts) in a single operation. Shows a combined form card for reviewing all drafts before saving.',
        descriptionZh: '在单次操作中创建多条草稿记录（活动、商机、联系人）。显示组合表单卡片，在保存前审核所有草稿。',
        voiceExamples: [
          'Create a visit record and a new opportunity for Royal London',
          'Add a meeting note and schedule a follow-up call for next week',
        ],
        voiceExamplesZh: [
          '为Royal London创建拜访记录和新商机',
          '添加会议记录并安排下周的跟进电话',
        ],
      },
    ],
  },
  {
    id: 'accounts',
    name: 'Account Operations',
    nameZh: '客户操作',
    icon: Building2,
    description: 'Query, search, filter, and create customer accounts',
    descriptionZh: '查询、搜索、筛选和创建客户账户',
    skills: [
      {
        id: 'searchAccounts',
        name: 'Search Accounts',
        nameZh: '搜索客户',
        description: 'Search customers/companies by name keyword. Returns matching accounts with industry, region, and tier info.',
        descriptionZh: '按名称关键词搜索客户/公司。返回匹配的客户及其行业、区域和等级信息。',
        voiceExamples: ['Find accounts with "Hospital" in name', 'Search for tech companies', 'Look up Royal London'],
        voiceExamplesZh: ['查找名称含"医院"的客户', '搜索科技公司', '查找Royal London'],
      },
      {
        id: 'getAccountDetails',
        name: 'Account Details',
        nameZh: '客户详情',
        description: 'Get detailed information about a specific account including contacts, opportunities, and activity history.',
        descriptionZh: '获取特定客户的详细信息，包括联系人、商机和活动历史。',
        voiceExamples: ['Show me details for Acme Corp', 'What do we know about this customer?'],
        voiceExamplesZh: ['显示Acme Corp的详情', '我们对这个客户了解多少？'],
      },
      {
        id: 'getAccountsByRegion',
        name: 'Accounts by Region',
        nameZh: '按区域筛选客户',
        description: 'Filter accounts by geographic region. Supported regions: 华东, 华北, 华南, 西南.',
        descriptionZh: '按地理区域筛选客户。支持区域：华东、华北、华南、西南。',
        voiceExamples: ['Show me all accounts in East China', 'Find customers in the South region'],
        voiceExamplesZh: ['显示华东的所有客户', '查找华南区域的客户'],
      },
      {
        id: 'getAccountsByTier',
        name: 'Accounts by Tier',
        nameZh: '按等级筛选客户',
        description: 'Filter accounts by tier level. Supported tiers: S, A, B, C.',
        descriptionZh: '按客户等级筛选。支持等级：S、A、B、C。',
        voiceExamples: ['Show all S-tier accounts', 'Find tier A customers'],
        voiceExamplesZh: ['显示所有S级客户', '查找A级客户'],
      },
      {
        id: 'draftAccount',
        name: 'Draft Account',
        nameZh: '草拟客户',
        description: 'Create a new account draft for user confirmation. Extracts account info from natural language and shows a form card.',
        descriptionZh: '创建新客户草稿供用户确认。从自然语言中提取客户信息并显示表单卡片。',
        voiceExamples: ['Add a new account called Royal Hospital', 'Create account for Beijing Medical Center'],
        voiceExamplesZh: ['添加名为Royal Hospital的新客户', '为北京医疗中心创建客户'],
      },
      {
        id: 'fuzzyMatchAccount',
        name: 'Smart Account Matching',
        nameZh: '智能客户匹配',
        description: 'Fuzzy match account names to find possible duplicates or confirm identity. Uses scoring algorithm with exact, contains, and fuzzy match types.',
        descriptionZh: '模糊匹配客户名称以查找可能的重复或确认身份。使用评分算法，支持精确、包含和模糊匹配类型。',
        voiceExamples: ['Is there an account like "Royal London"?', 'Find accounts similar to Charité'],
        voiceExamplesZh: ['有没有类似"Royal London"的客户？', '查找与Charité类似的客户'],
      },
      {
        id: 'updateAccount',
        name: 'Update Account',
        nameZh: '更新客户',
        description: 'Update an existing account record. Can modify name, industry, region, tier, address, and other fields.',
        descriptionZh: '更新现有客户记录。可修改名称、行业、区域、等级、地址等字段。',
        voiceExamples: ['Update Charité region to East China', 'Change Royal London tier to S', 'Set the account industry to Healthcare'],
        voiceExamplesZh: ['将Charité的区域更新为华东', '将Royal London的等级改为S', '将该客户的行业设为医疗'],
      },
    ],
  },
  {
    id: 'opportunities',
    name: 'Opportunity Operations',
    nameZh: '商机操作',
    icon: Target,
    description: 'Query, filter, and create sales opportunities',
    descriptionZh: '查询、筛选和创建销售商机',
    skills: [
      {
        id: 'getMyOpportunities',
        name: 'My Opportunities',
        nameZh: '我的商机',
        description: 'Get your opportunities, optionally filtered by stage. Stages: prospecting, qualification, proposal, negotiation, won, lost.',
        descriptionZh: '获取您的商机列表，可按阶段筛选。阶段：寻找、资质审核、提案、谈判、赢单、丢单。',
        voiceExamples: ['Show my opportunities', 'What deals are in negotiation?', 'List opportunities in proposal stage'],
        voiceExamplesZh: ['显示我的商机', '哪些交易在谈判中？', '列出提案阶段的商机'],
      },
      {
        id: 'getTopOpportunities',
        name: 'Top Opportunities',
        nameZh: '热门商机',
        description: 'Get the highest value opportunities sorted by total amount.',
        descriptionZh: '获取按金额排序的最高价值商机。',
        voiceExamples: ['Show top 5 opportunities', 'What are our biggest deals?'],
        voiceExamplesZh: ['显示前5个商机', '我们最大的交易是什么？'],
      },
      {
        id: 'getOpportunitiesByAccount',
        name: 'Account Opportunities',
        nameZh: '客户商机',
        description: 'Get all opportunities for a specific customer account.',
        descriptionZh: '获取特定客户的所有商机。',
        voiceExamples: ['Show opportunities for Royal London', 'What deals do we have with Charité?'],
        voiceExamplesZh: ['显示Royal London的商机', '我们与Charité有哪些交易？'],
      },
      {
        id: 'getOpportunitiesClosingSoon',
        name: 'Closing Soon',
        nameZh: '即将成交',
        description: 'Get opportunities with expected close dates in the next N days (default 7).',
        descriptionZh: '获取预计在未来N天（默认7天）内关闭的商机。',
        voiceExamples: ['What deals are closing this week?', 'Show opportunities closing in 30 days'],
        voiceExamplesZh: ['本周有哪些交易要关闭？', '显示30天内关闭的商机'],
      },
      {
        id: 'draftOpportunity',
        name: 'Draft Opportunity',
        nameZh: '草拟商机',
        description: 'Create a new opportunity draft from natural language. Shows form card for user confirmation before saving.',
        descriptionZh: '从自然语言创建新商机草稿。保存前显示表单卡片供用户确认。',
        voiceExamples: ['Create an opportunity for Royal London ICU project', 'Add a new deal worth 500k'],
        voiceExamplesZh: ['为Royal London ICU项目创建商机', '添加价值50万的新交易'],
      },
      {
        id: 'updateOpportunity',
        name: 'Update Opportunity',
        nameZh: '更新商机',
        description: 'Update an existing opportunity record. Stage options: qualification, proposal, negotiation, closed_won, closed_lost ("win"/"won"/"success" = "closed_won", "lose"/"lost" = "closed_lost"). On Opportunity detail page, automatically uses current opportunity ID from pageData.',
        descriptionZh: '更新现有商机记录。阶段选项：qualification、proposal、negotiation、closed_won、closed_lost（"win"/"won"/"success"="closed_won"，"lose"/"lost"="closed_lost"）。在商机详情页时自动从 pageData 获取商机ID。',
        voiceExamples: ['Mark this opportunity as won', 'Update the revenue to 300k', 'Move this deal to negotiation stage'],
        voiceExamplesZh: ['标记这个商机为赢单', '将金额更新为30万', '将这笔交易移到谈判阶段'],
      },
      {
        id: 'fuzzyMatchOpportunity',
        name: 'Smart Opportunity Matching',
        nameZh: '智能商机匹配',
        description: 'Fuzzy match opportunity names to find existing deals or detect duplicates.',
        descriptionZh: '模糊匹配商机名称以查找现有交易或检测重复。',
        voiceExamples: ['Find the ICU monitoring project', 'Is there an opportunity called BeneVision?'],
        voiceExamplesZh: ['查找ICU监护项目', '有没有叫BeneVision的商机？'],
      },
    ],
  },
  {
    id: 'activities',
    name: 'Activity Operations',
    nameZh: '活动操作',
    icon: Calendar,
    description: 'Track, log, and manage sales activities like visits, calls, and meetings',
    descriptionZh: '追踪、记录和管理销售活动，如拜访、电话和会议',
    skills: [
      {
        id: 'getTodayActivities',
        name: "Today's Activities",
        nameZh: '今日活动',
        description: 'Get activities scheduled for today. Can filter by type: visit, call, meeting, email, other.',
        descriptionZh: '获取今天安排的活动。可按类型筛选：拜访、电话、会议、邮件、其他。',
        voiceExamples: ['What\'s on my schedule today?', 'Show today\'s meetings', 'Any visits planned for today?'],
        voiceExamplesZh: ['今天有什么安排？', '显示今天的会议', '今天有安排拜访吗？'],
      },
      {
        id: 'getUpcomingActivities',
        name: 'Upcoming Activities',
        nameZh: '近期活动',
        description: 'Get activities scheduled for the next N days (default 7).',
        descriptionZh: '获取未来N天（默认7天）安排的活动。',
        voiceExamples: ['What\'s coming up this week?', 'Show my schedule for the next 3 days'],
        voiceExamplesZh: ['这周有什么安排？', '显示未来3天的日程'],
      },
      {
        id: 'getActivitiesByAccount',
        name: 'Account Activities',
        nameZh: '客户活动',
        description: 'Get all activity history for a specific customer account.',
        descriptionZh: '获取特定客户的所有活动历史。',
        voiceExamples: ['Show activities for Royal London', 'What meetings have we had with Charité?'],
        voiceExamplesZh: ['显示Royal London的活动', '我们与Charité有过哪些会议？'],
      },
      {
        id: 'updateActivity',
        name: 'Update Activity',
        nameZh: '更新活动',
        description: 'Update an existing activity record. Status options: draft, confirmed, completed, cancelled ("done" = "completed"). On Activity detail page, automatically uses current activity ID from pageData. Preserves opportunity binding. Can trigger multi-intent extraction for additional actions.',
        descriptionZh: '更新现有活动记录。状态选项：draft、confirmed、completed、cancelled（"done"="completed"）。在活动详情页时自动从 pageData 获取活动ID。保持商机绑定。可触发多意图提取创建额外操作。',
        voiceExamples: ['Mark this activity as done', 'Complete today\'s visit', 'Cancel this meeting'],
        voiceExamplesZh: ['标记这个活动为完成', '完成今天的拜访', '取消这个会议'],
      },
      {
        id: 'draftActivity',
        name: 'Draft Activity',
        nameZh: '草拟活动',
        description: 'Create a new activity draft from natural language description. Automatically matches account names to existing records. Shows form card for review. Generates meaningful titles using context (account name + topic). Supports visit, call, meeting, email, other.',
        descriptionZh: '从自然语言描述创建新活动草稿。自动匹配账户名称到现有记录。显示表单卡片供审核。使用上下文生成有意义的标题（客户名+主题）。支持拜访、电话、会议、邮件、其他。',
        voiceExamples: ['I visited King\'s College Hospital and discussed OR procurement', 'Plan a visit to Royal London next week', 'Log today\'s call with Dr. Smith', 'Record my meeting about the ICU project'],
        voiceExamplesZh: ['我拜访了King\'s College Hospital，讨论了手术室采购', '计划下周拜访Royal London', '记录今天与Smith医生的电话', '记录关于ICU项目的会议'],
      },
      {
        id: 'fuzzyMatchActivity',
        name: 'Smart Activity Matching',
        nameZh: '智能活动匹配',
        description: 'Detect potential duplicate activities by matching title/description. Used to prevent creating duplicate visit records.',
        descriptionZh: '通过匹配标题/描述检测可能重复的活动。用于防止创建重复的拜访记录。',
        voiceExamples: ['Did I already log a visit to Royal London today?'],
        voiceExamplesZh: ['我今天已经记录了Royal London的拜访吗？'],
      },
    ],
  },
  {
    id: 'contacts',
    name: 'Contact Operations',
    nameZh: '联系人操作',
    icon: Users,
    description: 'Query and create contacts at customer accounts',
    descriptionZh: '查询和创建客户账户的联系人',
    skills: [
      {
        id: 'updateContact',
        name: 'Update Contact',
        nameZh: '更新联系人',
        description: 'Update an existing contact record. Can modify name, title, phone, email, and other fields.',
        descriptionZh: '更新现有联系人记录。可修改姓名、职位、电话、邮箱等字段。',
        voiceExamples: ['Update Dr. Smith\'s phone number', 'Change contact title to Department Director', 'Update Zhang Wei\'s email address'],
        voiceExamplesZh: ['更新Smith医生的电话号码', '将联系人职位改为科室主任', '更新张伟的邮箱地址'],
      },
      {
        id: 'getContactsByAccount',
        name: 'Account Contacts',
        nameZh: '客户联系人',
        description: 'Get all contacts for a specific customer account with name, title, phone, and email.',
        descriptionZh: '获取特定客户的所有联系人，包括姓名、职位、电话和邮箱。',
        voiceExamples: ['Who are the contacts at Royal London?', 'Show me people at Charité'],
        voiceExamplesZh: ['Royal London有哪些联系人？', '显示Charité的人员'],
      },
      {
        id: 'draftContact',
        name: 'Draft Contact',
        nameZh: '草拟联系人',
        description: 'Create a new contact draft from natural language. Extracts name, title, phone, email, and associated account.',
        descriptionZh: '从自然语言创建新联系人草稿。提取姓名、职位、电话、邮箱和关联客户。',
        voiceExamples: ['Add Dr. Smith as a contact at Royal London', 'Create contact for Zhang Wei, ICU Director'],
        voiceExamplesZh: ['将Smith医生添加为Royal London的联系人', '为张伟创建联系人，ICU主任'],
      },
      {
        id: 'fuzzyMatchContact',
        name: 'Smart Contact Matching',
        nameZh: '智能联系人匹配',
        description: 'Fuzzy match contact names to find existing contacts or detect duplicates. Can filter by account.',
        descriptionZh: '模糊匹配联系人姓名以查找现有联系人或检测重复。可按客户筛选。',
        voiceExamples: ['Find Dr. Smith', 'Is there a contact named Zhang?'],
        voiceExamplesZh: ['查找Smith医生', '有没有叫张的联系人？'],
      },
    ],
  },
  {
    id: 'batch',
    name: 'Batch Operations',
    nameZh: '批量操作',
    icon: ClipboardList,
    description: 'Create multiple records in a single request',
    descriptionZh: '在单个请求中创建多个记录',
    skills: [
      {
        id: 'batchDraft',
        name: 'Batch Draft',
        nameZh: '批量草拟',
        description: 'Create multiple records (accounts, contacts, activities, opportunities) in one request. Each record shows as a separate form card for confirmation.',
        descriptionZh: '在一个请求中创建多个记录（客户、联系人、活动、商机）。每个记录显示为单独的表单卡片供确认。',
        voiceExamples: ['Add an account and a contact for Royal Hospital', 'Create two activities for today'],
        voiceExamplesZh: ['为Royal Hospital添加一个客户和一个联系人', '为今天创建两条活动'],
      },
    ],
  },
  {
    id: 'analytics',
    name: 'Analytics & Insights',
    nameZh: '分析与洞察',
    icon: BarChart3,
    description: 'Get sales summaries and identify accounts needing attention',
    descriptionZh: '获取销售摘要并识别需要关注的客户',
    skills: [
      {
        id: 'getSalesSummary',
        name: 'Sales Summary',
        nameZh: '销售摘要',
        description: 'Get overall sales statistics: total opportunities, total amount, average amount, and breakdown by stage.',
        descriptionZh: '获取整体销售统计：商机总数、总金额、平均金额和按阶段细分。',
        voiceExamples: ['Give me a sales summary', 'What\'s our pipeline looking like?', 'How much in total opportunities?'],
        voiceExamplesZh: ['给我销售摘要', '我们的管道情况如何？', '商机总金额是多少？'],
      },
      {
        id: 'getAccountsNeedingFollowUp',
        name: 'Accounts Needing Follow-up',
        nameZh: '待跟进客户',
        description: 'Get accounts that haven\'t been contacted in N days (default 7). Helps identify neglected customers.',
        descriptionZh: '获取N天（默认7天）未联系的客户。帮助识别被忽略的客户。',
        voiceExamples: ['Which accounts need follow-up?', 'Show customers not contacted in 30 days'],
        voiceExamplesZh: ['哪些客户需要跟进？', '显示30天未联系的客户'],
      },
    ],
  },
  {
    id: 'knowledge',
    name: 'Knowledge & External Queries',
    nameZh: '知识与外部查询',
    icon: Brain,
    description: 'Query product knowledge base and external information sources',
    descriptionZh: '查询产品知识库和外部信息源',
    skills: [
      {
        id: 'queryCopilotStudio',
        name: 'Product Knowledge Query',
        nameZh: '产品知识查询',
        description: 'Query product information, knowledge base, and FAQ via Copilot Studio. Use for questions about product records in the system.',
        descriptionZh: '通过Copilot Studio查询产品信息、知识库和FAQ。用于询问系统中产品记录的问题。',
        voiceExamples: ['Which customers use BeneVision?', 'Tell me about our monitoring products'],
        voiceExamplesZh: ['哪些客户使用BeneVision？', '告诉我关于我们监护产品的信息'],
      },
      {
        id: 'externalKnowledgeQuery',
        name: 'External Knowledge Query',
        nameZh: '外部知识查询',
        description: 'Query external knowledge for general product specs, technical principles, industry information not covered by local database.',
        descriptionZh: '查询外部知识，获取本地数据库未涵盖的通用产品规格、技术原理、行业信息。',
        voiceExamples: ['What is the technical spec for N22?', 'Explain ECG monitoring principles'],
        voiceExamplesZh: ['N22的技术规格是什么？', '解释心电监护原理'],
      },
    ],
  },
  {
    id: 'forms',
    name: 'Form Assistance',
    nameZh: '表单辅助',
    icon: FileText,
    description: 'AI-powered form filling from natural language descriptions',
    descriptionZh: 'AI驱动的自然语言表单填充',
    skills: [
      {
        id: 'fillActivityForm',
        name: 'Fill Activity Form',
        nameZh: '填写活动表单',
        description: 'Extract activity information from voice/text description and auto-fill the Activity Capture form. Used on the Activity Capture page.',
        descriptionZh: '从语音/文本描述中提取活动信息并自动填充活动记录表单。在活动记录页面使用。',
        voiceExamples: ['I just met Dr. Wang at Royal London to discuss the ICU project. He\'s interested in our monitoring solution. Next step is to send a proposal.'],
        voiceExamplesZh: ['我刚在Royal London见了王医生，讨论ICU项目。他对我们的监护方案感兴趣。下一步是发送提案。'],
      },
    ],
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
    },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
} as const;

export default function HelpFeedbackPage() {
  const navigate = useNavigate();
  const locale = useLocale();
  const firstMount = useFirstMount('help-feedback');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['accounts']));
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const toggleSkill = (skillId: string) => {
    setExpandedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) {
        next.delete(skillId);
      } else {
        next.add(skillId);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const }}
        className="sticky top-0 z-40 backdrop-blur-xl bg-background/80 border-b border-border/50"
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/settings')} className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-foreground truncate">
              {locale === 'zh-Hans' ? '技能与工具指南' : 'Skills & Tools Guide'}
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              {locale === 'zh-Hans' ? '了解如何使用Sales Copilot的所有功能' : 'Learn how to use all Sales Copilot features'}
            </p>
          </div>
        </div>
      </motion.header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <motion.div
          variants={containerVariants}
          initial={firstMount ? 'hidden' : false}
          animate="show"
          className="p-4 space-y-4 pb-24"
        >
          {/* Introduction Card */}
          <motion.div variants={itemVariants} className="glass-card p-4 rounded-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Lightbulb className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-foreground mb-1">
                  {locale === 'zh-Hans' ? '工作原理' : 'How It Works'}
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {locale === 'zh-Hans'
                    ? 'Sales Copilot 将销售数据组织成相互关联的实体：客户、联系人、商机、活动和产品。每个实体都有专门的技能来帮助您查看、创建和管理数据。AI 功能可以跨实体分析模式，提供智能洞察和建议。'
                    : 'Sales Copilot organizes sales data into interconnected entities: Accounts, Contacts, Opportunities, Activities, and Products. Each entity has dedicated skills to help you view, create, and manage data. AI features analyze patterns across entities to provide intelligent insights and recommendations.'}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Entity Relationship Diagram */}
          <motion.div variants={itemVariants} className="glass-card p-4 rounded-2xl">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Info className="w-4 h-4 text-primary" />
              {locale === 'zh-Hans' ? '数据实体关系' : 'Data Entity Relationships'}
            </h3>
            <div className="bg-muted/30 rounded-xl p-3">
              <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                <span className="px-2 py-1 bg-primary/10 text-primary rounded-lg font-medium flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  {locale === 'zh-Hans' ? '客户' : 'Account'}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                <span className="px-2 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg font-medium flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {locale === 'zh-Hans' ? '联系人' : 'Contact'}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                <span className="px-2 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg font-medium flex items-center gap-1">
                  <Target className="w-3 h-3" />
                  {locale === 'zh-Hans' ? '商机' : 'Opportunity'}
                </span>
              </div>
              <div className="flex justify-center my-2">
                <div className="h-4 w-px bg-border" />
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                <span className="px-2 py-1 bg-green-500/10 text-green-600 dark:text-green-400 rounded-lg font-medium flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {locale === 'zh-Hans' ? '活动' : 'Activity'}
                </span>
                <span className="px-2 py-1 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-lg font-medium flex items-center gap-1">
                  <Package className="w-3 h-3" />
                  {locale === 'zh-Hans' ? '产品' : 'Product'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground text-center mt-3">
                {locale === 'zh-Hans'
                  ? '客户可以有多个联系人和商机，活动链接到客户和商机'
                  : 'Accounts can have multiple Contacts and Opportunities. Activities link to Accounts and Opportunities.'}
              </p>
            </div>
          </motion.div>

          {/* Skill Groups */}
          {skillGroups.map((group) => {
            const Icon = group.icon;
            const isExpanded = expandedGroups.has(group.id);

            return (
              <motion.div key={group.id} variants={itemVariants} className="glass-card rounded-2xl overflow-hidden">
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">
                      {locale === 'zh-Hans' ? group.nameZh : group.name}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {locale === 'zh-Hans' ? group.descriptionZh : group.description}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <ChevronDown
                      className={cn(
                        'w-5 h-5 text-muted-foreground transition-transform duration-200',
                        isExpanded && 'rotate-180'
                      )}
                    />
                  </div>
                </button>

                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="border-t border-border/30"
                  >
                    <div className="p-3 space-y-2">
                      {group.skills.map((skill) => {
                        const isSkillExpanded = expandedSkills.has(skill.id);

                        return (
                          <div key={skill.id} className="bg-muted/20 rounded-xl overflow-hidden">
                            <button
                              onClick={() => toggleSkill(skill.id)}
                              className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors"
                            >
                              <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center shrink-0">
                                <Zap className="w-4 h-4 text-primary" />
                              </div>
                              <div className="flex-1 text-left min-w-0">
                                <h4 className="text-sm font-medium text-foreground">
                                  {locale === 'zh-Hans' ? skill.nameZh : skill.name}
                                </h4>
                                <p className="text-xs text-muted-foreground truncate">
                                  {locale === 'zh-Hans' ? skill.descriptionZh : skill.description}
                                </p>
                              </div>
                              <ChevronRight
                                className={cn(
                                  'w-4 h-4 text-muted-foreground transition-transform duration-200 shrink-0',
                                  isSkillExpanded && 'rotate-90'
                                )}
                              />
                            </button>

                            {isSkillExpanded && (
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="px-3 pb-3 space-y-3"
                              >
                                <div className="bg-background/50 rounded-lg p-3">
                                  <h5 className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1">
                                    <Info className="w-3 h-3" />
                                    {locale === 'zh-Hans' ? '功能说明' : 'Description'}
                                  </h5>
                                  <p className="text-xs text-muted-foreground">
                                    {locale === 'zh-Hans' ? skill.descriptionZh : skill.description}
                                  </p>
                                </div>

                                {skill.voiceExamples && skill.voiceExamplesZh && (
                                  <div className="bg-background/50 rounded-lg p-3">
                                    <h5 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1">
                                      <MessageSquare className="w-3 h-3" />
                                      {locale === 'zh-Hans' ? '语音/文本示例' : 'Voice/Text Examples'}
                                    </h5>
                                    <ul className="space-y-1.5">
                                      {(locale === 'zh-Hans' ? skill.voiceExamplesZh : skill.voiceExamples).map((example: string, idx: number) => (
                                        <li key={idx} className="text-xs text-muted-foreground flex items-start gap-2 bg-muted/30 rounded-lg px-2 py-1.5">
                                          <Sparkles className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                                          <span className="italic">"{example}"</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </motion.div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
