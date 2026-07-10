import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useCountry } from '@/contexts/CountryContext';

/* ── Types ── */
export type CouponType = 'نسبة' | 'مبلغ ثابت' | 'شحن مجاني' | 'خصم منتج';

export interface Coupon {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  min_order: number;
  max_uses?: number;
  used_count: number;
  product_id?: string;
  country_id?: string;
  user_id?: string;
  valid_from: string;
  valid_to?: string;
  is_active: boolean;
  created_at: string;
  products?: { title: string } | null;
  countries?: { id?: string; name: string; currency_symbol?: string } | null;
  profiles?: { full_name: string } | null;
}

export interface UpsertCouponInput {
  id?: string;
  code: string;
  type: CouponType;
  value: number;
  min_order: number;
  max_uses?: number;
  product_id?: string;
  country_id?: string;
  valid_from: string;
  valid_to?: string;
  is_active: boolean;
}

/** Derived status computed client-side */
export function getCouponStatus(c: Coupon): 'نشط' | 'منتهي' | 'معطل' | 'لم يبدأ' {
  if (!c.is_active) return 'معطل';

  const now = new Date();
  const from = new Date(c.valid_from);

  if (now < from) return 'لم يبدأ';

  if (c.valid_to) {
    const to = new Date(c.valid_to);
    if (now > to) return 'منتهي';
  }

  if (c.max_uses !== undefined && c.max_uses !== null && c.used_count >= c.max_uses) {
    return 'منتهي';
  }

  return 'نشط';
}

/* ── Fetch coupons (country-aware) ── */
export function useCoupons() {
  const { selectedCountry } = useCountry();

  return useQuery({
    queryKey: ['coupons', selectedCountry?.id ?? 'all'],
    queryFn: async (): Promise<Coupon[]> => {
      let query = supabase
        .from('coupons')
        .select(`
          *,
          products(title),
          countries(id, name, currency_symbol),
          profiles(full_name)
        `)
        .order('created_at', { ascending: false });

      if (selectedCountry?.id) {
        // كوبونات هذه الدولة + الكوبونات العالمية (country_id فارغ تعني كل
        // الدول). .eq وحدها تستبعد الكوبونات العالمية تمامًا لأن NULL لا يساوي
        // أي قيمة، فتختفي من لوحة الأدمن كلما اختار دولة محدّدة.
        query = query.or(`country_id.eq.${selectedCountry.id},country_id.is.null`);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []) as Coupon[];
    },
  });
}

/* ── Fetch products for dropdown (country-aware) ── */
export function useCouponProducts() {
  const { selectedCountry } = useCountry();

  return useQuery({
    queryKey: ['coupon-products', selectedCountry?.id ?? 'all'],
    queryFn: async () => {
      if (selectedCountry?.id) {
        const inventoryRows = await supabase
          .from('product_inventory')
          .select('product_id')
          .eq('country_id', selectedCountry.id);

        if (!inventoryRows.error) {
          const ids = Array.from(
            new Set(
              ((inventoryRows.data ?? []) as { product_id: string }[])
                .map((r) => r.product_id)
                .filter(Boolean)
            )
          );

          if (ids.length === 0) return [];

          const { data, error } = await supabase
            .from('products')
            .select('id, title')
            .eq('is_active', true)
            .in('id', ids)
            .order('title');

          if (error) throw error;
          return (data ?? []) as { id: string; title: string }[];
        }
      }

      const { data, error } = await supabase
        .from('products')
        .select('id, title')
        .eq('is_active', true)
        .order('title');

      if (error) throw error;
      return (data ?? []) as { id: string; title: string }[];
    },
  });
}

/* ── Fetch countries for dropdown (current allowed/current page scope) ── */
export function useCouponCountries() {
  const { selectedCountry } = useCountry();

  return useQuery({
    queryKey: ['coupon-countries', selectedCountry?.id ?? 'all'],
    queryFn: async () => {
      if (selectedCountry) {
        return [
          {
            id: selectedCountry.id,
            name: selectedCountry.name,
            currency_symbol: selectedCountry.currency_symbol,
          },
        ];
      }

      const { data, error } = await supabase
        .from('countries')
        .select('id, name, currency_symbol')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return (data ?? []) as { id: string; name: string; currency_symbol?: string }[];
    },
  });
}

/* ── Upsert coupon (country-aware) ── */
export function useUpsertCoupon() {
  const qc = useQueryClient();
  const { selectedCountry } = useCountry();

  return useMutation({
    mutationFn: async (input: UpsertCouponInput) => {
      const payload = {
        id: input.id,
        code: input.code.trim().toUpperCase(),
        type: input.type,
        value: input.value,
        min_order: input.min_order,
        max_uses: input.max_uses ?? null,
        product_id: input.product_id || null,
        country_id: input.country_id || selectedCountry?.id || null,
        valid_from: input.valid_from,
        valid_to: input.valid_to || null,
        is_active: input.is_active,
      };

      const { data, error } = await supabase
        .from('coupons')
        .upsert(payload, { onConflict: 'id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: ['coupons'] });
      toast.success(input.id ? 'تم تحديث الكوبون بنجاح' : 'تم إضافة الكوبون بنجاح');
    },
    onError: (e: Error) => {
      const msg =
        e.message.includes('duplicate') || e.message.includes('unique')
          ? 'هذا الكود مستخدم بالفعل، اختر كوداً مختلفاً'
          : e.message;
      toast.error(msg);
    },
  });
}

/* ── Toggle active status ── */
export function useToggleCoupon() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('coupons')
        .update({ is_active })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coupons'] });
      toast.success('تم تحديث حالة الكوبون');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ── Delete coupon ── */
export function useDeleteCoupon() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('coupons').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coupons'] });
      toast.success('تم حذف الكوبون');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}