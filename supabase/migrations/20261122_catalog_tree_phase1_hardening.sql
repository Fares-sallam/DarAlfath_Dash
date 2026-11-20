-- المرحلة 1 (تشديد): دوال المزامنة ومسجّل الأخطاء داخلية، لا تُستدعى من الـAPI.
-- (الـtriggers لا تحتاج EXECUTE وقت التشغيل، وتم اختبار إن الكتابة من المالك لسه تتزامن.)
REVOKE EXECUTE ON FUNCTION public.catalog_log_sync_error(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.catalog_sync_series() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.catalog_sync_category() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.catalog_sync_bar() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.catalog_sync_product_series() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.catalog_sync_product_categories() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.catalog_sync_product_primary() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.catalog_slugify(text) SET search_path TO 'public';
