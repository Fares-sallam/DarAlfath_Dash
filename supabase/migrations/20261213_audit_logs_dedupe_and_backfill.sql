-- «سجل النشاط»: fix the history to match the new triggers (20261212). One transaction:
--   0) a full copy of the table is kept in backups.audit_logs_20261125 (RLS on, no policies: not readable through the API; drop it when
--      the fix has been checked)
--   1) duplicates are removed: the same event written twice by the two old trigger functions
--   2) the INSERT rows of orders, order items and profiles that were written with no actor are given the customer they belong to
--
-- 1) only on the tables that had both functions (or had them until recently), and only when the whole row is the same: table, action,
--    record, time, actor, old data and new data. A group is a double when it has as many rows without an email as with one (the
--    trigger with the email is kept), or, with no email at all, an even number of rows (the first half is kept).
-- 2) only INSERT rows with no actor; UPDATE and DELETE rows by the server stay «النظام»: they really are the system's (a payment
--    webhook, a clean-up).

CREATE SCHEMA IF NOT EXISTS backups;
CREATE TABLE IF NOT EXISTS backups.audit_logs_20261125 AS TABLE public.audit_logs;
ALTER TABLE backups.audit_logs_20261125 ENABLE ROW LEVEL SECURITY;

-- 1) duplicates
WITH g AS (
  SELECT
    id, user_email,
    count(*)          OVER w AS n,
    count(user_email) OVER w AS e,
    row_number()      OVER (w_order) AS rn
  FROM public.audit_logs
  WHERE table_name IN ('coupons', 'orders', 'payment_methods', 'product_inventory', 'products', 'profiles', 'shipping_companies', 'book_series', 'categories')
  WINDOW
    w AS (PARTITION BY table_name, action, record_id, created_at, user_id, old_data, new_data),
    w_order AS (PARTITION BY table_name, action, record_id, created_at, user_id, old_data, new_data ORDER BY id)
), doomed AS (
  SELECT id FROM g
  WHERE (e = 0 AND n % 2 = 0 AND rn > n / 2)
     OR (e > 0 AND n - e = e AND user_email IS NULL)
)
DELETE FROM public.audit_logs a USING doomed d WHERE a.id = d.id;

-- 2) the customer behind each order item's order (the order itself, or the audit row of its INSERT when the order is gone)
CREATE TEMP TABLE _order_owner ON COMMIT DROP AS
SELECT DISTINCT ON (order_id) order_id, cust_id, addr
FROM (
  SELECT o.id::text AS order_id, o.user_id AS cust_id, o.shipping_address AS addr, 1 AS pri FROM public.orders o
  UNION ALL
  SELECT a.record_id, nullif(a.new_data->>'user_id', '')::uuid, a.new_data->'shipping_address', 2
  FROM public.audit_logs a WHERE a.table_name = 'orders' AND a.action = 'INSERT' AND a.new_data IS NOT NULL
) s
ORDER BY order_id, pri;

CREATE TEMP TABLE _fix ON COMMIT DROP AS
SELECT
  a.id,
  a.table_name,
  CASE a.table_name
    WHEN 'profiles' THEN nullif(a.new_data->>'id', '')::uuid
    WHEN 'orders'   THEN nullif(a.new_data->>'user_id', '')::uuid
    ELSE oo.cust_id
  END AS cust_id,
  CASE a.table_name WHEN 'orders' THEN a.new_data->'shipping_address' ELSE oo.addr END AS addr,
  a.new_data
FROM public.audit_logs a
LEFT JOIN _order_owner oo ON a.table_name = 'order_items' AND oo.order_id = a.new_data->>'order_id'
WHERE a.user_id IS NULL AND a.action = 'INSERT' AND a.table_name IN ('profiles', 'orders', 'order_items') AND a.new_data IS NOT NULL;

UPDATE public.audit_logs a
SET
  user_id    = CASE WHEN f.cust_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = f.cust_id) THEN f.cust_id END,
  user_email = coalesce(
                 a.user_email,
                 CASE WHEN f.table_name = 'profiles' THEN nullif(btrim(f.new_data->>'email'), '')
                      WHEN f.cust_id IS NOT NULL THEN (SELECT u.email FROM auth.users u WHERE u.id = f.cust_id)
                      ELSE nullif(btrim(f.addr->>'email'), '') END),
  actor_name = CASE
                 WHEN f.table_name = 'profiles' THEN nullif(btrim(f.new_data->>'full_name'), '')
                 WHEN f.cust_id IS NULL THEN coalesce(nullif(btrim(coalesce(f.addr->>'name', f.addr->>'full_name')), '') || ' (ضيف)', 'ضيف')
                 ELSE nullif(btrim(coalesce(f.addr->>'name', f.addr->>'full_name')), '')
               END
FROM _fix f
WHERE a.id = f.id;
