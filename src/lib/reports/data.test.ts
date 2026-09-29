import { describe, expect, it, vi } from 'vitest';

// The aggregations are pure; only the fetcher talks to Supabase.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { groupOrders, isRealOrder, salesByProduct, stockMovementByVariant, type ReportOrder, type ReportOrderItem } from './data';

const item = (over: Partial<ReportOrderItem>): ReportOrderItem => ({
  product_id: 'p1',
  variant_id: 'v1',
  quantity: 1,
  price_per_item: 100,
  discount_per_item: 0,
  is_digital: false,
  products: { id: 'p1', title: 'كتاب', author: null, cost_price: 40 },
  product_variants: { variant_name: 'ورق عادي' },
  order_item_components: [],
  ...over,
});

const order = (id: string, status: string, items: ReportOrderItem[], total = 100): ReportOrder => ({
  id,
  user_id: null,
  country_id: 'eg',
  status,
  payment_status: 'معلق',
  total_price: total,
  shipping_cost: 0,
  discount_amount: 0,
  coupon_id: null,
  shipping_company_id: null,
  tracking_number: null,
  shipping_address: null,
  created_at: '2026-09-01T10:00:00Z',
  profiles: null,
  countries: null,
  coupons: null,
  payment_methods: null,
  shipping_companies: null,
  order_items: items,
});

const orders = [
  order('o1', 'تم التوصيل', [item({ quantity: 2 })]),
  order('o2', 'جديد', [
    // a bundle line: its books leave stock, not the bundle itself
    item({
      product_id: 'bundle',
      variant_id: 'bundle-v',
      quantity: 1,
      price_per_item: 300,
      order_item_components: [
        { product_id: 'p1', variant_id: 'v1', quantity: 1 },
        { product_id: 'p2', variant_id: 'v2', quantity: 3 },
      ],
    }),
    item({ product_id: 'p3', variant_id: 'v3-digital', is_digital: true }),
    item({ product_id: 'p4', variant_id: null, quantity: 5 }),
  ], 700),
  order('o3', 'ملغي', [item({ quantity: 10 })]),
  order('o4', 'مرتجع', [item({ quantity: 10 })]),
];

describe('isRealOrder', () => {
  it('excludes cancelled and returned orders only', () => {
    expect(orders.map(isRealOrder)).toEqual([true, true, false, false]);
  });
});

describe('stockMovementByVariant', () => {
  const moved = stockMovementByVariant(orders);
  it('counts a bundle against its books and skips the bundle copy itself', () => {
    expect(moved.get('v1')).toBe(3); // 2 sold alone + 1 inside the bundle
    expect(moved.get('v2')).toBe(3);
    expect(moved.has('bundle-v')).toBe(false);
  });
  it('ignores digital copies and void orders, and keys copy-less legacy lines by product', () => {
    expect(moved.has('v3-digital')).toBe(false);
    expect(moved.get('p:p4')).toBe(5);
  });
});

describe('salesByProduct', () => {
  const { byProduct, byVariant } = salesByProduct(orders);
  it('counts a bundle as itself for sales, with units and revenue', () => {
    expect(byProduct.get('bundle')).toMatchObject({ units: 1, revenue: 300 });
    expect(byProduct.get('p1')).toMatchObject({ units: 2, revenue: 200 });
    expect(byVariant.get('v1')).toEqual({ units: 2, revenue: 200 });
  });
  it('leaves out cancelled and returned orders', () => {
    expect(byProduct.get('p1')!.orders.has('o3')).toBe(false);
  });
});

describe('groupOrders', () => {
  it('counts and sums per key, most common first', () => {
    const groups = groupOrders(orders, (o) => (isRealOrder(o) ? 'فعلي' : 'ملغي/مرتجع'));
    expect(groups).toEqual([
      { name: 'فعلي', count: 2, value: 800 },
      { name: 'ملغي/مرتجع', count: 2, value: 200 },
    ]);
  });
});
