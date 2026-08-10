import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useCountry } from '@/contexts/CountryContext';

/* ── Types ── */
export interface CustomerOrder {
  id: string;
  status: string;
  total_price: number;
  created_at: string;
  country_id?: string | null;
  shipping_address?: { city?: string; governorate?: string };
  order_items?: {
    quantity: number;
    products: { title: string } | null;
  }[];
}

export interface Customer {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  country_id: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  email?: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderAt?: string;
  lastOrderCity?: string;
  countries?: { name: string; currency_symbol: string } | null;
  /** true = اشترى بدون إنشاء حساب؛ لا يوجد صف في profiles، فلا تعديل ولا حظر. */
  isGuest?: boolean;
  /** أرقام طلبات هذا العميل — تُستخدم للبحث برقم الطلب. */
  orderIds?: string[];
}

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  country_id: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type OrderAggRow = {
  id: string;
  user_id: string | null;
  total_price: number;
  created_at: string;
  shipping_address: {
    city?: string;
    governorate?: string;
    email?: string;
    full_name?: string;
    phone?: string;
  } | null;
  country_id?: string | null;
};

type Agg = {
  count: number;
  total: number;
  lastAt: string;
  lastCity: string;
  orderIds: string[];
};

const norm = (e?: string | null) => (e ?? '').trim().toLowerCase();

const GUEST_PREFIX = 'guest:';
export const isGuestId = (id: string) => id.startsWith(GUEST_PREFIX);
export const guestEmailFromId = (id: string) => id.slice(GUEST_PREFIX.length);

/* ── Fetch customers with aggregated order data (country-aware) ── */
export function useCustomers() {
  const { selectedCountry } = useCountry();

  return useQuery({
    queryKey: ['customers', selectedCountry?.id ?? 'all'],
    queryFn: async (): Promise<Customer[]> => {

      // ── 1. كل أصحاب الحسابات ────────────────────────────────
      // بدون تصفية على role: أي شخص أنشأ حسابًا هو عميل محتمل، وقد
      // يشتري فعلاً حتى لو كان دوره manager/support/admin — تصفية
      // role كانت تُخفيه تمامًا من هذه الصفحة رغم وجود طلبات له.
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, role, country_id, avatar_url, is_active, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (pErr) throw pErr;

      // ── 2. الطلبات (بما فيها طلبات الضيوف user_id = null) ────
      let ordersQuery = supabase
        .from('orders')
        .select('id, user_id, total_price, created_at, shipping_address, country_id')
        .not('status', 'in', '("ملغي","مرتجع")');

      if (selectedCountry?.id) {
        ordersQuery = ordersQuery.eq('country_id', selectedCountry.id);
      }

      const { data: orderData, error: oErr } = await ordersQuery;
      if (oErr) throw oErr;

      // ── 3. الدول (منفصلة لتجنب فشل الـ JOIN) ─────────────────
      const { data: countriesData } = await supabase
        .from('countries')
        .select('id, name, currency_symbol');

      const countriesMap = new Map(
        (countriesData ?? []).map((c) => [c.id, { name: c.name, currency_symbol: c.currency_symbol }])
      );

      const profileRows = (profiles ?? []) as ProfileRow[];
      const orders = (orderData ?? []) as OrderAggRow[];

      // البريد → معرّف الحساب، حتى يُنسب طلب أُنشئ كضيف لصاحب الحساب
      // إن كان بنفس البريد بدل أن يظهر كعميل منفصل.
      const profileIdByEmail = new Map<string, string>();
      for (const p of profileRows) {
        const e = norm(p.email);
        if (e) profileIdByEmail.set(e, p.id);
      }

      // ── 4. تجميع الإحصاءات ───────────────────────────────────
      const aggByKey: Record<string, Agg> = {};
      // بيانات الضيوف تُشتق من آخر طلب لهم (لا يوجد لهم صف profiles)
      const guestInfo: Record<string, { email: string; name?: string; phone?: string; countryId?: string | null; firstAt: string }> = {};

      for (const o of orders) {
        const email = norm(o.shipping_address?.email);
        const key = o.user_id ?? (email ? (profileIdByEmail.get(email) ?? `${GUEST_PREFIX}${email}`) : null);
        if (!key) continue; // طلب بلا حساب وبلا بريد — لا سبيل لنسبته

        if (!aggByKey[key]) {
          aggByKey[key] = { count: 0, total: 0, lastAt: '', lastCity: '', orderIds: [] };
        }
        const a = aggByKey[key];
        a.count += 1;
        a.total += Number(o.total_price) || 0;
        a.orderIds.push(o.id);
        if (!a.lastAt || o.created_at > a.lastAt) {
          a.lastAt = o.created_at;
          a.lastCity = o.shipping_address?.city ?? o.shipping_address?.governorate ?? '';
        }

        if (key.startsWith(GUEST_PREFIX)) {
          const g = guestInfo[key];
          if (!g || o.created_at < g.firstAt) {
            guestInfo[key] = {
              email,
              name: o.shipping_address?.full_name,
              phone: o.shipping_address?.phone,
              countryId: o.country_id ?? null,
              firstAt: g && o.created_at > g.firstAt ? g.firstAt : o.created_at,
            };
          }
          // الاسم/الهاتف من أحدث طلب لو كان الأقدم بلا بيانات
          const gi = guestInfo[key];
          if (!gi.name && o.shipping_address?.full_name) gi.name = o.shipping_address.full_name;
          if (!gi.phone && o.shipping_address?.phone) gi.phone = o.shipping_address.phone;
        }
      }

      // ── 5. أصحاب الحسابات ────────────────────────────────────
      const accountCustomers: Customer[] = profileRows.map((p) => {
        const a = aggByKey[p.id];
        return {
          ...p,
          email: p.email ?? undefined,
          countries: p.country_id ? (countriesMap.get(p.country_id) ?? null) : null,
          totalOrders: a?.count ?? 0,
          totalSpent: a?.total ?? 0,
          lastOrderAt: a?.lastAt || undefined,
          lastOrderCity: a?.lastCity || undefined,
          orderIds: a?.orderIds ?? [],
          isGuest: false,
        };
      });

      // ── 6. المشترون بدون حساب ────────────────────────────────
      // طُلب صراحةً: أي شخص يشتري (أونلاين أو كاش) يظهر هنا ويُحتسب،
      // حتى لو لم ينشئ حسابًا.
      const guestCustomers: Customer[] = Object.entries(guestInfo).map(([key, g]) => {
        const a = aggByKey[key];
        return {
          id: key,
          full_name: g.name ?? g.email,
          email: g.email,
          phone: g.phone ?? null,
          role: 'guest',
          country_id: g.countryId ?? null,
          avatar_url: null,
          is_active: true,
          created_at: g.firstAt,
          updated_at: a?.lastAt ?? g.firstAt,
          countries: g.countryId ? (countriesMap.get(g.countryId) ?? null) : null,
          totalOrders: a?.count ?? 0,
          totalSpent: a?.total ?? 0,
          lastOrderAt: a?.lastAt || undefined,
          lastOrderCity: a?.lastCity || undefined,
          orderIds: a?.orderIds ?? [],
          isGuest: true,
        };
      });

      return [...accountCustomers, ...guestCustomers];
    },
  });
}

