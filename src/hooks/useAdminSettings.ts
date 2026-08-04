import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { FunctionsHttpError } from '@supabase/supabase-js';

/* ── System owner email ── */
export const SYSTEM_OWNER_EMAIL = 'faresalsaid780@gmail.com';

export function isSystemOwner(email?: string | null): boolean {
  return (email ?? '').trim().toLowerCase() === SYSTEM_OWNER_EMAIL.toLowerCase();
}

/* ── Types ── */
export interface AdminPermissions {
  can_manage_products: boolean;
  can_manage_orders: boolean;
  can_manage_users: boolean;
  can_manage_admins: boolean;
  can_manage_inventory: boolean;
  can_manage_coupons: boolean;
  can_manage_shipping: boolean;
  can_view_analytics: boolean;
  can_export: boolean;
  can_view_activity_log: boolean;
  can_manage_settings: boolean;
}

export interface CountryAccessItem {
  id?: string;
  country_id: string;
  is_primary: boolean;
  countries?: {
    id?: string;
    name: string;
    code?: string;
    currency?: string;
    currency_symbol?: string;
  } | null;
}

export interface AdminSetting extends AdminPermissions {
  id: string;
  user_id: string;
  country_id?: string | null;
  created_at: string;
  profiles: {
    id: string;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    role: string;
    avatar_url?: string | null;
    is_active: boolean;
    created_at: string;
  } | null;
  countries?: {
    id?: string;
    name: string;
    code?: string;
    currency?: string;
    currency_symbol?: string;
  } | null;
  accessible_countries: CountryAccessItem[];
  primary_country_id: string | null;
}

export interface CountryOption {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  currency: string;
  currency_symbol: string;
  created_at: string;
}

/* ── Shared helpers ── */
async function syncAdminCountryAccess(
  userId: string,
  countryIds: string[],
  primaryCountryId: string | null
) {
  const uniqueIds = Array.from(new Set(countryIds.filter(Boolean)));

  const { error: deleteError } = await supabase
    .from('admin_country_access')
    .delete()
    .eq('user_id', userId);

  if (deleteError) throw deleteError;

  if (uniqueIds.length === 0) {
    return;
  }

  const rows = uniqueIds.map((countryId) => ({
    user_id: userId,
    country_id: countryId,
    is_primary: primaryCountryId ? primaryCountryId === countryId : false,
  }));

  const { error: insertError } = await supabase
    .from('admin_country_access')
    .insert(rows);

  if (insertError) throw insertError;
}

/* ── Fetch active countries for admin UI ── */
export function useAdminCountries() {
  return useQuery({
    queryKey: ['admin-countries'],
    queryFn: async (): Promise<CountryOption[]> => {
      const { data, error } = await supabase
        .from('countries')
        .select('id, name, code, is_active, currency, currency_symbol, created_at')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return (data ?? []) as CountryOption[];
    },
  });
}

/* ── Fetch all admins with settings + multi-country access ── */
export function useAdminSettings() {
  return useQuery({
    queryKey: ['admin-settings'],
    queryFn: async (): Promise<AdminSetting[]> => {
      const [
        { data: settingsData, error: settingsError },
        { data: countryAccessData, error: countryAccessError },
      ] = await Promise.all([
        supabase
          .from('admin_settings')
          .select(`
            id,
            user_id,
            country_id,
            created_at,
            can_manage_products,
            can_manage_orders,
            can_manage_users,
            can_manage_admins,
            can_manage_inventory,
            can_manage_coupons,
            can_manage_shipping,
            can_view_analytics,
            can_export,
            can_view_activity_log,
            can_manage_settings,
            profiles(id, full_name, email, phone, role, avatar_url, is_active, created_at),
            countries(id, name, code, currency, currency_symbol)
          `)
          .order('created_at', { ascending: true }),

        supabase
          .from('admin_country_access')
          .select(`
            id,
            user_id,
            country_id,
            is_primary,
            countries(id, name, code, currency, currency_symbol)
          `),
      ]);

      if (settingsError) throw settingsError;
      if (countryAccessError) throw countryAccessError;

      const accessByUser: Record<string, CountryAccessItem[]> = {};

      for (const row of (countryAccessData ?? []) as (CountryAccessItem & { user_id: string })[]) {
        if (!accessByUser[row.user_id]) accessByUser[row.user_id] = [];
        accessByUser[row.user_id].push({
          id: row.id,
          country_id: row.country_id,
          is_primary: row.is_primary,
          countries: row.countries ?? null,
        });
      }

      return ((settingsData ?? []) as AdminSetting[]).map((row) => {
        const accessible = accessByUser[row.user_id] ?? [];
        const primaryAccess =
          accessible.find((c) => c.is_primary) ??
          accessible.find((c) => c.country_id === row.country_id) ??
          null;

        return {
          ...row,
          can_view_activity_log: row.can_view_activity_log ?? false,
          accessible_countries: accessible,
          primary_country_id: primaryAccess?.country_id ?? row.country_id ?? null,
        };
      });
    },
  });
}

