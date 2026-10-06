import { describe, expect, it } from 'vitest';
import {
  IAP_PRODUCT_ID_MAX_LENGTH,
  iapProductIdError,
  isIapDuplicateError,
  normalizeIapProductId,
} from './iap';

describe('normalizeIapProductId', () => {
  it('trims, and stores null for an empty id', () => {
    expect(normalizeIapProductId('  com.daralfath.store.book_learn_wudu_salah  ', true)).toBe('com.daralfath.store.book_learn_wudu_salah');
    expect(normalizeIapProductId('   ', true)).toBeNull();
    expect(normalizeIapProductId('', true)).toBeNull();
    expect(normalizeIapProductId(undefined, true)).toBeNull();
  });

  it('is always null for a physical copy, whatever was typed', () => {
    expect(normalizeIapProductId('com.daralfath.store.book', false)).toBeNull();
  });
});

describe('iapProductIdError', () => {
  it('accepts letters, digits, dot, dash and underscore, and an empty value', () => {
    for (const ok of ['com.daralfath.store.book_name', 'a', 'A-b_c.9', '', '   ']) {
      expect(iapProductIdError(ok)).toBeNull();
    }
  });

  it('rejects spaces, Arabic, and other symbols', () => {
    for (const bad of ['com daralfath', 'كتاب', 'com/daralfath', 'id@store', 'a,b']) {
      expect(iapProductIdError(bad)).toMatch(/حروف إنجليزية/);
    }
  });

  it('rejects anything over 255 characters', () => {
    expect(iapProductIdError('a'.repeat(IAP_PRODUCT_ID_MAX_LENGTH))).toBeNull();
    expect(iapProductIdError('a'.repeat(IAP_PRODUCT_ID_MAX_LENGTH + 1))).toMatch(/أطول من 255/);
  });
});

describe('isIapDuplicateError', () => {
  const unique = { code: '23505', message: 'duplicate key value violates unique constraint "product_variants_iap_product_id_key"' };

  it('recognises the unique violation on iap_product_id only', () => {
    expect(isIapDuplicateError(unique)).toBe(true);
    expect(isIapDuplicateError({ code: '23505', message: 'duplicate key value violates unique constraint "product_variants_sku_key"' })).toBe(false);
    expect(isIapDuplicateError({ code: '23503', message: 'iap_product_id' })).toBe(false);
    expect(isIapDuplicateError(null)).toBe(false);
  });
});
