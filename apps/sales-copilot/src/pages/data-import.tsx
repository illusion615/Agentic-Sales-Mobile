/**
 * Data Import Page
 * 
 * Allows importing UK test data into the app's data layer.
 * Uses the existing Dataverse schema with field mappings.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Upload, CheckCircle, AlertCircle, Database, Users, Target, Calendar, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useUser } from '@/hooks/use-user';
import { useCreateAccount } from '@/generated/hooks/use-account';
import { useCreateContact } from '@/generated/hooks/use-contact';
import { useCreateOpportunity } from '@/generated/hooks/use-opportunity';
import { useCreateActivity } from '@/generated/hooks/use-activity';
import {
  ukTestData,
  getAccountCreatePayloads,
  getTestDataSummary,
  type UKAccountData,
} from '@/data/uk-test-data';
import type { OpportunityConfidencetrendKey } from '@/generated/models/opportunity-model';
import type { ActivityTypeKey, ActivityDraftstatusKey } from '@/generated/models/activity-model';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
} as const;

export default function DataImportPage() {
  const navigate = useNavigate();
  const { data: user } = useUser();
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{
    accounts: 'pending' | 'importing' | 'done' | 'error';
    contacts: 'pending' | 'importing' | 'done' | 'error';
    opportunities: 'pending' | 'importing' | 'done' | 'error';
    activities: 'pending' | 'importing' | 'done' | 'error';
  }>({
    accounts: 'pending',
    contacts: 'pending',
    opportunities: 'pending',
    activities: 'pending',
  });
  const [importedCounts, setImportedCounts] = useState({
    accounts: 0,
    contacts: 0,
    opportunities: 0,
    activities: 0,
  });

  const createAccount = useCreateAccount();
  const createContact = useCreateContact();
  const createOpportunity = useCreateOpportunity();
  const createActivity = useCreateActivity();

  const summary = getTestDataSummary();
  const ownerId = user?.objectId || '';

  const handleImport = async () => {
    setIsImporting(true);

    // Map to store account name -> real Dataverse ID
    const accountIdMap = new Map<string, string>();
    // Map to store opportunity name -> real Dataverse ID
    const oppIdMap = new Map<string, string>();

    try {
      // 1. Import Accounts and collect real IDs
      setImportStatus((prev) => ({ ...prev, accounts: 'importing' }));
      const accountPayloads = getAccountCreatePayloads(ownerId);
      let accountCount = 0;
      for (const payload of accountPayloads) {
        try {
          // Remove the local id from payload - Dataverse will generate its own
          const { id: _localId, ...createData } = payload;
          const createdAccount = await createAccount.mutateAsync(createData);
          // Save the real ID from Dataverse
          accountIdMap.set(payload.name1, createdAccount.id);
          accountCount++;
        } catch (err) {
          console.error('Failed to create account:', payload.name1, err);
        }
      }
      setImportedCounts((prev) => ({ ...prev, accounts: accountCount }));
      setImportStatus((prev) => ({ ...prev, accounts: accountCount > 0 ? 'done' : 'error' }));

      // 2. Import Contacts with real account IDs
      setImportStatus((prev) => ({ ...prev, contacts: 'importing' }));
      let contactCount = 0;
      for (const data of ukTestData) {
        const realAccountId = accountIdMap.get(data.name);
        if (!realAccountId) {
          console.warn('No account ID found for:', data.name);
          continue;
        }

        // Primary contact
        try {
          await createContact.mutateAsync({
            fullname: data.primaryContact.name,
            title: `${data.primaryContact.role} (Primary)`,
            account: { id: realAccountId, name1: data.name },
          });
          contactCount++;
        } catch (err) {
          console.error('Failed to create contact:', data.primaryContact.name, err);
        }

        // Secondary contact if exists
        if (data.secondaryContact) {
          try {
            await createContact.mutateAsync({
              fullname: data.secondaryContact.name,
              title: `${data.secondaryContact.role} (Procurement)`,
              account: { id: realAccountId, name1: data.name },
            });
            contactCount++;
          } catch (err) {
            console.error('Failed to create contact:', data.secondaryContact.name, err);
          }
        }
      }
      setImportedCounts((prev) => ({ ...prev, contacts: contactCount }));
      setImportStatus((prev) => ({ ...prev, contacts: contactCount > 0 ? 'done' : 'error' }));

      // 3. Import Opportunities with real account IDs
      setImportStatus((prev) => ({ ...prev, opportunities: 'importing' }));
      let oppCount = 0;
      for (const data of ukTestData) {
        const realAccountId = accountIdMap.get(data.name);
        if (!realAccountId) {
          console.warn('No account ID found for opportunity:', data.name);
          continue;
        }

        try {
          const createdOpp = await createOpportunity.mutateAsync({
            name1: data.opportunity.name,
            account: { id: realAccountId, name1: data.name },
            stageKey: data.opportunity.stage,
            totalamount: data.opportunity.amount,
            confidence: data.opportunity.confidence,
            expectedclosedate: data.opportunity.expectedCloseDate,
            closedon: data.opportunity.closedOn,
            lastaction: `${data.opportunity.currency} ${data.opportunity.amount.toLocaleString()}`,
            ownerid: ownerId,
            confidencetrendKey: 'ConfidencetrendKey2' as OpportunityConfidencetrendKey,
          });
          // Save real opportunity ID
          oppIdMap.set(data.opportunity.name, createdOpp.id);
          oppCount++;
        } catch (err) {
          console.error('Failed to create opportunity:', data.opportunity.name, err);
        }
      }
      setImportedCounts((prev) => ({ ...prev, opportunities: oppCount }));
      setImportStatus((prev) => ({ ...prev, opportunities: oppCount > 0 ? 'done' : 'error' }));

      // 4. Import Activities with real account and opportunity IDs
      setImportStatus((prev) => ({ ...prev, activities: 'importing' }));
      let activityCount = 0;
      for (const data of ukTestData) {
        const realAccountId = accountIdMap.get(data.name);
        const realOppId = oppIdMap.get(data.opportunity.name);
        if (!realAccountId) {
          console.warn('No account ID found for activity:', data.name);
          continue;
        }

        const isOverdue = new Date(data.nextActivityDate) < new Date('2026-05-11');

        try {
          await createActivity.mutateAsync({
            title: isOverdue
              ? `[OVERDUE] Follow-up: ${data.name}`
              : `Scheduled: ${data.name}`,
            typeKey: 'TypeKey0' as ActivityTypeKey,
            account: { id: realAccountId, name1: data.name },
            opportunity: realOppId ? { id: realOppId, name1: data.opportunity.name } : undefined,
            scheduleddate: data.nextActivityDate,
            draftstatusKey: 'DraftstatusKey1' as ActivityDraftstatusKey,
            notes: `${data.department} | ${data.productLine}`,
            ownerid: ownerId,
          });
          activityCount++;
        } catch (err) {
          console.error('Failed to create activity:', data.name, err);
        }
      }
      setImportedCounts((prev) => ({ ...prev, activities: activityCount }));
      setImportStatus((prev) => ({ ...prev, activities: activityCount > 0 ? 'done' : 'error' }));

      toast.success('UK test data imported successfully!');
    } catch (err) {
      console.error('Import failed:', err);
      toast.error('Import failed. Check console for details.');
    } finally {
      setIsImporting(false);
    }
  };

  const getStatusIcon = (status: 'pending' | 'importing' | 'done' | 'error') => {
    switch (status) {
      case 'pending':
        return <div className="w-5 h-5 rounded-full border-2 border-muted-foreground" />;
      case 'importing':
        return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
      case 'done':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-destructive" />;
    }
  };

  const allDone = Object.values(importStatus).every((s) => s === 'done');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Import UK Test Data</h1>
            <p className="text-sm text-muted-foreground">8 NHS Account records with linked data</p>
          </div>
        </div>
      </div>

      <motion.div
        className="p-4 space-y-4"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {/* Summary Card */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Data Summary</CardTitle>
              <CardDescription>Records to be imported</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Database className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{summary.totalAccounts}</p>
                    <p className="text-sm text-muted-foreground">Accounts</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{summary.totalContacts}</p>
                    <p className="text-sm text-muted-foreground">Contacts</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Target className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">£{(summary.totalPipelineValue / 1000000).toFixed(1)}M</p>
                    <p className="text-sm text-muted-foreground">Pipeline Value</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Calendar className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{summary.overdueFollowUps}</p>
                    <p className="text-sm text-muted-foreground">Overdue</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Account Preview */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account Preview</CardTitle>
              <CardDescription>8 UK NHS hospitals</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {ukTestData.map((data, idx: number) => (
                <div
                  key={idx}
                  className="flex items-start justify-between p-3 rounded-lg bg-muted/50 border border-border"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{data.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {data.city} • {data.accountType}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {data.primaryContact.name} ({data.primaryContact.role})
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p className="font-semibold text-sm">
                      £{(data.opportunity.amount / 1000).toFixed(0)}K
                    </p>
                    <p className={cn(
                      'text-xs',
                      data.opportunity.stage === 'StageKey4' ? 'text-green-600 dark:text-green-400' :
                      data.opportunity.stage === 'StageKey3' ? 'text-yellow-600 dark:text-yellow-400' :
                      'text-muted-foreground'
                    )}>
                      {data.opportunity.stage === 'StageKey4' ? 'Won' :
                       data.opportunity.stage === 'StageKey3' ? 'Negotiation' :
                       data.opportunity.stage === 'StageKey2' ? 'Proposal' :
                       data.opportunity.stage === 'StageKey1' ? 'Qualification' : 'Discovery'}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Import Status */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Import Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  {getStatusIcon(importStatus.accounts)}
                  <span>Accounts</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {importStatus.accounts === 'done' ? `${importedCounts.accounts} imported` : ''}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  {getStatusIcon(importStatus.contacts)}
                  <span>Contacts</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {importStatus.contacts === 'done' ? `${importedCounts.contacts} imported` : ''}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  {getStatusIcon(importStatus.opportunities)}
                  <span>Opportunities</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {importStatus.opportunities === 'done' ? `${importedCounts.opportunities} imported` : ''}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  {getStatusIcon(importStatus.activities)}
                  <span>Activities</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {importStatus.activities === 'done' ? `${importedCounts.activities} imported` : ''}
                </span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Import Button */}
        <motion.div variants={itemVariants} className="pt-4">
          {allDone ? (
            <Button className="w-full" size="lg" onClick={() => navigate('/')}>
              <CheckCircle className="w-5 h-5 mr-2" />
              Done - Go to Dashboard
            </Button>
          ) : (
            <Button
              className="w-full"
              size="lg"
              onClick={handleImport}
              disabled={isImporting}
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5 mr-2" />
                  Import UK Test Data
                </>
              )}
            </Button>
          )}
        </motion.div>

        {/* Field Mapping Info */}
        <motion.div variants={itemVariants}>
          <Card className="bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Field Mapping</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1">
              <p>• <strong>Address</strong>: City + Country</p>
              <p>• <strong>Industry</strong>: Account Type (NHS Trust, etc.)</p>
              <p>• <strong>Notes</strong>: Department + Product + Next Date + Notes</p>
              <p>• <strong>Stage</strong>: Discovery→prospecting, Proposal→proposal, Pricing→negotiation</p>
              <p>• <strong>Amount</strong>: GBP values in Total Amount field</p>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}
