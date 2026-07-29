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
import type {
  BriefingProvider,
  CaptureRepository,
  CustomerRepository,
  DataSourceId,
  FieldExtractor,
  FormSchemaRepository,
  VisitSummaryProvider,
  WorkOrderRepository,
} from '@/domain/ports';
import { createLocalWorkOrderRepository } from './local/local-repository';
import { createLocalCustomerRepository } from './local/customer-repository';
import { createLocalCaptureRepository } from './local/capture-repository';
import { createLocalFormSchemaRepository } from './local/form-schema-repository';
import { createRuleBasedBriefingProvider } from './local/briefing-provider';
import { createRuleBasedFieldExtractor } from './local/field-extractor';
import { createRuleBasedVisitSummaryProvider } from './local/visit-summary-provider';

function resolveConfiguredSource(): DataSourceId {
  const configured = import.meta.env.VITE_DATA_SOURCE;
  return configured === 'custom' || configured === 'field-service' ? configured : 'local';
}

function notImplemented(source: DataSourceId): never {
  // Both need generated Dataverse services, which can only be produced against
  // an org that actually has those tables.
  throw new Error(
    `The "${source}" data source is not implemented yet. Run the data-source generation against a target environment first.`,
  );
}

export function createWorkOrderRepository(
  source: DataSourceId = resolveConfiguredSource(),
): WorkOrderRepository {
  return source === 'local' ? createLocalWorkOrderRepository() : notImplemented(source);
}

export function createCustomerRepository(
  source: DataSourceId = resolveConfiguredSource(),
): CustomerRepository {
  return source === 'local' ? createLocalCustomerRepository() : notImplemented(source);
}

export function createCaptureRepository(
  source: DataSourceId = resolveConfiguredSource(),
): CaptureRepository {
  return source === 'local' ? createLocalCaptureRepository() : notImplemented(source);
}

/**
 * Form definitions are authored centrally and will be served from Dataverse.
 * The local source parses bundled fixtures through the same parser, so the
 * shape the app consumes is identical either way.
 */
export function createFormSchemaRepository(
  source: DataSourceId = resolveConfiguredSource(),
): FormSchemaRepository {
  return source === 'local' ? createLocalFormSchemaRepository() : notImplemented(source);
}

/**
 * The briefing writer. Independent of the data source: a Dataverse-backed
 * deployment still falls back to the rule-based composer when no model is
 * reachable, which is why the result carries its provenance.
 */
export function createBriefingProvider(): BriefingProvider {
  return createRuleBasedBriefingProvider();
}

/** Same reasoning as the briefing provider: model in production, rules as the floor. */
export function createFieldExtractor(): FieldExtractor {
  return createRuleBasedFieldExtractor();
}

export function createVisitSummaryProvider(): VisitSummaryProvider {
  return createRuleBasedVisitSummaryProvider();
}

export const workOrderRepository = createWorkOrderRepository();
export const customerRepository = createCustomerRepository();
export const captureRepository = createCaptureRepository();
export const formSchemaRepository = createFormSchemaRepository();
export const briefingProvider = createBriefingProvider();
export const fieldExtractor = createFieldExtractor();
export const visitSummaryProvider = createVisitSummaryProvider();
