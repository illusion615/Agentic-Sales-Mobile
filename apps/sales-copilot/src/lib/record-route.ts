/** Entity kinds that have list and detail routes in the app. */
export type RecordEntityType = 'account' | 'opportunity' | 'activity' | 'contact';

const LIST_ROUTE: Record<RecordEntityType, string> = {
  account: '/accounts',
  opportunity: '/opportunities',
  activity: '/activities',
  contact: '/contacts',
};

/** Canonical list route for a CRM record type. */
export function recordListRoute(type: RecordEntityType): string {
  return LIST_ROUTE[type];
}

/** Canonical detail route for a persisted CRM record. */
export function recordDetailRoute(type: RecordEntityType, id: string): string {
  const recordId = id.trim();
  if (!recordId) {
    throw new Error(`Cannot build ${type} detail route: record id is required`);
  }
  return `${recordListRoute(type)}/${recordId}`;
}