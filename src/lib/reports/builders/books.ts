import type { Product, ProductVariant } from '@/hooks/useBooks';
import { makeSection, share, type ReportDocument } from '../types';
import { fetchReportOrders, salesByProduct } from '../data';
import { countryRef, filterMeta, money, scopeMeta, type ReportScope } from './common';

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const salePrice = (v: ProductVariant) => num(v.sale_price ?? v.price);
const ownStock = (v: ProductVariant) =>
  v.variant_type === 'رقمي' || v.stock == null ? null : Math.max(0, num(v.stock) - num(v.reserved_stock));

export async function buildBooksReport(
  scope: ReportScope,
  opts: {
    products: Product[];
    keepOrder: boolean;
    filtersLabel?: string;
    /** The books list hit its 300-row query limit. */
    capped?: boolean;
    /** Whole copies of a bundle the current book stock can make (same figure as the books list). */
    bundleAvailable: (p: Product, variantId: string) => number;
  }
): Promise<ReportDocument> {
  const orders = await fetchReportOrders(scope.period, countryRef(scope));
  const { byProduct, byVariant } = salesByProduct(orders);

  const products = opts.keepOrder
    ? opts.products
    : [...opts.products].sort((a, b) => a.title.localeCompare(b.title, 'ar'));

  const kind = (p: Product) => (p.is_bundle ? 'مجموعة' : p.type);
  const series = (p: Product) => (p.product_series ?? []).map((s) => s.book_series?.name).filter(Boolean).join('، ');
  const prices = (p: Product) => (p.product_variants ?? []).map(salePrice).filter((x) => x > 0);
  // A bundle copy has no stock row: it's whatever its books can make.
  const available = (p: Product, v: ProductVariant) => (p.is_bundle ? opts.bundleAvailable(p, v.id) : ownStock(v));
  const stockOf = (p: Product) => {
    const counts = (p.product_variants ?? []).map((v) => available(p, v)).filter((x): x is number => x !== null);
    return counts.length ? counts.reduce((s, x) => s + x, 0) : null;
  };

  const variants = products.flatMap((p) => (p.product_variants ?? []).map((v) => ({ p, v })));
  const unpriced = variants.filter(({ v }) => salePrice(v) <= 0).length;
  const periodUnits = products.reduce((s, p) => s + (byProduct.get(p.id)?.units ?? 0), 0);
  const periodRevenue = products.reduce((s, p) => s + (byProduct.get(p.id)?.revenue ?? 0), 0);
  const best = [...products].sort((a, b) => (byProduct.get(b.id)?.units ?? 0) - (byProduct.get(a.id)?.units ?? 0))[0];

  return {
    title: 'تقرير الكتب',
    fileBase: 'تقرير-الكتب',
    period: scope.period,
    generatedAt: scope.generatedAt,
    currencySymbol: scope.currencySymbol,
    landscape: true,
    meta: scopeMeta(scope, filterMeta(opts.keepOrder, opts.filtersLabel)),
    summary: [
      { label: 'عدد الكتب', value: products.length, type: 'number' },
      { label: 'نشطة', value: products.filter((p) => p.is_active).length, type: 'number', tone: 'good' },
      { label: 'مخفية', value: products.filter((p) => !p.is_active).length, type: 'number', tone: 'muted' },
      { label: 'مجموعات كتب', value: products.filter((p) => p.is_bundle).length, type: 'number', tone: 'accent' },
      { label: 'عدد النسخ', value: variants.length, type: 'number' },
      { label: 'نسخ بدون سعر في هذه الدولة', value: unpriced, type: 'number', tone: unpriced ? 'warn' : undefined },
      { label: 'النسخ المباعة خلال الفترة', value: periodUnits, type: 'number' },
      { label: 'مبيعات الكتب خلال الفترة', value: periodRevenue, type: 'money' },
      { label: 'الأكثر مبيعًا خلال الفترة', value: best && byProduct.get(best.id)?.units ? best.title : '—' },
    ],
    sections: [
      makeSection('قائمة الكتب', [
        { header: 'الكتاب', value: (p) => p.title, width: 34 },
        { header: 'المؤلف', value: (p) => p.author },
        { header: 'النوع', value: kind, tone: (p) => (p.is_bundle ? 'accent' : undefined) },
        { header: 'التصنيف', value: (p) => p.categories?.name ?? '' },
        { header: 'السلاسل', value: series },
        { header: 'عدد النسخ', type: 'number', value: (p) => (p.product_variants ?? []).length },
        { header: money('أقل سعر بيع', scope), type: 'money', value: (p) => (prices(p).length ? Math.min(...prices(p)) : null) },
        { header: money('أعلى سعر بيع', scope), type: 'money', value: (p) => (prices(p).length ? Math.max(...prices(p)) : null) },
        { header: 'المتاح بالمخزن', type: 'number', total: 'sum', value: stockOf },
        { header: 'المبيع خلال الفترة', type: 'number', total: 'sum', value: (p) => byProduct.get(p.id)?.units ?? 0 },
        { header: money('مبيعات الفترة', scope), type: 'money', total: 'sum', value: (p) => byProduct.get(p.id)?.revenue ?? 0 },
        { header: 'الحالة', value: (p) => (p.is_active ? 'نشط' : 'مخفي'), tone: (p) => (p.is_active ? 'good' : 'muted') },
        { header: 'ISBN', value: (p) => p.isbn ?? '' },
        { header: 'تاريخ الإضافة', type: 'date', value: (p) => p.created_at },
      ], products, { emptyText: 'لا توجد كتب' }),
      makeSection('النسخ والأسعار', [
        { header: 'الكتاب', value: ({ p }) => p.title, width: 34 },
        { header: 'النسخة', value: ({ v }) => v.variant_name },
        { header: 'النوع', value: ({ v }) => v.variant_type },
        { header: 'SKU', value: ({ v }) => v.sku ?? '' },
        { header: money('سعر التكلفة', scope), type: 'money', value: ({ v }) => num(v.cost_price) },
        { header: money('السعر قبل الخصم', scope), type: 'money', value: ({ v }) => num(v.base_price) || null },
        { header: money('سعر البيع', scope), type: 'money', value: ({ v }) => salePrice(v) || null, tone: ({ v }) => (salePrice(v) ? undefined : 'warn') },
        {
          header: 'الخصم',
          type: 'percent',
          value: ({ v }) => {
            const base = num(v.base_price);
            const sale = salePrice(v);
            return base > 0 && sale > 0 && sale < base ? share(base - sale, base) : null;
          },
        },
        {
          header: money('ربح النسخة', scope),
          type: 'money',
          value: ({ v }) => (salePrice(v) ? salePrice(v) - num(v.cost_price) : null),
          tone: ({ v }) => (salePrice(v) && salePrice(v) - num(v.cost_price) < 0 ? 'bad' : undefined),
        },
        { header: 'الوزن (كجم)', type: 'number', value: ({ v }) => (v.variant_type === 'رقمي' ? null : num(v.weight_kg) || null) },
        { header: 'المتاح', type: 'number', total: 'sum', value: ({ p, v }) => available(p, v) },
        { header: 'المبيع خلال الفترة', type: 'number', total: 'sum', value: ({ v }) => byVariant.get(v.id)?.units ?? 0 },
        { header: money('مبيعات الفترة', scope), type: 'money', total: 'sum', value: ({ v }) => byVariant.get(v.id)?.revenue ?? 0 },
      ], variants, { emptyText: 'لا توجد نسخ' }),
    ],
    notes: [
      'الأسعار والمخزون للدولة المختارة لحظة التنزيل؛ الفترة المختارة تحدد أعمدة المبيعات فقط.',
      'المبيعات تستبعد الطلبات الملغاة والمرتجعة. المجموعة تُحتسب مبيعاتها باسمها، ومتاحها = عدد المجموعات التي يكفيها مخزون كتبها.',
      ...(opts.capped ? ['تعرض صفحة الكتب أحدث 300 كتاب فقط، وهذا التقرير مبني على نفس القائمة.'] : []),
    ],
  };
}
