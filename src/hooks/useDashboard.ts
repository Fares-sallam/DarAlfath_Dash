import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCountry } from '@/contexts/CountryContext';

/* ────────────────────────────────────────────── */
/* Shared helpers */
/* ────────────────────────────────────────────── */

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

type OrderLite = {
  id: string;
  user_id?: string | null;
  country_id?: string | null;
  total_price: number;
  status: string;
  created_at: string;
  shipping_address?: {
    city?: string;
    governorate?: string;
    country?: string;
  } | null;
  profiles?: {
    full_name?: string;
    avatar_url?: string;
  } | null;
  countries?: {
    name?: string;
    currency_symbol?: string;
  } | null;
};

function orderMatchesCountry(
  order: OrderLite,
  selectedCountry: SelectedCountryLite | null
) {
  if (!selectedCountry) return true;

  if (order.country_id) {
    return order.country_id === selectedCountry.id;
  }

  const selectedName = normalizeText(selectedCountry.name);
  const selectedCode = normalizeText(selectedCountry.code);
  const shippingCountry = normalizeText(order.shipping_address?.country);

  if (!shippingCountry) return true;

  return shippingCountry === selectedName || shippingCountry === selectedCode;
}

async function fetchOrdersBase(limit?: number, fromIso?: string): Promise<OrderLite[]> {
  let query = supabase
    .from('orders')
    .select(`
      id,
      user_id,
      country_id,
      total_price,
      status,
      created_at,
      shipping_address,
      profiles(full_name, avatar_url),
      countries(name, currency_symbol)
    `)
    .order('created_at', { ascending: false });

  if (fromIso) query = query.gte('created_at', fromIso);
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []) as OrderLite[];
}

async function fetchScopedProductIds(selectedCountryId?: string | null): Promise<string[] | null> {
  if (!selectedCountryId) return null;

  const { data, error } = await supabase
    .from('product_inventory')
    .select('product_id')
    .eq('country_id', selectedCountryId);

  if (error) {
    console.warn('[useDashboard] product_inventory country scope fallback:', error.message);
    return null;
  }

  return Array.from(
    new Set(
      ((data ?? []) as { product_id: string }[])
        .map((row) => row.product_id)
        .filter(Boolean)
    )
  );
}

/* ────────────────────────────────────────────── */
/* Books summary stats */
/* ────────────────────────────────────────────── */

export interface BookStats {
  total: number;
  active: number;
  inactive: number;
  digital: number;
  paper: number;
  both: number;
}

