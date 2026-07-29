import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { briefingProvider, customerRepository, workOrderRepository } from '@/data';
import type { DateRange } from '@/domain/work-order';

export function useStartWorkOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => workOrderRepository.startWorkOrder(id, new Date().toISOString()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-order', id] });
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    },
  });
}

export function useMyWorkOrders(range: DateRange) {
  return useQuery({
    queryKey: ['work-orders', range.from, range.to],
    queryFn: () => workOrderRepository.listMyWorkOrders(range),
  });
}

export function useWorkOrder(id: string) {
  return useQuery({
    queryKey: ['work-order', id],
    queryFn: () => workOrderRepository.getWorkOrder(id),
    enabled: !!id,
  });
}

/**
 * Everything the technician reads before arriving, resolved together: the job,
 * who the customer is, what happened here before, and the briefing composed
 * from all three.
 */
export function useWorkOrderBriefing(id: string) {
  return useQuery({
    queryKey: ['work-order-briefing', id],
    enabled: !!id,
    queryFn: async () => {
      const workOrder = await workOrderRepository.getWorkOrder(id);
      const [customer, history] = await Promise.all([
        customerRepository.getProfile(workOrder.customerId),
        customerRepository.listServiceHistory(workOrder.customerId, 5),
      ]);
      const briefing = await briefingProvider.generate({ workOrder, customer, history });
      return { workOrder, customer, history, briefing };
    },
  });
}

/** What the configured backend can actually do — drives honest UI degradation. */
export function useDataCapabilities() {
  return workOrderRepository.capabilities;
}
