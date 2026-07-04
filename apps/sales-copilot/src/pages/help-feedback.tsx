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
  MessageSquare,
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
import { useLocale, t, type Locale } from '@/lib/i18n';
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
    ],
  },
  {
    id: 'accounts',
    name: 'Account Operations',
    nameZh: '客户操作',
    icon: Building2,
    description: 'Query, search, filter, and manage customer accounts',
    descriptionZh: '查询、搜索、筛选和管理客户账户',
    skills: [
      {
        id: 'queryAccounts',
        name: 'Query Accounts',
        nameZh: '查询客户',
        description: 'Flexible account query with combinable filters: name, region, tier, days since last contact, sort order, and limit. Use with no filters for a full client overview. Use with filters for targeted queries like "S-tier accounts in Eastern region needing follow-up".',
        descriptionZh: '灵活的客户查询，支持组合筛选：名称、区域、等级、最后联系天数、排序和数量限制。不传参数返回全量客户概览，传参数做精确筛选。',
        voiceExamples: ['Summarize my client status', 'Show S-tier accounts', 'Which accounts need follow-up?', 'Find hospitals in East China', "What's my territory status?"],
        voiceExamplesZh: ['总结我的客户状态', '显示S级客户', '哪些客户需要跟进？', '查找华东的医院', '我的区域覆盖如何？'],
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
        id: 'updateAccount',
        name: 'Update Account',
        nameZh: '更新客户',
        description: 'Update an existing account record. Can modify name, industry, region, tier, address, and other fields.',
        descriptionZh: '更新现有客户记录。可修改名称、行业、区域、等级、地址等字段。',
        voiceExamples: ['Update Charité region to East China', 'Change Royal London tier to S'],
        voiceExamplesZh: ['将Charité的区域更新为华东', '将Royal London的等级改为S'],
      },
    ],
  },
  {
    id: 'opportunities',
    name: 'Opportunity Operations',
    nameZh: '商机操作',
    icon: Target,
    description: 'Query, filter, and manage sales opportunities and pipeline',
    descriptionZh: '查询、筛选和管理销售商机与管线',
    skills: [
      {
        id: 'queryOpportunities',
        name: 'Query Opportunities',
        nameZh: '查询商机',
        description: 'Flexible opportunity query with combinable filters: stage, account, closing within N days, minimum amount, sort order, and limit. Use with no filters for full pipeline overview. Use with filters for targeted queries like "proposals closing this month over $500K".',
        descriptionZh: '灵活的商机查询，支持组合筛选：阶段、客户、到期天数、最低金额、排序和数量限制。不传参数返回管线全貌，传参数做精确筛选。',
        voiceExamples: ["What's my pipeline status?", 'Show deals in proposal stage', 'Opportunities closing this month', 'What are my biggest deals?', 'Show opportunities for Royal London'],
        voiceExamplesZh: ['我的管线状态如何？', '显示提案阶段的交易', '本月到期的商机', '我最大的交易是什么？', '显示Royal London的商机'],
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
        description: 'Update an existing opportunity record. Supports stage, amount, confidence, close date, and notes.',
        descriptionZh: '更新现有商机记录。支持更新阶段、金额、信心度、成交日期和备注。',
        voiceExamples: ['Mark this opportunity as won', 'Update the revenue to 300k', 'Move this deal to negotiation stage'],
        voiceExamplesZh: ['标记这个商机为赢单', '将金额更新为30万', '将这笔交易移到谈判阶段'],
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
        id: 'queryActivities',
        name: 'Query Activities',
        nameZh: '查询活动',
        description: 'Flexible activity query with combinable filters: type, account, date range (today/7days/30days/all), status, sort order, and limit. Use with no filters for engagement overview. Use dateRange="today" for today\'s schedule.',
        descriptionZh: '灵活的活动查询，支持组合筛选：类型、客户、日期范围（today/7days/30days/all）、状态、排序和数量限制。不传参数返回互动概览，dateRange="today" 查看今日日程。',
        voiceExamples: ["What's on my schedule today?", "What's my engagement status?", 'Show upcoming visits this week', 'Activities for Royal London', 'Show completed meetings this month'],
        voiceExamplesZh: ['今天有什么安排？', '我的互动状态如何？', '显示本周即将的拜访', 'Royal London的活动', '显示本月已完成的会议'],
      },
      {
        id: 'draftActivity',
        name: 'Draft Activity',
        nameZh: '草拟活动',
        description: 'Create a new activity draft from natural language. Automatically matches account names. Generates meaningful titles. Supports visit, call, meeting, email, other.',
        descriptionZh: '从自然语言创建新活动草稿。自动匹配客户名称，生成有意义的标题。支持拜访、电话、会议、邮件、其他。',
        voiceExamples: ['I visited King\'s College Hospital and discussed OR procurement', 'Plan a visit to Royal London next week'],
        voiceExamplesZh: ['我拜访了King\'s College Hospital，讨论了手术室采购', '计划下周拜访Royal London'],
      },
      {
        id: 'updateActivity',
        name: 'Update Activity',
        nameZh: '更新活动',
        description: 'Update an existing activity record. Supports status changes, date, notes, and result fields.',
        descriptionZh: '更新现有活动记录。支持状态变更、日期、备注和结果字段。',
        voiceExamples: ['Mark this activity as done', 'Complete today\'s visit', 'Cancel this meeting'],
        voiceExamplesZh: ['标记这个活动为完成', '完成今天的拜访', '取消这个会议'],
      },
    ],
  },
  {
    id: 'contacts',
    name: 'Contact Operations',
    nameZh: '联系人操作',
    icon: Users,
    description: 'Query and manage contacts at customer accounts',
    descriptionZh: '查询和管理客户账户的联系人',
    skills: [
      {
        id: 'queryContacts',
        name: 'Query Contacts',
        nameZh: '查询联系人',
        description: 'Flexible contact query with filters: account, name, job title, and limit. Use to find contacts across accounts or within a specific account.',
        descriptionZh: '灵活的联系人查询，支持筛选：客户、姓名、职位和数量限制。可跨客户或在特定客户内查找联系人。',
        voiceExamples: ['Who are the contacts at Royal London?', 'Find all directors', 'Show me people at Charité'],
        voiceExamplesZh: ['Royal London有哪些联系人？', '查找所有主任', '显示Charité的人员'],
      },
      {
        id: 'draftContact',
        name: 'Draft Contact',
        nameZh: '草拟联系人',
        description: 'Create a new contact draft from natural language. Extracts name, title, phone, email, and associated account.',
        descriptionZh: '从自然语言创建新联系人草稿。提取姓名、职位、电话、邮箱和关联客户。',
        voiceExamples: ['Add Dr. Smith as a contact at Royal London'],
        voiceExamplesZh: ['将Smith医生添加为Royal London的联系人'],
      },
      {
        id: 'updateContact',
        name: 'Update Contact',
        nameZh: '更新联系人',
        description: 'Update an existing contact record. Can modify name, title, phone, and email.',
        descriptionZh: '更新现有联系人记录。可修改姓名、职位、电话和邮箱。',
        voiceExamples: ['Update Dr. Smith\'s phone number'],
        voiceExamplesZh: ['更新Smith医生的电话号码'],
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
              {t('skillsToolsGuide', locale)}
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              {t('learnAllFeatures', locale)}
            </p>
          </div>
        </div>
      </motion.header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-auto-hide">
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
                  {t('howItWorks', locale)}
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t('howItWorksDesc', locale)}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Entity Relationship Diagram */}
          <motion.div variants={itemVariants} className="glass-card p-4 rounded-2xl">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Info className="w-4 h-4 text-primary" />
              {t('dataEntityRelationships', locale)}
            </h3>
            <div className="bg-muted/30 rounded-xl p-3">
              <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                <span className="px-2 py-1 bg-primary/10 text-primary rounded-lg font-medium flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  {t('account', locale)}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                <span className="px-2 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg font-medium flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {t('contact', locale)}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                <span className="px-2 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg font-medium flex items-center gap-1">
                  <Target className="w-3 h-3" />
                  {t('opportunity', locale)}
                </span>
              </div>
              <div className="flex justify-center my-2">
                <div className="h-4 w-px bg-border" />
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                <span className="px-2 py-1 bg-green-500/10 text-green-600 dark:text-green-400 rounded-lg font-medium flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {t('activityTab', locale)}
                </span>
                <span className="px-2 py-1 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-lg font-medium flex items-center gap-1">
                  <Package className="w-3 h-3" />
                  {t('product', locale)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground text-center mt-3">
                {t('entityRelFooter', locale)}
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
                                    {t('descriptionLabel', locale)}
                                  </h5>
                                  <p className="text-xs text-muted-foreground">
                                    {locale === 'zh-Hans' ? skill.descriptionZh : skill.description}
                                  </p>
                                </div>

                                {skill.voiceExamples && skill.voiceExamplesZh && (
                                  <div className="bg-background/50 rounded-lg p-3">
                                    <h5 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1">
                                      <MessageSquare className="w-3 h-3" />
                                      {t('voiceTextExamples', locale)}
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
