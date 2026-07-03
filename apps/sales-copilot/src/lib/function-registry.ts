/**
 * Function Registry for Copilot Function Calling
 * Defines available functions that the LLM can invoke
 */
import { z, type ZodTypeAny } from 'zod';

export interface FunctionParameter {
  type: string;
  description: string;
  enum?: string[];
  /** For type: 'array' — describes the element type (and its allowed values). */
  items?: { type: string; enum?: string[] };
}

/**
 * Skill definition. All skills — Dataverse CRUD, Copilot Studio, and LLM-backed AI —
 * share this interface. LLM-backed skills set `llmBacked: true` and provide prompt templates.
 */
export interface FunctionDefinition {
  name: string;
  displayName: { 'zh-Hans': string; 'en-US': string };
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, FunctionParameter>;
    required?: string[];
  };
  /** When true, this skill calls LLM via invokeFlowForLLM. Executor uses the generic LLM handler. */
  llmBacked?: boolean;
  /** System prompt templates for LLM-backed skills. */
  promptTemplate?: string;
  /** Expected LLM response format. Required for LLM-backed skills — no silent default.
   * - 'json'         → intent classification (frame-shadow only, schema locked in AI Builder)
   * - 'dag'          → DAG execution plan (orchestrator only)
   * - 'json-generic' → free-form JSON (prompt controls the shape, AI Builder has open schema)
   * - 'text'         → plain text / markdown
   */
  responseFormat?: 'json' | 'text' | 'dag' | 'json-generic';
  /**
   * Declarative output contract. The executor validates/normalizes the parsed
   * LLM response against this schema, so callers receive a typed, guaranteed
   * shape instead of casting/guessing. Validation failure surfaces a structured
   * parse error rather than silently passing through a mismatched payload.
   */
  outputSchema?: ZodTypeAny;
  /**
   * Action tools that mutate ONE existing record declare their required subject
   * entity here. The intent runtime gates on it: if the subject can't be resolved
   * from args/context, it launches fuzzy match so the user can pick/search the
   * record — instead of the handler hard-failing on a missing id.
   */
  subject?: 'account' | 'contact' | 'opportunity' | 'activity';
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
    description: 'Use when the user mentions an account name that might not be exact — call this first to find possible matching accounts; returns a list of matches for confirmation.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Account name or keyword mentioned by the user' },
        context: { type: 'string', description: 'Context info (e.g. product, region) to narrow down matches' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fuzzyMatchContact',
    displayName: { 'zh-Hans': '模糊匹配联系人', 'en-US': 'Fuzzy Match Contact' },
    description: 'Use when the user mentions a contact name that might not be exact — call this first to find possible matching contacts.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Contact name mentioned by the user' },
        accountId: { type: 'string', description: 'Optional: limit the search to a specific account' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fuzzyMatchOpportunity',
    displayName: { 'zh-Hans': '模糊匹配商机', 'en-US': 'Fuzzy Match Opportunity' },
    description: 'Use when the user mentions an opportunity name that might not be exact — call this first to find possible matching opportunities.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Opportunity name or keyword mentioned by the user' },
        accountId: { type: 'string', description: 'Optional: limit the search to a specific account' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fuzzyMatchActivity',
    displayName: { 'zh-Hans': '模糊匹配活动', 'en-US': 'Fuzzy Match Activity' },
    description: 'Use when the user describes an activity that might already exist — call this first to find possible duplicate activities; returns possible duplicates for confirmation.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Activity title or description keywords' },
        accountId: { type: 'string', description: 'Optional: limit the search to a specific account' },
        dateRange: { type: 'string', description: 'Optional: date range like "7days", "30days"' },
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
    description: 'Query accounts/customers with flexible filters. Use with no filters for full overview (e.g. "client status", "territory overview"). Use with filters for targeted queries (e.g. "show S-tier accounts in Eastern region").',
    parameters: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Specific account ID for detail lookup' },
        name: { type: 'string', description: 'Filter by name keyword (fuzzy)' },
        region: { type: 'string', description: 'Filter by region' },
        tier: { type: 'string', description: 'Filter by tier level', enum: ['S', 'A', 'B', 'C'] },
        daysSinceLastContact: { type: 'number', description: 'Only accounts not contacted in N days (for follow-up analysis)' },
        sortBy: { type: 'string', description: 'Sort field', enum: ['name', 'region', 'tier', 'lastContacted'] },
        limit: { type: 'number', description: 'Max results, default 20' },
      },
    },
  },
  {
    name: 'queryOpportunities',
    displayName: { 'zh-Hans': '查询商机', 'en-US': 'Query Opportunities' },
    description: 'Query opportunities/deals with flexible filters. Use with no filters for pipeline overview (e.g. "pipeline status"). Use with filters for targeted queries (e.g. "opportunities closing this month", "deals in proposal stage").',
    parameters: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Filter by account ID' },
        accountName: { type: 'string', description: 'Filter by account name (fuzzy matched)' },
        stage: { type: 'array', items: { type: 'string', enum: ['prospecting', 'qualification', 'proposal', 'negotiation', 'won', 'lost'] }, description: 'Filter by one or more stages (multi-select, e.g. negotiation + proposal)' },
        closingWithinDays: { type: 'number', description: 'Only opportunities closing within N days' },
        minAmount: { type: 'number', description: 'Minimum deal amount' },
        sortBy: { type: 'string', description: 'Sort field', enum: ['amount', 'closeDate', 'stage', 'name'] },
        limit: { type: 'number', description: 'Max results, default 20' },
      },
    },
  },
  {
    name: 'queryActivities',
    displayName: { 'zh-Hans': '查询活动', 'en-US': 'Query Activities' },
    description: 'Query activities/visits/calls/meetings with flexible filters. Use with no filters for engagement overview. Use dateRange="today" for today\'s schedule, dateRange="7days" for weekly view.',
    parameters: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Filter by account ID' },
        accountName: { type: 'string', description: 'Filter by account name (fuzzy matched)' },
        type: { type: 'string', description: 'Filter by activity type', enum: ['visit', 'call', 'meeting', 'email'] },
        dateRange: { type: 'string', description: 'Date range: "today", "7days", "30days", "all"', enum: ['today', '7days', '30days', 'all'] },
        scheduledDate: { type: 'string', description: 'Exact date in YYYY-MM-DD format' },
        dateFrom: { type: 'string', description: 'Start date YYYY-MM-DD for range queries' },
        dateTo: { type: 'string', description: 'End date YYYY-MM-DD for range queries' },
        status: { type: 'string', description: 'Filter by status', enum: ['draft', 'confirmed', 'completed', 'cancelled'] },
        sortBy: { type: 'string', description: 'Sort field', enum: ['date', 'type', 'account'] },
        limit: { type: 'number', description: 'Max results, default 20' },
      },
    },
  },
  {
    name: 'queryContacts',
    displayName: { 'zh-Hans': '查询联系人', 'en-US': 'Query Contacts' },
    description: 'Query contacts with flexible filters.',
    parameters: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Filter by account ID' },
        accountName: { type: 'string', description: 'Filter by account name (fuzzy matched)' },
        name: { type: 'string', description: 'Filter by name keyword' },
        title: { type: 'string', description: 'Filter by job title keyword' },
        limit: { type: 'number', description: 'Max results, default 20' },
      },
    },
  },

  // ===== Composite / transform (read → propose → confirm → apply) =====
  {
    name: 'proposeChanges',
    displayName: { 'zh-Hans': '提出修改方案', 'en-US': 'Propose Changes' },
    description: 'Compose concrete changes over EXISTING records and ask the user to confirm BEFORE applying. Use for merge-duplicates, deduplicate, reconcile, or "compare these records then update/delete" requests. It reads the records produced by prior steps, proposes the exact update/delete operations, and shows a confirm card — nothing is written until the user confirms.',
    parameters: {
      type: 'object',
      properties: {
        goal: { type: 'string', description: "The user's request in their own words, e.g. 'merge these two duplicate visits' — what to accomplish over the in-scope records" },
      },
      required: ['goal'],
    },
  },

  // ===== Draft/Create Functions (return form cards) =====
  {
    name: 'draftActivity',
    displayName: { 'zh-Hans': '草拟活动', 'en-US': 'Draft Activity' },
    description: 'Extract activity info from the user\'s description and create a draft for confirmation. Use when the user describes a visit/meeting/call but does NOT explicitly say "save" or "create".',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Activity title: Must be specific and meaningful, including key info (account name, topic, product). Examples: "Royal London Hospital - BeneVision N22 Demo", "Liverpool pricing follow-up". Never use generic titles like "Customer Visit" or "Phone Call".'
        },
        type: { type: 'string', description: 'Activity type', enum: ['visit', 'call', 'meeting', 'email'] },
        accountId: { type: 'string', description: 'Account ID (if known)' },
        accountName: { type: 'string', description: 'Account/company name' },
        contactName: { type: 'string', description: 'Contact name (single; for multiple meeting/visit attendees use contactNames)' },
        contactNames: { type: 'array', items: { type: 'string' }, description: 'List of attendee names for a meeting/visit. When the user mentions meeting/visiting several people, include each name, e.g. "meeting with Manager Zhang and Dr. Li" -> ["Manager Zhang","Dr. Li"].' },
        contactTitle: { type: 'string', description: 'Contact job title or department' },
        scheduledDate: { type: 'string', description: 'Date in ISO format YYYY-MM-DD' },
        result: { type: 'string', description: 'Activity details (stored in the description column). Include ONLY what the user explicitly stated (outcome / discussion points / stated purpose). If the user gave no details, leave this EMPTY — never invent a purpose, agenda, or background.' },
        opportunityId: { type: 'string', description: 'Related opportunity ID (if known)' },
        opportunityName: { type: 'string', description: 'Related opportunity name' },
        notes: { type: 'string', description: 'Notes - Put ALL valuable information that cannot be mapped to other structured fields here (e.g., company history, certifications, important background, partnerships, etc.)' },
      },
      required: ['title', 'type'],
    },
  },
  {
    name: 'draftOpportunity',
    displayName: { 'zh-Hans': '草拟商机', 'en-US': 'Draft Opportunity' },
    description: 'Extract opportunity info from the user\'s description and create a draft for confirmation. Use when the user mentions a new business opportunity/project/intent.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Opportunity name' },
        accountName: { type: 'string', description: 'Account/company name' },
        amount: { type: 'number', description: 'Estimated amount' },
        stage: { type: 'string', description: 'Stage', enum: ['prospecting', 'qualification', 'proposal', 'negotiation'] },
        confidence: { type: 'number', description: 'Confidence 0-100' },
        expectedCloseDate: { type: 'string', description: 'Expected close date YYYY-MM-DD' },
        lastAction: { type: 'string', description: 'Last action / note' },
      },
      required: ['name'],
    },
  },
  {
    name: 'draftAccount',
    displayName: { 'zh-Hans': '草拟客户', 'en-US': 'Draft Account' },
    description: 'Extract account info from the user\'s description and create a draft for confirmation. Use when the user wants to add a new account/company.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Account/company name' },
        industry: { type: 'string', description: 'Industry' },
        region: { type: 'string', description: 'Region', enum: ['华东', '华北', '华南', '西南'] },
        tier: { type: 'string', description: 'Tier', enum: ['S', 'A', 'B', 'C'] },
        phone: { type: 'string', description: 'Phone' },
        email: { type: 'string', description: 'Email' },
        address: { type: 'string', description: 'Address' },
        notes: { type: 'string', description: 'Notes' },
      },
      required: ['name'],
    },
  },
  {
    name: 'draftContact',
    displayName: { 'zh-Hans': '草拟联系人', 'en-US': 'Draft Contact' },
    description: 'Extract contact info from the user\'s description and create a draft for confirmation. Use when the user wants to add a new contact/person. A contact is a person at a customer company (e.g. Dr. Smith, Manager Wang), NOT the company itself.',
    parameters: {
      type: 'object',
      properties: {
        fullName: { type: 'string', description: 'Full name' },
        accountName: { type: 'string', description: 'Account/company name' },
        title: { type: 'string', description: 'Job title' },
        phone: { type: 'string', description: 'Phone' },
        email: { type: 'string', description: 'Email' },
      },
      required: ['fullName'],
    },
  },


  // ===== Update Functions =====
  {
    name: 'updateAccount',
    displayName: { 'zh-Hans': '更新客户', 'en-US': 'Update Account' },
    subject: 'account',
    description: 'Update existing account information. Use when the user says "update account", "modify account", "change this account\'s XX to XX".',
    parameters: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Account ID (required for update)' },
        accountName: { type: 'string', description: 'Account name (for matching)' },
        name: { type: 'string', description: 'New account name' },
        industry: { type: 'string', description: 'New industry' },
        region: { type: 'string', description: 'New region', enum: ['华东', '华北', '华南', '西南'] },
        tier: { type: 'string', description: 'New tier', enum: ['S', 'A', 'B', 'C'] },
        phone: { type: 'string', description: 'New phone' },
        email: { type: 'string', description: 'New email' },
        address: { type: 'string', description: 'New address' },
        notes: { type: 'string', description: 'New notes' },
      },
      required: [],
    },
  },
  {
    name: 'updateOpportunity',
    displayName: { 'zh-Hans': '更新商机', 'en-US': 'Update Opportunity' },
    subject: 'opportunity',
    description: 'Update existing opportunity information. Use when the user says "update opportunity", "change amount to XX", "adjust revenue". When the user is on an opportunity detail page or has just queried an opportunity and then says "update amount" etc., resolve opportunityId from the page context.',
    parameters: {
      type: 'object',
      properties: {
        opportunityId: { type: 'string', description: 'Opportunity ID (required for update)' },
        opportunityName: { type: 'string', description: 'Opportunity name (for matching)' },
        accountId: { type: 'string', description: 'Related account ID' },
        accountName: { type: 'string', description: 'Related account name (fuzzy matched)' },
        name: { type: 'string', description: 'New opportunity name' },
        amount: { type: 'number', description: 'New amount (e.g., 300000 for 300k, 2000000 for 2M)' },
        stage: { type: 'string', description: 'New stage', enum: ['prospecting', 'qualification', 'proposal', 'negotiation', 'won', 'lost'] },
        confidence: { type: 'number', description: 'New confidence 0-100' },
        expectedCloseDate: { type: 'string', description: 'New expected close date YYYY-MM-DD' },
        lastAction: { type: 'string', description: 'New last action notes' },
      },
      required: [],
    },
  },
  {
    name: 'updateActivity',
    displayName: { 'zh-Hans': '更新活动', 'en-US': 'Update Activity' },
    subject: 'activity',
    description: 'Update an existing activity: change date/title/notes/status, and add or remove meeting/visit attendees. Use when the user says "update activity", "change the activity date to XX", "add Zhang San to this meeting", "add Robert to this meeting", or "remove Li Si from the meeting".',
    parameters: {
      type: 'object',
      properties: {
        activityId: { type: 'string', description: 'Activity ID (required for update)' },
        activityTitle: { type: 'string', description: 'Activity title (for matching)' },
        title: { type: 'string', description: 'New activity title' },
        type: { type: 'string', description: 'New activity type', enum: ['visit', 'call', 'meeting', 'email'] },
        scheduledDate: { type: 'string', description: 'New scheduled date YYYY-MM-DD' },
        result: { type: 'string', description: 'New result' },
        notes: { type: 'string', description: 'New notes' },
        status: { type: 'string', description: 'New status', enum: ['open', 'completed', 'canceled'] },
        opportunityId: { type: 'string', description: 'Related opportunity ID' },
        opportunityName: { type: 'string', description: 'Related opportunity name (fuzzy matched)' },
        accountId: { type: 'string', description: 'Related account ID' },
        accountName: { type: 'string', description: 'Related account name (fuzzy matched)' },
        addAttendeeNames: { type: 'array', items: { type: 'string' }, description: 'Names of contacts to ADD as attendees of a meeting/visit. Fill when the user says "add Zhang San to this meeting" or "add Robert to this meeting".' },
        removeAttendeeNames: { type: 'array', items: { type: 'string' }, description: 'Names of contacts to REMOVE from a meeting/visit. Fill when the user says "remove Li Si from the meeting" or "remove John from the meeting".' },
      },
      required: [],
    },
  },
  {
    name: 'updateContact',
    displayName: { 'zh-Hans': '更新联系人', 'en-US': 'Update Contact' },
    subject: 'contact',
    description: 'Update existing contact information. Use when the user says "update contact", "change the contact\'s phone", "change this contact\'s email to XX".',
    parameters: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'Contact ID (required for update)' },
        contactName: { type: 'string', description: 'Contact name (for matching)' },
        fullName: { type: 'string', description: 'New full name' },
        title: { type: 'string', description: 'New title' },
        phone: { type: 'string', description: 'New phone' },
        email: { type: 'string', description: 'New email' },
      },
      required: [],
    },
  },

  // ===== Copilot Studio Tool =====
  {
    name: 'queryCopilotStudio',
    displayName: { 'zh-Hans': '产品知识查询', 'en-US': 'Product Knowledge Query' },
    description: 'ALL product knowledge queries route here — features, specifications, parameters, technical principles, usage instructions, FAQ, troubleshooting, model comparisons, certifications, warranty, manuals. The runtime auto-prepends page / account / product / dialog context to the payload before sending to Copilot Studio, so just pass the user\'s ORIGINAL question verbatim in `query`. Only resolve pronouns ("this product" → actual product name) when the referent is unambiguous; otherwise leave it for CS. Do NOT use this for queries about CRM records (opportunities, customers, activities) — those go to Dataverse functions.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'User\'s product-related question (verbatim, do not paraphrase)' },
      },
      required: ['query'],
    },
  },

  // ===== External Knowledge (Copilot Studio fallback for non-Dataverse queries) =====
  {
    name: 'externalKnowledgeQuery',
    displayName: { 'zh-Hans': '外部知识查询', 'en-US': 'External Knowledge Query' },
    description: 'Non-product external knowledge: industry trends, regulations, competitor news, general business knowledge — anything not covered by local Dataverse AND not about the company\'s own products. For PRODUCT knowledge (features, specs, manuals, comparisons, principles, FAQ), use `queryCopilotStudio` instead.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'User\'s question' },
      },
      required: ['query'],
    },
  },

  // ===== Planning Functions =====
  {
    name: 'suggestPlan',
    displayName: { 'zh-Hans': '智能规划', 'en-US': 'Suggest Plan' },
    description: 'Intelligently plan sales tasks for a target date/period based on pipeline urgency, client revisit needs, and the existing schedule. Use when the user says "plan my schedule for tomorrow", "create tomorrow\'s tasks", "plan next week", or "plan next week\'s work".',
    parameters: {
      type: 'object',
      properties: {
        targetDate: { type: 'string', description: 'Target date YYYY-MM-DD, defaults to tomorrow' },
        period: { type: 'string', description: 'Planning window: "day" for a single day or "week" (default). "plan my week" -> "week"; "plan tomorrow" -> "day".', enum: ['day', 'week'], },
        focus: { type: 'string', description: 'Optional focus area, e.g. close deals / client visits / follow-ups' },
        maxTasks: { type: 'number', description: 'Max suggestions, default 5' },
      },
      required: [],
    },
  },

  // ===== LLM-backed AI Skills (page-level AI, also callable from dialog) =====
  {
    name: 'generateInsight',
    displayName: { 'zh-Hans': '生成业务洞察', 'en-US': 'Generate Business Insight' },
    description: 'Analyze business data and generate actionable insight cards with rationale and type classification.',
    llmBacked: true,
    responseFormat: 'text',
    outputSchema: z.array(z.object({
      insight: z.string(),
      rationale: z.string(),
      type: z.string(),
    })),
    promptTemplate: `You are a senior sales analyst. Based on the sales data below, generate business insights. Each insight must reference specific client names, opportunity names, and amounts.
Requirements:
1. insight: Key point (one sentence)
2. rationale: Specific reason and recommendation (cite data)
3. type: Insight type (followup/closing/risk/revisit/performance/opportunity/client/activity)
FORBIDDEN: Do NOT fabricate client/opportunity names; do NOT use vague phrases.
Return JSON array: [{"insight":"...","rationale":"...","type":"..."}]
Return ONLY the JSON array.`,
    parameters: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'Business data to analyze (stringified)' },
      },
      required: ['data'],
    },
  },
  {
    name: 'generateBriefTranscript',
    displayName: { 'zh-Hans': '生成播报稿', 'en-US': 'Generate Brief Transcript' },
    description: 'Convert insight bullet points into a natural TTS voice briefing script.',
    llmBacked: true,
    responseFormat: 'text',
    outputSchema: z.string().min(1),
    promptTemplate: `You are a professional sales assistant delivering today's business briefing. Based on the insights below, generate a complete, fluent, natural voice briefing script.
Requirements: friendly professional tone, mention specific clients/opportunities/amounts, blank lines between paragraphs, no markdown, keep to 1-2 minutes read aloud.`,
    parameters: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'Insight list text to convert to briefing' },
      },
      required: ['data'],
    },
  },
  {
    name: 'summarizeEntities',
    displayName: { 'zh-Hans': '实体 AI 摘要', 'en-US': 'Summarize Entities' },
    description: 'Generate exactly 4 AI summary cards for a set of entities (accounts, opportunities, etc).',
    llmBacked: true,
    responseFormat: 'text',
    outputSchema: z.array(z.object({
      title: z.string(),
      content: z.string(),
    })),
    promptTemplate: `You are an AI assistant for a sales manager. Based on the data below, generate exactly 4 summary cards as a JSON array. Each card focuses on a different angle.
Return format: [{"title":"Title","content":"Content (2-3 sentences, concise and actionable)"}]
Return ONLY the JSON array.`,
    parameters: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'Entity data to summarize (stringified)' },
        entityType: { type: 'string', description: 'Type of entities being summarized', enum: ['account', 'opportunity', 'activity', 'contact'] },
      },
      required: ['data'],
    },
  },
  {
    name: 'generateEntitySummary',
    displayName: { 'zh-Hans': '实体行动摘要', 'en-US': 'Generate Entity Summary' },
    description: 'Generate a concise markdown summary with actionable next steps for one entity context.',
    llmBacked: true,
    responseFormat: 'text',
    outputSchema: z.string().min(1),
    promptTemplate: `You are a sales assistant. Follow the user's requested structure and constraints exactly.
Return plain Markdown text only. Do not return JSON. Do not wrap output in code fences. Do not add extra disclaimers.`,
    parameters: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'Prompt content that includes entity context and required markdown sections' },
        entityType: { type: 'string', description: 'Entity type for context', enum: ['account', 'opportunity', 'activity', 'contact'] },
      },
      required: ['data'],
    },
  },
  {
    name: 'analyzeOpportunity',
    displayName: { 'zh-Hans': '商机分析', 'en-US': 'Analyze Opportunity' },
    description: 'Analyze visit data to determine if there is a sales opportunity, and check for duplicates with existing opportunities.',
    llmBacked: true,
    responseFormat: 'text',
    outputSchema: z.object({
      hasOpportunity: z.boolean(),
      opportunityName: z.string().optional(),
      estimatedAmount: z.number().optional(),
      confidence: z.number().optional(),
      stage: z.string().optional(),
      matchingOpportunityId: z.string().optional(),
    }).passthrough(),
    promptTemplate: `You are a sales AI assistant. Analyze the visit record below to determine if it contains a sales opportunity.
Return JSON: {"hasOpportunity":bool,"opportunityName":"","estimatedAmount":0,"confidence":0-100,"stage":"prospecting|qualification","matchingOpportunityId":"if duplicate with existing opp, fill existing ID"}
If no opportunity, set hasOpportunity to false and leave other fields empty.`,
    parameters: {
      type: 'object',
      properties: {
        visitData: { type: 'string', description: 'Visit record data (stringified)' },
        existingOpportunities: { type: 'string', description: 'Existing opportunities for dedup (stringified)' },
      },
      required: ['visitData'],
    },
  },

  // ===== Post-processing / UX enhancement skills =====
  {
    name: 'narrateTask',
    displayName: { 'zh-Hans': '任务播报', 'en-US': 'Narrate Task' },
    description: 'Generate a context-aware one-sentence announcement for a multi-step task, carrying forward entity names from prior steps.',
    llmBacked: true,
    responseFormat: 'text',
    outputSchema: z.string().min(1).max(120),
    promptTemplate: `You are the narrator for a sales assistant's multi-step task flow. Announce the NEXT task in one natural sentence, carrying forward the key entities (account / contact / opportunity names) that prior tasks have already resolved. Output ONE sentence only (max 20 words). No prefix, no quotes, no explanation.`,
    parameters: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'Task context including progress, prior outcomes, and next task label' },
      },
      required: ['data'],
    },
  },
  {
    name: 'summarizeDAGResults',
    displayName: { 'zh-Hans': 'DAG 汇总报告', 'en-US': 'Summarize DAG Results' },
    description: 'Aggregate results from a completed multi-step query DAG into a coherent markdown report.',
    llmBacked: true,
    responseFormat: 'text',
    outputSchema: z.string().min(1),
    promptTemplate: `You are a sales assistant. The user requested a multi-step analysis. Below are the query results from each step. Generate a complete, insightful report based on all the data to answer the user's original request. Use markdown format with clear sections.
Ground every statement in the returned data ONLY: never invent records, names, amounts, or dates, and never assert a relationship the data does not support (e.g. do NOT present a general pipeline or account list as "today's visits", and do NOT relabel which day a record belongs to). If a step returned nothing relevant, say so plainly. Use today's date exactly as provided in the input — do not shift it.`,
    parameters: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'Step summaries and user message for report generation' },
      },
      required: ['data'],
    },
  },
  {
    name: 'analyzeResults',
    displayName: { 'zh-Hans': '结果分析', 'en-US': 'Analyze Results' },
    description: 'Reason over records already fetched by a prior query step. Either answer grounded in those records, or request ONE more grounded query when they cannot answer.',
    llmBacked: true,
    responseFormat: 'json-generic',
    outputSchema: z.object({
      answer: z.string().optional(),
      followupQuery: z.object({
        function: z.string(),
        arguments: z.record(z.unknown()).optional(),
        reason: z.string().optional(),
      }).optional(),
    }).passthrough(),
    promptTemplate: `You are a sales assistant. A prior step fetched real CRM records (provided below). Return EXACTLY ONE JSON object, choosing one shape:
- Answer now (when the fetched records already contain what's needed): {"answer":"<concise, grounded answer that ranks/prioritizes/compares/summarizes as the user asked; cite specific record names and values; do not dump the full raw list>"}
- Fetch ONE more thing first (when the fetched records LACK what the user asked for but a related entity WOULD contain it): {"followupQuery":{"function":"queryAccounts|queryOpportunities|queryActivities|queryContacts","arguments":{<concrete filters taken from the fetched records, e.g. {"accountName":"<a name present in the data>"}>},"reason":"<why one more query is needed>"}}
Decide by what the question needs: if only account rows were fetched but the user asks about that account's deals, activity, or overall health, request the matching follow-up (queryOpportunities / queryActivities by that accountName) INSTEAD of replying that the data is insufficient. Prefer answering only when the current records already suffice. NEVER invent records, names, amounts, or dates — ground strictly in the provided records. If even a follow-up cannot help, answer plainly that the data does not cover it.`,
    parameters: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'User request plus the fetched records (JSON) to reason over' },
      },
      required: ['data'],
    },
  },
  {
    name: 'generateVoiceSummary',
    displayName: { 'zh-Hans': '语音摘要', 'en-US': 'Voice Summary' },
    description: 'Summarize content into a brief voice announcement suitable for TTS playback.',
    llmBacked: true,
    responseFormat: 'text',
    outputSchema: z.string().min(1),
    promptTemplate: `You are an assistant that summarizes content into brief voice announcements. Use concise, natural spoken language, summarizing key information in no more than 3 sentences.`,
    parameters: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'Content to summarize for voice announcement' },
      },
      required: ['data'],
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

