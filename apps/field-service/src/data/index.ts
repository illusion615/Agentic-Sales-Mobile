/**
 * Composition root for data access.
 *
 * Choosing the backend is a DEPLOYMENT decision, not a user setting: a code
 * app's Dataverse data sources are declared statically in power.config.json and
 * generated against a live org, so one build cannot bind tables that are absent
 * from its target environment. Each customer therefore gets a build composed
 * with the adapter their environment supports; everything above this file is
 * identical between them.
 */
import type { DataSourceId, WorkOrderRepository } from '@/domain/ports';
import { createLocalWorkOrderRepository } from './local/local-repository';

function resolveConfiguredSource(): DataSourceId {
  const configured = import.meta.env.VITE_DATA_SOURCE;
  return configured === 'custom' || configured === 'field-service' ? configured : 'local';
}

export function createWorkOrderRepository(
  source: DataSourceId = resolveConfiguredSource(),
): WorkOrderRepository {
  switch (source) {
    case 'local':
      return createLocalWorkOrderRepository();
    case 'custom':
    case 'field-service':
      // Both need generated Dataverse services, which can only be produced
      // against an org that actually has those tables.
      throw new Error(
        `The "${source}" data source is not implemented yet. Run the data-source generation against a target environment first.`,
      );
  }
}

export const workOrderRepository = createWorkOrderRepository();
