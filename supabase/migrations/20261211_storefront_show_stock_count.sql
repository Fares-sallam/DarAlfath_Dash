-- «إظهار عدد النسخ للعملاء»: one switch for the website and one for the app, set in «إدارة المخزون». With a switch off, customers see
-- «متوفر» / «نافد» / «آخر النسخ» instead of the number. Stored as {"web": bool, "app": bool}; only an explicit false hides the count.
--
-- This column was added to the live database on 2026-11-25 (as migration «show_stock_count», from the app's side, tried first in a
-- transaction that was rolled back). This copy keeps the dashboard's migration history complete; it is idempotent.
-- Additive: nothing that exists is changed; the default is «shown» in both places, exactly as things were.

ALTER TABLE public.storefront_appearance
  ADD COLUMN IF NOT EXISTS show_stock_count jsonb NOT NULL DEFAULT '{"web": true, "app": true}'::jsonb;

ALTER TABLE public.storefront_appearance
  DROP CONSTRAINT IF EXISTS storefront_appearance_show_stock_count_shape;
ALTER TABLE public.storefront_appearance
  ADD CONSTRAINT storefront_appearance_show_stock_count_shape
  CHECK (jsonb_typeof(show_stock_count) = 'object' AND octet_length(show_stock_count::text) <= 200);

COMMENT ON COLUMN public.storefront_appearance.show_stock_count IS
  'Whether customers see the number of copies available: {"web": bool, "app": bool}. Only an explicit false hides it. Set from «إدارة المخزون» (dashboard) and the app''s inventory screen.';
