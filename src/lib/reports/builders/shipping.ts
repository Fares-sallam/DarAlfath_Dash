import { makeSection, type ReportDocument } from '../types';
import {
  customerName,
  customerPhone,
  fetchReportOrders,
  orderUnits,
  STATUS_TONE,
  type ReportOrder,
} from '../data';
import { countryRef, filterMeta, mixedCurrencyNote, money, scopeMeta, type ReportScope } from './common';

const NO_COMPANY = 'لم تُحدد';

const street = (o: ReportOrder) => {
  const a = o.shipping_address;
  if (!a) return '';
  return [
    a.street,
    a.building && `عمارة ${a.building}`,
    a.floor && `دور ${a.floor}`,
    a.apartment && `شقة ${a.apartment}`,
  ].filter(Boolean).join('، ');
};

export async function buildShippingReport(
  scope: ReportScope,
  opts: { predicate?: (o: ReportOrder) => boolean; filtersLabel?: string } = {}
): Promise<ReportDocument> {
  const all = await fetchReportOrders(scope.period, countryRef(scope));
  const orders = (opts.predicate ? all.filter(opts.predicate) : all).reverse();

  const company = (o: ReportOrder) => o.shipping_companies?.company_name ?? NO_COMPANY;
  const byCompany = new Map<string, { name: string; total: number; delivered: number; transit: number; returned: number; fees: number; value: number }>();
  const byRegion = new Map<string, { name: string; total: number; delivered: number; fees: number; value: number }>();
  // A cancelled order never shipped, so it stays out of carrier/region performance.
  const active = orders.filter((o) => o.status !== 'ملغي');

  for (const o of active) {
    const c = byCompany.get(company(o)) ?? { name: company(o), total: 0, delivered: 0, transit: 0, returned: 0, fees: 0, value: 0 };
    c.total += 1;
    if (o.status === 'تم التوصيل') c.delivered += 1;
    if (o.status === 'جاري الشحن' || o.status === 'تم الشحن') c.transit += 1;
    if (o.status === 'مرتجع') c.returned += 1;
    c.fees += o.shipping_cost ?? 0;
    c.value += o.total_price ?? 0;
    byCompany.set(c.name, c);

    const regionName = o.shipping_address?.governorate || o.shipping_address?.city || 'غير محدد';
    const r = byRegion.get(regionName) ?? { name: regionName, total: 0, delivered: 0, fees: 0, value: 0 };
    r.total += 1;
    if (o.status === 'تم التوصيل') r.delivered += 1;
    r.fees += o.shipping_cost ?? 0;
    r.value += o.total_price ?? 0;
    byRegion.set(regionName, r);
  }

  const count = (status: string) => orders.filter((o) => o.status === status).length;

  return {
    title: 'تقرير الشحن',
    fileBase: 'تقرير-الشحن',
    period: scope.period,
    generatedAt: scope.generatedAt,
    currencySymbol: scope.currencySymbol,
    landscape: true,
    meta: scopeMeta(scope, filterMeta(!!opts.predicate, opts.filtersLabel)),
    summary: [
      { label: 'إجمالي الشحنات', value: orders.length, type: 'number' },
      { label: 'تم التوصيل', value: count('تم التوصيل'), type: 'number', tone: 'good' },
      { label: 'جاري الشحن', value: count('جاري الشحن') + count('تم الشحن'), type: 'number', tone: 'accent' },
      { label: 'بانتظار الشحن', value: orders.filter((o) => ['جديد', 'قيد المراجعة', 'تم التأكيد'].includes(o.status)).length, type: 'number', tone: 'info' },
      { label: 'مرتجعة', value: count('مرتجع'), type: 'number', tone: count('مرتجع') ? 'muted' : undefined },
      { label: 'بدون شركة شحن', value: active.filter((o) => !o.shipping_companies).length, type: 'number', tone: 'warn' },
      { label: 'بدون رقم تتبع', value: active.filter((o) => !o.tracking_number).length, type: 'number', tone: 'warn' },
      { label: 'رسوم الشحن', value: active.reduce((s, o) => s + (o.shipping_cost ?? 0), 0), type: 'money' },
    ],
    sections: [
      makeSection('قائمة الشحنات', [
        { header: 'رقم الطلب', value: (o) => o.id, width: 22 },
        { header: 'التاريخ', type: 'datetime', value: (o) => o.created_at },
        { header: 'العميل', value: customerName, width: 22 },
        { header: 'الهاتف', value: customerPhone, width: 14 },
        { header: 'المحافظة', value: (o) => o.shipping_address?.governorate ?? '' },
        { header: 'المدينة', value: (o) => o.shipping_address?.city ?? '' },
        { header: 'العنوان التفصيلي', value: street, width: 32 },
        { header: 'شركة الشحن', value: company, tone: (o) => (o.shipping_companies ? undefined : 'warn') },
        { header: 'رقم التتبع', value: (o) => o.tracking_number ?? '' },
        { header: 'النسخ', type: 'number', total: 'sum', value: orderUnits },
        { header: money('رسوم الشحن', scope), type: 'money', total: 'sum', value: (o) => o.shipping_cost ?? 0 },
        { header: money('قيمة الطلب', scope), type: 'money', total: 'sum', value: (o) => o.total_price ?? 0 },
        { header: 'الدفع', value: (o) => o.payment_methods?.method_name ?? '' },
        { header: 'الحالة', value: (o) => o.status, tone: (o) => STATUS_TONE[o.status] },
        { header: 'ملاحظات العميل', value: (o) => o.shipping_address?.notes ?? '', width: 24 },
      ], orders, { emptyText: 'لا توجد شحنات في هذه الفترة' }),
      makeSection('أداء شركات الشحن', [
        { header: 'شركة الشحن', value: (c) => c.name },
        { header: 'الشحنات', type: 'number', total: 'sum', value: (c) => c.total },
        { header: 'تم التوصيل', type: 'number', total: 'sum', value: (c) => c.delivered },
        { header: 'جاري الشحن', type: 'number', total: 'sum', value: (c) => c.transit },
        { header: 'مرتجعة', type: 'number', total: 'sum', value: (c) => c.returned },
        { header: 'نسبة التوصيل', type: 'percent', value: (c) => (c.total ? (c.delivered / c.total) * 100 : 0) },
        { header: money('رسوم الشحن', scope), type: 'money', total: 'sum', value: (c) => c.fees },
        { header: money('قيمة الطلبات', scope), type: 'money', total: 'sum', value: (c) => c.value },
      ], [...byCompany.values()].sort((a, b) => b.total - a.total)),
      makeSection('الشحنات حسب المحافظة', [
        { header: 'المحافظة', value: (r) => r.name },
        { header: 'الشحنات', type: 'number', total: 'sum', value: (r) => r.total },
        { header: 'تم التوصيل', type: 'number', total: 'sum', value: (r) => r.delivered },
        { header: money('رسوم الشحن', scope), type: 'money', total: 'sum', value: (r) => r.fees },
        { header: money('قيمة الطلبات', scope), type: 'money', total: 'sum', value: (r) => r.value },
      ], [...byRegion.values()].sort((a, b) => b.total - a.total)),
    ],
    notes: [
      'الطلبات الملغاة تظهر في قائمة الشحنات بحالتها، لكنها لا تدخل في الرسوم ولا في جدولي أداء الشركات والمحافظات لأنها لم تُشحن.',
      ...mixedCurrencyNote(scope),
    ],
  };
}