/**
 * The required subject entity for an action tool (updateOpportunity → 'opportunity'),
 * or undefined for tools that don't mutate a single existing record. Drives the
 * runtime's missing-subject gate.
 */
export function getFunctionSubject(
  functionName: string,
): 'account' | 'contact' | 'opportunity' | 'activity' | undefined {
  return availableFunctions.find((f) => f.name === functionName)?.subject;
}

// ===== Argument coercion (input contract) =====
// The JSON `parameters` block is only advisory to the LLM — at runtime the model
// may emit an array where a string is declared ("negotiation and proposal" →
// ['negotiation','proposal']), a numeric string for a number, etc. Handlers then
// crash on `x.toLowerCase()` / silently misbehave ("LLM argument type drift").
//
// This is the INPUT mirror of `outputSchema`: the executor coerces raw args
// against a schema DERIVED from each function's own `parameters` before dispatch,
// so the fix lives at one boundary (the dispatcher) driven by the single source
// of truth (the declared contract) — not scattered per-handler defensive casts.
//
// Coercion is conservative: only fields declared scalar string/number/boolean or
// array-of-string are normalized; object / complex / undeclared args pass through
// untouched so structured payloads (attendees, stringified data) are never harmed.

const ARG_SPLIT_RE = /[,;、，]/;

