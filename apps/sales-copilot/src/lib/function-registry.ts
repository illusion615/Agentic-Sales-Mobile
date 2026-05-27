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
  // ===== Atomic Query Functions =====
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

  // ===== Atomic Query Functions =====
  // 4 generic query functions replace 14 specialized ones.
  // The orchestrator fills in filter parameters based on user intent.
  {
    name: 'queryAccounts',
    displayName: { 'zh-Hans': '查询客户', 'en-US': 'Query Accounts' },
    description: 'Query accounts/customers with flexible filters. Use with no filters for full overview (e.g. "client status", "territory overview"). Use with filters for targeted queries (e.g. "show S-tier accounts in Eastern region"). 灵活查询客户，不传参数返回全量概览，传参数做精确筛选。',
    parameters: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Specific account ID for detail lookup / 指定客户ID查详情' },
        name: { type: 'string', description: 'Filter by name keyword (fuzzy) / 按名称关键词模糊查询' },
        region: { type: 'string', description: 'Filter by region / 按区域筛选' },
        tier: { type: 'string', description: 'Filter by tier level / 按等级筛选', enum: ['S', 'A', 'B', 'C'] },
        daysSinceLastContact: { type: 'number', description: 'Only accounts not contacted in N days (for follow-up analysis) / 超过N天未联系的客户' },
        sortBy: { type: 'string', description: 'Sort field / 排序字段', enum: ['name', 'region', 'tier', 'lastContacted'] },
        limit: { type: 'number', description: 'Max results, default 20 / 返回数量，默认20' },
      },
    },
  },
  {
    name: 'queryOpportunities',
    displayName: { 'zh-Hans': '查询商机', 'en-US': 'Query Opportunities' },
    description: 'Query opportunities/deals with flexible filters. Use with no filters for pipeline overview (e.g. "pipeline status"). Use with filters for targeted queries (e.g. "opportunities closing this month", "deals in proposal stage"). 灵活查询商机，不传参数返回管线概览，传参数做精确筛选。',
    parameters: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Filter by account ID / 按客户ID筛选' },
        accountName: { type: 'string', description: 'Filter by account name (fuzzy matched) / 按客户名称筛选（模糊匹配）' },
        stage: { type: 'string', description: 'Filter by stage / 按阶段筛选', enum: ['prospecting', 'qualification', 'proposal', 'negotiation', 'won', 'lost'] },
        closingWithinDays: { type: 'number', description: 'Only opportunities closing within N days / 仅返回N天内到期的商机' },
        minAmount: { type: 'number', description: 'Minimum deal amount / 最低金额' },
        sortBy: { type: 'string', description: 'Sort field / 排序字段', enum: ['amount', 'closeDate', 'stage', 'name'] },
        limit: { type: 'number', description: 'Max results, default 20 / 返回数量，默认20' },
      },
    },
  },
  {
    name: 'queryActivities',
    displayName: { 'zh-Hans': '查询活动', 'en-US': 'Query Activities' },
    description: 'Query activities/visits/calls/meetings with flexible filters. Use with no filters for engagement overview. Use dateRange="today" for today\'s schedule, dateRange="7days" for weekly view. 灵活查询活动，不传参数返回互动概览。',
    parameters: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Filter by account ID / 按客户ID筛选' },
        accountName: { type: 'string', description: 'Filter by account name (fuzzy matched) / 按客户名称筛选（模糊匹配）' },
        type: { type: 'string', description: 'Filter by activity type / 按类型筛选', enum: ['visit', 'call', 'meeting', 'email', 'other'] },
        dateRange: { type: 'string', description: 'Date range: "today", "7days", "30days", "all" / 日期范围', enum: ['today', '7days', '30days', 'all'] },
        status: { type: 'string', description: 'Filter by status / 按状态筛选', enum: ['draft', 'confirmed', 'completed', 'cancelled'] },
        sortBy: { type: 'string', description: 'Sort field / 排序字段', enum: ['date', 'type', 'account'] },
        limit: { type: 'number', description: 'Max results, default 20 / 返回数量，默认20' },
      },
    },
  },
  {
    name: 'queryContacts',
    displayName: { 'zh-Hans': '查询联系人', 'en-US': 'Query Contacts' },
    description: 'Query contacts with flexible filters. 灵活查询联系人。',
    parameters: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Filter by account ID / 按客户ID筛选' },
        accountName: { type: 'string', description: 'Filter by account name (fuzzy matched) / 按客户名称筛选（模糊匹配）' },
        name: { type: 'string', description: 'Filter by name keyword / 按姓名关键词筛选' },
        title: { type: 'string', description: 'Filter by job title keyword / 按职位关键词筛选' },
        limit: { type: 'number', description: 'Max results, default 20 / 返回数量，默认20' },
      },
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

  // ===== Copilot Studio Tool =====
  {
    name: 'queryCopilotStudio',
    displayName: { 'zh-Hans': '产品知识查询', 'en-US': 'Product Knowledge Query' },
    description: 'ALL product knowledge queries route here — features, specifications, parameters, technical principles, usage instructions, FAQ, troubleshooting, model comparisons, certifications, warranty, manuals. The runtime auto-prepends page / account / product / dialog context to the payload before sending to Copilot Studio, so just pass the user\'s ORIGINAL question verbatim in `query`. Only resolve pronouns ("this product" → actual product name) when the referent is unambiguous; otherwise leave it for CS. Do NOT use this for queries about CRM records (opportunities, customers, activities) — those go to Dataverse functions. 所有产品知识相关问题（功能、规格、参数、原理、使用方法、FAQ、故障排查、型号对比、认证、保修、手册）都走此函数到 Copilot Studio。运行时会自动附加页面/客户/产品/对话上下文，把用户原始问题原样传入 `query` 即可。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '用户的产品相关问题（原文，不要改写）/ User\'s product-related question (verbatim, do not paraphrase)' },
      },
      required: ['query'],
    },
  },

  // ===== External Knowledge (Copilot Studio fallback for non-Dataverse queries) =====
  {
    name: 'externalKnowledgeQuery',
    displayName: { 'zh-Hans': '外部知识查询', 'en-US': 'External Knowledge Query' },
    description: 'Non-product external knowledge: industry trends, regulations, competitor news, general business knowledge — anything not covered by local Dataverse AND not about the company\'s own products. For PRODUCT knowledge (features, specs, manuals, comparisons, principles, FAQ), use `queryCopilotStudio` instead. 与产品无关的外部知识：行业趋势、法规、竞争对手新闻、通用商业知识。产品本身的知识（功能、规格、手册、对比、原理、FAQ）请用 `queryCopilotStudio`。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '用户的问题 / User\'s question' },
      },
      required: ['query'],
    },
  },

  // ===== Planning Functions =====
  {
    name: 'suggestPlan',
    displayName: { 'zh-Hans': '智能规划', 'en-US': 'Suggest Plan' },
    description: '基于 pipeline 紧迫度、客户回访需求和已有安排，为指定日期/时段智能规划销售任务。当用户说"帮我规划明天的日程"、"create tomorrow\'s tasks"、"plan next week"、"安排下周工作"时调用。Intelligently plan sales tasks for a target date/period based on pipeline urgency, client revisit needs, and existing schedule.',
    parameters: {
      type: 'object',
      properties: {
        targetDate: { type: 'string', description: '目标日期 YYYY-MM-DD，默认明天 / Target date, defaults to tomorrow' },
        period: { type: 'string', description: '规划区间', enum: ['day', 'week'], },
        focus: { type: 'string', description: '可选的重点方向，如 close deals / client visits / follow-ups' },
        maxTasks: { type: 'number', description: '建议任务数量上限，默认5 / Max suggestions, default 5' },
      },
      required: [],
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
