/**
 * Currency formatting utility
 * Uses USD ($) as the base currency based on Dataverse base language (1033 = English US)
 */

export const CURRENCY_SYMBOL = '$';
export const CURRENCY_CODE = 'USD';

/**
 * Format a number as currency with the base currency symbol
 * @param amount - The amount to format
 * @param options - Formatting options
 * @returns Formatted currency string
 */
export function formatCurrency(
  amount: number,
  options: {
    /** Use compact notation for large numbers (e.g., $150K instead of $150,000) */
    compact?: boolean;
    /** Number of decimal places (default: 0 for compact, 2 for full) */
    decimals?: number;
    /** Show currency symbol (default: true) */
    showSymbol?: boolean;
  } = {}
): string {
  const { compact = false, showSymbol = true } = options;
  const symbol = showSymbol ? CURRENCY_SYMBOL : '';

  if (compact) {
    const decimals = options.decimals ?? 0;
    if (amount >= 1_000_000) {
      return `${symbol}${(amount / 1_000_000).toFixed(decimals)}M`;
    }
    if (amount >= 1_000) {
      return `${symbol}${(amount / 1_000).toFixed(decimals)}K`;
    }
    return `${symbol}${amount.toLocaleString()}`;
  }

  const decimals = options.decimals ?? 2;
  return `${symbol}${amount.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * Format currency for display in KPIs and summaries (compact format)
 * @param amount - The amount to format
 * @returns Formatted currency string (e.g., $150K)
 */
export function formatCurrencyCompact(amount: number): string {
  return formatCurrency(amount, { compact: true });
}

/**
 * Format currency for display in detailed views (full format)
 * @param amount - The amount to format
 * @returns Formatted currency string (e.g., $150,000.00)
 */
export function formatCurrencyFull(amount: number): string {
  return formatCurrency(amount, { compact: false, decimals: 2 });
}

/**
 * Format currency without decimals
 * @param amount - The amount to format
 * @returns Formatted currency string (e.g., $150,000)
 */
export function formatCurrencyNoDecimals(amount: number): string {
  return formatCurrency(amount, { compact: false, decimals: 0 });
}