/** Any value → scalar string (or undefined when empty). A scalar field given an
 *  array collapses to its first non-empty element; objects are dropped (never
 *  fed to string handlers). */
const zScalarString = z.unknown().transform((v) => {
  if (v == null) return undefined;
  if (Array.isArray(v)) {
    const first = v.find((x) => x != null && String(x).trim() !== '');
    return first == null ? undefined : String(first);
  }
  if (typeof v === 'object') return undefined;
  const s = String(v);
  return s.trim() === '' ? undefined : s;
});

/** Any value → finite number (or undefined). Accepts numeric strings; arrays use
 *  their first element. */
const zScalarNumber = z.unknown().transform((v) => {
  if (v == null || v === '') return undefined;
  const raw = Array.isArray(v) ? v[0] : v;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : undefined;
});

/** Any value → boolean. */
const zScalarBoolean = z.unknown().transform((v) => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') { const s = v.trim().toLowerCase(); return s === 'true' || s === '1' || s === 'yes'; }
  return Boolean(v);
});

/** string | array → string[] (multi-value fields). Splits comma/CJK separators so
 *  a "negotiation, proposal" string and a ['negotiation','proposal'] array both
 *  normalize to a clean list. */
const zStringArray = z.unknown().transform((v) => {
  const raw = Array.isArray(v) ? v : v == null || v === '' ? [] : [v];
  return raw
    .flatMap((x) => (x == null ? [] : String(x).split(ARG_SPLIT_RE)))
    .map((s) => s.trim())
    .filter(Boolean);
});

