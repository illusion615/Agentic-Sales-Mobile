/**
 * Unified Date Formatting Utility
 * 
 * Provides consistent date formatting across the app.
 * Consolidates all date-fns format() calls into reusable functions.
 */

import { format } from 'date-fns/format';
import { isToday } from 'date-fns/isToday';
import { isYesterday } from 'date-fns/isYesterday';
import { isTomorrow } from 'date-fns/isTomorrow';
import { startOfWeek } from 'date-fns/startOfWeek';
import { endOfWeek } from 'date-fns/endOfWeek';
import { parseISO } from 'date-fns/parseISO';
import { zhCN } from 'date-fns/locale/zh-CN';
import { enUS } from 'date-fns/locale/en-US';
import { getLocale, type Locale } from '@/lib/i18n';

/**
 * Get date-fns locale object from app locale
 */
function getDateLocale(locale?: Locale): typeof zhCN | typeof enUS {
  const currentLocale = locale ?? getLocale();
  return currentLocale === 'zh-Hans' ? zhCN : enUS;
}

/**
 * Format date for display in forms and details (e.g., "Jan 15, 2024" or "2024年1月15日")
 */
export function formatDisplayDate(date: Date | string, locale?: Locale): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const currentLocale = locale ?? getLocale();
  return format(d, 'PPP', { locale: getDateLocale(currentLocale) });
}

/**
 * Format date for lists and cards (e.g., "Jan 15" or "1月15日")
 */
export function formatShortDate(date: Date | string, locale?: Locale): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const currentLocale = locale ?? getLocale();
  return currentLocale === 'zh-Hans'
    ? format(d, 'M月d日', { locale: zhCN })
    : format(d, 'MMM d', { locale: enUS });
}

/**
 * Format date for grouping (e.g., "2024-01-15")
 */
export function formatDateKey(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'yyyy-MM-dd');
}

/**
 * Format day of week short (e.g., "Mon" or "周一")
 */
export function formatDayShort(date: Date | string, locale?: Locale): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'EEE', { locale: getDateLocale(locale) });
}

/**
 * Format day number (e.g., "15")
 */
export function formatDayNumber(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'd');
}

/**
 * Format month and year (e.g., "January 2024" or "2024年1月")
 */
export function formatMonthYear(date: Date | string, locale?: Locale): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMMM yyyy', { locale: getDateLocale(locale) });
}

/**
 * Format week range (e.g., "Jan 15 - Jan 21")
 */
export function formatWeekRange(date: Date | string, locale?: Locale): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const start = startOfWeek(d, { weekStartsOn: 1 });
  const end = endOfWeek(d, { weekStartsOn: 1 });
  const currentLocale = locale ?? getLocale();
  
  if (currentLocale === 'zh-Hans') {
    return `${format(start, 'M月d日')} - ${format(end, 'M月d日')}`;
  }
  return `${format(start, 'MMM d')} - ${format(end, 'MMM d')}`;
}

/**
 * Format time (e.g., "2:30 PM" or "14:30")
 */
export function formatTime(date: Date | string, locale?: Locale): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const currentLocale = locale ?? getLocale();
  return currentLocale === 'zh-Hans'
    ? format(d, 'HH:mm')
    : format(d, 'h:mm a');
}

/**
 * Format date with time (e.g., "Jan 15, 2024 at 2:30 PM")
 */
export function formatDateWithTime(date: Date | string, locale?: Locale): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const currentLocale = locale ?? getLocale();
  return currentLocale === 'zh-Hans'
    ? format(d, 'yyyy年M月d日 HH:mm', { locale: zhCN })
    : format(d, 'PPP p', { locale: enUS });
}

/**
 * Get relative day label (e.g., "Today", "Yesterday", "Tomorrow", or formatted date)
 */
export function getRelativeDayLabel(date: Date | string, locale?: Locale): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const currentLocale = locale ?? getLocale();
  
  if (isToday(d)) {
    return currentLocale === 'zh-Hans' ? '今天' : 'Today';
  }
  if (isYesterday(d)) {
    return currentLocale === 'zh-Hans' ? '昨天' : 'Yesterday';
  }
  if (isTomorrow(d)) {
    return currentLocale === 'zh-Hans' ? '明天' : 'Tomorrow';
  }
  
  return formatShortDate(d, currentLocale);
}

/**
 * Format calendar header based on view mode
 */
export function formatCalendarHeader(
  date: Date,
  viewMode: 'day' | 'week' | 'month',
  locale?: Locale
): string {
  const currentLocale = locale ?? getLocale();
  
  switch (viewMode) {
    case 'day':
      return format(date, 'EEE, MMM d', { locale: getDateLocale(currentLocale) });
    case 'week':
      return formatWeekRange(date, currentLocale);
    case 'month':
      return formatMonthYear(date, currentLocale);
    default:
      return formatDisplayDate(date, currentLocale);
  }
}

/**
 * Parse date string safely, returns undefined if invalid
 */
export function parseDateSafe(dateString: string): Date | undefined {
  try {
    const parsed = parseISO(dateString);
    return isNaN(parsed.getTime()) ? undefined : parsed;
  } catch {
    return undefined;
  }
}

// Re-export commonly used date-fns functions for convenience
export { format, parseISO, isToday, isYesterday, isTomorrow, startOfWeek, endOfWeek };
