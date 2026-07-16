import type { FrameTemporal } from '@/lib/frame';

export type ActivityDraftMode = 'planned' | 'completed';
export type ActivityTemporalMode = ActivityDraftMode | 'unspecified';

function calendarDayOrdinal(value: string | Date): number | null {
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const ordinal = Date.UTC(year, month - 1, day);
      const roundTrip = new Date(ordinal);
      return roundTrip.getUTCFullYear() === year
        && roundTrip.getUTCMonth() === month - 1
        && roundTrip.getUTCDate() === day
        ? ordinal
        : null;
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Deterministic Frame semantic → draft temporal signal mapping. */
export function temporalModeFromFrame(temporal: FrameTemporal | undefined): ActivityTemporalMode {
  if (temporal === 'past') return 'completed';
  if (temporal === 'future') return 'planned';
  return 'unspecified';
}

/**
 * Resolve every activity draft to one editable UI mode.
 *
 * Explicit Frame/user semantics win. When semantics are absent, a date before
 * today is completed; today, future, missing, and invalid dates conservatively
 * remain planned so an unperformed task is never marked complete by accident.
 */
export function resolveActivityDraftMode({
  temporalMode,
  scheduledDate,
  today = new Date(),
}: {
  temporalMode?: unknown;
  scheduledDate?: unknown;
  today?: Date;
}): ActivityDraftMode {
  if (temporalMode === 'completed') return 'completed';
  if (temporalMode === 'planned') return 'planned';

  if (typeof scheduledDate === 'string' || scheduledDate instanceof Date) {
    const scheduledOrdinal = calendarDayOrdinal(scheduledDate);
    const todayOrdinal = calendarDayOrdinal(today);
    if (scheduledOrdinal !== null && todayOrdinal !== null && scheduledOrdinal < todayOrdinal) {
      return 'completed';
    }
  }
  return 'planned';
}

export function activityStatusForDraftMode(mode: ActivityDraftMode): 'open' | 'completed' {
  return mode === 'completed' ? 'completed' : 'open';
}

export function activityDraftModeLabelKey(mode: ActivityDraftMode): 'statusPlanned' | 'statusCompleted' {
  return mode === 'planned' ? 'statusPlanned' : 'statusCompleted';
}

export function activityDraftDateLabelKey(mode: ActivityDraftMode): 'fieldScheduled' | 'fieldDate' {
  return mode === 'planned' ? 'fieldScheduled' : 'fieldDate';
}

export function activityDraftDetailsPlaceholderKey(
  mode: ActivityDraftMode,
): 'detailsPlaceholderUpcoming' | 'detailsPlaceholderPast' {
  return mode === 'planned' ? 'detailsPlaceholderUpcoming' : 'detailsPlaceholderPast';
}