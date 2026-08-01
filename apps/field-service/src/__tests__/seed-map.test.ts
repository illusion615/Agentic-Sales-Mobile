import { describe, expect, it } from 'vitest';
import { seedWorkOrders } from '@/data/local/seed';
import { hasCoordinates } from '@/domain/work-order';

describe('map demo work orders', () => {
  const workOrders = seedWorkOrders();
  const geocoded = workOrders.filter(hasCoordinates);

  it('keeps every fixture id unique so a daily reset is deterministic', () => {
    const ids = workOrders.map((workOrder) => workOrder.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('geocodes every dashboard job, including WO-1004', () => {
    expect(geocoded.length).toBe(workOrders.length);
    expect(workOrders.find((row) => row.id === 'wo-1004')).toSatisfy(hasCoordinates);
  });

  it('spans Shenzhen rather than clustering every pin in one neighbourhood', () => {
    const latitudes = geocoded.map((workOrder) => workOrder.address.location.latitude);
    const longitudes = geocoded.map((workOrder) => workOrder.address.location.longitude);

    expect(Math.max(...latitudes) - Math.min(...latitudes)).toBeGreaterThan(0.18);
    expect(Math.max(...longitudes) - Math.min(...longitudes)).toBeGreaterThan(0.3);
  });

  it('keeps every job on the current local calendar day', () => {
    const today = new Date();
    const dateKey = (iso: string) => {
      const date = new Date(iso);
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    };
    const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

    for (const workOrder of workOrders) {
      const anchor = workOrder.scheduledStart ?? workOrder.slaDueBy;
      expect(anchor && dateKey(anchor)).toBe(todayKey);
    }
  });
});
