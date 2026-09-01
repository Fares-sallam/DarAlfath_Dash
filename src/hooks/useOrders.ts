import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useCountry } from '@/contexts/CountryContext';
import { notifyOrderStatusChange, getCurrentOrderStatus } from '@/lib/orderStatusEmail';

/* ── Types ── */
export interface OrderItem {
  id: string;
  product_id: string;
  variant_id?: string | null;
  quantity: number;
  price_per_item: number;
  discount_per_item: number;
  is_digital: boolean;
  products: {
    id: string;
    title: string;
    author: string;
    cover_url?: string | null;
    type: string;
  } | null;
  product_variants?: {
    id: string;
    variant_name: string;
    weight_kg?: number | null;
  } | null;
}

export interface ShippingAddress {
  name?: string;
  phone?: string;
  governorate?: string;
  city?: string;
  country?: string;
  street?: string;
  building?: string;
  floor?: string;
  apartment?: string;
  notes?: string;
}

export interface Order {
  id: string;
  user_id?: string | null;
  country_id?: string | null;
  status: string;
  total_price: number;
  shipping_cost: number;
  discount_amount: number;
  coupon_id?: string | null;
  payment_method_id?: string | null;
  payment_status: string;
  shipping_company_id?: string | null;
  tracking_number?: string | null;
  shipping_address?: ShippingAddress | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  profiles?: {
    id: string;
    full_name?: string | null;
    phone?: string | null;
    avatar_url?: string | null;
  } | null;
  countries?: { name: string; currency_symbol: string } | null;
  coupons?: { code: string } | null;
  payment_methods?: { method_name: string; provider?: string | null } | null;
  shipping_companies?: { company_name: string; logo_url?: string | null } | null;
  order_items?: OrderItem[];
}

/** ما تُرجعه قائمة الطلبات فقط: عنوان الكتاب والكمية، بلا أسعار السطر.
 *  نوع منفصل عن OrderItem عمدًا — القائمة لا تجلب price_per_item ولا
 *  discount_per_item، وادّعاء أنها كاملة عبر cast يخفي أنها undefined. */
export interface OrderItemSummary {
  id: string;
  quantity: number;
  products: { title: string } | null;
}

export type OrderListRow = Omit<Order, 'order_items'> & {
  order_items?: OrderItemSummary[];
};