/* ── Fetch all profiles with admin-capable roles ── */
export function useAdminProfiles() {
  return useQuery({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, role, avatar_url, is_active')
        .in('role', ['super_admin', 'admin', 'manager', 'sales', 'support', 'warehouse'])
        .order('full_name');

      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ── Update admin permissions + country access ── */
export function useUpdateAdminPermissions() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      settingId,
      userId,
      permissions,
      countryIds,
      primaryCountryId,
    }: {
      settingId: string;
      userId: string;
      permissions: AdminPermissions;
      countryIds: string[];
      primaryCountryId: string | null;
    }) => {
      const { error } = await supabase
        .from('admin_settings')
        .update({
          ...permissions,
          country_id: primaryCountryId,
        })
        .eq('id', settingId);

      if (error) throw error;

      await syncAdminCountryAccess(userId, countryIds, primaryCountryId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      toast.success('تم حفظ الصلاحيات والدول بنجاح');
    },
    onError: (e: Error) => toast.error('فشل حفظ الصلاحيات: ' + e.message),
  });
}

/* ── Update profile role ── */
export function useUpdateProfileRole() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      role,
      userEmail,
    }: {
      userId: string;
      role: string;
      userEmail?: string | null;
    }) => {
      if (isSystemOwner(userEmail)) {
        throw new Error('لا يمكن تغيير دور مالك النظام');
      }

      const { error } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      qc.invalidateQueries({ queryKey: ['admin-profiles'] });
      toast.success('تم تحديث الدور');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ── Toggle profile active status ── */
export function useToggleAdminStatus() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      isActive,
      userEmail,
    }: {
      userId: string;
      isActive: boolean;
      userEmail?: string | null;
    }) => {
      if (isSystemOwner(userEmail)) {
        throw new Error('لا يمكن تعطيل أو تفعيل مالك النظام من هنا');
      }

      const { error } = await supabase
        .from('profiles')
        .update({ is_active: isActive })
        .eq('id', userId);

      if (error) throw error;
    },
    onSuccess: (_, { isActive }) => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      toast.success(isActive ? 'تم تفعيل الحساب' : 'تم تعطيل الحساب');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ── Add new admin_settings entry for existing user ── */
export function useCreateAdminSetting() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      permissions,
      countryIds,
      primaryCountryId,
    }: {
      userId: string;
      permissions: AdminPermissions;
      countryIds: string[];
      primaryCountryId: string | null;
    }) => {
      const { error } = await supabase
        .from('admin_settings')
        .insert({
          user_id: userId,
          country_id: primaryCountryId,
          ...permissions,
        });

      if (error) throw error;

      await syncAdminCountryAccess(userId, countryIds, primaryCountryId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      toast.success('تمت إضافة المشرف بنجاح');
    },
    onError: (e: Error) => toast.error('فشل الإضافة: ' + e.message),
  });
}

/* ── Delete admin_settings entry (remove from admins only) ── */
export function useDeleteAdminSetting() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      settingId,
      userId,
      userEmail,
    }: {
      settingId: string;
      userId: string;
      userEmail?: string | null;
    }) => {
      if (isSystemOwner(userEmail)) {
        throw new Error('لا يمكن حذف مالك النظام مطلقًا');
      }

      const { error: accessDeleteError } = await supabase
        .from('admin_country_access')
        .delete()
        .eq('user_id', userId);

      if (accessDeleteError) throw accessDeleteError;

      const { error } = await supabase
        .from('admin_settings')
        .delete()
        .eq('id', settingId);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      toast.success('تم حذف المشرف من قائمة الصلاحيات');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ── Update admin profile info (name, phone, avatar) ── */
export function useUpdateAdminProfile() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      full_name,
      phone,
      avatar_url,
    }: {
      userId: string;
      full_name: string;
      phone?: string | null;
      avatar_url?: string | null;
    }) => {
      const updates: Record<string, unknown> = { full_name };
      if (phone !== undefined) updates.phone = phone;
      if (avatar_url !== undefined) updates.avatar_url = avatar_url;

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      qc.invalidateQueries({ queryKey: ['admin-profiles'] });
      toast.success('تم تحديث بيانات المشرف بنجاح');
    },
    onError: (e: Error) => toast.error('فشل التحديث: ' + e.message),
  });
}

