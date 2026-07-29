/**
 * The namespace prefill expressions are written against.
 *
 * Form authors write `#workorder?.customer?.name` without knowing how this app
 * stores anything, so this is a published contract, not an implementation
 * detail: renaming a field here breaks every form definition that referenced
 * it. Extend it rather than reshaping it.
 */
import type { CustomerProfile } from './customer';
import type { WorkOrderDetail } from './work-order';

export function buildPrefillContext(
  workOrder: WorkOrderDetail,
  customer?: CustomerProfile,
): Record<string, unknown> {
  return {
    workorder: {
      id: workOrder.id,
      number: workOrder.number,
      incidentType: workOrder.incidentType ?? '',
      customer: {
        id: workOrder.customerId,
        name: workOrder.customerName,
        industry: customer?.industry ?? '',
      },
      customerEquipment: {
        id: workOrder.assetId ?? '',
        name: workOrder.assetName ?? '',
        contactName: workOrder.contactName ?? customer?.contacts[0]?.name ?? '',
        contactPhone: workOrder.contactPhone ?? customer?.contacts[0]?.phone ?? '',
      },
      address: workOrder.address.line1,
    },
  };
}
