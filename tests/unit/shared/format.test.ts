/**
 * tests/unit/shared/format.test.ts
 *
 * Unit tests for src/shared/utils/format.ts
 * Run: npm run test:unit
 */

import { describe, expect, it } from 'vitest';
import { money, quantity, intId, cleanString, esc, formatCurrency, toIsoDate } from '../../../src/shared/utils/format';

describe('money()', () => {
  it('returns a non-negative rounded number', () => {
    expect(money(100)).toBe(100.00);
    expect(money(99.999)).toBe(100.00);
    expect(money(0)).toBe(0.00);
  });

  it('returns null for negative values', () => {
    expect(money(-1)).toBeNull();
  });

  it('returns null for non-finite values', () => {
    expect(money(Infinity)).toBeNull();
    expect(money(NaN)).toBeNull();
    expect(money('abc')).toBeNull();
  });

  it('handles null and undefined as 0', () => {
    expect(money(null)).toBe(0);
    expect(money(undefined)).toBe(0);
  });
});

describe('quantity()', () => {
  it('returns a positive rounded quantity', () => {
    expect(quantity(1.5)).toBe(1.500);
    expect(quantity(0.001)).toBe(0.001);
  });

  it('returns null for zero or negative', () => {
    expect(quantity(0)).toBeNull();
    expect(quantity(-1)).toBeNull();
  });
});

describe('intId()', () => {
  it('returns a positive integer', () => {
    expect(intId(1)).toBe(1);
    expect(intId(100)).toBe(100);
  });

  it('returns null for non-positive or non-integer values', () => {
    expect(intId(0)).toBeNull();
    expect(intId(-5)).toBeNull();
    expect(intId(1.5)).toBeNull();
    expect(intId('abc')).toBeNull();
  });
});

describe('cleanString()', () => {
  it('trims whitespace and returns non-empty strings', () => {
    expect(cleanString('  hello  ')).toBe('hello');
  });

  it('returns null for empty strings', () => {
    expect(cleanString('')).toBeNull();
    expect(cleanString('   ')).toBeNull();
  });

  it('respects minLength parameter', () => {
    expect(cleanString('ab', 3)).toBeNull();
    expect(cleanString('abc', 3)).toBe('abc');
  });
});

describe('esc()', () => {
  it('escapes HTML special characters', () => {
    expect(esc('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('handles null/undefined as empty string', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

describe('formatCurrency()', () => {
  it('formats with Rs. prefix and 2dp', () => {
    expect(formatCurrency(1234.5)).toContain('1,234.50');
    expect(formatCurrency(1234.5)).toContain('Rs.');
  });
});

describe('toIsoDate()', () => {
  it('converts a Date to YYYY-MM-DD', () => {
    expect(toIsoDate(new Date('2026-01-15T00:00:00Z'))).toBe('2026-01-15');
  });

  it('accepts a date string', () => {
    expect(toIsoDate('2026-06-27')).toBe('2026-06-27');
  });
});
