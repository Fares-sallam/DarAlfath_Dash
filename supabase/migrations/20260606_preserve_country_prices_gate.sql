-- ══════════════════════════════════════════════════════════════════════════
-- منع أثر جانبي: إبقاء صلاحية أسعار المنتجات حسب الدولة كما كانت بالضبط
--
-- سياسات product_country_prices و product_variant_country_prices كانت تستخدم
-- can_manage_admins() (التي كانت تعني: المالك أو can_manage_users). بعد فصل
-- صلاحية المشرفين، صارت can_manage_admins() تشير للعمود الجديد، مما يغيّر صلاحية
-- الأسعار دون قصد. لذا نعطي هذه السياسات بوابة خاصة تحفظ سلوكها الأصلي تمامًا،
-- ونفصلها عن صلاحية "إعدادات المشرفين" الجديدة.
-- (البوابة الأساسية تبقى الأدوار get_my_role؛ هذه فقط تستبدل جزء OR.)
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.can_manage_country_prices()
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
      WHERE user_id = auth.uid() AND can_manage_users = true
    );
$$;

-- ── product_country_prices (4 سياسات — نفس الأدوار الأصلية بالضبط) ──────────
DROP POLICY IF EXISTS "product_country_prices_admin_select" ON public.product_country_prices;
CREATE POLICY "product_country_prices_admin_select" ON public.product_country_prices
  FOR SELECT TO authenticated
  USING ((get_my_role() = ANY (ARRAY['super_admin','admin','manager','warehouse'])) OR public.can_manage_country_prices());

DROP POLICY IF EXISTS "product_country_prices_admin_insert" ON public.product_country_prices;
CREATE POLICY "product_country_prices_admin_insert" ON public.product_country_prices
  FOR INSERT TO authenticated
  WITH CHECK ((get_my_role() = ANY (ARRAY['super_admin','admin','manager','warehouse'])) OR public.can_manage_country_prices());

DROP POLICY IF EXISTS "product_country_prices_admin_update" ON public.product_country_prices;
CREATE POLICY "product_country_prices_admin_update" ON public.product_country_prices
  FOR UPDATE TO authenticated
  USING ((get_my_role() = ANY (ARRAY['super_admin','admin','manager','warehouse'])) OR public.can_manage_country_prices())
  WITH CHECK ((get_my_role() = ANY (ARRAY['super_admin','admin','manager','warehouse'])) OR public.can_manage_country_prices());

DROP POLICY IF EXISTS "product_country_prices_admin_delete" ON public.product_country_prices;
CREATE POLICY "product_country_prices_admin_delete" ON public.product_country_prices
  FOR DELETE TO authenticated
  USING ((get_my_role() = ANY (ARRAY['super_admin','admin','manager'])) OR public.can_manage_country_prices());

-- ── product_variant_country_prices (4 سياسات — نفس الأدوار الأصلية بالضبط) ──
DROP POLICY IF EXISTS "variant_country_prices_admin_select" ON public.product_variant_country_prices;
CREATE POLICY "variant_country_prices_admin_select" ON public.product_variant_country_prices
  FOR SELECT TO authenticated
  USING ((get_my_role() = ANY (ARRAY['super_admin','admin','manager','warehouse'])) OR public.can_manage_country_prices());

DROP POLICY IF EXISTS "variant_country_prices_admin_insert" ON public.product_variant_country_prices;
CREATE POLICY "variant_country_prices_admin_insert" ON public.product_variant_country_prices
  FOR INSERT TO authenticated
  WITH CHECK ((get_my_role() = ANY (ARRAY['super_admin','admin','manager','warehouse'])) OR public.can_manage_country_prices());

DROP POLICY IF EXISTS "variant_country_prices_admin_update" ON public.product_variant_country_prices;
CREATE POLICY "variant_country_prices_admin_update" ON public.product_variant_country_prices
  FOR UPDATE TO authenticated
  USING ((get_my_role() = ANY (ARRAY['super_admin','admin','manager','warehouse'])) OR public.can_manage_country_prices())
  WITH CHECK ((get_my_role() = ANY (ARRAY['super_admin','admin','manager','warehouse'])) OR public.can_manage_country_prices());

DROP POLICY IF EXISTS "variant_country_prices_admin_delete" ON public.product_variant_country_prices;
CREATE POLICY "variant_country_prices_admin_delete" ON public.product_variant_country_prices
  FOR DELETE TO authenticated
  USING ((get_my_role() = ANY (ARRAY['super_admin','admin','manager'])) OR public.can_manage_country_prices());
