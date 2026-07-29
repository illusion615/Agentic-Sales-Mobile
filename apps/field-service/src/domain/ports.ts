/**
 * Data-source ports.
 *
 * The app talks to these interfaces only; which backend fulfils them is decided
 * once, in the composition root. Three implementations are foreseen:
 *
 *   local          — browser-side fixture store, for development and demos
 *   custom         — bespoke Dataverse tables, for customers without Field Service
 *   field-service  — Dynamics 365 Field Service standard tables
 *
 * Two rules keep this from rotting into a lowest-common-denominator API:
 *
 * 1. Methods are named after BUSINESS USE CASES, not table CRUD. A use case can
 *    be fulfilled very differently by a scheduling engine and by a plain table.
 * 2. Anything a backend may be unable to do is declared in `capabilities`
 *    instead of silently failing, so the UI can degrade honestly. A repository
 *    must reject a call it has not declared support for.
 */
import type { DateRange, TimeSlot, WorkOrderDetail, WorkOrderSummary } from './work-order';
import type { CustomerProfile, ServiceHistoryEntry } from './customer';
import type { Briefing, BriefingContext } from './briefing';
import type { Evidence, WorkSession } from './capture';
import type { FieldValue } from './questionnaire';
import type { ExtractionInput, ExtractionResult, CustomerUpdateCandidate } from './extraction';

export type DataSourceId = 'local' | 'custom' | 'field-service';

export interface DataSourceCapabilities {
  id: DataSourceId;
  /**
   * Whether a technician may move their own appointments. Dispatch-governed
   * deployments keep this false and the app can only propose an order.
   */
  selfScheduling: boolean;
  /** Customer equipment and its service history. */
  customerAssets: boolean;
  /** Structured task lists and inspection forms. */
  inspections: boolean;
  /** Parts and truck stock. */
  inventory: boolean;
}

export interface WorkOrderRepository {
  readonly capabilities: DataSourceCapabilities;

  /** The signed-in technician's assignments in a date range. */
  listMyWorkOrders(range: DateRange): Promise<WorkOrderSummary[]>;

  getWorkOrder(id: string): Promise<WorkOrderDetail>;

  /**
   * Move an appointment. Only callable when `capabilities.selfScheduling`;
   * implementations that cannot must throw {@link UnsupportedCapabilityError}.
   */
  rescheduleWorkOrder(id: string, slot: TimeSlot): Promise<void>;

  /** Record that work has begun on site. */
  startWorkOrder(id: string, at: string): Promise<void>;

  /** Close the job once its questionnaire has been submitted. */
  completeWorkOrder(id: string, at: string): Promise<void>;
}

/** Thrown when a call exceeds what the configured backend declares it can do. */
export class UnsupportedCapabilityError extends Error {
  constructor(
    readonly capability: keyof DataSourceCapabilities,
    readonly source: DataSourceId,
  ) {
    super(`The ${source} data source does not support ${String(capability)}.`);
    this.name = 'UnsupportedCapabilityError';
  }
}

export interface CustomerRepository {
  getProfile(customerId: string): Promise<CustomerProfile>;
  /** Past visits to this customer, newest first, optionally capped. */
  listServiceHistory(customerId: string, limit?: number): Promise<ServiceHistoryEntry[]>;
  /** Apply the profile updates a technician accepted during review. */
  applyProfileUpdates(customerId: string, updates: readonly CustomerUpdateCandidate[]): Promise<void>;
}

/**
 * Produces the pre-visit briefing.
 *
 * Separate from the repositories because it is a different kind of dependency:
 * a language model in production, a deterministic composer locally. The result
 * carries its own provenance so the UI never implies more than was actually
 * done.
 */
export interface BriefingProvider {
  generate(context: BriefingContext): Promise<Briefing>;
}

export interface CaptureRepository {
  /** Resume the visit's open session, or begin one. */
  openSession(workOrderId: string): Promise<WorkSession>;
  getSession(sessionId: string): Promise<WorkSession>;
  /** Append-only: captured fragments are never edited or removed. */
  appendEvidence(evidence: Omit<Evidence, 'id'>): Promise<Evidence>;
  listEvidence(sessionId: string): Promise<Evidence[]>;
  saveAnswers(sessionId: string, values: readonly FieldValue[]): Promise<void>;
  getAnswers(sessionId: string): Promise<FieldValue[]>;
  /** Proposed customer-profile changes, held until review accepts or drops them. */
  saveCustomerUpdates(sessionId: string, updates: readonly CustomerUpdateCandidate[]): Promise<void>;
  getCustomerUpdates(sessionId: string): Promise<CustomerUpdateCandidate[]>;
  submitSession(sessionId: string, at: string): Promise<void>;
}

/**
 * Proposes work order answers and customer-profile updates from captured
 * fragments. A language model in production; rule-based locally.
 */
export interface FieldExtractor {
  extract(input: ExtractionInput): Promise<ExtractionResult>;
}
