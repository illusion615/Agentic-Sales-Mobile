import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { WorkOrderMap } from '@/components/work-order-map';
import type { WorkOrderSummary } from '@/domain/work-order';

vi.mock('@/generated/services/AMapStaticMapService', () => ({
  AMapStaticMapService: { GetStaticMap: vi.fn(), GetDrivingRoute: vi.fn() },
}));

const VIEWPORT = { width: 400, height: 800 };

const captureSpy = vi.fn();

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );

  // jsdom ships neither pointer capture nor layout, both of which the map needs.
  Element.prototype.setPointerCapture = captureSpy as never;
  Element.prototype.releasePointerCapture = vi.fn() as never;
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: VIEWPORT.width, bottom: VIEWPORT.height, ...VIEWPORT, toJSON: () => ({}) } as DOMRect;
  };
});

const workOrder: WorkOrderSummary = {
  id: 'wo-1',
  number: 'WO-1001',
  status: 'scheduled',
  priority: 'normal',
  customerId: 'acc',
  customerName: '深圳市南山区人民医院',
  address: { line1: '桃园路 89 号', location: { latitude: 22.5336, longitude: 113.918 } },
};

function pointer(type: string, x: number, y: number): Event {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event;
}

function renderMap(): { container: HTMLElement; root: Root; onSelect: ReturnType<typeof vi.fn> } {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const onSelect = vi.fn();

  act(() => {
    root.render(
      <WorkOrderMap workOrders={[workOrder]} selectedId={null} onSelect={onSelect} />,
    );
  });

  return { container, root, onSelect };
}

describe('WorkOrderMap gestures', () => {
  it('renders a pin the technician can aim at', () => {
    const { container, root } = renderMap();
    expect(container.querySelector('button[aria-label*="WO-1001"]')).not.toBeNull();
    act(() => root.unmount());
  });

  /**
   * Capturing on pointerdown retargets pointerup to the map, so the browser
   * fires the click on the map instead of the pin — every button inside the map
   * silently stops responding while still rendering correctly.
   */
  it('does not capture the pointer on a tap, so the click reaches the pin', () => {
    captureSpy.mockClear();
    const { container, root } = renderMap();
    const pin = container.querySelector('button[aria-label*="WO-1001"]')!;

    act(() => {
      pin.dispatchEvent(pointer('pointerdown', 100, 100));
      pin.dispatchEvent(pointer('pointerup', 100, 100));
    });

    expect(captureSpy).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('ignores finger shake within the tap slop', () => {
    captureSpy.mockClear();
    const { container, root } = renderMap();
    const surface = container.firstElementChild!;

    act(() => {
      surface.dispatchEvent(pointer('pointerdown', 100, 100));
      surface.dispatchEvent(pointer('pointermove', 102, 97));
      surface.dispatchEvent(pointer('pointerup', 102, 97));
    });

    expect(captureSpy).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('captures once the gesture becomes a real drag', () => {
    captureSpy.mockClear();
    const { container, root } = renderMap();
    const surface = container.firstElementChild!;

    act(() => {
      surface.dispatchEvent(pointer('pointerdown', 100, 100));
      surface.dispatchEvent(pointer('pointermove', 160, 140));
    });

    expect(captureSpy).toHaveBeenCalledWith(1);
    act(() => root.unmount());
  });
});
