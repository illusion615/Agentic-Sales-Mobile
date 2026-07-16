import type { Activity } from '@/generated/models/activity-model';
import type { Contact } from '@/generated/models/contact-model';
import type { Opportunity } from '@/generated/models/opportunity-model';

/** Resolve the parent account across Dataverse's polymorphic Regarding shapes. */
export function resolveActivityAccount(
  activity: Activity,
  opportunities: readonly Opportunity[],
  contacts: readonly Contact[] = [],
): Activity['account'] {
  if (activity.account?.id) return activity.account;

  const opportunityId = activity.opportunity?.id;
  if (opportunityId) {
    const account = opportunities.find((candidate) => candidate.id === opportunityId)?.account;
    if (account?.id) return { id: account.id, name1: account.name1 };
  }

  const contactIds = [
    activity.contact?.id,
    ...(activity.contacts ?? []).map((contact) => contact.id),
  ].filter((id): id is string => !!id);
  for (const contactId of contactIds) {
    const account = contacts.find((candidate) => candidate.id === contactId)?.account;
    if (account?.id) return { id: account.id, name1: account.name1 };
  }

  return undefined;
}

/**
 * Resolve the app's two-level activity relationship from Dataverse's single
 * polymorphic Regarding lookup.
 *
 * An activity regarding an opportunity or contact stores only that entity ID.
 * The account is therefore inherited from the current related record. Keeping
 * this join in one pure boundary gives detail/edit consumers the fullest useful
 * relationship context without inventing a second relationship in Dataverse.
 */
export function resolveActivityRelations(
  activity: Activity,
  opportunities: readonly Opportunity[],
  contacts: readonly Contact[] = [],
): Activity {
  const resolvedAccount = resolveActivityAccount(activity, opportunities, contacts);
  const opportunityId = activity.opportunity?.id;
  if (opportunityId) {
    const opportunity = opportunities.find((candidate) => candidate.id === opportunityId);
    if (opportunity) {
      return {
        ...activity,
        opportunity: {
          id: opportunity.id,
          name1: opportunity.name1,
        },
        account: resolvedAccount,
      };
    }
  }

  const contactId = activity.contact?.id;
  if (!contactId) return activity;

  const contact = contacts.find((candidate) => candidate.id === contactId);
  if (!contact) return activity;

  return {
    ...activity,
    contact: {
      id: contact.id,
      fullname: contact.fullname,
    },
    account: resolvedAccount,
  };
}
