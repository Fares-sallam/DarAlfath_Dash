-- ══════════════════════════════════════════════════════════════════════════
-- فصل صلاحية إدارة المشرفين عن إدارة العملاء
--
-- قبل: can_manage_users كانت تتحكم في صفحة العملاء *و* صفحة إعدادات المشرفين
--      معًا، فمن يملكها كان يقدر يفتح إعدادات المشرفين ويغيّر صلاحياته (تصعيد).
-- بعد:
--   • can_manage_users  = إدارة العملاء فقط.
--   • can_manage_admins = إدارة حسابات المشرفين وصلاحياتهم (الصفحة الجديدة).
-- ══════════════════════════════════════════════════════════════════════════

-- 1) عمود الصلاحية الجديد
ALTER TABLE public.admin_settings
  ADD COLUMN IF NOT EXISTS can_manage_admins boolean NOT NULL DEFAULT false;

-- 2) ترحيل آمن: من كان يدير المشرفين فعليًا (عبر الخلط القديم) يحتفظ بالصلاحية
UPDATE public.admin_settings
  SET can_manage_admins = true
  WHERE can_manage_users = true;

-- 3) تحويل بوابة إدارة المشرفين للعمود الجديد بدل can_manage_users
--    (تستخدمها سياسات الكتابة على admin_settings و trigger حماية الأدوار)
CREATE OR REPLACE FUNCTION public.can_manage_admins()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_system_owner()
    OR EXISTS (
      SELECT 1 FROM public.admin_settings
      WHERE user_id = auth.uid() AND can_manage_admins = true
    );
$$;
