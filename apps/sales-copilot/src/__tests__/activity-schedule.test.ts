import { describe, expect, it } from 'vitest';
import {
  combineDateTime,
  timeFromISO,
  resolveScheduleValue,
  endFromStart,
  isValidTime,
  DEFAULT_DURATION_MINUTES,
  DEFAULT_TIME,
} from '@/lib/activity-schedule';

describe('activity-schedule', () => {
  it('validates HH:mm times', () => {
    expect(isValidTime('09:00')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('9:00')).toBe(false);
    expect(isValidTime('')).toBe(false);
  });

  it('combines a calendar day + wall-clock time into a local ISO instant', () => {
    const iso = combineDateTime(new Date(2026, 6, 17), '14:30');
    const d = new Date(iso);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(17);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });

  it('round-trips the wall-clock time through timeFromISO', () => {
    const iso = combineDateTime(new Date(2026, 0, 5), '08:05');
    expect(timeFromISO(iso)).toBe('08:05');
  });

  it('falls back to the default time for invalid input', () => {
    const iso = combineDateTime(new Date(2026, 0, 5), 'not-a-time');
    expect(timeFromISO(iso)).toBe(DEFAULT_TIME);
    expect(timeFromISO(undefined)).toBe(DEFAULT_TIME);
  });

  it('resolves legacy date-only / duration-less schedules to defaults', () => {
    const v = resolveScheduleValue(undefined, undefined);
    expect(v.time).toBe(DEFAULT_TIME);
    expect(v.durationMinutes).toBe(DEFAULT_DURATION_MINUTES);
    expect(v.date).toBeInstanceOf(Date);

    const withData = resolveScheduleValue(combineDateTime(new Date(2026, 5, 1), '10:15'), 90);
    expect(withData.time).toBe('10:15');
    expect(withData.durationMinutes).toBe(90);
  });

  it('computes end = start + duration', () => {
    const start = combineDateTime(new Date(2026, 6, 17), '14:00');
    const end = endFromStart(start, 90);
    expect(new Date(end).getTime() - new Date(start).getTime()).toBe(90 * 60000);
  });
});
