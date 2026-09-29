import { makeSection, share, type ReportDocument } from '../types';
import { periodDays } from '../period';
import {
  customerName,
  customerPhone,
  fetchReportOrders,
  groupOrders,
  isRealOrder,
  orderCost,
  orderUnits,
  STATUS_TONE,
  type ReportOrder,
} from '../data';
import { countryRef, mixedCurrencyNote, money, scopeMeta, type ReportScope } from './common';

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const pad = (n: number) => String(n).padStart(2, '0');

type Grain = 'hour' | 'day' | 'month';

interface Bucket { key: string; label: string; orders: number; units: number; revenue: number; cost: number }

function buildTrend(real: ReportOrder[], from: Date, to: Date, grain: Grain): Bucket[] {
  const buckets = new Map<string, Bucket>();
  const keyOf = (d: Date) =>
    grain === 'hour' ? `${pad(d.getHours())}` : grain === 'day' ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

  // Every slot in range, so quiet days show as zero instead of disappearing.
  if (grain === 'hour') {
    for (let h = 0; h < 24; h++) buckets.set(pad(h), { key: pad(h), label: `${pad(h)}:00 – ${pad((h + 1) % 24)}:00`, orders: 0, units: 0, revenue: 0, cost: 0 });
  } else if (grain === 'day') {
    for (let d = new Date(from.getFullYear(), from.getMonth(), from.getDate()); d <= to; d.setDate(d.getDate() + 1)) {
      buckets.set(keyOf(d), { key: keyOf(d), label: `${DAYS[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`, orders: 0, units: 0, revenue: 0, cost: 0 });
    }
  } else {
    for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to; d.setMonth(d.getMonth() + 1)) {
      buckets.set(keyOf(d), { key: keyOf(d), label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, orders: 0, units: 0, revenue: 0, cost: 0 });
    }
  }

  for (const o of real) {
    const b = buckets.get(keyOf(new Date(o.created_at)));
    if (!b) continue;
    b.orders += 1;
    b.units += orderUnits(o);
    b.revenue += o.total_price ?? 0;
    b.cost += orderCost(o);
  }
  return [...buckets.values()];
}

