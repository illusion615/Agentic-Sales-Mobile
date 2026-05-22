/**
 * UK Test Data Import Script
 *
 * !!! 仅限 data-import.tsx 一键灌种子数据使用，不得在运行时业务流程中引用 !!!
 * DO NOT IMPORT THIS FROM RUNTIME CODE.
 * This file is a hardcoded seed dataset used ONLY by `src/pages/data-import.tsx`
 * to populate an empty Dataverse environment for demos. It is NOT a mock data
 * layer and must NEVER be read at runtime to substitute for real Dataverse data.
 * If you find yourself importing this from any file other than `data-import.tsx`,
 * STOP and rethink — the answer is real Dataverse, not seed data.
 *
 * 8 UK NHS Account records with linked Contacts and Opportunities
 * Field mapping to existing Dataverse schema:
 * - name1: Account name
 * - address: "City, Country"
 * - industry: Account Type (NHS Trust Teaching, NHS Foundation Trust, etc.)
 * - notes: Combined notes with department, product line, and key events
 * - tierKey: S/A/B/C tier
 * - lastcontactedon: Last Activity Date
 * 
 * Opportunity stage mapping:
 * - Discovery → prospecting (StageKey0)
 * - Qualification → qualification (StageKey1)
 * - Demo Scheduled → proposal (StageKey2)
 * - Proposal Sent → proposal (StageKey2)
 * - Pricing Review → negotiation (StageKey3)
 * - Negotiation → negotiation (StageKey3)
 * - Closed Won → won (StageKey4)
 * - Closed Lost → lost (StageKey5)
 */

// Choice fields are now plain label strings (Dataverse FormattedValue).

export interface UKAccountData {
  // Account fields
  name: string;
  city: string;
  country: string;
  accountType: string;
  department: string;
  productLine: string;
  tier: string;
  lastActivityDate: string;
  nextActivityDate: string;
  notes: string;
  
  // Primary Contact
  primaryContact: {
    name: string;
    role: string;
  };
  
  // Secondary Contact (optional)
  secondaryContact?: {
    name: string;
    role: string;
  };
  
  // Opportunity (primary, used for the scheduled next activity binding)
  opportunity: {
    name: string;
    stage: string;
    amount: number;
    currency: string;
    confidence: number;
    expectedCloseDate?: string;
    closedOn?: string;
  };

  // Extra opportunities on the same account (no auto-activity is generated for these).
  // Used when an account has parallel deals under different product lines.
  additionalOpportunities?: Array<{
    name: string;
    stage: string;
    amount: number;
    currency: string;
    confidence: number;
    expectedCloseDate?: string;
    closedOn?: string;
  }>;
}

