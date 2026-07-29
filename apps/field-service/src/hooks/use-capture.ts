import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { captureRepository, customerRepository, fieldExtractor, workOrderRepository } from '@/data';
import type { Evidence } from '@/domain/capture';
import type { FieldValue } from '@/domain/questionnaire';
import { questionnaireFor } from '@/domain/questionnaire';
import { mergeCandidates, type CustomerUpdateCandidate, type ExtractionResult } from '@/domain/extraction';

/**
 * Resume the visit's open session, or begin one.
 *
 * `enabled` exists so a closed job never spawns a fresh session: submitting
 * marks the session done, and re-running this unguarded would immediately
 * create an empty replacement.
 */
export function useWorkSession(workOrderId: string, enabled = true) {
  return useQuery({
    queryKey: ['session', workOrderId],
    queryFn: () => captureRepository.openSession(workOrderId),
    enabled: !!workOrderId && enabled,
  });
}

export function useEvidence(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['evidence', sessionId],
    queryFn: () => captureRepository.listEvidence(sessionId!),
    enabled: !!sessionId,
  });
}

export function useAnswers(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['answers', sessionId],
    queryFn: () => captureRepository.getAnswers(sessionId!),
    enabled: !!sessionId,
  });
}

export function useAppendEvidence(sessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<Evidence, 'id' | 'sessionId' | 'capturedAt'>) =>
      captureRepository.appendEvidence({
        ...input,
        sessionId: sessionId!,
        capturedAt: new Date().toISOString(),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['evidence', sessionId] }),
  });
}

export function useSaveAnswers(sessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: FieldValue[]) => captureRepository.saveAnswers(sessionId!, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['answers', sessionId] }),
  });
}

/**
 * Re-read the captured fragments and fill in whatever is still blank.
 *
 * Runs on demand rather than on every capture: the technician stays in control
 * of when proposals appear, and nothing they have typed is ever replaced.
 */
export function useRunExtraction(workOrderId: string, sessionId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation<ExtractionResult>({
    mutationFn: async () => {
      const [workOrder, evidence, answers] = await Promise.all([
        workOrderRepository.getWorkOrder(workOrderId),
        captureRepository.listEvidence(sessionId!),
        captureRepository.getAnswers(sessionId!),
      ]);

      const questionnaire = questionnaireFor(workOrder.incidentType);
      const result = await fieldExtractor.extract({ workOrder, questionnaire, evidence });
      await captureRepository.saveAnswers(sessionId!, mergeCandidates(answers, result.fields));
      await captureRepository.saveCustomerUpdates(sessionId!, result.customerUpdates);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['answers', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['customer-updates', sessionId] });
    },
  });
}

export function useCustomerUpdates(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['customer-updates', sessionId],
    queryFn: () => captureRepository.getCustomerUpdates(sessionId!),
    enabled: !!sessionId,
  });
}

/**
 * Commit the visit as one action: the questionnaire, the customer-profile
 * changes the technician accepted, and closing the job. Ordered so the session
 * is only marked submitted once the records it feeds have been written.
 */
export function useSubmitVisit(workOrderId: string, sessionId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { answers: FieldValue[]; acceptedUpdates: CustomerUpdateCandidate[] }) => {
      const workOrder = await workOrderRepository.getWorkOrder(workOrderId);
      const submittedAt = new Date().toISOString();

      await captureRepository.saveAnswers(sessionId!, input.answers);
      await customerRepository.applyProfileUpdates(workOrder.customerId, input.acceptedUpdates);
      await workOrderRepository.completeWorkOrder(workOrderId, submittedAt);
      await captureRepository.submitSession(sessionId!, submittedAt);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-order', workOrderId] });
      queryClient.invalidateQueries({ queryKey: ['session', workOrderId] });
    },
  });
}
