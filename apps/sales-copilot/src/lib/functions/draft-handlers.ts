/**
 * Draft handlers — draftActivity / draftOpportunity / draftAccount / draftContact
 * Pure data shaping — no service calls.
 */

import { registerHandlers, type FunctionHandler } from './handler-registry';

const draftActivity: FunctionHandler = async (args) => ({
  success: true,
  data: {
    type: 'activity' as const,
    isNew: true,
    data: {
      title: args.title as string || '',
      type: args.type as string || 'visit',
      accountId: args.accountId as string || '',
      accountName: args.accountName as string || '',
      contactId: args.contactId as string || '',
      contactName: args.contactName as string || '',
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
});

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
