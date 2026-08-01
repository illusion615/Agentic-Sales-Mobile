import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useCurrentLocation } from '@/hooks/use-current-location';

const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;

let getCurrentPosition = vi.fn();

function stubGeolocation(implementation: typeof getCurrentPosition | null) {
  if (implementation === null) {
    vi.stubGlobal('navigator', {});
    return;
  }
  getCurrentPosition = implementation;
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
}

function renderHook(): { result: { current: ReturnType<typeof useCurrentLocation> }; root: Root } {
  const result = { current: undefined as unknown as ReturnType<typeof useCurrentLocation> };
  function Probe() {
    result.current = useCurrentLocation();
    return null;
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<Probe />));
  return { result, root };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('useCurrentLocation', () => {
  it('reports the device position once a fix arrives', () => {
    stubGeolocation(
      vi.fn((onSuccess) =>
        onSuccess({ coords: { latitude: 22.5336, longitude: 113.918, accuracy: 25 } }),
      ),
    );

    const { result, root } = renderHook();

    expect(result.current.status).toBe('ready');
    expect(result.current.position).toEqual({ latitude: 22.5336, longitude: 113.918 });
    expect(result.current.accuracyMetres).toBe(25);
    act(() => root.unmount());
  });

  /** A guessed origin would silently corrupt the first leg of every route. */
  it('never invents a position when permission is refused', () => {
    stubGeolocation(
      vi.fn((_onSuccess, onError) => onError({ code: PERMISSION_DENIED, PERMISSION_DENIED })),
    );

    const { result, root } = renderHook();

    expect(result.current.status).toBe('denied');
    expect(result.current.position).toBeNull();
    act(() => root.unmount());
  });

  it('separates an unavailable fix from a refused one', () => {
    stubGeolocation(
      vi.fn((_onSuccess, onError) => onError({ code: POSITION_UNAVAILABLE, PERMISSION_DENIED })),
    );

    const { result, root } = renderHook();

    expect(result.current.status).toBe('unavailable');
    expect(result.current.position).toBeNull();
    act(() => root.unmount());
  });

  it('degrades where the platform offers no geolocation at all', () => {
    stubGeolocation(null);

    const { result, root } = renderHook();

    expect(result.current.status).toBe('unavailable');
    expect(result.current.position).toBeNull();
    act(() => root.unmount());
  });

  it('asks the device again on retry', () => {
    const spy = vi.fn((_onSuccess, onError) => onError({ code: POSITION_UNAVAILABLE, PERMISSION_DENIED }));
    stubGeolocation(spy);

    const { result, root } = renderHook();
    expect(spy).toHaveBeenCalledTimes(1);

    act(() => result.current.retry());
    expect(spy).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
  });

  it('accepts a fix that carries no accuracy figure', () => {
    stubGeolocation(
      vi.fn((onSuccess) => onSuccess({ coords: { latitude: 1, longitude: 2, accuracy: NaN } })),
    );

    const { result, root } = renderHook();

    expect(result.current.accuracyMetres).toBeNull();
    expect(result.current.status).toBe('ready');
    act(() => root.unmount());
  });
});
