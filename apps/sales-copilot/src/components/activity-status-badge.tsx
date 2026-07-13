/**
 * ActivityStatusBadge — the ONE badge that renders an activity's lifecycle
 * status (进行中 / 已完成 / 已取消) consistently everywhere. Reads its label,
 * icon and colors from `activityStatusMeta` so there is a single source of
 * truth; surfaces only pick a size. Replaces the per-page bespoke badges that
 * printed the raw untranslated `activity.status` and mishandled canceled.
 */
import { cn } from '@/lib/utils';
import { getLocale } from '@/lib/i18n';
import { activityStatusMeta, type ActivityStatusLike } from '@/lib/activity-status';

type BadgeSize = 'xs' | 'sm' | 'md';

const SIZE_CLASS: Record<BadgeSize, string> = {
  xs: 'px-1.5 py-0 text-[9px] gap-0.5',
  sm: 'px-1.5 py-0.5 text-[10px] gap-1',
  md: 'px-2 py-0.5 text-xs gap-1',
};

const ICON_CLASS: Record<BadgeSize, string> = {
  xs: 'w-2 h-2',
  sm: 'w-2.5 h-2.5',
  md: 'w-3 h-3',
};

export function ActivityStatusBadge({
  activity,
  size = 'sm',
  className,
}: {
  activity: ActivityStatusLike;
  size?: BadgeSize;
  className?: string;
}) {
  const locale = getLocale();
  const meta = activityStatusMeta(activity, locale);
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md font-medium',
        SIZE_CLASS[size],
        meta.pillClass,
        className,
      )}
    >
      {Icon && <Icon className={ICON_CLASS[size]} />}
      {meta.label}
    </span>
  );
}
