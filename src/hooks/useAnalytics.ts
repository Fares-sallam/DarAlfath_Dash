import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCountry } from '@/contexts/CountryContext';

export type Period =
  | 'اليوم'
  | 'أمس'
  | 'هذا الأسبوع'
  | 'هذا الشهر'
  | 'هذا العام'
  | 'يوم محدد'
  | 'مخصص';

type SelectedCountryLite = {
  id: string;
  name: string;
  code: string;
  currency: string;
  currency_symbol: string;
};

function normalizeText(value?: string | null) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Returns ISO date range [from, to] for a given period */
export function getPeriodRange(
  period: Period,
  customFrom?: string,
  customTo?: string
): [string, string] {
  const now = new Date();

  const startOfDay = (d: Date) => {
    const r = new Date(d);
    r.setHours(0, 0, 0, 0);
    return r;
  };

  const endOfDay = (d: Date) => {
    const r = new Date(d);
    r.setHours(23, 59, 59, 999);
    return r;
  };

  const startOfWeek = (d: Date) => {
    const r = new Date(d);
    const dow = r.getDay();
    r.setDate(r.getDate() - dow);
    r.setHours(0, 0, 0, 0);
    return r;
  };

  const endOfWeek = (d: Date) => {
    const r = startOfWeek(d);
    r.setDate(r.getDate() + 6);
    r.setHours(23, 59, 59, 999);
    return r;
  };

  const startOfMonth = (d: Date) => {
    const r = new Date(d);
    r.setDate(1);
    r.setHours(0, 0, 0, 0);
    return r;
  };

  const endOfMonth = (d: Date) => {
    const r = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    r.setHours(23, 59, 59, 999);
    return r;
  };

  const startOfYear = (d: Date) => {
    const r = new Date(d);
    r.setMonth(0, 1);
    r.setHours(0, 0, 0, 0);
    return r;
  };

  const endOfYear = (d: Date) => {
    const r = new Date(d.getFullYear(), 11, 31);
    r.setHours(23, 59, 59, 999);
    return r;
  };

  switch (period) {
    case 'اليوم': {
      const from = startOfDay(now);
      const to = endOfDay(now);
      return [from.toISOString(), to.toISOString()];
    }

    case 'أمس': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const from = startOfDay(y);
      const to = endOfDay(y);
      return [from.toISOString(), to.toISOString()];
    }

    case 'هذا الأسبوع': {
      const from = startOfWeek(now);
      const to = endOfWeek(now);
      return [from.toISOString(), to.toISOString()];
    }

    case 'هذا الشهر': {
      const from = startOfMonth(now);
      const to = endOfMonth(now);
      return [from.toISOString(), to.toISOString()];
    }

    case 'هذا العام': {
      const from = startOfYear(now);
      const to = endOfYear(now);
      return [from.toISOString(), to.toISOString()];
    }

    case 'يوم محدد': {
      const d = customFrom ? new Date(`${customFrom}T00:00:00`) : now;
      return [startOfDay(d).toISOString(), endOfDay(d).toISOString()];
    }

    case 'مخصص': {
      const from = customFrom
        ? new Date(`${customFrom}T00:00:00`)
        : startOfMonth(now);

      const to = customTo
        ? new Date(`${customTo}T23:59:59.999`)
        : endOfDay(now);

      return [from.toISOString(), to.toISOString()];
    }

    default: {
      const from = startOfMonth(now);
      const to = endOfMonth(now);
      return [from.toISOString(), to.toISOString()];
    }
  }
}

/* ─────────────────────────────────────────────────────────
   Shared orders fetch
───────────────────────────────────────────────────────── */

type OrderRow = {
  id: string;
  user_id?: string | null;
  country_id?: string | null;
  total_price: number;
  status: string;
  created_at: string;
  discount_amount: number;
  shipping_address: {
    city?: string;
    governorate?: string;
    country?: string;
  } | null;
  payment_methods: { method_name: string } | null;
  order_items: {
    id?: string;
    order_id?: string;
    price_per_item: number;
    quantity: number;
    discount_per_item: number;
    products: {
      id: string;
      title: string;
      author: string;
      cover_url?: string;
      cost_price: number;
    } | null;
  }[];
  profiles: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};

