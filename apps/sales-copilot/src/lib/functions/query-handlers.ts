/**
 * Query handlers — queryAccounts / queryOpportunities / queryActivities / queryContacts
 */

import { AccountService } from '@/generated/services/account-service';
import { OpportunityService } from '@/generated/services/opportunity-service';
import { ActivityService } from '@/generated/services/activity-service';
import { ContactService } from '@/generated/services/contact-service';
import type { Account } from '@/generated/models/account-model';
import type { Opportunity } from '@/generated/models/opportunity-model';
import type { Activity } from '@/generated/models/activity-model';
import type { Contact } from '@/generated/models/contact-model';
import { registerHandlers, type FunctionHandler } from './handler-registry';
import { diagRetrieve, resolveAccountByName } from './_shared';
import { activityStatus, normalizeQueryStatus } from '@/lib/activity-status';

/**
 * Canonical opportunity stages stored in Dataverse (lowercase):
 * prospecting / qualification / proposal / negotiation / won / lost.
 * The LLM may emit them Capitalized, in English variants, or in Chinese.
 * Map all known synonyms to the canonical value so stage filters don't
 * silently return 0. (Extends Defect D1 — adds Chinese + English aliases.)
 */
const STAGE_ALIASES: Record<string, string> = {
  // prospecting
  prospecting: 'prospecting', prospect: 'prospecting', lead: 'prospecting', leads: 'prospecting',
  '潜在': 'prospecting', '潜在客户': 'prospecting', '线索': 'prospecting', '初步接触': 'prospecting', '勘探': 'prospecting',
  // qualification
  qualification: 'qualification', qualify: 'qualification', qualified: 'qualification',
  '资格审查': 'qualification', '资格认定': 'qualification', '确认': 'qualification', '需求确认': 'qualification',
  // proposal
  proposal: 'proposal', proposing: 'proposal', quote: 'proposal', quotation: 'proposal',
  '提案': 'proposal', '方案': 'proposal', '报价': 'proposal', '方案报价': 'proposal',
  // negotiation
  negotiation: 'negotiation', negotiating: 'negotiation', negotiate: 'negotiation',
  '谈判': 'negotiation', '商务谈判': 'negotiation', '议价': 'negotiation',
  // won
  won: 'won', win: 'won', closedwon: 'won', 'closed won': 'won',
  '赢单': 'won', '成交': 'won', '已赢': 'won', '赢得': 'won',
  // lost
  lost: 'lost', lose: 'lost', closedlost: 'lost', 'closed lost': 'lost',
  '输单': 'lost', '丢单': 'lost', '已输': 'lost', '失败': 'lost',
};

function normalizeStage(raw: string): string {
  // Coerce defensively: the LLM sometimes passes a non-string (e.g. an array for
  // multi-stage queries), which used to crash here with "raw.trim is not a function".
  const s = String(raw ?? '').trim();
  const key = s.toLowerCase();
  return STAGE_ALIASES[key] ?? STAGE_ALIASES[s] ?? key;
}

export { normalizeStage };

const queryAccounts: FunctionHandler = async (args, ctx) => {
  const accounts = await AccountService.getAll();
  let filtered = [...accounts];
  const accountId = args.accountId as string | undefined;
  const nameQuery = (args.name as string || args.query as string || '').toLowerCase();
  const sortBy = args.sortBy as string | undefined;
  const limit = (args.limit as number) || 20;

  if (accountId) {
    const account = await diagRetrieve('queryAccounts:getById', accountId,
      () => AccountService.get(accountId), () => AccountService.getAll());
    return { success: true, data: account };
  }

  if (nameQuery) filtered = filtered.filter((a: Account) => a.name1?.toLowerCase().includes(nameQuery));



  return {
    success: true,
    data: filtered.slice(0, limit).map((a: Account) => ({
      id: a.id, name: a.name1, industry: a.industry,
      phone: a.phone, email: a.email,
    })),
  };
};

