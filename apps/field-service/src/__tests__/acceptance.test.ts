import { describe, expect, it } from 'vitest';
import { acceptanceContentHash, acceptanceLocked, acceptanceReadyToSign, acceptanceTemplateId, REPAIR_ACCEPTANCE_TEMPLATE, type AcceptanceRecord } from '@/domain/acceptance';

function draft(): AcceptanceRecord {
  return { id: 'a', workOrderId: 'wo', templateId: 'repair-guidance@1', status: 'draft', items: [] };
}

describe('acceptance lifecycle', () => {
  it('requires every checklist result before signing', () => {
    expect(acceptanceReadyToSign(draft())).toBe(false);
    const record = draft();
    record.items = REPAIR_ACCEPTANCE_TEMPLATE.map((item) => ({ itemId: item.id, result: 'pass', attachmentName: item.requiredAttachment ? 'evidence.jpg' : undefined, attachmentDataUrl: item.requiredAttachment ? 'data:image/jpeg;base64,AA==' : undefined }));
    expect(acceptanceReadyToSign(record)).toBe(true);
  });

  it('requires a note for every failed check', () => {
    const record = draft();
    record.items = REPAIR_ACCEPTANCE_TEMPLATE.map((item) => ({ itemId: item.id, result: 'pass', attachmentName: item.requiredAttachment ? 'evidence.jpg' : undefined, attachmentDataUrl: item.requiredAttachment ? 'data:image/jpeg;base64,AA==' : undefined }));
    record.items[0] = { itemId: REPAIR_ACCEPTANCE_TEMPLATE[0].id, result: 'fail', attachmentName: 'evidence.jpg', attachmentDataUrl: 'data:image/jpeg;base64,AA==' };
    expect(acceptanceReadyToSign(record)).toBe(false);
    record.items[0].note = '电源接地不合格，已通知客户整改';
    expect(acceptanceReadyToSign(record)).toBe(true);
  });

  it('locks the accepted content as soon as it is signed', () => {
    expect(acceptanceLocked(draft())).toBe(false);
    expect(acceptanceLocked({ ...draft(), status: 'signed' })).toBe(true);
    expect(acceptanceLocked({ ...draft(), status: 'delivery-pending' })).toBe(true);
  });

  it('binds a signature to the exact acceptance content', async () => {
    const first = draft();
    const second = { ...draft(), customerFeedback: '请下次复访' };
    expect(await acceptanceContentHash(first)).not.toBe(await acceptanceContentHash(second));
  });

  it('selects a training acceptance template for training work orders', () => {
    expect(acceptanceTemplateId('血球产品培训')).toBe('blood-cell-training@1');
    expect(acceptanceTemplateId('透析机停机')).toBe('repair-guidance@1');
  });
});
