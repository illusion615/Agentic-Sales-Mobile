import type { CustomerRepository } from '@/domain/ports';
import type { CustomerProfile, ServiceHistoryEntry } from '@/domain/customer';
import { createIdbCollection } from './idb';
import { browserStorage, fixtureCycle } from './fixture-cycle';
import { seedCustomers, seedServiceHistory } from './seed';
const STORE = 'customers';

/**
 * Customers live in IndexedDB because the capture flow will later write
 * profile updates back to them. Service history stays read-only in memory: it
 * is a record of closed work, never edited from the device.
 */
export function createLocalCustomerRepository(): CustomerRepository {
  const collection = createIdbCollection<CustomerProfile>(STORE);
  const history = seedServiceHistory();
  let seeding: Promise<void> | null = null;

  function ready(): Promise<void> {
    if (!seeding) {
      seeding = collection.all().then(async (rows) => {
        const cycle = fixtureCycle(STORE, browserStorage());
        if (cycle.shouldReset) {
          await collection.putAll(seedCustomers());
          cycle.markReady();
          return;
        }

        const existing = new Set(rows.map((row) => row.id));
        const missing = seedCustomers().filter((row) => !existing.has(row.id));
        if (missing.length > 0) await collection.putAll(missing);
        cycle.markReady();
      });
    }
    return seeding;
  }

  return {
    async getProfile(customerId: string): Promise<CustomerProfile> {
      await ready();
      const profile = await collection.get(customerId);
      if (!profile) throw new Error(`Customer ${customerId} not found`);
      return profile;
    },

    async listServiceHistory(customerId: string, limit?: number): Promise<ServiceHistoryEntry[]> {
      const entries = [...(history[customerId] ?? [])].sort(
        (a, b) => new Date(b.completedOn).getTime() - new Date(a.completedOn).getTime(),
      );
      return limit ? entries.slice(0, limit) : entries;
    },

    async applyProfileUpdates(customerId, updates): Promise<void> {
      if (updates.length === 0) return;
      await ready();
      const profile = await collection.get(customerId);
      if (!profile) throw new Error(`Customer ${customerId} not found`);

      const cautions = [...(profile.cautions ?? [])];
      const contacts = [...profile.contacts];
      let siteAccessNotes = profile.siteAccessNotes;

      for (const update of updates) {
        switch (update.field) {
          case 'siteAccessNotes':
            // Appended, never replaced: access rules accumulate across visits.
            siteAccessNotes = siteAccessNotes ? `${siteAccessNotes}\n${update.value}` : update.value;
            break;
          case 'caution':
            if (!cautions.includes(update.value)) cautions.push(update.value);
            break;
          case 'contact':
            if (!contacts.some((c) => update.value.includes(c.name))) {
              contacts.push({ name: update.value });
            }
            break;
        }
      }

      await collection.put({ ...profile, siteAccessNotes, cautions, contacts });
    },
  };
}