const queryOpportunities: FunctionHandler = async (args, ctx) => {
  const opportunities = await OpportunityService.getAll();
  let filtered = [...opportunities];
  let oppAccountId = args.accountId as string | undefined;
  if (!oppAccountId && args.accountName) {
    oppAccountId = await resolveAccountByName(args.accountName as string);
  }
  const stage = args.stage;
  const closingWithinDays = args.closingWithinDays as number | undefined ?? (args.days as number | undefined);
  const minAmount = args.minAmount as number | undefined;
  const minConfidence = args.minConfidence as number | undefined;
  const maxConfidence = args.maxConfidence as number | undefined;
  const oppSortBy = args.sortBy as string | undefined;
  const oppLimit = (args.limit as number) || 20;

  // No client-side owner filter: OpportunityService.getAll is already
  // security-trimmed by Dataverse to the records this user can read.
  if (oppAccountId) filtered = filtered.filter((o: Opportunity) => o.account?.id === oppAccountId);
  // Stage is stored lowercase (prospecting/qualification/proposal/negotiation/won/lost)
  // but the LLM often emits it Capitalized ("Negotiation"), in English variants, or in
  // Chinese ("谈判"). normalizeStage maps all known synonyms to the canonical value so
  // "谈判阶段商机" / "negotiation stage" don't return 0. (Defect D1 + Chinese aliases)
  // The LLM may also pass MULTIPLE stages (e.g. "negotiation and proposal") as an array
  // or a comma-joined string; match any of them.
  if (stage != null && stage !== '') {
    const stageList = (Array.isArray(stage) ? stage : [stage])
      .flatMap((s) => String(s).split(/[,;、，]/))
      .map((s) => normalizeStage(s))
      .filter(Boolean);
    if (stageList.length) {
      filtered = filtered.filter((o: Opportunity) => stageList.includes((o.stage ?? '').toLowerCase()));
    }
  }
  if (minAmount) filtered = filtered.filter((o: Opportunity) => o.totalamount >= minAmount);
  // Confidence range filter — used by "at risk" (minConfidence:0,maxConfidence:49).
  // Previously these args were silently ignored, so risk queries never narrowed. (Defect D1)
  if (minConfidence !== undefined) filtered = filtered.filter((o: Opportunity) => (o.confidence ?? 0) >= minConfidence);
  if (maxConfidence !== undefined) filtered = filtered.filter((o: Opportunity) => (o.confidence ?? 0) <= maxConfidence);
  if (closingWithinDays) {
    const now = new Date();
    const cutoff = new Date(now.getTime() + closingWithinDays * 86400000);
    filtered = filtered.filter((o: Opportunity) => {
      if (!o.expectedclosedate) return false;
      const close = new Date(o.expectedclosedate);
      return close >= now && close <= cutoff;
    });
  }

  if (oppSortBy === 'amount') {
    filtered.sort((a, b) => b.totalamount - a.totalamount);
  } else if (oppSortBy === 'closeDate') {
    filtered.sort((a, b) => new Date(a.expectedclosedate || 0).getTime() - new Date(b.expectedclosedate || 0).getTime());
  } else if (oppSortBy === 'confidence') {
    // Ascending: lowest-confidence (most at-risk) first.
    filtered.sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0));
  }

  return {
    success: true,
    data: filtered.slice(0, oppLimit).map((o: Opportunity) => ({
      id: o.id, name: o.name1, account: o.account?.name1,
      amount: o.totalamount, stage: o.stage,
      confidence: o.confidence, expectedCloseDate: o.expectedclosedate,
    })),
  };
};

