-- «سجل النشاط»: who did it, one row per event, and a monthly clean-up.
--
-- 1) A customer's own action no longer shows as «النظام». The server (edge function, auth signup trigger) writes the order, its items and
--    the profile of a customer with no signed-in database user (auth.uid() is NULL), so the log had no actor. Now, for the INSERT of an
--    order, an order item or a profile written that way, the log names the customer: their account when they have one; for a guest order
--    the name and email of the order's shipping address, with «(ضيف)» after the name. Everything else with no signed-in user (webhooks,
--    cron, stock effects) stays «النظام». New column audit_logs.actor_name carries a name that has no account behind it.
-- 2) Every event was logged twice: seven tables had both audit_trigger_fn (no email) and fn_audit_log_trigger (with email). The older
--    audit_trigger_fn triggers are dropped; every one of those tables keeps its trg_audit_* trigger, so nothing stops being logged.
-- 3) audit_logs_cleanup(p_keep_days) deletes rows older than that many days; pg_cron runs it on the 1st of every month at 03:00 UTC.
--
-- Additive for the schema (a nullable column, a replaced function and view); the history is fixed by 20261213. Both files were applied live
-- on 2026-11-25 as ONE atomic block (a single DO statement with the same statements), after the backup copy of audit_logs was made.

ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_name text;

CREATE OR REPLACE FUNCTION public.fn_audit_log_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $f$
DECLARE
  v_user_id    uuid;
  v_user_email text;
  v_actor_name text;
  v_record_id  text;
  v_old_data   jsonb;
  v_new_data   jsonb;
  v_cust_id    uuid;
  v_addr       jsonb;
  v_guest      text;
BEGIN
  BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NOT NULL THEN
      SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id LIMIT 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL; v_user_email := NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    v_record_id := (row_to_json(OLD)->>'id');
    v_old_data  := row_to_json(OLD)::JSONB;
    v_new_data  := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_record_id := (row_to_json(NEW)->>'id');
    v_old_data  := NULL;
    v_new_data  := row_to_json(NEW)::JSONB;
  ELSE
    v_record_id := (row_to_json(NEW)->>'id');
    v_old_data  := row_to_json(OLD)::JSONB;
    v_new_data  := row_to_json(NEW)::JSONB;
  END IF;

  -- nobody is signed in and a customer's own record is being created: say whose
  IF v_user_id IS NULL AND TG_OP = 'INSERT' AND TG_TABLE_NAME IN ('profiles', 'orders', 'order_items') THEN
    BEGIN
      IF TG_TABLE_NAME = 'profiles' THEN
        v_cust_id    := nullif(v_new_data->>'id', '')::uuid;
        v_user_email := nullif(btrim(v_new_data->>'email'), '');
        v_actor_name := nullif(btrim(v_new_data->>'full_name'), '');
      ELSE
        IF TG_TABLE_NAME = 'orders' THEN
          v_cust_id := nullif(v_new_data->>'user_id', '')::uuid;
          v_addr    := v_new_data->'shipping_address';
        ELSE
          SELECT o.user_id, to_jsonb(o.shipping_address) INTO v_cust_id, v_addr
          FROM public.orders o WHERE o.id::text = v_new_data->>'order_id';
        END IF;
        IF v_cust_id IS NOT NULL THEN
          SELECT email INTO v_user_email FROM auth.users WHERE id = v_cust_id;
        ELSE
          v_user_email := nullif(btrim(v_addr->>'email'), '');
          v_guest      := nullif(btrim(coalesce(v_addr->>'name', v_addr->>'full_name')), '');
          v_actor_name := coalesce(v_guest || ' (ضيف)', 'ضيف');
        END IF;
      END IF;
      -- the log row points at the customer's account only when there is one
      IF v_cust_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_cust_id) THEN
        v_user_id := v_cust_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_user_id := NULL; v_user_email := NULL; v_actor_name := NULL;
    END;
  END IF;

  -- the log never blocks the write it records
  BEGIN
    INSERT INTO audit_logs (user_id, user_email, actor_name, action, table_name, record_id, old_data, new_data)
    VALUES (v_user_id, v_user_email, v_actor_name, TG_OP, TG_TABLE_NAME, v_record_id, v_old_data, v_new_data);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'audit log skipped for %.%: %', TG_TABLE_SCHEMA, TG_TABLE_NAME, SQLERRM;
  END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$f$;