/* ── Filters ── */
export interface OrderFilters {
  status?: string;
  paymentStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

/* ── Shared helper: date range ── */
function buildDateToIso(date?: string) {
  if (!date) return undefined;
  const to = new Date(date);
  to.setHours(23, 59, 59, 999);
  return to.toISOString();
}

/* ── Fetch orders (country-aware) ── */
export function useOrders(filters: OrderFilters = {}) {
  const { selectedCountry } = useCountry();
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('dashboard-orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        void qc.invalidateQueries({ queryKey: ['orders'] });
        void qc.invalidateQueries({ queryKey: ['dashboard'] });
        void qc.invalidateQueries({ queryKey: ['analytics'] });
        void qc.invalidateQueries({ queryKey: ['shipping-orders'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        void qc.invalidateQueries({ queryKey: ['orders'] });
        void qc.invalidateQueries({ queryKey: ['dashboard'] });
        void qc.invalidateQueries({ queryKey: ['analytics'] });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  return useQuery({
    queryKey: ['orders', selectedCountry?.id ?? 'all', filters],
    queryFn: async (): Promise<OrderListRow[]> => {
      let query = supabase
        .from('orders')
        .select(`
          id,
          user_id,
          country_id,
          status,
          total_price,
          shipping_cost,
          discount_amount,
          coupon_id,
          payment_method_id,
          payment_status,
          shipping_company_id,
          tracking_number,
          shipping_address,
          notes,
          created_at,
          updated_at,
          profiles(id, full_name, phone, avatar_url),
          countries(name, currency_symbol),
          coupons(code),
          payment_methods(method_name, provider),
          shipping_companies(company_name, logo_url),
          order_items(id, quantity, products(title))
        `)
        .order('created_at', { ascending: false });

      if (selectedCountry?.id) {
        query = query.eq('country_id', selectedCountry.id);
      }

      if (filters.status && filters.status !== 'الكل') {
        query = query.eq('status', filters.status);
      }

      if (filters.paymentStatus && filters.paymentStatus !== 'الكل') {
        query = query.eq('payment_status', filters.paymentStatus);
      }

      if (filters.dateFrom) {
        query = query.gte('created_at', new Date(filters.dateFrom).toISOString());
      }

      const dateToIso = buildDateToIso(filters.dateTo);
      if (dateToIso) {
        query = query.lte('created_at', dateToIso);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []) as OrderListRow[];
    },
  });
}

/* ── Fetch single order with items (country-aware) ── */
export function useOrderDetail(orderId: string | null) {
  const { selectedCountry } = useCountry();
  const qc = useQueryClient();

  useEffect(() => {
    if (!orderId) return undefined;

    const channel = supabase
      .channel(`dashboard-order-detail-${orderId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        () => {
          void qc.invalidateQueries({ queryKey: ['order-detail', orderId] });
          void qc.invalidateQueries({ queryKey: ['orders'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_items', filter: `order_id=eq.${orderId}` },
        () => {
          void qc.invalidateQueries({ queryKey: ['order-detail', orderId] });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orderId, qc]);

  return useQuery({
    queryKey: ['order-detail', orderId, selectedCountry?.id ?? 'all'],
    enabled: !!orderId,
    queryFn: async (): Promise<Order | null> => {
      let query = supabase
        .from('orders')
        .select(`
          id,
          user_id,
          country_id,
          status,
          total_price,
          shipping_cost,
          discount_amount,
          coupon_id,
          payment_method_id,
          payment_status,
          shipping_company_id,
          tracking_number,
          shipping_address,
          notes,
          created_at,
          updated_at,
          profiles(id, full_name, phone, avatar_url),
          countries(name, currency_symbol),
          coupons(code),
          payment_methods(method_name, provider),
          shipping_companies(company_name, logo_url),
          order_items(
            id,
            product_id,
            variant_id,
            quantity,
            price_per_item,
            discount_per_item,
            is_digital,
            products(id, title, author, cover_url, type),
            product_variants(id, variant_name, weight_kg)
          )
        `)
        .eq('id', orderId!)
        .maybeSingle();

      if (selectedCountry?.id) {
        query = query.eq('country_id', selectedCountry.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? null) as Order | null;
    },
  });
}

/* ── Update order status ── */
export interface UpdateOrderInput {
  id: string;
  status?: string;
  payment_status?: string;
  tracking_number?: string;
  shipping_company_id?: string | null;
  notes?: string;
}

export function useUpdateOrder() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateOrderInput) => {
      const { id, ...patch } = input;

      // Read the current status before writing, so a status email only fires
      // on an actual change (not e.g. re-saving tracking_number with the same
      // status, or the admin hitting save without changing anything).
      const previousStatus = patch.status !== undefined ? await getCurrentOrderStatus(id) : null;

      const { error } = await supabase
        .from('orders')
        .update(patch)
        .eq('id', id);

      if (error) throw error;

      if (patch.status !== undefined && patch.status !== previousStatus) {
        void notifyOrderStatusChange(id, patch.status);
      }
    },
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order-detail', input.id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      toast.success('تم تحديث الطلب بنجاح');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ── Shipping companies dropdown (country-aware with fallback) ── */
export function useShippingCompanies() {
  const { selectedCountry } = useCountry();

  return useQuery({
    queryKey: ['shipping-companies-list', selectedCountry?.id ?? 'all'],
    queryFn: async () => {
      if (selectedCountry?.id) {
        const withCountry = await supabase
          .from('shipping_companies')
          .select('id, company_name, logo_url')
          .eq('is_active', true)
          .eq('country_id', selectedCountry.id)
          .order('company_name');

        if (!withCountry.error) {
          return (withCountry.data ?? []) as {
            id: string;
            company_name: string;
            logo_url?: string | null;
          }[];
        }
      }

      const fallback = await supabase
        .from('shipping_companies')
        .select('id, company_name, logo_url')
        .eq('is_active', true)
        .order('company_name');

      if (fallback.error) throw fallback.error;

      return (fallback.data ?? []) as {
        id: string;
        company_name: string;
        logo_url?: string | null;
      }[];
    },
  });
}

/* ── Export orders CSV ── */
export function exportOrdersCsv(orders: Order[]) {
  const headers = [
    'رقم الطلب',
    'الدولة',
    'العميل',
    'الهاتف',
    'المحافظة',
    'المدينة',
    'الإجمالي',
    'العملة',
    'الشحن',
    'الخصم',
    'الدفع',
    'حالة الدفع',
    'الحالة',
    'شركة الشحن',
    'رقم التتبع',
    'التاريخ',
  ];

  const rows = orders.map((o) => [
    o.id,
    o.countries?.name ?? '',
    o.profiles?.full_name ?? 'زائر',
    o.shipping_address?.phone ?? o.profiles?.phone ?? '',
    o.shipping_address?.governorate ?? '',
    o.shipping_address?.city ?? '',
    o.total_price,
    o.countries?.currency_symbol ?? '',
    o.shipping_cost,
    o.discount_amount,
    o.payment_methods?.method_name ?? '',
    o.payment_status,
    o.status,
    o.shipping_companies?.company_name ?? '',
    o.tracking_number ?? '',
    new Date(o.created_at).toLocaleDateString('ar-EG'),
  ]);

  const bom = '\uFEFF';
  const csv =
    bom +
    [headers, ...rows]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
