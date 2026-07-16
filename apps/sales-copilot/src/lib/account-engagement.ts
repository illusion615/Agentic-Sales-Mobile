import type { Activity } from '@/generated/models/activity-model';
import type { Contact } from '@/generated/models/contact-model';
import type { Opportunity } from '@/generated/models/opportunity-model';
import { isCanceled } from '@/lib/activity-status';
import { localeBcp47, t, type Locale } from '@/lib/i18n';
import { resolveActivityAccount } from '@/lib/activity-relations';

const DAY_MS = 24 * 60 * 60 * 1000;

export const CONTACT_RECENCY_DAYS = {
  recent: 7,
  active: 14,
  cooling: 30,
} as const;

export type ContactRecencyStatus = 'recent' | 'active' | 'cooling' | 'at-risk' | 'never';

/**
 * Convert an activity date into a calendar-day ordinal.
 *
 * Activity dates are stored by the app as date-only UTC timestamps. Reading the
 * YYYY-MM-DD prefix avoids turning midnight UTC into the previous local date on
 * devices west of UTC. Date objects (used by tests/callers) use local calendar
 * fields instead.
 */
function calendarDayOrdinal(value: string | Date): number | null {
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const ordinal = Date.UTC(year, month - 1, day);
      const roundTrip = new Date(ordinal);
      if (
        roundTrip.getUTCFullYear() === year &&
        roundTrip.getUTCMonth() === month - 1 &&
        roundTrip.getUTCDate() === day
      ) {
        return ordinal;
      }
      return null;
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Build the canonical Account → latest contact date map.
 *
 * A contact event is any non-cancelled activity scheduled on or before today.
 * Open and completed activities both count: this app uses Activity status for
 * task lifecycle, while the activity row/date records that the interaction was
 * logged. Future plans and cancelled activities never count as prior contact.
 */
export function latestContactByAccount(
  activities: readonly Activity[],
  opportunities: readonly Opportunity[] = [],
  contacts: readonly Contact[] = [],
  now: Date = new Date(),
): Map<string, string> {
  const todayOrdinal = calendarDayOrdinal(now);
  const latest = new Map<string, { value: string; ordinal: number }>();

  if (todayOrdinal === null) return new Map();

  for (const activity of activities) {
    if (isCanceled(activity) || !activity.scheduleddate) continue;

    const ordinal = calendarDayOrdinal(activity.scheduleddate);
    if (ordinal === null || ordinal > todayOrdinal) continue;

    const accountId = resolveActivityAccount(activity, opportunities, contacts)?.id;
    if (!accountId) continue;

    const previous = latest.get(accountId);
    if (!previous || ordinal > previous.ordinal) {
      latest.set(accountId, { value: activity.scheduleddate, ordinal });
    }
  }

  return new Map([...latest].map(([accountId, contact]) => [accountId, contact.value]));
}

/** Calendar days since contact. Today is 0; no valid contact is null. */
export function daysSinceContact(
  contactDate: string | Date | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!contactDate) return null;
  const contactOrdinal = calendarDayOrdinal(contactDate);
  const todayOrdinal = calendarDayOrdinal(now);
  if (contactOrdinal === null || todayOrdinal === null || contactOrdinal > todayOrdinal) return null;
  return Math.round((todayOrdinal - contactOrdinal) / DAY_MS);
}

/** Canonical relationship-health band used by account list/detail surfaces. */
export function contactRecencyStatus(daysSince: number | null): ContactRecencyStatus {
  if (daysSince === null) return 'never';
  if (daysSince <= CONTACT_RECENCY_DAYS.recent) return 'recent';
  if (daysSince <= CONTACT_RECENCY_DAYS.active) return 'active';
  if (daysSince <= CONTACT_RECENCY_DAYS.cooling) return 'cooling';
  return 'at-risk';
}

/**
 * Human relative time for customer-facing UI.
 *
 * `numeric: auto` gives each locale its natural words for today/yesterday (and
 * language-specific equivalents such as French "avant-hier") while retaining
 * exact day counts for sales follow-up thresholds.
 */
export function formatLastContact(daysSince: number | null, locale: Locale): string {
  if (daysSince === null) return sentenceCase(t('neverContacted', locale), locale);

  const value = new Intl.RelativeTimeFormat(localeBcp47(locale), {
    numeric: 'auto',
    style: 'long',
  }).format(-daysSince, 'day');
  return sentenceCase(value, locale);
}

function sentenceCase(value: string, locale: Locale): string {
  if (!value) return value;
  return value[0].toLocaleUpperCase(localeBcp47(locale)) + value.slice(1);
}