const queryActivities: FunctionHandler = async (args, ctx) => {
  const activities = await ActivityService.getAll();
  let filteredAct = [...activities];
  let actAccountId = args.accountId as string | undefined;
  if (!actAccountId && args.accountName) {
    actAccountId = await resolveAccountByName(args.accountName as string);
  }
  const actType = args.type as string | undefined;
  let dateRange = args.dateRange as string | undefined;
  let scheduledDate = args.scheduledDate as string | undefined;
  const dateFrom = args.dateFrom as string | undefined;
  const dateTo = args.dateTo as string | undefined;
  const actStatus = args.status as string | undefined;
  const actSortBy = args.sortBy as string | undefined;
  const actLimit = (args.limit as number) || 20;

  if (!dateRange && !scheduledDate && !dateFrom && !dateTo) {
    const pageData = ctx.pageContext?.pageData as Record<string, unknown> | undefined;
    const currentDate = pageData?.currentDate as string | undefined;
    if (currentDate) {
      scheduledDate = new Date(currentDate).toISOString().split('T')[0];
    } else {
      dateRange = 'today';
    }
  }

  if (actAccountId) filteredAct = filteredAct.filter((a: Activity) => a.account?.id === actAccountId);
  // Case-insensitive: type/status stored lowercase, LLM may Capitalize. (Defect D1 class)
  if (actType) {
    const t = actType.toLowerCase();
    filteredAct = filteredAct.filter((a: Activity) => (a.type ?? '').toLowerCase() === t);
  }
  if (actStatus) {
    // Map the agent's status word (incl. legacy draft/confirmed) to a canonical
    // state, then compare against the activity's canonical status. Unknown → skip.
    const wanted = normalizeQueryStatus(actStatus);
    if (wanted) filteredAct = filteredAct.filter((a: Activity) => activityStatus(a) === wanted);
  }

  if (scheduledDate) {
    const dayStart = new Date(`${scheduledDate}T00:00:00`);
    const dayEnd = new Date(`${scheduledDate}T23:59:59.999`);
    filteredAct = filteredAct.filter((a: Activity) => {
      if (!a.scheduleddate) return false;
      const d = new Date(a.scheduleddate);
      return !Number.isNaN(d.getTime()) && d >= dayStart && d <= dayEnd;
    });
  } else if (dateFrom || dateTo) {
    filteredAct = filteredAct.filter((a: Activity) => {
      if (!a.scheduleddate) return false;
      const d = a.scheduleddate.split('T')[0];
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  } else if (dateRange) {
    const now = new Date();
    if (dateRange === 'today') {
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);
      filteredAct = filteredAct.filter((a: Activity) => {
        if (!a.scheduleddate) return false;
        const d = new Date(a.scheduleddate);
        return !Number.isNaN(d.getTime()) && d >= todayStart && d <= todayEnd;
      });
    } else {
      const days = dateRange === '7days' ? 7 : dateRange === '30days' ? 30 : 365;
      const cutoff = new Date(now.getTime() + days * 86400000);
      filteredAct = filteredAct.filter((a: Activity) => {
        if (!a.scheduleddate) return false;
        const d = new Date(a.scheduleddate);
        return d >= now && d <= cutoff;
      });
    }
  }

  if (actSortBy === 'type') {
    filteredAct.sort((a, b) => (a.type || '').localeCompare(b.type || ''));
  } else {
    filteredAct.sort((a, b) => new Date(a.scheduleddate || 0).getTime() - new Date(b.scheduleddate || 0).getTime());
  }

  return {
    success: true,
    data: filteredAct.slice(0, actLimit).map((a: Activity) => ({
      id: a.id, title: a.title, type: a.type,
      account: a.account?.name1, scheduledDate: a.scheduleddate,
      status: a.status, notes: a.notes,
    })),
  };
};

const queryContacts: FunctionHandler = async (args, ctx) => {
  const contacts = await ContactService.getAll();
  let filteredContacts = [...contacts];
  let ctAccountId = args.accountId as string | undefined;
  if (!ctAccountId && args.accountName) {
    ctAccountId = await resolveAccountByName(args.accountName as string);
  }
  const ctName = (args.name as string || '').toLowerCase();
  const ctTitle = (args.title as string || '').toLowerCase();
  const ctLimit = (args.limit as number) || 20;

  if (ctAccountId) filteredContacts = filteredContacts.filter((c: Contact) => c.account?.id === ctAccountId);
  if (ctName) filteredContacts = filteredContacts.filter((c: Contact) => c.fullname?.toLowerCase().includes(ctName));
  if (ctTitle) filteredContacts = filteredContacts.filter((c: Contact) => c.title?.toLowerCase().includes(ctTitle));

  return {
    success: true,
    data: filteredContacts.slice(0, ctLimit).map((c: Contact) => ({
      id: c.id, name: c.fullname, title: c.title,
      phone: c.phone, email: c.email, accountName: c.account?.name1,
    })),
  };
};

// Register all query handlers
registerHandlers({
  queryAccounts,
  queryOpportunities,
  queryActivities,
  queryContacts,
});
