import { describe, expect, it } from 'vitest';
import {
  ALL,
  COUPON_STATUSES,
  CUSTOMER_STAT_CARDS,
  countByStatus,
  couponMatchesStatus,
  customerMatchesStatus,
  toggleFilter,
} from './listFilters';
import { getCouponStatus, type Coupon } from '@/hooks/useCoupons';

describe('toggleFilter', () => {
  it('selects a value, and clears it when it is already selected', () => {
    expect(toggleFilter(ALL, 'نشط')).toBe('نشط');
    expect(toggleFilter('نشط', 'نشط')).toBe(ALL);
    expect(toggleFilter('نشط', 'محظور')).toBe('محظور');
    expect(toggleFilter(ALL, ALL)).toBe(ALL);
  });
});

describe('customers', () => {
  // guests (no profile row) count as active, like the list has always shown them
  const customers = [{ is_active: true }, { is_active: true }, { is_active: true }, { is_active: false }];

  it('each counter equals the rows its click shows', () => {
    const counts = CUSTOMER_STAT_CARDS.map((c) => countByStatus(customers, customerMatchesStatus, c.status));
    expect(counts).toEqual([4, 3, 1]);
    for (const c of CUSTOMER_STAT_CARDS) {
      expect(customers.filter((x) => customerMatchesStatus(x, c.status))).toHaveLength(countByStatus(customers, customerMatchesStatus, c.status));
    }
  });

  it('active and banned split the customers with nothing left over', () => {
    const [, active, banned] = CUSTOMER_STAT_CARDS.map((c) => countByStatus(customers, customerMatchesStatus, c.status));
    expect(active + banned).toBe(customers.length);
  });
});

describe('coupons', () => {
  const now = Date.now();
  const day = 86_400_000;
  const iso = (offset: number) => new Date(now + offset * day).toISOString();
  const base: Omit<Coupon, 'id' | 'code'> = {
    type: 'نسبة', value: 10, min_order: 0, used_count: 0, valid_from: iso(-10), is_active: true, created_at: iso(-10),
  };
  const coupons = [
    { ...base, id: '1', code: 'A' },                                   // live
    { ...base, id: '2', code: 'B', valid_to: iso(-1) },               // ended by date
    { ...base, id: '3', code: 'C', max_uses: 5, used_count: 5 },      // ended: used up
    { ...base, id: '4', code: 'D', is_active: false },                // switched off
    { ...base, id: '5', code: 'E', valid_from: iso(3) },              // not started
  ].map((c) => ({ ...c, _status: getCouponStatus(c as Coupon) }));

  it('classifies each coupon into exactly one status', () => {
    expect(coupons.map((c) => c._status)).toEqual(['نشط', 'منتهي', 'منتهي', 'معطل', 'لم يبدأ']);
  });

  it('each counter equals the rows its click shows, and the four statuses cover every coupon', () => {
    const counts = COUPON_STATUSES.map((s) => countByStatus(coupons, couponMatchesStatus, s));
    expect(counts).toEqual([1, 2, 1, 1]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(coupons.length);
    expect(countByStatus(coupons, couponMatchesStatus, ALL)).toBe(coupons.length);
  });
});
