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
  // ===== Multi-Entity Batch Functions =====
  {
    name: 'batchDraft',
    displayName: { 'zh-Hans': '批量草拟', 'en-US': 'Batch Draft' },
    description: '当用户在一句话中提到要创建多个记录时调用。例如："帮我添加一个客户和一个联系人"、"创建两条活动记录"。将每个记录作为items数组中的一个元素。When user mentions creating multiple records in one request, use this function. Each record becomes an item in the items array.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: '要创建的记录数组，每个元素包含type和data',
        },
      },
      required: ['items'],
    },
  },

  // ===== Fuzzy Matching Functions =====
  {
    name: 'fuzzyMatchAccount',
    displayName: { 'zh-Hans': '模糊匹配客户', 'en-US': 'Fuzzy Match Account' },
    description: '当用户提到客户名称但可能不完全准确时，先调用此函数查找可能匹配的客户。返回匹配列表供确认。Use when user mentions an account name that might not be exact - returns possible matches for confirmation.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '用户提到的客户名称或关键词 / Account name or keyword mentioned by user' },
        context: { type: 'string', description: '上下文信息（如产品、区域）帮助缩小范围 / Context info to narrow down matches' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fuzzyMatchContact',
    displayName: { 'zh-Hans': '模糊匹配联系人', 'en-US': 'Fuzzy Match Contact' },
    description: '当用户提到联系人名字但可能不完全准确时，先调用此函数查找可能匹配的联系人。Use when user mentions a contact name that might not be exact.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '用户提到的联系人姓名 / Contact name mentioned by user' },
        accountId: { type: 'string', description: '可选：限定在特定客户下查找 / Optional: limit search to specific account' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fuzzyMatchOpportunity',
    displayName: { 'zh-Hans': '模糊匹配商机', 'en-US': 'Fuzzy Match Opportunity' },
    description: '当用户提到商机名称但可能不完全准确时，先调用此函数查找可能匹配的商机。Use when user mentions an opportunity name that might not be exact.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '用户提到的商机名称或关键词 / Opportunity name or keyword' },
        accountId: { type: 'string', description: '可选：限定在特定客户下查找 / Optional: limit to specific account' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fuzzyMatchActivity',
    displayName: { 'zh-Hans': '模糊匹配活动', 'en-US': 'Fuzzy Match Activity' },
    description: '当用户提到活动标题/描述但可能已存在类似活动时，先调用此函数查找可能重复的活动。Use when user describes an activity that might already exist - returns possible duplicates for confirmation.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '活动标题或描述关键词 / Activity title or description keywords' },
        accountId: { type: 'string', description: '可选：限定在特定客户下查找 / Optional: limit to specific account' },
        dateRange: { type: 'string', description: '可选：日期范围如 "7days"、"30days" / Optional: date range like "7days", "30days"' },
      },
      required: ['query'],
    },
  },

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
    name: 'getContactsByAccount',
    displayName: { 'zh-Hans': '客户联系人', 'en-US': 'Account Contacts' },
    description: '获取指定客户的所有联系人列表。Get all contacts for a specific account.',
    parameters: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: '客户ID / Account ID' },
        limit: { type: 'number', description: '返回数量，默认10 / Max results, default 10' },
      },
      required: ['accountId'],
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
        title: { 
          type: 'string', 
          description: '活动标题：必须具体且有意义，包含关键信息（如客户名称、讨论主题、产品名称）。例如："Royal London Hospital - BeneVision N22 Demo"、"Liverpool Heart & Chest 报价跟进"、"Charité ICU 监护系统需求讨论"。禁止使用泛泛的标题如"客户拜访"、"电话沟通"、"会议"等。Activity title: Must be specific and meaningful, including key info (account name, topic, product). Examples: "Royal London Hospital - BeneVision N22 Demo", "Liverpool pricing follow-up". Never use generic titles like "Customer Visit" or "Phone Call".'
        },
        type: { type: 'string', description: '活动类型', enum: ['visit', 'call', 'meeting', 'email', 'other'] },
        accountId: { type: 'string', description: '客户ID（如果已知）/ Account ID (if known)' },
        accountName: { type: 'string', description: '客户/公司名称' },
        contactName: { type: 'string', description: '联系人姓名' },
        contactTitle: { type: 'string', description: '联系人职位/科室 / Contact job title or department' },
        scheduledDate: { type: 'string', description: '日期，ISO格式 YYYY-MM-DD' },
        result: { type: 'string', description: '结果/讨论要点' },
        nextStep: { type: 'string', description: '下一步行动计划' },
        opportunityId: { type: 'string', description: '关联商机ID（如果已知）/ Related opportunity ID (if known)' },
        opportunityName: { type: 'string', description: '关联商机名称' },
        notes: { type: 'string', description: '备注 - 将所有不能映射到其他字段的有价值信息都放到这里（如：公司历史、特殊资质、重要背景、合作伙伴关系等）/ Notes - Put ALL valuable information that cannot be mapped to other structured fields here (e.g., company history, certifications, important background, partnerships, etc.)' },
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
  {
    name: 'draftContact',
    displayName: { 'zh-Hans': '草拟联系人', 'en-US': 'Draft Contact' },
    description: '从用户描述中提取联系人信息，生成联系人草稿供用户确认。当用户想要添加新联系人/新的人员时调用。注意：联系人是指客户公司中的具体人员（如张经理、李医生），不是客户/公司本身。Extract contact info and create a draft for confirmation. A contact is a person at a customer company (e.g. Dr. Smith, Manager Wang), NOT the company itself.',
    parameters: {
      type: 'object',
      properties: {
        fullName: { type: 'string', description: '联系人姓名 / Full name' },
        accountName: { type: 'string', description: '所属客户/公司名称 / Account/company name' },
        title: { type: 'string', description: '职位/职务 / Job title' },
        phone: { type: 'string', description: '电话 / Phone' },
        email: { type: 'string', description: '邮箱 / Email' },
      },
      required: ['fullName'],
    },
  },


  // ===== Update Functions =====
  {
    name: 'updateAccount',
    displayName: { 'zh-Hans': '更新客户', 'en-US': 'Update Account' },
    description: '更新现有客户的信息。当用户说"更新客户XXX"、"修改客户信息"、"把这个客户的XX改成XX"时调用。Update existing account information. Use when user says "update account", "modify account", "change this account\'s XX to XX".',
    parameters: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: '客户ID / Account ID (required for update)' },
        accountName: { type: 'string', description: '客户名称（用于查找匹配）/ Account name (for matching)' },
        name: { type: 'string', description: '新的客户名称 / New account name' },
        industry: { type: 'string', description: '新的行业 / New industry' },
        region: { type: 'string', description: '新的区域 / New region', enum: ['华东', '华北', '华南', '西南'] },
        tier: { type: 'string', description: '新的等级 / New tier', enum: ['S', 'A', 'B', 'C'] },
        phone: { type: 'string', description: '新的电话 / New phone' },
        email: { type: 'string', description: '新的邮箱 / New email' },
        address: { type: 'string', description: '新的地址 / New address' },
        notes: { type: 'string', description: '新的备注 / New notes' },
      },
      required: [],
    },
  },
  {
    name: 'updateOpportunity',
    displayName: { 'zh-Hans': '更新商机', 'en-US': 'Update Opportunity' },
    description: '更新现有商机的信息。当用户说"更新商机"、"修改商机金额"、"把这个商机的金额改成XX"、"商机金额调整为XX"时调用。注意：当用户在商机详情页或刚查询完商机后说"更新金额"等，应从页面上下文获取 opportunityId。Update existing opportunity information. Use when user says "update opportunity", "change amount to XX", "adjust revenue".',
    parameters: {
      type: 'object',
      properties: {
        opportunityId: { type: 'string', description: '商机ID / Opportunity ID (required for update)' },
        opportunityName: { type: 'string', description: '商机名称（用于查找匹配）/ Opportunity name (for matching)' },
        name: { type: 'string', description: '新的商机名称 / New opportunity name' },
        amount: { type: 'number', description: '新的金额 / New amount (e.g., 300000 for 300k, 2000000 for 2M)' },
        stage: { type: 'string', description: '新的阶段 / New stage', enum: ['prospecting', 'qualification', 'proposal', 'negotiation', 'won', 'lost'] },
        confidence: { type: 'number', description: '新的信心度 0-100 / New confidence 0-100' },
        expectedCloseDate: { type: 'string', description: '新的预计成交日期 YYYY-MM-DD / New expected close date' },
        lastAction: { type: 'string', description: '新的最近动作 / New last action notes' },
      },
      required: [],
    },
  },
  {
    name: 'updateActivity',
    displayName: { 'zh-Hans': '更新活动', 'en-US': 'Update Activity' },
    description: '更新现有活动记录。当用户说"更新活动"、"修改这个活动"、"把活动日期改成XX"时调用。Update existing activity record.',
    parameters: {
      type: 'object',
      properties: {
        activityId: { type: 'string', description: '活动ID / Activity ID (required for update)' },
        activityTitle: { type: 'string', description: '活动标题（用于查找匹配）/ Activity title (for matching)' },
        title: { type: 'string', description: '新的活动标题 / New activity title' },
        type: { type: 'string', description: '新的活动类型 / New activity type', enum: ['visit', 'call', 'meeting', 'email', 'other'] },
        scheduledDate: { type: 'string', description: '新的日期 YYYY-MM-DD / New scheduled date' },
        result: { type: 'string', description: '新的结果 / New result' },
        nextStep: { type: 'string', description: '新的下一步 / New next step' },
        notes: { type: 'string', description: '新的备注 / New notes' },
      },
      required: [],
    },
  },
  {
    name: 'updateContact',
    displayName: { 'zh-Hans': '更新联系人', 'en-US': 'Update Contact' },
    description: '更新现有联系人信息。当用户说"更新联系人"、"修改联系人电话"、"把这个联系人的邮箱改成XX"时调用。Update existing contact information.',
    parameters: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: '联系人ID / Contact ID (required for update)' },
        contactName: { type: 'string', description: '联系人姓名（用于查找匹配）/ Contact name (for matching)' },
        fullName: { type: 'string', description: '新的姓名 / New full name' },
        title: { type: 'string', description: '新的职位 / New title' },
        phone: { type: 'string', description: '新的电话 / New phone' },
        email: { type: 'string', description: '新的邮箱 / New email' },
      },
      required: [],
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
