/**
 * Function Registry for Copilot Function Calling
 * Defines available functions that the LLM can invoke
 */

export interface FunctionParameter {
  type: string;
  description: string;
  enum?: string[];
}

export interface FunctionDefinition {
  name: string;
  displayName: { 'zh-Hans': string; 'en-US': string };
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, FunctionParameter>;
    required?: string[];
  };
}

/**
 * Available functions for LLM to call
 * Keep descriptions concise but clear for the LLM to understand
 */
export const availableFunctions: FunctionDefinition[] = [
  // ===== Account Functions =====
  {
    name: 'searchAccounts',
    displayName: { 'zh-Hans': '搜索客户', 'en-US': 'Search Accounts' },
    description: '搜索客户/公司，支持按名称模糊查询。Search customers/companies by name.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '客户名称关键词 / Customer name keyword' },
        limit: { type: 'number', description: '返回数量，默认5 / Max results, default 5' },
      },
      required: ['query'],
    },
  },
  {
    name: 'getAccountDetails',
    displayName: { 'zh-Hans': '客户详情', 'en-US': 'Account Details' },
    description: '获取指定客户的详细信息。Get details of a specific account.',
    parameters: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: '客户ID / Account ID' },
      },
      required: ['accountId'],
    },
  },
  {
    name: 'getAccountsByRegion',
    displayName: { 'zh-Hans': '按区域筛选客户', 'en-US': 'Accounts by Region' },
    description: '按区域筛选客户。Filter accounts by region.',
    parameters: {
      type: 'object',
      properties: {
        region: { type: 'string', description: '区域', enum: ['华东', '华北', '华南', '西南'] },
        limit: { type: 'number', description: '返回数量，默认10' },
      },
      required: ['region'],
    },
  },
  {
    name: 'getAccountsByTier',
    displayName: { 'zh-Hans': '按等级筛选客户', 'en-US': 'Accounts by Tier' },
    description: '按客户等级筛选。Filter accounts by tier level.',
    parameters: {
      type: 'object',
      properties: {
        tier: { type: 'string', description: '客户等级', enum: ['S', 'A', 'B', 'C'] },
        limit: { type: 'number', description: '返回数量，默认10' },
      },
      required: ['tier'],
    },
  },

  // ===== Opportunity Functions =====
  {
    name: 'getMyOpportunities',
    displayName: { 'zh-Hans': '我的商机', 'en-US': 'My Opportunities' },
    description: '获取当前用户的商机列表，可按阶段筛选。Get my opportunities, optionally filter by stage.',
    parameters: {
      type: 'object',
      properties: {
        stage: {
          type: 'string',
          description: '商机阶段',
          enum: ['prospecting', 'qualification', 'proposal', 'negotiation', 'won', 'lost'],
        },
        limit: { type: 'number', description: '返回数量，默认10' },
      },
    },
  },
  {
    name: 'getTopOpportunities',
    displayName: { 'zh-Hans': '热门商机', 'en-US': 'Top Opportunities' },
    description: '获取金额最高的商机。Get top opportunities by amount.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '返回数量，默认5' },
      },
    },
  },
  {
    name: 'getOpportunitiesByAccount',
    displayName: { 'zh-Hans': '客户商机', 'en-US': 'Account Opportunities' },
    description: '获取指定客户的所有商机。Get all opportunities for a specific account.',
    parameters: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: '客户ID / Account ID' },
      },
      required: ['accountId'],
    },
  },
  {
    name: 'getOpportunitiesClosingSoon',
    displayName: { 'zh-Hans': '即将成交', 'en-US': 'Closing Soon' },
    description: '获取即将到期的商机（按预计成交日期）。Get opportunities closing soon.',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: '未来多少天内，默认7' },
        limit: { type: 'number', description: '返回数量，默认10' },
      },
    },
  },

  // ===== Activity Functions =====
  {
    name: 'getTodayActivities',
    displayName: { 'zh-Hans': '今日活动', 'en-US': "Today's Activities" },
    description: '获取今天的活动/拜访安排。Get today\'s scheduled activities.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: '活动类型',
          enum: ['visit', 'call', 'meeting', 'email', 'other'],
        },
      },
    },
  },
  {
    name: 'getUpcomingActivities',
    displayName: { 'zh-Hans': '近期活动', 'en-US': 'Upcoming Activities' },
    description: '获取未来几天的活动安排。Get upcoming activities.',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: '未来多少天，默认7' },
        limit: { type: 'number', description: '返回数量，默认10' },
      },
    },
  },
  {
    name: 'getActivitiesByAccount',
    displayName: { 'zh-Hans': '客户活动', 'en-US': 'Account Activities' },
    description: '获取指定客户的活动记录。Get activities for a specific account.',
    parameters: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: '客户ID / Account ID' },
        limit: { type: 'number', description: '返回数量，默认10' },
      },
      required: ['accountId'],
    },
  },
  {
    name: 'createActivity',
    displayName: { 'zh-Hans': '创建活动', 'en-US': 'Create Activity' },
    description: '创建新的活动/拜访记录。Create a new activity record.',
    parameters: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: '客户ID' },
        type: { type: 'string', description: '活动类型', enum: ['visit', 'call', 'meeting', 'email', 'other'] },
        title: { type: 'string', description: '活动标题' },
        notes: { type: 'string', description: '备注内容' },
        scheduledDate: { type: 'string', description: '计划日期，ISO格式 YYYY-MM-DD' },
      },
      required: ['type', 'title'],
    },
  },

  // ===== Draft/Create Functions (return form cards) =====
  {
    name: 'draftActivity',
    displayName: { 'zh-Hans': '草拟活动', 'en-US': 'Draft Activity' },
    description: '从用户描述中提取活动信息，生成活动草稿供用户确认。当用户描述拜访/会议/通话但没有明确说"保存"或"创建"时调用此函数。Extract activity info from user description and create a draft for confirmation.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '活动标题，简洁概括（10字以内）' },
        type: { type: 'string', description: '活动类型', enum: ['visit', 'call', 'meeting', 'email', 'other'] },
        accountName: { type: 'string', description: '客户/公司名称' },
        contactName: { type: 'string', description: '联系人姓名' },
        scheduledDate: { type: 'string', description: '日期，ISO格式 YYYY-MM-DD' },
        result: { type: 'string', description: '结果/讨论要点' },
        nextStep: { type: 'string', description: '下一步行动计划' },
        notes: { type: 'string', description: '备注' },
      },
      required: ['title', 'type'],
    },
  },
  {
    name: 'draftOpportunity',
    displayName: { 'zh-Hans': '草拟商机', 'en-US': 'Draft Opportunity' },
    description: '从用户描述中提取商机信息，生成商机草稿供用户确认。当用户提到新的商业机会/项目/意向时调用。Extract opportunity info and create a draft for confirmation.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '商机名称' },
        accountName: { type: 'string', description: '客户/公司名称' },
        amount: { type: 'number', description: '预计金额' },
        stage: { type: 'string', description: '阶段', enum: ['prospecting', 'qualification', 'proposal', 'negotiation'] },
        confidence: { type: 'number', description: '信心度 0-100' },
        expectedCloseDate: { type: 'string', description: '预计成交日期 YYYY-MM-DD' },
        lastAction: { type: 'string', description: '最近动作/备注' },
      },
      required: ['name'],
    },
  },
  {
    name: 'draftAccount',
    displayName: { 'zh-Hans': '草拟客户', 'en-US': 'Draft Account' },
    description: '从用户描述中提取客户信息，生成客户草稿供用户确认。当用户想要添加新客户/公司时调用。Extract account info and create a draft for confirmation.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '客户/公司名称' },
        industry: { type: 'string', description: '行业' },
        region: { type: 'string', description: '区域', enum: ['华东', '华北', '华南', '西南'] },
        tier: { type: 'string', description: '等级', enum: ['S', 'A', 'B', 'C'] },
        phone: { type: 'string', description: '电话' },
        email: { type: 'string', description: '邮箱' },
        address: { type: 'string', description: '地址' },
        notes: { type: 'string', description: '备注' },
      },
      required: ['name'],
    },
  },

  // ===== Form Fill Functions (legacy - for page forms) =====
  {
    name: 'fillActivityForm',
    displayName: { 'zh-Hans': '填写活动表单', 'en-US': 'Fill Activity Form' },
    description: '当用户在活动表单页面时，从描述中提取信息填充表单。仅在 Activity Capture 页面使用。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '活动标题，简洁概括（10字以内）' },
        accountName: { type: 'string', description: '客户/公司名称' },
        contactName: { type: 'string', description: '联系人姓名' },
        visitDate: { type: 'string', description: '拜访日期，ISO格式 YYYY-MM-DD' },
        result: { type: 'string', description: '拜访结果/讨论要点' },
        nextStep: { type: 'string', description: '下一步行动计划' },
        opportunityIntent: { type: 'string', description: '商机/意向描述' },
      },
      required: ['result'],
    },
  },

  // ===== Summary/Analytics Functions =====
  {
    name: 'getSalesSummary',
    displayName: { 'zh-Hans': '销售摘要', 'en-US': 'Sales Summary' },
    description: '获取销售汇总数据：商机总数、总金额、各阶段分布。Get sales summary statistics.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'getAccountsNeedingFollowUp',
    displayName: { 'zh-Hans': '待跟进客户', 'en-US': 'Accounts Needing Follow-up' },
    description: '获取需要跟进的客户（超过N天未联系）。Get accounts that need follow-up.',
    parameters: {
      type: 'object',
      properties: {
        daysSinceLastContact: { type: 'number', description: '超过多少天未联系，默认7' },
        limit: { type: 'number', description: '返回数量，默认10' },
      },
    },
  },

  // ===== Copilot Studio Tool =====
  {
    name: 'queryCopilotStudio',
    displayName: { 'zh-Hans': '产品知识查询', 'en-US': 'Product Knowledge Query' },
    description: '查询产品信息、产品知识库、产品FAQ等。当用户询问产品相关问题时调用此函数，将查询发送到 Copilot Studio 获取答案。Query product information, product knowledge base, product FAQ. Call this function when user asks product-related questions.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '用户的产品相关问题 / User\'s product-related question' },
      },
      required: ['query'],
    },
  },

  // ===== External Knowledge (Copilot Studio fallback for non-Dataverse queries) =====
  {
    name: 'externalKnowledgeQuery',
    displayName: { 'zh-Hans': '外部知识查询', 'en-US': 'External Knowledge Query' },
    description: '当用户询问通用产品知识、规格参数、技术原理、行业知识、公司外部信息等本地 Dataverse 数据库没有覆盖的内容时调用。注意："产品知识查询"(queryCopilotStudio)仅当用户问的是本系统已有产品记录的关联数据时使用；任何关于产品的通用介绍、规格参数、原理说明都应使用此函数。Query external knowledge sources when user asks about general product knowledge, specifications, technical principles, industry information, or any content not covered by local Dataverse. Note: Use "queryCopilotStudio" only for product RECORDS in this system; any general product introductions, specs, or principles should use this function.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '用户的问题 / User\'s question' },
      },
      required: ['query'],
    },
  },
];

/**
 * Generate a compact function list for the LLM system prompt
 */
export function getFunctionListForPrompt(): string {
  return JSON.stringify(
    availableFunctions.map((f) => ({
      name: f.name,
      description: f.description,
      parameters: f.parameters,
    })),
    null,
    2
  );
}

/**
 * Get the display name for a function based on locale
 */
export function getDisplayName(functionName: string, locale: 'zh-Hans' | 'en-US' = 'en-US'): string {
  const func = availableFunctions.find((f) => f.name === functionName);
  if (func) {
    return func.displayName[locale] || func.displayName['en-US'] || functionName;
  }
  return functionName;
}
