import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { briefingProvider, customerRepository, workOrderRepository } from '@/data';
import { activeWorkOrder, todayRange, type DateRange, type TimeSlot } from '@/domain/work-order';

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

/**
 * Move an appointment. Only offer this where `capabilities.selfScheduling` is
 * true; a dispatch-governed backend rejects the call by design.
 */
export function useRescheduleWorkOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slot: TimeSlot) => workOrderRepository.rescheduleWorkOrder(id, slot),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-order', id] });
      queryClient.invalidateQueries({ queryKey: ['work-order-briefing', id] });
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

/**
 * The job already under way, wherever the technician happens to be in the app.
 * Screens that offer "start" need it even when they only loaded one work order.
 */
export function useActiveWorkOrder() {
  const today = todayRange();
  const { data = [] } = useQuery({
    queryKey: ['work-orders', today.from, today.to],
    queryFn: () => workOrderRepository.listMyWorkOrders(today),
  });
  return activeWorkOrder(data);
}

export function useWorkOrder(id: string) {
  return useQuery({
    queryKey: ['work-order', id],
    queryFn: () => workOrderRepository.getWorkOrder(id),
    enabled: !!id,
  });
}

/**
 * Everything the technician reads before arriving: the job, who the customer
 * is, and what happened here before.
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
      return { workOrder, customer, history };
    },
  });
}

/**
 * The written briefing, queried on its own so that losing the model does not
 * also hide the job, the address and the contact — which are local and were
 * never at risk.
 */
export function useBriefing(id: string) {
  return useQuery({
    queryKey: ['briefing', id],
    enabled: !!id,
    // A briefing is written once per job; re-reading the page should not spend
    // another call, and a failure should not be hammered.
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const workOrder = await workOrderRepository.getWorkOrder(id);
      const [customer, history] = await Promise.all([
        customerRepository.getProfile(workOrder.customerId),
        customerRepository.listServiceHistory(workOrder.customerId, 5),
      ]);
      return briefingProvider.generate({ workOrder, customer, history });
    },
  });
}

/** What the configured backend can actually do — drives honest UI degradation. */
export function useDataCapabilities() {
  return workOrderRepository.capabilities;
}

/**
 * The customer behind a job, with everything a visit is judged against: who to
 * find on site, what to be careful of, and what was done here before.
 */
export function useCustomer(customerId: string) {
  return useQuery({
    queryKey: ['customer', customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const [profile, history] = await Promise.all([
        customerRepository.getProfile(customerId),
        customerRepository.listServiceHistory(customerId),
      ]);
      return { profile, history };
    },
  });
}
