import type { Product, ProductVariant } from '@/hooks/useBooks';
import { makeSection, share, type ReportColumn, type ReportDocument } from '../types';
import { fetchReportOrders, salesByProduct } from '../data';
import { pickColumns, resolveSelection, type ColumnGroup, type ColumnSelection } from '../columnChoices';
import { SALE_CHANNEL_LABELS } from '@/lib/saleChannel';
import { countryRef, filterMeta, money, scopeMeta, type ReportScope } from './common';

/**
 * The columns of the books report the owner can choose (the chips in «تنزيل تقرير»), one group per sheet, in the order they
 * appear. The standard hides the book's lowest and highest selling price and the period's sales revenue, and shows the cost.
 */
export const BOOKS_REPORT_GROUPS: readonly ColumnGroup[] = [
  {
    id: 'books',
    title: 'ورقة «قائمة الكتب»',
    choices: [
      { id: 'title', label: 'الكتاب', defaultOn: true, locked: true },
      { id: 'author', label: 'المؤلف', defaultOn: true },
      { id: 'kind', label: 'النوع', defaultOn: true },
      { id: 'category', label: 'التصنيف', defaultOn: true },
      { id: 'series', label: 'السلاسل', defaultOn: true },
      { id: 'copies', label: 'عدد النسخ', defaultOn: true },
      { id: 'cost', label: 'سعر التكلفة', defaultOn: true, hint: 'لو للكتاب أكتر من نسخة بتكلفة مختلفة بيظهر الأقل (تكلفة كل نسخة في ورقة النسخ)' },
      { id: 'minPrice', label: 'أقل سعر بيع', defaultOn: false },
      { id: 'maxPrice', label: 'أعلى سعر بيع', defaultOn: false },
      { id: 'stock', label: 'المتاح بالمخزن', defaultOn: true },
      { id: 'unitsSold', label: 'المبيع خلال الفترة', defaultOn: true },
      { id: 'revenue', label: 'مبيعات الفترة', defaultOn: false },
      { id: 'status', label: 'الحالة', defaultOn: true },
      { id: 'isbn', label: 'ISBN', defaultOn: true },
      { id: 'createdAt', label: 'تاريخ الإضافة', defaultOn: true },
      // available to choose, not shown unless chosen
      { id: 'publisher', label: 'الناشر', defaultOn: false },
      { id: 'year', label: 'سنة النشر', defaultOn: false },
      { id: 'pages', label: 'عدد الصفحات', defaultOn: false },
      { id: 'description', label: 'وصف الكتاب', defaultOn: false },
      { id: 'keywords', label: 'الكلمات المفتاحية', defaultOn: false },
      { id: 'skus', label: 'SKU (كل النسخ)', defaultOn: false },
      { id: 'updatedAt', label: 'تاريخ آخر تعديل', defaultOn: false },
      { id: 'extraCategories', label: 'تصنيفات إضافية', defaultOn: false },
      { id: 'copyNames', label: 'أسماء النسخ', defaultOn: false },
      { id: 'weight', label: 'الوزن (كجم)', defaultOn: false, hint: 'لو النسخ بأوزان مختلفة بيظهر المدى' },
      { id: 'basePrice', label: 'السعر قبل الخصم', defaultOn: false, hint: 'أقل سعر قبل الخصم بين النسخ' },
      { id: 'discount', label: 'أعلى خصم', defaultOn: false },
      { id: 'ebookFormat', label: 'صيغة الملف الإلكتروني', defaultOn: false },
      { id: 'ebookSize', label: 'حجم الملف الإلكتروني (MB)', defaultOn: false },
      { id: 'cover', label: 'رابط الغلاف', defaultOn: false },
      { id: 'bundleItems', label: 'محتويات المجموعة', defaultOn: false },
    ],
  },
  {
    id: 'copies',
    title: 'ورقة «النسخ والأسعار»',
    optional: true,
    choices: [
      { id: 'book', label: 'الكتاب', defaultOn: true, locked: true },
      { id: 'copy', label: 'النسخة', defaultOn: true },
      { id: 'kind', label: 'النوع', defaultOn: true },
      { id: 'sku', label: 'SKU', defaultOn: true },
      { id: 'cost', label: 'سعر التكلفة', defaultOn: true },
      { id: 'basePrice', label: 'السعر قبل الخصم', defaultOn: true },
      { id: 'salePrice', label: 'سعر البيع', defaultOn: true },
      { id: 'discount', label: 'الخصم', defaultOn: true },
      { id: 'profit', label: 'ربح النسخة', defaultOn: true },
      { id: 'weight', label: 'الوزن (كجم)', defaultOn: true },
      { id: 'available', label: 'المتاح', defaultOn: true },
      { id: 'unitsSold', label: 'المبيع خلال الفترة', defaultOn: true },
      { id: 'revenue', label: 'مبيعات الفترة', defaultOn: true },
      { id: 'saleChannel', label: 'قناة الخصم', defaultOn: false },
      { id: 'reserved', label: 'المحجوز', defaultOn: false },
      { id: 'iap', label: 'معرّف الشراء داخل التطبيق', defaultOn: false },
    ],
  },
];

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const salePrice = (v: ProductVariant) => num(v.sale_price ?? v.price);
// A book's cost is the lowest cost among its copies (the same figure the books list keeps for the book).
const costOf = (p: Product) => {
  const costs = (p.product_variants ?? []).map((v) => Number(v.cost_price)).filter((x) => Number.isFinite(x));
  if (costs.length) return Math.min(...costs);
  return Number.isFinite(Number(p.cost_price)) ? Number(p.cost_price) : null;
};
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
    /** The columns the owner chose (the standard ones when omitted). */
    columns?: ColumnSelection;
    /** A book's title by id, for «محتويات المجموعة» (the books of a bundle may not be in `products`, e.g. when filtered). */
    titleOf?: (productId: string) => string | undefined;
  }
): Promise<ReportDocument> {
  const selection = opts.columns ?? resolveSelection(BOOKS_REPORT_GROUPS);
  const listSel = selection.books;
  const copySel = selection.copies;
  const SALES = ['unitsSold', 'revenue'];
  // The period only matters for the sales columns: with none of them chosen nothing is read from the orders.
  const salesShown = SALES.some((id) => listSel.ids.has(id)) || (copySel.enabled && SALES.some((id) => copySel.ids.has(id)));
  const orders = salesShown ? await fetchReportOrders(scope.period, countryRef(scope)) : [];
  const { byProduct, byVariant } = salesByProduct(orders);

  const products = opts.keepOrder
    ? opts.products
    : [...opts.products].sort((a, b) => a.title.localeCompare(b.title, 'ar'));

  const kind = (p: Product) => (p.is_bundle ? 'مجموعة' : p.type);
  const titles = new Map(opts.products.map((p) => [p.id, p.title]));
  const titleOfBook = (id: string) => opts.titleOf?.(id) ?? titles.get(id) ?? '(كتاب محذوف)';
  /** What a bundle holds: its books (with the count when more than one of a book), once even if several copies of the bundle list them. */
  const bundleBooks = (p: Product) => {
    const seen = new Map<string, number>();
    for (const item of p.bundle_items ?? []) seen.set(item.component_product_id, Math.max(seen.get(item.component_product_id) ?? 0, item.quantity ?? 1));
    return [...seen].map(([id, qty]) => (qty > 1 ? `${titleOfBook(id)} ×${qty}` : titleOfBook(id))).join('، ');
  };
  const physicalWeights = (p: Product) =>
    (p.product_variants ?? []).filter((v) => v.variant_type !== 'رقمي').map((v) => num(v.weight_kg)).filter((w) => w > 0);
  const weightText = (p: Product) => {
    const w = physicalWeights(p);
    if (!w.length) return '';
    const lo = Math.min(...w);
    const hi = Math.max(...w);
    return lo === hi ? String(lo) : `${lo} - ${hi}`;
  };
  const basePrices = (p: Product) => (p.product_variants ?? []).map((v) => num(v.base_price)).filter((x) => x > 0);
  const topDiscount = (p: Product) => {
    const ds = (p.product_variants ?? []).map((v) => {
      const base = num(v.base_price);
      const sale = salePrice(v);
      return base > 0 && sale > 0 && sale < base ? share(base - sale, base) : 0;
    });
    return ds.length && Math.max(...ds) > 0 ? Math.max(...ds) : null;
  };
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
      ...(salesShown
        ? [
            { label: 'النسخ المباعة خلال الفترة', value: periodUnits, type: 'number' as const },
            { label: 'مبيعات الكتب خلال الفترة', value: periodRevenue, type: 'money' as const },
            { label: 'الأكثر مبيعًا خلال الفترة', value: best && byProduct.get(best.id)?.units ? best.title : '—' },
          ]
        : []),
    ],
    sections: [
      makeSection('قائمة الكتب', pickColumns<ReportColumn<Product> & { id: string }>([
        { id: 'title', header: 'الكتاب', value: (p) => p.title, width: 34 },
        { id: 'author', header: 'المؤلف', value: (p) => p.author },
        { id: 'kind', header: 'النوع', value: kind, tone: (p) => (p.is_bundle ? 'accent' : undefined) },
        { id: 'category', header: 'التصنيف', value: (p) => p.categories?.name ?? '' },
        { id: 'series', header: 'السلاسل', value: series },
        { id: 'copies', header: 'عدد النسخ', type: 'number', value: (p) => (p.product_variants ?? []).length },
        { id: 'cost', header: money('سعر التكلفة', scope), type: 'money', value: costOf },
        { id: 'minPrice', header: money('أقل سعر بيع', scope), type: 'money', value: (p) => (prices(p).length ? Math.min(...prices(p)) : null) },
        { id: 'maxPrice', header: money('أعلى سعر بيع', scope), type: 'money', value: (p) => (prices(p).length ? Math.max(...prices(p)) : null) },
        { id: 'stock', header: 'المتاح بالمخزن', type: 'number', total: 'sum', value: stockOf },
        { id: 'unitsSold', header: 'المبيع خلال الفترة', type: 'number', total: 'sum', value: (p) => byProduct.get(p.id)?.units ?? 0 },
        { id: 'revenue', header: money('مبيعات الفترة', scope), type: 'money', total: 'sum', value: (p) => byProduct.get(p.id)?.revenue ?? 0 },
        { id: 'status', header: 'الحالة', value: (p) => (p.is_active ? 'نشط' : 'مخفي'), tone: (p) => (p.is_active ? 'good' : 'muted') },
        { id: 'isbn', header: 'ISBN', value: (p) => p.isbn ?? '' },
        { id: 'createdAt', header: 'تاريخ الإضافة', type: 'date', value: (p) => p.created_at },
        { id: 'publisher', header: 'الناشر', value: (p) => p.publisher ?? '' },
        { id: 'year', header: 'سنة النشر', value: (p) => (p.publication_year ? String(p.publication_year) : '') },
        { id: 'pages', header: 'عدد الصفحات', type: 'number', value: (p) => p.page_count ?? null },
        { id: 'description', header: 'وصف الكتاب', width: 60, value: (p) => p.description ?? '' },
        { id: 'keywords', header: 'الكلمات المفتاحية', value: (p) => (p.keywords ?? []).join('، ') },
        { id: 'skus', header: 'SKU (كل النسخ)', value: (p) => (p.product_variants ?? []).map((v) => v.sku).filter(Boolean).join('، ') },
        { id: 'updatedAt', header: 'تاريخ آخر تعديل', type: 'date', value: (p) => p.updated_at },
        { id: 'extraCategories', header: 'تصنيفات إضافية', value: (p) => (p.product_categories ?? []).map((c) => c.categories?.name).filter(Boolean).join('، ') },
        { id: 'copyNames', header: 'أسماء النسخ', value: (p) => (p.product_variants ?? []).map((v) => v.variant_name).filter(Boolean).join('، ') },
        { id: 'weight', header: 'الوزن (كجم)', value: weightText },
        { id: 'basePrice', header: money('السعر قبل الخصم', scope), type: 'money', value: (p) => (basePrices(p).length ? Math.min(...basePrices(p)) : null) },
        { id: 'discount', header: 'أعلى خصم', type: 'percent', value: topDiscount },
        { id: 'ebookFormat', header: 'صيغة الملف الإلكتروني', value: (p) => p.electronic_books?.file_format ?? '' },
        { id: 'ebookSize', header: 'حجم الملف الإلكتروني (MB)', type: 'number', value: (p) => p.electronic_books?.file_size_mb ?? null },
        { id: 'cover', header: 'رابط الغلاف', value: (p) => p.cover_url ?? '' },
        { id: 'bundleItems', header: 'محتويات المجموعة', width: 40, value: (p) => (p.is_bundle ? bundleBooks(p) : '') },
      ], listSel), products, { emptyText: 'لا توجد كتب' }),
      ...(copySel.enabled
        ? [makeSection('النسخ والأسعار', pickColumns<ReportColumn<{ p: Product; v: ProductVariant }> & { id: string }>([
            { id: 'book', header: 'الكتاب', value: ({ p }) => p.title, width: 34 },
            { id: 'copy', header: 'النسخة', value: ({ v }) => v.variant_name },
            { id: 'kind', header: 'النوع', value: ({ v }) => v.variant_type },
            { id: 'sku', header: 'SKU', value: ({ v }) => v.sku ?? '' },
            { id: 'cost', header: money('سعر التكلفة', scope), type: 'money', value: ({ v }) => num(v.cost_price) },
            { id: 'basePrice', header: money('السعر قبل الخصم', scope), type: 'money', value: ({ v }) => num(v.base_price) || null },
            { id: 'salePrice', header: money('سعر البيع', scope), type: 'money', value: ({ v }) => salePrice(v) || null, tone: ({ v }) => (salePrice(v) ? undefined : 'warn') },
            {
              id: 'discount',
              header: 'الخصم',
              type: 'percent',
              value: ({ v }) => {
                const base = num(v.base_price);
                const sale = salePrice(v);
                return base > 0 && sale > 0 && sale < base ? share(base - sale, base) : null;
              },
            },
            {
              id: 'profit',
              header: money('ربح النسخة', scope),
              type: 'money',
              value: ({ v }) => (salePrice(v) ? salePrice(v) - num(v.cost_price) : null),
              tone: ({ v }) => (salePrice(v) && salePrice(v) - num(v.cost_price) < 0 ? 'bad' : undefined),
            },
            { id: 'weight', header: 'الوزن (كجم)', type: 'number', value: ({ v }) => (v.variant_type === 'رقمي' ? null : num(v.weight_kg) || null) },
            { id: 'available', header: 'المتاح', type: 'number', total: 'sum', value: ({ p, v }) => available(p, v) },
            { id: 'unitsSold', header: 'المبيع خلال الفترة', type: 'number', total: 'sum', value: ({ v }) => byVariant.get(v.id)?.units ?? 0 },
            { id: 'revenue', header: money('مبيعات الفترة', scope), type: 'money', total: 'sum', value: ({ v }) => byVariant.get(v.id)?.revenue ?? 0 },
            { id: 'saleChannel', header: 'قناة الخصم', value: ({ v }) => SALE_CHANNEL_LABELS[v.sale_channel ?? 'all'] ?? '' },
            { id: 'reserved', header: 'المحجوز', type: 'number', total: 'sum', value: ({ p, v }) => (p.is_bundle || v.variant_type === 'رقمي' ? null : num(v.reserved_stock)) },
            { id: 'iap', header: 'معرّف الشراء داخل التطبيق', value: ({ v }) => v.iap_product_id ?? '' },
          ], copySel), variants, { emptyText: 'لا توجد نسخ' })]
        : []),
    ],
    notes: [
      salesShown
        ? 'الأسعار والمخزون للدولة المختارة لحظة التنزيل؛ الفترة المختارة تحدد أعمدة المبيعات فقط.'
        : 'الأسعار والمخزون للدولة المختارة لحظة التنزيل.',
      ...(salesShown
        ? ['المبيعات تستبعد الطلبات الملغاة والمرتجعة. المجموعة تُحتسب مبيعاتها باسمها، ومتاحها = عدد المجموعات التي يكفيها مخزون كتبها.']
        : []),
      ...(listSel.ids.has('cost') ? ['سعر التكلفة للكتاب = أقل تكلفة بين نسخه؛ تكلفة كل نسخة في ورقة «النسخ والأسعار».'] : []),
      ...(opts.capped ? ['تعرض صفحة الكتب أحدث 300 كتاب فقط، وهذا التقرير مبني على نفس القائمة.'] : []),
    ],
  };
}
