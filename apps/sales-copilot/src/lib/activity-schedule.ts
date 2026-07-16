/**
 * Activity scheduling — single source for date + time-of-day + duration logic.
 *
 * Activities historically stored only a calendar date (`scheduledstart` at local
 * midnight) with a hard-coded 1-hour end. This module adds an explicit
 * wall-clock time and a chosen duration, shared by every reschedule / create /
 * edit surface so the behaviour stays consistent and testable.
 */
import { t, type Locale, type TranslationKey } from '@/lib/i18n';

export const DEFAULT_DURATION_MINUTES = 60;
export const DEFAULT_TIME = '09:00';

export interface DurationPreset {
  minutes: number;
  labelKey: TranslationKey;
}

/** Duration options offered by the schedule picker (minutes). */
export const DURATION_PRESETS: readonly DurationPreset[] = [
  { minutes: 15, labelKey: 'duration15Min' },
  { minutes: 30, labelKey: 'duration30Min' },
  { minutes: 60, labelKey: 'duration1Hour' },
  { minutes: 90, labelKey: 'duration90Min' },
  { minutes: 120, labelKey: 'duration2Hour' },
  { minutes: 240, labelKey: 'durationHalfDay' },
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** True when `time` is a valid 24-hour 'HH:mm' string. */
export function isValidTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

/**
 * Combine a calendar day with a wall-clock 'HH:mm' into an ISO instant using the
 * local timezone — matching the app's existing
 * `new Date(dateStr).toISOString()` convention for scheduled activities.
 */
export function combineDateTime(day: Date | string, time: string): string {
  const base = typeof day === 'string' ? new Date(day) : new Date(day.getTime());
  const safe = isValidTime(time) ? time : DEFAULT_TIME;
  const [hh, mm] = safe.split(':').map(Number);
  const combined = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hh, mm, 0, 0);
  return combined.toISOString();
}

/** Extract the local wall-clock 'HH:mm' from an ISO instant. */
export function timeFromISO(iso: string | undefined): string {
  if (!iso) return DEFAULT_TIME;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DEFAULT_TIME;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export interface ScheduleValue {
  /** Calendar day (local midnight) for the date control. */
  date: Date;
  /** Wall-clock 'HH:mm'. */
  time: string;
  durationMinutes: number;
}

/**
 * Resolve a stored schedule (possibly legacy date-only / duration-less) into
 * fully-populated picker defaults.
 */
export function resolveScheduleValue(scheduleddate?: string, durationMinutes?: number): ScheduleValue {
  const hasDate = !!scheduleddate && !Number.isNaN(new Date(scheduleddate).getTime());
  const base = hasDate ? new Date(scheduleddate as string) : new Date();
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0);
  const time = hasDate ? timeFromISO(scheduleddate) : DEFAULT_TIME;
  const dur = durationMinutes && durationMinutes > 0 ? durationMinutes : DEFAULT_DURATION_MINUTES;
  return { date, time, durationMinutes: dur };
}

/** ISO end instant = start + duration (minimum 1 minute). */
export function endFromStart(startISO: string, durationMinutes: number): string {
  const start = new Date(startISO);
  return new Date(start.getTime() + Math.max(1, durationMinutes) * 60000).toISOString();
}

/** Compact localized duration label, e.g. "1 hour" / "90 min" / "Half day". */
export function formatDuration(minutes: number, locale: Locale): string {
  const preset = DURATION_PRESETS.find((p) => p.minutes === minutes);
  if (preset) return t(preset.labelKey, locale);
  if (minutes % 60 === 0) return t('durationHoursN', locale, { count: String(minutes / 60) });
  return t('durationMinutesN', locale, { count: String(minutes) });
}
