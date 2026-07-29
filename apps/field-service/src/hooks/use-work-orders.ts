import { useQuery } from '@tanstack/react-query';
import { workOrderRepository } from '@/data';
import type { DateRange } from '@/domain/work-order';

export function useMyWorkOrders(range: DateRange) {
  return useQuery({
    queryKey: ['work-orders', range.from, range.to],
    queryFn: () => workOrderRepository.listMyWorkOrders(range),
  });
}

/** What the configured backend can actually do — drives honest UI degradation. */
export function useDataCapabilities() {
  return workOrderRepository.capabilities;
}