/* ── Role helpers ── */
export const ROLE_OPTIONS = [
  { value: 'super_admin', label: 'مدير النظام', color: 'bg-[#0B1F4D] text-white' },
  { value: 'admin', label: 'مشرف', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'manager', label: 'مدير', color: 'bg-blue-100 text-blue-700' },
  { value: 'sales', label: 'مبيعات', color: 'bg-green-100 text-green-700' },
  { value: 'support', label: 'دعم', color: 'bg-amber-100 text-amber-700' },
  { value: 'warehouse', label: 'مستودع', color: 'bg-orange-100 text-orange-700' },
];

export function getRoleLabel(role: string) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
}

export function getRoleColor(role: string) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.color ?? 'bg-gray-100 text-gray-600';
}

export const PERMISSION_FIELDS: {
  key: keyof AdminPermissions;
  label: string;
  section: string;
  icon: string;
}[] = [
  { key: 'can_manage_products', label: 'إدارة الكتب والمنتجات', section: 'المحتوى', icon: '📚' },
  { key: 'can_manage_orders', label: 'إدارة الطلبات', section: 'المبيعات', icon: '📦' },
  { key: 'can_manage_users', label: 'إدارة العملاء', section: 'العملاء والمشرفون', icon: '👥' },
  { key: 'can_manage_admins', label: 'إعدادات المشرفين', section: 'العملاء والمشرفون', icon: '🛡️' },
  { key: 'can_manage_inventory', label: 'إدارة المخزون', section: 'المستودع', icon: '🏪' },
  { key: 'can_manage_coupons', label: 'إدارة الكوبونات', section: 'المبيعات', icon: '🏷️' },
  { key: 'can_manage_shipping', label: 'إدارة الشحن', section: 'العمليات', icon: '🚚' },
  { key: 'can_view_analytics', label: 'عرض التحليلات والتقارير', section: 'التقارير', icon: '📊' },
  { key: 'can_export', label: 'تصدير البيانات', section: 'التقارير', icon: '📤' },
  { key: 'can_view_activity_log', label: 'عرض سجل النشاط', section: 'التقارير', icon: '📝' },
  { key: 'can_manage_settings', label: 'إعدادات المتجر', section: 'الإعدادات', icon: '⚙️' },
];

export const PERMISSION_SECTIONS_GROUPED = (() => {
  const sections: Record<string, typeof PERMISSION_FIELDS> = {};
  PERMISSION_FIELDS.forEach((f) => {
    if (!sections[f.section]) sections[f.section] = [];
    sections[f.section].push(f);
  });
  return Object.entries(sections);
})();

export const DEFAULT_PERMISSIONS: AdminPermissions = {
  can_manage_products: false,
  can_manage_orders: false,
  can_manage_users: false,
  can_manage_admins: false,
  can_manage_inventory: false,
  can_manage_coupons: false,
  can_manage_shipping: false,
  can_view_analytics: false,
  can_export: false,
  can_view_activity_log: false,
  can_manage_settings: false,
};

export function countActivePerms(perms: AdminPermissions): number {
  return Object.values(perms).filter(Boolean).length;
}

/* ── Create brand-new admin user (owner only, calls Edge Function) ── */
export interface NewAdminPayload {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  role: string;
  permissions: AdminPermissions;
  country_ids: string[];
  primary_country_id: string | null;
}

export function useCreateNewAdminUser() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: NewAdminPayload) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) throw new Error('يجب تسجيل الدخول أولاً');

      const { data, error } = await supabase.functions.invoke('create-admin-user', {
        body: payload,
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) {
        if (error instanceof FunctionsHttpError) {
          const response = error.context;
          let body: any = null;

          try {
            body = await response.json();
          } catch {
            body = null;
          }

          throw new Error(
            body?.error ||
              body?.message ||
              `فشل إنشاء المشرف [${response.status}]`
          );
        }

        throw error;
      }

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      qc.invalidateQueries({ queryKey: ['admin-profiles'] });
      toast.success('تم إنشاء حساب المشرف بنجاح');
    },
    onError: (e: Error) => toast.error('فشل إنشاء المشرف: ' + e.message),
  });
}