/**
 * Sample data for development and fallback when Dataverse is unavailable.
 * All data is in English with consistent relationships.
 * 
 * Data relationships:
 * - Accounts have Contacts, Opportunities, and Activities
 * - Contacts belong to an Account
 * - Opportunities belong to an Account
 * - Activities can be linked to an Account and/or Opportunity
 * - Business Insights reference Accounts or Opportunities
 */

import type { Account, AccountTierKey, AccountRegionKey, AccountCreditstatusKey } from '@/generated/models/account-model';
import type { Contact } from '@/generated/models/contact-model';
import type { Opportunity, OpportunityStageKey, OpportunityConfidencetrendKey } from '@/generated/models/opportunity-model';
import type { Activity, ActivityTypeKey, ActivityDraftstatusKey, ActivityOutcomeKey } from '@/generated/models/activity-model';
import type { Task } from '@/generated/models/task-model';

import type { BusinessInsight, BusinessInsightTypeKey, BusinessInsightReferencetypeKey } from '@/generated/models/business-insight-model';

// Sample Owner ID (represents the current sales rep)
const SAMPLE_OWNER_ID = 'user-001';

// ============================================================================
// ACCOUNTS (8 accounts with varied tiers, regions, and contact status)
// ============================================================================
export const sampleAccounts: Account[] = [
  {
    id: 'acc-001',
    name1: 'Tech Innovations Corp',
    industry: 'Technology',
    tierKey: 'TierKey0' as AccountTierKey, // S
    regionKey: 'RegionKey0' as AccountRegionKey, // East
    phone: '+1-555-0101',
    email: 'contact@techinnovations.com',
    address: '100 Innovation Way, San Francisco, CA 94105',
    lastcontactedon: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    ownerid: SAMPLE_OWNER_ID,
    creditstatusKey: 'CreditstatusKey0' as AccountCreditstatusKey, // Normal
    latitude: 37.7749,
    longitude: -122.4194,
  },
  {
    id: 'acc-002',
    name1: 'Global Manufacturing Ltd',
    industry: 'Manufacturing',
    tierKey: 'TierKey1' as AccountTierKey, // A
    regionKey: 'RegionKey1' as AccountRegionKey, // North
    phone: '+1-555-0102',
    email: 'info@globalmanufacturing.com',
    address: '250 Industrial Blvd, Chicago, IL 60601',
    lastcontactedon: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(), // 18 days ago - AT RISK
    ownerid: SAMPLE_OWNER_ID,
    creditstatusKey: 'CreditstatusKey0' as AccountCreditstatusKey,
    latitude: 41.8781,
    longitude: -87.6298,
  },
  {
    id: 'acc-003',
    name1: 'Summit Healthcare Systems',
    industry: 'Healthcare',
    tierKey: 'TierKey0' as AccountTierKey, // S
    regionKey: 'RegionKey2' as AccountRegionKey, // South
    phone: '+1-555-0103',
    email: 'partnerships@summithealth.com',
    address: '500 Medical Center Dr, Houston, TX 77001',
    lastcontactedon: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
    ownerid: SAMPLE_OWNER_ID,
    creditstatusKey: 'CreditstatusKey0' as AccountCreditstatusKey,
    latitude: 29.7604,
    longitude: -95.3698,
  },
  {
    id: 'acc-004',
    name1: 'Pacific Financial Group',
    industry: 'Financial Services',
    tierKey: 'TierKey1' as AccountTierKey, // A
    regionKey: 'RegionKey3' as AccountRegionKey, // West
    phone: '+1-555-0104',
    email: 'business@pacificfinancial.com',
    address: '800 Finance St, Seattle, WA 98101',
    lastcontactedon: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(), // 12 days ago
    ownerid: SAMPLE_OWNER_ID,
    creditstatusKey: 'CreditstatusKey0' as AccountCreditstatusKey,
    latitude: 47.6062,
    longitude: -122.3321,
  },
  {
    id: 'acc-005',
    name1: 'Metro Retail Solutions',
    industry: 'Retail',
    tierKey: 'TierKey2' as AccountTierKey, // B
    regionKey: 'RegionKey0' as AccountRegionKey, // East
    phone: '+1-555-0105',
    email: 'sales@metroretail.com',
    address: '350 Commerce Ave, New York, NY 10001',
    lastcontactedon: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(), // 25 days ago - AT RISK
    ownerid: SAMPLE_OWNER_ID,
    creditstatusKey: 'CreditstatusKey1' as AccountCreditstatusKey, // Warning
    latitude: 40.7128,
    longitude: -74.0060,
  },
  {
    id: 'acc-006',
    name1: 'Evergreen Energy Co',
    industry: 'Energy',
    tierKey: 'TierKey2' as AccountTierKey, // B
    regionKey: 'RegionKey2' as AccountRegionKey, // South
    phone: '+1-555-0106',
    email: 'contact@evergreenergy.com',
    address: '600 Energy Plaza, Dallas, TX 75201',
    lastcontactedon: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), // 8 days ago
    ownerid: SAMPLE_OWNER_ID,
    creditstatusKey: 'CreditstatusKey0' as AccountCreditstatusKey,
    latitude: 32.7767,
    longitude: -96.7970,
  },
  {
    id: 'acc-007',
    name1: 'Precision Logistics Inc',
    industry: 'Logistics',
    tierKey: 'TierKey3' as AccountTierKey, // C
    regionKey: 'RegionKey1' as AccountRegionKey, // North
    phone: '+1-555-0107',
    email: 'ops@precisionlogistics.com',
    address: '150 Shipping Lane, Detroit, MI 48201',
    lastcontactedon: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(), // 35 days ago - AT RISK
    ownerid: SAMPLE_OWNER_ID,
    creditstatusKey: 'CreditstatusKey0' as AccountCreditstatusKey,
    latitude: 42.3314,
    longitude: -83.0458,
  },
  {
    id: 'acc-008',
    name1: 'Creative Media Studios',
    industry: 'Media & Entertainment',
    tierKey: 'TierKey3' as AccountTierKey, // C
    regionKey: 'RegionKey3' as AccountRegionKey, // West
    phone: '+1-555-0108',
    email: 'hello@creativemedia.com',
    address: '900 Studio Blvd, Los Angeles, CA 90028',
    lastcontactedon: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    ownerid: SAMPLE_OWNER_ID,
    creditstatusKey: 'CreditstatusKey0' as AccountCreditstatusKey,
    latitude: 34.0522,
    longitude: -118.2437,
  },
];

