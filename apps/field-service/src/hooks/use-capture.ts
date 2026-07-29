import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  captureRepository,
  customerRepository,
  fieldExtractor,
  formSchemaRepository,
  workOrderRepository,
} from '@/data';
import type { Evidence } from '@/domain/capture';
import type { FieldValue, FormSchema } from '@/domain/form-schema';
import { mergeCandidates, type CustomerUpdateCandidate, type ExtractionResult } from '@/domain/extraction';
import { applyPrefills } from '@/domain/form-expression';
import { buildPrefillContext } from '@/domain/prefill-context';

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

/** The form definition this job must answer. */
export function useFormSchema(workOrderId: string) {
  return useQuery({
    queryKey: ['form-schema', workOrderId],
    enabled: !!workOrderId,
    queryFn: async () => {
      const workOrder = await workOrderRepository.getWorkOrder(workOrderId);
      return formSchemaRepository.getSchemaForWorkOrder(workOrder);
    },
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
 * Seed a new form from its prefill expressions, once per session.
 *
 * Returns the expressions the evaluator does not implement. Surfacing them is
 * deliberate: an unsupported expression means a form author asked for
 * something this app cannot yet provide, which should be a visible gap rather
 * than a field that is quietly always empty.
 */
export function usePrefillOnce(
  workOrderId: string,
  sessionId: string | undefined,
  schema: FormSchema | undefined,
) {
  const queryClient = useQueryClient();
  const appliedFor = useRef<string | null>(null);
  const [unsupported, setUnsupported] = useState<Array<{ field: string; expression: string }>>([]);

  useEffect(() => {
    if (!sessionId || !schema) return;
    const key = `${sessionId}:${schema.id}`;
    if (appliedFor.current === key) return;
    appliedFor.current = key;

    void (async () => {
      const existing = await captureRepository.getAnswers(sessionId);
      if (existing.length > 0) return; // the form has already been started

      const workOrder = await workOrderRepository.getWorkOrder(workOrderId);
      const customer = await customerRepository.getProfile(workOrder.customerId).catch(() => undefined);
      const outcome = applyPrefills(schema, buildPrefillContext(workOrder, customer));

      setUnsupported(outcome.unsupported);
      if (outcome.values.length > 0) {
        await captureRepository.saveAnswers(sessionId, outcome.values);
        await queryClient.invalidateQueries({ queryKey: ['answers', sessionId] });
      }
    })();
  }, [workOrderId, sessionId, schema, queryClient]);

  return unsupported;
}

/**
 * Re-read the captured fragments and fill in whatever is still blank.
 *
 * Runs on demand rather than on every capture: the technician stays in control
 * of when proposals appear, and nothing already entered is ever replaced.
 */
export function useRunExtraction(workOrderId: string, sessionId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation<ExtractionResult>({
    mutationFn: async () => {
      const workOrder = await workOrderRepository.getWorkOrder(workOrderId);
      const [schema, evidence, answers] = await Promise.all([
        formSchemaRepository.getSchemaForWorkOrder(workOrder),
        captureRepository.listEvidence(sessionId!),
        captureRepository.getAnswers(sessionId!),
      ]);

      const result = await fieldExtractor.extract({ workOrder, schema, evidence });
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
 * Commit the visit as one action: the form, the customer-profile changes the
 * technician accepted, and closing the job. Ordered so the session is only
 * marked submitted once the records it feeds have been written.
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