function coercerForParam(p: FunctionParameter): ZodTypeAny | null {
  switch (p.type) {
    case 'string': return zScalarString;
    case 'number':
    case 'integer': return zScalarNumber;
    case 'boolean': return zScalarBoolean;
    // Only arrays of scalars are coerced; object arrays / unspecified items are
    // left untouched to avoid corrupting structured args.
    case 'array': return p.items?.type === 'string' ? zStringArray : null;
    default: return null; // object / unknown → passthrough
  }
}

const _argsCoercerCache = new Map<string, ZodTypeAny | null>();

/**
 * Build (memoized) a coercing schema for a function's args, derived from its
 * declared `parameters`. Returns null when no field is coercible. Unknown keys
 * pass through untouched.
 */
export function getArgsCoercer(functionName: string): ZodTypeAny | null {
  const cached = _argsCoercerCache.get(functionName);
  if (cached !== undefined) return cached;
  const def = availableFunctions.find((f) => f.name === functionName);
  let schema: ZodTypeAny | null = null;
  const props = def?.parameters?.properties;
  if (props) {
    const shape: Record<string, ZodTypeAny> = {};
    for (const [key, p] of Object.entries(props)) {
      const c = coercerForParam(p);
      if (c) shape[key] = c.optional();
    }
    if (Object.keys(shape).length > 0) schema = z.object(shape).passthrough();
  }
  _argsCoercerCache.set(functionName, schema);
  return schema;
}

/**
 * Coerce raw LLM tool-call args against the derived input contract.
 * Coerce-not-block: a malformed arg must never abort the call, so any parse
 * failure returns the original args. Fields that coerce to `undefined` are
 * stripped so handler `|| default` fallbacks still apply.
 */
export function coerceArgs(functionName: string, args: Record<string, unknown>): Record<string, unknown> {
  const schema = getArgsCoercer(functionName);
  if (!schema) return args;
  const parsed = schema.safeParse(args);
  if (!parsed.success) return args;
  const out = parsed.data as Record<string, unknown>;
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}
