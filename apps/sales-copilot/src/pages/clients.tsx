import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Building2, Phone, ChevronRight, AlertTriangle, Search, Users } from 'lucide-react';
import { MobileLayout } from '@/components/mobile-layout';
import { cn } from '@/lib/utils';
import { useAccountList } from '@/generated/hooks/use-account';
import { useContactList } from '@/generated/hooks/use-contact';
import { AccountTierkeyToLabel, AccountRegionkeyToLabel } from '@/generated/models/account-model';
import type { Account, AccountTierkey, AccountRegionkey } from '@/generated/models/account-model';
import type { Contact } from '@/generated/models/contact-model';
import { getRegionEnglish } from '@/lib/display-labels';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] } },
} as const;

function getDaysSinceContact(dateStr?: string): number {
  if (!dateStr) return 999;
  const date = new Date(dateStr);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getContactStatus(daysSince: number): { label: string; color: string; isAtRisk: boolean } {
  if (daysSince <= 7) return { label: 'Recent', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', isAtRisk: false };
  if (daysSince <= 14) return { label: 'Active', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', isAtRisk: false };
  if (daysSince <= 30) return { label: 'Cooling', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', isAtRisk: false };
  return { label: 'At Risk', color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400', isAtRisk: true };
}

export default function ClientsPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [showAtRiskOnly, setShowAtRiskOnly] = useState(false);

  // Fetch from Dataverse only
  const { data: accounts = [], isLoading: isLoadingAccounts } = useAccountList();
  const { data: contacts = [] } = useContactList();

  // Helper to get contacts by account ID
  const getContactsByAccountId = (accountId: string): Contact[] => {
    return contacts.filter((c: Contact) => c.account?.id === accountId);
  };

  // Enrich accounts with contact status
  const enrichedAccounts = useMemo(() => {
    return accounts.map((account: Account) => {
      const daysSince = getDaysSinceContact(account.lastcontactedon || account.lastinteractiondate);
      const contactStatus = getContactStatus(daysSince);
      const accountContacts = getContactsByAccountId(account.id);
      return { ...account, daysSince, contactStatus, contactCount: accountContacts.length };
    });
  }, [accounts, contacts]);

  // Apply filters
  const filteredAccounts = useMemo(() => {
    return enrichedAccounts.filter((account) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = account.name1?.toLowerCase().includes(query);
        const matchesIndustry = account.industry?.toLowerCase().includes(query);
        if (!matchesName && !matchesIndustry) return false;
      }
      // Tier filter
      if (tierFilter !== 'all' && String(account.tierKey) !== tierFilter) return false;
      // At risk filter
      if (showAtRiskOnly && !account.contactStatus.isAtRisk) return false;
      return true;
    });
  }, [enrichedAccounts, searchQuery, tierFilter, showAtRiskOnly]);

  // Stats
  const totalClients = accounts.length;
  const atRiskCount = enrichedAccounts.filter((a) => a.contactStatus.isAtRisk).length;
  const contactedThisWeek = enrichedAccounts.filter((a) => a.daysSince <= 7).length;

  if (isLoadingAccounts) {
    return (
      <MobileLayout title="Client Coverage">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout title="Client Coverage">
      <div className="flex-1 overflow-y-auto pb-32">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="space-y-4 py-4"
        >
          {/* Stats Summary */}
          <motion.div variants={itemVariants} className="grid grid-cols-3 gap-2">
            <div className="glass-card p-3 text-center" style={{ borderRadius: 16 }}>
              <p className="text-2xl font-bold text-foreground">{totalClients}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="glass-card p-3 text-center" style={{ borderRadius: 16 }}>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{contactedThisWeek}</p>
              <p className="text-xs text-muted-foreground">This Week</p>
            </div>
            <div className="glass-card p-3 text-center" style={{ borderRadius: 16 }}>
              <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">{atRiskCount}</p>
              <p className="text-xs text-muted-foreground">At Risk</p>
            </div>
          </motion.div>

          {/* Search & Filters */}
          <motion.div variants={itemVariants} className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                className="pl-9 h-10 bg-muted/50 border-0"
              />
            </div>
            <div className="flex gap-2">
              <Select value={tierFilter} onValueChange={setTierFilter}>
                <SelectTrigger className="flex-1 h-9 bg-muted/50 border-0">
                  <SelectValue placeholder="Tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tiers</SelectItem>
                  {Object.entries(AccountTierkeyToLabel).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant={showAtRiskOnly ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowAtRiskOnly(!showAtRiskOnly)}
                className={cn(
                  'gap-1.5 h-9',
                  showAtRiskOnly && 'bg-rose-500 hover:bg-rose-600 text-white border-0'
                )}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                At Risk
              </Button>
            </div>
          </motion.div>

          {/* Client List */}
          <motion.div variants={itemVariants} className="space-y-2">
            {filteredAccounts.length === 0 ? (
              <Empty className="py-12">
                <EmptyHeader>
                  <EmptyTitle>No clients found</EmptyTitle>
                  <EmptyDescription>
                    {accounts.length === 0 
                      ? 'Add clients in Dataverse to see them here'
                      : 'Try adjusting your search or filters'
                    }
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              filteredAccounts.map((account) => (
                <motion.div
                  key={account.id}
                  variants={itemVariants}
                  className="glass-card p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  style={{ borderRadius: 16 }}
                  onClick={() => navigate(`/clients/${account.id}`)}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-primary-foreground" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-sm font-medium text-foreground truncate flex-1">
                          {account.name1}
                        </h3>
                        {account.tierKey && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                            {AccountTierkeyToLabel[account.tierKey as AccountTierkey]}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mb-1.5">
                        {account.industry || 'Uncategorized'}
                        {account.regionKey && ` • ${getRegionEnglish(AccountRegionkeyToLabel[account.regionKey as AccountRegionkey])}`}
                      </p>
                      <div className="flex items-center gap-3 text-xs">
                        <span className={cn('px-1.5 py-0.5 rounded-md text-[10px] font-medium', account.contactStatus.color)}>
                          {account.contactStatus.isAtRisk && <AlertTriangle className="w-2.5 h-2.5 inline mr-0.5" />}
                          {account.daysSince}d ago
                        </span>
                        {account.phone && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Phone className="w-3 h-3" />
                            <span className="truncate max-w-[80px]">{account.phone}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Arrow */}
                    <ChevronRight className="w-4 h-4 text-muted-foreground/50 flex-shrink-0 mt-1" />
                  </div>
                </motion.div>
              ))
            )}
          </motion.div>

          {/* Footer hint */}
          {filteredAccounts.length > 0 && (
            <motion.div variants={itemVariants} className="text-center text-xs text-muted-foreground py-2">
              Showing {filteredAccounts.length} of {totalClients} clients
            </motion.div>
          )}
        </motion.div>
      </div>
    </MobileLayout>
  );
}
