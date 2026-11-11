import { describe, expect, it } from 'vitest';
import { isPaidUnfulfilled, summarizePendingPayments, type PendingPayment } from './usePendingPayments';

const NOW = new Date().toISOString();

function row(over: Partial<PendingPayment>): PendingPayment {
  return {
    id: 'p1',
    merchant_order_id: 'ORD-20261110-aaaa',
    user_id: null,
    amount_cents: 10000,
    status: 'pending',
    paymob_order_id: null,
    paymob_transaction_id: null,
    resulting_order_id: null,
    failure_reason: null,
    coupon_code: null,
    created_at: NOW,
    expires_at: null,
    completed_at: null,
    paid_at: null,
    shipping_address: null,
    ...over,
  };
}

describe('isPaidUnfulfilled', () => {
  it('is true only for a row that was paid but never became an order', () => {
    expect(isPaidUnfulfilled(row({ status: 'failed', paid_at: NOW }))).toBe(true);
    expect(isPaidUnfulfilled(row({ status: 'failed', paid_at: null }))).toBe(false);
    expect(isPaidUnfulfilled(row({ status: 'cancelled', paid_at: null }))).toBe(false);
    // a normal success also has paid_at: it is not a problem
    expect(isPaidUnfulfilled(row({ status: 'completed', paid_at: NOW }))).toBe(false);
  });
});

describe('summarizePendingPayments', () => {
  it('counts paid-without-order apart from lost attempts', () => {
    const stats = summarizePendingPayments([
      row({ id: 'a', status: 'completed', paid_at: NOW, amount_cents: 50000 }),
      row({ id: 'b', status: 'failed', paid_at: NOW, amount_cents: 62900 }),
      row({ id: 'c', status: 'cancelled', amount_cents: 20000 }),
      row({ id: 'd', status: 'pending', amount_cents: 10000 }),
    ]);
    expect(stats.completed).toBe(1);
    expect(stats.paidUnfulfilled).toBe(1);
    expect(stats.paidUnfulfilledAmount).toBe(629);
    // the paid row is money owed, not a lost attempt
    expect(stats.lostRevenue).toBe(300);
    expect(stats.stuck).toBe(1);
    expect(stats.failedToday).toBe(2);
  });
});
