import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useCountry } from '@/contexts/CountryContext';
import type { Order, ShippingAddress } from '@/hooks/useOrders';
import { notifyOrderStatusChange, getCurrentOrderStatus } from '@/lib/orderStatusEmail';

/* ────────────────────────────────────────────── */
/* Types */
/* ────────────────────────────────────────────── */

export type ShipmentStatus =
  | 'جديد'
  | 'قيد المراجعة'
  | 'تم التأكيد'
  | 'جاري الشحن'
  | 'تم الشحن'
  | 'تم التوصيل'
  | 'ملغي'
  | 'مرتجع';

export interface ShippingCompany {
  id: string;
  company_name: string;
  logo_url?: string | null;
  country_id?: string | null;
  is_active?: boolean;
}

export interface PaymentMethod {
  id: string;
  method_name: string;
  provider?: string | null;
  country_id?: string | null;
  is_active?: boolean;
}

export interface ShipmentOrder extends Order {
  customer: string;
  customerAvatar?: string | null;
  customerPhone?: string | null;
  city: string;
  governorate: string;
  countryName: string;
  shippingCompany: string;
  paymentMethod: string;
  total: number;
  itemsCount: number;
  currencySymbol: string;
}

export interface ShippingFilters {
  status?: string;
  companyId?: string;
  search?: string;
}

export interface CreateShipmentInput {
  orderId: string;
  shipping_company_id: string;
  tracking_number: string;
  shipping_cost?: number;
  notes?: string;
  status?: ShipmentStatus;
}

export interface UpdateShipmentInput {
  orderId: string;
  status?: ShipmentStatus;
  shipping_company_id?: string | null;
  tracking_number?: string | null;
  shipping_cost?: number;
  notes?: string;
}

export interface ShippingStats {
  pending: number;
  inTransit: number;
  delivered: number;
  returned: number;
}

/* ────────────────────────────────────────────── */
/* Helpers */
/* ────────────────────────────────────────────── */

function normalizeText(value?: string | null) {
  return (value ?? '').trim().toLowerCase();
}

function mapOrderToShipment(order: Order, fallbackCurrency = 'ج.م'): ShipmentOrder {
  const addr = (order.shipping_address ?? {}) as ShippingAddress;

  return {
    ...order,
    customer: order.profiles?.full_name ?? addr.name ?? 'زائر',
    customerAvatar: order.profiles?.avatar_url ?? null,
    customerPhone: addr.phone ?? order.profiles?.phone ?? null,
    city: addr.city ?? '',
    governorate: addr.governorate ?? '',
    countryName: order.countries?.name ?? addr.country ?? '',
    shippingCompany: order.shipping_companies?.company_name ?? 'لم يُحدد',
    paymentMethod: order.payment_methods?.method_name ?? '—',
    total: order.total_price,
    itemsCount: order.order_items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
    currencySymbol: order.countries?.currency_symbol ?? fallbackCurrency,
  };
}

/* ────────────────────────────────────────────── */
/* Orders / Shipments */
/* ────────────────────────────────────────────── */

export function useShippingOrders(filters: ShippingFilters = {}) {
  const { selectedCountry, currencySymbol } = useCountry();

  return useQuery({
    queryKey: ['shipping-orders', selectedCountry?.id ?? 'all', filters],
    queryFn: async (): Promise<ShipmentOrder[]> => {
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
          order_items(id, quantity)
        `)
        .order('created_at', { ascending: false });

      if (selectedCountry?.id) {
        query = query.eq('country_id', selectedCountry.id);
      }

      if (filters.status && filters.status !== 'الكل') {
        query = query.eq('status', filters.status);
      }

      if (filters.companyId && filters.companyId !== 'الكل') {
        query = query.eq('shipping_company_id', filters.companyId);
      }

      const { data, error } = await query;
      if (error) throw error;

      let rows = ((data ?? []) as Order[]).map((order) =>
        mapOrderToShipment(order, currencySymbol)
      );

      if (filters.search?.trim()) {
        const q = normalizeText(filters.search);

        rows = rows.filter((order) => {
          return (
            normalizeText(order.id).includes(q) ||
            normalizeText(order.customer).includes(q) ||
            normalizeText(order.city).includes(q) ||
            normalizeText(order.governorate).includes(q) ||
            normalizeText(order.customerPhone).includes(q) ||
            normalizeText(order.tracking_number).includes(q)
          );
        });
      }

      return rows;
    },
  });
}

export function useShippingStats(filters: ShippingFilters = {}) {
  const ordersQuery = useShippingOrders(filters);

  const stats = useMemo<ShippingStats>(() => {
    const orders = ordersQuery.data ?? [];

    return {
      pending: orders.filter((o) => o.status === 'تم التأكيد').length,
      inTransit: orders.filter((o) => o.status === 'جاري الشحن' || o.status === 'تم الشحن').length,
      delivered: orders.filter((o) => o.status === 'تم التوصيل').length,
      returned: orders.filter((o) => o.status === 'مرتجع').length,
    };
  }, [ordersQuery.data]);

  return {
    ...ordersQuery,
    stats,
  };
}

/* ────────────────────────────────────────────── */
/* Shipping companies */
/* ────────────────────────────────────────────── */

export function useShippingCompaniesForShipping() {
  const { selectedCountry } = useCountry();

  return useQuery({
    queryKey: ['shipping-companies-shipping-page', selectedCountry?.id ?? 'all'],
    queryFn: async (): Promise<ShippingCompany[]> => {
      let query = supabase
        .from('shipping_companies')
        .select('id, company_name, logo_url, country_id, is_active')
        .eq('is_active', true)
        .order('company_name');

      if (selectedCountry?.id) {
        query = query.eq('country_id', selectedCountry.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []) as ShippingCompany[];
    },
  });
}

/* ────────────────────────────────────────────── */
/* Payment methods */
/* ────────────────────────────────────────────── */

export function usePaymentMethodsForShipping() {
  const { selectedCountry } = useCountry();

  return useQuery({
    queryKey: ['payment-methods-shipping-page', selectedCountry?.id ?? 'all'],
    queryFn: async (): Promise<PaymentMethod[]> => {
      let query = supabase
        .from('payment_methods')
        .select('id, method_name, provider, country_id, is_active')
        .eq('is_active', true)
        .order('method_name');

      if (selectedCountry?.id) {
        query = query.eq('country_id', selectedCountry.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []) as PaymentMethod[];
    },
  });
}

/* ────────────────────────────────────────────── */
/* Single shipment detail */
/* ────────────────────────────────────────────── */

export function useShipmentDetail(orderId: string | null) {
  const { selectedCountry, currencySymbol } = useCountry();

  return useQuery({
    queryKey: ['shipment-detail', orderId, selectedCountry?.id ?? 'all'],
    enabled: !!orderId,
    queryFn: async (): Promise<ShipmentOrder | null> => {
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
            quantity,
            product_id,
            variant_id,
            price_per_item,
            discount_per_item,
            is_digital,
            products(id, title, author, cover_url, type),
            product_variants(id, variant_name)
          )
        `)
        .eq('id', orderId!)
        .maybeSingle();

      if (selectedCountry?.id) {
        query = query.eq('country_id', selectedCountry.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!data) return null;

      return mapOrderToShipment(data as Order, currencySymbol);
    },
  });
}

