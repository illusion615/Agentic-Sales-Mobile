/**
 * Update handlers — updateAccount / updateOpportunity / updateActivity / updateContact
 */

import { AccountService } from '@/generated/services/account-service';
import { OpportunityService } from '@/generated/services/opportunity-service';
import { ActivityService } from '@/generated/services/activity-service';
import { ContactService } from '@/generated/services/contact-service';
import type { Account } from '@/generated/models/account-model';
import type { Opportunity } from '@/generated/models/opportunity-model';
import type { Activity } from '@/generated/models/activity-model';
import type { Contact } from '@/generated/models/contact-model';
import { touchAccountLastContacted } from '../account-touch';
import { registerHandlers, type FunctionHandler } from './handler-registry';
import { sanitizeForOData, diagRetrieve } from './_shared';
import { fetchActivityParticipants } from '../activity-party';

const updateAccount: FunctionHandler = async (args) => {
  const accountId = args.accountId as string;
  const accountName = args.accountName as string;
  let targetId = accountId;
  if (!targetId && accountName) {
    const accounts = await AccountService.getAll();
    const match = accounts.find((a: Account) => a.name1?.toLowerCase().includes(accountName.toLowerCase()));
    if (match) targetId = match.id;
  }
  if (!targetId) return { success: false, error: '缺少 accountId 或无法找到匹配的客户 / Missing accountId or cannot find matching account' };

  const accountChanges: Partial<Account> = {};
  if (args.name) accountChanges.name1 = args.name as string;
  if (args.industry) accountChanges.industry = args.industry as string;
  if (args.phone) accountChanges.phone = args.phone as string;
  if (args.email) accountChanges.email = args.email as string;
  if (args.address) accountChanges.address = args.address as string;
  if (args.notes) accountChanges.notes = args.notes as string;
  if (Object.keys(accountChanges).length === 0) return { success: false, error: '没有提供要更新的字段 / No fields to update' };

  await AccountService.update(targetId, sanitizeForOData(accountChanges));
  const updatedAccount = await diagRetrieve('updateAccount:readBack', targetId,
    () => AccountService.get(targetId), () => AccountService.getAll());
  return {
    success: true,
    data: { message: '客户信息已更新 / Account updated successfully', account: updatedAccount, updatedFields: Object.keys(accountChanges) },
    invalidateQueries: ['account-list'],
  };
};

const updateOpportunity: FunctionHandler = async (args) => {
  const opportunityId = args.opportunityId as string;
  const opportunityName = args.opportunityName as string;
  let targetId = opportunityId;
  if (!targetId && opportunityName) {
    const opportunities = await OpportunityService.getAll();
    const match = opportunities.find((o: Opportunity) => o.name1?.toLowerCase().includes(opportunityName.toLowerCase()));
    if (match) targetId = match.id;
  }
  if (!targetId) return { success: false, error: '缺少 opportunityId 或无法找到匹配的商机 / Missing opportunityId or cannot find matching opportunity' };

  const oppChanges: Partial<Opportunity> = {};
  if (args.name) oppChanges.name1 = args.name as string;
  if (args.amount !== undefined) oppChanges.totalamount = args.amount as number;
  if (args.stage) oppChanges.stage = args.stage as string;
  if (args.confidence !== undefined) oppChanges.confidence = args.confidence as number;
  if (args.expectedCloseDate) oppChanges.expectedclosedate = args.expectedCloseDate as string;
  if (args.lastAction) oppChanges.lastaction = args.lastAction as string;
  // Re-parent the opportunity to a different account ("change the opportunity's
  // account to X"). The service toDv() maps account.id → biz_Account@odata.bind.
  if (args.accountId || args.accountName) {
    const accounts = await AccountService.getAll();
    let targetAccount: Account | undefined;
    if (args.accountId) targetAccount = accounts.find((a: Account) => a.id === args.accountId);
    else if (args.accountName) {
      const n = (args.accountName as string).toLowerCase();
      targetAccount = accounts.find((a: Account) => a.name1?.toLowerCase().includes(n));
    }
    if (targetAccount) oppChanges.account = { id: targetAccount.id, name1: targetAccount.name1 };
  }
  if (oppChanges.stage === 'won' || oppChanges.stage === 'lost') {
    oppChanges.closedon = (args.closedon as string) || new Date().toISOString();
  }
  if (Object.keys(oppChanges).length === 0) return { success: false, error: '没有提供要更新的字段 / No fields to update' };

  await OpportunityService.update(targetId, sanitizeForOData(oppChanges));
  const updatedOpp = await diagRetrieve('updateOpportunity:readBack', targetId,
    () => OpportunityService.get(targetId), () => OpportunityService.getAll());
  return {
    success: true,
    data: { message: '商机信息已更新 / Opportunity updated successfully', opportunity: updatedOpp, updatedFields: Object.keys(oppChanges) },
    invalidateQueries: ['opportunity-list'],
  };
};