-- the seven tables that had both functions keep fn_audit_log_trigger (trg_audit_*) only
DROP TRIGGER IF EXISTS audit_coupons             ON public.coupons;
DROP TRIGGER IF EXISTS audit_orders              ON public.orders;
DROP TRIGGER IF EXISTS audit_payment_methods     ON public.payment_methods;
DROP TRIGGER IF EXISTS audit_product_inventory   ON public.product_inventory;
DROP TRIGGER IF EXISTS audit_products            ON public.products;
DROP TRIGGER IF EXISTS audit_profiles            ON public.profiles;
DROP TRIGGER IF EXISTS audit_shipping_companies  ON public.shipping_companies;

-- the dashboard's two logs: a row with no account behind it (a guest order) shows the name the trigger saved
CREATE OR REPLACE VIEW public.audit_logs_by_kind
WITH (security_invoker = true) AS
SELECT
  a.id,
  a.user_id,
  a.user_email,
  a.action,
  a.table_name,
  a.record_id,
  a.old_data,
  a.new_data,
  a.ip_address,
  a.created_at,
  coalesce(p.full_name, a.actor_name) AS actor_name,
  p.avatar_url AS actor_avatar,
  p.role       AS actor_role,
  CASE
    WHEN a.user_id IS NOT NULL THEN
      CASE
        WHEN a.user_id = '1c0bb756-b100-42c7-9861-ea90894cf5c4'::uuid
          OR coalesce(p.role, 'user') IN ('admin', 'super_admin', 'manager', 'support')
          OR EXISTS (SELECT 1 FROM public.admin_settings s WHERE s.user_id = a.user_id)
        THEN 'staff'
        ELSE 'customer'
      END
    WHEN a.table_name IN ('orders', 'order_items', 'ebook_purchases') THEN 'customer'
    WHEN a.table_name = 'profiles'
      AND coalesce(a.new_data ->> 'role', a.old_data ->> 'role', 'user') NOT IN ('admin', 'super_admin', 'manager', 'support')
    THEN 'customer'
    ELSE 'staff'
  END AS actor_kind
FROM public.audit_logs a
LEFT JOIN public.profiles p ON p.id = a.user_id;

REVOKE ALL ON public.audit_logs_by_kind FROM PUBLIC, anon;
GRANT SELECT ON public.audit_logs_by_kind TO authenticated;

-- monthly clean-up: rows older than p_keep_days are deleted (never fewer than 30 days are kept)
CREATE OR REPLACE FUNCTION public.audit_logs_cleanup(p_keep_days integer DEFAULT 365)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
DECLARE
  v_deleted integer;
BEGIN
  IF p_keep_days IS NULL OR p_keep_days < 30 THEN
    RAISE EXCEPTION 'audit_logs_cleanup: keep at least 30 days (got %)', p_keep_days;
  END IF;
  DELETE FROM public.audit_logs WHERE created_at < now() - make_interval(days => p_keep_days);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$f$;

REVOKE ALL ON FUNCTION public.audit_logs_cleanup(integer) FROM PUBLIC, anon, authenticated;

-- the 1st of every month, 03:00 UTC, keeping a year. To change the retention:
--   select cron.alter_job((select jobid from cron.job where jobname = 'audit-logs-monthly-cleanup'), command := 'select public.audit_logs_cleanup(180)');
SELECT cron.schedule('audit-logs-monthly-cleanup', '0 3 1 * *', $cron$select public.audit_logs_cleanup(365)$cron$);
