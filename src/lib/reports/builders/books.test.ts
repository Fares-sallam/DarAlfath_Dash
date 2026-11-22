import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/hooks/useBooks';
import { resolvePeriod } from '../period';
import { resolveSelection, setAll, setColumn, setGroupEnabled } from '../columnChoices';

const fetchReportOrders = vi.fn(async () => [] as unknown[]);
vi.mock('../data', async (importOriginal) => ({ ...(await importOriginal<typeof import('../data')>()), fetchReportOrders: (...a: unknown[]) => fetchReportOrders(...(a as [])) }));

import { BOOKS_REPORT_GROUPS, buildBooksReport } from './books';

const now = new Date(2026, 10, 22, 14, 5);
const scope = { period: resolvePeriod({ preset: 'thisMonth' }, now), generatedAt: now, country: null, currencySymbol: 'ج.م' };

const variant = (id: string, over: Record<string, unknown> = {}) => ({
  id, product_id: 'p', variant_name: 'ورق عادي', variant_type: 'مادي', sku: null, price: 80, cost_price: 30, base_price: 100, sale_price: 80, sale_channel: 'all', stock: 10, reserved_stock: 2, weight_kg: 0.4, iap_product_id: null, ...over,
});
const book = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id, title, author: 'مؤلف', publisher: 'دار الفتح', publication_year: 2025, page_count: 120, description: 'وصف', cover_url: 'https://x.example/c.png', isbn: '9780000000001', keywords: ['نحو', 'لغة'],
  type: 'ورقي', cost_price: 30, base_price: 100, is_active: true, is_bundle: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z',
  categories: { id: 'c1', name: 'النحو' }, product_series: [], product_categories: [{ category_id: 'c2', categories: { id: 'c2', name: 'تعليم' } }], bundle_items: [], electronic_books: null, product_variants: [], ...over,
}) as unknown as Product;

const products: Product[] = [
  book('b1', 'قواعد النحو', {
    product_variants: [
      variant('v1', { sku: 'N-P', cost_price: 30, weight_kg: 0.35, sale_price: 80, base_price: 100 }),
      variant('v2', { variant_name: 'مقاس 24*17', sku: 'N-L', cost_price: 45, weight_kg: 0.5, sale_price: 120, base_price: 120 }),
      variant('v3', { variant_name: 'نسخة إلكترونية', variant_type: 'رقمي', sku: 'N-E', cost_price: 12, weight_kg: 0, sale_price: 50, base_price: 50, iap_product_id: 'iap.nahw', sale_channel: 'app' }),
    ],
    electronic_books: { id: 'e1', product_id: 'b1', file_format: 'PDF', file_size_mb: 12.5, protected: true, watermark: false },
  }),
  book('b2', 'مجموعة اللغة', {
    is_bundle: true, cost_price: 90,
    bundle_items: [
      { bundle_variant_id: 'v9', component_variant_id: 'v1', component_product_id: 'b1', quantity: 2, sort_order: 0 },
      { bundle_variant_id: 'v10', component_variant_id: 'v1', component_product_id: 'b1', quantity: 2, sort_order: 0 },
      { bundle_variant_id: 'v9', component_variant_id: 'x', component_product_id: 'gone', quantity: 1, sort_order: 1 },
    ],
    product_variants: [variant('v9', { cost_price: 90, sale_price: 200, base_price: 200 })],
  }),
];

const run = (columns = resolveSelection(BOOKS_REPORT_GROUPS)) =>
  buildBooksReport(scope, { products, keepOrder: true, bundleAvailable: () => 3, columns });
const headers = (doc: Awaited<ReturnType<typeof run>>, i: number) => doc.sections[i].columns.map((c) => c.header);

beforeEach(() => fetchReportOrders.mockClear());