export async function buildAnalyticsReport(scope: ReportScope): Promise<ReportDocument> {
  const { period } = scope;
  const orders = await fetchReportOrders(period, countryRef(scope), 'analytics');
  const real = orders.filter(isRealOrder);

  const revenue = real.reduce((s, o) => s + (o.total_price ?? 0), 0);
  const cost = real.reduce((s, o) => s + orderCost(o), 0);
  const profit = revenue - cost;
  const units = real.reduce((s, o) => s + orderUnits(o), 0);
  const discounts = real.reduce((s, o) => s + (o.discount_amount ?? 0), 0);
  const shipping = real.reduce((s, o) => s + (o.shipping_cost ?? 0), 0);
  const customerKey = (o: ReportOrder) => o.user_id ?? (customerPhone(o) || o.shipping_address?.email || customerName(o));
  const customers = new Set(real.map(customerKey));

  // Trend granularity follows the span: hours for one day, days up to a quarter, months beyond.
  const firstOrder = orders.length ? new Date(orders[0].created_at) : null;
  const from = period.from ?? firstOrder ?? scope.generatedAt;
  const to = period.to ?? scope.generatedAt;
  const days = periodDays(period) ?? Math.ceil((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const grain: Grain = days <= 1 ? 'hour' : days <= 92 ? 'day' : 'month';
  const trend = orders.length || period.from ? buildTrend(real, from, to, grain) : [];

  const bookMap = new Map<string, { title: string; author: string; units: number; revenue: number; cost: number }>();
  for (const o of real) {
    for (const item of o.order_items ?? []) {
      const p = item.products;
      if (!p) continue;
      const b = bookMap.get(p.id) ?? { title: p.title, author: p.author ?? '', units: 0, revenue: 0, cost: 0 };
      b.units += item.quantity ?? 0;
      b.revenue += (item.price_per_item ?? 0) * (item.quantity ?? 0);
      b.cost += (p.cost_price ?? 0) * (item.quantity ?? 0);
      bookMap.set(p.id, b);
    }
  }
  const books = [...bookMap.values()]
    .sort((a, b) => b.units - a.units || b.revenue - a.revenue)
    .map((b, i) => ({ ...b, rank: i + 1 }));
  const booksRevenue = books.reduce((s, b) => s + b.revenue, 0);

  const statuses = groupOrders(orders, (o) => o.status || 'غير محدد');
  const payments = groupOrders(real, (o) => o.payment_methods?.method_name ?? 'غير محدد');
  const regions = groupOrders(real, (o) => o.shipping_address?.governorate || o.shipping_address?.city || 'غير محدد');

  const custMap = new Map<string, { name: string; phone: string; region: string; orders: number; spent: number; last: string }>();
  for (const o of real) {
    const k = customerKey(o);
    const c = custMap.get(k) ?? { name: customerName(o), phone: customerPhone(o), region: '', orders: 0, spent: 0, last: '' };
    c.orders += 1;
    c.spent += o.total_price ?? 0;
    if (o.created_at > c.last) {
      c.last = o.created_at;
      c.region = [o.shipping_address?.governorate, o.shipping_address?.city].filter(Boolean).join(' - ');
    }
    custMap.set(k, c);
  }
  const topCustomers = [...custMap.values()].sort((a, b) => b.spent - a.spent);

  const grainLabel = grain === 'hour' ? 'بالساعة' : grain === 'day' ? 'باليوم' : 'بالشهر';

  return {
    title: 'تقرير التحليلات والأداء',
    fileBase: 'تقرير-التحليلات',
    period,
    generatedAt: scope.generatedAt,
    currencySymbol: scope.currencySymbol,
    meta: scopeMeta(scope, [{ label: 'عدد الطلبات المسجلة', value: orders.length.toLocaleString('en-US') }]),
    summary: [
      { label: 'إجمالي الإيرادات', value: revenue, type: 'money' },
      { label: 'صافي الربح', value: profit, type: 'money', tone: profit >= 0 ? 'good' : 'bad' },
      { label: 'هامش الربح', value: share(profit, revenue), type: 'percent' },
      { label: 'الطلبات الفعلية', value: real.length, type: 'number' },
      { label: 'متوسط قيمة الطلب', value: real.length ? revenue / real.length : 0, type: 'money' },
      { label: 'الكتب المباعة (نسخة)', value: units, type: 'number' },
      { label: 'العملاء', value: customers.size, type: 'number' },
      { label: 'إجمالي الخصومات', value: discounts, type: 'money' },
      { label: 'رسوم الشحن المحصلة', value: shipping, type: 'money' },
      { label: 'الطلبات الملغاة والمرتجعة', value: orders.length - real.length, type: 'number', tone: orders.length > real.length ? 'bad' : undefined },
    ],
    sections: [
      makeSection(`الأداء عبر الزمن (${grainLabel})`, [
        { header: 'الفترة', value: (b) => b.label, width: 26 },
        { header: 'الطلبات', type: 'number', total: 'sum', value: (b) => b.orders },
        { header: 'النسخ المباعة', type: 'number', total: 'sum', value: (b) => b.units },
        { header: money('الإيرادات', scope), type: 'money', total: 'sum', value: (b) => b.revenue },
        { header: money('التكلفة', scope), type: 'money', total: 'sum', value: (b) => b.cost },
        { header: money('صافي الربح', scope), type: 'money', total: 'sum', value: (b) => b.revenue - b.cost, tone: (b) => (b.revenue - b.cost < 0 ? 'bad' : undefined) },
        { header: 'هامش الربح', type: 'percent', value: (b) => (b.revenue ? share(b.revenue - b.cost, b.revenue) : null) },
      ], trend),
      makeSection('الكتب الأكثر مبيعًا', [
        { header: '#', type: 'number', width: 6, value: (b) => b.rank },
        { header: 'الكتاب', value: (b) => b.title, width: 36 },
        { header: 'المؤلف', value: (b) => b.author },
        { header: 'النسخ المباعة', type: 'number', total: 'sum', value: (b) => b.units },
        { header: money('الإيرادات', scope), type: 'money', total: 'sum', value: (b) => b.revenue },
        { header: money('التكلفة', scope), type: 'money', total: 'sum', value: (b) => b.cost },
        { header: money('الربح', scope), type: 'money', total: 'sum', value: (b) => b.revenue - b.cost, tone: (b) => (b.revenue - b.cost < 0 ? 'bad' : undefined) },
        { header: 'من إجمالي المبيعات', type: 'percent', value: (b) => share(b.revenue, booksRevenue) },
      ], books, { emptyText: 'لا توجد مبيعات في هذه الفترة' }),
      makeSection('الطلبات حسب الحالة', [
        { header: 'الحالة', value: (s) => s.name, tone: (s) => STATUS_TONE[s.name] },
        { header: 'عدد الطلبات', type: 'number', total: 'sum', value: (s) => s.count },
        { header: 'النسبة', type: 'percent', value: (s) => share(s.count, orders.length) },
        { header: money('القيمة', scope), type: 'money', total: 'sum', value: (s) => s.value },
      ], statuses),
      makeSection('طرق الدفع', [
        { header: 'طريقة الدفع', value: (p) => p.name },
        { header: 'عدد الطلبات', type: 'number', total: 'sum', value: (p) => p.count },
        { header: 'النسبة', type: 'percent', value: (p) => share(p.count, real.length) },
        { header: money('القيمة', scope), type: 'money', total: 'sum', value: (p) => p.value },
      ], payments),
      makeSection('التوزيع الجغرافي', [
        { header: 'المحافظة', value: (r) => r.name },
        { header: 'عدد الطلبات', type: 'number', total: 'sum', value: (r) => r.count },
        { header: 'النسبة', type: 'percent', value: (r) => share(r.count, real.length) },
        { header: money('الإيرادات', scope), type: 'money', total: 'sum', value: (r) => r.value },
      ], regions),
      makeSection('العملاء الأعلى إنفاقًا', [
        { header: 'العميل', value: (c) => c.name, width: 26 },
        { header: 'الهاتف', value: (c) => c.phone },
        { header: 'المنطقة', value: (c) => c.region },
        { header: 'عدد الطلبات', type: 'number', total: 'sum', value: (c) => c.orders },
        { header: money('إجمالي الإنفاق', scope), type: 'money', total: 'sum', value: (c) => c.spent },
        { header: money('متوسط الطلب', scope), type: 'money', value: (c) => c.spent / c.orders },
        { header: 'آخر طلب', type: 'datetime', value: (c) => c.last },
      ], topCustomers),
    ],
    notes: [
      'الإيرادات والأرباح والمتوسطات تستبعد الطلبات الملغاة والمرتجعة، وهي نفس طريقة حساب لوحة التحليلات.',
      'الإيرادات = إجمالي قيمة الطلب شاملًا الشحن وبعد الخصم. التكلفة = سعر تكلفة الكتاب × الكمية.',
      'إيرادات الكتب في جدول «الأكثر مبيعًا» محسوبة من سعر بيع الكتاب داخل الطلب، بدون الشحن.',
      ...mixedCurrencyNote(scope),
    ],
  };
}
