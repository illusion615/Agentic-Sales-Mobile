import type { CustomerRepository } from '@/domain/ports';
import type { CustomerProfile, ServiceHistoryEntry } from '@/domain/customer';
import { createIdbCollection } from './idb';
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
        if (rows.length === 0) await collection.putAll(seedCustomers());
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
  };
}