export const ukTestData: UKAccountData[] = [
  {
    name: 'Royal London Hospital',
    city: 'London',
    country: 'United Kingdom',
    accountType: 'NHS Trust Teaching',
    department: 'Cardiac Center connectivity upgrade',
    productLine: 'BeneVision N + BeneLink',
    tier: 'S', // S
    lastActivityDate: '2026-05-06',
    nextActivityDate: '2026-05-13',
    notes: 'NHS SBS Framework, decision 2026-06-12.',
    primaryContact: {
      name: 'Dr. James Williams',
      role: 'Cardiology',
    },
    secondaryContact: {
      name: 'Sarah Patel',
      role: 'Procurement',
    },
    opportunity: {
      name: 'Royal London Cardiac Monitoring Upgrade',
      stage: 'negotiation', // negotiation (Pricing Review)
      amount: 820000,
      currency: 'GBP',
      confidence: 75,
      expectedCloseDate: '2026-06-12',
    },
  },
  {
    name: 'Liverpool Heart & Chest Hospital',
    city: 'Liverpool',
    country: 'United Kingdom',
    accountType: 'NHS Cardiothoracic Specialty',
    department: '5-OR integrated monitoring & anesthesia',
    productLine: 'A9 Anesthesia + N22 Monitor',
    tier: 'A', // A
    lastActivityDate: '2026-05-07',
    nextActivityDate: '2026-05-14',
    notes: 'Proposal sent 4 days ago, awaiting tech eval. Reference Royal London case.',
    primaryContact: {
      name: 'Dr. Michael O\'Brien',
      role: 'Cardiothoracic Surgery',
    },
    opportunity: {
      name: 'Liverpool OR Anesthesia Integration',
      stage: 'proposal', // proposal (Proposal Sent)
      amount: 540000,
      currency: 'GBP',
      confidence: 60,
      expectedCloseDate: '2026-07-15',
    },
  },
  {
    name: "Guy's and St Thomas' NHS Foundation Trust",
    city: 'London',
    country: 'United Kingdom',
    accountType: 'NHS Foundation Trust',
    department: 'ICU 60-bed monitoring expansion',
    productLine: 'BeneVision N1 ×60 + Central Station ×2',
    tier: 'S', // S
    lastActivityDate: '2026-04-25',
    nextActivityDate: '2026-05-08', // Overdue
    notes: 'NHS Supply Chain tender deadline 2026-06-30. Quarterly check-in overdue.',
    primaryContact: {
      name: 'Dr. Olivia Bennett',
      role: 'ICU',
    },
    secondaryContact: {
      name: 'Mark Harris',
      role: 'Procurement Lead',
    },
    opportunity: {
      name: 'GSTT ICU Monitoring Expansion',
      stage: 'prospecting', // prospecting (Discovery)
      amount: 1150000,
      currency: 'GBP',
      confidence: 40,
      expectedCloseDate: '2026-06-30',
    },
  },
  {
    name: 'Manchester University NHS Foundation Trust',
    city: 'Manchester',
    country: 'United Kingdom',
    accountType: 'NHS Foundation Trust',
    department: 'Operating room anesthesia replacement',
    productLine: 'A8/A9 Anesthesia ×14',
    tier: 'A', // A
    lastActivityDate: '2026-05-05',
    nextActivityDate: '2026-05-15', // On-site demo
    notes: 'Trial feedback positive on ventilation modes.',
    primaryContact: {
      name: 'Prof. Andrew Clarke',
      role: 'Anesthesiology',
    },
    opportunity: {
      name: 'Manchester OR Anesthesia Replacement',
      stage: 'proposal', // proposal (Demo Scheduled)
      amount: 880000,
      currency: 'GBP',
      confidence: 55,
      expectedCloseDate: '2026-07-01',
    },
  },
  {
    name: 'Oxford University Hospitals NHS Foundation Trust',
    city: 'Oxford',
    country: 'United Kingdom',
    accountType: 'NHS Foundation Trust',
    department: 'ECMO/ECPR joint programme',
    productLine: 'BeneFusion + Monitor + ECPR kit',
    tier: 'A', // A
    lastActivityDate: '2026-05-02',
    nextActivityDate: '2026-05-16',
    notes: 'Following SAMU de Paris mobile ECPR reference case.',
    primaryContact: {
      name: 'Dr. Ravi Shah',
      role: 'Critical Care',
    },
    secondaryContact: {
      name: 'Helen Cooper',
      role: 'Procurement',
    },
    opportunity: {
      name: 'Oxford ECMO/ECPR Programme',
      stage: 'qualification', // qualification
      amount: 760000,
      currency: 'GBP',
      confidence: 50,
      expectedCloseDate: '2026-08-15',
    },
  },
  {
    name: "King's College Hospital NHS Foundation Trust",
    city: 'London',
    country: 'United Kingdom',
    accountType: 'NHS Foundation Trust',
    department: 'Lab automation upgrade',
    productLine: 'CAL 9000 Hematology Line + CL Chemiluminescence',
    tier: 'S', // S
    lastActivityDate: '2026-04-28',
    nextActivityDate: '2026-05-03', // Overdue
    notes: 'Second-round pricing; renewal confirmation overdue.',
    primaryContact: {
      name: 'Dr. Emma Wright',
      role: 'Lab Director',
    },
    opportunity: {
      name: 'KCH Lab Automation Upgrade',
      stage: 'negotiation', // negotiation
      amount: 1420000,
      currency: 'GBP',
      confidence: 70,
      expectedCloseDate: '2026-06-01',
    },
    additionalOpportunities: [
      {
        // Parallel deal — used by demo Item 6 (OR equipment procurement).
        // Earlier stage / lower confidence than the lab automation upgrade
        // so the pipeline view shows two distinct opps for the same account.
        name: 'KCH Operating Room Equipment Procurement',
        stage: 'proposal', // proposal
        amount: 520000,
        currency: 'GBP',
        confidence: 60,
        expectedCloseDate: '2026-09-30',
      },
    ],
  },
  {
    name: 'University Hospitals Birmingham NHS Foundation Trust',
    city: 'Birmingham',
    country: 'United Kingdom',
    accountType: 'NHS Foundation Trust',
    department: "Women's health ultrasound refresh",
    productLine: 'Nuewa R9 Platinum ×6',
    tier: 'B', // B
    lastActivityDate: '2026-05-04',
    nextActivityDate: '2026-05-18',
    notes: 'Procured under NHS Supply Chain framework.',
    primaryContact: {
      name: 'Dr. Sophie Turner',
      role: 'Imaging',
    },
    opportunity: {
      name: 'UHB Ultrasound Refresh',
      stage: 'negotiation', // negotiation (Pricing Review)
      amount: 340000,
      currency: 'GBP',
      confidence: 65,
      expectedCloseDate: '2026-06-20',
    },
  },
  {
    name: 'Leeds Teaching Hospitals NHS Trust',
    city: 'Leeds',
    country: 'United Kingdom',
    accountType: 'NHS Trust Teaching',
    department: 'Emergency AED + defibrillator upgrade',
    productLine: 'BeneHeart L AED ×40 + D6 Defibrillator ×8',
    tier: 'A', // A
    lastActivityDate: '2026-03-20',
    nextActivityDate: '2026-05-20', // Post-sale follow-up
    notes: 'Closed last quarter; sister site interested in expansion.',
    primaryContact: {
      name: 'Dr. Daniel Foster',
      role: 'Emergency Dept',
    },
    opportunity: {
      name: 'Leeds Emergency Defibrillator Upgrade',
      stage: 'won', // won
      amount: 150000,
      currency: 'GBP',
      confidence: 100,
      closedOn: '2026-03-20',
    },
  },
];

