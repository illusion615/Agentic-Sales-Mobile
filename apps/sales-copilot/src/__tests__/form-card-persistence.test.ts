import { describe, expect, it } from 'vitest';
import { applyFormCardPersistenceUpdate } from '@/lib/form-card-persistence';

describe('form card persistence', () => {
  it('atomically persists status, record id, and final edited data for a single card', () => {
    const original = {
      id: 'message-1',
      formCard: {
        data: { title: 'AI draft', temporalMode: 'completed' },
        status: 'pending' as const,
      },
    };

    const updated = applyFormCardPersistenceUpdate(original, {
      messageId: 'message-1',
      status: 'confirmed',
      createdRecordId: 'activity-1',
      finalData: { title: 'User title', temporalMode: 'planned' },
    });

    expect(updated.formCard).toEqual({
      data: { title: 'User title', temporalMode: 'planned' },
      status: 'confirmed',
      createdRecordId: 'activity-1',
    });
    expect(original.formCard.data.temporalMode).toBe('completed');
  });

  it('updates only the selected batch item and persists its final data', () => {
    const original = {
      id: 'batch-message',
      batchFormCards: {
        items: [
          { data: { title: 'First' }, status: 'pending' as const },
          { data: { title: 'Second', temporalMode: 'planned' }, status: 'pending' as const },
        ],
      },
    };

    const updated = applyFormCardPersistenceUpdate(original, {
      messageId: 'batch-message',
      batchIndex: 1,
      status: 'confirmed',
      createdRecordId: 'activity-2',
      finalData: { title: 'Second edited', temporalMode: 'completed' },
    });

    expect(updated.batchFormCards.items[0]).toBe(original.batchFormCards.items[0]);
    expect(updated.batchFormCards.items[1]).toEqual({
      data: { title: 'Second edited', temporalMode: 'completed' },
      status: 'confirmed',
      createdRecordId: 'activity-2',
    });
  });

  it('leaves unrelated messages unchanged', () => {
    const message = { id: 'other', formCard: { data: {}, status: 'pending' as const } };
    expect(applyFormCardPersistenceUpdate(message, {
      messageId: 'target',
      status: 'confirmed',
      finalData: { temporalMode: 'completed' },
    })).toBe(message);
  });
});