// ============================================================================
// CONTACTS (10 contacts linked to accounts)
// ============================================================================
export const sampleContacts: Contact[] = [
  {
    id: 'con-001',
    fullname: 'John Chen',
    account: { id: 'acc-001', name1: 'Tech Innovations Corp' },
    title: 'CEO - Decision Maker',
    email: 'john.chen@techinnovations.com',
    phone: '+1-555-1001',
  },
  {
    id: 'con-002',
    fullname: 'Sarah Williams',
    account: { id: 'acc-001', name1: 'Tech Innovations Corp' },
    title: 'VP Engineering',
    email: 'sarah.w@techinnovations.com',
    phone: '+1-555-1002',
  },
  {
    id: 'con-003',
    fullname: 'Michael Rodriguez',
    account: { id: 'acc-002', name1: 'Global Manufacturing Ltd' },
    title: 'CEO',
    email: 'mrodriguez@globalmanufacturing.com',
    phone: '+1-555-1003',
  },
  {
    id: 'con-004',
    fullname: 'Emily Zhang',
    account: { id: 'acc-003', name1: 'Summit Healthcare Systems' },
    title: 'Chief Procurement Officer',
    email: 'ezhang@summithealth.com',
    phone: '+1-555-1004',
  },
  {
    id: 'con-005',
    fullname: 'David Park',
    account: { id: 'acc-003', name1: 'Summit Healthcare Systems' },
    title: 'IT Director',
    email: 'dpark@summithealth.com',
    phone: '+1-555-1005',
  },
  {
    id: 'con-006',
    fullname: 'Jennifer Martinez',
    account: { id: 'acc-004', name1: 'Pacific Financial Group' },
    title: 'VP Operations',
    email: 'jmartinez@pacificfinancial.com',
    phone: '+1-555-1006',
  },
  {
    id: 'con-007',
    fullname: 'Robert Thompson',
    account: { id: 'acc-005', name1: 'Metro Retail Solutions' },
    title: 'COO',
    email: 'rthompson@metroretail.com',
    phone: '+1-555-1007',
  },
  {
    id: 'con-008',
    fullname: 'Lisa Anderson',
    account: { id: 'acc-006', name1: 'Evergreen Energy Co' },
    title: 'Director of Sustainability',
    email: 'landerson@evergreenergy.com',
    phone: '+1-555-1008',
  },
  {
    id: 'con-009',
    fullname: 'James Wilson',
    account: { id: 'acc-007', name1: 'Precision Logistics Inc' },
    title: 'Operations Manager',
    email: 'jwilson@precisionlogistics.com',
    phone: '+1-555-1009',
  },
  {
    id: 'con-010',
    fullname: 'Amanda Lee',
    account: { id: 'acc-008', name1: 'Creative Media Studios' },
    title: 'CEO and Founder',
    email: 'alee@creativemedia.com',
    phone: '+1-555-1010',
  },
];

