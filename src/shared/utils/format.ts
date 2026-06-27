/**
 * src/shared/utils/format.ts
 *
 * Typed equivalents of the money(), quantity(), esc() helpers
 * that are copy-pasted across JS service files.
 *
 * Consolidating here prevents the pattern from continuing in new TS modules.
 */

/**
 * Normalise a monetary value to a non-negative number with 2 decimal places.
 * Returns null if the value is invalid or negative (matches existing JS behaviour).
 */
export function money(value: unknown): number | null {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) return null;
  return Number(n.toFixed(2));
}

/**
 * Normalise a quantity value to a positive number with 3 decimal places.
 * Returns null if the value is not a positive finite number.
 */
export function quantity(value: unknown): number | null {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Number(n.toFixed(3));
}

/**
 * Normalise an integer ID.
 * Returns null if the value is not a positive safe integer.
 */
export function intId(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * Trim and sanitise a string field.
 * Returns null if empty after trim.
 */
export function cleanString(value: unknown, minLength = 1): string | null {
  const s = String(value ?? '').trim();
  if (s.length < minLength) return null;
  return s;
}

/**
 * Escape a string for safe HTML rendering (renderer-side utility).
 * Prevents XSS in innerHTML assignments.
 */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format a number as Pakistani Rupee currency string.
 * e.g. formatCurrency(1234.5) → 'Rs. 1,234.50'
 */
export function formatCurrency(value: number, symbol = 'Rs.'): string {
  return `${symbol} ${value.toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format a date to ISO date string 'YYYY-MM-DD'.
 */
export function toIsoDate(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10);
}