/* ────────────────────────────────────────────── */
/* Create shipment */
/* ────────────────────────────────────────────── */

export function useCreateShipment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateShipmentInput) => {
      const newStatus = input.status ?? 'جاري الشحن';
      const payload: Record<string, unknown> = {
        shipping_company_id: input.shipping_company_id,
        tracking_number: input.tracking_number,
        status: newStatus,
      };

      if (input.shipping_cost !== undefined) payload.shipping_cost = input.shipping_cost;
      if (input.notes !== undefined) payload.notes = input.notes;

      const previousStatus = await getCurrentOrderStatus(input.orderId);

      const { error } = await supabase
        .from('orders')
        .update(payload)
        .eq('id', input.orderId);

      if (error) throw error;

      if (newStatus !== previousStatus) {
        void notifyOrderStatusChange(input.orderId, newStatus);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipping-orders'] });
      qc.invalidateQueries({ queryKey: ['shipment-detail'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      toast.success('تم إنشاء الشحنة بنجاح');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ────────────────────────────────────────────── */
/* Update shipment */
/* ────────────────────────────────────────────── */

export function useUpdateShipment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateShipmentInput) => {
      const payload: Record<string, unknown> = {};

      if (input.status !== undefined) payload.status = input.status;
      if (input.shipping_company_id !== undefined) payload.shipping_company_id = input.shipping_company_id;
      if (input.tracking_number !== undefined) payload.tracking_number = input.tracking_number;
      if (input.shipping_cost !== undefined) payload.shipping_cost = input.shipping_cost;
      if (input.notes !== undefined) payload.notes = input.notes;

      const previousStatus = input.status !== undefined ? await getCurrentOrderStatus(input.orderId) : null;

      const { error } = await supabase
        .from('orders')
        .update(payload)
        .eq('id', input.orderId);

      if (error) throw error;

      if (input.status !== undefined && input.status !== previousStatus) {
        void notifyOrderStatusChange(input.orderId, input.status);
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['shipping-orders'] });
      qc.invalidateQueries({ queryKey: ['shipment-detail', vars.orderId] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      toast.success('تم تحديث بيانات الشحنة');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ────────────────────────────────────────────── */
/* CSV export */
/* ────────────────────────────────────────────── */

export function exportShippingCsv(rows: ShipmentOrder[]) {
  const headers = [
    'رقم الطلب',
    'العميل',
    'الهاتف',
    'الدولة',
    'المحافظة',
    'المدينة',
    'شركة الشحن',
    'رقم التتبع',
    'طريقة الدفع',
    'الحالة',
    'الإجمالي',
    'العملة',
    'التاريخ',
  ];

  const csvRows = rows.map((row) => [
    row.id,
    row.customer,
    row.customerPhone ?? '',
    row.countryName,
    row.governorate,
    row.city,
    row.shippingCompany,
    row.tracking_number ?? '',
    row.paymentMethod,
    row.status,
    row.total,
    row.currencySymbol,
    new Date(row.created_at).toLocaleDateString('ar-EG'),
  ]);

  const bom = '\uFEFF';
  const csv =
    bom +
    [headers, ...csvRows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shipping-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}