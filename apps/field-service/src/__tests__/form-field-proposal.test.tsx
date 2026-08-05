import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { FormFieldRow } from '@/components/form-field';

function renderProposal() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const onLock = vi.fn();

  act(() => {
    root.render(
      <FormFieldRow
        field={{ name: 'fault', label: '故障原因', type: 'text', required: true, readonly: false }}
        entry={{ name: 'fault', value: '传感器老化', source: 'ai', confidence: 1, evidenceIds: ['note-1'] }}
        onChange={vi.fn()}
        onLock={onLock}
        context={{ workOrderId: 'wo-1' }}
      />,
    );
  });

  return { container, root, onLock };
}

describe('FormFieldRow AI proposal', () => {
  it('shows a clear adoption action on the right side of the field label', () => {
    const { container, root, onLock } = renderProposal();
    const action = container.querySelector('button') as HTMLButtonElement;

    expect(action.textContent).toContain('AI 填写 · 点击锁定');
    expect(action.textContent).not.toContain('100%');
    expect(action.className).toContain('ml-auto');
    expect(action.className).toContain('text-[10px]');
    expect(action.title).toContain('AI 不再修改');

    act(() => action.click());
    expect(onLock).toHaveBeenCalledWith('fault');

    act(() => root.unmount());
    container.remove();
  });

  it('keeps AI attribution visible after the field is locked', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <FormFieldRow
          field={{ name: 'fault', label: '故障原因', type: 'text', required: true, readonly: false }}
          entry={{ name: 'fault', value: '传感器老化', source: 'ai-locked', evidenceIds: ['note-1'] }}
          onChange={vi.fn()}
          onLock={vi.fn()}
          context={{ workOrderId: 'wo-1' }}
        />,
      );
    });

    expect(container.textContent).toContain('AI 填写 · 已锁定');
    expect(container.querySelector('button')).toBeNull();
    act(() => root.unmount());
    container.remove();
  });
});
