/**
 * Currency Formatting Utility
 * Based on Dataverse base language (1033 = English US), we use USD ($) as the standard currency.
 * This applies regardless of locale or data language (e.g., Chinese region names).
 */

import { getLocale } from '@/lib/i18n';

/**
 * Format a numeric value as USD currency.
 * Uses locale for number formatting (thousand separators) but always shows $ symbol.
 * 
 * @param value - The numeric amount
 * @param options - Formatting options
 * @returns Formatted currency string (e.g., "$150K", "$1,500,000")
 */
export function formatCurrency(
  value: number,
  options?: {
    /** Use abbreviated format (K for thousands, M for millions). Default: true for values >= 1000 */
    abbreviated?: boolean;
    /** Show decimal places. Default: 0 for abbreviated, 2 for full */
    decimals?: number;
  }
): string {
  const locale = getLocale();
  const abbreviated = options?.abbreviated ?? true;
  
  if (abbreviated && value >= 1_000_000) {
    const decimals = options?.decimals ?? 1;
    return `$${(value / 1_000_000).toFixed(decimals)}M`;
  }
  
  if (abbreviated && value >= 1_000) {
    const decimals = options?.decimals ?? 0;
    return `$${(value / 1_000).toFixed(decimals)}K`;
  }
  
  // Full format with locale-appropriate thousand separators
  const localeCode = locale === 'zh-Hans' ? 'zh-CN' : 'en-US';
  return '$' + value.toLocaleString(localeCode, {
    minimumFractionDigits: options?.decimals ?? 0,
    maximumFractionDigits: options?.decimals ?? 0,
  });
}

/**
 * Format currency for display in cards and summaries.
 * Always uses abbreviated format for readability.
 */
export function formatCurrencyCompact(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toLocaleString()}`;
}

/**
 * Format currency for detailed views (full number with separators).
 */
export function formatCurrencyFull(value: number): string {
  return '$' + value.toLocaleString();
}