/* ── Fetch a single customer's orders (country-aware) ──
   يقبل العميل كاملاً لأن الضيف لا يملك user_id — يُبحث له بالبريد. */
export function useCustomerOrders(
  customer: { id: string; email?: string; isGuest?: boolean } | null
) {
  const { selectedCountry } = useCountry();

  return useQuery({
    queryKey: ['customer-orders', customer?.id, customer?.email, selectedCountry?.id ?? 'all'],
    enabled: !!customer,
    queryFn: async (): Promise<CustomerOrder[]> => {
      if (!customer) return [];

      const select = `
        id,
        status,
        total_price,
        created_at,
        country_id,
        shipping_address,
        order_items(quantity, products(title))
      `;

      const applyCountry = <T extends { eq: (c: string, v: string) => T }>(q: T) =>
        selectedCountry?.id ? q.eq('country_id', selectedCountry.id) : q;

      // استعلامان منفصلان بدل .or() — البريد يدخل في نص الفلتر وقد يحتوي
      // محارف تكسر صياغة PostgREST؛ الدمج هنا أأمن وأوضح.
      const results: CustomerOrder[] = [];

      if (!customer.isGuest) {
        const { data, error } = await applyCountry(
          supabase.from('orders').select(select).eq('user_id', customer.id) as never
        );
        if (error) throw error;
        results.push(...((data ?? []) as CustomerOrder[]));
      }

      const email = (customer.email ?? '').trim();
      if (email) {
        const { data, error } = await applyCountry(
          supabase.from('orders').select(select).eq('shipping_address->>email', email) as never
        );
        if (error) throw error;
        results.push(...((data ?? []) as CustomerOrder[]));
      }

      // نفس الطلب قد يأتي من الاستعلامين (حساب + بريد مطابق)
      const unique = new Map(results.map((o) => [o.id, o]));
      return [...unique.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
  });
}

/* ── Toggle customer active status ── */
export function useToggleCustomerStatus() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      if (isGuestId(id)) throw new Error('هذا مشترٍ بدون حساب — لا يمكن حظره.');
      const { error } = await supabase
        .from('profiles')
        .update({ is_active })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success(vars.is_active ? 'تم تفعيل العميل' : 'تم حظر العميل');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ── Update customer profile ── */
export interface UpdateCustomerInput {
  id: string;
  full_name?: string;
  phone?: string;
}

export function useUpdateCustomer() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateCustomerInput) => {
      if (isGuestId(input.id)) throw new Error('هذا مشترٍ بدون حساب — لا توجد بيانات قابلة للتعديل.');
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: input.full_name, phone: input.phone })
        .eq('id', input.id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success('تم تحديث بيانات العميل');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
