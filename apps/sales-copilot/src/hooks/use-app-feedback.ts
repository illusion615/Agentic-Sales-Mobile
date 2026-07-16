import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppFeedback } from '@/generated/models/app-feedback-model';
import { AppFeedbackService } from '@/generated/services/app-feedback-service';

export function useAppFeedbackList() {
  return useQuery({
    queryKey: ['app-feedback-list', 'current-user'],
    queryFn: () => AppFeedbackService.getAll({
      filter: "Microsoft.Dynamics.CRM.EqualUserId(PropertyName='ownerid')",
      orderBy: ['submittedOn desc'],
      top: 100,
    }),
    staleTime: 30_000,
  });
}

export function useCreateAppFeedback() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<AppFeedback, 'id'>) => AppFeedbackService.create(data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['app-feedback-list'] });
    },
  });
}

export function useUpdateAppFeedback() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changedFields }: {
      id: string;
      changedFields: Partial<Omit<AppFeedback, 'id'>>;
    }) => AppFeedbackService.update(id, changedFields),
    onSuccess: (_data, variables) => {
      client.invalidateQueries({ queryKey: ['app-feedback-list'] });
      client.invalidateQueries({ queryKey: ['app-feedback', variables.id] });
    },
  });
}

export const AppFeedback_DATA_SOURCE_TYPE = 'Dataverse' as const;
