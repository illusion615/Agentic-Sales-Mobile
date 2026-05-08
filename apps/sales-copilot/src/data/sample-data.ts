/**
 * Sample data for development and fallback when Dataverse is unavailable.
 * All data is in English with consistent relationships.
 * 
 * Data relationships:
 * - Accounts have Contacts, Opportunities, Activities, and Tasks
 * - Contacts belong to an Account
 * - Opportunities belong to an Account
 * - Activities can be linked to an Account and/or Opportunity
 * - Tasks can be linked to an Account and/or Opportunity
 * - Business Insights reference Accounts or Opportunities
 */

import type { Account, AccountTierkey, AccountRegionkey, AccountCreditstatuskey } from '@/generated/models/account-model';
import type { Contact } from '@/generated/models/contact-model';
import type { Opportunity, OpportunityStagekey, OpportunityConfidencetrendkey } from '@/generated/models/opportunity-model';
import type { Activity, ActivityTypekey, ActivityDraftstatuskey, ActivityOutcomekey } from '@/generated/models/activity-model';
import type { Task, TaskPrioritykey, TaskStatuskey } from '@/generated/models/task-model';
import type { BusinessInsight, BusinessInsightTypekey, BusinessInsightReferencetypekey } from '@/generated/models/business-insight-model';

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
    tierKey: 'Tierkey0' as AccountTierkey, // S
    regionKey: 'Regionkey0' as AccountRegionkey, // East
    phone: '+1-555-0101',
    email: 'contact@techinnovations.com',
    address: '100 Innovation Way, San Francisco, CA 94105',
    lastcontactedon: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    ownerid: SAMPLE_OWNER_ID,
    creditstatusKey: 'Creditstatuskey0' as AccountCreditstatuskey, // Normal
    latitude: 37.7749,
    longitude: -122.4194,
  },
  {
    id: 'acc-002',
    name1: 'Global Manufacturing Ltd',
    industry: 'Manufacturing',
    tierKey: 'Tierkey1' as AccountTierkey, // A
    regionKey: 'Regionkey1' as AccountRegionkey, // North
    phone: '+1-555-0102',
    email: 'info@globalmanufacturing.com',
    address: '250 Industrial Blvd, Chicago, IL 60601',
    lastcontactedon: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(), // 18 days ago - AT RISK
    ownerid: SAMPLE_OWNER_ID,
    creditstatusKey: 'Creditstatuskey0' as AccountCreditstatuskey,
    latitude: 41.8781,
    longitude: -87.6298,
  },
  {
    id: 'acc-003',
    name1: 'Summit Healthcare Systems',
    industry: 'Healthcare',
    tierKey: 'Tierkey0' as AccountTierkey, // S
    regionKey: 'Regionkey2' as AccountRegionkey, // South
    phone: '+1-555-0103',
    email: 'partnerships@summithealth.com',
    address: '500 Medical Center Dr, Houston, TX 77001',
    lastcontactedon: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
    ownerid: SAMPLE_OWNER_ID,
    creditstatusKey: 'Creditstatuskey0' as AccountCreditstatuskey,
    latitude: 29.7604,
    longitude: -95.3698,
  },
  {
    id: 'acc-004',
    name1: 'Pacific Financial Group',
    industry: 'Financial Services',
    tierKey: 'Tierkey1' as AccountTierkey, // A
    regionKey: 'Regionkey3' as AccountRegionkey, // West
    phone: '+1-555-0104',
    email: 'business@pacificfinancial.com',
    address: '800 Finance St, Seattle, WA 98101',
    lastcontactedon: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(), // 12 days ago
    ownerid: SAMPLE_OWNER_ID,
    creditstatusKey: 'Creditstatuskey0' as AccountCreditstatuskey,
    latitude: 47.6062,
    longitude: -122.3321,
  },
  {
    id: 'acc-005',
    name1: 'Metro Retail Solutions',
    industry: 'Retail',
    tierKey: 'Tierkey2' as AccountTierkey, // B
    regionKey: 'Regionkey0' as AccountRegionkey, // East
    phone: '+1-555-0105',
    email: 'sales@metroretail.com',
    address: '350 Commerce Ave, New York, NY 10001',
    lastcontactedon: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(), // 25 days ago - AT RISK
    ownerid: SAMPLE_OWNER_ID,
    creditstatusKey: 'Creditstatuskey1' as AccountCreditstatuskey, // Warning
    latitude: 40.7128,
    longitude: -74.0060,
  },
  {
    id: 'acc-006',
    name1: 'Evergreen Energy Co',
    industry: 'Energy',
    tierKey: 'Tierkey2' as AccountTierkey, // B
    regionKey: 'Regionkey2' as AccountRegionkey, // South
    phone: '+1-555-0106',
    email: 'contact@evergreenergy.com',
    address: '600 Energy Plaza, Dallas, TX 75201',
    lastcontactedon: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), // 8 days ago
    ownerid: SAMPLE_OWNER_ID,
    creditstatusKey: 'Creditstatuskey0' as AccountCreditstatuskey,
    latitude: 32.7767,
    longitude: -96.7970,
  },
  {
    id: 'acc-007',
    name1: 'Precision Logistics Inc',
    industry: 'Logistics',
    tierKey: 'Tierkey3' as AccountTierkey, // C
    regionKey: 'Regionkey1' as AccountRegionkey, // North
    phone: '+1-555-0107',
    email: 'ops@precisionlogistics.com',
    address: '150 Shipping Lane, Detroit, MI 48201',
    lastcontactedon: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(), // 35 days ago - AT RISK
    ownerid: SAMPLE_OWNER_ID,
    creditstatusKey: 'Creditstatuskey0' as AccountCreditstatuskey,
    latitude: 42.3314,
    longitude: -83.0458,
  },
  {
    id: 'acc-008',
    name1: 'Creative Media Studios',
    industry: 'Media & Entertainment',
    tierKey: 'Tierkey3' as AccountTierkey, // C
    regionKey: 'Regionkey3' as AccountRegionkey, // West
    phone: '+1-555-0108',
    email: 'hello@creativemedia.com',
    address: '900 Studio Blvd, Los Angeles, CA 90028',
    lastcontactedon: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    ownerid: SAMPLE_OWNER_ID,
    creditstatusKey: 'Creditstatuskey0' as AccountCreditstatuskey,
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
    stageKey: 'Stagekey3' as OpportunityStagekey, // Negotiation
    totalamount: 45000, // HOT - closing this week
    confidence: 85,
    confidencetrendKey: 'Confidencetrendkey0' as OpportunityConfidencetrendkey, // Up
    expectedclosedate: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days from now
    ownerid: SAMPLE_OWNER_ID,
    lastaction: 'Sent final pricing proposal',
    createdon: new Date(today.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'opp-002',
    name1: 'Manufacturing Process Automation',
    account: { id: 'acc-002', name1: 'Global Manufacturing Ltd' },
    stageKey: 'Stagekey2' as OpportunityStagekey, // Proposal
    totalamount: 72000,
    confidence: 60,
    confidencetrendKey: 'Confidencetrendkey1' as OpportunityConfidencetrendkey, // Down
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
    stageKey: 'Stagekey3' as OpportunityStagekey, // Negotiation
    totalamount: 25000, // HOT - closing this week
    confidence: 90,
    confidencetrendKey: 'Confidencetrendkey0' as OpportunityConfidencetrendkey, // Up
    expectedclosedate: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    lastaction: 'Contract terms agreed',
    createdon: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'opp-004',
    name1: 'Financial Compliance Platform',
    account: { id: 'acc-004', name1: 'Pacific Financial Group' },
    stageKey: 'Stagekey2' as OpportunityStagekey, // Proposal
    totalamount: 55000,
    confidence: 70,
    confidencetrendKey: 'Confidencetrendkey2' as OpportunityConfidencetrendkey, // Flat
    expectedclosedate: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    lastaction: 'Demo completed successfully',
    createdon: new Date(today.getTime() - 35 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'opp-005',
    name1: 'Retail POS Integration',
    account: { id: 'acc-005', name1: 'Metro Retail Solutions' },
    stageKey: 'Stagekey1' as OpportunityStagekey, // Qualification
    totalamount: 18000,
    confidence: 40,
    confidencetrendKey: 'Confidencetrendkey1' as OpportunityConfidencetrendkey, // Down
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
    stageKey: 'Stagekey0' as OpportunityStagekey, // Prospecting
    totalamount: 32000,
    confidence: 25,
    confidencetrendKey: 'Confidencetrendkey0' as OpportunityConfidencetrendkey, // Up
    expectedclosedate: new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    lastaction: 'Meeting scheduled for next week',
    createdon: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'opp-007',
    name1: 'Logistics Tracking Solution',
    account: { id: 'acc-007', name1: 'Precision Logistics Inc' },
    stageKey: 'Stagekey4' as OpportunityStagekey, // Won
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
    stageKey: 'Stagekey5' as OpportunityStagekey, // Lost
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
    typeKey: 'Typekey1' as ActivityTypekey, // Call
    draftstatusKey: 'Draftstatuskey1' as ActivityDraftstatuskey, // Confirmed
    scheduleddate: new Date().toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    notes: 'Discuss final contract terms and timeline',
  },
  {
    id: 'act-002',
    title: 'Send proposal to Emily Zhang',
    account: { id: 'acc-003', name1: 'Summit Healthcare Systems' },
    opportunity: { id: 'opp-003', name1: 'Healthcare Data Analytics Suite' },
    typeKey: 'Typekey3' as ActivityTypekey, // Email
    draftstatusKey: 'Draftstatuskey1' as ActivityDraftstatuskey, // Confirmed
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
    typeKey: 'Typekey0' as ActivityTypekey, // Visit
    draftstatusKey: 'Draftstatuskey2' as ActivityDraftstatuskey, // Completed
    scheduleddate: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    outcomeKey: 'Outcomekey0' as ActivityOutcomekey, // Success
    notes: 'Great meeting. Client ready to move forward.',
  },
  {
    id: 'act-004',
    title: 'Demo for Pacific Financial',
    account: { id: 'acc-004', name1: 'Pacific Financial Group' },
    opportunity: { id: 'opp-004', name1: 'Financial Compliance Platform' },
    typeKey: 'Typekey2' as ActivityTypekey, // Meeting
    draftstatusKey: 'Draftstatuskey2' as ActivityDraftstatuskey, // Completed
    scheduleddate: new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    outcomeKey: 'Outcomekey0' as ActivityOutcomekey, // Success
    notes: 'Stakeholders impressed with compliance features.',
  },
  {
    id: 'act-005',
    title: 'Call with Summit Healthcare',
    account: { id: 'acc-003', name1: 'Summit Healthcare Systems' },
    opportunity: { id: 'opp-003', name1: 'Healthcare Data Analytics Suite' },
    typeKey: 'Typekey1' as ActivityTypekey, // Call
    draftstatusKey: 'Draftstatuskey2' as ActivityDraftstatuskey, // Completed
    scheduleddate: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    outcomeKey: 'Outcomekey0' as ActivityOutcomekey, // Success
    notes: 'Contract terms discussed and agreed in principle.',
  },
  {
    id: 'act-006',
    title: 'Visit to Evergreen Energy',
    account: { id: 'acc-006', name1: 'Evergreen Energy Co' },
    typeKey: 'Typekey0' as ActivityTypekey, // Visit
    draftstatusKey: 'Draftstatuskey2' as ActivityDraftstatuskey, // Completed
    scheduleddate: new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    outcomeKey: 'Outcomekey0' as ActivityOutcomekey, // Success
    notes: 'Initial requirements gathered. Strong interest.',
  },
  {
    id: 'act-007',
    title: 'Email follow-up to Creative Media',
    account: { id: 'acc-008', name1: 'Creative Media Studios' },
    typeKey: 'Typekey3' as ActivityTypekey, // Email
    draftstatusKey: 'Draftstatuskey2' as ActivityDraftstatuskey, // Completed
    scheduleddate: new Date(today.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    outcomeKey: 'Outcomekey4' as ActivityOutcomekey, // No result
    notes: 'Sent check-in email. No response yet.',
  },
  // Scheduled future activities (5)
  {
    id: 'act-008',
    title: 'Contract review meeting',
    account: { id: 'acc-001', name1: 'Tech Innovations Corp' },
    opportunity: { id: 'opp-001', name1: 'Enterprise Platform License' },
    typeKey: 'Typekey2' as ActivityTypekey, // Meeting
    draftstatusKey: 'Draftstatuskey1' as ActivityDraftstatuskey, // Confirmed
    scheduleddate: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    notes: 'Final contract review with legal team',
  },
  {
    id: 'act-009',
    title: 'Call Global Manufacturing',
    account: { id: 'acc-002', name1: 'Global Manufacturing Ltd' },
    opportunity: { id: 'opp-002', name1: 'Manufacturing Process Automation' },
    typeKey: 'Typekey1' as ActivityTypekey, // Call
    draftstatusKey: 'Draftstatuskey1' as ActivityDraftstatuskey, // Confirmed
    scheduleddate: new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    notes: 'Check on budget approval status',
  },
  {
    id: 'act-010',
    title: 'Visit Metro Retail',
    account: { id: 'acc-005', name1: 'Metro Retail Solutions' },
    opportunity: { id: 'opp-005', name1: 'Retail POS Integration' },
    typeKey: 'Typekey0' as ActivityTypekey, // Visit
    draftstatusKey: 'Draftstatuskey1' as ActivityDraftstatuskey, // Confirmed
    scheduleddate: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    notes: 'Re-engage after period of no contact',
  },
  {
    id: 'act-011',
    title: 'Discovery call with Evergreen',
    account: { id: 'acc-006', name1: 'Evergreen Energy Co' },
    opportunity: { id: 'opp-006', name1: 'Energy Management System' },
    typeKey: 'Typekey1' as ActivityTypekey, // Call
    draftstatusKey: 'Draftstatuskey1' as ActivityDraftstatuskey, // Confirmed
    scheduleddate: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    notes: 'Deeper technical requirements discussion',
  },
  {
    id: 'act-012',
    title: 'Proposal presentation',
    account: { id: 'acc-004', name1: 'Pacific Financial Group' },
    opportunity: { id: 'opp-004', name1: 'Financial Compliance Platform' },
    typeKey: 'Typekey2' as ActivityTypekey, // Meeting
    draftstatusKey: 'Draftstatuskey1' as ActivityDraftstatuskey, // Confirmed
    scheduleddate: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    notes: 'Present final proposal to full stakeholder group',
  },
];

// ============================================================================
// TASKS (8 tasks - 3 due today, 1 overdue)
// ============================================================================
export const sampleTasks: Task[] = [
  // Overdue (1)
  {
    id: 'task-001',
    title: 'Send case study to Global Manufacturing',
    account: { id: 'acc-002', name1: 'Global Manufacturing Ltd' },
    opportunity: { id: 'opp-002', name1: 'Manufacturing Process Automation' },
    priorityKey: 'Prioritykey0' as TaskPrioritykey, // High
    statusKey: 'Statuskey0' as TaskStatuskey, // Pending
    duedate: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    isoverdue: true,
    ownerid: SAMPLE_OWNER_ID,
    notes: 'Michael requested manufacturing case studies',
  },
  // Due today (3)
  {
    id: 'task-002',
    title: 'Prepare contract for Tech Innovations',
    account: { id: 'acc-001', name1: 'Tech Innovations Corp' },
    opportunity: { id: 'opp-001', name1: 'Enterprise Platform License' },
    priorityKey: 'Prioritykey0' as TaskPrioritykey, // High
    statusKey: 'Statuskey1' as TaskStatuskey, // In Progress
    duedate: new Date().toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    notes: 'Final contract with negotiated terms',
  },
  {
    id: 'task-003',
    title: 'Call Jennifer at Pacific Financial',
    account: { id: 'acc-004', name1: 'Pacific Financial Group' },
    opportunity: { id: 'opp-004', name1: 'Financial Compliance Platform' },
    priorityKey: 'Prioritykey1' as TaskPrioritykey, // Medium
    statusKey: 'Statuskey0' as TaskStatuskey, // Pending
    duedate: new Date().toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    notes: 'Follow up on demo feedback',
  },
  {
    id: 'task-004',
    title: 'Update Summit Healthcare proposal',
    account: { id: 'acc-003', name1: 'Summit Healthcare Systems' },
    opportunity: { id: 'opp-003', name1: 'Healthcare Data Analytics Suite' },
    priorityKey: 'Prioritykey0' as TaskPrioritykey, // High
    statusKey: 'Statuskey0' as TaskStatuskey, // Pending
    duedate: new Date().toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    notes: 'Incorporate agreed pricing',
  },
  // Upcoming (4)
  {
    id: 'task-005',
    title: 'Research Metro Retail competitors',
    account: { id: 'acc-005', name1: 'Metro Retail Solutions' },
    opportunity: { id: 'opp-005', name1: 'Retail POS Integration' },
    priorityKey: 'Prioritykey2' as TaskPrioritykey, // Low
    statusKey: 'Statuskey0' as TaskStatuskey, // Pending
    duedate: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    notes: 'Understand competitive landscape',
  },
  {
    id: 'task-006',
    title: 'Schedule visit to Evergreen Energy',
    account: { id: 'acc-006', name1: 'Evergreen Energy Co' },
    opportunity: { id: 'opp-006', name1: 'Energy Management System' },
    priorityKey: 'Prioritykey1' as TaskPrioritykey, // Medium
    statusKey: 'Statuskey0' as TaskStatuskey, // Pending
    duedate: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    notes: 'On-site facility tour',
  },
  {
    id: 'task-007',
    title: 'Prepare ROI analysis for Pacific Financial',
    account: { id: 'acc-004', name1: 'Pacific Financial Group' },
    opportunity: { id: 'opp-004', name1: 'Financial Compliance Platform' },
    priorityKey: 'Prioritykey0' as TaskPrioritykey, // High
    statusKey: 'Statuskey0' as TaskStatuskey, // Pending
    duedate: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    notes: 'Quantify compliance cost savings',
  },
  {
    id: 'task-008',
    title: 'Completed: Close Logistics deal',
    account: { id: 'acc-007', name1: 'Precision Logistics Inc' },
    opportunity: { id: 'opp-007', name1: 'Logistics Tracking Solution' },
    priorityKey: 'Prioritykey0' as TaskPrioritykey, // High
    statusKey: 'Statuskey2' as TaskStatuskey, // Completed
    duedate: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    ownerid: SAMPLE_OWNER_ID,
    notes: 'Successfully closed!',
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

/** Get tasks for an account */
export function getTasksByAccountId(accountId: string): Task[] {
  return sampleTasks.filter((t: Task) => t.account?.id === accountId);
}

/** Get opportunity by ID */
export function getOpportunityById(id: string): Opportunity | undefined {
  return sampleOpportunities.find((o: Opportunity) => o.id === id);
}

/** Get activities for an opportunity */
export function getActivitiesByOpportunityId(opportunityId: string): Activity[] {
  return sampleActivities.filter((a: Activity) => a.opportunity?.id === opportunityId);
}

/** Get tasks for an opportunity */
export function getTasksByOpportunityId(opportunityId: string): Task[] {
  return sampleTasks.filter((t: Task) => t.opportunity?.id === opportunityId);
}

/** Get contact by ID */
export function getContactById(id: string): Contact | undefined {
  return sampleContacts.find((c: Contact) => c.id === id);
}