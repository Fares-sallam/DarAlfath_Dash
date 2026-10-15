import { describe, expect, it } from 'vitest';
import { salesRanking, topSellerIds } from './bestSellers';
import type { ReportOrder } from './reports/data';

const book = (id: string, over: Record<string, unknown> = {}) => ({ id, title: `كتاب ${id}`, author: null, cover_url: null, is_active: true, is_bundle: false, ...over });
const order = (id: string, status: string, created_at: string, items: [string, number, number][]) =>
  ({ id, status, created_at, order_items: items.map(([product_id, quantity, price_per_item]) => ({ product_id, quantity, price_per_item })) }) as unknown as ReportOrder;

describe('salesRanking', () => {
  const products = [book('a'), book('b'), book('c'), book('d', { is_active: false }), book('e', { is_bundle: true })];
  const orders = [
    order('1', 'تم التوصيل', '2026-10-01', [['a', 2, 50], ['b', 2, 80]]),
    order('2', 'جديد', '2026-10-05', [['c', 1, 40]]),
    order('3', 'ملغي', '2026-10-06', [['c', 10, 40]]),   // cancelled: doesn't count
    order('4', 'مرتجع', '2026-10-07', [['a', 10, 50]]),  // returned: doesn't count
    order('5', 'تم التوصيل', '2026-10-08', [['d', 5, 10], ['e', 1, 300]]),
  ];
  const stock = new Map([['a', 4], ['b', 0]]);
  const rows = salesRanking(orders, products, stock);

  it('ranks by copies sold, then revenue; cancelled and returned orders left out', () => {
    expect(rows.map((r) => r.id)).toEqual(['d', 'b', 'a', 'e', 'c']); // e and c sold one each: e brought in more
    expect(rows.find((r) => r.id === 'b')).toMatchObject({ units: 2, revenue: 160, orders: 1, rank: 2 });
    expect(rows.find((r) => r.id === 'c')).toMatchObject({ units: 1, rank: 5, lastSoldAt: '2026-10-05' });
  });

  it('stock: on hand for a book, none for a bundle, zero when unknown', () => {
    expect(rows.find((r) => r.id === 'a')!.stock).toBe(4);
    expect(rows.find((r) => r.id === 'c')!.stock).toBe(0);
    expect(rows.find((r) => r.id === 'e')!.stock).toBeNull();
    expect(salesRanking(orders, products, null)[0].stock).toBeNull();
  });

  it('books with no sales come last, unranked', () => {
    const none = salesRanking([], [book('z', { title: 'ي' }), book('y', { title: 'أ' })], null);
    expect(none.map((r) => r.id)).toEqual(['y', 'z']);
    expect(none.every((r) => r.rank === null)).toBe(true);
  });

  it('the auto-fill picks books on sale that sold, best first, up to the limit', () => {
    expect(topSellerIds(rows)).toEqual(['b', 'a', 'e', 'c']); // d is hidden from sale
    expect(topSellerIds(rows, 2)).toEqual(['b', 'a']);
  });
});
