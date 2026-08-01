/** Human-facing duration and clock formatting, in the app's own language. */

/** `95` → `1 小时 35 分`; sub-hour durations stay in minutes. */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} 分钟`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分`;
}

/** Compact form for map labels, where space is scarce. */
export function formatDurationShort(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} 分`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} 小时` : `${hours}h${rest}`;
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Include a day marker when a projected time spills beyond its reference day. */
export function formatProjectedClock(date: Date, referenceDay: Date): string {
  const projected = new Date(date);
  projected.setHours(0, 0, 0, 0);
  const reference = new Date(referenceDay);
  reference.setHours(0, 0, 0, 0);
  const dayOffset = Math.round((projected.getTime() - reference.getTime()) / 86_400_000);

  if (dayOffset === 0) return formatClock(date);
  if (dayOffset === 1) return `次日 ${formatClock(date)}`;
  return `${date.getMonth() + 1}/${date.getDate()} ${formatClock(date)}`;
}
