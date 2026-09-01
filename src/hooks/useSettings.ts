import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useCountry } from '@/contexts/CountryContext';
import { useAuth } from '@/contexts/AuthContext';

/* ═══════════════════════════════════════════════
   Countries
═══════════════════════════════════════════════ */
export interface Country {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  currency: string;
  currency_symbol: string;
  created_at: string;
}

export function useCountries() {
  return useQuery({
    queryKey: ['settings-countries'],
    queryFn: async (): Promise<Country[]> => {
      const { data, error } = await supabase
        .from('countries')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data ?? []) as Country[];
    },
  });
}

export function useCreateCountry() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: Omit<Country, 'id' | 'created_at'>) => {
      const { error } = await supabase.from('countries').insert(input);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-countries'] });
      toast.success('تمت إضافة الدولة');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateCountry() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Country> & { id: string }) => {
      const { error } = await supabase.from('countries').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-countries'] });
      qc.invalidateQueries({ queryKey: ['country'] });
      qc.invalidateQueries({ queryKey: ['settings-payment-methods'] });
      toast.success('تم تحديث الدولة');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteCountry() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!user?.isSystemOwner) {
        throw new Error('فقط مالك النظام يمكنه حذف الدول');
      }

      const checks = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('country_id', id),
        supabase.from('product_inventory').select('id', { count: 'exact', head: true }).eq('country_id', id),
        supabase.from('coupons').select('id', { count: 'exact', head: true }).eq('country_id', id),
        supabase.from('payment_methods').select('id', { count: 'exact', head: true }).eq('country_id', id),
        supabase.from('shipping_companies').select('id', { count: 'exact', head: true }).eq('country_id', id),
        supabase.from('admin_country_access').select('id', { count: 'exact', head: true }).eq('country_id', id),
      ]);

      const counts = checks.map((r) => r.count ?? 0);
      const totalRefs = counts.reduce((a, b) => a + b, 0);

      if (totalRefs > 0) {
        throw new Error('لا يمكن حذف الدولة لأنها مرتبطة ببيانات حالية. عطّلها أولًا أو احذف الارتباطات التابعة لها.');
      }

      const { error } = await supabase.from('countries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-countries'] });
      toast.success('تم حذف الدولة');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ═══════════════════════════════════════════════
   Payment Methods
═══════════════════════════════════════════════ */
export interface PaymentMethod {
  id: string;
  method_name: string;
  provider?: string | null;
  country_id?: string | null;
  is_active: boolean;
  config?: Record<string, unknown>;
  created_at: string;
  countries?: { id?: string; name: string } | null;
}

