-- «سجل النشاط» split in two: the staff's log (admins, support, the owner, and whatever the system does by itself) and the customers' log.
-- A read-only view over audit_logs: nothing is stored or changed, the table and its policies stay as they are. The view runs with the
-- caller's rights (security_invoker), so only whoever can already read audit_logs (is_admin()) sees any row through it.
--
-- actor_kind:
--   a row with an actor (user_id): 'staff' when the actor is the owner (his own profile role is 'user', so he is matched by his profile
--     id), has an admin/super_admin/manager/support role, or has an admin_settings row; otherwise 'customer'
--   a row with no actor (service role, triggers, edge functions): 'customer' when it is about a customer's own records (orders, order
--     items, ebook purchases, and profiles other than staff profiles: a signup, a profile edit), otherwise 'staff' (shown as «النظام»)

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
  p.full_name  AS actor_name,
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
