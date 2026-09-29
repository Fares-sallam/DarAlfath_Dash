import { supabase } from '@/lib/supabase';
import type { Coupon } from '@/hooks/useCoupons';
import { makeSection, type ReportDocument, type Tone } from '../types';
import { fetchAllPages } from '../download';
import { isRealOrder } from '../data';
import { filterMeta, mixedCurrencyNote, money, scopeMeta, type ReportScope } from './common';

type CouponRow = Coupon & { _status: string };
type CouponOrder = { coupon_id: string; status: string; total_price: number; discount_amount: number | null };

const STATUS_TONE: Record<string, Tone> = { 'نشط': 'good', 'منتهي': 'muted', 'معطل': 'bad', 'لم يبدأ': 'info' };

export async function buildCouponsReport(
  scope: ReportScope,
  opts: { coupons: CouponRow[]; keepOrder: boolean; filtersLabel?: string }
): Promise<ReportDocument> {
  const { period } = scope;
  const orders = await fetchAllPages<CouponOrder>((from, to) => {
    let q = supabase.from('orders').select('coupon_id, status, total_price, discount_amount').not('coupon_id', 'is', null);
    if (period.from) q = q.gte('created_at', period.from.toISOString());
    if (period.to) q = q.lte('created_at', period.to.toISOString());
    if (scope.country) q = q.eq('country_id', scope.country.id);
    return q.order('created_at').order('id').range(from, to) as unknown as PromiseLike<{ data: CouponOrder[] | null; error: { message: string } | null }>;
  });

  const usage = new Map<string, { uses: number; discount: number; sales: number }>();
  for (const o of orders) {
    if (!isRealOrder(o)) continue;
    const u = usage.get(o.coupon_id) ?? { uses: 0, discount: 0, sales: 0 };
    u.uses += 1;
    u.discount += o.discount_amount ?? 0;
    u.sales += o.total_price ?? 0;
    usage.set(o.coupon_id, u);
  }

  const coupons = opts.keepOrder ? opts.coupons : [...opts.coupons].sort((a, b) => (usage.get(b.id)?.uses ?? 0) - (usage.get(a.id)?.uses ?? 0));
  const count = (s: string) => opts.coupons.filter((c) => c._status === s).length;
  const periodUses = coupons.reduce((s, c) => s + (usage.get(c.id)?.uses ?? 0), 0);

  const valueText = (c: Coupon) =>
    c.type === 'نسبة' ? `${c.value}%` : c.type === 'شحن مجاني' ? 'شحن مجاني' : `${c.value.toLocaleString('en-US')} ${c.countries?.currency_symbol ?? scope.currencySymbol}`;

  return {
    title: 'تقرير الكوبونات',
    fileBase: 'تقرير-الكوبونات',
    period,
    generatedAt: scope.generatedAt,
    currencySymbol: scope.currencySymbol,
    landscape: true,
    meta: scopeMeta(scope, filterMeta(opts.keepOrder, opts.filtersLabel)),
    summary: [
      { label: 'عدد الكوبونات', value: coupons.length, type: 'number' },
      { label: 'نشطة', value: count('نشط'), type: 'number', tone: 'good' },
      { label: 'منتهية', value: count('منتهي'), type: 'number', tone: 'muted' },
      { label: 'معطلة', value: count('معطل'), type: 'number', tone: count('معطل') ? 'bad' : undefined },
      { label: 'لم تبدأ بعد', value: count('لم يبدأ'), type: 'number', tone: 'info' },
      { label: 'استخدامات الفترة', value: periodUses, type: 'number' },
      { label: 'إجمالي الخصم خلال الفترة', value: coupons.reduce((s, c) => s + (usage.get(c.id)?.discount ?? 0), 0), type: 'money' },
      { label: 'مبيعات بكوبونات خلال الفترة', value: coupons.reduce((s, c) => s + (usage.get(c.id)?.sales ?? 0), 0), type: 'money' },
    ],
    sections: [
      makeSection('الكوبونات', [
        { header: 'الكود', value: (c) => c.code, width: 16 },
        { header: 'النوع', value: (c) => c.type },
        { header: 'القيمة', value: valueText },
        { header: money('الحد الأدنى للطلب', scope), type: 'money', value: (c) => c.min_order },
        { header: 'مخصص لكتاب', value: (c) => c.products?.title ?? 'كل الكتب' },
        { header: 'الاستخدام الكلي', type: 'number', total: 'sum', value: (c) => c.used_count },
        { header: 'الحد الأقصى', value: (c) => (c.max_uses != null ? c.max_uses : 'غير محدود') },
        { header: 'الحالة', value: (c) => c._status, tone: (c) => STATUS_TONE[c._status] },
        { header: 'يبدأ', type: 'date', value: (c) => c.valid_from },
        { header: 'ينتهي', type: 'date', value: (c) => c.valid_to ?? 'مفتوح' },
        { header: 'استخدامات الفترة', type: 'number', total: 'sum', value: (c) => usage.get(c.id)?.uses ?? 0 },
        { header: money('خصم الفترة', scope), type: 'money', total: 'sum', value: (c) => usage.get(c.id)?.discount ?? 0 },
        { header: money('مبيعات الفترة', scope), type: 'money', total: 'sum', value: (c) => usage.get(c.id)?.sales ?? 0 },
      ], coupons, { emptyText: 'لا توجد كوبونات' }),
    ],
    notes: [
      'بيانات الكوبون (الحالة والاستخدام الكلي) كما هي لحظة التنزيل؛ الفترة تحدد أعمدة «الفترة» فقط.',
      'استخدامات الفترة تحتسب الطلبات غير الملغاة وغير المرتجعة، والخصم هو إجمالي خصم الطلب.',
      ...mixedCurrencyNote(scope),
    ],
  };
}
