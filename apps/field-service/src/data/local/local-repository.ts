import { UnsupportedCapabilityError, type DataSourceCapabilities, type WorkOrderRepository } from '@/domain/ports';
import type { DateRange, TimeSlot, WorkOrderDetail, WorkOrderSummary } from '@/domain/work-order';
import { createIdbCollection } from './idb';
import { browserStorage, fixtureCycle } from './fixture-cycle';
import { seedWorkOrders } from './seed';

const STORE = 'workorders';

/**
 * A browser-only fixture backend. It exists so the dashboard, the scheduling
 * logic and the AI capture flow can be built and demonstrated before the
 * production data source is chosen — NOT as a shipping deployment mode: it is
 * single-device, single-user and has no security model.
 */
const capabilities: DataSourceCapabilities = {
  id: 'local',
  selfScheduling: true,
  customerAssets: false,
  inspections: false,
  inventory: false,
};

function withinRange(workOrder: WorkOrderDetail, range: DateRange): boolean {
  const from = new Date(range.from).getTime();
  const to = new Date(range.to).getTime();
  // Scheduled work is placed by its slot; unscheduled work by its commitment,
  // so it still surfaces on the day it must be done.
  const anchor = workOrder.scheduledStart ?? workOrder.slaDueBy;
  if (!anchor) return false;
  const at = new Date(anchor).getTime();
  return at >= from && at <= to;
}

export function createLocalWorkOrderRepository(): WorkOrderRepository {
  const collection = createIdbCollection<WorkOrderDetail>(STORE);
  let seeding: Promise<void> | null = null;

  function ready(): Promise<void> {
    if (!seeding) {
      seeding = collection.all().then(async (rows) => {
        const cycle = fixtureCycle(STORE, browserStorage());
        if (cycle.shouldReset) {
          await collection.putAll(seedWorkOrders());
          cycle.markReady();
          return;
        }

        const existing = new Set(rows.map((row) => row.id));
        const missing = seedWorkOrders().filter((row) => !existing.has(row.id));
        if (missing.length > 0) await collection.putAll(missing);
        cycle.markReady();
      });
    }
    return seeding;
  }

  async function mutate(id: string, change: (w: WorkOrderDetail) => WorkOrderDetail): Promise<void> {
    await ready();
    const current = await collection.get(id);
    if (!current) throw new Error(`Work order ${id} not found`);
    await collection.put(change(current));
  }

  return {
    capabilities,

    async listMyWorkOrders(range: DateRange): Promise<WorkOrderSummary[]> {
      await ready();
      const rows = await collection.all();
      return rows.filter((row) => withinRange(row, range));
    },

    async getWorkOrder(id: string): Promise<WorkOrderDetail> {
      await ready();
      const row = await collection.get(id);
      if (!row) throw new Error(`Work order ${id} not found`);
      return row;
    },

    async rescheduleWorkOrder(id: string, slot: TimeSlot): Promise<void> {
      if (!capabilities.selfScheduling) throw new UnsupportedCapabilityError('selfScheduling', capabilities.id);
      await mutate(id, (w) => ({ ...w, scheduledStart: slot.start, scheduledEnd: slot.end, status: 'scheduled' }));
    },

    async startWorkOrder(id: string, at: string): Promise<void> {
      await ready();
      const active = (await collection.all()).find((workOrder) =>
        workOrder.id !== id && (workOrder.status === 'in-progress' || workOrder.status === 'travelling'),
      );
      if (active) throw new Error(`Work order ${active.number} is already active.`);
      await mutate(id, (w) => ({ ...w, status: 'in-progress', scheduledStart: w.scheduledStart ?? at, pausedAt: undefined, pauseReason: undefined }));
    },

    async pauseWorkOrder(id: string, at: string, reason: string): Promise<void> {
      await mutate(id, (w) => {
        if (w.status !== 'in-progress' && w.status !== 'travelling') {
          throw new Error('Only an active work order can be paused.');
        }
        return { ...w, status: 'paused', pausedAt: at, pauseReason: reason };
      });
    },

    async completeWorkOrder(id: string): Promise<void> {
      await mutate(id, (w) => ({ ...w, status: 'completed' }));
    },
  };
}
