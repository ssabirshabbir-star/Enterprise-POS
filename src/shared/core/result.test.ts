/**
 * src/shared/core/result.test.ts
 *
 * Unit tests for the Result<T, E> utility.
 */

import { describe, expect, it } from 'vitest';
import { ok, err, isOk, isErr, fromLegacy } from './result';

describe('ok()', () => {
  it('creates a successful result', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    expect(result.data).toBe(42);
  });

  it('accepts objects as data', () => {
    const result = ok({ id: 1, name: 'test' });
    expect(result.ok).toBe(true);
    expect(result.data.id).toBe(1);
  });
});

describe('err()', () => {
  it('creates a failure result', () => {
    const result = err('Something went wrong');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Something went wrong');
  });
});

describe('isOk()', () => {
  it('returns true for successful results', () => {
    expect(isOk(ok('data'))).toBe(true);
  });

  it('returns false for failure results', () => {
    expect(isOk(err('error'))).toBe(false);
  });
});

describe('isErr()', () => {
  it('returns true for failure results', () => {
    expect(isErr(err('error'))).toBe(true);
  });

  it('returns false for successful results', () => {
    expect(isErr(ok('data'))).toBe(false);
  });
});

describe('fromLegacy()', () => {
  it('converts a legacy ok:true response to Ok<T>', () => {
    const legacy = { ok: true, message: 'Done', products: [] };
    const result = fromLegacy(legacy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.products).toEqual([]);
    }
  });

  it('converts a legacy ok:false response to Err<string>', () => {
    const legacy = { ok: false, message: 'Not found' };
    const result = fromLegacy(legacy);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Not found');
    }
  });

  it('uses default message when message is absent', () => {
    const legacy = { ok: false };
    const result = fromLegacy(legacy);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Request failed.');
    }
  });
});
