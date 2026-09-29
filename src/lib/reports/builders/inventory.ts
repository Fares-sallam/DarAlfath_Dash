import type { AlertLevel, EnrichedInventoryRow } from '@/hooks/useInventory';
import { makeSection, type ReportDocument, type Tone } from '../types';
import { fetchReportOrders, movementKey, stockMovementByVariant } from '../data';
import { countryRef, filterMeta, money, scopeMeta, type ReportScope } from './common';

const ALERT_TONE: Record<AlertLevel, Tone> = { 'حرج': 'bad', 'منخفض': 'warn', 'جيد': 'good', 'رقمي': 'accent' };
const ALERT_ORDER: Record<AlertLevel, number> = { 'حرج': 0, 'منخفض': 1, 'جيد': 2, 'رقمي': 3 };

export async function buildInventoryReport(
  scope: ReportScope,
  opts: { rows: EnrichedInventoryRow[]; keepOrder: boolean; filtersLabel?: string }
): Promise<ReportDocument> {
  const orders = await fetchReportOrders(scope.period, countryRef(scope));
  const moved = stockMovementByVariant(orders);

  const rows = opts.keepOrder
    ? opts.rows
    : [...opts.rows].sort(
        (a, b) =>
          ALERT_ORDER[a.alertLevel] - ALERT_ORDER[b.alertLevel] ||
          (a.products?.title ?? '').localeCompare(b.products?.title ?? '', 'ar')
      );

  const physical = rows.filter((r) => !r.isDigital);
  const sold = (r: EnrichedInventoryRow) => moved.get(movementKey(r.variant_id, r.product_id) ?? '') ?? 0;
  const cost = (r: EnrichedInventoryRow) => Number(r.product_variants?.cost_price ?? r.products?.cost_price ?? 0) || 0;
  const price = (r: EnrichedInventoryRow) =>
    Number(r.product_variants?.price ?? r.products?.sale_price ?? r.products?.base_price ?? 0) || 0;
  const level = (l: AlertLevel) => rows.filter((r) => r.alertLevel === l).length;
  const restock = physical
    .filter((r) => r.alertLevel === 'حرج' || r.alertLevel === 'منخفض')
    .sort((a, b) => a.availableStock - b.availableStock);

  const title = (r: EnrichedInventoryRow) => r.products?.title ?? '—';
  const variant = (r: EnrichedInventoryRow) => r.product_variants?.variant_name ?? 'أساسي';
  const phys = <T,>(r: EnrichedInventoryRow, v: T) => (r.isDigital ? null : v);

  return {
    title: 'تقرير المخزون',
    fileBase: 'تقرير-المخزون',
    period: scope.period,
    generatedAt: scope.generatedAt,
    currencySymbol: scope.currencySymbol,
    landscape: true,
    meta: scopeMeta(scope, [
      { label: 'أرصدة المخزون', value: 'لحظة التنزيل' },
      ...filterMeta(opts.keepOrder, opts.filtersLabel),
    ]),
    summary: [
      { label: 'النسخ المسجلة', value: rows.length, type: 'number' },
      { label: 'إجمالي الوحدات بالمخزن', value: physical.reduce((s, r) => s + r.stock, 0), type: 'number' },
      { label: 'المحجوز لطلبات قائمة', value: physical.reduce((s, r) => s + r.reserved_stock, 0), type: 'number' },
      { label: 'المتاح للبيع', value: physical.reduce((s, r) => s + r.availableStock, 0), type: 'number' },
      { label: 'حرج', value: level('حرج'), type: 'number', tone: level('حرج') ? 'bad' : undefined },
      { label: 'منخفض', value: level('منخفض'), type: 'number', tone: level('منخفض') ? 'warn' : undefined },
      { label: 'جيد', value: level('جيد'), type: 'number', tone: 'good' },
      { label: 'نسخ رقمية', value: level('رقمي'), type: 'number', tone: 'accent' },
      { label: 'قيمة المخزون بسعر التكلفة', value: physical.reduce((s, r) => s + r.stock * cost(r), 0), type: 'money' },
      { label: 'قيمة المخزون بسعر البيع', value: physical.reduce((s, r) => s + r.stock * price(r), 0), type: 'money' },
      { label: 'الوحدات المباعة خلال الفترة', value: physical.reduce((s, r) => s + sold(r), 0), type: 'number' },
    ],
    sections: [
      makeSection('أرصدة المخزون', [
        { header: 'الكتاب', value: title, width: 32 },
        { header: 'المؤلف', value: (r) => r.products?.author ?? '' },
        { header: 'النسخة', value: variant },
        { header: 'النوع', value: (r) => r.product_variants?.variant_type ?? r.products?.type ?? '' },
        { header: 'المخزون الفعلي', type: 'number', total: 'sum', value: (r) => phys(r, r.stock) },
        { header: 'المحجوز', type: 'number', total: 'sum', value: (r) => phys(r, r.reserved_stock) },
        { header: 'المتاح', type: 'number', total: 'sum', value: (r) => (r.isDigital ? 'غير محدود' : r.availableStock) },
        { header: 'حد التنبيه', type: 'number', value: (r) => phys(r, r.min_stock) },
        { header: 'الحالة', value: (r) => r.alertLevel, tone: (r) => ALERT_TONE[r.alertLevel] },
        { header: 'المبيع خلال الفترة', type: 'number', total: 'sum', value: (r) => phys(r, sold(r)) },
        { header: money('سعر التكلفة', scope), type: 'money', value: cost },
        { header: money('سعر البيع', scope), type: 'money', value: price },
        { header: money('قيمة المخزون (تكلفة)', scope), type: 'money', total: 'sum', value: (r) => phys(r, r.stock * cost(r)) },
        { header: money('قيمة المخزون (بيع)', scope), type: 'money', total: 'sum', value: (r) => phys(r, r.stock * price(r)) },
        { header: 'آخر تحديث', type: 'date', value: (r) => (r.isVirtual ? null : r.updated_at) },
      ], rows, { emptyText: 'لا توجد نسخ مسجلة' }),
      makeSection('نسخ تحتاج إعادة توريد', [
        { header: 'الكتاب', value: title, width: 32 },
        { header: 'النسخة', value: variant },
        { header: 'المتاح', type: 'number', total: 'sum', value: (r) => r.availableStock },
        { header: 'حد التنبيه', type: 'number', value: (r) => r.min_stock },
        { header: 'النقص عن الحد', type: 'number', total: 'sum', value: (r) => Math.max(0, r.min_stock - r.availableStock) },
        { header: 'المبيع خلال الفترة', type: 'number', total: 'sum', value: sold },
        { header: 'الحالة', value: (r) => r.alertLevel, tone: (r) => ALERT_TONE[r.alertLevel] },
      ], restock, { description: 'مرتبة من الأقل توافرًا', emptyText: 'كل النسخ فوق حد التنبيه' }),
    ],
    notes: [
      'أرصدة المخزون والمحجوز والمتاح تعكس لحظة تنزيل التقرير؛ الفترة المختارة تحدد عمود «المبيع خلال الفترة» فقط.',
      'المبيع يحتسب الطلبات غير الملغاة وغير المرتجعة، والنسخ الخارجة ضمن مجموعات كتب تُحتسب على كتبها.',
      'النسخ الرقمية غير محدودة المخزون، ولا تدخل في مجاميع الكميات أو قيمة المخزون.',
    ],
  };
}
