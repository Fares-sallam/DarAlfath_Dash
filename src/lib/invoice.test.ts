import { describe, expect, it } from 'vitest';
import type { Order } from '@/hooks/useOrders';
import { addressLine, buildInvoiceHtml, invoiceFigures } from './invoice';

const order = (over: Partial<Order> = {}): Order => ({
  id: 'ORD-20260101-test01',
  status: 'جديد',
  total_price: 560,
  shipping_cost: 0,
  discount_amount: 0,
  payment_status: 'معلق',
  created_at: '2026-11-25T15:22:52.547389+00:00',
  updated_at: '2026-11-25T15:22:52.547389+00:00',
  shipping_address: { name: 'Test Guest Customer', phone: '01012345678', email: 'guest@example.com', governorate: 'القاهرة', city: 'مدينة نصر', street: 'شارع الاختبار ١', country: 'مصر' },
  order_items: [
    { id: 'i1', product_id: 'p1', variant_id: 'v1', quantity: 7, price_per_item: 20, discount_per_item: 0, is_digital: false,
      products: { id: 'p1', title: 'قواعد النحو', author: 'م', type: 'ورقي' }, product_variants: { id: 'v1', variant_name: 'غلاف عادي' } },
    { id: 'i2', product_id: 'p2', variant_id: null, quantity: 2, price_per_item: 100, discount_per_item: 15, is_digital: true,
      products: { id: 'p2', title: 'موسوعة <مهمة> & "أخرى"', author: 'م', type: 'رقمي' }, product_variants: null },
  ],
  countries: { name: 'مصر', currency_symbol: 'ج.م' },
  ...over,
});

describe('invoiceFigures', () => {
  it('each line is quantity × (price − discount), and the lines add up', () => {
    const f = invoiceFigures(order());
    expect(f.lines.map((l) => l.total)).toEqual([140, 170]);
    expect(f.itemsTotal).toBe(310);
    expect(f.lines[0]).toMatchObject({ title: 'قواعد النحو', edition: 'غلاف عادي', kind: 'ورقي', qty: 7, unit: 20 });
    expect(f.lines[1]).toMatchObject({ kind: 'رقمي', edition: '', discount: 15 });
  });
  it('the totals with and without shipping follow the order\'s own figures', () => {
    const f = invoiceFigures(order({ total_price: 585, shipping_cost: 35, discount_amount: 10 }));
    expect(f.totalWithShipping).toBe(585);
    expect(f.totalWithoutShipping).toBe(550);
    expect(f.shipping).toBe(35);
    expect(f.orderDiscount).toBe(10);
  });
  it('an order with nothing odd in it: free shipping, no discount', () => {
    const f = invoiceFigures(order({ order_items: [], total_price: 0 }));
    expect(f.lines).toEqual([]);
    expect(f.totalWithShipping).toBe(0);
  });
  it('a deleted book still has a line', () => {
    const f = invoiceFigures(order({ order_items: [{ id: 'i', product_id: 'x', quantity: 1, price_per_item: 5, discount_per_item: 0, is_digital: false, products: null }] }));
    expect(f.lines[0].title).toBe('منتج محذوف');
  });
});

describe('addressLine', () => {
  it('joins what the customer wrote, in reading order', () => {
    expect(addressLine({ governorate: 'القاهرة', city: 'مدينة نصر', street: 'شارع 1', building: '4', floor: '2', apartment: '7' })).toBe('القاهرة، مدينة نصر، شارع 1، عمارة 4، دور 2، شقة 7');
    expect(addressLine(null)).toBe('');
  });
});

describe('buildInvoiceHtml', () => {
  const html = buildInvoiceHtml(order());
  it('has the customer, the address, the phone, the lines and both totals', () => {
    for (const text of ['Test Guest Customer', '01012345678', 'guest@example.com', 'القاهرة، مدينة نصر', 'قواعد النحو', 'الطبعة: غلاف عادي', 'الإجمالي بدون الشحن', 'الإجمالي بالشحن', 'مجاني', 'ORD-20260101-test01']) {
      expect(html).toContain(text);
    }
    expect(html).toContain('560 ج.م');
    expect(html).toContain('140 ج.م');
  });
  it('is a right-to-left A4 page', () => {
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('size: A4 portrait');
  });
  it('never lets a name or a title become markup', () => {
    expect(html).toContain('موسوعة &lt;مهمة&gt; &amp; &quot;أخرى&quot;');
    expect(html).not.toContain('<مهمة>');
    const hostile = buildInvoiceHtml(order({ shipping_address: { name: '<script>alert(1)</script>' } }));
    expect(hostile).not.toContain('<script>alert(1)</script>');
  });
  it('shows the shipping cost and the coupon when there are any', () => {
    const paid = buildInvoiceHtml(order({ total_price: 585, shipping_cost: 35, discount_amount: 10, coupons: { code: 'WELCOME' } }));
    expect(paid).toContain('35 ج.م');
    expect(paid).toContain('خصم الكوبون (WELCOME)');
    expect(paid).not.toContain('>مجاني<');
  });
});
