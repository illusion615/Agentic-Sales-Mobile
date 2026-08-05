import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { CaptureContextPanel } from '@/components/capture-context-panel';
import type { WorkOrderDetail } from '@/domain/work-order';

const workOrder: WorkOrderDetail = {
  id: 'wo-1',
  number: 'WO-1001',
  status: 'in-progress',
  priority: 'high',
  incidentType: '透析机停机',
  customerId: 'acc-1',
  customerName: '南山区人民医院',
  address: { line1: '桃园路 89 号' },
  assetName: '透析机 DX-200 #3',
  summary: '设备报警后停机。',
  instructions: '进入病区需登记。',
};

function renderPanel(open: boolean) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const onToggle = vi.fn();

  act(() => {
    root.render(
      <CaptureContextPanel
        open={open}
        onToggle={onToggle}
        workOrder={workOrder}
        customer={{
          id: 'acc-1',
          name: '南山区人民医院',
          industry: '医疗',
          siteAccessNotes: '由设备科陪同进入。',
          cautions: ['避免影响临床排班'],
          contacts: [{ name: '王主任', role: '设备科主任', phone: '13800000001' }],
        }}
        history={[{
          id: 'history-1',
          workOrderNumber: 'WO-0990',
          completedOn: '2026-07-01T10:00:00Z',
          incidentType: '传感器故障',
          resolution: '更换电导率传感器。',
        }]}
        briefing={{
          background: '该设备近期重复报警。',
          watchOuts: ['核对上次更换件'],
          preparation: ['携带备用传感器'],
        }}
        briefingPending={false}
        briefingError={false}
        onRetryBriefing={vi.fn()}
      />,
    );
  });

  return { container, root, onToggle };
}

describe('CaptureContextPanel', () => {
  it('starts collapsed and exposes a clear summary', () => {
    const { container, root, onToggle } = renderPanel(false);
    const toggle = container.querySelector('button[aria-expanded="false"]') as HTMLButtonElement;

    expect(toggle.textContent).toContain('工单与客户背景');
    expect(toggle.textContent).toContain('WO-1001');
    expect(toggle.nextElementSibling?.className).toContain('grid-rows-[0fr]');

    act(() => toggle.click());
    expect(onToggle).toHaveBeenCalledOnce();
    act(() => root.unmount());
    container.remove();
  });

  it('shows work-order, customer, AI and service-history context when expanded', () => {
    const { container, root } = renderPanel(true);

    expect(container.querySelector('button[aria-expanded="true"]')).not.toBeNull();
    expect(container.textContent).toContain('设备报警后停机');
    expect(container.textContent).toContain('由设备科陪同进入');
    expect(container.textContent).toContain('核对上次更换件');
    expect(container.textContent).toContain('更换电导率传感器');

    act(() => root.unmount());
    container.remove();
  });
});
