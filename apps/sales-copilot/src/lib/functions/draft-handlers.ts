/**
 * Draft handlers — draftActivity / draftOpportunity / draftAccount / draftContact
 * Pure data shaping — no service calls.
 */

import { registerHandlers, type FunctionHandler } from './handler-registry';

const draftActivity: FunctionHandler = async (args) => {
  const type = (args.type as string) || 'visit';
  const accountName = (args.accountName as string) || '';
  const contactName = (args.contactName as string) || '';
  // Defensive title synthesis (Defect D6): the Orchestrator LLM occasionally
  // omits the title on a step, leaving the card's Title field blank. Never ship
  // an empty title — synthesize a specific one from the account/contact + type.
  const typeLabel: Record<string, string> = {
    visit: 'Visit', call: 'Call', meeting: 'Meeting', email: 'Email', other: 'Activity',
  };
  let title = (args.title as string) || '';
  if (!title.trim()) {
    const who = accountName || contactName;
    const label = typeLabel[type] || 'Activity';
    title = who ? `${who} - ${label}` : label;
  }
  return {
    success: true,
    data: {
      type: 'activity' as const,
      isNew: true,
      data: {
        title,
        type,
        accountId: args.accountId as string || '',
        accountName,
        contactId: args.contactId as string || '',
        contactName,
        contactNames: (args.contactNames as string[]) || [],
        contactTitle: args.contactTitle as string || '',
        scheduledDate: args.scheduledDate as string || new Date().toISOString().split('T')[0],
        result: args.result as string || '',
        opportunityId: args.opportunityId as string || '',
        opportunityName: args.opportunityName as string || '',
        notes: args.notes as string || '',
        temporalMode: args.temporalMode as string || '',
      },
    },
  };
};

const draftOpportunity: FunctionHandler = async (args) => ({
  success: true,
  data: {
    type: 'opportunity' as const,
    isNew: true,
    data: {
      name: args.name as string || '',
      accountId: args.accountId as string || '',
      accountName: args.accountName as string || '',
      amount: args.amount as number || 0,
      stage: args.stage as string || 'prospecting',
      confidence: args.confidence as number || 50,
      expectedCloseDate: args.expectedCloseDate as string || '',
      lastAction: args.lastAction as string || '',
      _signals: args._signals,
      _signalConfidence: args._confidence,
    },
  },
});

const draftAccount: FunctionHandler = async (args) => ({
  success: true,
  data: {
    type: 'account' as const,
    isNew: true,
    data: {
      name: args.name as string || '',
      industry: args.industry as string || '',
      phone: args.phone as string || '',
      email: args.email as string || '',
      address: args.address as string || '',
      notes: args.notes as string || '',
    },
  },
});

const draftContact: FunctionHandler = async (args) => ({
  success: true,
  data: {
    type: 'contact' as const,
    isNew: true,
    data: {
      fullName: args.fullName as string || '',
      accountId: args.accountId as string || '',
      accountName: args.accountName as string || '',
      title: args.title as string || '',
      phone: args.phone as string || '',
      email: args.email as string || '',
    },
  },
});

registerHandlers({
  draftActivity,
  draftOpportunity,
  draftAccount,
  draftContact,
});