export function usePaymentMethods() {
  const { selectedCountry } = useCountry();

  return useQuery({
    queryKey: ['settings-payment-methods', selectedCountry?.id ?? 'all'],
    queryFn: async (): Promise<PaymentMethod[]> => {
      let query = supabase
        .from('payment_methods')
        .select('*, countries(id, name)')
        .order('method_name');

      // A method with no country_id is global (e.g. apple_iap/google_iap —
      // in-app-purchase methods aren't tied to a shipping country at all),
      // so it belongs in every country's list, not just when "كل الدول" is
      // selected. Plain `.eq('country_id', ...)` would silently hide it
      // the moment any specific country is picked — this was exactly why
      // App Store/Google Play never showed up here to be managed.
      if (selectedCountry?.id) {
        query = query.or(`country_id.eq.${selectedCountry.id},country_id.is.null`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as PaymentMethod[];
    },
  });
}

export function useCreatePaymentMethod() {
  const qc = useQueryClient();
  const { selectedCountry } = useCountry();

  return useMutation({
    mutationFn: async (input: { method_name: string; provider?: string; country_id?: string | null; is_active: boolean; config?: Record<string, unknown> }) => {
      const payload = {
        method_name: input.method_name,
        provider: input.provider || null,
        country_id: input.country_id || selectedCountry?.id || null,
        is_active: input.is_active,
        ...(input.config !== undefined ? { config: input.config } : {}),
      };
      const { error } = await supabase.from('payment_methods').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-payment-methods'] });
      qc.invalidateQueries({ queryKey: ['payment-methods-shipping-page'] });
      toast.success('تمت إضافة طريقة الدفع');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdatePaymentMethod() {
  const qc = useQueryClient();
  const { selectedCountry } = useCountry();

  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; method_name?: string; provider?: string | null; country_id?: string | null; is_active?: boolean; config?: Record<string, unknown> }) => {
      const payload = {
        ...patch,
        country_id: patch.country_id ?? selectedCountry?.id ?? null,
      };
      const { error } = await supabase.from('payment_methods').update(payload).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-payment-methods'] });
      qc.invalidateQueries({ queryKey: ['payment-methods-shipping-page'] });
      toast.success('تم تحديث طريقة الدفع');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeletePaymentMethod() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('payment_methods').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-payment-methods'] });
      qc.invalidateQueries({ queryKey: ['payment-methods-shipping-page'] });
      toast.success('تم حذف طريقة الدفع');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ═══════════════════════════════════════════════
   Categories
═══════════════════════════════════════════════ */
export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  created_at: string;
}

export function useCategories() {
  return useQuery({
    queryKey: ['settings-categories'],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; slug: string; description?: string }) => {
      const { error } = await supabase.from('categories').insert(input);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings-categories'] }); toast.success('تمت إضافة التصنيف'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; slug?: string; description?: string | null }) => {
      const { error } = await supabase.from('categories').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings-categories'] }); toast.success('تم تحديث التصنيف'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings-categories'] }); toast.success('تم حذف التصنيف'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ═══════════════════════════════════════════════
   Global Store Settings (singleton row)
═══════════════════════════════════════════════ */

export interface StoreSettingsInput {
  store_name?: string;
  store_description?: string;
  store_email?: string;
  store_phone?: string;
  store_address?: string;
  /** Shown as icon links in the storefront footer — an entry only
   *  renders there when it's actually set, so an empty value just
   *  hides that icon rather than showing a dead link. */
  facebook_url?: string;
  instagram_url?: string;
  whatsapp_url?: string;
  youtube_url?: string;
  website_url?: string;
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string;
  default_shipping_cost?: number;
  free_shipping_threshold?: number;
  /** Which shipping company's shipping_rates rows drive the automatic
   *  weight+governorate checkout-time calculation (falls back to
   *  default_shipping_cost above when unset or no rate matches). */
  default_shipping_company_id?: string | null;
  notifications?: {
    emailNewOrder?: boolean;
    smsNewOrder?: boolean;
    emailLowStock?: boolean;
    pushNewOrder?: boolean;
    emailReturn?: boolean;
    smsShipping?: boolean;
  };
}

export interface StoreSettings extends StoreSettingsInput {
  id?: string;
  updated_at?: string;
}

const DEFAULT_STORE_SETTINGS: StoreSettings = {
  store_name: 'دار الفتح للنشر والتوزيع',
  store_description: 'دار الفتح — متجر متخصص في بيع الكتب الورقية والرقمية بجودة عالية وتوصيل سريع',
  store_email: 'info@daralfath.com',
  store_phone: '',
  store_address: '',
  facebook_url: '',
  instagram_url: '',
  whatsapp_url: '',
  youtube_url: '',
  website_url: '',
  seo_title: 'دار الفتح — أفضل الكتب الورقية والرقمية',
  seo_description: 'اكتشف مجموعة واسعة من الكتب الورقية والرقمية بأفضل الأسعار مع توصيل سريع.',
  seo_keywords: 'كتب، مكتبة، روايات، تنمية بشرية، كتب رقمية، دار الفتح',
  default_shipping_cost: 45,
  free_shipping_threshold: 499,
  notifications: {
    emailNewOrder: true,
    smsNewOrder: true,
    emailLowStock: true,
    pushNewOrder: false,
    emailReturn: true,
    smsShipping: false,
  },
};

export function useStoreSettings() {
  return useQuery({
    queryKey: ['store-settings'],
    queryFn: async (): Promise<StoreSettings> => {
      const { data, error } = await supabase
        .from('store_settings')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!data) return DEFAULT_STORE_SETTINGS;
      return {
        ...DEFAULT_STORE_SETTINGS,
        ...(data as StoreSettings),
        notifications: {
          ...DEFAULT_STORE_SETTINGS.notifications,
          ...((data as StoreSettings).notifications ?? {}),
        },
      };
    },
  });
}

export function useUpsertStoreSettings() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (patch: StoreSettingsInput) => {
      const { data: existing, error: existingErr } = await supabase
        .from('store_settings')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingErr) throw existingErr;

      const merged = {
        ...DEFAULT_STORE_SETTINGS,
        ...(existing ?? {}),
        ...patch,
        notifications: {
          ...DEFAULT_STORE_SETTINGS.notifications,
          ...((existing as StoreSettings | null)?.notifications ?? {}),
          ...(patch.notifications ?? {}),
        },
        updated_at: new Date().toISOString(),
      };

      if (existing?.id) {
        const { error } = await supabase
          .from('store_settings')
          .update(merged)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('store_settings')
          .insert(merged);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-settings'] });
      toast.success('تم حفظ إعدادات المتجر بنجاح');
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });
}