const updateActivity: FunctionHandler = async (args) => {
  const activityId = args.activityId as string;
  const activityTitle = args.activityTitle as string;
  let targetId = activityId;
  if (!targetId && activityTitle) {
    const activities = await ActivityService.getAll();
    const match = activities.find((a: Activity) => a.title?.toLowerCase().includes(activityTitle.toLowerCase()));
    if (match) targetId = match.id;
  }
  if (!targetId) return { success: false, error: '缺少 activityId 或无法找到匹配的活动 / Missing activityId or cannot find matching activity' };

  const actChanges: Partial<Activity> = {};
  if (args.title) actChanges.title = args.title as string;
  if (args.type) actChanges.type = args.type as Activity['type'];
  if (args.status) {
    const statusStr = (args.status as string).toLowerCase();
    const statusMap: Record<string, Activity['status']> = {
      'draft': 'open', 'confirmed': 'open', 'open': 'open',
      'completed': 'completed', 'done': 'completed', 'complete': 'completed', 'finished': 'completed',
      'cancelled': 'canceled', 'canceled': 'canceled', 'cancel': 'canceled',
      '草稿': 'open', '已确认': 'open', '确认': 'open',
      '已完成': 'completed', '完成': 'completed', '已取消': 'canceled', '取消': 'canceled',
    };
    if (statusMap[statusStr]) actChanges.status = statusMap[statusStr];
  }
  if (args.scheduledDate) actChanges.scheduleddate = args.scheduledDate as string;
  if (args.notes) actChanges.notes = args.notes as string;

  if (args.opportunityId || args.opportunityName) {
    const opportunities = await OpportunityService.getAll();
    let targetOpp: Opportunity | undefined;
    if (args.opportunityId) targetOpp = opportunities.find((o: Opportunity) => o.id === args.opportunityId);
    else if (args.opportunityName) {
      const n = (args.opportunityName as string).toLowerCase();
      targetOpp = opportunities.find((o: Opportunity) => o.name1?.toLowerCase().includes(n));
    }
    if (targetOpp) actChanges.opportunity = { id: targetOpp.id, name1: targetOpp.name1 };
  }

  if (args.accountId || args.accountName) {
    const accounts = await AccountService.getAll();
    let targetAccount: Account | undefined;
    if (args.accountId) targetAccount = accounts.find((a: Account) => a.id === args.accountId);
    else if (args.accountName) {
      const n = (args.accountName as string).toLowerCase();
      targetAccount = accounts.find((a: Account) => a.name1?.toLowerCase().includes(n));
    }
    if (targetAccount) actChanges.account = { id: targetAccount.id, name1: targetAccount.name1 };
  }

  // ===== Attendee changes (meeting/visit participants) =====
  const addNames = (args.addAttendeeNames as string[] | undefined) ?? [];
  // Also treat a bare contactName as an attendee to add (LLM may use it for "add X").
  if (args.contactName && typeof args.contactName === 'string') addNames.push(args.contactName as string);
  const removeNames = (args.removeAttendeeNames as string[] | undefined) ?? [];

  if (addNames.length > 0 || removeNames.length > 0) {
    const allContacts = await ContactService.getAll();
    const matchName = (name: string): Contact | undefined => {
      const n = name.toLowerCase().trim();
      return allContacts.find((c: Contact) => c.fullname?.toLowerCase() === n)
        ?? allContacts.find((c: Contact) => {
          const f = (c.fullname || '').toLowerCase();
          return f.length > 0 && (f.includes(n) || n.includes(f));
        });
    };

    // Start from the activity's current attendees so PATCH (replace-set) keeps them.
    const current = await fetchActivityParticipants(targetId);
    const byId = new Map<string, { id: string; fullname: string; role?: 'required' | 'optional' | 'organizer' }>(
      current.map((p) => [p.id, { id: p.id, fullname: p.name, role: p.role as 'required' | 'optional' | 'organizer' }]),
    );

    const notFound: string[] = [];
    for (const name of addNames) {
      const c = matchName(name);
      if (c) byId.set(c.id, { id: c.id, fullname: c.fullname || name, role: 'required' });
      else notFound.push(name);
    }
    for (const name of removeNames) {
      const c = matchName(name);
      if (c) byId.delete(c.id);
    }

    // A named attendee doesn't exist yet → offer to create them (draft card),
    // carrying the meeting's account so the new contact is linked correctly.
    if (notFound.length > 0) {
      return {
        success: true,
        data: {
          type: 'contact' as const,
          isNew: true,
          _fallbackDraft: true,
          data: {
            fullName: notFound[0],
            title: (args.contactTitle as string) || '',
            accountId: actChanges.account?.id || (args.accountId as string) || '',
            accountName: actChanges.account?.name1 || (args.accountName as string) || '',
          },
        },
      };
    }

    actChanges.contacts = Array.from(byId.values());
  }

  if (Object.keys(actChanges).length === 0) return { success: false, error: '没有提供要更新的字段 / No fields to update' };

  await ActivityService.update(targetId, sanitizeForOData(actChanges));
  const updatedActivity = await diagRetrieve('updateActivity:readBack', targetId,
    () => ActivityService.get(targetId), () => ActivityService.getAll());

  const touchedAccountId = updatedActivity?.account?.id;
  if (touchedAccountId) await touchAccountLastContacted(touchedAccountId, updatedActivity?.scheduleddate);

  return {
    success: true,
    data: { message: '活动记录已更新 / Activity updated successfully', activity: updatedActivity, updatedFields: Object.keys(actChanges) },
    invalidateQueries: touchedAccountId ? ['activity-list', 'account-list'] : ['activity-list'],
  };
};