// ============================================================================
// OPPORTUNITIES (8 opportunities at various stages)
// Including 2 hot deals closing this week (~$70K)
// ============================================================================
const today = new Date();
const thisWeekEnd = new Date(today);
thisWeekEnd.setDate(today.getDate() + (7 - today.getDay()));

export const sampleOpportunities: Opportunity[] = [
  {
    id: 'opp-001',
    name1: 'Enterprise Platform License',
    account: { id: 'acc-001', name1: 'Tech Innovations Corp' },
    stageKey: 'StageKey3' as OpportunityStageKey, // Negotiation
    totalamount: 45000, // HOT - closing this week
    confidence: 85,
    confidencetrendKey: 'ConfidencetrendKey0' as OpportunityConfidencetrendKey, // Up
    expectedclosedate: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days from now
    ownerid: SAMPLE_OWNER_ID,
    lastaction: 'Sent final pricing proposal',
    createdon: new Date(today.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'opp-002',
    name1: 'Manufacturing Process Automation',
    account: { id: 'acc-002', name1: 'Global Manufacturing Ltd' },
    stageKey: 'StageKey2' as OpportunityStageKey, // Proposal
    totalamount: 72000,
    confidence: 60,
    confidencetrendKey: 'ConfidencetrendKey1' as OpportunityConfidencetrendKey, // Down
    expectedclosedate: new Date(today.getTime() + 21 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    lastaction: 'Proposal under review',
    blocker: 'Awaiting budget approval from board',
    createdon: new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'opp-003',
    name1: 'Healthcare Data Analytics Suite',
    account: { id: 'acc-003', name1: 'Summit Healthcare Systems' },
    stageKey: 'StageKey3' as OpportunityStageKey, // Negotiation
    totalamount: 25000, // HOT - closing this week
    confidence: 90,
    confidencetrendKey: 'ConfidencetrendKey0' as OpportunityConfidencetrendKey, // Up
    expectedclosedate: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    lastaction: 'Contract terms agreed',
    createdon: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'opp-004',
    name1: 'Financial Compliance Platform',
    account: { id: 'acc-004', name1: 'Pacific Financial Group' },
    stageKey: 'StageKey2' as OpportunityStageKey, // Proposal
    totalamount: 55000,
    confidence: 70,
    confidencetrendKey: 'ConfidencetrendKey2' as OpportunityConfidencetrendKey, // Flat
    expectedclosedate: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    lastaction: 'Demo completed successfully',
    createdon: new Date(today.getTime() - 35 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'opp-005',
    name1: 'Retail POS Integration',
    account: { id: 'acc-005', name1: 'Metro Retail Solutions' },
    stageKey: 'StageKey1' as OpportunityStageKey, // Qualification
    totalamount: 18000,
    confidence: 40,
    confidencetrendKey: 'ConfidencetrendKey1' as OpportunityConfidencetrendKey, // Down
    expectedclosedate: new Date(today.getTime() + 45 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    lastaction: 'Initial discovery call',
    blocker: 'Client unresponsive for 2 weeks',
    createdon: new Date(today.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'opp-006',
    name1: 'Energy Management System',
    account: { id: 'acc-006', name1: 'Evergreen Energy Co' },
    stageKey: 'StageKey0' as OpportunityStageKey, // Prospecting
    totalamount: 32000,
    confidence: 25,
    confidencetrendKey: 'ConfidencetrendKey0' as OpportunityConfidencetrendKey, // Up
    expectedclosedate: new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    lastaction: 'Meeting scheduled for next week',
    createdon: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'opp-007',
    name1: 'Logistics Tracking Solution',
    account: { id: 'acc-007', name1: 'Precision Logistics Inc' },
    stageKey: 'StageKey4' as OpportunityStageKey, // Won
    totalamount: 28000,
    confidence: 100,
    expectedclosedate: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    closedon: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    lastaction: 'Contract signed',
    createdon: new Date(today.getTime() - 50 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'opp-008',
    name1: 'Creative Suite License',
    account: { id: 'acc-008', name1: 'Creative Media Studios' },
    stageKey: 'StageKey5' as OpportunityStageKey, // Lost
    totalamount: 15000,
    confidence: 0,
    expectedclosedate: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    closedon: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    lastaction: 'Lost to competitor',
    blocker: 'Price sensitivity',
    createdon: new Date(today.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

// ============================================================================
// ACTIVITIES (12 activities - mix of completed and scheduled)
// ============================================================================
export const sampleActivities: Activity[] = [
  // Today's activities (2)
  {
    id: 'act-001',
    title: 'Follow-up call with John Chen',
    account: { id: 'acc-001', name1: 'Tech Innovations Corp' },
    opportunity: { id: 'opp-001', name1: 'Enterprise Platform License' },
    typeKey: 'TypeKey1' as ActivityTypeKey, // Call
    draftstatusKey: 'DraftstatusKey1' as ActivityDraftstatusKey, // Confirmed
    scheduleddate: new Date().toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    notes: 'Discuss final contract terms and timeline',
  },
  {
    id: 'act-002',
    title: 'Send proposal to Emily Zhang',
    account: { id: 'acc-003', name1: 'Summit Healthcare Systems' },
    opportunity: { id: 'opp-003', name1: 'Healthcare Data Analytics Suite' },
    typeKey: 'TypeKey3' as ActivityTypeKey, // Email
    draftstatusKey: 'DraftstatusKey1' as ActivityDraftstatusKey, // Confirmed
    scheduleddate: new Date().toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    notes: 'Final pricing document with implementation timeline',
  },
  // This week's completed activities (5)
  {
    id: 'act-003',
    title: 'Site visit to Tech Innovations',
    account: { id: 'acc-001', name1: 'Tech Innovations Corp' },
    opportunity: { id: 'opp-001', name1: 'Enterprise Platform License' },
    typeKey: 'TypeKey0' as ActivityTypeKey, // Visit
    draftstatusKey: 'DraftstatusKey2' as ActivityDraftstatusKey, // Completed
    scheduleddate: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    outcomeKey: 'OutcomeKey0' as ActivityOutcomeKey, // Success
    notes: 'Great meeting. Client ready to move forward.',
  },
  {
    id: 'act-004',
    title: 'Demo for Pacific Financial',
    account: { id: 'acc-004', name1: 'Pacific Financial Group' },
    opportunity: { id: 'opp-004', name1: 'Financial Compliance Platform' },
    typeKey: 'TypeKey2' as ActivityTypeKey, // Meeting
    draftstatusKey: 'DraftstatusKey2' as ActivityDraftstatusKey, // Completed
    scheduleddate: new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    outcomeKey: 'OutcomeKey0' as ActivityOutcomeKey, // Success
    notes: 'Stakeholders impressed with compliance features.',
  },
  {
    id: 'act-005',
    title: 'Call with Summit Healthcare',
    account: { id: 'acc-003', name1: 'Summit Healthcare Systems' },
    opportunity: { id: 'opp-003', name1: 'Healthcare Data Analytics Suite' },
    typeKey: 'TypeKey1' as ActivityTypeKey, // Call
    draftstatusKey: 'DraftstatusKey2' as ActivityDraftstatusKey, // Completed
    scheduleddate: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    outcomeKey: 'OutcomeKey0' as ActivityOutcomeKey, // Success
    notes: 'Contract terms discussed and agreed in principle.',
  },
  {
    id: 'act-006',
    title: 'Visit to Evergreen Energy',
    account: { id: 'acc-006', name1: 'Evergreen Energy Co' },
    typeKey: 'TypeKey0' as ActivityTypeKey, // Visit
    draftstatusKey: 'DraftstatusKey2' as ActivityDraftstatusKey, // Completed
    scheduleddate: new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    outcomeKey: 'OutcomeKey0' as ActivityOutcomeKey, // Success
    notes: 'Initial requirements gathered. Strong interest.',
  },
  {
    id: 'act-007',
    title: 'Email follow-up to Creative Media',
    account: { id: 'acc-008', name1: 'Creative Media Studios' },
    typeKey: 'TypeKey3' as ActivityTypeKey, // Email
    draftstatusKey: 'DraftstatusKey2' as ActivityDraftstatusKey, // Completed
    scheduleddate: new Date(today.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    outcomeKey: 'OutcomeKey4' as ActivityOutcomeKey, // No result
    notes: 'Sent check-in email. No response yet.',
  },
  // Scheduled future activities (5)
  {
    id: 'act-008',
    title: 'Contract review meeting',
    account: { id: 'acc-001', name1: 'Tech Innovations Corp' },
    opportunity: { id: 'opp-001', name1: 'Enterprise Platform License' },
    typeKey: 'TypeKey2' as ActivityTypeKey, // Meeting
    draftstatusKey: 'DraftstatusKey1' as ActivityDraftstatusKey, // Confirmed
    scheduleddate: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    notes: 'Final contract review with legal team',
  },
  {
    id: 'act-009',
    title: 'Call Global Manufacturing',
    account: { id: 'acc-002', name1: 'Global Manufacturing Ltd' },
    opportunity: { id: 'opp-002', name1: 'Manufacturing Process Automation' },
    typeKey: 'TypeKey1' as ActivityTypeKey, // Call
    draftstatusKey: 'DraftstatusKey1' as ActivityDraftstatusKey, // Confirmed
    scheduleddate: new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    notes: 'Check on budget approval status',
  },
  {
    id: 'act-010',
    title: 'Visit Metro Retail',
    account: { id: 'acc-005', name1: 'Metro Retail Solutions' },
    opportunity: { id: 'opp-005', name1: 'Retail POS Integration' },
    typeKey: 'TypeKey0' as ActivityTypeKey, // Visit
    draftstatusKey: 'DraftstatusKey1' as ActivityDraftstatusKey, // Confirmed
    scheduleddate: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    notes: 'Re-engage after period of no contact',
  },
  {
    id: 'act-011',
    title: 'Discovery call with Evergreen',
    account: { id: 'acc-006', name1: 'Evergreen Energy Co' },
    opportunity: { id: 'opp-006', name1: 'Energy Management System' },
    typeKey: 'TypeKey1' as ActivityTypeKey, // Call
    draftstatusKey: 'DraftstatusKey1' as ActivityDraftstatusKey, // Confirmed
    scheduleddate: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    notes: 'Deeper technical requirements discussion',
  },
  {
    id: 'act-012',
    title: 'Proposal presentation',
    account: { id: 'acc-004', name1: 'Pacific Financial Group' },
    opportunity: { id: 'opp-004', name1: 'Financial Compliance Platform' },
    typeKey: 'TypeKey2' as ActivityTypeKey, // Meeting
    draftstatusKey: 'DraftstatusKey1' as ActivityDraftstatusKey, // Confirmed
    scheduleddate: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    notes: 'Present final proposal to full stakeholder group',
  },
];



// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Get account by ID */
export function getAccountById(id: string): Account | undefined {
  return sampleAccounts.find((a: Account) => a.id === id);
}

/** Get contacts for an account */
export function getContactsByAccountId(accountId: string): Contact[] {
  return sampleContacts.filter((c: Contact) => c.account?.id === accountId);
}

/** Get opportunities for an account */
export function getOpportunitiesByAccountId(accountId: string): Opportunity[] {
  return sampleOpportunities.filter((o: Opportunity) => o.account?.id === accountId);
}

/** Get activities for an account */
export function getActivitiesByAccountId(accountId: string): Activity[] {
  return sampleActivities.filter((a: Activity) => a.account?.id === accountId);
}



/** Get opportunity by ID */
export function getOpportunityById(id: string): Opportunity | undefined {
  return sampleOpportunities.find((o: Opportunity) => o.id === id);
}

/** Get activities for an opportunity */
export function getActivitiesByOpportunityId(opportunityId: string): Activity[] {
  return sampleActivities.filter((a: Activity) => a.opportunity?.id === opportunityId);
}



/** Get contact by ID */
export function getContactById(id: string): Contact | undefined {
  return sampleContacts.find((c: Contact) => c.id === id);
}

// Local shim seed for the generated Task data source.
// Cloud review scope does not use this file, but local testing needs the export to exist.
export const sampleTasks: Task[] = [];