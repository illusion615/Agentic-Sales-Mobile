/**
 * Single source of truth for activity-type color coding.
 *
 * Before this module the same five activity types were colored three different
 * ways: the home dashboard (kpi-card) used Tailwind named colors, while the
 * Activities calendar view and the activity-detail page used a separate hex
 * palette — so e.g. "email" showed orange on Home but green in the calendar.
 *
 * Every surface that colors an activity type (home calendar dots + legend, the
 * Activities list/calendar icon tiles and day dots, the activity-detail icon)
 * now reads from `ACTIVITY_TYPE_COLORS` here. The Home palette is the canonical
 * one.
 *
 * Each token set provides the variants the call sites need:
 *  - `solid` — opaque background for an icon tile rendered with a white glyph.
 *  - `tint`  — translucent background for chips/pills (Home calendar).
 *  - `text`  — dark-mode-aware foreground color for labels/legends.
 *  - `dot`   — opaque background for the small calendar/legend dots.
 */
export interface ActivityColorTokens {
  solid: string;
  tint: string;
  text: string;
  dot: string;
}

export const ACTIVITY_TYPE_COLORS: Record<string, ActivityColorTokens> = {
  visit: {
    solid: 'bg-blue-500',
    tint: 'bg-blue-500/20',
    text: 'text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500',
  },
  call: {
    solid: 'bg-emerald-500',
    tint: 'bg-emerald-500/20',
    text: 'text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  meeting: {
    solid: 'bg-purple-500',
    tint: 'bg-purple-500/20',
    text: 'text-purple-600 dark:text-purple-400',
    dot: 'bg-purple-500',
  },
  email: {
    solid: 'bg-orange-500',
    tint: 'bg-orange-500/20',
    text: 'text-orange-600 dark:text-orange-400',
    dot: 'bg-orange-500',
  },
  other: {
    solid: 'bg-gray-500',
    tint: 'bg-gray-500/20',
    text: 'text-gray-600 dark:text-gray-400',
    dot: 'bg-gray-500',
  },
};

export const DEFAULT_ACTIVITY_COLOR: ActivityColorTokens = ACTIVITY_TYPE_COLORS.other;

/** Resolve the color tokens for an activity type, falling back to `other`. */
export function activityColor(type: string | undefined | null): ActivityColorTokens {
  return (type && ACTIVITY_TYPE_COLORS[type]) || DEFAULT_ACTIVITY_COLOR;
}