/**
 * Generates a deterministic UUID from a seed string
 */
function generateUUID(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `${hex.slice(0, 8)}-${hex.slice(0, 4)}-4${hex.slice(1, 4)}-8${hex.slice(0, 3)}-${hex.padEnd(12, '0').slice(0, 12)}`;
}

/**
 * Converts UK test data to Account create payloads
 */
export function getAccountCreatePayloads(ownerId: string) {
  return ukTestData.map((data) => ({
    id: generateUUID(`account-${data.name}`),
    name1: data.name,
    address: `${data.city}, ${data.country}`,
    industry: data.accountType,
    notes: `[${data.department}] [Product: ${data.productLine}] [Next: ${data.nextActivityDate}] ${data.notes}`,
    tier: data.tier,
    lastcontactedon: data.lastActivityDate,
    ownerid: ownerId,
  }));
}

/**
 * Converts UK test data to Contact create payloads
 */
export function getContactCreatePayloads(ownerId: string) {
  const contacts: Array<{
    id: string;
    fullname: string;
    title: string;
    account: { id: string; name1: string };
  }> = [];
  
  ukTestData.forEach((data) => {
    const accountId = generateUUID(`account-${data.name}`);
    
    // Primary contact
    contacts.push({
      id: generateUUID(`contact-${data.name}-${data.primaryContact.name}`),
      fullname: data.primaryContact.name,
      title: `${data.primaryContact.role} (Primary)`,
      account: { id: accountId, name1: data.name },
    });
    
    // Secondary contact if exists
    if (data.secondaryContact) {
      contacts.push({
        id: generateUUID(`contact-${data.name}-${data.secondaryContact.name}`),
        fullname: data.secondaryContact.name,
        title: `${data.secondaryContact.role} (Procurement)`,
        account: { id: accountId, name1: data.name },
      });
    }
  });
  
  return contacts;
}

/**
 * Converts UK test data to Opportunity create payloads.
 * Emits the primary opportunity plus any `additionalOpportunities` defined on
 * the account, so a single account can have multiple parallel deals.
 */
export function getOpportunityCreatePayloads(ownerId: string) {
  return ukTestData.flatMap((data) => {
    const accountId = generateUUID(`account-${data.name}`);

    const toPayload = (opp: UKAccountData['opportunity']) => ({
      id: generateUUID(`opp-${opp.name}`),
      name1: opp.name,
      account: { id: accountId, name1: data.name },
      stage: opp.stage,
      totalamount: opp.amount,
      confidence: opp.confidence,
      expectedclosedate: opp.expectedCloseDate,
      closedon: opp.closedOn,
      lastaction: `${opp.currency} ${opp.amount.toLocaleString()}`,
      ownerid: ownerId,
      confidenceTrend: 'flat',
    });

    const payloads = [toPayload(data.opportunity)];
    if (data.additionalOpportunities?.length) {
      for (const extra of data.additionalOpportunities) {
        payloads.push(toPayload(extra));
      }
    }
    return payloads;
  });
}

/**
 * Converts UK test data to Activity create payloads (next scheduled activities)
 */
export function getActivityCreatePayloads(ownerId: string) {
  return ukTestData.map((data) => {
    const accountId = generateUUID(`account-${data.name}`);
    const oppId = generateUUID(`opp-${data.opportunity.name}`);
    const isOverdue = new Date(data.nextActivityDate) < new Date('2026-05-11');
    
    return {
      id: generateUUID(`activity-${data.name}-next`),
      title: isOverdue 
        ? `[OVERDUE] Follow-up: ${data.name}` 
        : `Scheduled: ${data.name}`,
      type: 'visit',
      account: { id: accountId, name1: data.name },
      opportunity: { id: oppId, name1: data.opportunity.name },
      scheduleddate: data.nextActivityDate,
      draftStatus: 'confirmed',
      notes: `${data.department} | ${data.productLine}`,
      ownerid: ownerId,
    };
  });
}

/**
 * Returns a summary of the test data for display
 */
export function getTestDataSummary() {
  return {
    totalAccounts: ukTestData.length,
    totalContacts: ukTestData.reduce((sum, d) => sum + 1 + (d.secondaryContact ? 1 : 0), 0),
    totalOpportunities: ukTestData.reduce((sum, d) => sum + 1 + (d.additionalOpportunities?.length || 0), 0),
    totalActivities: ukTestData.length,
    totalPipelineValue: ukTestData.reduce(
      (sum, d) => sum + d.opportunity.amount + (d.additionalOpportunities?.reduce((s, o) => s + o.amount, 0) || 0),
      0,
    ),
    wonDeals: ukTestData.filter((d) => d.opportunity.stage === 'won').length,
    overdueFollowUps: ukTestData.filter((d) => new Date(d.nextActivityDate) < new Date('2026-05-11')).length,
  };
}
