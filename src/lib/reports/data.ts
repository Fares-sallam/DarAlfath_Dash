import { supabase } from '@/lib/supabase';
import type { ShippingAddress } from '@/hooks/useOrders';
import { fetchAllPages } from './download';
import type { ResolvedPeriod } from './period';

export interface ReportOrderItem {
  product_id: string | null;
  variant_id: string | null;
  quantity: number;
  price_per_item: number;
  discount_per_item: number | null;
  is_digital: boolean | null;
  products: { id: string; title: string; author: string | null; cost_price: number | null } | null;
  product_variants: { variant_name: string } | null;
  /** Bundle lines only: the books that left stock for it. */
  order_item_components: { product_id: string; variant_id: string; quantity: number }[] | null;
}

export interface ReportOrder {
  id: string;
  user_id: string | null;
  country_id: string | null;
  status: string;
  payment_status: string | null;
  total_price: number;
  shipping_cost: number | null;
  discount_amount: number | null;
  coupon_id: string | null;
  shipping_company_id: string | null;
  tracking_number: string | null;
  shipping_address: (ShippingAddress & { email?: string; full_name?: string }) | null;
  created_at: string;
  profiles: { id: string; full_name: string | null; phone: string | null } | null;
  countries: { name: string; currency_symbol: string } | null;
  coupons: { code: string } | null;
  payment_methods: { method_name: string } | null;
  shipping_companies: { company_name: string } | null;
  order_items: ReportOrderItem[] | null;
}

const ORDER_SELECT = `
  id, user_id, country_id, status, payment_status, total_price, shipping_cost,
  discount_amount, coupon_id, shipping_company_id, tracking_number, shipping_address, created_at,
  profiles(id, full_name, phone),
  countries(name, currency_symbol),
  coupons(code),
  payment_methods(method_name),
  shipping_companies(company_name),
  order_items(
    product_id, variant_id, quantity, price_per_item, discount_per_item, is_digital,
    products(id, title, author, cost_price),
    product_variants(variant_name),
    order_item_components(product_id, variant_id, quantity)
  )
`;

/** Cancelled and returned orders never became revenue — the dashboard excludes them everywhere. */
export const VOID_STATUSES = new Set(['ملغي', 'مرتجع']);
export const isRealOrder = (o: { status: string }) => !VOID_STATUSES.has(o.status);

/**
 * Every order in the period (all pages, oldest first).
 * `country`: 'strict' matches the Orders/Shipping pages (country_id only);
 * 'analytics' also keeps legacy orders with no country_id, as Analytics does.
 */
export async function fetchReportOrders(
  period: ResolvedPeriod,
  country: { id: string; name: string; code: string } | null,
  mode: 'strict' | 'analytics' = 'strict'
): Promise<ReportOrder[]> {
  const rows = await fetchAllPages<ReportOrder>((from, to) => {
    let q = supabase.from('orders').select(ORDER_SELECT);
    if (period.from) q = q.gte('created_at', period.from.toISOString());
    if (period.to) q = q.lte('created_at', period.to.toISOString());
    if (country) {
      q = mode === 'strict' ? q.eq('country_id', country.id) : q.or(`country_id.eq.${country.id},country_id.is.null`);
    }
    return q.order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to) as unknown as PromiseLike<{ data: ReportOrder[] | null; error: { message: string } | null }>;
  });

  if (!country || mode === 'strict') return rows;

  const norm = (v?: string | null) => (v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return rows.filter((o) => {
    if (o.country_id) return o.country_id === country.id;
    const shipCountry = norm(o.shipping_address?.country);
    return !shipCountry || shipCountry === norm(country.name) || shipCountry === norm(country.code);
  });
}

export const customerName = (o: ReportOrder) => o.profiles?.full_name || o.shipping_address?.name || o.shipping_address?.full_name || 'زائر';
export const customerPhone = (o: ReportOrder) => o.shipping_address?.phone || o.profiles?.phone || '';
export const orderUnits = (o: ReportOrder) => (o.order_items ?? []).reduce((s, i) => s + (i.quantity ?? 0), 0);
export const orderCost = (o: ReportOrder) =>
  (o.order_items ?? []).reduce((s, i) => s + (i.products?.cost_price ?? 0) * (i.quantity ?? 0), 0);

/** Key for stock movement: the copy, or `p:<product>` for legacy rows with no copy. */
export const movementKey = (variantId: string | null | undefined, productId: string | null | undefined) =>
  variantId ?? (productId ? `p:${productId}` : null);

/** Units per physical copy that actually left stock (bundle lines count their books). */
export function stockMovementByVariant(orders: ReportOrder[]): Map<string, number> {
  const moved = new Map<string, number>();
  const add = (key: string | null, qty: number) => {
    if (!key || !qty) return;
    moved.set(key, (moved.get(key) ?? 0) + qty);
  };
  for (const o of orders) {
    if (!isRealOrder(o)) continue;
    for (const item of o.order_items ?? []) {
      if (item.is_digital) continue;
      const components = item.order_item_components ?? [];
      if (components.length) components.forEach((c) => add(c.variant_id, c.quantity));
      else add(movementKey(item.variant_id, item.product_id), item.quantity);
    }
  }
  return moved;
}

/** Units and revenue per product and per variant, as sold (a bundle counts as itself). */
export function salesByProduct(orders: ReportOrder[]) {
  const byProduct = new Map<string, { units: number; revenue: number; orders: Set<string> }>();
  const byVariant = new Map<string, { units: number; revenue: number }>();
  for (const o of orders) {
    if (!isRealOrder(o)) continue;
    for (const item of o.order_items ?? []) {
      const revenue = (item.price_per_item ?? 0) * (item.quantity ?? 0);
      if (item.product_id) {
        const p = byProduct.get(item.product_id) ?? { units: 0, revenue: 0, orders: new Set<string>() };
        p.units += item.quantity ?? 0;
        p.revenue += revenue;
        p.orders.add(o.id);
        byProduct.set(item.product_id, p);
      }
      if (item.variant_id) {
        const v = byVariant.get(item.variant_id) ?? { units: 0, revenue: 0 };
        v.units += item.quantity ?? 0;
        v.revenue += revenue;
        byVariant.set(item.variant_id, v);
      }
    }
  }
  return { byProduct, byVariant };
}

export const STATUS_TONE: Record<string, 'good' | 'warn' | 'bad' | 'info' | 'muted' | 'accent'> = {
  'جديد': 'info',
  'قيد المراجعة': 'warn',
  'قيد المعالجة': 'warn',
  'تم التأكيد': 'info',
  'جاري الشحن': 'accent',
  'تم الشحن': 'accent',
  'تم التوصيل': 'good',
  'معلق': 'muted',
  'ملغي': 'bad',
  'مرتجع': 'muted',
};

export const PAYMENT_TONE: Record<string, 'good' | 'warn' | 'bad' | 'muted'> = {
  'مدفوع': 'good',
  'معلق': 'warn',
  'فاشل': 'bad',
  'مرتجع': 'muted',
};

/** Group-by helper for the small "by status / by method" summary tables. */
export function groupOrders<K extends string>(orders: ReportOrder[], key: (o: ReportOrder) => K) {
  const map = new Map<K, { count: number; value: number }>();
  for (const o of orders) {
    const k = key(o);
    const g = map.get(k) ?? { count: 0, value: 0 };
    g.count += 1;
    g.value += o.total_price ?? 0;
    map.set(k, g);
  }
  return [...map.entries()].map(([name, g]) => ({ name, ...g })).sort((a, b) => b.count - a.count);
}
