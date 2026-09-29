import { makeSection, share, type ReportDocument } from '../types';
import {
  customerName,
  customerPhone,
  fetchReportOrders,
  groupOrders,
  isRealOrder,
  orderUnits,
  PAYMENT_TONE,
  STATUS_TONE,
  type ReportOrder,
} from '../data';
import { countryRef, filterMeta, mixedCurrencyNote, money, scopeMeta, type ReportScope } from './common';

const IN_PROGRESS = new Set(['جديد', 'قيد المراجعة', 'تم التأكيد', 'جاري الشحن', 'تم الشحن']);

const address = (o: ReportOrder) =>
  [o.shipping_address?.governorate, o.shipping_address?.city].filter(Boolean).join(' - ');

const booksOf = (o: ReportOrder) =>
  (o.order_items ?? [])
    .map((i) => {
      const name = [i.products?.title, i.product_variants?.variant_name].filter(Boolean).join(' – ') || 'كتاب محذوف';
      return i.quantity > 1 ? `${name} ×${i.quantity}` : name;
    })
    .join('، ');

export async function buildOrdersReport(
  scope: ReportScope,
  opts: { predicate?: (o: ReportOrder) => boolean; filtersLabel?: string } = {}
): Promise<ReportDocument> {
  const all = await fetchReportOrders(scope.period, countryRef(scope));
  const orders = (opts.predicate ? all.filter(opts.predicate) : all).reverse();
  const real = orders.filter(isRealOrder);

  const revenue = real.reduce((s, o) => s + (o.total_price ?? 0), 0);
  const count = (status: string) => orders.filter((o) => o.status === status).length;

  return {
    title: 'تقرير الطلبات',
    fileBase: 'تقرير-الطلبات',
    period: scope.period,
    generatedAt: scope.generatedAt,
    currencySymbol: scope.currencySymbol,
    landscape: true,
    meta: scopeMeta(scope, filterMeta(!!opts.predicate, opts.filtersLabel)),
    summary: [
      { label: 'إجمالي الطلبات', value: orders.length, type: 'number' },
      { label: 'الإيرادات الفعلية', value: revenue, type: 'money' },
      { label: 'متوسط قيمة الطلب', value: real.length ? revenue / real.length : 0, type: 'money' },
      { label: 'تم التوصيل', value: count('تم التوصيل'), type: 'number', tone: 'good' },
      { label: 'قيد التنفيذ', value: orders.filter((o) => IN_PROGRESS.has(o.status)).length, type: 'number', tone: 'info' },
      { label: 'ملغاة', value: count('ملغي'), type: 'number', tone: count('ملغي') ? 'bad' : undefined },
      { label: 'مرتجعة', value: count('مرتجع'), type: 'number', tone: count('مرتجع') ? 'muted' : undefined },
      { label: 'النسخ المطلوبة', value: real.reduce((s, o) => s + orderUnits(o), 0), type: 'number' },
      { label: 'رسوم الشحن', value: real.reduce((s, o) => s + (o.shipping_cost ?? 0), 0), type: 'money' },
      { label: 'الخصومات', value: real.reduce((s, o) => s + (o.discount_amount ?? 0), 0), type: 'money' },
    ],
    sections: [
      makeSection('سجل الطلبات', [
        { header: 'رقم الطلب', value: (o) => o.id, width: 22 },
        { header: 'التاريخ', type: 'datetime', value: (o) => o.created_at },
        { header: 'العميل', value: customerName, width: 22 },
        { header: 'الهاتف', value: customerPhone, width: 14 },
        { header: 'العنوان', value: address, width: 22 },
        { header: 'الكتب', value: booksOf, width: 40 },
        { header: 'النسخ', type: 'number', total: 'sum', value: orderUnits },
        { header: money('الشحن', scope), type: 'money', total: 'sum', value: (o) => o.shipping_cost ?? 0 },
        { header: money('الخصم', scope), type: 'money', total: 'sum', value: (o) => o.discount_amount ?? 0 },
        { header: money('الإجمالي', scope), type: 'money', total: 'sum', value: (o) => o.total_price ?? 0 },
        { header: 'طريقة الدفع', value: (o) => o.payment_methods?.method_name ?? '' },
        { header: 'حالة الدفع', value: (o) => o.payment_status ?? '', tone: (o) => PAYMENT_TONE[o.payment_status ?? ''] },
        { header: 'حالة الطلب', value: (o) => o.status, tone: (o) => STATUS_TONE[o.status] },
        { header: 'شركة الشحن', value: (o) => o.shipping_companies?.company_name ?? '' },
        { header: 'رقم التتبع', value: (o) => o.tracking_number ?? '' },
        { header: 'الكوبون', value: (o) => o.coupons?.code ?? '' },
      ], orders, { emptyText: 'لا توجد طلبات في هذه الفترة' }),
      makeSection('ملخص حسب حالة الطلب', [
        { header: 'الحالة', value: (s) => s.name, tone: (s) => STATUS_TONE[s.name] },
        { header: 'عدد الطلبات', type: 'number', total: 'sum', value: (s) => s.count },
        { header: 'النسبة', type: 'percent', value: (s) => share(s.count, orders.length) },
        { header: money('القيمة', scope), type: 'money', total: 'sum', value: (s) => s.value },
      ], groupOrders(orders, (o) => o.status || 'غير محدد')),
      makeSection('ملخص حسب طريقة الدفع', [
        { header: 'طريقة الدفع', value: (p) => p.name },
        { header: 'عدد الطلبات', type: 'number', total: 'sum', value: (p) => p.count },
        { header: 'النسبة', type: 'percent', value: (p) => share(p.count, real.length) },
        { header: money('القيمة', scope), type: 'money', total: 'sum', value: (p) => p.value },
      ], groupOrders(real, (o) => o.payment_methods?.method_name ?? 'غير محدد'), { description: 'بدون الطلبات الملغاة والمرتجعة' }),
    ],
    notes: [
      '«الإيرادات الفعلية» ومتوسط الطلب وملخص الدفع تستبعد الطلبات الملغاة والمرتجعة؛ سطر الإجمالي في سجل الطلبات يجمع كل الطلبات الظاهرة فيه.',
      ...mixedCurrencyNote(scope),
    ],
  };
}
