import { describe, expect, it, vi } from 'vitest';
import { applyColumnChoices, baseLabel, resolveSelection, setColumn, setGroupEnabled, type ColumnGroup } from './columnChoices';
import { fetchReportOrders } from './data';
import { resolvePeriod } from './period';
import type { ReportDocument } from './types';

// The reports read their orders and logs from the database: here they read nothing, which is enough to see which columns each sheet has.
vi.mock('./data', async (importOriginal) => ({ ...(await importOriginal<typeof import('./data')>()), fetchReportOrders: vi.fn(async () => []) }));
vi.mock('./download', async (importOriginal) => ({ ...(await importOriginal<typeof import('./download')>()), fetchAllPages: vi.fn(async () => []) }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({}) }) } }));

import {
  ACTIVITY_REPORT_GROUPS, ANALYTICS_REPORT_GROUPS, COUPONS_REPORT_GROUPS, CUSTOMERS_REPORT_GROUPS, INVENTORY_REPORT_GROUPS, ORDERS_REPORT_GROUPS, SHIPPING_REPORT_GROUPS,
} from './reportColumns';
import { buildOrdersReport } from './builders/orders';
import { buildShippingReport } from './builders/shipping';
import { buildInventoryReport } from './builders/inventory';
import { buildCouponsReport } from './builders/coupons';
import { buildCustomersReport } from './builders/customers';
import { buildAnalyticsReport } from './builders/analytics';
import { buildActivityReport } from './builders/activity';

const now = new Date(2026, 10, 22, 14, 5);
const scope = (preset: 'thisMonth' | 'all' = 'thisMonth') => ({ period: resolvePeriod({ preset }, now), generatedAt: now, country: null, currencySymbol: 'ج.م' });
const ACTION = ({ INSERT: 'إضافة', UPDATE: 'تعديل', DELETE: 'حذف' } as Record<string, string>);

/** The buttons of a report must be exactly the columns of its sheets: none missing (a column the owner can't turn off), none made up. */
function expectCatalogMatches(doc: ReportDocument, groups: readonly ColumnGroup[], conditional: Record<string, string[]> = {}) {
  expect(doc.sections).toHaveLength(groups.length);
  groups.forEach((group, i) => {
    const headers = doc.sections[i].columns.map((c) => baseLabel(c.header, doc.currencySymbol));
    const known = new Set(group.choices.map((c) => c.id));
    expect(headers.filter((h) => !known.has(h)), `columns of «${doc.sections[i].title}» with no button`).toEqual([]);
    const missing = [...known].filter((id) => !headers.includes(id) && !(conditional[group.id] ?? []).includes(id));
    expect(missing, `buttons of «${group.title}» with no column`).toEqual([]);
    // one column says what the row is (a rank is not enough): it is fixed
    expect(group.choices.filter((c) => c.locked)).toHaveLength(1);
    expect(headers).toContain(group.choices.find((c) => c.locked)?.id);
    expect(new Set(group.choices.map((c) => c.id)).size).toBe(group.choices.length);
  });
}

describe('the buttons of every report match its columns', () => {
  it('orders', async () => expectCatalogMatches(await buildOrdersReport(scope()), ORDERS_REPORT_GROUPS));
  it('shipping', async () => expectCatalogMatches(await buildShippingReport(scope()), SHIPPING_REPORT_GROUPS));
  it('inventory', async () => expectCatalogMatches(await buildInventoryReport(scope(), { rows: [], keepOrder: true }), INVENTORY_REPORT_GROUPS));
  it('coupons', async () => expectCatalogMatches(await buildCouponsReport(scope(), { coupons: [], keepOrder: true }), COUPONS_REPORT_GROUPS));
  it('analytics', async () => expectCatalogMatches(await buildAnalyticsReport(scope()), ANALYTICS_REPORT_GROUPS));
  it('activity log (the action columns are named by the page), for the staff\'s log and for the customers\'', async () => {
    for (const kind of ['staff', 'customer'] as const) {
      const doc = await buildActivityReport(scope(), { kind, actionLabel: (a) => ACTION[a] ?? a, tableLabel: (t) => t ?? '—', predicate: () => true, applyFilters: false });
      expectCatalogMatches(doc, ACTIVITY_REPORT_GROUPS);
      expect(doc.title).toBe(kind === 'staff' ? 'تقرير سجل نشاط المشرفين' : 'تقرير سجل نشاط العملاء');
    }
  });
  it('customers (the period columns only exist for a period)', async () => {
    const period = ['طلبات الفترة', 'إنفاق الفترة', 'عميل جديد'];
    expectCatalogMatches(await buildCustomersReport(scope('thisMonth'), { customers: [], keepOrder: true }), CUSTOMERS_REPORT_GROUPS);
    expectCatalogMatches(await buildCustomersReport(scope('all'), { customers: [], keepOrder: true }), CUSTOMERS_REPORT_GROUPS, { customers: period });
  });
});

describe('a real orders report with the owner\'s choices applied', () => {
  const order = (id: string, over: Record<string, unknown> = {}) => ({
    id, user_id: null, country_id: null, status: 'تم التوصيل', payment_status: 'مدفوع', total_price: 100, shipping_cost: 20, discount_amount: 5, coupon_id: null, shipping_company_id: null,
    tracking_number: null, shipping_address: { full_name: 'أحمد', phone: '0100', governorate: 'القاهرة', city: 'مدينة نصر' }, created_at: '2026-11-10T10:00:00Z', profiles: null, countries: null,
    coupons: null, payment_methods: { method_name: 'بطاقة' }, shipping_companies: null,
    order_items: [{ product_id: 'p', variant_id: 'v', quantity: 2, price_per_item: 40, discount_per_item: null, is_digital: false, products: { id: 'p', title: 'قواعد النحو', author: null, cost_price: 10 }, product_variants: { variant_name: 'ورق' }, order_item_components: null }],
    ...over,
  });

  it('drops the columns that are off with their cells and totals, drops a sheet that is off, and the sums that stay are right', async () => {
    vi.mocked(fetchReportOrders).mockResolvedValueOnce([order('o1'), order('o2', { total_price: 50.5, shipping_cost: 10, status: 'ملغي' })] as never);
    const doc = await buildOrdersReport(scope());
    const groups = ORDERS_REPORT_GROUPS;
    let d = setColumn(groups, {}, 'orders', 'العميل', false);
    d = setColumn(groups, d, 'orders', 'الشحن', false);
    d = setColumn(groups, d, 'orders', 'الكتب', false);
    d = setGroupEnabled(groups, d, 'byPayment', false);
    const out = applyColumnChoices(doc, groups, resolveSelection(groups, d));

    expect(out.sections.map((s) => s.title)).toEqual(['سجل الطلبات', 'ملخص حسب حالة الطلب']);
    const log = out.sections[0];
    const headers = log.columns.map((c) => c.header);
    for (const gone of ['العميل', 'الشحن (ج.م)', 'الكتب']) expect(headers).not.toContain(gone);
    expect(headers).toContain('الإجمالي (ج.م)');
    // the cells and the totals are still those of their own column
    const at = (h: string) => headers.indexOf(h);
    expect(log.rows).toHaveLength(2);
    expect(log.rows.map((r) => r.cells[at('رقم الطلب')]).sort()).toEqual(['o1', 'o2']);
    expect(log.totals![at('الإجمالي (ج.م)')]).toBe(150.5);
    expect(log.totals![at('النسخ')]).toBe(4);
    expect(log.totals![0]).toBe('الإجمالي (2)');
    expect(log.rows.every((r) => r.cells.length === headers.length && r.tones.length === headers.length)).toBe(true);
  });
});