describe('the books report columns', () => {
  it('shows by default the cost price and not the lowest / highest selling price or the period\'s sales revenue', async () => {
    const doc = await run();
    const h = headers(doc, 0);
    expect(h).toContain('سعر التكلفة (ج.م)');
    expect(h).toContain('المبيع خلال الفترة');
    for (const gone of ['أقل سعر بيع (ج.م)', 'أعلى سعر بيع (ج.م)', 'مبيعات الفترة (ج.م)']) expect(h).not.toContain(gone);
    // the sheet of copies is there, with its cost too
    expect(doc.sections).toHaveLength(2);
    expect(headers(doc, 1)).toContain('سعر التكلفة (ج.م)');
  });

  it('a book\'s cost is its lowest copy cost', async () => {
    const doc = await run();
    const at = headers(doc, 0).indexOf('سعر التكلفة (ج.م)');
    expect(doc.sections[0].rows.map((r) => r.cells[at])).toEqual([12, 90]);
  });

  it('a column that is off is not in the file at all, and the cells line up with the columns', async () => {
    const groups = BOOKS_REPORT_GROUPS;
    let d = setColumn(groups, {}, 'books', 'author', false);
    d = setColumn(groups, d, 'books', 'isbn', false);
    d = setColumn(groups, d, 'books', 'minPrice', true);
    const doc = await run(resolveSelection(groups, d));
    const h = headers(doc, 0);
    expect(h).not.toContain('المؤلف');
    expect(h).not.toContain('ISBN');
    expect(h).toContain('أقل سعر بيع (ج.م)');
    expect(h).toHaveLength(doc.sections[0].rows[0].cells.length);
    expect(doc.sections[0].rows[0].cells[h.indexOf('أقل سعر بيع (ج.م)')]).toBe(50); // the cheapest copy sells at 50
  });

  it('can show every column there is: each button of the catalog makes a column, in the catalog\'s order', async () => {
    let d = setAll(BOOKS_REPORT_GROUPS, {}, 'books', 'all');
    d = setAll(BOOKS_REPORT_GROUPS, d, 'copies', 'all');
    const doc = await run(resolveSelection(BOOKS_REPORT_GROUPS, d));
    expect(headers(doc, 0)).toHaveLength(BOOKS_REPORT_GROUPS[0].choices.length);
    expect(headers(doc, 1)).toHaveLength(BOOKS_REPORT_GROUPS[1].choices.length);
    expect(headers(doc, 0).slice(0, 3)).toEqual(['الكتاب', 'المؤلف', 'النوع']);
  });

  it('fills the extra columns: publisher, year, pages, description, keywords, SKUs, other categories, copy names, weight, base price, discount, e-book file, cover, bundle books', async () => {
    const d = setAll(BOOKS_REPORT_GROUPS, {}, 'books', 'all');
    const doc = await run(resolveSelection(BOOKS_REPORT_GROUPS, d));
    const h = headers(doc, 0);
    const cell = (row: number, header: string) => doc.sections[0].rows[row].cells[h.indexOf(header)];
    expect(cell(0, 'الناشر')).toBe('دار الفتح');
    expect(cell(0, 'سنة النشر')).toBe('2025');
    expect(cell(0, 'عدد الصفحات')).toBe(120);
    expect(cell(0, 'وصف الكتاب')).toBe('وصف');
    expect(cell(0, 'الكلمات المفتاحية')).toBe('نحو، لغة');
    expect(cell(0, 'SKU (كل النسخ)')).toBe('N-P، N-L، N-E');
    expect(cell(0, 'تصنيفات إضافية')).toBe('تعليم');
    expect(cell(0, 'أسماء النسخ')).toBe('ورق عادي، مقاس 24*17، نسخة إلكترونية');
    expect(cell(0, 'الوزن (كجم)')).toBe('0.35 - 0.5');
    expect(cell(0, 'السعر قبل الخصم (ج.م)')).toBe(50);
    expect(cell(0, 'أعلى خصم')).toBe(20);
    expect(cell(0, 'صيغة الملف الإلكتروني')).toBe('PDF');
    expect(cell(0, 'حجم الملف الإلكتروني (MB)')).toBe(12.5);
    expect(cell(0, 'رابط الغلاف')).toBe('https://x.example/c.png');
    expect(cell(0, 'محتويات المجموعة')).toBe(''); // a book that is not a bundle
    expect(cell(1, 'محتويات المجموعة')).toBe('قواعد النحو ×2، (كتاب محذوف)'); // each book once, with its count
    expect(cell(1, 'السعر قبل الخصم (ج.م)')).toBe(200);
    expect(cell(1, 'أعلى خصم')).toBeNull();
  });

  it('the sheet of copies can be left out, or carry the extra copy columns', async () => {
    const off = await run(resolveSelection(BOOKS_REPORT_GROUPS, setGroupEnabled(BOOKS_REPORT_GROUPS, {}, 'copies', false)));
    expect(off.sections).toHaveLength(1);
    const on = await run(resolveSelection(BOOKS_REPORT_GROUPS, setAll(BOOKS_REPORT_GROUPS, {}, 'copies', 'all')));
    const h = headers(on, 1);
    const row = (i: number, header: string) => on.sections[1].rows[i].cells[h.indexOf(header)];
    expect(row(0, 'قناة الخصم')).toBe('الموقع والتطبيق');
    expect(row(2, 'قناة الخصم')).toBe('التطبيق فقط');
    expect(row(2, 'معرّف الشراء داخل التطبيق')).toBe('iap.nahw');
    expect(row(0, 'المحجوز')).toBe(2);
    expect(row(2, 'المحجوز')).toBeNull(); // an e-book holds nothing back
  });

  it('reads the orders only when a sales column is shown, and drops the sales figures from the summary otherwise', async () => {
    const standard = await run();
    expect(fetchReportOrders).toHaveBeenCalledTimes(1);
    expect(standard.summary.map((s) => s.label)).toContain('النسخ المباعة خلال الفترة');

    fetchReportOrders.mockClear();
    let d = setColumn(BOOKS_REPORT_GROUPS, {}, 'books', 'unitsSold', false);
    d = setColumn(BOOKS_REPORT_GROUPS, d, 'copies', 'unitsSold', false);
    d = setColumn(BOOKS_REPORT_GROUPS, d, 'copies', 'revenue', false);
    const quiet = await run(resolveSelection(BOOKS_REPORT_GROUPS, d));
    expect(fetchReportOrders).not.toHaveBeenCalled();
    expect(quiet.summary.map((s) => s.label)).not.toContain('النسخ المباعة خلال الفترة');
    expect(quiet.summary.map((s) => s.label)).not.toContain('مبيعات الكتب خلال الفترة');
    expect(quiet.notes.join(' ')).not.toContain('المبيعات تستبعد');
    expect(quiet.notes.join(' ')).toContain('سعر التكلفة للكتاب = أقل تكلفة');

    // the sales revenue of the copies sheet alone is enough to read the orders
    fetchReportOrders.mockClear();
    const copiesOnly = setColumn(BOOKS_REPORT_GROUPS, setColumn(BOOKS_REPORT_GROUPS, {}, 'books', 'unitsSold', false), 'copies', 'unitsSold', false);
    await run(resolveSelection(BOOKS_REPORT_GROUPS, copiesOnly));
    expect(fetchReportOrders).toHaveBeenCalledTimes(1);
  });

  it('the catalog has no repeated button inside a sheet', () => {
    for (const g of BOOKS_REPORT_GROUPS) expect(new Set(g.choices.map((c) => c.id)).size).toBe(g.choices.length);
  });
});