export function useBookStats() {
  const { selectedCountry } = useCountry();

  return useQuery({
    queryKey: ['dashboard', 'book-stats', selectedCountry?.id ?? 'all'],
    queryFn: async (): Promise<BookStats> => {
      const scopedIds = await fetchScopedProductIds(selectedCountry?.id);

      if (Array.isArray(scopedIds) && scopedIds.length === 0) {
        return {
          total: 0,
          active: 0,
          inactive: 0,
          digital: 0,
          paper: 0,
          both: 0,
        };
      }

      let query = supabase.from('products').select('id, is_active, type');

      if (Array.isArray(scopedIds) && scopedIds.length > 0) {
        query = query.in('id', scopedIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []) as { id: string; is_active: boolean; type: string }[];

      return {
        total: rows.length,
        active: rows.filter((r) => r.is_active).length,
        inactive: rows.filter((r) => !r.is_active).length,
        digital: rows.filter((r) => r.type === 'رقمي').length,
        paper: rows.filter((r) => r.type === 'ورقي').length,
        both: rows.filter((r) => r.type === 'ورقي ورقمي').length,
      };
    },
  });
}

/* ────────────────────────────────────────────── */
/* Top selling books (last 30 days) */
/* ────────────────────────────────────────────── */

export interface TopSellingBook {
  productId: string;
  title: string;
  author: string;
  cover_url?: string;
  totalSold: number;
  totalRevenue: number;
  type: string;
}

export function useTopSellingBooks(limit = 5) {
  const { selectedCountry } = useCountry();

  return useQuery({
    queryKey: ['dashboard', 'top-selling', limit, selectedCountry?.id ?? 'all'],
    queryFn: async (): Promise<TopSellingBook[]> => {
      const from = new Date();
      from.setDate(from.getDate() - 30);

      const orders = await fetchOrdersBase(undefined, from.toISOString());
      const validOrders = orders.filter(
        (o) =>
          o.status !== 'ملغي' &&
          o.status !== 'مرتجع' &&
          orderMatchesCountry(
            o,
            selectedCountry
              ? {
                  id: selectedCountry.id,
                  name: selectedCountry.name,
                  code: selectedCountry.code,
                  currency: selectedCountry.currency,
                  currency_symbol: selectedCountry.currency_symbol,
                }
              : null
          )
      );

      if (validOrders.length === 0) return [];

      const orderIds = validOrders.map((o) => o.id);

      const { data, error } = await supabase
        .from('order_items')
        .select(`
          quantity,
          price_per_item,
          order_id,
          products(id, title, author, cover_url, type)
        `)
        .in('order_id', orderIds);

      if (error) throw error;

      const map: Record<string, TopSellingBook> = {};

      for (const item of (data ?? []) as unknown as {
        quantity: number;
        price_per_item: number;
        order_id: string;
        products: {
          id: string;
          title: string;
          author: string;
          cover_url?: string;
          type: string;
        } | null;
      }[]) {
        const p = item.products;
        if (!p) continue;

        if (!map[p.id]) {
          map[p.id] = {
            productId: p.id,
            title: p.title,
            author: p.author,
            cover_url: p.cover_url,
            totalSold: 0,
            totalRevenue: 0,
            type: p.type,
          };
        }

        map[p.id].totalSold += item.quantity;
        map[p.id].totalRevenue += item.price_per_item * item.quantity;
      }

      return Object.values(map)
        .sort((a, b) => b.totalSold - a.totalSold)
        .slice(0, limit);
    },
  });
}

/* ────────────────────────────────────────────── */
/* Recent audit logs */
/* ────────────────────────────────────────────── */

export interface AuditEntry {
  id: string;
  user_id?: string | null;
  user_email?: string | null;
  action: string;
  table_name?: string;
  record_id?: string;
  old_data?: Record<string, unknown>;
  new_data?: Record<string, unknown>;
  created_at: string;
  profiles?: { full_name?: string; avatar_url?: string } | null;
}

export function useRecentAuditLogs(limit = 10) {
  return useQuery({
    queryKey: ['dashboard', 'audit-logs', limit],
    queryFn: async (): Promise<AuditEntry[]> => {

      // ── محاولة مع FK hint ────────────────────────────────────
      const { data, error } = await supabase
        .from('audit_logs')
        .select(`
          id,
          user_id,
          user_email,
          action,
          table_name,
          record_id,
          old_data,
          new_data,
          created_at,
          profiles!fk_audit_logs_profiles(full_name, avatar_url)
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!error) return (data ?? []) as AuditEntry[];

      // ── الـ JOIN فشل — نجلب بدونه ثم نجلب profiles منفصلاً ──
      console.warn('[Dashboard] audit join failed:', error.message);

      const { data: raw, error: rawErr } = await supabase
        .from('audit_logs')
        .select('id, user_id, user_email, action, table_name, record_id, old_data, new_data, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (rawErr) throw new Error(rawErr.message);

      const logs = (raw ?? []) as AuditEntry[];
      const userIds = [...new Set(logs.map((l) => l.user_id).filter(Boolean))] as string[];

      if (userIds.length === 0) return logs;

      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', userIds);

      const profilesMap = new Map(
        (profilesData ?? []).map((p) => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }])
      );

      return logs.map((log) => ({
        ...log,
        profiles: log.user_id ? (profilesMap.get(log.user_id) ?? null) : null,
      }));
    },
  });
}

/* ────────────────────────────────────────────── */
/* Recent orders */
/* ────────────────────────────────────────────── */

export interface OrderSummary {
  id: string;
  user_id?: string | null;
  total_price: number;
  status: string;
  created_at: string;
  country_id?: string | null;
  shipping_address?: { city?: string; governorate?: string; country?: string };
  profiles?: { full_name?: string; avatar_url?: string };
  countries?: { name?: string; currency_symbol?: string } | null;
  currencySymbol?: string;
}

export function useRecentOrders(limit = 5) {
  const { selectedCountry, currencySymbol } = useCountry();

  return useQuery({
    queryKey: ['dashboard', 'recent-orders', limit, selectedCountry?.id ?? 'all'],
    queryFn: async (): Promise<OrderSummary[]> => {
      const rows = await fetchOrdersBase(100);

      return rows
        .filter((row) =>
          orderMatchesCountry(
            row,
            selectedCountry
              ? {
                  id: selectedCountry.id,
                  name: selectedCountry.name,
                  code: selectedCountry.code,
                  currency: selectedCountry.currency,
                  currency_symbol: selectedCountry.currency_symbol,
                }
              : null
          )
        )
        .slice(0, limit)
        .map((row) => ({
          ...row,
          currencySymbol: row.countries?.currency_symbol ?? currencySymbol,
        }));
    },
  });
}

/* ────────────────────────────────────────────── */
/* Dashboard KPI */
/* ────────────────────────────────────────────── */

export interface DashboardKpi {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  pendingOrders: number;
  currencyCode: string;
  currencySymbol: string;
  countryName: string | null;
}

export function useDashboardKpi() {
  const { selectedCountry } = useCountry();

  return useQuery({
    queryKey: ['dashboard', 'kpi', selectedCountry?.id ?? 'all'],
    staleTime: 2 * 60_000,
    queryFn: async (): Promise<DashboardKpi> => {
      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);

      const rows = await fetchOrdersBase(undefined, thisMonth.toISOString());

      const filteredOrders = rows.filter((o) =>
        orderMatchesCountry(
          o,
          selectedCountry
            ? {
                id: selectedCountry.id,
                name: selectedCountry.name,
                code: selectedCountry.code,
                currency: selectedCountry.currency,
                currency_symbol: selectedCountry.currency_symbol,
              }
            : null
        )
      );

      const validOrders = filteredOrders.filter(
        (o) => o.status !== 'ملغي' && o.status !== 'مرتجع'
      );

      const pendingOrders = filteredOrders.filter((o) =>
        ['جديد', 'قيد المراجعة', 'تم التأكيد'].includes(o.status)
      ).length;

      const uniqueCustomers = new Set(
        validOrders.map((o) => o.user_id).filter(Boolean)
      ).size;

      return {
        totalRevenue: validOrders.reduce((s, o) => s + o.total_price, 0),
        totalOrders: validOrders.length,
        totalCustomers: uniqueCustomers,
        pendingOrders,
        currencyCode: selectedCountry?.currency ?? 'EGP',
        currencySymbol: selectedCountry?.currency_symbol ?? 'ج.م',
        countryName: selectedCountry?.name ?? null,
      };
    },
  });
}