/**
 * Activity status — the SINGLE source of truth for how the three lifecycle
 * states (pending / completed / canceled) are categorized, grouped, and
 * displayed across every surface: the Activities list, the Home agenda +
 * overdue, the activity detail pill, and the account/contact/opportunity
 * relation-page mini rows.
 *
 * Rules (canonical — do NOT re-derive these inline anywhere):
 *   - status 'open'      → the actionable to-do state ("待办" / pending)
 *   - status 'completed' → done
 *   - status 'canceled'  → abandoned; NOT pending and NOT done, so it must
 *     never fall into a "!== completed" pending bucket.
 *   - overdue = a still-pending activity scheduled before the start of today.
 *     Completed and canceled activities are never overdue (they are closed).
 *
 * Before this module the same logic was copy-pasted with subtle differences
 * (`status !== 'completed'` swept canceled into "待办", ad-hoc overdue checks,
 * raw untranslated `activity.status` badges). Everything now funnels here.
 */
import { CheckCircle, Ban, type LucideIcon } from 'lucide-react';
import { t, type Locale } from '@/lib/i18n';

/** The three canonical activity lifecycle states (mirrors `Activity.status`). */
export type ActivityStatus = 'open' | 'completed' | 'canceled';

/** Minimal shape needed to classify — anything carrying a status/date. */
export interface ActivityStatusLike {
  status?: string;
  scheduleddate?: string | null;
}

/** Normalize any status string to the canonical union (unknown → 'open'). */
export function activityStatus(a: ActivityStatusLike): ActivityStatus {
  return a.status === 'completed'
    ? 'completed'
    : a.status === 'canceled'
      ? 'canceled'
      : 'open';
}

/** Still actionable — the "待办" bucket. */
export function isPending(a: ActivityStatusLike): boolean {
  return activityStatus(a) === 'open';
}

export function isCompleted(a: ActivityStatusLike): boolean {
  return activityStatus(a) === 'completed';
}

export function isCanceled(a: ActivityStatusLike): boolean {
  return activityStatus(a) === 'canceled';
}

/** Closed = not actionable anymore (completed OR canceled). */
export function isClosed(a: ActivityStatusLike): boolean {
  return !isPending(a);
}

/**
 * Overdue = a still-pending activity whose scheduled date is before today.
 * Completed and canceled activities are never overdue.
 */
export function isOverdue(a: ActivityStatusLike, now: Date = new Date()): boolean {
  if (!isPending(a)) return false;
  if (!a.scheduleddate) return false;
  const scheduled = new Date(a.scheduleddate);
  if (Number.isNaN(scheduled.getTime())) return false;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return scheduled < startOfToday;
}

/** Whole days an activity is overdue (0 when not overdue). */
export function daysOverdue(a: ActivityStatusLike, now: Date = new Date()): number {
  if (!isOverdue(a, now)) return 0;
  const scheduled = new Date(a.scheduleddate!);
  scheduled.setHours(0, 0, 0, 0);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return Math.floor((startOfToday.getTime() - scheduled.getTime()) / 86_400_000);
}

/** Split a list into the three canonical buckets (order-preserving). */
export function groupByStatus<T extends ActivityStatusLike>(list: T[]): {
  pending: T[];
  completed: T[];
  canceled: T[];
} {
  const pending: T[] = [];
  const completed: T[] = [];
  const canceled: T[] = [];
  for (const a of list) {
    const s = activityStatus(a);
    if (s === 'completed') completed.push(a);
    else if (s === 'canceled') canceled.push(a);
    else pending.push(a);
  }
  return { pending, completed, canceled };
}

/** Presentation metadata for a status — the SINGLE source for every pill/badge. */
export interface ActivityStatusMeta {
  status: ActivityStatus;
  /** Localized label ("进行中" / "已完成" / "已取消"). */
  label: string;
  /** Leading icon (null for the plain pending state). */
  icon: LucideIcon | null;
  /** Pill/badge background + text classes. */
  pillClass: string;
  /** Title decoration — closed items (done/canceled) are struck through + muted. */
  titleClass: string;
}

export function activityStatusMeta(a: ActivityStatusLike, locale: Locale): ActivityStatusMeta {
  const status = activityStatus(a);
  if (status === 'completed') {
    return {
      status,
      label: t('statusCompleted', locale),
      icon: CheckCircle,
      // Completed is a positive outcome — the emerald pill + check convey "done";
      // the title stays normal (only canceled is struck through / voided).
      pillClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
      titleClass: 'text-foreground',
    };
  }
  if (status === 'canceled') {
    return {
      status,
      label: t('statusCanceled', locale),
      icon: Ban,
      pillClass: 'bg-muted text-muted-foreground',
      titleClass: 'text-muted-foreground line-through',
    };
  }
  return {
    status,
    label: t('statusOpen', locale),
    icon: null,
    pillClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    titleClass: 'text-foreground',
  };
}
