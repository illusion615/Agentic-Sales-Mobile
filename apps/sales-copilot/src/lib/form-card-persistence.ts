export type PersistedFormCardStatus = 'pending' | 'confirmed' | 'modified' | 'cancelled';

interface PersistedFormCardLike {
  data: Record<string, unknown>;
  status?: PersistedFormCardStatus;
  createdRecordId?: string;
}

interface PersistedFormCardMessageLike {
  id: string;
  formCard?: PersistedFormCardLike;
  batchFormCards?: {
    items: PersistedFormCardLike[];
  };
}

export interface FormCardPersistenceUpdate {
  messageId: string;
  status: PersistedFormCardStatus;
  batchIndex?: number;
  createdRecordId?: string;
  finalData?: Record<string, unknown>;
}

/** Apply one atomic card-state update to a persisted chat message. */
export function applyFormCardPersistenceUpdate<T extends PersistedFormCardMessageLike>(
  message: T,
  update: FormCardPersistenceUpdate,
): T {
  if (message.id !== update.messageId) return message;

  if (typeof update.batchIndex === 'number' && message.batchFormCards) {
    const items = message.batchFormCards.items.map((item, index) => {
      if (index !== update.batchIndex) return item;
      return {
        ...item,
        status: update.status,
        ...(update.createdRecordId !== undefined ? { createdRecordId: update.createdRecordId } : {}),
        ...(update.finalData !== undefined ? { data: update.finalData } : {}),
      };
    });
    return {
      ...message,
      batchFormCards: { ...message.batchFormCards, items },
    } as T;
  }

  if (message.formCard) {
    return {
      ...message,
      formCard: {
        ...message.formCard,
        status: update.status,
        ...(update.createdRecordId !== undefined ? { createdRecordId: update.createdRecordId } : {}),
        ...(update.finalData !== undefined ? { data: update.finalData } : {}),
      },
    } as T;
  }

  return message;
}