function orderMatchesCountry(
  order: OrderRow,
  selectedCountry: SelectedCountryLite | null
) {
  if (!selectedCountry) return true;

  if (order.country_id) {
    return order.country_id === selectedCountry.id;
  }

  const shippingCountry = normalizeText(order.shipping_address?.country);
  if (!shippingCountry) return true;

  return (
    shippingCountry === normalizeText(selectedCountry.name) ||
    shippingCountry === normalizeText(selectedCountry.code)
  );
}

function filterOrdersByCountry(
  orders: OrderRow[],
  selectedCountry: SelectedCountryLite | null
) {
  return orders.filter((order) => orderMatchesCountry(order, selectedCountry));
}

async function fetchOrdersInRange(from: string, to: string): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      user_id,
      country_id,
      total_price,
      status,
      created_at,
      discount_amount,
      shipping_address,
      payment_methods(method_name),
      profiles(id, full_name, avatar_url)
    `)
    .gte('created_at', from)
    .lte('created_at', to)
    .order('created_at', { ascending: true })
    .limit(1000);

  if (error) throw error;

  const orders = (data ?? []) as unknown as Omit<OrderRow, 'order_items'>[];
  if (orders.length === 0) return [];

  const orderIds = orders.map((o) => o.id);

  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select(`
      id,
      price_per_item,
      quantity,
      discount_per_item,
      order_id,
      products(id, title, author, cover_url, cost_price)
    `)
    .in('order_id', orderIds)
    .limit(5000);

  if (itemsErr) throw itemsErr;

  const itemsByOrder: Record<string, OrderRow['order_items']> = {};

  for (const item of (items ?? []) as unknown as (OrderRow['order_items'][number] & { order_id: string })[]) {
    const oid = item.order_id;
    if (!itemsByOrder[oid]) itemsByOrder[oid] = [];
    itemsByOrder[oid].push(item);
  }

  return orders.map((o) => ({
    ...o,
    order_items: itemsByOrder[o.id] ?? [],
  })) as OrderRow[];
}

async function fetchScopedProductFallback(selectedCountryId?: string | null) {
  let scopedIds: string[] | null = null;

  if (selectedCountryId) {
    const { data: invData, error: invErr } = await supabase
      .from('product_inventory')
      .select('product_id')
      .eq('country_id', selectedCountryId);

    if (!invErr) {
      scopedIds = Array.from(
        new Set(
          ((invData ?? []) as { product_id: string }[])
            .map((r) => r.product_id)
            .filter(Boolean)
        )
      );

      if (scopedIds.length === 0) {
        return [] as {
          id: string;
          title: string;
          base_price: number;
          sale_price?: number;
          cost_price: number;
        }[];
      }
    }
  }

  let query = supabase
    .from('products')
    .select('id, title, base_price, sale_price, cost_price, is_active')
    .eq('is_active', true);

  if (Array.isArray(scopedIds) && scopedIds.length > 0) {
    query = query.in('id', scopedIds);
  }

  const { data } = await query;

  return (data ?? []) as {
    id: string;
    title: string;
    base_price: number;
    sale_price?: number;
    cost_price: number;
  }[];
}

/* ══════════════════════════════════════════════════════════
   KPI SUMMARY
══════════════════════════════════════════════════════════ */

export interface KpiSummary {
  totalRevenue: number;
  totalProfit: number;
  totalOrders: number;
  avgOrderValue: number;
  profitMargin: number;
  isFallback: boolean;
  currencyCode: string;
  currencySymbol: string;
  countryName: string | null;
}

export function useKpiSummary(from: string, to: string) {
  const { selectedCountry } = useCountry();

  return useQuery({
    queryKey: ['analytics', 'kpi', from, to, selectedCountry?.id ?? 'all'],
    queryFn: async (): Promise<KpiSummary> => {
      const orders = await fetchOrdersInRange(from, to);
      const scopedOrders = filterOrdersByCountry(
        orders,
        selectedCountry
          ? {
              id: selectedCountry.id,
              name: selectedCountry.name,
              code: selectedCountry.code,
              currency: selectedCountry.currency,
              currency_symbol: selectedCountry.currency_symbol,
            }
          : null
      );

      const realOrders = scopedOrders.filter(
        (o) => o.status !== 'ملغي' && o.status !== 'مرتجع'
      );

      const currencyCode = selectedCountry?.currency ?? 'EGP';
      const currencySymbol = selectedCountry?.currency_symbol ?? 'ج.م';
      const countryName = selectedCountry?.name ?? null;

      if (realOrders.length === 0) {
        return {
          totalRevenue: 0,
          totalProfit: 0,
          totalOrders: 0,
          avgOrderValue: 0,
          profitMargin: 0,
          isFallback: false,
          currencyCode,
          currencySymbol,
          countryName,
        };
      }

      let totalRevenue = 0;
      let totalCost = 0;

      for (const order of realOrders) {
        totalRevenue += order.total_price;
        for (const item of order.order_items ?? []) {
          totalCost += (item.products?.cost_price ?? 0) * item.quantity;
        }
      }

      const totalProfit = totalRevenue - totalCost;

      return {
        totalRevenue,
        totalProfit,
        totalOrders: realOrders.length,
        avgOrderValue: realOrders.length > 0 ? totalRevenue / realOrders.length : 0,
        profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
        isFallback: false,
        currencyCode,
        currencySymbol,
        countryName,
      };
    },
  });
}

/* ══════════════════════════════════════════════════════════
   REVENUE TREND
══════════════════════════════════════════════════════════ */

export interface RevenueTrendPoint {
  label: string;
  revenue: number;
  profit: number;
  orders: number;
  currencyCode?: string;
  currencySymbol?: string;
}

function getDayLabel(d: Date): string {
  const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  return days[d.getDay()];
}

function getMonthLabel(d: Date): string {
  const months = [
    'يناير',
    'فبراير',
    'مارس',
    'أبريل',
    'مايو',
    'يونيو',
    'يوليو',
    'أغسطس',
    'سبتمبر',
    'أكتوبر',
    'نوفمبر',
    'ديسمبر',
  ];
  return months[d.getMonth()];
}

export function useRevenueTrend(from: string, to: string, period: Period) {
  const { selectedCountry } = useCountry();

  return useQuery({
    queryKey: ['analytics', 'trend', from, to, period, selectedCountry?.id ?? 'all'],
    queryFn: async (): Promise<RevenueTrendPoint[]> => {
      const orders = await fetchOrdersInRange(from, to);
      const scopedOrders = filterOrdersByCountry(
        orders,
        selectedCountry
          ? {
              id: selectedCountry.id,
              name: selectedCountry.name,
              code: selectedCountry.code,
              currency: selectedCountry.currency,
              currency_symbol: selectedCountry.currency_symbol,
            }
          : null
      );

      const realOrders = scopedOrders.filter(
        (o) => o.status !== 'ملغي' && o.status !== 'مرتجع'
      );

      const currencyCode = selectedCountry?.currency ?? 'EGP';
      const currencySymbol = selectedCountry?.currency_symbol ?? 'ج.م';

      if (realOrders.length === 0) {
        return buildTimeline(period, from, to, {}, currencyCode, currencySymbol);
      }

      const grouped: Record<
        string,
        { revenue: number; cost: number; orders: number; sortKey: string }
      > = {};

      for (const order of realOrders) {
        const d = new Date(order.created_at);
        let label = '';
        let sortKey = '';

        if (period === 'اليوم' || period === 'أمس') {
          const h = d.getHours();
          label = `${h.toString().padStart(2, '0')}:00`;
          sortKey = label;
        } else if (period === 'هذا الأسبوع') {
          label = getDayLabel(d);
          sortKey = d.getDay().toString();
        } else if (period === 'هذا العام') {
          label = getMonthLabel(d);
          sortKey = d.getMonth().toString().padStart(2, '0');
        } else {
          const day = d.getDate().toString().padStart(2, '0');
          const month = (d.getMonth() + 1).toString().padStart(2, '0');
          label = `${d.getDate()}/${d.getMonth() + 1}`;
          sortKey = `${d.getFullYear()}-${month}-${day}`;
        }

        if (!grouped[sortKey]) {
          grouped[sortKey] = { revenue: 0, cost: 0, orders: 0, sortKey };
        }

        grouped[sortKey].revenue += order.total_price;
        grouped[sortKey].orders += 1;

        for (const item of order.order_items ?? []) {
          grouped[sortKey].cost += (item.products?.cost_price ?? 0) * item.quantity;
        }
      }

      return buildTimeline(period, from, to, grouped, currencyCode, currencySymbol);
    },
  });
}

function buildTimeline(
  period: Period,
  from: string,
  to: string,
  grouped: Record<string, { revenue: number; cost: number; orders: number; sortKey: string }>,
  currencyCode = 'EGP',
  currencySymbol = 'ج.م'
): RevenueTrendPoint[] {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const points: RevenueTrendPoint[] = [];

  if (period === 'اليوم' || period === 'أمس') {
    for (let h = 0; h < 24; h++) {
      const key = `${h.toString().padStart(2, '0')}:00`;
      const v = grouped[key];
      points.push({
        label: key,
        revenue: v?.revenue ?? 0,
        profit: (v?.revenue ?? 0) - (v?.cost ?? 0),
        orders: v?.orders ?? 0,
        currencyCode,
        currencySymbol,
      });
    }
    return points;
  }

  if (period === 'هذا الأسبوع') {
    const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    for (let i = 0; i < 7; i++) {
      const key = i.toString();
      const v = grouped[key];
      points.push({
        label: days[i],
        revenue: v?.revenue ?? 0,
        profit: (v?.revenue ?? 0) - (v?.cost ?? 0),
        orders: v?.orders ?? 0,
        currencyCode,
        currencySymbol,
      });
    }
    return points;
  }

  if (period === 'هذا العام') {
    const months = [
      'يناير',
      'فبراير',
      'مارس',
      'أبريل',
      'مايو',
      'يونيو',
      'يوليو',
      'أغسطس',
      'سبتمبر',
      'أكتوبر',
      'نوفمبر',
      'ديسمبر',
    ];
    const currentMonth = new Date().getMonth();

    for (let m = 0; m <= currentMonth; m++) {
      const key = m.toString().padStart(2, '0');
      const v = grouped[key];
      points.push({
        label: months[m],
        revenue: v?.revenue ?? 0,
        profit: (v?.revenue ?? 0) - (v?.cost ?? 0),
        orders: v?.orders ?? 0,
        currencyCode,
        currencySymbol,
      });
    }
    return points;
  }

  const cur = new Date(fromDate);
  cur.setHours(0, 0, 0, 0);

  const end = new Date(toDate);
  end.setHours(23, 59, 59, 999);

  while (cur <= end) {
    const day = cur.getDate().toString().padStart(2, '0');
    const month = (cur.getMonth() + 1).toString().padStart(2, '0');
    const year = cur.getFullYear();
    const sortKey = `${year}-${month}-${day}`;
    const v = grouped[sortKey];

    points.push({
      label: `${cur.getDate()}/${cur.getMonth() + 1}`,
      revenue: v?.revenue ?? 0,
      profit: (v?.revenue ?? 0) - (v?.cost ?? 0),
      orders: v?.orders ?? 0,
      currencyCode,
      currencySymbol,
    });

    cur.setDate(cur.getDate() + 1);
  }

  return points;
}

/* ══════════════════════════════════════════════════════════
   TOP SELLING BOOKS
══════════════════════════════════════════════════════════ */

export interface TopBook {
  productId: string;
  title: string;
  author: string;
  cover_url?: string;
  totalSold: number;
  totalRevenue: number;
}

export function useTopBooks(from: string, to: string, limit = 10) {
  const { selectedCountry } = useCountry();

  return useQuery({
    queryKey: ['analytics', 'top-books', from, to, limit, selectedCountry?.id ?? 'all'],
    queryFn: async (): Promise<TopBook[]> => {
      const orders = await fetchOrdersInRange(from, to);
      const scopedOrders = filterOrdersByCountry(
        orders,
        selectedCountry
          ? {
              id: selectedCountry.id,
              name: selectedCountry.name,
              code: selectedCountry.code,
              currency: selectedCountry.currency,
              currency_symbol: selectedCountry.currency_symbol,
            }
          : null
      );

      const realOrders = scopedOrders.filter(
        (o) => o.status !== 'ملغي' && o.status !== 'مرتجع'
      );

      const bookMap: Record<string, TopBook> = {};

      for (const order of realOrders) {
        for (const item of order.order_items ?? []) {
          const p = item.products;
          if (!p) continue;

          if (!bookMap[p.id]) {
            bookMap[p.id] = {
              productId: p.id,
              title: p.title,
              author: p.author,
              cover_url: p.cover_url,
              totalSold: 0,
              totalRevenue: 0,
            };
          }

          bookMap[p.id].totalSold += item.quantity;
          bookMap[p.id].totalRevenue += item.price_per_item * item.quantity;
        }
      }

      return Object.values(bookMap)
        .sort((a, b) => b.totalSold - a.totalSold)
        .slice(0, limit);
    },
  });
}

/* ══════════════════════════════════════════════════════════
   ORDERS BY STATUS
══════════════════════════════════════════════════════════ */

export interface StatusCount {
  name: string;
  value: number;
  color: string;
}

const STATUS_COLORS: Record<string, string> = {
  جديد: '#F59E0B',
  'قيد المراجعة': '#8B5CF6',
  'تم التأكيد': '#0891B2',
  'جاري الشحن': '#1D4ED8',
  'تم التوصيل': '#16A34A',
  ملغي: '#DC2626',
  مرتجع: '#9CA3AF',
};

export function useOrdersByStatus(from: string, to: string) {
  const { selectedCountry } = useCountry();

  return useQuery({
    queryKey: ['analytics', 'orders-status', from, to, selectedCountry?.id ?? 'all'],
    queryFn: async (): Promise<StatusCount[]> => {
      const orders = await fetchOrdersInRange(from, to);
      const scopedOrders = filterOrdersByCountry(
        orders,
        selectedCountry
          ? {
              id: selectedCountry.id,
              name: selectedCountry.name,
              code: selectedCountry.code,
              currency: selectedCountry.currency,
              currency_symbol: selectedCountry.currency_symbol,
            }
          : null
      );

      const counts: Record<string, number> = {};

      for (const o of scopedOrders) {
        counts[o.status] = (counts[o.status] ?? 0) + 1;
      }

      const total = Object.values(counts).reduce((a, b) => a + b, 0);

      return Object.entries(counts).map(([name, count]) => ({
        name,
        value: total > 0 ? Math.round((count / total) * 100) : 0,
        color: STATUS_COLORS[name] ?? '#6B7280',
      }));
    },
  });
}

/* ══════════════════════════════════════════════════════════
   PAYMENT METHODS
══════════════════════════════════════════════════════════ */

export interface PaymentCount {
  name: string;
  value: number;
  color: string;
}

const PAYMENT_COLORS = ['#16A34A', '#1D4ED8', '#8B5CF6', '#DC2626', '#F59E0B', '#0891B2'];

export function usePaymentMethods(from: string, to: string) {
  const { selectedCountry } = useCountry();

  return useQuery({
    queryKey: ['analytics', 'payments', from, to, selectedCountry?.id ?? 'all'],
    queryFn: async (): Promise<PaymentCount[]> => {
      const orders = await fetchOrdersInRange(from, to);
      const scopedOrders = filterOrdersByCountry(
        orders,
        selectedCountry
          ? {
              id: selectedCountry.id,
              name: selectedCountry.name,
              code: selectedCountry.code,
              currency: selectedCountry.currency,
              currency_symbol: selectedCountry.currency_symbol,
            }
          : null
      );

      const realOrders = scopedOrders.filter(
        (o) => o.status !== 'ملغي' && o.status !== 'مرتجع'
      );

      const counts: Record<string, number> = {};

      for (const o of realOrders) {
        const name = o.payment_methods?.method_name ?? 'غير محدد';
        counts[name] = (counts[name] ?? 0) + 1;
      }

      const total = Object.values(counts).reduce((a, b) => a + b, 0);

      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count], i) => ({
          name,
          value: total > 0 ? Math.round((count / total) * 100) : 0,
          color: PAYMENT_COLORS[i % PAYMENT_COLORS.length],
        }));
    },
  });
}

/* ══════════════════════════════════════════════════════════
   CITIES
══════════════════════════════════════════════════════════ */

export interface CityCount {
  city: string;
  orders: number;
  revenue: number;
  percentage: number;
}

export function useCitiesData(from: string, to: string) {
  const { selectedCountry } = useCountry();

  return useQuery({
    queryKey: ['analytics', 'cities', from, to, selectedCountry?.id ?? 'all'],
    queryFn: async (): Promise<CityCount[]> => {
      const orders = await fetchOrdersInRange(from, to);
      const scopedOrders = filterOrdersByCountry(
        orders,
        selectedCountry
          ? {
              id: selectedCountry.id,
              name: selectedCountry.name,
              code: selectedCountry.code,
              currency: selectedCountry.currency,
              currency_symbol: selectedCountry.currency_symbol,
            }
          : null
      );

      const realOrders = scopedOrders.filter(
        (o) => o.status !== 'ملغي' && o.status !== 'مرتجع'
      );

      const counts: Record<string, { orders: number; revenue: number }> = {};

      for (const o of realOrders) {
        const addr = o.shipping_address;
        const city = addr?.city ?? addr?.governorate ?? 'غير محدد';

        if (!counts[city]) counts[city] = { orders: 0, revenue: 0 };
        counts[city].orders += 1;
        counts[city].revenue += o.total_price;
      }

      const total = Object.values(counts).reduce((a, b) => a + b.orders, 0);

      return Object.entries(counts)
        .sort((a, b) => b[1].orders - a[1].orders)
        .slice(0, 8)
        .map(([city, v]) => ({
          city,
          orders: v.orders,
          revenue: v.revenue,
          percentage: total > 0 ? Math.round((v.orders / total) * 100) : 0,
        }));
    },
  });
}

/* ══════════════════════════════════════════════════════════
   TOP CUSTOMERS
══════════════════════════════════════════════════════════ */

export interface TopCustomer {
  id: string;
  fullName: string;
  email: string;
  city: string;
  totalOrders: number;
  totalSpent: number;
  avatar?: string;
}

export function useTopCustomers(from: string, to: string, limit = 5) {
  const { selectedCountry } = useCountry();

  return useQuery({
    queryKey: ['analytics', 'top-customers', from, to, limit, selectedCountry?.id ?? 'all'],
    queryFn: async (): Promise<TopCustomer[]> => {
      const orders = await fetchOrdersInRange(from, to);
      const scopedOrders = filterOrdersByCountry(
        orders,
        selectedCountry
          ? {
              id: selectedCountry.id,
              name: selectedCountry.name,
              code: selectedCountry.code,
              currency: selectedCountry.currency,
              currency_symbol: selectedCountry.currency_symbol,
            }
          : null
      );

      const realOrders = scopedOrders.filter(
        (o) => o.status !== 'ملغي' && o.status !== 'مرتجع' && o.profiles
      );

      const map: Record<string, { _spent: number; _orders: number } & TopCustomer> = {};

      for (const o of realOrders) {
        const uid = o.profiles!.id;

        if (!map[uid]) {
          map[uid] = {
            id: uid,
            fullName: o.profiles!.full_name ?? '—',
            email: '',
            city: o.shipping_address?.city ?? o.shipping_address?.governorate ?? '—',
            totalOrders: 0,
            totalSpent: 0,
            avatar: o.profiles!.avatar_url ?? undefined,
            _spent: 0,
            _orders: 0,
          };
        }

        map[uid]._spent += o.total_price;
        map[uid]._orders += 1;
      }

      return Object.values(map)
        .map((c) => ({ ...c, totalSpent: c._spent, totalOrders: c._orders }))
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, limit);
    },
  });
}

/* ══════════════════════════════════════════════════════════
   INVENTORY ROTATION
══════════════════════════════════════════════════════════ */

export interface InventoryItem {
  productId: string;
  title: string;
  totalSold: number;
  totalStock: number;
}

export function useInventoryRotation(limit = 8) {
  const { selectedCountry } = useCountry();

  return useQuery({
    queryKey: ['analytics', 'inventory-rotation', selectedCountry?.id ?? 'all'],
    queryFn: async (): Promise<InventoryItem[]> => {
      let soldOrderIds: string[] = [];

      if (selectedCountry?.id) {
        const { data: scopedOrders, error: ordErr } = await supabase
          .from('orders')
          .select('id')
          .eq('country_id', selectedCountry.id)
          .not('status', 'in', '("ملغي","مرتجع")')
          .limit(2000);

        if (ordErr) throw ordErr;
        soldOrderIds = ((scopedOrders ?? []) as { id: string }[]).map((o) => o.id);
      }

      const soldPromise =
        selectedCountry?.id && soldOrderIds.length > 0
          ? supabase
              .from('order_items')
              .select('quantity, products(id, title)')
              .in('order_id', soldOrderIds)
              .limit(5000)
          : selectedCountry?.id
          ? Promise.resolve({ data: [] as { quantity: number; products: { id: string; title: string } | null }[], error: null })
          : supabase
              .from('order_items')
              .select('quantity, products(id, title)')
              .limit(5000);

      const inventoryPromise = selectedCountry?.id
        ? supabase
            .from('product_inventory')
            .select('product_id, stock')
            .eq('country_id', selectedCountry.id)
            .limit(2000)
        : supabase
            .from('product_inventory')
            .select('product_id, stock')
            .limit(2000);

      const [{ data: sold, error: e1 }, { data: inventory, error: e2 }] =
        await Promise.all([soldPromise, inventoryPromise]);

      if (e1) throw e1;
      if (e2) throw e2;

      const soldMap: Record<string, { title: string; qty: number }> = {};
      for (const item of (sold ?? []) as { quantity: number; products: { id: string; title: string } | null }[]) {
        const p = item.products;
        if (!p) continue;
        if (!soldMap[p.id]) soldMap[p.id] = { title: p.title, qty: 0 };
        soldMap[p.id].qty += item.quantity;
      }

      const stockMap: Record<string, number> = {};
      for (const inv of (inventory ?? []) as { product_id: string; stock: number }[]) {
        stockMap[inv.product_id] = (stockMap[inv.product_id] ?? 0) + inv.stock;
      }

      const allProductIds = new Set([...Object.keys(soldMap), ...Object.keys(stockMap)]);
      const result: InventoryItem[] = [];

      for (const id of allProductIds) {
        result.push({
          productId: id,
          title: soldMap[id]?.title ?? id.slice(0, 8),
          totalSold: soldMap[id]?.qty ?? 0,
          totalStock: stockMap[id] ?? 0,
        });
      }

      return result
        .sort((a, b) => b.totalSold - a.totalSold)
        .slice(0, limit);
    },
  });
}