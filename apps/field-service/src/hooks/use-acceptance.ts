import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { acceptanceRepository } from '@/data';
import type { AcceptanceRecord } from '@/domain/acceptance';

export function useAcceptance(workOrderId: string, templateId: string | undefined) {
  return useQuery({
    queryKey: ['acceptance', workOrderId, templateId],
    enabled: !!workOrderId && !!templateId,
    queryFn: () => acceptanceRepository.getOrCreate(workOrderId, templateId!),
  });
}

export function useSaveAcceptance(workOrderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (record: AcceptanceRecord) => acceptanceRepository.save(record),
    onSuccess: (_, record) => queryClient.setQueryData(['acceptance', workOrderId, record.templateId], record),
  });
}