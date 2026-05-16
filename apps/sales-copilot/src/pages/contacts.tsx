import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { User, Phone, Mail, ChevronRight, Search, Building2, Briefcase } from 'lucide-react';
import { MobileLayout } from '@/components/mobile-layout';
import { cn } from '@/lib/utils';
import { useContactList } from '@/generated/hooks/use-contact';
import { useAccountList } from '@/generated/hooks/use-account';
import { useQueryClient } from '@tanstack/react-query';
import type { Contact } from '@/generated/models/contact-model';
import type { Account } from '@/generated/models/account-model';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { useCopilot } from '@/contexts/copilot-context';
import { getLocale } from '@/lib/i18n';
import { PullToRefresh } from '@/components/pull-to-refresh';

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

export default function ContactsPage() {
  const locale = getLocale();

  // Copilot context for agent awareness
  const copilot = useCopilot();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: contacts = [], isLoading: isLoadingContacts } = useContactList();
  const { data: accounts = [] } = useAccountList();
  const queryClient = useQueryClient();

  // Pull to refresh handler
  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['contact-list'] }),
      queryClient.invalidateQueries({ queryKey: ['account-list'] }),
    ]);
  }, [queryClient]);

  // Helper to get account by ID
  const getAccountById = (accountId?: string): Account | undefined => {
    if (!accountId) return undefined;
    return accounts.find((a: Account) => a.id === accountId);
  };

  // Enrich contacts with account data
  const enrichedContacts = useMemo(() => {
    return contacts.map((contact: Contact) => {
      const account = getAccountById(contact.account?.id);
      return { ...contact, accountData: account };
    });
  }, [contacts, accounts]);

  // Apply search filter
  const filteredContacts = useMemo(() => {
    if (!searchQuery) return enrichedContacts;
    
    const query = searchQuery.toLowerCase();
    return enrichedContacts.filter((contact) => {
      const matchesName = contact.fullname?.toLowerCase().includes(query);
      const matchesEmail = contact.email?.toLowerCase().includes(query);
      const matchesTitle = contact.title?.toLowerCase().includes(query);
      const matchesAccount = contact.account?.name1?.toLowerCase().includes(query);
      return matchesName || matchesEmail || matchesTitle || matchesAccount;
    });
  }, [enrichedContacts, searchQuery]);

  // Stats
  const totalContacts = contacts.length;
  const contactsWithEmail = contacts.filter((c: Contact) => c.email).length;
  const contactsWithPhone = contacts.filter((c: Contact) => c.phone).length;

  // Set page context for Copilot agent awareness
  useEffect(() => {
    copilot.setPageContext({
      currentPage: locale === 'zh-Hans' ? '联系人列表' : 'Contacts List',
      summary: locale === 'zh-Hans'
        ? `联系人列表: 共${totalContacts}个联系人，${contactsWithEmail}个有邮箱，${contactsWithPhone}个有电话`
        : `Contacts list: ${totalContacts} total contacts, ${contactsWithEmail} with email, ${contactsWithPhone} with phone`,
      pageData: {
        totalContacts,
        contactsWithEmail,
        contactsWithPhone,
        searchQuery,
        displayedCount: filteredContacts.length,
      },
    });
    
    return () => {
      copilot.setPageContext(null);
    };
  }, [totalContacts, contactsWithEmail, contactsWithPhone, searchQuery, filteredContacts.length, locale, copilot.setPageContext]);
  if (isLoadingContacts) {
    return (
      <MobileLayout title="Contacts">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout title="Contacts">
      <PullToRefresh onRefresh={handleRefresh} className="flex-1 overflow-y-auto pb-32">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="space-y-4 py-4"
        >
          {/* Stats Summary */}
          <motion.div variants={itemVariants} className="grid grid-cols-3 gap-2">
            <div className="glass-card p-3 text-center" style={{ borderRadius: 16 }}>
              <p className="text-2xl font-bold text-foreground">{totalContacts}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="glass-card p-3 text-center" style={{ borderRadius: 16 }}>
              <p className="text-2xl font-bold text-primary">{contactsWithEmail}</p>
              <p className="text-xs text-muted-foreground">With Email</p>
            </div>
            <div className="glass-card p-3 text-center" style={{ borderRadius: 16 }}>
              <p className="text-2xl font-bold text-primary">{contactsWithPhone}</p>
              <p className="text-xs text-muted-foreground">With Phone</p>
            </div>
          </motion.div>

          {/* Search */}
          <motion.div variants={itemVariants}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                className="pl-9 h-10 bg-muted/50 border-0"
              />
            </div>
          </motion.div>

          {/* Contact List */}
          <motion.div variants={itemVariants} className="space-y-2">
            {filteredContacts.length === 0 ? (
              <Empty className="py-12">
                <EmptyHeader>
                  <EmptyTitle>No contacts found</EmptyTitle>
                  <EmptyDescription>
                    {contacts.length === 0 
                      ? 'Add contacts in Dataverse to see them here'
                      : 'Try adjusting your search'
                    }
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              filteredContacts.map((contact) => (
                <motion.div
                  key={contact.id}
                  variants={itemVariants}
                  className="glass-card p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  style={{ borderRadius: 16 }}
                  onClick={() => navigate(`/contacts/${contact.id}`)}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-primary-foreground" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-sm font-medium text-foreground truncate flex-1">
                          {contact.fullname}
                        </h3>
                        {contact.title && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0">
                            <Briefcase className="w-2.5 h-2.5 mr-0.5" />
                            {contact.title}
                          </Badge>
                        )}
                      </div>
                      {contact.account?.name1 && (
                        <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          {contact.account.name1}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-xs">
                        {contact.email && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Mail className="w-3 h-3" />
                            <span className="truncate max-w-[120px]">{contact.email}</span>
                          </span>
                        )}
                        {contact.phone && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Phone className="w-3 h-3" />
                            <span className="truncate max-w-[80px]">{contact.phone}</span>
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
          {filteredContacts.length > 0 && (
            <motion.div variants={itemVariants} className="text-center text-xs text-muted-foreground py-2">
              Showing {filteredContacts.length} of {totalContacts} contacts
            </motion.div>
          )}
        </motion.div>
      </PullToRefresh>
    </MobileLayout>
  );
}
