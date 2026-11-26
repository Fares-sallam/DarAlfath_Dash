-- adjust_stock: the one place that changes a book edition's stock from the mobile app (and from the dashboard when it chooses to).
-- It checks the permission itself (owner, or an admin with can_manage_inventory), keeps the stock a whole number that is not below zero
-- or below what is reserved for unshipped orders, refuses digital editions and bundles, and writes who did it, from where and why
-- into the activity log.
--
-- This file RECORDS what is already applied on the live project (migration «adjust_stock», 2026-11-25, written by the app's
-- inventory-screen work; the app calls it from services/inventoryService.ts). The definition below is the live one, copied as it is.
-- Running it again changes nothing.

CREATE OR REPLACE FUNCTION public.adjust_stock(p_variant_id uuid, p_country_id uuid, p_mode text, p_qty integer, p_reason text, p_min_stock integer DEFAULT NULL::integer, p_source text DEFAULT 'app'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_email     text;
  v_variant   public.product_variants%ROWTYPE;
  v_bundle    boolean;
  v_inv       public.product_inventory%ROWTYPE;
  v_old       jsonb;
  v_new_stock integer;
  v_min       integer;
  v_reason    text := left(nullif(btrim(coalesce(p_reason, '')), ''), 200);
  v_source    text := CASE WHEN p_source IN ('app', 'dashboard') THEN p_source ELSE 'app' END;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'لازم تسجّل الدخول' USING ERRCODE = '28000';
  END IF;
  IF NOT (
    public.is_system_owner()
    OR EXISTS (SELECT 1 FROM public.admin_settings WHERE user_id = v_uid AND can_manage_inventory = true)
  ) THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تعديل المخزون' USING ERRCODE = '42501';
  END IF;

  IF p_mode IS NULL OR p_mode NOT IN ('set', 'add', 'sub') THEN
    RAISE EXCEPTION 'نوع التعديل غير معروف';
  END IF;
  IF p_qty IS NULL OR p_qty < 0 OR p_qty > 10000000 THEN
    RAISE EXCEPTION 'الكمية لازم تكون عدد صحيح من 0 لـ 10,000,000';
  END IF;
  IF p_mode <> 'set' AND p_qty = 0 THEN
    RAISE EXCEPTION 'اكتب عدد أكبر من صفر';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'اكتب سبب التعديل (٣ حروف على الأقل)';
  END IF;
  IF p_min_stock IS NOT NULL AND (p_min_stock < 0 OR p_min_stock > 10000000) THEN
    RAISE EXCEPTION 'الحد الأدنى لازم يكون عدد صحيح موجب';
  END IF;

  SELECT * INTO v_variant FROM public.product_variants WHERE id = p_variant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'النسخة غير موجودة';
  END IF;
  SELECT coalesce(is_bundle, false) INTO v_bundle FROM public.products WHERE id = v_variant.product_id;
  IF v_variant.variant_type = 'رقمي' OR coalesce(v_bundle, false) THEN
    RAISE EXCEPTION 'الكتاب الرقمي والباقات ملهمش مخزون';
  END IF;

  SELECT * INTO v_inv
  FROM public.product_inventory
  WHERE product_id = v_variant.product_id AND variant_id = p_variant_id AND country_id = p_country_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.product_inventory (product_id, variant_id, country_id, stock, reserved_stock, min_stock)
    VALUES (v_variant.product_id, p_variant_id, p_country_id, 0, 0, coalesce(p_min_stock, 5))
    RETURNING * INTO v_inv;
  END IF;

  v_new_stock := CASE p_mode WHEN 'set' THEN p_qty WHEN 'add' THEN v_inv.stock + p_qty ELSE v_inv.stock - p_qty END;
  IF v_new_stock < 0 THEN
    RAISE EXCEPTION 'المخزون مينفعش يبقى أقل من صفر (الحالي %)', v_inv.stock;
  END IF;
  IF v_new_stock < v_inv.reserved_stock THEN
    RAISE EXCEPTION 'المخزون مينفعش يبقى أقل من المحجوز لطلبات لسه ماتشحنتش (%)', v_inv.reserved_stock;
  END IF;
  IF v_new_stock > 10000000 THEN
    RAISE EXCEPTION 'العدد كبير زيادة عن اللازم';
  END IF;
  v_min := coalesce(p_min_stock, v_inv.min_stock);

  v_old := to_jsonb(v_inv);
  UPDATE public.product_inventory
     SET stock = v_new_stock, min_stock = v_min
   WHERE id = v_inv.id
  RETURNING * INTO v_inv;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  INSERT INTO public.audit_logs (user_id, user_email, action, table_name, record_id, old_data, new_data)
  VALUES (
    v_uid, v_email, 'UPDATE', 'product_inventory', v_inv.id::text, v_old,
    to_jsonb(v_inv) || jsonb_build_object(
      '_source', v_source,
      '_mode',   p_mode,
      '_delta',  v_new_stock - (v_old->>'stock')::integer,
      '_reason', v_reason
    )
  );

  RETURN jsonb_build_object(
    'inventory_id',   v_inv.id,
    'stock',          v_inv.stock,
    'reserved_stock', v_inv.reserved_stock,
    'min_stock',      v_inv.min_stock
  );
END;
$function$;

-- live grants: signed-in users and the service role only (the function itself checks the permission); never anonymous
REVOKE ALL ON FUNCTION public.adjust_stock(uuid, uuid, text, integer, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, uuid, text, integer, text, integer, text) TO authenticated, service_role;