const updateContact: FunctionHandler = async (args) => {
  const contactId = args.contactId as string;
  const contactName = args.contactName as string;
  let targetId = contactId;
  if (!targetId && contactName) {
    const contacts = await ContactService.getAll();
    const match = contacts.find((c: Contact) => c.fullname?.toLowerCase().includes(contactName.toLowerCase()));
    if (match) targetId = match.id;
  }
  if (!targetId) {
    // Contact not found. If the user named someone, offer to CREATE them
    // (return a draft-contact card) instead of dead-ending with an error.
    if (contactName) {
      return {
        success: true,
        data: {
          type: 'contact' as const,
          isNew: true,
          _fallbackDraft: true,
          data: {
            fullName: contactName,
            title: (args.title as string) || '',
            phone: (args.phone as string) || '',
            email: (args.email as string) || '',
            accountId: (args.accountId as string) || '',
            accountName: (args.accountName as string) || '',
          },
        },
      };
    }
    return { success: false, error: '缺少 contactId 或无法找到匹配的联系人 / Missing contactId or cannot find matching contact' };
  }

  const contactChanges: Partial<Contact> = {};
  if (args.fullName) contactChanges.fullname = args.fullName as string;
  if (args.title) contactChanges.title = args.title as string;
  if (args.phone) contactChanges.phone = args.phone as string;
  if (args.email) contactChanges.email = args.email as string;
  if (Object.keys(contactChanges).length === 0) return { success: false, error: '没有提供要更新的字段 / No fields to update' };

  await ContactService.update(targetId, sanitizeForOData(contactChanges));
  const updatedContact = await diagRetrieve('updateContact:readBack', targetId,
    () => ContactService.get(targetId), () => ContactService.getAll());
  return {
    success: true,
    data: { message: '联系人信息已更新 / Contact updated successfully', contact: updatedContact, updatedFields: Object.keys(contactChanges) },
    invalidateQueries: ['contact-list'],
  };
};

registerHandlers({
  updateAccount,
  updateOpportunity,
  updateActivity,
  updateContact,
});
