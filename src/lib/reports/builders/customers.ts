import type { Customer } from '@/hooks/useCustomers';
import { makeSection, type ReportDocument } from '../types';
import { isInPeriod } from '../period';
import { fetchReportOrders, isRealOrder } from '../data';
import { countryRef, filterMeta, mixedCurrencyNote, money, scopeMeta, type ReportScope } from './common';

const norm = (e?: string | null) => (e ?? '').trim().toLowerCase();

export async function buildCustomersReport(
  scope: ReportScope,
  opts: { customers: Customer[]; keepOrder: boolean; filtersLabel?: string }
): Promise<ReportDocument> {
  const { period } = scope;
  const whole = !period.from && !period.to;

  // Same attribution as the customers page: account first, then a guest
  // order's email mapped to an account with that email, else the guest itself.
  const activity = new Map<string, { orders: number; spent: number }>();
  if (!whole) {
    const idByEmail = new Map<string, string>();
    for (const c of opts.customers) if (!c.isGuest && c.email) idByEmail.set(norm(c.email), c.id);

    const orders = await fetchReportOrders(period, countryRef(scope));
    for (const o of orders) {
      if (!isRealOrder(o)) continue;
      const email = norm(o.shipping_address?.email);
      const key = o.user_id ?? (email ? (idByEmail.get(email) ?? `guest:${email}`) : null);
      if (!key) continue;
      const a = activity.get(key) ?? { orders: 0, spent: 0 };
      a.orders += 1;
      a.spent += o.total_price ?? 0;
      activity.set(key, a);
    }
  }

  const isNew = (c: Customer) => !whole && isInPeriod(c.created_at, period);
  const inReport = whole ? opts.customers : opts.customers.filter((c) => activity.has(c.id) || isNew(c));
  const rows = opts.keepOrder
    ? inReport
    : [...inReport].sort((a, b) => (activity.get(b.id)?.spent ?? b.totalSpent) - (activity.get(a.id)?.spent ?? a.totalSpent));

  const buyers = rows.filter((c) => (whole ? c.totalOrders > 0 : activity.has(c.id)));
  const spent = rows.reduce((s, c) => s + (whole ? c.totalSpent : activity.get(c.id)?.spent ?? 0), 0);
  const status = (c: Customer) => (c.isGuest ? 'ضيف' : c.is_active ? 'نشط' : 'محظور');

  const periodColumns = whole
    ? []
    : [
        { header: 'طلبات الفترة', type: 'number' as const, total: 'sum' as const, value: (c: Customer) => activity.get(c.id)?.orders ?? 0 },
        { header: money('إنفاق الفترة', scope), type: 'money' as const, total: 'sum' as const, value: (c: Customer) => activity.get(c.id)?.spent ?? 0 },
        { header: 'عميل جديد', value: (c: Customer) => (isNew(c) ? 'نعم' : ''), tone: (c: Customer) => (isNew(c) ? ('info' as const) : undefined) },
      ];

  return {
    title: 'تقرير العملاء',
    fileBase: 'تقرير-العملاء',
    period,
    generatedAt: scope.generatedAt,
    currencySymbol: scope.currencySymbol,
    landscape: true,
    meta: scopeMeta(scope, filterMeta(opts.keepOrder, opts.filtersLabel)),
    summary: [
      { label: 'العملاء في التقرير', value: rows.length, type: 'number' },
      { label: whole ? 'عملاء اشتروا' : 'اشتروا خلال الفترة', value: buyers.length, type: 'number', tone: 'good' },
      ...(whole ? [] : [{ label: 'عملاء جدد خلال الفترة', value: rows.filter(isNew).length, type: 'number' as const, tone: 'info' as const }]),
      { label: 'مشترون بدون حساب', value: rows.filter((c) => c.isGuest).length, type: 'number' },
      { label: whole ? 'إجمالي الإنفاق' : 'إنفاق الفترة', value: spent, type: 'money' },
      { label: 'متوسط إنفاق المشتري', value: buyers.length ? spent / buyers.length : 0, type: 'money' },
    ],
    sections: [
      makeSection('العملاء', [
        { header: 'العميل', value: (c) => c.full_name || c.email || '—', width: 26 },
        { header: 'البريد الإلكتروني', value: (c) => c.email ?? '', width: 28 },
        { header: 'الهاتف', value: (c) => c.phone ?? '' },
        { header: 'الدولة', value: (c) => c.countries?.name ?? '' },
        { header: 'آخر مدينة', value: (c) => c.lastOrderCity ?? '' },
        { header: 'تاريخ التسجيل', type: 'date', value: (c) => c.created_at },
        ...periodColumns,
        { header: 'إجمالي الطلبات', type: 'number', total: 'sum', value: (c) => c.totalOrders },
        { header: money('إجمالي الإنفاق', scope), type: 'money', total: 'sum', value: (c) => c.totalSpent },
        { header: money('متوسط الطلب', scope), type: 'money', value: (c) => (c.totalOrders ? c.totalSpent / c.totalOrders : null) },
        { header: 'آخر طلب', type: 'date', value: (c) => c.lastOrderAt ?? null },
        { header: 'الحالة', value: status, tone: (c) => (c.isGuest ? 'muted' : c.is_active ? 'good' : 'bad') },
      ], rows, { emptyText: whole ? 'لا يوجد عملاء' : 'لا يوجد عملاء اشتروا أو سجّلوا في هذه الفترة' }),
    ],
    notes: [
      whole
        ? 'التقرير الشامل يضم كل العملاء، بما فيهم من سجّل ولم يشترِ بعد.'
        : 'يضم التقرير من اشترى خلال الفترة أو سجّل خلالها؛ «إجمالي الطلبات والإنفاق» أرقام كل الفترات.',
      'الطلبات والإنفاق يستبعدان الطلبات الملغاة والمرتجعة. «ضيف» = اشترى بدون إنشاء حساب.',
      ...mixedCurrencyNote(scope),
    ],
  };
}
