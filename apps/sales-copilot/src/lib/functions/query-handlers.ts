/**
 * Query handlers — queryAccounts / queryOpportunities / queryActivities / queryContacts
 */

import { AccountService } from '@/generated/services/account-service';
import { OpportunityService } from '@/generated/services/opportunity-service';
import { ActivityService } from '@/generated/services/activity-service';
import { ContactService } from '@/generated/services/contact-service';
import { getAdminMode } from '@/lib/i18n';
import type { Account } from '@/generated/models/account-model';
import type { Opportunity } from '@/generated/models/opportunity-model';
import type { Activity } from '@/generated/models/activity-model';
import type { Contact } from '@/generated/models/contact-model';
import { registerHandlers, type FunctionHandler } from './handler-registry';
import { diagRetrieve, resolveAccountByName } from './_shared';

const queryAccounts: FunctionHandler = async (args, ctx) => {
  const accounts = await AccountService.getAll();
  let filtered = [...accounts];
  const accountId = args.accountId as string | undefined;
  const nameQuery = (args.name as string || args.query as string || '').toLowerCase();
  const region = args.region as string | undefined;
  const tier = args.tier as string | undefined;
  const daysSinceLastContact = args.daysSinceLastContact as number | undefined;
  const sortBy = args.sortBy as string | undefined;
  const limit = (args.limit as number) || 20;

  if (accountId) {
    const account = await diagRetrieve('queryAccounts:getById', accountId,
      () => AccountService.get(accountId), () => AccountService.getAll());
    return { success: true, data: account };
  }

  if (nameQuery) filtered = filtered.filter((a: Account) => a.name1?.toLowerCase().includes(nameQuery));
  if (region) filtered = filtered.filter((a: Account) => a.region === region);
  if (tier) filtered = filtered.filter((a: Account) => a.tier === tier);
  if (daysSinceLastContact) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysSinceLastContact);
    filtered = filtered.filter((a: Account) => {
      if (!a.lastcontactedon) return true;
      return new Date(a.lastcontactedon) < cutoff;
    });
  }

  if (sortBy === 'lastContacted') {
    filtered.sort((a, b) => {
      const da = a.lastcontactedon ? new Date(a.lastcontactedon).getTime() : 0;
      const db = b.lastcontactedon ? new Date(b.lastcontactedon).getTime() : 0;
      return da - db;
    });
  } else if (sortBy === 'tier') {
    const tierOrder: Record<string, number> = { S: 0, A: 1, B: 2, C: 3 };
    filtered.sort((a, b) => (tierOrder[a.tier || 'C'] ?? 9) - (tierOrder[b.tier || 'C'] ?? 9));
  }

  return {
    success: true,
    data: filtered.slice(0, limit).map((a: Account) => ({
      id: a.id, name: a.name1, industry: a.industry,
      region: a.region, tier: a.tier, phone: a.phone,
      email: a.email, lastContactedOn: a.lastcontactedon,
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
  const stage = args.stage as string | undefined;
  const closingWithinDays = args.closingWithinDays as number | undefined ?? (args.days as number | undefined);
  const minAmount = args.minAmount as number | undefined;
  const oppSortBy = args.sortBy as string | undefined;
  const oppLimit = (args.limit as number) || 20;

  if (ctx.userId && !getAdminMode()) {
    filtered = filtered.filter((o: Opportunity) => o.ownerid === ctx.userId);
  }
  if (oppAccountId) filtered = filtered.filter((o: Opportunity) => o.account?.id === oppAccountId);
  if (stage) filtered = filtered.filter((o: Opportunity) => o.stage === stage);
  if (minAmount) filtered = filtered.filter((o: Opportunity) => o.totalamount >= minAmount);
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
  if (actType) filteredAct = filteredAct.filter((a: Activity) => a.type === actType);
  if (actStatus) filteredAct = filteredAct.filter((a: Activity) => a.draftStatus === actStatus);

  if (scheduledDate) {
    filteredAct = filteredAct.filter((a: Activity) => a.scheduleddate?.startsWith(scheduledDate));
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
    const today = now.toISOString().split('T')[0];
    if (dateRange === 'today') {
      filteredAct = filteredAct.filter((a: Activity) => a.scheduleddate?.startsWith(today));
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
      status: a.draftStatus, notes: a.notes,
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
